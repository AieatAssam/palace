/**
 * Faces, the sitters: who is in each portrait. A sitter is plain data drawn from a seed: a
 * name, a trade, and the look the painter works from (head shape, skin, hair, eyes, dress,
 * the ground behind). The same seed always gives the same sitter, so a stage's cast is the
 * same every visit. No real people and no images: `paint.ts` paints each from these numbers.
 */
import { seedOf, seeded } from '../blocks/layout';

export type Rng = () => number;

export type Presenting = 'f' | 'm';
export type HairStyle = 'crop' | 'parted' | 'swept' | 'curls' | 'bun' | 'long' | 'bob' | 'receding';
export type Beard = 'none' | 'moustache' | 'full' | 'whiskers';
export type Attire = 'frock' | 'gown' | 'tweed' | 'uniform' | 'shawl' | 'smock';

export interface Look {
  presenting: Presenting;
  /** Head: width over height (0.70–0.86), jaw width (0.55–0.9 of the head), chin length (0–1). */
  headW: number;
  jaw: number;
  chin: number;
  /** Skin, hair, eyes, lips: CSS colours. */
  skin: string;
  hair: string;
  /** Grey through the hair, 0–1. */
  grey: number;
  eyes: string;
  lips: string;
  hairStyle: HairStyle;
  beard: Beard;
  /** Eyes apart (0–1), nose length (0–1), mouth width (0–1), brow weight (0–1). */
  eyeSet: number;
  nose: number;
  mouth: number;
  brow: number;
  attire: Attire;
  /** The coat or gown, and its trim (collar, cravat, lace). */
  coat: string;
  trim: string;
  /** The ground behind the sitter, and the side the light falls from (-1 left, 1 right). */
  ground: string;
  light: -1 | 1;
  /** Head turned a little to one side (-1–1). */
  turn: number;
  spectacles: boolean;
  pearls: boolean;
  /** The seed for the painter's brushwork. */
  brush: number;
}

export interface Sitter {
  /** Stable id: the seed, in base 36. */
  id: string;
  given: string;
  family: string;
  name: string;
  trade: string;
  look: Look;
}

const GIVEN_F = [
  'Agatha', 'Beatrix', 'Clementine', 'Dorothea', 'Eleanor', 'Florence', 'Georgiana', 'Harriet', 'Imogen', 'Josephine',
  'Lavinia', 'Margaret', 'Ottoline', 'Philippa', 'Rosalind', 'Sybil', 'Theodora', 'Ursula', 'Violet', 'Winifred',
] as const;
const GIVEN_M = [
  'Ambrose', 'Bartholomew', 'Cecil', 'Desmond', 'Edmund', 'Felix', 'Gideon', 'Horace', 'Ignatius', 'Jasper',
  'Leopold', 'Montague', 'Nathaniel', 'Octavius', 'Percival', 'Rupert', 'Sebastian', 'Tobias', 'Valentine', 'Wilfred',
] as const;
const FAMILY = [
  'Ashdown', 'Blackwood', 'Carrington', 'Davenport', 'Elsworth', 'Fairfax', 'Greaves', 'Hawthorne', 'Ingram', 'Kingsley',
  'Lockhart', 'Marlowe', 'Northcote', 'Pemberton', 'Quarrie', 'Radcliffe', 'Stanhope', 'Thorne', 'Vane', 'Whitlock',
  'Aldridge', 'Brampton', 'Courtenay', 'Dunmore', 'Everard', 'Fenwick', 'Galloway', 'Hollis', 'Ravenhill', 'Sinclair',
] as const;
export const TRADES = [
  'Bookbinder', 'Clockmaker', 'Cartographer', 'Botanist', 'Organ builder', 'Astronomer', 'Vintner', 'Harbour pilot',
  'Glassblower', 'Archivist', 'Falconer', 'Engraver', 'Perfumer', 'Beekeeper', 'Stonemason', 'Tea merchant',
  'Milliner', 'Surgeon', 'Barrister', 'Luthier',
] as const;

