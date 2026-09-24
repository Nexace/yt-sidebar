// Renders icons/icon{16,32,48,128}.png with no dependencies.
// Shapes are defined on a 128×128 grid and supersampled for anti-aliasing.
// Run: node tools/make-icons.mjs
import { writeFileSync, mkdirSync } from 'node:fs';
import { deflateSync, crc32 } from 'node:zlib';

const hex = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
const mix = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);

function inRoundRect(x, y, x0, y0, x1, y1, r) {
  const cx = Math.max(x0 + r, Math.min(x, x1 - r));
  const cy = Math.max(y0 + r, Math.min(y, y1 - r));
  return x >= x0 && x <= x1 && y >= y0 && y <= y1 && (x - cx) ** 2 + (y - cy) ** 2 <= r * r;
}

function inTri(x, y, [ax, ay], [bx, by], [cx, cy]) {
  const s = (px, py, qx, qy, rx, ry) => (px - rx) * (qy - ry) - (qx - rx) * (py - ry);
  const d1 = s(x, y, ax, ay, bx, by), d2 = s(x, y, bx, by, cx, cy), d3 = s(x, y, cx, cy, ax, ay);
  return !((d1 < 0 || d2 < 0 || d3 < 0) && (d1 > 0 || d2 > 0 || d3 > 0));
}

// Layers, bottom to top: [hit(x, y), color(x, y)]
const layers = [
  // Browser window
  [(x, y) => inRoundRect(x, y, 4, 4, 124, 124, 26), (x, y) => mix(hex('#2b2b33'), hex('#16161b'), y / 128)],
  // Page content lines (left side)
  [(x, y) => inRoundRect(x, y, 18, 26, 58, 38, 6), () => hex('#5a5a66')],
  [(x, y) => inRoundRect(x, y, 18, 50, 52, 60, 5), () => hex('#44444e')],
  [(x, y) => inRoundRect(x, y, 18, 70, 56, 80, 5), () => hex('#44444e')],
  [(x, y) => inRoundRect(x, y, 18, 90, 44, 100, 5), () => hex('#44444e')],
  // Side panel
  [(x, y) => inRoundRect(x, y, 68, 14, 114, 114, 16), (x, y) => mix(hex('#ff5a4f'), hex('#d4001c'), y / 128)],
  // Play button
  [(x, y) => inTri(x, y, [81, 46], [81, 82], [105, 64]), () => [255, 255, 255]],
];

function render(size, ss = 8) {
  const px = Buffer.alloc(size * size * 4);
  const scale = 128 / size;
  for (let j = 0; j < size; j++) for (let i = 0; i < size; i++) {
    let r = 0, g = 0, b = 0, a = 0;
    for (let sy = 0; sy < ss; sy++) for (let sx = 0; sx < ss; sx++) {
      const x = (i + (sx + 0.5) / ss) * scale, y = (j + (sy + 0.5) / ss) * scale;
      let c = null;
      for (const [hit, color] of layers) if (hit(x, y)) c = color(x, y);
      if (c) { r += c[0]; g += c[1]; b += c[2]; a++; }
    }
    const o = (j * size + i) * 4;
    if (a) { px[o] = r / a; px[o + 1] = g / a; px[o + 2] = b / a; px[o + 3] = 255 * a / (ss * ss); }
  }
  return png(size, px);
}

function png(size, rgba) {
  const chunk = (type, data) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type), data]);
    const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
    return Buffer.concat([len, td, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 6; // 8-bit RGBA
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) rgba.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0)),
  ]);
}

mkdirSync('icons', { recursive: true });
for (const s of [16, 32, 48, 128]) writeFileSync(`icons/icon${s}.png`, render(s));
console.log('icons written');
