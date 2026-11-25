import path from 'node:path';
import fs from 'node:fs/promises';
import { OUTPUTS } from '../../shared/formats.mjs';
import { require, clamp } from './util.mjs';
import { decodeImageWithFfmpeg, encodeImageWithFfmpeg } from './media.mjs';
import { imagesToPdf } from './pdf.mjs';

const sharp = require('sharp');
sharp.cache({ memory: 256, items: 50 });
sharp.concurrency(0);

const SHARP_READABLE = new Set(['jpg', 'jpeg', 'jfif', 'jpe', 'png', 'webp', 'avif', 'gif', 'tif', 'tiff', 'svg']);
const ANIMATABLE = new Set(['gif', 'webp']);
const FFMPEG_ENCODED = new Set(['tga', 'jp2', 'ppm', 'pgm', 'pbm', 'pcx', 'qoi', 'sgi', 'ras', 'xbm', 'xwd', 'hdr', 'exr']);

/** Opens any supported image as a sharp pipeline (decoding exotic formats first). */
export async function openImage(input, ctx, { animated = false } = {}) {
  const ext = path.extname(input).slice(1).toLowerCase();
  const sharpOptions = { failOn: 'none', limitInputPixels: 0x3FFF * 0x3FFF, animated: animated && ANIMATABLE.has(ext) };
  if (SHARP_READABLE.has(ext)) return sharp(input, { ...sharpOptions, density: ext === 'svg' ? 216 : undefined });
  if (ext === 'heic' || ext === 'heif') {
    try {
      // libvips handles AVIF-coded HEIF; HEVC-coded HEIC falls through to the WASM decoder.
      const { data, info } = await sharp(input, sharpOptions).raw().toBuffer({ resolveWithObject: true });
      return sharp(data, { raw: { width: info.width, height: info.height, channels: info.channels } });
    } catch {
      const decode = require('heic-decode');
      const { width, height, data } = await decode({ buffer: await fs.readFile(input) });
      return sharp(Buffer.from(data.buffer, data.byteOffset, data.byteLength), { raw: { width, height, channels: 4 } });
    }
  }
  const temp = path.join(await ctx.tempDir(), 'decoded.png');
  await decodeImageWithFfmpeg(input, temp, ctx.signal);
  return sharp(temp, sharpOptions);
}

/** Flushes a pipeline into a fresh one so later operations apply in the order given. */
async function materialize(image, animated) {
  const buffer = animated
    ? await image.webp({ lossless: true, effort: 0 }).toBuffer()
    : await image.png({ compressionLevel: 0 }).toBuffer();
  return sharp(buffer, { animated, limitInputPixels: false });
}

/** Applies orientation, crop, rotate/flip, resize and colour options. */
export async function applyEdits(image, options) {
  const meta = await image.metadata();
  const animated = (meta.pages || 1) > 1;
  image = image.autoOrient(); // honour EXIF orientation
  let width = meta.autoOrient?.width || meta.width;
  let height = (meta.autoOrient?.height || meta.pageHeight || meta.height);
  if (options.crop && options.crop !== 'none') {
    const [w, h] = options.crop.split(':').map(Number);
    const ratio = w / h;
    const cropWidth = Math.round(Math.min(width, height * ratio));
    const cropHeight = Math.round(Math.min(height, width / ratio));
    image = (await materialize(image, animated)).resize(cropWidth, cropHeight, { fit: 'cover', position: options.cropPosition || 'centre' });
    width = cropWidth; height = cropHeight;
  }
  const angle = Number(options.rotate) || 0;
  if (angle) {
    image = (await materialize(image, animated)).rotate(angle, { background: options.background || '#00000000' });
    if (angle % 180) [width, height] = [height, width];
  }
  if (options.flipV) image = image.flip();
  if (options.flipH) image = image.flop();
  if (angle || (options.crop && options.crop !== 'none')) image = await materialize(image, animated);
  const mode = options.resizeMode || 'none';
  const enlarge = Boolean(options.allowUpscale);
  if (mode === 'percent' && Number(options.percent) && Number(options.percent) !== 100) {
    image = image.resize(Math.max(1, Math.round(width * Number(options.percent) / 100)), null, { withoutEnlargement: !enlarge });
  } else if (mode === 'width' && Number(options.width)) {
    image = image.resize(Number(options.width), null, { withoutEnlargement: !enlarge });
  } else if (mode === 'height' && Number(options.height)) {
    image = image.resize(null, Number(options.height), { withoutEnlargement: !enlarge });
  } else if ((mode === 'fit' || mode === 'exact' || mode === 'fill') && (Number(options.width) || Number(options.height))) {
    image = image.resize(Number(options.width) || null, Number(options.height) || null, {
      fit: mode === 'exact' ? 'fill' : mode === 'fill' ? 'cover' : 'inside', withoutEnlargement: !enlarge && mode === 'fit'
    });
  }
  if (options.grayscale) image = image.grayscale();
  return image;
}

