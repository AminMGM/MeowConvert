// Engine smoke test: generates sample files and runs every offline conversion route
// through the same job runner the app uses.  Usage: node scripts/test-engines.mjs [filter]
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import { runJob } from '../electron/engines/index.mjs';
import { targetsFor, extOf, OUTPUTS } from '../shared/formats.mjs';
import { run, ffmpegPath, sevenZipPath, bsdtarPath, require } from '../electron/engines/util.mjs';
import { htmlToEpub } from '../electron/engines/document.mjs';

const sharp = require('sharp');
const XLSX = require('xlsx');
const filter = process.argv[2] || '';
const root = path.join(os.tmpdir(), 'meowconvert-engine-test');
const fixtures = path.join(root, 'fixtures');
const outDir = path.join(root, 'out');
await fs.rm(root, { recursive: true, force: true });
await fs.mkdir(fixtures, { recursive: true });
await fs.mkdir(outDir, { recursive: true });
const fx = name => path.join(fixtures, name);
const ff = args => run(ffmpegPath, ['-hide_banner', '-loglevel', 'error', '-y', ...args]);

await ff(['-f', 'lavfi', '-i', 'testsrc2=s=320x240:d=2:r=25', '-f', 'lavfi', '-i', 'sine=f=440:d=2', '-shortest', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', fx('video.mp4')]);
await ff(['-f', 'lavfi', '-i', 'sine=f=330:d=2', fx('audio.wav')]);
await ff(['-f', 'lavfi', '-i', 'testsrc2=s=160x120:d=1:r=10', fx('anim.gif')]);
await sharp(fx('anim.gif'), { animated: true }).webp().toFile(fx('anim.webp'));
await sharp({ create: { width: 300, height: 200, channels: 4, background: { r: 120, g: 80, b: 240, alpha: 0.7 } } }).composite([{ input: Buffer.from('<svg width="300" height="200"><circle cx="150" cy="100" r="70" fill="#ffcc33"/></svg>') }]).png().toFile(fx('image.png'));
await sharp(fx('image.png')).jpeg().toFile(fx('photo.jpg'));
await ff(['-i', fx('image.png'), fx('legacy.bmp')]);
await fs.writeFile(fx('vector.svg'), '<svg xmlns="http://www.w3.org/2000/svg" width="120" height="80"><rect width="120" height="80" fill="#4a6"/><text x="10" y="45" font-size="20">Meow</text></svg>');
const html = '<h1>Chapter One</h1><p>Hello <b>bold</b> &amp; <i>italic</i> world.</p><ul><li>One</li><li>Two</li></ul><table><tr><th>A</th><th>B</th></tr><tr><td>1</td><td>2</td></tr></table><h1>Chapter Two</h1><p>More text&nbsp;here.<br>Line two</p>';
await fs.writeFile(fx('page.html'), `<!doctype html><html><head><title>Test page</title></head><body>${html}</body></html>`);
await fs.writeFile(fx('notes.md'), '# Notes\n\nSome **markdown** with a [link](https://example.com).\n\n| a | b |\n|---|---|\n| 1 | 2 |\n');
await fs.writeFile(fx('plain.txt'), 'First paragraph.\nSame paragraph.\n\nSecond paragraph – unicode ✓.');
await fs.writeFile(fx('letter.rtf'), '{\\rtf1\\ansi{\\fonttbl{\\f0 Arial;}}\\f0 Hello \\b RTF\\b0 world.\\par Caf\\\'e9 \\u8364? done.\\par}');
await fs.writeFile(fx('report.docx'), await require('html-to-docx')(`<html><body>${html}</body></html>`));
await fs.writeFile(fx('book.epub'), await htmlToEpub(html, { title: 'Test Book' }));
const workbook = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([['Name', 'Qty'], ['Cat', 3], ['Dog', 5]]), 'Pets');
XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([['x'], [1]]), 'Other');
XLSX.writeFile(workbook, fx('sheet.xlsx'));
await fs.writeFile(fx('data.csv'), 'name,age\nAmin,30\n"Smith, J",41\n');
await fs.writeFile(fx('rows.json'), JSON.stringify([{ a: 1, b: { c: 2 } }, { a: 3, b: { c: 4 } }]));
await run(sevenZipPath, ['a', '-tzip', fx('bundle.zip'), fx('plain.txt'), fx('image.png')]);
await run(bsdtarPath, ['-czf', fx('bundle.tar.gz'), '-C', fixtures, 'plain.txt', 'notes.md']);
await fs.copyFile(path.join(process.env.SystemRoot, 'Fonts', 'arial.ttf'), fx('arial.ttf'));
const fontWorker = path.resolve('electron/engines/font-worker.cjs');
await run(process.execPath, [fontWorker, fx('arial.ttf'), 'ttf', 'woff', fx('arialw.woff')]);
await run(process.execPath, [fontWorker, fx('arial.ttf'), 'ttf', 'woff2', fx('arialw2.woff2')]);
const otf = (await fs.readdir(path.join(process.env.SystemRoot, 'Fonts'))).find(name => name.toLowerCase().endsWith('.otf'));
if (otf) await fs.copyFile(path.join(process.env.SystemRoot, 'Fonts', otf), fx('sample.otf'));
const pdfDoc = await PDFDocument.create();
const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
for (let index = 0; index < 3; index += 1) {
  const page = pdfDoc.addPage([400, 500]);
  page.drawText(`Page ${index + 1}`, { x: 40, y: 440, size: 24, font });
  page.drawImage(await pdfDoc.embedJpg(await sharp(fx('photo.jpg')).resize(1200, 800).jpeg({ quality: 98 }).toBuffer()), { x: 40, y: 60, width: 320, height: 213 });
}
await fs.writeFile(fx('doc.pdf'), await pdfDoc.save());

