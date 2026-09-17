'use strict';

/**
 * Draws the app icons as PNG files, with no image library involved.
 * Run it with:  node scripts/make-icons.js
 *
 * The mark is a single gold point inside a ring -- the "nekudah tovah",
 * the good point Rebbe Nachman teaches you can always find.
 */

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const OUT = path.join(__dirname, '..', 'public', 'icons');

// ---------------------------------------------------------------- PNG writing

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32(buf) {
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([len, body, crc]);
}

/** `pixels` is RGBA, 4 bytes per pixel, width*height long. */
function encodePng(width, height, pixels) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;   // bit depth
  ihdr[9] = 6;   // colour type: RGBA
  ihdr[10] = 0;  // deflate
  ihdr[11] = 0;  // default filtering
  ihdr[12] = 0;  // no interlace

  // Each scanline is prefixed with a filter byte (0 = none).
  const raw = Buffer.alloc(height * (width * 4 + 1));
  for (let y = 0; y < height; y++) {
    const rowStart = y * (width * 4 + 1);
    raw[rowStart] = 0;
    pixels.copy(raw, rowStart + 1, y * width * 4, (y + 1) * width * 4);
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// ---------------------------------------------------------------- drawing

function mix(a, b, t) {
  return [
    Math.round(a[0] + (b[0] - a[0]) * t),
    Math.round(a[1] + (b[1] - a[1]) * t),
    Math.round(a[2] + (b[2] - a[2]) * t),
  ];
}

/** Smooth 0..1 ramp, used to keep edges from looking jagged. */
function smoothstep(edge0, edge1, x) {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

// Pastel: warm white paper, a rose-to-gold ring, a gold point at the centre.
const PAPER_EDGE = [249, 233, 234];  // soft rose at the corners
const PAPER_MID  = [253, 251, 249];  // warm white in the middle
const ROSE       = [231, 185, 189];
const GOLD       = [217, 185, 106];
const GOLD_DEEP  = [156, 122, 48];

/**
 * @param {number} size    pixels square
 * @param {number} inset   0 for a full-bleed icon, ~0.1 to keep the mark
 *                         clear of the circle iOS/Android crops to (maskable)
 */
function drawIcon(size, inset = 0) {
  const px = Buffer.alloc(size * size * 4);
  const c = (size - 1) / 2;
  const scale = (size / 2) * (1 - inset);
  const aa = 1.4 / scale; // roughly one pixel, in unit-circle terms

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = (x - c) / scale;
      const dy = (y - c) / scale;
      const r = Math.sqrt(dx * dx + dy * dy);

      // Background: warm white in the middle, easing to rose at the corners.
      let colour = mix(PAPER_MID, PAPER_EDGE, smoothstep(0.1, 1.2, r));

      // Outer ring, rose on the left easing to gold on the right.
      const ringBand = 1 - smoothstep(0.026, 0.026 + aa, Math.abs(r - 0.74));
      if (ringBand > 0) {
        const sweep = smoothstep(-0.8, 0.8, dx);
        colour = mix(colour, mix(ROSE, GOLD, sweep), ringBand);
      }

      // Inner hairline ring
      const hair = 1 - smoothstep(0.008, 0.008 + aa, Math.abs(r - 0.56));
      if (hair > 0) colour = mix(colour, ROSE, hair * 0.55);

      // The point itself, deepening towards its edge so it reads at any size.
      const dot = 1 - smoothstep(0.2, 0.2 + aa, r);
      if (dot > 0) colour = mix(colour, mix(GOLD, GOLD_DEEP, smoothstep(0, 0.22, r)), dot);

      const i = (y * size + x) * 4;
      px[i] = colour[0];
      px[i + 1] = colour[1];
      px[i + 2] = colour[2];
      px[i + 3] = 255;
    }
  }
  return encodePng(size, size, px);
}

fs.mkdirSync(OUT, { recursive: true });

const jobs = [
  ['icon-180.png', 180, 0],           // iPhone home screen
  ['icon-192.png', 192, 0],
  ['icon-512.png', 512, 0],
  ['icon-maskable-512.png', 512, 0.12], // Android safe zone
];

for (const [name, size, inset] of jobs) {
  const png = drawIcon(size, inset);
  fs.writeFileSync(path.join(OUT, name), png);
  console.log(`wrote ${name}  ${size}x${size}  ${(png.length / 1024).toFixed(1)} KB`);
}
