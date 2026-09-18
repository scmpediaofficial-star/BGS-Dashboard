// Builds /public/brand and the PWA icon set from the source artwork in "BGS assets/".
// Run with: npm run icons
import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const ROOT = path.resolve(import.meta.dirname, '..');
const SRC = path.join(ROOT, 'BGS assets');
const BRAND = path.join(ROOT, 'public', 'brand');
const ICONS = path.join(ROOT, 'public', 'icons');

const NAVY = '#212162';
const NAVY_DEEP = '#15153f';
const PURPLE = '#804a95';
const STRIPE = ['#ff0000', '#e1a43b', '#239205'];

const LOGO_COLOR = 'bgs-logo-3-scaled-e1753775818834-2.png';
const LOGO_WHITE = 'bgs-logo-4-scaled-e1753775983452.png';

await fs.mkdir(BRAND, { recursive: true });
await fs.mkdir(ICONS, { recursive: true });

// ── 1. Brand files, trimmed and web-sized ───────────────────────────────────
const brandFiles = [
  [LOGO_COLOR, 'logo-color.png', 720],
  [LOGO_WHITE, 'logo-white.png', 720],
  ['boad.png', 'wordmark-2026.png', 640],
  ['boad_w.png', 'wordmark-2026-white.png', 436],
  ['Group 6.png', 'partners.png', 697],
  ['Icons.c.png', 'pattern-navy.png', 83],
  ['Icons copy 4.png', 'pattern-light.png', 59],
];
for (const [from, to, width] of brandFiles) {
  await sharp(path.join(SRC, from)).resize({ width, withoutEnlargement: true }).png({ compressionLevel: 9, palette: true, quality: 90 }).toFile(path.join(BRAND, to));
}

// ── 2. The "BGS" lettermark, cut from the white logo ────────────────────────
async function lettermark() {
  const { data, info } = await sharp(path.join(SRC, LOGO_WHITE)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const alphaAt = (x, y) => data[(y * info.width + x) * 4 + 3];
  const tagline = Math.round(info.height * 0.7); // the tagline sits below the letters
  const occupied = (x) => { for (let y = 0; y < tagline; y++) if (alphaAt(x, y) > 40) return true; return false; };
  // The letters end at the first real gap (≥ 6 empty columns) — the space before the divider rule.
  let gapStart = 0, runStart = -1;
  for (let x = Math.round(info.width * 0.3); x < Math.round(info.width * 0.6) && !gapStart; x++) {
    if (!occupied(x)) { if (runStart < 0) runStart = x; if (x - runStart >= 6) gapStart = runStart; }
    else runStart = -1;
  }
  if (!gapStart) throw new Error('Could not find the gap between the BGS lettermark and the divider');
  let minX = info.width, minY = info.height, maxX = 0, maxY = 0;
  for (let y = 0; y < tagline; y++) {
    for (let x = 0; x < gapStart; x++) {
      if (alphaAt(x, y) > 40) { minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y); }
    }
  }
  return sharp(path.join(SRC, LOGO_WHITE))
    .extract({ left: minX, top: minY, width: maxX - minX + 1, height: maxY - minY + 1 })
    .png().toBuffer();
}
const mark = await lettermark();
await sharp(mark).resize({ width: 320 }).png().toFile(path.join(BRAND, 'mark-white.png'));