function encode(image, target, options) {
  const quality = clamp(Math.round(Number(options.quality) || 82), 1, 100);
  switch (target) {
    case 'jpg': return image.flatten({ background: options.background || '#ffffff' }).jpeg({ quality, mozjpeg: true, progressive: true });
    case 'png': return image.png({ compressionLevel: 9, effort: 8, palette: Boolean(options.pngPalette), quality, adaptiveFiltering: true });
    case 'webp': return image.webp({ quality, lossless: Boolean(options.lossless), effort: 5, smartSubsample: true });
    case 'avif': return image.avif({ quality: Math.max(1, quality - 10), lossless: Boolean(options.lossless), effort: 4 });
    case 'gif': return image.gif({ effort: 8, dither: 1, interFrameMaxError: options.pngPalette ? 8 : 0 });
    case 'tiff': return image.tiff({ compression: options.tiffCompression || 'lzw', quality });
    default: throw new Error(`Unsupported image output ${target}.`);
  }
}

/** Encodes at the highest quality that still fits `maxBytes` (binary search, then downscale). */
async function encodeToSize(image, target, options, maxBytes) {
  if (!['jpg', 'webp', 'avif'].includes(target)) {
    const buffer = await encode(image.clone(), target, { ...options, pngPalette: target === 'png' || options.pngPalette }).toBuffer();
    return buffer;
  }
  let base = image;
  for (let attempt = 0; attempt < 6; attempt += 1) {
    let low = 5;
    let high = clamp(Number(options.quality) || 90, 5, 100);
    let best = null;
    while (low <= high) {
      const mid = Math.floor((low + high) / 2);
      const buffer = await encode(base.clone(), target, { ...options, quality: mid }).toBuffer();
      if (buffer.length <= maxBytes) { best = buffer; low = mid + 1; } else { high = mid - 1; }
    }
    if (best) return best;
    const { info } = await base.clone().png({ compressionLevel: 0 }).toBuffer({ resolveWithObject: true });
    base = sharp(await base.clone().resize(Math.max(16, Math.round(info.width * 0.75))).png({ compressionLevel: 0 }).toBuffer());
  }
  return encode(base, target, { ...options, quality: 5 }).toBuffer();
}

function writeBmp({ data, info }) {
  const rowSize = Math.ceil(info.width * 3 / 4) * 4;
  const pixelBytes = rowSize * info.height;
  const file = Buffer.alloc(54 + pixelBytes);
  file.write('BM', 0, 'ascii');
  file.writeUInt32LE(54 + pixelBytes, 2);
  file.writeUInt32LE(54, 10);
  file.writeUInt32LE(40, 14);
  file.writeInt32LE(info.width, 18);
  file.writeInt32LE(info.height, 22);
  file.writeUInt16LE(1, 26);
  file.writeUInt16LE(24, 28);
  file.writeUInt32LE(pixelBytes, 34);
  file.writeInt32LE(2835, 38);
  file.writeInt32LE(2835, 42);
  for (let y = 0; y < info.height; y += 1) {
    const sourceRow = (info.height - 1 - y) * info.width * 3;
    const targetRow = 54 + y * rowSize;
    for (let x = 0; x < info.width; x += 1) {
      file[targetRow + x * 3] = data[sourceRow + x * 3 + 2];
      file[targetRow + x * 3 + 1] = data[sourceRow + x * 3 + 1];
      file[targetRow + x * 3 + 2] = data[sourceRow + x * 3];
    }
  }
  return file;
}

