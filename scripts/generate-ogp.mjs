/**
 * OGP画像生成（SVG → PNG via sharp）。
 * SHARED_CONFIG.md の方針に従い、全プロジェクト統一の sharp 方式。
 *
 * 使い方:
 *   npm run generate:ogp
 *
 * 出力: public/ogp.png (1200x630)
 */
import sharp from 'sharp';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUTPUT_PATH = join(__dirname, '..', 'public', 'ogp.png');

const svg = `
<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#1a1814"/>
      <stop offset="100%" stop-color="#25221d"/>
    </linearGradient>
  </defs>

  <!-- 背景 -->
  <rect width="1200" height="630" fill="url(#bg)"/>

  <!-- 上下のアクセントライン（金） -->
  <rect x="0" y="0" width="1200" height="2" fill="#c8a96a"/>
  <rect x="0" y="628" width="1200" height="2" fill="#c8a96a"/>

  <!-- メインタイトル -->
  <text x="600" y="240" font-family="'Hiragino Mincho ProN', 'Yu Mincho', serif" font-size="92" font-weight="500" fill="#e8e4dc" text-anchor="middle" letter-spacing="8">
    AI Novel
  </text>

  <!-- サブタイトル -->
  <text x="600" y="310" font-family="'Hiragino Mincho ProN', 'Yu Mincho', serif" font-size="30" fill="#908a7e" text-anchor="middle" letter-spacing="6">
    AIたちがリレーで紡ぐ短編
  </text>

  <!-- リレーを表す3つの円と接続線（作家3人を象徴） -->
  <g>
    <circle cx="480" cy="430" r="28" fill="none" stroke="#c8a96a" stroke-width="2"/>
    <circle cx="600" cy="430" r="28" fill="none" stroke="#c8a96a" stroke-width="2"/>
    <circle cx="720" cy="430" r="28" fill="none" stroke="#c8a96a" stroke-width="2"/>
    <line x1="508" y1="430" x2="572" y2="430" stroke="#c8a96a" stroke-width="1.5" stroke-dasharray="3 4" opacity="0.6"/>
    <line x1="628" y1="430" x2="692" y2="430" stroke="#c8a96a" stroke-width="1.5" stroke-dasharray="3 4" opacity="0.6"/>
    <text x="480" y="441" font-family="'Hiragino Mincho ProN', serif" font-size="26" fill="#c8a96a" text-anchor="middle">A</text>
    <text x="600" y="441" font-family="'Hiragino Mincho ProN', serif" font-size="26" fill="#c8a96a" text-anchor="middle">B</text>
    <text x="720" y="441" font-family="'Hiragino Mincho ProN', serif" font-size="26" fill="#c8a96a" text-anchor="middle">C</text>
  </g>

  <!-- URL -->
  <text x="600" y="555" font-family="ui-monospace, 'Cascadia Code', monospace" font-size="22" fill="#908a7e" text-anchor="middle" letter-spacing="2">
    novel.simtool.dev
  </text>
</svg>
`;

const pngBuffer = await sharp(Buffer.from(svg)).png().toBuffer();
await sharp(pngBuffer).toFile(OUTPUT_PATH);
console.log('OGP image generated:', OUTPUT_PATH);
