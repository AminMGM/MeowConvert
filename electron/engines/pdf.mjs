import fs from 'node:fs/promises';
import path from 'node:path';
import zlib from 'node:zlib';
import { PDFDocument, PDFName, PDFRawStream, PDFNumber, StandardFonts, degrees, rgb } from 'pdf-lib';
import { require, parsePageRanges, clamp, stemOf } from './util.mjs';

const PAGE_SIZES = { a4: [595.28, 841.89], letter: [612, 792], legal: [612, 1008], a3: [841.89, 1190.55], a5: [419.53, 595.28] };

async function loadPdf(file) {
  try {
    return await PDFDocument.load(await fs.readFile(file), { ignoreEncryption: false, updateMetadata: false });
  } catch (error) {
    if (/encrypted/i.test(error.message)) throw new Error(`${path.basename(file)} is password protected. Remove the password first.`);
    throw new Error(`${path.basename(file)} is not a valid PDF (${error.message}).`);
  }
}

async function save(doc) {
  return doc.save({ useObjectStreams: true, addDefaultPage: false });
}

/** Embeds each image on its own page. options: pageSize (fit|a4|letter|…), orientation, margin */
export async function imagesToPdf(inputs, options = {}, ctx) {
  const sharp = require('sharp');
  const { openImage } = await import('./image.mjs');
  const doc = await PDFDocument.create();
  const margin = clamp(Number(options.margin) || 0, 0, 144);
  for (let index = 0; index < inputs.length; index += 1) {
    const input = inputs[index];
    const ext = path.extname(input).slice(1).toLowerCase();
    let embedded;
    const meta = await sharp(input, { failOn: 'none' }).metadata().catch(() => ({}));
    if ((ext === 'jpg' || ext === 'jpeg') && (!meta.orientation || meta.orientation === 1) && meta.channels !== 4 && meta.space !== 'cmyk') {
      embedded = await doc.embedJpg(await fs.readFile(input));
    } else {
      const image = (await openImage(input, ctx)).autoOrient();
      const info = await image.clone().metadata();
      embedded = info.hasAlpha
        ? await doc.embedPng(await image.png({ compressionLevel: 6 }).toBuffer())
        : await doc.embedJpg(await image.jpeg({ quality: clamp(Number(options.quality) || 92, 30, 100) }).toBuffer());
    }
    let [pageWidth, pageHeight] = PAGE_SIZES[options.pageSize] || [embedded.width * 0.75 + margin * 2, embedded.height * 0.75 + margin * 2];
    const landscape = options.orientation === 'landscape' || (options.orientation !== 'portrait' && embedded.width > embedded.height);
    if (PAGE_SIZES[options.pageSize] && landscape) [pageWidth, pageHeight] = [pageHeight, pageWidth];
    pageWidth = Math.min(pageWidth, 14400);
    pageHeight = Math.min(pageHeight, 14400);
    const page = doc.addPage([pageWidth, pageHeight]);
    const scale = Math.min((pageWidth - margin * 2) / embedded.width, (pageHeight - margin * 2) / embedded.height);
    const width = embedded.width * scale;
    const height = embedded.height * scale;
    page.drawImage(embedded, { x: (pageWidth - width) / 2, y: (pageHeight - height) / 2, width, height });
    ctx?.progress((index + 1) / inputs.length * 0.9);
  }
  return save(doc);
}

export async function imagesToPdfTool(ctx) {
  const out = await ctx.output(`${ctx.options.name ? stemOf(ctx.options.name) : `${ctx.stem} images`}.pdf`);
  await fs.writeFile(out, await imagesToPdf(ctx.inputs, ctx.options, ctx));
}

export async function mergePdf(ctx) {
  if (ctx.inputs.length < 2) throw new Error('Add at least two PDFs to merge.');
  const merged = await PDFDocument.create();
  for (let index = 0; index < ctx.inputs.length; index += 1) {
    const source = await loadPdf(ctx.inputs[index]);
    const pages = await merged.copyPages(source, source.getPageIndices());
    pages.forEach(page => merged.addPage(page));
    ctx.progress((index + 1) / ctx.inputs.length);
  }
  const out = await ctx.output(`${ctx.stem} merged.pdf`);
  await fs.writeFile(out, await save(merged));
}

