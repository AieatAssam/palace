import { describe, expect, it } from 'vitest';
import { step } from './neckStep';
import type { Position } from '../game/notes';

type Proj = { x: number; y: number } | null;

// Arrow vectors use page pixels, y down.
const LEFT = { dx: -1, dy: 0 };
const RIGHT = { dx: 1, dy: 0 };
const UP = { dx: 0, dy: -1 };
const DOWN = { dx: 0, dy: 1 };

// Fake projections for the four neck orientations.
const landscape = (p: Position): Proj => ({ x: 50 * p.fret, y: 300 - 40 * p.string });
const leftHanded = (p: Position): Proj => ({ x: -50 * p.fret, y: 300 - 40 * p.string });
const portrait = (p: Position): Proj => ({ x: 40 * p.string, y: 60 * p.fret });
const slanted = (p: Position): Proj => ({
  x: 50 * p.fret + 10 * p.string,
  y: 300 - 40 * p.string + 8 * p.fret,
});

const anywhere = () => true;
// Six strings (0 to 5) and frets 0 to 12, for the edge tests.
const onNeck = (p: Position) => p.string >= 0 && p.string <= 5 && p.fret >= 0 && p.fret <= 12;
// A restricted region: strings 0 and 1, frets 0 to 5.
const region = (p: Position) => p.string >= 0 && p.string <= 1 && p.fret >= 0 && p.fret <= 5;

describe('step on a landscape neck', () => {
  it('moves up the frets on ArrowRight', () => {
    expect(step({ string: 2, fret: 3 }, RIGHT.dx, RIGHT.dy, anywhere, landscape)).toEqual({ string: 2, fret: 4 });
  });

  it('moves down the frets on ArrowLeft', () => {
    expect(step({ string: 2, fret: 3 }, LEFT.dx, LEFT.dy, anywhere, landscape)).toEqual({ string: 2, fret: 2 });
  });

  it('moves to a higher string on ArrowUp', () => {
    expect(step({ string: 2, fret: 3 }, UP.dx, UP.dy, anywhere, landscape)).toEqual({ string: 3, fret: 3 });
  });

  it('moves to a lower string on ArrowDown', () => {
    expect(step({ string: 2, fret: 3 }, DOWN.dx, DOWN.dy, anywhere, landscape)).toEqual({ string: 1, fret: 3 });
  });
});

describe('step on a left-handed neck', () => {
  it('moves to a lower fret on ArrowRight because the neck is mirrored', () => {
    expect(step({ string: 2, fret: 3 }, RIGHT.dx, RIGHT.dy, anywhere, leftHanded)).toEqual({ string: 2, fret: 2 });
  });

  it('moves to a higher fret on ArrowLeft', () => {
    expect(step({ string: 2, fret: 3 }, LEFT.dx, LEFT.dy, anywhere, leftHanded)).toEqual({ string: 2, fret: 4 });
  });

  it('still moves to a higher string on ArrowUp', () => {
    expect(step({ string: 2, fret: 3 }, UP.dx, UP.dy, anywhere, leftHanded)).toEqual({ string: 3, fret: 3 });
  });
});

describe('step on a portrait phone neck', () => {
  it('moves to a higher fret on ArrowDown because frets run down the screen', () => {
    expect(step({ string: 2, fret: 3 }, DOWN.dx, DOWN.dy, anywhere, portrait)).toEqual({ string: 2, fret: 4 });
  });

  it('moves to a higher string on ArrowRight because strings run across the screen', () => {
    expect(step({ string: 2, fret: 3 }, RIGHT.dx, RIGHT.dy, anywhere, portrait)).toEqual({ string: 3, fret: 3 });
  });

  it('moves to a lower fret on ArrowUp', () => {
    expect(step({ string: 2, fret: 3 }, UP.dx, UP.dy, anywhere, portrait)).toEqual({ string: 2, fret: 2 });
  });
});

describe('step on a slanted neck', () => {
  it('picks the fret neighbour on ArrowRight', () => {
    expect(step({ string: 2, fret: 3 }, RIGHT.dx, RIGHT.dy, anywhere, slanted)).toEqual({ string: 2, fret: 4 });
  });

  it('picks the fret neighbour on ArrowLeft', () => {
    expect(step({ string: 2, fret: 3 }, LEFT.dx, LEFT.dy, anywhere, slanted)).toEqual({ string: 2, fret: 2 });
  });

  it('picks the higher string on ArrowUp', () => {
    expect(step({ string: 2, fret: 3 }, UP.dx, UP.dy, anywhere, slanted)).toEqual({ string: 3, fret: 3 });
  });

  it('picks the lower string on ArrowDown', () => {
    expect(step({ string: 2, fret: 3 }, DOWN.dx, DOWN.dy, anywhere, slanted)).toEqual({ string: 1, fret: 3 });
  });
});

