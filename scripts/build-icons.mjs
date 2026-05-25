// One-shot build script: renders the CCS monogram in Parisienne onto pastel
// backgrounds, writes the master SVGs, and rasterizes PNG variants used by the
// PWA manifest and the OG card. Run with:
//   node scripts/build-icons.mjs
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import opentype from 'opentype.js';
import sharp from 'sharp';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const PUBLIC = join(ROOT, 'public');
const FONT_PATH = join(ROOT, 'Parisienne-Regular.ttf');

const SIZE = 512;

// Pastel theme tokens, mirrored from src/styles/theme.css so the icon matches
// the in-app brand colours.
const GRAD_STOPS = [
  { offset: '0%', color: '#F7D9B6' }, // peach
  { offset: '50%', color: '#F4C7CB' }, // blush
  { offset: '100%', color: '#DCCAE6' }, // lilac
];
const INK = '#5b3a45';

async function loadFont() {
  const buf = await readFile(FONT_PATH);
  const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
  return opentype.parse(ab);
}

function textToPath(font, text, fontSize) {
  const path = font.getPath(text, 0, 0, fontSize, { kerning: true });
  const bb = path.getBoundingBox();
  return {
    d: path.toPathData(2),
    bbox: {
      x1: bb.x1,
      y1: bb.y1,
      x2: bb.x2,
      y2: bb.y2,
      width: bb.x2 - bb.x1,
      height: bb.y2 - bb.y1,
    },
  };
}

function gradientStops() {
  return GRAD_STOPS.map((s) => `<stop offset="${s.offset}" stop-color="${s.color}"/>`).join('');
}