export async function splitPdf(ctx) {
  const source = await loadPdf(ctx.input);
  const count = source.getPageCount();
  const { mode = 'each', ranges = '', every = 1 } = ctx.options;
  let groups;
  if (mode === 'ranges') {
    groups = String(ranges).split(/[;,]/).map(part => part.trim()).filter(Boolean).map(part => parsePageRanges(part, count));
  } else {
    const size = Math.max(1, Number(every) || 1);
    groups = [];
    for (let start = 0; start < count; start += mode === 'each' ? 1 : size) {
      groups.push([...Array(Math.min(mode === 'each' ? 1 : size, count - start)).keys()].map(offset => start + offset));
    }
  }
  if (!groups.length) throw new Error('Nothing to split.');
  const folder = await ctx.outputFolder(`${ctx.stem} split`);
  for (let index = 0; index < groups.length; index += 1) {
    const doc = await PDFDocument.create();
    (await doc.copyPages(source, groups[index])).forEach(page => doc.addPage(page));
    const label = groups[index].length === 1 ? `page ${groups[index][0] + 1}` : `pages ${groups[index][0] + 1}-${groups[index].at(-1) + 1}`;
    await fs.writeFile(path.join(folder, `${ctx.stem} ${label}.pdf`), await save(doc));
    ctx.progress((index + 1) / groups.length);
  }
}

/** Keep, delete or reorder pages. */
export async function organizePdf(ctx) {
  const source = await loadPdf(ctx.input);
  const count = source.getPageCount();
  const selected = parsePageRanges(ctx.options.pages, count);
  const keep = ctx.options.mode === 'delete' ? [...Array(count).keys()].filter(index => !selected.includes(index)) : selected;
  if (!keep.length) throw new Error('That would remove every page.');
  const doc = await PDFDocument.create();
  (await doc.copyPages(source, keep)).forEach(page => doc.addPage(page));
  const out = await ctx.output(`${ctx.stem} ${ctx.options.mode === 'delete' ? 'edited' : 'extracted'}.pdf`);
  await fs.writeFile(out, await save(doc));
}

export async function rotatePdf(ctx) {
  const doc = await loadPdf(ctx.input);
  const angle = Number(ctx.options.angle) || 90;
  const pages = parsePageRanges(ctx.options.pages, doc.getPageCount());
  for (const index of pages) {
    const page = doc.getPage(index);
    page.setRotation(degrees((page.getRotation().angle + angle) % 360));
  }
  const out = await ctx.output(`${ctx.stem} rotated.pdf`);
  await fs.writeFile(out, await save(doc));
}

export async function watermarkPdf(ctx) {
  const doc = await loadPdf(ctx.input);
  const text = String(ctx.options.text || '').trim();
  if (!text) throw new Error('Enter watermark text.');
  const font = await doc.embedFont(StandardFonts.HelveticaBold);
  const opacity = clamp(Number(ctx.options.opacity) || 20, 5, 100) / 100;
  const color = hexToRgb(ctx.options.color || '#888888');
  for (const page of doc.getPages()) {
    const { width, height } = page.getSize();
    const size = Number(ctx.options.size) || Math.min(width, height) / Math.max(4, text.length * 0.55);
    const textWidth = font.widthOfTextAtSize(text, size);
    const diagonal = ctx.options.position !== 'center-flat';
    const angle = diagonal ? Math.atan2(height, width) : 0;
    page.drawText(text, {
      x: width / 2 - Math.cos(angle) * textWidth / 2 + Math.sin(angle) * size / 3,
      y: height / 2 - Math.sin(angle) * textWidth / 2 - Math.cos(angle) * size / 3,
      size, font, color, opacity, rotate: degrees(angle * 180 / Math.PI)
    });
  }
  const out = await ctx.output(`${ctx.stem} watermarked.pdf`);
  await fs.writeFile(out, await save(doc));
}

export async function numberPdf(ctx) {
  const doc = await loadPdf(ctx.input);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const pages = doc.getPages();
  const format = ctx.options.format || '{n} / {total}';
  const size = Number(ctx.options.size) || 10;
  const start = Number(ctx.options.start) || 1;
  pages.forEach((page, index) => {
    const { width } = page.getSize();
    const label = format.replace('{n}', String(index + start)).replace('{total}', String(pages.length + start - 1));
    const textWidth = font.widthOfTextAtSize(label, size);
    const position = ctx.options.position || 'bottom-center';
    const x = position.endsWith('left') ? 36 : position.endsWith('right') ? width - 36 - textWidth : (width - textWidth) / 2;
    const y = position.startsWith('top') ? page.getSize().height - 30 : 22;
    page.drawText(label, { x, y, size, font, color: rgb(0.25, 0.25, 0.25) });
  });
  const out = await ctx.output(`${ctx.stem} numbered.pdf`);
  await fs.writeFile(out, await save(doc));
}

/**
 * Re-encodes embedded images (JPEG and 8-bit RGB/Gray Flate images) at a lower quality and
 * resolution, then re-saves with object streams. Text and vectors stay intact.
 */