const settings = { keepMetadata: true, hwAccel: false, encodeSpeed: 'fast', conflict: 'rename', fileSuffix: '' };
const htmlToPdf = async content => {
  const doc = await PDFDocument.create();
  doc.addPage().drawText(`fake pdf ${content.length}`, { x: 50, y: 700, size: 12 });
  return Buffer.from(await doc.save());
};
const SKIP_KINDS = new Set(['model', 'pdfimage']);
const results = [];

async function attempt(label, job) {
  if (filter && !label.includes(filter)) return;
  const started = Date.now();
  try {
    const result = await runJob(job, { settings, outDir, htmlToPdf, onProgress: () => {} });
    results.push({ label, ok: true, ms: Date.now() - started, info: result.outputs.map(output => `${path.basename(output.path)} ${output.size}B`).join(', ') + (result.notes.length ? ` [${result.notes.join('; ')}]` : '') });
  } catch (error) {
    results.push({ label, ok: false, ms: Date.now() - started, info: error.message });
  }
}

for (const file of await fs.readdir(fixtures)) {
  const ext = extOf(file);
  if (ext === 'pdf') continue;
  for (const target of targetsFor(ext, {})) {
    if (SKIP_KINDS.has(OUTPUTS[target].kind)) continue;
    await attempt(`${file} → ${target}`, { input: fx(file), target, options: { quality: 70 } });
  }
}

