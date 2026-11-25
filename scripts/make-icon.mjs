// Builds the borderless app icon (build/icon.png + build/icon.ico + src/assets/logo.svg) from Assets/MeowConvert Logo.svg.
import fs from 'node:fs/promises';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const sharp = require('sharp');
const svg = await fs.readFile('Assets/MeowConvert Logo.svg', 'utf8');
const gradient = '<linearGradient id="mg" gradientUnits="userSpaceOnUse" x1="120" y1="20" x2="680" y2="650"><stop offset="0" stop-color="#d8ccff"/><stop offset=".5" stop-color="#8b5cf6"/><stop offset="1" stop-color="#ec4899"/></linearGradient>';
const colored = svg.replace('<defs>', `<defs>${gradient}`).replace('fill: #fff;', 'fill: url(#mg);');
await fs.mkdir('build', { recursive: true });
await fs.mkdir('src/assets', { recursive: true });
await fs.writeFile('src/assets/logo.svg', colored);
const trimmed = await sharp(Buffer.from(colored), { density: 400 }).trim().png().toBuffer();
const square = await sharp(trimmed).resize(1024, 1024, { fit: 'contain', background: '#0000' }).png().toBuffer();
await fs.writeFile('build/icon.png', square);
const sizes = [16, 24, 32, 48, 64, 128, 256];
const images = await Promise.all(sizes.map(size => sharp(square).resize(size, size).png().toBuffer()));
const header = Buffer.alloc(6 + 16 * sizes.length);
header.writeUInt16LE(1, 2);
header.writeUInt16LE(sizes.length, 4);
let offset = header.length;
images.forEach((image, index) => {
  const entry = 6 + index * 16;
  header[entry] = sizes[index] % 256;
  header[entry + 1] = sizes[index] % 256;
  header.writeUInt16LE(1, entry + 4);
  header.writeUInt16LE(32, entry + 6);
  header.writeUInt32LE(image.length, entry + 8);
  header.writeUInt32LE(offset, entry + 12);
  offset += image.length;
});
await fs.writeFile('build/icon.ico', Buffer.concat([header, ...images]));
console.log('icon written');