async function writeIco(image, options) {
  const png = await image.png().toBuffer();
  const meta = await sharp(png).metadata();
  const requested = (options.icoSizes || '16,24,32,48,64,128,256').split(',').map(Number).filter(Boolean);
  const sizes = requested.filter(size => size <= Math.max(meta.width, meta.height));
  if (!sizes.length) sizes.push(Math.min(256, Math.max(16, meta.width)));
  const images = await Promise.all(sizes.map(size => sharp(png).resize(size, size, { fit: 'contain', background: '#00000000' }).png().toBuffer()));
  const header = Buffer.alloc(6 + 16 * images.length);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(images.length, 4);
  let offset = header.length;
  images.forEach((buffer, index) => {
    const entry = 6 + index * 16;
    header[entry] = sizes[index] >= 256 ? 0 : sizes[index];
    header[entry + 1] = sizes[index] >= 256 ? 0 : sizes[index];
    header.writeUInt16LE(1, entry + 4);
    header.writeUInt16LE(32, entry + 6);
    header.writeUInt32LE(buffer.length, entry + 8);
    header.writeUInt32LE(offset, entry + 12);
    offset += buffer.length;
  });
  return Buffer.concat([header, ...images]);
}

async function traceSvg(image, options) {
  const ImageTracer = require('imagetracerjs');
  const maxSide = clamp(Number(options.traceSize) || 1000, 100, 2400);
  const { data, info } = await image.resize(maxSide, maxSide, { fit: 'inside', withoutEnlargement: true }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const preset = ImageTracer.optionpresets[options.tracePreset] ? options.tracePreset : 'default';
  const traceOptions = { ...ImageTracer.optionpresets[preset], viewbox: true, strokewidth: 0 };
  if (options.traceColors) traceOptions.numberofcolors = clamp(Number(options.traceColors), 2, 64);
  const svg = ImageTracer.imagedataToSVG({ width: info.width, height: info.height, data: new Uint8ClampedArray(data.buffer, data.byteOffset, data.length) }, traceOptions);
  return Buffer.from(svg, 'utf8');
}

export async function convertImage(ctx) {
  const { input, target, options, settings } = ctx;
  const output = OUTPUTS[target];
  if (target === 'pdf') {
    const out = await ctx.output(`${ctx.stem}.pdf`);
    await fs.writeFile(out, await imagesToPdf([input], options, ctx));
    return;
  }
  const animated = ['gif', 'webp'].includes(target) && options.keepAnimation !== false;
  let image = await openImage(input, ctx, { animated });
  image = await applyEdits(image, options);
  if (settings.keepMetadata !== false && !options.stripMetadata) image = image.keepMetadata();
  ctx.progress(0.4);
  const out = await ctx.output(`${ctx.stem}.${output.ext}`);
  let buffer;
  if (target === 'bmp') {
    buffer = writeBmp(await image.flatten({ background: options.background || '#ffffff' }).removeAlpha().raw().toBuffer({ resolveWithObject: true }));
  } else if (target === 'ico') {
    buffer = await writeIco(image, options);
  } else if (target === 'svg') {
    buffer = await traceSvg(image, options);
  } else if (FFMPEG_ENCODED.has(target)) {
    const temp = path.join(await ctx.tempDir(), 'stage.png');
    await image.png({ compressionLevel: 1 }).toFile(temp);
    await encodeImageWithFfmpeg(temp, out, target, ctx.signal);
    return;
  } else if (Number(options.maxSizeKB) > 0) {
    buffer = await encodeToSize(image, target, options, Number(options.maxSizeKB) * 1024);
  } else {
    buffer = await encode(image, target, options).toBuffer();
  }
  await fs.writeFile(out, buffer);
}

export { sharp };