function buildIconSvg({ size = SIZE, padding = 0.12, rounded = true, pathD, pathBBox }) {
  const safe = size * (1 - padding * 2);
  const scale = Math.min(safe / pathBBox.width, safe / pathBBox.height);
  const tx = (size - pathBBox.width * scale) / 2 - pathBBox.x1 * scale;
  const ty = (size - pathBBox.height * scale) / 2 - pathBBox.y1 * scale;
  const r = rounded ? Math.round(size * 0.22) : 0;
  const bgRect = rounded
    ? `<rect width="${size}" height="${size}" rx="${r}" ry="${r}" fill="url(#bg)"/>`
    : `<rect width="${size}" height="${size}" fill="url(#bg)"/>`;
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">${gradientStops()}</linearGradient>
  </defs>
  ${bgRect}
  <g transform="translate(${tx.toFixed(2)} ${ty.toFixed(2)}) scale(${scale.toFixed(4)})">
    <path d="${pathD}" fill="${INK}"/>
  </g>
</svg>`;
}

function buildOgSvg(font) {
  const wordmark = textToPath(font, 'Cozy Cross Stitch', 110);
  const monogram = textToPath(font, 'CCS', 78);

  const wmMaxWidth = 580;
  const wmScale = Math.min(1, wmMaxWidth / wordmark.bbox.width);
  const wmH = wordmark.bbox.height * wmScale;
  const wmX = 230 - wordmark.bbox.x1 * wmScale;
  const wmY = 175 - wordmark.bbox.y1 * wmScale - wmH / 2;

  const badgePad = 18;
  const badgeInner = 120 - badgePad * 2;
  const monoScale = Math.min(
    badgeInner / monogram.bbox.width,
    badgeInner / monogram.bbox.height,
  );
  const monoW = monogram.bbox.width * monoScale;
  const monoH = monogram.bbox.height * monoScale;
  const monoX = 80 + (120 - monoW) / 2 - monogram.bbox.x1 * monoScale;
  const monoY = 80 + (120 - monoH) / 2 - monogram.bbox.y1 * monoScale;

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 630" width="1200" height="630">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#FBF6F0"/>
      <stop offset="55%" stop-color="#F7E4DE"/>
      <stop offset="100%" stop-color="#E9D7E7"/>
    </linearGradient>
    <linearGradient id="badge" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#F7D9B6"/>
      <stop offset="50%" stop-color="#F4C7CB"/>
      <stop offset="100%" stop-color="#DCCAE6"/>
    </linearGradient>
    <pattern id="aida" width="28" height="28" patternUnits="userSpaceOnUse">
      <rect width="28" height="28" fill="none"/>
      <path d="M0 0H28M0 28H28M0 0V28M28 0V28" stroke="rgba(197,138,149,0.18)" stroke-width="1"/>
    </pattern>
    <filter id="soft" x="-10%" y="-10%" width="120%" height="120%">
      <feGaussianBlur in="SourceGraphic" stdDeviation="14"/>
    </filter>
  </defs>

  <rect width="1200" height="630" fill="url(#bg)"/>
  <circle cx="180" cy="120" r="200" fill="#F7D9B6" opacity="0.45" filter="url(#soft)"/>
  <circle cx="1060" cy="540" r="220" fill="#DCCAE6" opacity="0.55" filter="url(#soft)"/>
  <rect width="1200" height="630" fill="url(#aida)"/>

  <g>
    <rect x="80" y="80" width="120" height="120" rx="28" fill="url(#badge)"/>
    <g transform="translate(${monoX.toFixed(2)} ${monoY.toFixed(2)}) scale(${monoScale.toFixed(4)})">
      <path d="${monogram.d}" fill="${INK}"/>
    </g>
  </g>

  <g transform="translate(${wmX.toFixed(2)} ${wmY.toFixed(2)}) scale(${wmScale.toFixed(4)})">
    <path d="${wordmark.d}" fill="${INK}"/>
  </g>
  <text x="230" y="248" font-family="'Nunito', 'Segoe UI', system-ui, sans-serif" font-size="22" font-weight="600" fill="#9b6b76" letter-spacing="3">CROSS STITCH PATTERN MAKER</text>

  <text x="80" y="360" font-family="'Cormorant Garamond', Georgia, serif" font-size="76" font-weight="600" fill="#3d2932">Turn photos into</text>
  <text x="80" y="436" font-family="'Cormorant Garamond', Georgia, serif" font-size="76" font-weight="700" fill="#c58a95" font-style="italic">beautiful cross stitch.</text>

  <g font-family="'Nunito', 'Segoe UI', system-ui, sans-serif" font-size="24" font-weight="600" fill="#5b3a45">
    <g transform="translate(80,485)">
      <rect width="240" height="56" rx="28" fill="rgba(255,255,255,0.75)" stroke="rgba(197,138,149,0.35)"/>
      <text x="32" y="36">DMC thread key</text>
    </g>
    <g transform="translate(340,485)">
      <rect width="240" height="56" rx="28" fill="rgba(255,255,255,0.75)" stroke="rgba(197,138,149,0.35)"/>
      <text x="32" y="36">Half-stitch blend</text>
    </g>
    <g transform="translate(600,485)">
      <rect width="220" height="56" rx="28" fill="rgba(255,255,255,0.75)" stroke="rgba(197,138,149,0.35)"/>
      <text x="32" y="36">Skein estimate</text>
    </g>
    <g transform="translate(840,485)">
      <rect width="280" height="56" rx="28" fill="rgba(255,255,255,0.75)" stroke="rgba(197,138,149,0.35)"/>
      <text x="32" y="36">Offline · installable</text>
    </g>
  </g>

  <g transform="translate(820,80)">
    <rect width="300" height="300" rx="18" fill="rgba(255,255,255,0.6)" stroke="rgba(197,138,149,0.35)"/>
    <g>
      <rect x="10"  y="10"  width="40" height="40" fill="#f4c7cb"/>
      <rect x="60"  y="10"  width="40" height="40" fill="#e8a6b0"/>
      <rect x="110" y="10"  width="40" height="40" fill="#dccae6"/>
      <rect x="160" y="10"  width="40" height="40" fill="#cde0ee"/>
      <rect x="210" y="10"  width="40" height="40" fill="#c9e3d0"/>
      <rect x="10"  y="60"  width="40" height="40" fill="#f7d9b6"/>
      <rect x="60"  y="60"  width="40" height="40" fill="#e9d8b6"/>
      <rect x="110" y="60"  width="40" height="40" fill="#b89bc6"/>
      <rect x="160" y="60"  width="40" height="40" fill="#c58a95"/>
      <rect x="210" y="60"  width="40" height="40" fill="#f4c7cb"/>
      <rect x="10"  y="110" width="40" height="40" fill="#cde0ee"/>
      <rect x="60"  y="110" width="40" height="40" fill="#c9e3d0"/>
      <rect x="110" y="110" width="40" height="40" fill="#f7d9b6"/>
      <rect x="160" y="110" width="40" height="40" fill="#dccae6"/>
      <rect x="210" y="110" width="40" height="40" fill="#e8a6b0"/>
      <rect x="10"  y="160" width="40" height="40" fill="#b89bc6"/>
      <rect x="60"  y="160" width="40" height="40" fill="#f4c7cb"/>
      <rect x="110" y="160" width="40" height="40" fill="#c9e3d0"/>
      <rect x="160" y="160" width="40" height="40" fill="#f7d9b6"/>
      <rect x="210" y="160" width="40" height="40" fill="#cde0ee"/>
      <rect x="10"  y="210" width="40" height="40" fill="#dccae6"/>
      <rect x="60"  y="210" width="40" height="40" fill="#c58a95"/>
      <rect x="110" y="210" width="40" height="40" fill="#e8a6b0"/>
      <rect x="160" y="210" width="40" height="40" fill="#c9e3d0"/>
      <rect x="210" y="210" width="40" height="40" fill="#b89bc6"/>
    </g>
    <g stroke="rgba(91,58,69,0.55)" stroke-width="3" stroke-linecap="round">
      <line x1="14"  y1="14"  x2="46"  y2="46"/> <line x1="46"  y1="14"  x2="14"  y2="46"/>
      <line x1="64"  y1="14"  x2="96"  y2="46"/> <line x1="96"  y1="14"  x2="64"  y2="46"/>
      <line x1="114" y1="14"  x2="146" y2="46"/> <line x1="146" y1="14"  x2="114" y2="46"/>
      <line x1="164" y1="14"  x2="196" y2="46"/> <line x1="196" y1="14"  x2="164" y2="46"/>
      <line x1="214" y1="14"  x2="246" y2="46"/> <line x1="246" y1="14"  x2="214" y2="46"/>
      <line x1="14"  y1="64"  x2="46"  y2="96"/> <line x1="46"  y1="64"  x2="14"  y2="96"/>
      <line x1="64"  y1="64"  x2="96"  y2="96"/> <line x1="96"  y1="64"  x2="64"  y2="96"/>
      <line x1="114" y1="64"  x2="146" y2="96"/> <line x1="146" y1="64"  x2="114" y2="96"/>
      <line x1="164" y1="64"  x2="196" y2="96"/> <line x1="196" y1="64"  x2="164" y2="96"/>
      <line x1="214" y1="64"  x2="246" y2="96"/> <line x1="246" y1="64"  x2="214" y2="96"/>
    </g>
  </g>

  <text x="80" y="595" font-family="'Nunito', 'Segoe UI', system-ui, sans-serif" font-size="22" font-weight="600" fill="#9b6b76" letter-spacing="2">theinsomnolent.github.io/CosyCrossStitch</text>
</svg>`;
}