const tools = [
  ['video trim+speed+crop', { input: fx('video.mp4'), target: 'mp4', options: { trimStart: '0.5', trimEnd: '1.8', speed: 1.5, crop: '1:1', rotate: '90', flipH: true, volume: 150, fadeIn: 0.3 } }],
  ['video compress target size', { input: fx('video.mp4'), target: 'mp4', options: { targetSizeMB: 0.1 } }],
  ['video compress webm percent', { input: fx('video.mp4'), target: 'webm', options: { compressPercent: 50 } }],
  ['video fast trim copy', { input: fx('video.mp4'), target: 'mp4', options: { trimStart: '0.5', trimEnd: '1.5', vcodec: 'copy' } }],
  ['video h265 720', { input: fx('video.mp4'), target: 'mkv', options: { vcodec: 'h265', resolution: '720' } }],
  ['video mute', { input: fx('video.mp4'), target: 'mp4', options: { mute: true } }],
  ['audio trim fade normalize', { input: fx('audio.wav'), target: 'mp3', options: { trimStart: '0.2', trimEnd: '1.5', fadeOut: 0.5, normalize: true, audioBitrate: '128', sampleRate: '44100', channels: '1' } }],
  ['media merge video', { tool: 'media-merge', inputs: [fx('video.mp4'), fx('anim.gif')], options: {} }],
  ['media merge audio', { tool: 'audio-merge', inputs: [fx('audio.wav'), fx('video.mp4')], options: { format: 'mp3' } }],
  ['images → gif', { tool: 'images-animation', inputs: [fx('image.png'), fx('photo.jpg'), fx('legacy.bmp')], options: { format: 'gif', frameDelay: 0.5 } }],
  ['images → mp4', { tool: 'images-animation', inputs: [fx('image.png'), fx('photo.jpg')], options: { format: 'mp4', frameDelay: 1 } }],
  ['images → pdf a4', { tool: 'images-pdf', inputs: [fx('image.png'), fx('photo.jpg'), fx('legacy.bmp')], options: { pageSize: 'a4', margin: 20 } }],
  ['image compress to 5KB', { input: fx('photo.jpg'), target: 'jpg', options: { maxSizeKB: 5 } }],
  ['image resize crop rotate', { input: fx('image.png'), target: 'webp', options: { crop: '1:1', rotate: '90', resizeMode: 'width', width: 100, flipV: true, grayscale: true } }],
  ['image resize percent', { input: fx('anim.gif'), target: 'gif', options: { resizeMode: 'percent', percent: 50 } }],
  ['pdf merge', { tool: 'pdf-merge', inputs: [fx('doc.pdf'), fx('doc.pdf')], options: {} }],
  ['pdf split each', { tool: 'pdf-split', inputs: [fx('doc.pdf')], options: { mode: 'each' } }],
  ['pdf split ranges', { tool: 'pdf-split', inputs: [fx('doc.pdf')], options: { mode: 'ranges', ranges: '1-2; 3' } }],
  ['pdf extract', { tool: 'pdf-organize', inputs: [fx('doc.pdf')], options: { mode: 'keep', pages: '3,1' } }],
  ['pdf delete', { tool: 'pdf-organize', inputs: [fx('doc.pdf')], options: { mode: 'delete', pages: '2' } }],
  ['pdf rotate', { tool: 'pdf-rotate', inputs: [fx('doc.pdf')], options: { angle: 90, pages: 'all' } }],
  ['pdf compress', { tool: 'pdf-compress', inputs: [fx('doc.pdf')], options: { level: 'extreme' } }],
  ['pdf watermark', { tool: 'pdf-watermark', inputs: [fx('doc.pdf')], options: { text: 'CONFIDENTIAL', opacity: 25 } }],
  ['pdf numbers', { tool: 'pdf-number', inputs: [fx('doc.pdf')], options: { position: 'bottom-right' } }],
  ['pdf text → docx', { input: fx('doc.pdf'), target: 'docx', htmlContent: '<p>Page 1 text</p>', options: {} }],
  ['archive extract zip', { tool: 'archive-extract', inputs: [fx('bundle.zip')], options: {} }],
  ['archive extract tgz', { tool: 'archive-extract', inputs: [fx('bundle.tar.gz')], options: {} }],
  ['archive create 7z pw', { tool: 'archive-create', inputs: [fx('plain.txt'), fx('image.png')], options: { format: '7z', password: 'x' } }],
  ['archive create tar.xz', { tool: 'archive-create', inputs: [fx('plain.txt'), fx('image.png')], options: { format: 'tar.xz' } }]
];
for (const [label, job] of tools) await attempt(`tool: ${label}`, job);

let failures = 0;
for (const result of results) {
  if (!result.ok) failures += 1;
  console.log(`${result.ok ? 'PASS' : 'FAIL'} ${String(result.ms).padStart(6)}ms  ${result.label}  ${result.ok ? '' : '→ '}${result.info}`);
}
console.log(`\n${results.length - failures}/${results.length} passed. Outputs in ${outDir}`);
process.exitCode = failures ? 1 : 0;