/** Painted skin: from pale through olive and bronze to deep umber. */
const SKIN = ['#f0d2bc', '#e8c0a0', '#dcae8a', '#c99470', '#b07a56', '#8e5c3e', '#6e4430', '#523224'] as const;
const HAIR = ['#1c1512', '#2e2018', '#4a3020', '#6b4428', '#8a5a30', '#a8743c', '#c9a46a', '#7a2e1a', '#5a2416'] as const;
const EYES = ['#3b2a1e', '#5a3d24', '#4f5a3a', '#3e5466', '#6a7a86', '#2c2420'] as const;
const LIPS = ['#b0645a', '#9a5048', '#a85a52', '#8a4a40', '#c07468'] as const;
/** Coats and gowns: claret, bottle green, ink blue, black, plum, ochre, slate, oxblood. */
const COAT = ['#5a1a1e', '#1f3a2c', '#1c2840', '#151214', '#3e2238', '#7a5a22', '#3a4048', '#4a1612'] as const;
const TRIM = ['#efe6d4', '#e4d7bc', '#c9a35e', '#2a2222', '#b8a48a'] as const;
/** Grounds: the old masters' backdrops, umber, olive, teal, oxblood, slate, sienna, deep green, dusk blue. */
const GROUND = ['#3a2a1c', '#4a4a2a', '#24403e', '#4a1e1a', '#3a3e44', '#6a3e22', '#1e3224', '#22304a'] as const;

const ATTIRE_F: readonly Attire[] = ['gown', 'shawl', 'frock', 'smock'];
const ATTIRE_M: readonly Attire[] = ['frock', 'tweed', 'uniform', 'smock'];
const HAIR_F: readonly HairStyle[] = ['bun', 'long', 'bob', 'curls', 'swept'];
const HAIR_M: readonly HairStyle[] = ['crop', 'parted', 'swept', 'curls', 'receding'];
const BEARDS: readonly Beard[] = ['none', 'none', 'moustache', 'full', 'whiskers'];

const pick = <T>(list: readonly T[], rng: Rng): T => list[Math.floor(rng() * list.length) % list.length]!;
const range = (lo: number, hi: number, rng: Rng) => Math.round((lo + (hi - lo) * rng()) * 1000) / 1000;

/** The sitter painted from `seed`: the same seed, the same person. */
export function makeSitter(seed: number): Sitter {
  const s = seed >>> 0;
  const rng = seeded(s ^ 0x5eed);
  const presenting: Presenting = rng() < 0.5 ? 'f' : 'm';
  const f = presenting === 'f';
  const given = pick(f ? GIVEN_F : GIVEN_M, rng);
  const family = pick(FAMILY, rng);
  const trade = pick(TRADES, rng);
  const older = rng();
  const look: Look = {
    presenting,
    headW: range(f ? 0.7 : 0.74, f ? 0.8 : 0.86, rng),
    jaw: range(f ? 0.55 : 0.66, f ? 0.74 : 0.9, rng),
    chin: range(0, 1, rng),
    skin: pick(SKIN, rng),
    hair: pick(HAIR, rng),
    grey: older > 0.72 ? range(0.35, 0.85, rng) : 0,
    eyes: pick(EYES, rng),
    lips: pick(LIPS, rng),
    hairStyle: pick(f ? HAIR_F : HAIR_M, rng),
    beard: f ? 'none' : pick(BEARDS, rng),
    eyeSet: range(0, 1, rng),
    nose: range(0, 1, rng),
    mouth: range(0, 1, rng),
    brow: range(0, 1, rng),
    attire: pick(f ? ATTIRE_F : ATTIRE_M, rng),
    coat: pick(COAT, rng),
    trim: pick(TRIM, rng),
    ground: pick(GROUND, rng),
    light: rng() < 0.5 ? -1 : 1,
    turn: range(-0.6, 0.6, rng),
    spectacles: rng() < 0.22,
    pearls: f && rng() < 0.45,
    brush: Math.floor(rng() * 0xffffffff),
  };
  return { id: s.toString(36), given, family, name: `${given} ${family}`, trade, look };
}

/** How alike two sitters look at a glance: shared hair, ground, coat, attire and dress. 0 is nothing shared. */
export function likeness(a: Look, b: Look): number {
  let n = 0;
  if (a.presenting === b.presenting) n++;
  if (a.hairStyle === b.hairStyle) n += 2;
  if (a.hair === b.hair) n++;
  if (a.ground === b.ground) n += 2;
  if (a.coat === b.coat) n++;
  if (a.attire === b.attire) n++;
  if (a.beard === b.beard && a.beard !== 'none') n++;
  return n;
}

/**
 * A cast of `n` sitters from a seed: the same seed, the same cast, in the same order. No
 * two share a given name, a family name or a trade, and none looks too much like another
 * (each newcomer is the least like those already chosen, of a few drawn). Women and men
 * come in near-equal numbers.
 */
