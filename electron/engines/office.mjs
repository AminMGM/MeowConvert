// Optional external engines: LibreOffice (legacy Office/OpenDocument formats) and Calibre (Kindle/FB2 ebooks).
// They are large, so they are detected rather than bundled.
import fs from 'node:fs/promises';
import fssync from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { run, stemOf } from './util.mjs';
import { readDocumentAsHtml, writeDocumentFromHtml } from './document.mjs';

const programDirs = [process.env.ProgramFiles, process.env['ProgramFiles(x86)'], process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, 'Programs')].filter(Boolean);

function firstExisting(candidates) {
  return candidates.find(candidate => candidate && fssync.existsSync(candidate)) || null;
}

export function findLibreOffice(custom) {
  const fromCustom = custom && (custom.toLowerCase().endsWith('.exe') ? custom : path.join(custom, 'program', 'soffice.com'));
  const found = firstExisting([fromCustom, ...programDirs.flatMap(dir => [path.join(dir, 'LibreOffice', 'program', 'soffice.com'), path.join(dir, 'LibreOffice', 'program', 'soffice.exe')])]);
  // soffice.com waits for the conversion to finish; soffice.exe may return immediately.
  if (found?.toLowerCase().endsWith('soffice.exe')) {
    const console = found.slice(0, -4) + '.com';
    if (fssync.existsSync(console)) return console;
  }
  return found;
}

export function findCalibre(custom) {
  const fromCustom = custom && (custom.toLowerCase().endsWith('.exe') ? custom : path.join(custom, 'ebook-convert.exe'));
  return firstExisting([fromCustom, ...programDirs.flatMap(dir => [path.join(dir, 'Calibre2', 'ebook-convert.exe'), path.join(dir, 'Calibre', 'ebook-convert.exe')])]);
}

const LO_FILTERS = {
  pdf: 'pdf', docx: 'docx:"MS Word 2007 XML"', doc: 'doc:"MS Word 97"', odt: 'odt', rtf: 'rtf', txt: 'txt:Text (encoded):UTF8', html: 'html',
  pptx: 'pptx:"Impress MS PowerPoint 2007 XML"', ppt: 'ppt:"MS PowerPoint 97"', odp: 'odp', xlsx: 'xlsx:"Calc MS Excel 2007 XML"', xls: 'xls:"MS Excel 97"', ods: 'ods'
};

async function libreOfficeTo(ctx, soffice, input, ext) {
  const temp = await ctx.tempDir();
  const profile = path.join(temp, 'profile');
  const outDir = path.join(temp, 'out');
  await fs.mkdir(outDir, { recursive: true });
  await run(soffice, [`-env:UserInstallation=${pathToFileURL(profile).href}`, '--headless', '--norestore', '--nolockcheck', '--nodefault', '--nologo', '--convert-to', LO_FILTERS[ext], '--outdir', outDir, input], { signal: ctx.signal });
  const produced = (await fs.readdir(outDir)).find(name => name.toLowerCase().endsWith(`.${ext}`));
  if (!produced) throw new Error('LibreOffice could not convert this file.');
  return path.join(outDir, produced);
}

export async function convertWithLibreOffice(ctx, settings) {
  const soffice = findLibreOffice(settings.libreOfficePath);
  if (!soffice) throw new Error('This conversion needs LibreOffice. Install it (free) and MeowConvert will detect it automatically.');
  const { target } = ctx;
  ctx.progress(0.1);
  if (LO_FILTERS[target]) {
    const produced = await libreOfficeTo(ctx, soffice, ctx.input, target);
    await fs.copyFile(produced, await ctx.output(`${ctx.stem}.${target}`));
    return;
  }
  // Markdown/EPUB: let LibreOffice produce DOCX, then finish natively.
  const docx = await libreOfficeTo(ctx, soffice, ctx.input, 'docx');
  ctx.progress(0.6);
  const source = await readDocumentAsHtml(docx, 'docx', { ...ctx, htmlContent: null, stem: stemOf(ctx.input) });
  await writeDocumentFromHtml(source, target, ctx);
}

export async function convertWithCalibre(ctx, settings) {
  const calibre = findCalibre(settings.calibrePath);
  if (!calibre) throw new Error('This eBook format needs Calibre. Install it (free) and MeowConvert will detect it automatically.');
  const temp = await ctx.tempDir();
  const ext = ctx.target === 'md' ? 'txt' : ctx.target;
  const staged = path.join(temp, `${stemOf(ctx.input)}.${ext}`);
  await run(calibre, [ctx.input, staged, ...(ctx.target === 'md' ? ['--txt-output-formatting', 'markdown'] : [])], {
    signal: ctx.signal,
    onStdout: chunk => {
      const match = /(\d{1,3})%/.exec(chunk);
      if (match) ctx.progress(Number(match[1]) / 100);
    }
  });
  await fs.copyFile(staged, await ctx.output(`${ctx.stem}.${ctx.target}`));
}
