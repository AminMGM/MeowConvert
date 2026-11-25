import fs from 'node:fs/promises';
import fssync from 'node:fs';
import path from 'node:path';
import { run, sevenZipPath, bsdtarPath, stemOf } from './util.mjs';

const SEVEN_ZIP_NATIVE = new Set(['zip', '7z', 'jar']);
const SINGLE_STREAM = new Set(['gz', 'bz2', 'xz']);

function sevenZipProgress(ctx, from = 0, to = 1) {
  return chunk => {
    const match = /(\d{1,3})%/.exec(chunk);
    if (match) ctx.progress(from + (to - from) * Number(match[1]) / 100);
  };
}

/** Extracts any supported archive into `dir`. Uses 7-Zip, then Windows' libarchive (RAR, ISO, CAB…). */
export async function extractArchive(ctx, input, dir, ext, password = '') {
  await fs.mkdir(dir, { recursive: true });
  const useSevenZip = SEVEN_ZIP_NATIVE.has(ext) || (SINGLE_STREAM.has(ext) && !/\.tar\.\w+$/i.test(input));
  if (useSevenZip) {
    await run(sevenZipPath, ['x', '-y', '-bsp1', `-o${dir}`, `-p${password}`, input], { signal: ctx.signal, onStdout: sevenZipProgress(ctx, 0, 0.5) })
      .catch(error => {
        if (/wrong password|encrypted/i.test(error.stderr || error.message)) throw new Error(password ? 'Wrong archive password.' : 'This archive is password protected. Enter its password in the options.');
        throw error;
      });
    return;
  }
  if (!fssync.existsSync(bsdtarPath)) throw new Error('Extracting this archive type needs Windows 10 (1803) or newer.');
  const args = ['-x', '-f', input, '-C', dir];
  if (password) args.unshift('--passphrase', password);
  await run(bsdtarPath, args, { signal: ctx.signal });
}

/** Creates an archive from the entries (files/folders) in `sources`. */
export async function createArchive(ctx, sources, out, format, { level = 5, password = '' } = {}) {
  if (format === 'zip' || format === '7z' || format === 'tar') {
    const args = ['a', '-y', '-bsp1', `-t${format}`, out, ...sources];
    if (format !== 'tar') args.splice(3, 0, `-mx=${level}`);
    if (password && format !== 'tar') {
      args.splice(3, 0, `-p${password}`);
      if (format === '7z') args.splice(3, 0, '-mhe=on');
      else args.splice(3, 0, '-mem=AES256');
    }
    await run(sevenZipPath, args, { signal: ctx.signal, onStdout: sevenZipProgress(ctx, 0.5, 1) });
    return;
  }
  const flag = { 'tar.gz': '-z', 'tar.bz2': '-j', 'tar.xz': '-J', 'tar.zst': '--zstd' }[format];
  if (!flag) throw new Error(`Unsupported archive format ${format}.`);
  const args = ['-c', flag, '-f', out];
  for (const source of sources) args.push('-C', path.dirname(source), path.basename(source));
  await run(bsdtarPath, args, { signal: ctx.signal });
}

export async function convertArchive(ctx, ext) {
  const temp = await ctx.tempDir();
  const contents = path.join(temp, 'contents');
  await extractArchive(ctx, ctx.input, contents, ext, ctx.options.password || '');
  // A single-stream .gz/.bz2/.xz wrapping a .tar: unpack the inner tar too.
  const entries = await fs.readdir(contents);
  if (entries.length === 1 && entries[0].toLowerCase().endsWith('.tar')) {
    const inner = path.join(contents, entries[0]);
    const unpacked = path.join(temp, 'inner');
    await extractArchive(ctx, inner, unpacked, 'tar');
    return pack(ctx, unpacked);
  }
  return pack(ctx, contents);
}

async function pack(ctx, folder) {
  const entries = (await fs.readdir(folder)).map(entry => path.join(folder, entry));
  if (!entries.length) throw new Error('The archive is empty.');
  const out = await ctx.output(`${ctx.stem}.${ctx.target}`);
  await fs.rm(out, { force: true });
  await createArchive(ctx, entries, out, ctx.target, { level: Number(ctx.options.level ?? 5), password: ctx.options.newPassword || '' });
}

/** Tool: extract archives into a folder next to them (or the output folder). */
export async function extractTool(ctx, ext) {
  const folder = await ctx.outputFolder(stemOf(ctx.input));
  await extractArchive(ctx, ctx.input, folder, ext, ctx.options.password || '');
}

/** Tool: compress many files/folders into one archive. */
export async function createTool(ctx) {
  const format = ctx.options.format || 'zip';
  const out = await ctx.output(`${ctx.options.name ? stemOf(ctx.options.name) : ctx.stem}.${format}`);
  await fs.rm(out, { force: true });
  await createArchive(ctx, ctx.inputs, out, format, { level: Number(ctx.options.level ?? 5), password: ctx.options.password || '' });
}