export function makeCast(seed: number, n: number): Sitter[] {
  const rng = seeded(seed ^ 0xca57);
  const cast: Sitter[] = [];
  const used = { given: new Set<string>(), family: new Set<string>(), trade: new Set<string>() };
  let guard = 0;
  while (cast.length < n && guard++ < 4000) {
    const want: Presenting = cast.length % 2 === 0 ? (seed & 1 ? 'f' : 'm') : seed & 1 ? 'm' : 'f';
    let best: Sitter | null = null;
    let bestScore = Infinity;
    for (let tries = 0; tries < 24 && (best === null || tries < 6); tries++) {
      const s = makeSitter(Math.floor(rng() * 0xffffffff));
      if (s.look.presenting !== want) continue;
      if (used.given.has(s.given) || used.family.has(s.family) || used.trade.has(s.trade)) continue;
      const score = cast.reduce((m, c) => Math.max(m, likeness(c.look, s.look)), 0);
      if (score < bestScore) {
        best = s;
        bestScore = score;
      }
    }
    if (!best) continue;
    cast.push(best);
    used.given.add(best.given);
    used.family.add(best.family);
    used.trade.add(best.trade);
  }
  return cast;
}

/** A stage's cast seed, from a word: the cast for "four" is the same on every visit and every device. */
export const castSeed = (key: string) => seedOf(`faces:${key}`);

const SKIN_WORDS = ['fair', 'fair', 'light', 'olive', 'tan', 'brown', 'brown', 'dark brown'] as const;
const HAIR_WORDS: Record<string, string> = {
  '#1c1512': 'black', '#2e2018': 'dark brown', '#4a3020': 'brown', '#6b4428': 'chestnut', '#8a5a30': 'light brown',
  '#a8743c': 'tawny', '#c9a46a': 'fair', '#7a2e1a': 'auburn', '#5a2416': 'deep red',
};
const COAT_WORDS: Record<string, string> = {
  '#5a1a1e': 'claret', '#1f3a2c': 'bottle green', '#1c2840': 'ink blue', '#151214': 'black', '#3e2238': 'plum',
  '#7a5a22': 'ochre', '#3a4048': 'slate', '#4a1612': 'oxblood',
};
const GROUND_WORDS: Record<string, string> = {
  '#3a2a1c': 'umber', '#4a4a2a': 'olive', '#24403e': 'teal', '#4a1e1a': 'oxblood', '#3a3e44': 'slate grey',
  '#6a3e22': 'sienna', '#1e3224': 'deep green', '#22304a': 'dusk blue',
};
const STYLE_WORDS: Record<HairStyle, string> = {
  crop: 'cropped', parted: 'parted', swept: 'swept-back', curls: 'curly', bun: 'pinned-up', long: 'long', bob: 'bobbed', receding: 'thinning',
};
const ATTIRE_WORDS: Record<Attire, string> = {
  frock: 'frock coat', gown: 'gown', tweed: 'tweed jacket', uniform: 'braided tunic', shawl: 'shawl', smock: 'smock',
};
const BEARD_WORDS: Record<Beard, string> = { none: '', moustache: 'a moustache', full: 'a full beard', whiskers: 'side whiskers' };

/**
 * The portrait in words, for a screen reader: "A woman with pinned-up auburn hair, fair
 * skin, in a plum gown with pearls, on an umber ground." No name: naming is the test.
 */
export function describe(look: Look): string {
  const who = look.presenting === 'f' ? 'A woman' : 'A man';
  const hairColour = look.grey > 0.6 ? 'grey' : look.grey > 0 ? `greying ${HAIR_WORDS[look.hair] ?? 'brown'}` : (HAIR_WORDS[look.hair] ?? 'brown');
  const skin = SKIN_WORDS[Math.max(0, (SKIN as readonly string[]).indexOf(look.skin))] ?? 'fair';
  const extras = [BEARD_WORDS[look.beard], look.spectacles ? 'spectacles' : ''].filter(Boolean);
  const wearing = `in a ${COAT_WORDS[look.coat] ?? 'dark'} ${ATTIRE_WORDS[look.attire]}${look.pearls ? ' with pearls' : ''}`;
  const face = extras.length ? `, ${extras.join(' and ')}` : '';
  return `${who} with ${STYLE_WORDS[look.hairStyle]} ${hairColour} hair, ${skin} skin${face}, ${wearing}, on ${/^[aeiou]/.test(GROUND_WORDS[look.ground] ?? '') ? 'an' : 'a'} ${GROUND_WORDS[look.ground] ?? 'dark'} ground.`;
}