// ── 3. App icons ────────────────────────────────────────────────────────────
function background(size, radius) {
  return Buffer.from(`
    <svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
      <defs>
        <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stop-color="${NAVY}"/><stop offset="1" stop-color="${NAVY_DEEP}"/>
        </linearGradient>
        <radialGradient id="glow" cx="0.85" cy="0.1" r="0.9">
          <stop offset="0" stop-color="${PURPLE}" stop-opacity="0.75"/><stop offset="1" stop-color="${PURPLE}" stop-opacity="0"/>
        </radialGradient>
      </defs>
      <rect width="${size}" height="${size}" rx="${radius}" fill="url(#g)"/>
      <rect width="${size}" height="${size}" rx="${radius}" fill="url(#glow)"/>
    </svg>`);
}
function stripe(width, height) {
  const w = width / 3;
  return Buffer.from(`
    <svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
      <rect x="0" width="${w}" height="${height}" fill="${STRIPE[0]}"/>
      <rect x="${w}" width="${w}" height="${height}" fill="${STRIPE[1]}"/>
      <rect x="${w * 2}" width="${w}" height="${height}" fill="${STRIPE[2]}"/>
    </svg>`);
}
async function icon(size, { radius = 0, markScale = 0.66 } = {}) {
  const markWidth = Math.round(size * markScale);
  const markBuf = await sharp(mark).resize({ width: markWidth }).toBuffer();
  const markMeta = await sharp(markBuf).metadata();
  const stripeH = Math.max(3, Math.round(size * 0.028));
  const gap = Math.round(size * 0.06);
  const blockH = markMeta.height + gap + stripeH;
  const top = Math.round((size - blockH) / 2);
  const left = Math.round((size - markWidth) / 2);
  return sharp(background(size, radius))
    .composite([
      { input: markBuf, left, top },
      { input: await sharp(stripe(markWidth, stripeH)).png().toBuffer(), left, top: top + markMeta.height + gap },
    ])
    .png({ compressionLevel: 9 });
}

await (await icon(192, { radius: 42 })).toFile(path.join(ICONS, 'icon-192.png'));
await (await icon(512, { radius: 112 })).toFile(path.join(ICONS, 'icon-512.png'));
// Maskable: full bleed, artwork inside the 80% safe zone.
await (await icon(192, { markScale: 0.52 })).toFile(path.join(ICONS, 'icon-maskable-192.png'));
await (await icon(512, { markScale: 0.52 })).toFile(path.join(ICONS, 'icon-maskable-512.png'));
// iOS rounds the corners itself and dislikes transparency.
await (await icon(180, { markScale: 0.62 })).toFile(path.join(ICONS, 'apple-touch-icon.png'));
// Browser tab icons (Next.js file conventions).
await (await icon(64, { radius: 14, markScale: 0.72 })).toFile(path.join(ROOT, 'src', 'app', 'icon.png'));
await (await icon(180, { markScale: 0.62 })).toFile(path.join(ROOT, 'src', 'app', 'apple-icon.png'));
// favicon.ico for browsers that ask for it implicitly: PNG frames in an ICO container.
{
  const sizes = [16, 32, 48];
  const frames = await Promise.all(sizes.map(async (size) => (await icon(size, { radius: Math.round(size * 0.22), markScale: 0.74 })).toBuffer()));
  const header = Buffer.alloc(6 + 16 * frames.length);
  header.writeUInt16LE(0, 0); header.writeUInt16LE(1, 2); header.writeUInt16LE(frames.length, 4);
  let offset = header.length;
  frames.forEach((frame, i) => {
    const at = 6 + 16 * i;
    header.writeUInt8(sizes[i], at); header.writeUInt8(sizes[i], at + 1); // width, height
    header.writeUInt8(0, at + 2); header.writeUInt8(0, at + 3);            // palette, reserved
    header.writeUInt16LE(1, at + 4); header.writeUInt16LE(32, at + 6);     // planes, bits per pixel
    header.writeUInt32LE(frame.length, at + 8); header.writeUInt32LE(offset, at + 12);
    offset += frame.length;
  });
  await fs.writeFile(path.join(ROOT, 'src', 'app', 'favicon.ico'), Buffer.concat([header, ...frames]));
}
// Monochrome badge for Android notification trays.
const badgeMark = await sharp(mark).resize({ width: 80 }).toBuffer();
await sharp({ create: { width: 96, height: 96, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
  .composite([{ input: badgeMark, gravity: 'center' }]).png().toFile(path.join(ICONS, 'badge-96.png'));
// Shortcut icons reuse the main artwork.
await (await icon(96, { radius: 22 })).toFile(path.join(ICONS, 'shortcut-96.png'));

// Email clients can't use SVG or CSS gradients reliably: ship a flat header logo.
await sharp(path.join(SRC, LOGO_WHITE)).resize({ width: 440 }).png({ compressionLevel: 9 }).toFile(path.join(BRAND, 'email-logo-white.png'));

console.log('Brand files →', path.relative(ROOT, BRAND));
console.log('Icons       →', path.relative(ROOT, ICONS));
