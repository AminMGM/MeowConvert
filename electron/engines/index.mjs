import fs from 'node:fs/promises';
import path from 'node:path';
import { OUTPUTS, categoryOf, extOf, LIBREOFFICE_DOC_IN } from '../../shared/formats.mjs';
import { reservePath, makeTempDir, removeQuietly, stemOf, fileSize, sanitizeFileName, CancelledError } from './util.mjs';
import { convertMedia, mergeMedia, imagesToAnimation } from './media.mjs';
import { convertImage } from './image.mjs';
import { convertDocument, writeDocumentFromHtml } from './document.mjs';
import { convertSheet } from './sheet.mjs';
import { convertArchive, extractTool, createTool } from './archive.mjs';
import { convertFont } from './font.mjs';
import { convertWithLibreOffice, convertWithCalibre } from './office.mjs';
import * as pdf from './pdf.mjs';

const NATIVE_DOC_TARGETS = new Set(['pdf', 'docx', 'html', 'txt', 'md', 'epub']);
const CALIBRE_TARGETS = new Set(['mobi', 'azw3', 'fb2']);

const TOOLS = {
  'media-merge': ctx => mergeMedia(ctx),
  'audio-merge': ctx => mergeMedia({ ...ctx, mode: 'audio' }),
  'images-animation': ctx => imagesToAnimation(ctx),
  'images-pdf': ctx => pdf.imagesToPdfTool(ctx),
  'pdf-merge': ctx => pdf.mergePdf(ctx),
  'pdf-split': ctx => pdf.splitPdf(ctx),
  'pdf-organize': ctx => pdf.organizePdf(ctx),
  'pdf-rotate': ctx => pdf.rotatePdf(ctx),
  'pdf-compress': ctx => pdf.compressPdf(ctx),
  'pdf-watermark': ctx => pdf.watermarkPdf(ctx),
  'pdf-number': ctx => pdf.numberPdf(ctx),
  'archive-extract': ctx => extractTool(ctx, extOf(ctx.input)),
  'archive-create': ctx => createTool(ctx)
};

async function route(ctx) {
  if (ctx.tool) {
    const tool = TOOLS[ctx.tool];
    if (!tool) throw new Error(`Unknown tool ${ctx.tool}.`);
    return tool(ctx);
  }
  const ext = extOf(ctx.input);
  const category = categoryOf(ext);
  const output = OUTPUTS[ctx.target];
  if (!output) throw new Error('Choose an output format.');
  switch (category) {
    case 'video':
    case 'audio':
      return convertMedia(ctx);
    case 'image':
      return ['video', 'animation'].includes(output.kind) ? convertMedia(ctx) : convertImage(ctx);
    case 'document':
      if (CALIBRE_TARGETS.has(ctx.target)) return convertWithCalibre(ctx, ctx.settings);
      if (ext === 'pdf') {
        if (!ctx.htmlContent) throw new Error('PDF text is extracted by the app window; retry the conversion.');
        return writeDocumentFromHtml({ html: ctx.htmlContent, title: ctx.stem }, ctx.target, ctx);
      }
      if (LIBREOFFICE_DOC_IN.has(ext) && !(ext === 'rtf' && NATIVE_DOC_TARGETS.has(ctx.target))) return convertWithLibreOffice(ctx, ctx.settings);
      if (!NATIVE_DOC_TARGETS.has(ctx.target)) return convertWithLibreOffice(ctx, ctx.settings);
      return convertDocument(ctx, ext);
    case 'ebook':
      if (ext === 'epub' && NATIVE_DOC_TARGETS.has(ctx.target)) return convertDocument(ctx, 'epub');
      return convertWithCalibre(ctx, ctx.settings);
    case 'spreadsheet':
      return convertSheet(ctx, ext);
    case 'presentation':
      return convertWithLibreOffice(ctx, ctx.settings);
    case 'archive':
      return convertArchive(ctx, ext);
    case 'font':
      return convertFont(ctx, ext);
    default:
      throw new Error(`.${ext || 'unknown'} files are not supported.`);
  }
}