describe('step at the edges of the neck', () => {
  it('returns null on ArrowLeft at fret 0 when fret -1 is not ok', () => {
    const ok = (p: Position) => p.fret >= 0;
    expect(step({ string: 2, fret: 0 }, LEFT.dx, LEFT.dy, ok, landscape)).toBeNull();
  });

  it('returns null on ArrowUp from the top string', () => {
    expect(step({ string: 5, fret: 3 }, UP.dx, UP.dy, onNeck, landscape)).toBeNull();
  });

  it('returns null on ArrowDown from the bottom string', () => {
    expect(step({ string: 0, fret: 3 }, DOWN.dx, DOWN.dy, onNeck, landscape)).toBeNull();
  });

  it('never leaves the region on ArrowRight at its last fret', () => {
    expect(step({ string: 1, fret: 5 }, RIGHT.dx, RIGHT.dy, region, landscape)).toBeNull();
  });

  it('never leaves the region on ArrowUp when the string above is outside it', () => {
    expect(step({ string: 1, fret: 3 }, UP.dx, UP.dy, region, landscape)).toBeNull();
  });

  it('moves within the region when the neighbour is ok', () => {
    expect(step({ string: 0, fret: 3 }, UP.dx, UP.dy, region, landscape)).toEqual({ string: 1, fret: 3 });
    expect(step({ string: 1, fret: 5 }, DOWN.dx, DOWN.dy, region, landscape)).toEqual({ string: 0, fret: 5 });
    expect(step({ string: 0, fret: 2 }, RIGHT.dx, RIGHT.dy, region, landscape)).toEqual({ string: 0, fret: 3 });
  });
});

describe('step with neighbours that cannot be projected', () => {
  it('skips a neighbour whose projection is null and takes the next best', () => {
    // A diagonal arrow ties string+1 and fret+1; with string+1 unprojectable, fret+1 wins.
    const project = (p: Position): Proj =>
      p.string === 3 && p.fret === 3 ? null : landscape(p);
    expect(step({ string: 2, fret: 3 }, 1, -1, anywhere, project)).toEqual({ string: 2, fret: 4 });
  });

  it('skips a neighbour that projects to the same pixel as the origin', () => {
    // String 3 is drawn on top of string 2, so ArrowUp has no visible direction to follow.
    const collapsed = (p: Position): Proj => landscape({ string: Math.min(p.string, 2), fret: p.fret });
    expect(step({ string: 2, fret: 3 }, UP.dx, UP.dy, anywhere, collapsed)).toBeNull();
    expect(step({ string: 2, fret: 3 }, DOWN.dx, DOWN.dy, anywhere, collapsed)).toEqual({ string: 1, fret: 3 });
  });
});

describe('step when the origin cannot be projected', () => {
  const noProjection = (): Proj => null;

  it('moves the fret by dx on ArrowRight and ArrowLeft', () => {
    expect(step({ string: 2, fret: 3 }, RIGHT.dx, RIGHT.dy, anywhere, noProjection)).toEqual({ string: 2, fret: 4 });
    expect(step({ string: 2, fret: 3 }, LEFT.dx, LEFT.dy, anywhere, noProjection)).toEqual({ string: 2, fret: 2 });
  });

  it('moves the string by -dy on ArrowUp and ArrowDown', () => {
    expect(step({ string: 2, fret: 3 }, UP.dx, UP.dy, anywhere, noProjection)).toEqual({ string: 3, fret: 3 });
    expect(step({ string: 2, fret: 3 }, DOWN.dx, DOWN.dy, anywhere, noProjection)).toEqual({ string: 1, fret: 3 });
  });

  it('returns null when the fallback place is not ok', () => {
    expect(step({ string: 1, fret: 5 }, RIGHT.dx, RIGHT.dy, region, noProjection)).toBeNull();
    expect(step({ string: 1, fret: 3 }, UP.dx, UP.dy, region, noProjection)).toBeNull();
    expect(step({ string: 0, fret: 0 }, LEFT.dx, LEFT.dy, region, noProjection)).toBeNull();
  });
});