export async function compressPdf(ctx) {
  const sharp = require('sharp');
  const doc = await loadPdf(ctx.input);
  const level = ctx.options.level || 'recommended';
  const { quality, maxSide } = { low: { quality: 82, maxSide: 3000 }, recommended: { quality: 68, maxSide: 2000 }, extreme: { quality: 45, maxSide: 1300 } }[level] || { quality: 68, maxSide: 2000 };
  const objects = doc.context.enumerateIndirectObjects();
  let processed = 0;
  let saved = 0;
  for (const [ref, object] of objects) {
    processed += 1;
    if (processed % 20 === 0) ctx.progress(processed / objects.length * 0.9);
    if (!(object instanceof PDFRawStream)) continue;
    const dict = object.dict;
    if (dict.get(PDFName.of('Subtype')) !== PDFName.of('Image')) continue;
    if (dict.get(PDFName.of('ImageMask')) || dict.get(PDFName.of('Mask'))) continue;
    const filter = dict.get(PDFName.of('Filter'));
    const filterName = filter instanceof PDFName ? filter.asString() : null;
    const width = dict.get(PDFName.of('Width'))?.asNumber?.();
    const height = dict.get(PDFName.of('Height'))?.asNumber?.();
    const bits = dict.get(PDFName.of('BitsPerComponent'))?.asNumber?.();
    const colorSpace = dict.get(PDFName.of('ColorSpace'));
    const space = colorSpace instanceof PDFName ? colorSpace.asString() : null;
    if (!width || !height || width * height < 40_000) continue;
    try {
      let pipeline;
      if (filterName === '/DCTDecode') {
        pipeline = sharp(Buffer.from(object.contents), { failOn: 'none' });
        const meta = await pipeline.metadata();
        if (meta.space === 'cmyk') continue;
      } else if (filterName === '/FlateDecode' && bits === 8 && (space === '/DeviceRGB' || space === '/DeviceGray') && !dict.get(PDFName.of('DecodeParms')) && !dict.get(PDFName.of('SMask'))) {
        const raw = zlib.inflateSync(Buffer.from(object.contents));
        const channels = space === '/DeviceRGB' ? 3 : 1;
        if (raw.length !== width * height * channels) continue;
        pipeline = sharp(raw, { raw: { width, height, channels } });
      } else {
        continue;
      }
      const resized = pipeline.resize(maxSide, maxSide, { fit: 'inside', withoutEnlargement: true });
      const { data, info } = await resized.jpeg({ quality, mozjpeg: true }).toBuffer({ resolveWithObject: true });
      if (data.length >= object.contents.length * 0.95) continue;
      const newDict = dict.clone(doc.context);
      newDict.set(PDFName.of('Filter'), PDFName.of('DCTDecode'));
      newDict.delete(PDFName.of('DecodeParms'));
      newDict.set(PDFName.of('Width'), PDFNumber.of(info.width));
      newDict.set(PDFName.of('Height'), PDFNumber.of(info.height));
      newDict.set(PDFName.of('BitsPerComponent'), PDFNumber.of(8));
      newDict.set(PDFName.of('ColorSpace'), PDFName.of(info.channels === 1 ? 'DeviceGray' : 'DeviceRGB'));
      newDict.set(PDFName.of('Length'), PDFNumber.of(data.length));
      doc.context.assign(ref, PDFRawStream.of(newDict, data));
      saved += object.contents.length - data.length;
    } catch {
      // Leave images we cannot decode untouched.
    }
  }
  if (ctx.options.removeMetadata) {
    doc.setTitle(''); doc.setAuthor(''); doc.setSubject(''); doc.setKeywords([]); doc.setProducer('MeowConvert'); doc.setCreator('MeowConvert');
  }
  const bytes = await save(doc);
  const original = (await fs.stat(ctx.input)).size;
  if (bytes.length >= original && !saved) ctx.note('This PDF is already well optimized; the output is the smallest version possible.');
  const out = await ctx.output(`${ctx.stem} compressed.pdf`);
  await fs.writeFile(out, bytes.length < original ? bytes : await fs.readFile(ctx.input));
}

function hexToRgb(hex) {
  const value = /^#?([0-9a-f]{6})$/i.exec(hex)?.[1] || '888888';
  return rgb(parseInt(value.slice(0, 2), 16) / 255, parseInt(value.slice(2, 4), 16) / 255, parseInt(value.slice(4, 6), 16) / 255);
}

export async function pdfPageCount(file) {
  return (await loadPdf(file)).getPageCount();
}