/**
 * Runs one job. env: { settings, outDir, signal, onProgress, htmlToPdf, overwrite }
 * Returns { outputs: [{ path, size, isFolder }], notes, inputSize }.
 */
export async function runJob(job, env) {
  const inputs = job.inputs?.length ? job.inputs : [job.input];
  for (const input of inputs) {
    try {
      const stat = await fs.stat(input);
      if (!stat.isFile() && !(job.tool === 'archive-create' && stat.isDirectory())) throw new Error();
    } catch {
      throw new Error(`Cannot read ${path.basename(input || 'file')}. It may have been moved or deleted.`);
    }
  }
  const outDir = env.outDir || path.dirname(inputs[0]);
  await fs.mkdir(outDir, { recursive: true });
  const suffix = env.settings.fileSuffix ? sanitizeFileName(env.settings.fileSuffix) : '';
  const created = [];
  const temps = [];
  const reservations = [];
  const notes = [];
  let lastProgress = 0;
  const inputSet = new Set(inputs.map(input => path.resolve(input).toLowerCase()));

  const ctx = {
    input: inputs[0],
    inputs,
    target: job.target,
    tool: job.tool,
    options: job.options || {},
    settings: env.settings,
    signal: env.signal,
    htmlContent: job.htmlContent || null,
    stem: stemOf(job.baseName || inputs[0]),
    htmlToPdf: env.htmlToPdf,
    progress(value) {
      const clamped = Math.max(lastProgress, Math.min(1, value));
      if (clamped - lastProgress >= 0.005 || clamped === 1) {
        lastProgress = clamped;
        env.onProgress?.(clamped);
      }
    },
    note(message) {
      if (!notes.includes(message)) notes.push(message);
    },
    async output(fileName) {
      const [base, ext] = splitExt(fileName);
      const reservation = await reservePath(outDir, `${base}${suffix}${ext}`, { overwrite: env.settings.conflict === 'overwrite' });
      if (inputSet.has(path.resolve(reservation.path).toLowerCase())) {
        reservation.release();
        const safe = await reservePath(outDir, `${base}${suffix || ' converted'}${ext}`);
        reservations.push(safe);
        created.push({ path: safe.path });
        return safe.path;
      }
      reservations.push(reservation);
      created.push({ path: reservation.path });
      return reservation.path;
    },
    async outputFolder(name) {
      const reservation = await reservePath(outDir, `${name}${suffix}`);
      reservations.push(reservation);
      await fs.mkdir(reservation.path, { recursive: true });
      created.push({ path: reservation.path, isFolder: true });
      return reservation.path;
    },
    async tempDir() {
      const dir = await makeTempDir();
      temps.push(dir);
      return dir;
    }
  };

  try {
    await route(ctx);
    if (env.signal?.aborted) throw new CancelledError();
    const outputs = [];
    for (const item of created) {
      try {
        const stat = await fs.stat(item.path);
        if (item.isFolder) {
          const files = await fs.readdir(item.path);
          if (!files.length) throw new Error('No files were produced.');
          let size = 0;
          for (const file of files) size += fileSize(path.join(item.path, file));
          outputs.push({ path: item.path, size, isFolder: true, count: files.length });
        } else if (stat.size > 0) {
          outputs.push({ path: item.path, size: stat.size });
        }
      } catch (error) {
        if (error.message === 'No files were produced.') throw error;
      }
    }
    if (!outputs.length) throw new Error('The conversion produced no output.');
    const inputSize = inputs.reduce((sum, input) => sum + fileSize(input), 0);
    return { outputs, notes, inputSize };
  } catch (error) {
    for (const item of created) await removeQuietly(item.path);
    throw error;
  } finally {
    reservations.forEach(reservation => reservation.release());
    for (const dir of temps) await removeQuietly(dir);
  }
}

function splitExt(fileName) {
  const match = /^(.*?)((?:\.tar)?\.[^.]+)$/i.exec(fileName);
  return match ? [match[1], match[2]] : [fileName, ''];
}