async function main() {
  const font = await loadFont();
  const ccs = textToPath(font, 'CCS', 360);

  const iconSvg = buildIconSvg({ size: SIZE, padding: 0.14, rounded: true, pathD: ccs.d, pathBBox: ccs.bbox });
  const maskableSvg = buildIconSvg({ size: SIZE, padding: 0.22, rounded: false, pathD: ccs.d, pathBBox: ccs.bbox });

  await writeFile(join(PUBLIC, 'icon.svg'), iconSvg);
  await writeFile(join(PUBLIC, 'icon-maskable.svg'), maskableSvg);
  await writeFile(join(PUBLIC, 'favicon.svg'), iconSvg);

  const renders = [
    { input: iconSvg, out: 'icon-192.png', size: 192 },
    { input: iconSvg, out: 'icon-512.png', size: 512 },
    { input: maskableSvg, out: 'icon-maskable-512.png', size: 512 },
    { input: iconSvg, out: 'apple-touch-icon.png', size: 180 },
  ];
  for (const { input, out, size } of renders) {
    await sharp(Buffer.from(input)).resize(size, size).png().toFile(join(PUBLIC, out));
    console.log('wrote', out);
  }

  const ogSvg = buildOgSvg(font);
  await writeFile(join(PUBLIC, 'og-image.svg'), ogSvg);
  await sharp(Buffer.from(ogSvg)).resize(1200, 630).png().toFile(join(PUBLIC, 'og-image.png'));
  console.log('wrote og-image.png');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
