// Font conversion runs in its own Node process because fonteditor-core's WOFF2 (Emscripten) module
// installs global process handlers (exit/unhandledRejection) that must not live in the app's main process.
// Usage: font-worker.cjs <input> <inputExt> <targetType> <output>
const fs = require('node:fs');
const zlib = require('node:zlib');
const { Font, woff2, woff2ttf, eot2ttf, ttf2woff, ttf2eot, toArrayBuffer } = require('fonteditor-core');

async function main() {
  const [input, ext, target, output] = process.argv.slice(2);
  const raw = fs.readFileSync(input);
  if (ext === 'woff2' || target === 'woff2') await woff2.init();

  // 1. Unwrap to plain SFNT bytes (TrueType or CFF-flavoured OpenType) without re-serialising tables.
  let sfnt;
  if (ext === 'ttf' || ext === 'otf') sfnt = toArrayBuffer(raw);
  else if (ext === 'woff') sfnt = woff2ttf(toArrayBuffer(raw), { inflate: data => [...zlib.inflateSync(Buffer.from(data))] });
  else if (ext === 'woff2') sfnt = woff2.decode(toArrayBuffer(raw));
  else if (ext === 'eot') sfnt = eot2ttf(toArrayBuffer(raw));
  else throw new Error(`Unsupported font type .${ext}`);
  sfnt = sfnt instanceof ArrayBuffer ? sfnt : toArrayBuffer(Buffer.from(sfnt));
  const isCff = Buffer.from(sfnt.slice(0, 4)).toString('latin1') === 'OTTO';
  const asTrueType = () => isCff ? toArrayBuffer(Font.create(Buffer.from(sfnt), { type: 'otf', hinting: true, kerning: true }).write({ type: 'ttf', hinting: true, kerning: true, toBuffer: true })) : sfnt;

  // 2. Re-wrap into the requested container.
  let result;
  if (target === 'ttf') result = asTrueType();
  else if (target === 'woff2') result = woff2.encode(sfnt);
  else if (target === 'woff') result = ttf2woff(sfnt, { deflate: data => [...zlib.deflateSync(Buffer.from(data), { level: 9 })] });
  else if (target === 'eot') result = ttf2eot(asTrueType());
  else if (target === 'svg') result = Buffer.from(Font.create(Buffer.from(sfnt), { type: isCff ? 'otf' : 'ttf' }).write({ type: 'svg' }), 'utf8');
  else throw new Error(`Unsupported font output ${target}`);
  const bytes = Buffer.from(result instanceof ArrayBuffer ? new Uint8Array(result) : result);
  if (!bytes.length) throw new Error('The font encoder produced no data.');
  fs.writeFileSync(output, bytes);
}

main().then(() => process.exit(0), error => {
  process.stderr.write(`error: ${error?.message || error}\n`);
  process.exit(1);
});
