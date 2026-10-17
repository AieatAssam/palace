/**
 * The painter: a sitter's portrait in oils, on a 2D canvas, from the numbers in `Look`. It
 * lays a ground, blocks in dress, neck and head, draws the features, then works over the
 * whole in short brushstrokes picked from the paint beneath, and finishes with a warm
 * varnish, a little craquelure and the weave of the canvas. Every stroke comes from the
 * sitter's own seed: the same sitter, the same painting, stroke for stroke.
 */
import { seeded } from '../blocks/layout';
import type { Look, Rng } from './sitters';

type RGB = [number, number, number];

function rgb(hex: string): RGB {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function mix(a: string | RGB, b: string | RGB, t: number): RGB {
  const x = typeof a === 'string' ? rgb(a) : a;
  const y = typeof b === 'string' ? rgb(b) : b;
  return [x[0] + (y[0] - x[0]) * t, x[1] + (y[1] - x[1]) * t, x[2] + (y[2] - x[2]) * t];
}
function css(c: RGB, a = 1): string {
  return `rgba(${Math.round(c[0])},${Math.round(c[1])},${Math.round(c[2])},${a})`;
}
const dark = (c: string | RGB, t: number) => mix(c, [12, 8, 6], t);
const light = (c: string | RGB, t: number) => mix(c, [250, 236, 206], t);

/** The canvas the portrait is painted on: 4 wide by 5 high. */
export const PORTRAIT_ASPECT = 4 / 5;

export function paintPortrait(canvas: HTMLCanvasElement, look: Look, lite = false): void {
  const W = canvas.width;
  const H = canvas.height;
  const g = canvas.getContext('2d');
  if (!g) return;
  const rng = seeded(look.brush);
  const jit = (s: number) => (rng() - 0.5) * 2 * s;
  const L = look.light;
  const hair = mix(look.hair, '#bdb6aa', look.grey);
  const f = look.presenting === 'f';

  // Proportions.
  const cx = W / 2 + look.turn * W * 0.025;
  const hh = H * 0.4;
  const hw = hh * look.headW;
  const cy = H * 0.41;
  const top = cy - hh * 0.52;
  const chinY = cy + hh * (0.46 + look.chin * 0.06);
  const jawY = cy + hh * 0.3;
  const jawW = (hw / 2) * look.jaw;
  const neckW = hw * (f ? 0.24 : 0.3);
  const shoulderY = Math.min(H * 0.86, chinY + hh * 0.42);

  // 1. The ground: a lit patch behind the head on the light side, the corners falling to dark.
  g.fillStyle = css(rgb(look.ground));
  g.fillRect(0, 0, W, H);
  const glow = g.createRadialGradient(cx + L * W * 0.18, cy - H * 0.05, 0, cx + L * W * 0.12, cy, W * 0.75);
  glow.addColorStop(0, css(light(look.ground, 0.32), 0.95));
  glow.addColorStop(0.55, css(rgb(look.ground), 0.4));
  glow.addColorStop(1, css(dark(look.ground, 0.65), 1));
  g.fillStyle = glow;
  g.fillRect(0, 0, W, H);
  for (let i = 0; i < (lite ? 90 : 260); i++) {
    const x = rng() * W;
    const y = rng() * H;
    const r = W * (0.04 + rng() * 0.09);
    g.fillStyle = css(mix(look.ground, rng() < 0.5 ? '#000000' : '#d8c8a0', 0.12 + rng() * 0.12), 0.08);
    g.beginPath();
    g.ellipse(x, y, r, r * (0.4 + rng() * 0.5), rng() * Math.PI, 0, Math.PI * 2);
    g.fill();
  }

  // 2. Hair behind: long falls, a bun, a cloud of curls.
  g.fillStyle = css(dark(hair, 0.25));
  if (look.hairStyle === 'long') {
    g.beginPath();
    g.moveTo(cx - hw * 0.62, top + hh * 0.2);
    g.quadraticCurveTo(cx - hw * 0.85, cy + hh * 0.6, cx - hw * 0.78, shoulderY + H * 0.04);
    g.lineTo(cx + hw * 0.78, shoulderY + H * 0.04);
    g.quadraticCurveTo(cx + hw * 0.85, cy + hh * 0.6, cx + hw * 0.62, top + hh * 0.2);
    g.closePath();
    g.fill();
  } else if (look.hairStyle === 'bun') {
    g.beginPath();
    g.ellipse(cx - L * hw * 0.1, top - hh * 0.02, hw * 0.3, hh * 0.17, 0, 0, Math.PI * 2);
    g.fill();
  } else if (look.hairStyle === 'curls') {
    for (let i = 0; i < 26; i++) {
      const a = Math.PI * (0.95 + rng() * 1.1);
      const rr = hw * (0.52 + rng() * 0.08);
      g.beginPath();
      g.arc(cx + Math.cos(a) * rr, cy - hh * 0.1 + Math.sin(a) * rr * 1.05, hw * (0.1 + rng() * 0.06), 0, Math.PI * 2);
      g.fill();
    }
  } else if (look.hairStyle === 'bob') {
    g.beginPath();
    g.moveTo(cx - hw * 0.6, top + hh * 0.15);
    g.quadraticCurveTo(cx - hw * 0.74, jawY + hh * 0.02, cx - hw * 0.46, jawY + hh * 0.12);
    g.quadraticCurveTo(cx, jawY + hh * 0.2, cx + hw * 0.46, jawY + hh * 0.12);
    g.quadraticCurveTo(cx + hw * 0.74, jawY + hh * 0.02, cx + hw * 0.6, top + hh * 0.15);
    g.closePath();
    g.fill();
  }

  // 3. Dress: the shoulders, cut by attire.
  const coat = rgb(look.coat);
  const shoulders = () => {
    g.beginPath();
    g.moveTo(-W * 0.05, H + 2);
    g.lineTo(-W * 0.05, shoulderY + H * 0.12);
    g.bezierCurveTo(W * 0.06, shoulderY - H * 0.02, cx - hw * 0.9, shoulderY - H * 0.06, cx - neckW * 1.3, chinY + hh * 0.18);
    g.lineTo(cx + neckW * 1.3, chinY + hh * 0.18);
    g.bezierCurveTo(cx + hw * 0.9, shoulderY - H * 0.06, W * 0.94, shoulderY - H * 0.02, W * 1.05, shoulderY + H * 0.12);
    g.lineTo(W * 1.05, H + 2);
    g.closePath();
  };
  // The neck first, so the collar sits over it.
  const skin = rgb(look.skin);
  g.fillStyle = css(dark(skin, 0.18));
  g.fillRect(cx - neckW, jawY, neckW * 2, shoulderY - jawY);
  const neckShade = g.createLinearGradient(0, chinY - hh * 0.05, 0, chinY + hh * 0.2);
  neckShade.addColorStop(0, css(dark(skin, 0.55), 0.9));
  neckShade.addColorStop(1, css(dark(skin, 0.2), 0));
  g.fillStyle = neckShade;
  g.fillRect(cx - neckW, chinY - hh * 0.05, neckW * 2, hh * 0.3);

  const gownCut = look.attire === 'gown';
  if (gownCut) {
    // A low neckline: skin down to the bodice.
    g.fillStyle = css(dark(skin, 0.12));
    g.beginPath();
    g.ellipse(cx, chinY + hh * 0.36, hw * 0.66, hh * 0.24, 0, 0, Math.PI * 2);
    g.fill();
  }
  shoulders();
  const coatFill = g.createLinearGradient(L > 0 ? W : 0, 0, L > 0 ? 0 : W, 0);
  coatFill.addColorStop(0, css(light(coat, 0.18)));
  coatFill.addColorStop(0.6, css(coat));
  coatFill.addColorStop(1, css(dark(coat, 0.55)));
  g.fillStyle = coatFill;
  if (gownCut) {
    g.save();
    shoulders();
    g.clip();
    g.beginPath();
    g.rect(0, 0, W, H);
    g.ellipse(cx, chinY + hh * 0.36, hw * 0.58, hh * 0.2, 0, 0, Math.PI * 2);
    g.fill('evenodd');
    g.restore();
  } else g.fill();

  const trim = rgb(look.trim);
  g.lineCap = 'round';
  g.lineJoin = 'round';
  switch (look.attire) {
    case 'frock':
    case 'tweed': {
      // Shirt front and stock, then lapels over it.
      g.fillStyle = css(mix('#efe7d6', trim, 0.3));
      g.beginPath();
      g.moveTo(cx - neckW * 1.25, chinY + hh * 0.16);
      g.lineTo(cx + neckW * 1.25, chinY + hh * 0.16);
      g.lineTo(cx, H);
      g.closePath();
      g.fill();
      g.fillStyle = css(look.attire === 'tweed' ? dark(coat, 0.3) : trim);
      g.beginPath();
      g.moveTo(cx - neckW * 0.9, chinY + hh * 0.2);
      g.quadraticCurveTo(cx, chinY + hh * 0.34, cx + neckW * 0.9, chinY + hh * 0.2);
      g.lineTo(cx + neckW * 0.25, chinY + hh * 0.62);
      g.lineTo(cx - neckW * 0.25, chinY + hh * 0.62);
      g.closePath();
      g.fill();
      g.fillStyle = css(dark(coat, 0.35));
      for (const s of [-1, 1]) {
        g.beginPath();
        g.moveTo(cx + s * neckW * 1.3, chinY + hh * 0.17);
        g.lineTo(cx + s * hw * 0.62, shoulderY + H * 0.02);
        g.lineTo(cx + s * neckW * 0.4, H);
        g.lineTo(cx + s * neckW * 0.3, H);
        g.closePath();
        g.fill();
      }
      if (look.attire === 'tweed') {
        for (let i = 0; i < (lite ? 500 : 1800); i++) {
          const x = rng() * W;
          const y = shoulderY - H * 0.06 + rng() * (H - shoulderY + H * 0.06);
          g.fillStyle = css(mix(coat, rng() < 0.5 ? '#e8d8b0' : '#000000', 0.35), 0.35);
          g.fillRect(x, y, 2, 1);
        }
      }
      break;
    }
    case 'uniform': {
      g.fillStyle = css(dark(coat, 0.2));
      g.fillRect(cx - neckW * 1.35, chinY + hh * 0.08, neckW * 2.7, hh * 0.16);
      g.strokeStyle = css(rgb('#c9a35e'));
      g.lineWidth = W * 0.008;
      g.beginPath();
      g.moveTo(cx - neckW * 1.35, chinY + hh * 0.11);
      g.lineTo(cx + neckW * 1.35, chinY + hh * 0.11);
      g.moveTo(cx, chinY + hh * 0.24);
      g.lineTo(cx, H);
      g.stroke();
      for (let i = 0; i < 4; i++) {
        g.fillStyle = css(light('#c9a35e', 0.2));
        g.beginPath();
        g.arc(cx + W * 0.03, shoulderY + i * H * 0.055, W * 0.011, 0, Math.PI * 2);
        g.fill();
      }
      for (const s of [-1, 1]) {
        g.fillStyle = css(rgb('#b8914c'));
        g.beginPath();
        g.ellipse(cx + s * W * 0.36, shoulderY + H * 0.02, W * 0.1, H * 0.022, s * -0.25, 0, Math.PI * 2);
        g.fill();
        g.strokeStyle = css(rgb('#8a6a37'), 0.9);
        g.lineWidth = W * 0.005;
        for (let k = 0; k < 7; k++) {
          const x = cx + s * W * (0.28 + k * 0.025);
          g.beginPath();
          g.moveTo(x, shoulderY + H * 0.035);
          g.lineTo(x + s * W * 0.004, shoulderY + H * 0.075);
          g.stroke();
        }
      }
      break;
    }
    case 'shawl': {
      g.fillStyle = css(trim, 0.92);
      for (const s of [-1, 1]) {
        g.beginPath();
        g.moveTo(cx + s * neckW * 1.2, chinY + hh * 0.15);
        g.quadraticCurveTo(cx + s * hw * 0.95, shoulderY - H * 0.02, cx + s * W * 0.48, shoulderY + H * 0.08);
        g.lineTo(cx + s * W * 0.3, H);
        g.quadraticCurveTo(cx + s * neckW * 0.2, shoulderY + H * 0.1, cx + s * neckW * 0.8, chinY + hh * 0.2);
        g.closePath();
        g.fill();
      }
      g.strokeStyle = css(dark(trim, 0.35), 0.5);
      g.lineWidth = 1.2;
      for (let i = 0; i < 18; i++) {
        const s = i % 2 ? 1 : -1;
        const t = rng();
        g.beginPath();
        g.moveTo(cx + s * (neckW + t * hw * 0.6), chinY + hh * 0.2 + t * H * 0.12);
        g.quadraticCurveTo(cx + s * (neckW * 0.5 + t * hw * 0.4), shoulderY + H * 0.06, cx + s * (W * 0.12 + t * W * 0.2), H);
        g.stroke();
      }
      break;
    }
    case 'smock': {
      g.strokeStyle = css(dark(coat, 0.45), 0.7);
      g.lineWidth = W * 0.006;
      for (let i = -5; i <= 5; i++) {
        g.beginPath();
        g.moveTo(cx + i * W * 0.02, chinY + hh * 0.3);
        g.quadraticCurveTo(cx + i * W * 0.045, shoulderY + H * 0.08, cx + i * W * 0.07, H);
        g.stroke();
      }
      g.fillStyle = css(trim);
      g.beginPath();
      g.ellipse(cx, chinY + hh * 0.2, neckW * 1.7, hh * 0.12, 0, 0, Math.PI);
      g.ellipse(cx, chinY + hh * 0.2, neckW * 1.1, hh * 0.05, 0, Math.PI, 0, true);
      g.fill();
      break;
    }
    case 'gown': {
      // Lace at the neckline.
      g.strokeStyle = css(trim, 0.9);
      g.lineWidth = W * 0.012;
      g.beginPath();
      g.ellipse(cx, chinY + hh * 0.36, hw * 0.58, hh * 0.2, 0, Math.PI * 0.05, Math.PI * 0.95);
      g.stroke();
      g.fillStyle = css(trim, 0.6);
      for (let i = 0; i < 26; i++) {
        const a = Math.PI * (0.05 + (0.9 * i) / 25);
        g.beginPath();
        g.arc(cx + Math.cos(a) * hw * 0.58, chinY + hh * 0.36 + Math.sin(a) * hh * 0.2 + W * 0.008, W * 0.007, 0, Math.PI * 2);
        g.fill();
      }
      break;
    }
  }

  // 4. Ears, then the head.
  g.fillStyle = css(dark(skin, 0.2));
  for (const s of [-1, 1]) {
    g.beginPath();
    g.ellipse(cx + s * hw * 0.5, cy + hh * 0.05, hw * 0.08, hh * 0.11, 0, 0, Math.PI * 2);
    g.fill();
  }
  const headPath = () => {
    g.beginPath();
    g.moveTo(cx - hw / 2, cy);
    g.bezierCurveTo(cx - hw / 2, top - hh * 0.02, cx + hw / 2, top - hh * 0.02, cx + hw / 2, cy);
    g.bezierCurveTo(cx + hw / 2, cy + hh * 0.18, cx + jawW * 1.05, jawY - hh * 0.04, cx + jawW, jawY);
    g.quadraticCurveTo(cx + jawW * 0.5, chinY, cx, chinY);
    g.quadraticCurveTo(cx - jawW * 0.5, chinY, cx - jawW, jawY);
    g.bezierCurveTo(cx - jawW * 1.05, jawY - hh * 0.04, cx - hw / 2, cy + hh * 0.18, cx - hw / 2, cy);
    g.closePath();
  };
  headPath();
  g.fillStyle = css(skin);
  g.fill();
  g.save();
  headPath();
  g.clip();
  // Modelling: the shadow side falls away, the lit cheek and brow catch the light.
  const model = g.createLinearGradient(cx + L * hw * 0.6, 0, cx - L * hw * 0.6, 0);
  model.addColorStop(0, css(light(skin, 0.25), 0.55));
  model.addColorStop(0.45, css(skin, 0));
  model.addColorStop(1, css(dark(skin, 0.5), 0.75));
  g.fillStyle = model;
  g.fillRect(0, 0, W, H);
  const under = g.createLinearGradient(0, jawY - hh * 0.1, 0, chinY);
  under.addColorStop(0, css(dark(skin, 0.3), 0));
  under.addColorStop(1, css(dark(skin, 0.35), 0.55));
  g.fillStyle = under;
  g.fillRect(0, jawY - hh * 0.1, W, chinY);
  for (const s of [-1, 1]) {
    const blush = g.createRadialGradient(cx + s * hw * 0.24, cy + hh * 0.17, 0, cx + s * hw * 0.24, cy + hh * 0.17, hw * 0.2);
    blush.addColorStop(0, css(mix(skin, '#c0504a', 0.45), 0.35));
    blush.addColorStop(1, css(skin, 0));
    g.fillStyle = blush;
    g.fillRect(0, 0, W, H);
  }
  const brow = g.createRadialGradient(cx + L * hw * 0.12, cy - hh * 0.2, 0, cx + L * hw * 0.12, cy - hh * 0.2, hw * 0.35);
  brow.addColorStop(0, css(light(skin, 0.4), 0.45));
  brow.addColorStop(1, css(skin, 0));
  g.fillStyle = brow;
  g.fillRect(0, 0, W, H);
  g.restore();

  // 5. Features.
  const eyeY = cy + hh * 0.02;
  const eyeDX = hw * (0.19 + look.eyeSet * 0.05);
  const eyeW = hw * 0.12;
  for (const s of [-1, 1]) {
    const ex = cx + s * eyeDX + look.turn * hw * 0.04;
    // The socket's shade.
    const sock = g.createRadialGradient(ex, eyeY - hh * 0.01, 0, ex, eyeY - hh * 0.01, eyeW * 1.6);
    sock.addColorStop(0, css(dark(skin, 0.45), s === L ? 0.25 : 0.45));
    sock.addColorStop(1, css(skin, 0));
    g.fillStyle = sock;
    g.beginPath();
    g.ellipse(ex, eyeY - hh * 0.01, eyeW * 1.6, eyeW * 1.1, 0, 0, Math.PI * 2);
    g.fill();
    // White, iris, pupil, glint.
    g.fillStyle = css(mix(skin, '#ece4d6', 0.55));
    g.beginPath();
    g.moveTo(ex - eyeW, eyeY);
    g.quadraticCurveTo(ex, eyeY - eyeW * 0.75, ex + eyeW, eyeY);
    g.quadraticCurveTo(ex, eyeY + eyeW * 0.55, ex - eyeW, eyeY);
    g.fill();
    g.fillStyle = css(rgb(look.eyes));
    g.beginPath();
    g.arc(ex + look.turn * eyeW * 0.25, eyeY - eyeW * 0.04, eyeW * 0.42, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = 'rgba(10,8,6,0.95)';
    g.beginPath();
    g.arc(ex + look.turn * eyeW * 0.25, eyeY - eyeW * 0.04, eyeW * 0.18, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = 'rgba(255,248,230,0.9)';
    g.beginPath();
    g.arc(ex + look.turn * eyeW * 0.25 + L * eyeW * 0.14, eyeY - eyeW * 0.16, eyeW * 0.08, 0, Math.PI * 2);
    g.fill();
    // Upper lid and crease.
    g.strokeStyle = css(dark(skin, 0.75), 0.9);
    g.lineWidth = Math.max(1, W * 0.006);
    g.beginPath();
    g.moveTo(ex - eyeW * 1.05, eyeY + eyeW * 0.05);
    g.quadraticCurveTo(ex, eyeY - eyeW * 0.85, ex + eyeW * 1.05, eyeY + eyeW * 0.05);
    g.stroke();
    g.strokeStyle = css(dark(skin, 0.4), 0.5);
    g.lineWidth = Math.max(1, W * 0.003);
    g.beginPath();
    g.moveTo(ex - eyeW * 0.9, eyeY - eyeW * 0.45);
    g.quadraticCurveTo(ex, eyeY - eyeW * 1.1, ex + eyeW * 0.9, eyeY - eyeW * 0.45);
    g.stroke();
    // Brow.
    g.strokeStyle = css(dark(hair, 0.15), 0.9);
    g.lineWidth = W * ((f ? 0.006 : 0.01) + look.brow * 0.008);
    g.beginPath();
    const by = eyeY - eyeW * (1.35 + look.brow * 0.2);
    g.moveTo(ex - s * eyeW * 1.1, by + eyeW * 0.25);
    g.quadraticCurveTo(ex - s * eyeW * 0.1, by - eyeW * 0.3, ex + s * eyeW * 1.15, by + eyeW * 0.15);
    g.stroke();
  }

  // Nose: the shadow down one side, a lit bridge, the nostrils.
  const tipY = cy + hh * (0.16 + look.nose * 0.06);
  const nx = cx + look.turn * hw * 0.08;
  g.strokeStyle = css(dark(skin, 0.45), 0.65);
  g.lineWidth = W * 0.008;
  g.beginPath();
  g.moveTo(nx - L * hw * 0.05, eyeY + hh * 0.02);
  g.quadraticCurveTo(nx - L * hw * 0.08, tipY - hh * 0.04, nx - L * hw * 0.06, tipY);
  g.stroke();
  g.strokeStyle = css(light(skin, 0.4), 0.55);
  g.lineWidth = W * 0.007;
  g.beginPath();
  g.moveTo(nx + L * hw * 0.01, eyeY + hh * 0.03);
  g.lineTo(nx + L * hw * 0.015, tipY - hh * 0.03);
  g.stroke();
  g.fillStyle = css(dark(skin, 0.6), 0.75);
  for (const s of [-1, 1]) {
    g.beginPath();
    g.ellipse(nx + s * hw * 0.055, tipY + hh * 0.01, hw * 0.028, hh * 0.012, s * 0.4, 0, Math.PI * 2);
    g.fill();
  }

  // Mouth.
  const mY = cy + hh * (0.29 + look.nose * 0.025);
  const mW = hw * (0.15 + look.mouth * 0.06);
  const lips = rgb(look.lips);
  g.fillStyle = css(dark(lips, 0.25));
  g.beginPath();
  g.moveTo(nx - mW, mY);
  g.quadraticCurveTo(nx - mW * 0.4, mY - hh * 0.035, nx, mY - hh * 0.02);
  g.quadraticCurveTo(nx + mW * 0.4, mY - hh * 0.035, nx + mW, mY);
  g.closePath();
  g.fill();
  g.fillStyle = css(f ? lips : mix(lips, skin, 0.4));
  g.beginPath();
  g.moveTo(nx - mW, mY);
  g.quadraticCurveTo(nx, mY + hh * 0.05, nx + mW, mY);
  g.closePath();
  g.fill();
  g.strokeStyle = css(dark(lips, 0.6), 0.85);
  g.lineWidth = Math.max(1, W * 0.004);
  g.beginPath();
  g.moveTo(nx - mW, mY);
  g.quadraticCurveTo(nx, mY + hh * 0.006, nx + mW, mY);
  g.stroke();

  // 6. Beard and moustache.
  const beardCol = dark(hair, 0.1);
  if (look.beard === 'full') {
    g.fillStyle = css(beardCol, 0.95);
    g.beginPath();
    g.moveTo(cx - hw / 2, cy + hh * 0.08);
    g.bezierCurveTo(cx - hw * 0.5, jawY + hh * 0.1, cx - jawW * 0.6, chinY + hh * 0.12, cx, chinY + hh * 0.14);
    g.bezierCurveTo(cx + jawW * 0.6, chinY + hh * 0.12, cx + hw * 0.5, jawY + hh * 0.1, cx + hw / 2, cy + hh * 0.08);
    g.lineTo(cx + hw * 0.42, cy + hh * 0.1);
    g.quadraticCurveTo(cx + mW * 1.4, mY + hh * 0.02, nx + mW * 0.9, mY + hh * 0.05);
    g.quadraticCurveTo(nx, mY + hh * 0.09, nx - mW * 0.9, mY + hh * 0.05);
    g.quadraticCurveTo(cx - mW * 1.4, mY + hh * 0.02, cx - hw * 0.42, cy + hh * 0.1);
    g.closePath();
    g.fill();
  }
  if (look.beard === 'whiskers') {
    g.fillStyle = css(beardCol, 0.92);
    for (const s of [-1, 1]) {
      g.beginPath();
      g.moveTo(cx + s * hw * 0.5, cy - hh * 0.02);
      g.quadraticCurveTo(cx + s * hw * 0.5, jawY, cx + s * jawW * 0.9, jawY + hh * 0.06);
      g.lineTo(cx + s * jawW * 0.55, jawY - hh * 0.02);
      g.quadraticCurveTo(cx + s * hw * 0.36, cy + hh * 0.12, cx + s * hw * 0.4, cy - hh * 0.02);
      g.closePath();
      g.fill();
    }
  }
  if (look.beard === 'moustache' || look.beard === 'full') {
    g.fillStyle = css(beardCol);
    g.beginPath();
    g.moveTo(nx - mW * 1.25, mY + hh * 0.015);
    g.quadraticCurveTo(nx - mW * 0.6, mY - hh * 0.07, nx, mY - hh * 0.035);
    g.quadraticCurveTo(nx + mW * 0.6, mY - hh * 0.07, nx + mW * 1.25, mY + hh * 0.015);
    g.quadraticCurveTo(nx, mY - hh * 0.01, nx - mW * 1.25, mY + hh * 0.015);
    g.fill();
  }

  // 7. Hair over the head, by style.
  const hairFill = g.createLinearGradient(cx + L * hw * 0.5, top, cx - L * hw * 0.5, cy);
  hairFill.addColorStop(0, css(light(hair, 0.22)));
  hairFill.addColorStop(1, css(dark(hair, 0.35)));
  g.fillStyle = hairFill;
  const cap = (depth: number, sideDrop: number, part = 0) => {
    g.beginPath();
    g.moveTo(cx - hw * 0.54, cy + hh * sideDrop);
    g.bezierCurveTo(cx - hw * 0.62, top - hh * depth, cx + hw * 0.62, top - hh * depth, cx + hw * 0.54, cy + hh * sideDrop);
    g.quadraticCurveTo(cx + hw * 0.44, top + hh * 0.3, cx + part * hw * 0.2, top + hh * 0.24);
    g.quadraticCurveTo(cx - hw * 0.44, top + hh * 0.3, cx - hw * 0.54, cy + hh * sideDrop);
    g.closePath();
    g.fill();
  };
  switch (look.hairStyle) {
    case 'crop':
      cap(0.06, -0.12);
      break;
    case 'parted':
      cap(0.1, -0.08, -L);
      break;
    case 'swept':
      cap(0.18, -0.1, 0);
      break;
    case 'curls':
      cap(0.12, 0.02);
      for (let i = 0; i < 30; i++) {
        const a = Math.PI * (1.05 + rng() * 0.9);
        const rr = hw * (0.42 + rng() * 0.12);
        g.fillStyle = css(mix(hair, rng() < 0.5 ? '#000000' : '#f0e0c0', 0.18));
        g.beginPath();
        g.arc(cx + Math.cos(a) * rr, cy - hh * 0.08 + Math.sin(a) * rr * 1.1, hw * (0.07 + rng() * 0.05), 0, Math.PI * 2);
        g.fill();
      }
      break;
    case 'bun':
      cap(0.06, 0.04, 0);
      break;
    case 'long':
      cap(0.1, 0.3, L);
      break;
    case 'bob':
      cap(0.1, 0.22, -L);
      break;
    case 'receding':
      // A bare crown, hair kept at the sides.
      g.globalAlpha = 0.85;
      for (const s of [-1, 1]) {
        g.beginPath();
        g.moveTo(cx + s * hw * 0.53, cy + hh * 0.02);
        g.quadraticCurveTo(cx + s * hw * 0.58, top + hh * 0.05, cx + s * hw * 0.3, top + hh * 0.04);
        g.quadraticCurveTo(cx + s * hw * 0.44, top + hh * 0.2, cx + s * hw * 0.46, cy + hh * 0.02);
        g.closePath();
        g.fill();
      }
      g.globalAlpha = 1;
      break;
  }
  // Strands: fine strokes in light and shade over the hair's mass.
  if (look.hairStyle !== 'receding') {
    g.lineWidth = Math.max(1, W * 0.003);
    for (let i = 0; i < (lite ? 60 : 180); i++) {
      const a = Math.PI * (1.08 + rng() * 0.84);
      const r0 = hw * (0.3 + rng() * 0.2);
      const x0 = cx + Math.cos(a) * r0;
      const y0 = cy - hh * 0.12 + Math.sin(a) * r0 * 1.1;
      g.strokeStyle = css(mix(hair, rng() < 0.5 ? '#000000' : '#fff0d0', 0.25 + rng() * 0.2), 0.5);
      g.beginPath();
      g.moveTo(x0, y0);
      g.quadraticCurveTo(x0 + Math.cos(a + 1.4) * hw * 0.12, y0 + Math.sin(a + 1.4) * hw * 0.12, x0 + Math.cos(a + 1.9) * hw * 0.22, y0 + Math.sin(a + 1.9) * hw * 0.2);
      g.stroke();
    }
  }

  // 8. Spectacles and pearls.
  if (look.spectacles) {
    g.strokeStyle = 'rgba(200,164,96,0.95)';
    g.lineWidth = Math.max(1.2, W * 0.005);
    for (const s of [-1, 1]) {
      const ex = cx + s * eyeDX + look.turn * hw * 0.04;
      g.beginPath();
      g.ellipse(ex, eyeY + eyeW * 0.05, eyeW * 1.3, eyeW * 0.95, 0, 0, Math.PI * 2);
      g.stroke();
      g.fillStyle = 'rgba(255,250,235,0.12)';
      g.fill();
      g.beginPath();
      g.moveTo(cx + s * (eyeDX + eyeW * 1.3), eyeY);
      g.lineTo(cx + s * hw * 0.5, eyeY - eyeW * 0.2);
      g.stroke();
    }
    g.beginPath();
    g.moveTo(cx - eyeDX + eyeW * 1.3, eyeY - eyeW * 0.1);
    g.quadraticCurveTo(cx, eyeY - eyeW * 0.5, cx + eyeDX - eyeW * 1.3, eyeY - eyeW * 0.1);
    g.stroke();
  }
  if (look.pearls) {
    const py = gownCut ? chinY + hh * 0.3 : chinY + hh * 0.26;
    const pr = gownCut ? hw * 0.36 : neckW * 1.15;
    for (let i = 0; i <= 16; i++) {
      const a = Math.PI * (0.12 + (0.76 * i) / 16);
      const x = cx + Math.cos(a) * pr;
      const y = py - H * 0.03 + Math.sin(a) * H * 0.04;
      const pg = g.createRadialGradient(x - L * W * 0.003, y - W * 0.003, 0, x, y, W * 0.011);
      pg.addColorStop(0, 'rgba(255,252,244,1)');
      pg.addColorStop(1, 'rgba(176,164,146,1)');
      g.fillStyle = pg;
      g.beginPath();
      g.arc(x, y, W * 0.011, 0, Math.PI * 2);
      g.fill();
    }
  }

  // 9. The brush: short strokes picked from the paint beneath, laid along a slow swirl. Fine
  // in the face, broad in the ground.
  brushwork(g, W, H, rng, { cx, cy, hw, hh }, lite);

  // 10. Varnish, a dark edge, craquelure and the canvas weave.
  g.globalCompositeOperation = 'multiply';
  g.fillStyle = 'rgba(240,214,160,0.32)';
  g.fillRect(0, 0, W, H);
  g.globalCompositeOperation = 'source-over';
  const vig = g.createRadialGradient(W / 2, H * 0.45, W * 0.3, W / 2, H * 0.5, W * 0.85);
  vig.addColorStop(0, 'rgba(10,6,4,0)');
  vig.addColorStop(1, 'rgba(10,6,4,0.55)');
  g.fillStyle = vig;
  g.fillRect(0, 0, W, H);
  g.strokeStyle = 'rgba(20,12,6,0.16)';
  g.lineWidth = 0.6;
  for (let i = 0; i < (lite ? 20 : 70); i++) {
    let x = rng() * W;
    let y = rng() * H;
    g.beginPath();
    g.moveTo(x, y);
    for (let k = 0; k < 5; k++) {
      x += jit(W * 0.04);
      y += jit(W * 0.04);
      g.lineTo(x, y);
    }
    g.stroke();
  }
  if (!lite) {
    for (let i = 0; i < W * H * 0.04; i++) {
      g.fillStyle = rng() < 0.5 ? 'rgba(255,240,210,0.05)' : 'rgba(0,0,0,0.06)';
      g.fillRect(rng() * W, rng() * H, 1, 1);
    }
  }
}

function brushwork(g: CanvasRenderingContext2D, W: number, H: number, rng: Rng, head: { cx: number; cy: number; hw: number; hh: number }, lite: boolean) {
  let data: ImageData;
  try {
    data = g.getImageData(0, 0, W, H);
  } catch {
    return;
  }
  const px = data.data;
  const n = lite ? 1400 : 5200;
  g.lineCap = 'round';
  for (let i = 0; i < n; i++) {
    const x = rng() * W;
    const y = rng() * H;
    const k = (Math.floor(y) * W + Math.floor(x)) * 4;
    const dx = (x - head.cx) / head.hw;
    const dy = (y - head.cy) / head.hh;
    const inFace = dx * dx + dy * dy < 0.36;
    const len = (inFace ? 0.007 : 0.016) * W * (0.6 + rng() * 0.8);
    const width = (inFace ? 0.005 : 0.014) * W * (0.6 + rng() * 0.8);
    const a = Math.sin(x * 0.013 + y * 0.007) * 1.4 + Math.cos(y * 0.011) * 0.8 + (rng() - 0.5) * 0.5;
    const t = 0.94 + rng() * 0.12;
    g.strokeStyle = `rgba(${Math.min(255, px[k]! * t) | 0},${Math.min(255, px[k + 1]! * t) | 0},${Math.min(255, px[k + 2]! * t) | 0},${inFace ? 0.3 : 0.4})`;
    g.lineWidth = width;
    g.beginPath();
    g.moveTo(x - Math.cos(a) * len, y - Math.sin(a) * len);
    g.lineTo(x + Math.cos(a) * len, y + Math.sin(a) * len);
    g.stroke();
  }
}
