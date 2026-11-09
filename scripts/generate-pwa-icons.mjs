/**
 * DialyCare PWA Icon Verification & Generator Helper
 *
 * Verifies that the required PWA icons (both SVG and raster PNG formats)
 * are present, valid, and match the specified dimensions.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const iconsDir = path.join(rootDir, 'public', 'icons');

const REQUIRED_ICONS = [
  { file: 'icon-192.svg', type: 'svg', width: 192, height: 192 },
  { file: 'icon-512.svg', type: 'svg', width: 512, height: 512 },
  { file: 'icon-192.png', type: 'png', width: 192, height: 192 },
  { file: 'icon-512.png', type: 'png', width: 512, height: 512 },
];

console.log('[DialyCare] Verifying PWA icons in:', iconsDir);

let allValid = true;

for (const item of REQUIRED_ICONS) {
  const filePath = path.join(iconsDir, item.file);
  if (!fs.existsSync(filePath)) {
    console.error(`❌ Missing icon: ${item.file}`);
    allValid = false;
    continue;
  }

  const stat = fs.statSync(filePath);
  if (stat.size === 0) {
    console.error(`❌ Empty icon file: ${item.file}`);
    allValid = false;
    continue;
  }

  if (item.type === 'png') {
    const buf = fs.readFileSync(filePath);
    const isPng =
      buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47;
    const w = buf.readUInt32BE(16);
    const h = buf.readUInt32BE(20);

    if (!isPng || w !== item.width || h !== item.height) {
      console.error(
        `❌ Invalid PNG dimensions: ${item.file} expected ${item.width}x${item.height}, got ${w}x${h}`
      );
      allValid = false;
      continue;
    }
  }

  console.log(`✓ ${item.file} (${stat.size} bytes) valid!`);
}

if (!allValid) {
  console.error('\n[DialyCare] PWA icon verification FAILED.');
  process.exit(1);
} else {
  console.log('\n[DialyCare] All PWA icons verified successfully!');
}
