import fs from 'node:fs/promises';
import path from 'node:path';
import { require, escapeHtml } from './util.mjs';

const ENTITY = { nbsp: 160, amp: 38, lt: 60, gt: 62, quot: 34, apos: 39, copy: 169, reg: 174, trade: 8482, hellip: 8230, mdash: 8212, ndash: 8211, lsquo: 8216, rsquo: 8217, ldquo: 8220, rdquo: 8221, bull: 8226, middot: 183, deg: 176, euro: 8364, pound: 163, yen: 165, cent: 162, sect: 167, para: 182, laquo: 171, raquo: 187, times: 215, divide: 247, plusmn: 177, frac12: 189, frac14: 188, frac34: 190, shy: 173, zwj: 8205, zwnj: 8204, ensp: 8194, emsp: 8195, thinsp: 8201 };

export function decodeEntities(text) {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z][a-z0-9]*);/gi, (match, code) => {
    if (code[0] === '#') {
      const value = code[1] === 'x' || code[1] === 'X' ? parseInt(code.slice(2), 16) : Number(code.slice(1));
      return Number.isFinite(value) && value > 0 && value < 0x110000 ? String.fromCodePoint(value) : match;
    }
    const value = ENTITY[code.toLowerCase()];
    return value ? String.fromCodePoint(value) : match;
  });
}

export function htmlToText(html) {
  return decodeEntities(String(html)
    .replace(/<(script|style|head|title)[\s\S]*?<\/\1>/gi, '')
    // Source-formatting whitespace around table/list tags is not content.
    .replace(/\s+(<\/?(?:t[dhr]|tbody|thead|tfoot|table|li|ul|ol)\b[^>]*>)/gi, '$1')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<li[^>]*>/gi, '\n• ')
    .replace(/<\/t[dh]>/gi, '\t')
    .replace(/<\/tr>/gi, '\n')
    .replace(/<\/(p|div|h[1-6]|li|blockquote|pre|section|article|table|ul|ol|header|footer|figure)>/gi, '\n\n')
    .replace(/<hr[^>]*>/gi, '\n――――――――\n')
    .replace(/<[^>]+>/g, ''))
    .replace(/ /g, ' ')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n+(?=• )/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim() + '\n';
}

export function textToHtml(text) {
  return String(text).replace(/\r\n?/g, '\n').split(/\n{2,}/).map(block => `<p>${escapeHtml(block).replace(/\n/g, '<br>')}</p>`).join('\n');
}

function bodyOf(html) {
  const match = /<body[^>]*>([\s\S]*)<\/body>/i.exec(html);
  return match ? match[1] : html;
}

function titleOf(html, fallback) {
  const title = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1] || /<h1[^>]*>([\s\S]*?)<\/h1>/i.exec(html)?.[1];
  const text = title ? htmlToText(title).trim() : '';
  return text || fallback;
}

export const DOCUMENT_CSS = `
  @page { margin: 18mm 16mm; }
  html { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  body { font-family: 'Segoe UI', Calibri, Arial, sans-serif; font-size: 11.5pt; line-height: 1.55; color: #1d1d22; max-width: 900px; margin: 0 auto; padding: 0 8px; overflow-wrap: anywhere; }
  h1, h2, h3, h4 { line-height: 1.25; margin: 1.2em 0 .45em; break-after: avoid; }
  h1 { font-size: 22pt; } h2 { font-size: 17pt; } h3 { font-size: 14pt; }
  p { margin: .5em 0; } img, svg { max-width: 100%; height: auto; }
  table { border-collapse: collapse; margin: .8em 0; font-size: 10pt; } td, th { border: 1px solid #c9c9d2; padding: 4px 7px; vertical-align: top; } th { background: #f1f1f5; }
  td p, th p { margin: 0; } tr { break-inside: avoid; } pre, code { font-family: Consolas, 'Cascadia Mono', monospace; font-size: 9.5pt; } pre { background: #f5f5f8; padding: 10px 12px; border-radius: 6px; white-space: pre-wrap; }
  blockquote { margin: .8em 0; padding: .2em 1em; border-left: 3px solid #b9b3d8; color: #4a4a55; } .page-break { break-after: page; }
  a { color: #4b3fb5; }`;

export function wrapHtml(content, title) {
  return `<!doctype html>\n<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${escapeHtml(title)}</title><style>${DOCUMENT_CSS}</style></head><body>\n${content}\n</body></html>\n`;
}

/** Minimal RTF → text: handles groups, unicode escapes, hex escapes and common control words. */
export function rtfToText(rtf) {
  let output = '';
  const stack = [];
  let skip = false;
  let ucSkip = 1;
  let pendingSkip = 0;
  const destinations = new Set(['fonttbl', 'colortbl', 'stylesheet', 'info', 'pict', 'object', 'header', 'footer', 'headerl', 'headerr', 'footerl', 'footerr', 'listtable', 'listoverridetable', 'rsidtbl', 'generator', 'xmlnstbl', 'themedata', 'colorschememapping', 'latentstyles', 'datastore', 'mmathPr', 'pgdsctbl', 'revtbl']);
  for (let index = 0; index < rtf.length; index += 1) {
    const char = rtf[index];
    if (char === '{') { stack.push({ skip, ucSkip }); continue; }
    if (char === '}') { const state = stack.pop(); if (state) ({ skip, ucSkip } = state); continue; }
    if (char === '\\') {
      const next = rtf[index + 1];
      if (next === '\\' || next === '{' || next === '}') { if (!skip) output += next; index += 1; continue; }
      if (next === '\'') {
        const hex = rtf.slice(index + 2, index + 4);
        if (pendingSkip > 0) pendingSkip -= 1; else if (!skip) output += Buffer.from([parseInt(hex, 16)]).toString('latin1');
        index += 3; continue;
      }
      if (next === '*') { skip = true; index += 1; continue; }
      const match = /^([a-zA-Z]+)(-?\d+)? ?/.exec(rtf.slice(index + 1, index + 40));
      if (!match) { index += 1; continue; }
      index += match[0].length;
      const [, word, param] = match;
      if (destinations.has(word)) skip = true;
      else if (skip) continue;
      else if (word === 'par' || word === 'line' || word === 'sect') output += '\n';
      else if (word === 'tab' || word === 'cell') output += '\t';
      else if (word === 'row') output += '\n';
      else if (word === 'uc') ucSkip = Number(param) || 0;
      else if (word === 'u') { let code = Number(param); if (code < 0) code += 65536; output += String.fromCharCode(code); pendingSkip = ucSkip; }
      else if (word === 'emdash') output += '—';
      else if (word === 'endash') output += '–';
      else if (word === 'bullet') output += '•';
      else if (word === 'lquote') output += '‘';
      else if (word === 'rquote') output += '’';
      else if (word === 'ldblquote') output += '“';
      else if (word === 'rdblquote') output += '”';
      continue;
    }
    if (char === '\r' || char === '\n') continue;
    if (pendingSkip > 0) { pendingSkip -= 1; continue; }
    if (!skip) output += char;
  }
  return output.replace(/\n{3,}/g, '\n\n').trim() + '\n';
}

const MIME = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', svg: 'image/svg+xml', webp: 'image/webp' };

/** Reads an EPUB's spine into a single HTML string, inlining images. */
export async function epubToHtml(input) {
  const JSZip = require('jszip');
  const zip = await JSZip.loadAsync(await fs.readFile(input));
  const container = await zip.file('META-INF/container.xml')?.async('string');
  const opfPath = container && /full-path="([^"]+)"/.exec(container)?.[1];
  if (!opfPath) throw new Error('This EPUB is missing its package file.');
  const opf = await zip.file(opfPath).async('string');
  const base = opfPath.includes('/') ? opfPath.slice(0, opfPath.lastIndexOf('/') + 1) : '';
  const manifest = {};
  for (const [, tag] of opf.matchAll(/<(?:opf:)?item\b([^>]*)\/?>/g)) {
    const id = /\bid="([^"]+)"/.exec(tag)?.[1];
    const href = /\bhref="([^"]+)"/.exec(tag)?.[1];
    if (id && href) manifest[id] = decodeURIComponent(href);
  }
  const title = decodeEntities(/<dc:title[^>]*>([\s\S]*?)<\/dc:title>/.exec(opf)?.[1] || '').trim();
  const author = decodeEntities(/<dc:creator[^>]*>([\s\S]*?)<\/dc:creator>/.exec(opf)?.[1] || '').trim();
  const chapters = [];
  for (const [, idref] of opf.matchAll(/<(?:opf:)?itemref\b[^>]*idref="([^"]+)"/g)) {
    const href = manifest[idref];
    if (!href) continue;
    const chapterPath = path.posix.normalize(base + href);
    const file = zip.file(chapterPath);
    if (!file) continue;
    let body = bodyOf(await file.async('string'));
    const dir = chapterPath.includes('/') ? chapterPath.slice(0, chapterPath.lastIndexOf('/') + 1) : '';
    const images = [...body.matchAll(/(<img\b[^>]*?\bsrc=|<image\b[^>]*?\bxlink:href=)"([^"]+)"/g)];
    for (const [, , src] of images) {
      const imagePath = path.posix.normalize(dir + decodeURIComponent(src));
      const imageFile = zip.file(imagePath);
      if (!imageFile) continue;
      const ext = imagePath.split('.').pop().toLowerCase();
      const data = await imageFile.async('base64');
      body = body.split(`"${src}"`).join(`"data:${MIME[ext] || 'image/png'};base64,${data}"`);
    }
    body = body.replace(/<a\b[^>]*href="(?!https?:)[^"]*"[^>]*>/g, '<a>');
    chapters.push(body);
  }
  if (!chapters.length) throw new Error('No readable chapters were found in this EPUB.');
  const heading = title ? `<h1>${escapeHtml(title)}</h1>${author ? `<p><em>${escapeHtml(author)}</em></p>` : ''}<div class="page-break"></div>` : '';
  return { html: heading + chapters.join('\n<div class="page-break"></div>\n'), title };
}

const VOID = 'area|base|br|col|embed|hr|img|input|link|meta|source|track|wbr';

/** Normalises HTML into well-formed XHTML for EPUB chapters. */
function toXhtml(html) {
  return html
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(new RegExp(`<(${VOID})\\b([^>]*?)\\s*/?>`, 'gi'), (_, tag, attrs) => `<${tag.toLowerCase()}${attrs} />`)
    .replace(/&(?!#\d+;|#x[0-9a-f]+;|amp;|lt;|gt;|quot;|apos;)([a-z][a-z0-9]*;)?/gi, (match, name) => {
      if (!name) return '&amp;';
      const code = ENTITY[name.slice(0, -1).toLowerCase()];
      return code ? `&#${code};` : `&amp;${name}`;
    })
    .replace(/\s(checked|disabled|selected|hidden|controls|autoplay|loop|muted|open|required|readonly|multiple)(?=[\s/>])(?!=)/gi, ' $1="$1"');
}

/** Builds an EPUB 3 book; chapters split on <h1> (or <h2> when there are no h1s). */
export async function htmlToEpub(html, { title, author = 'MeowConvert', language = 'en' }) {
  const JSZip = require('jszip');
  const zip = new JSZip();
  zip.file('mimetype', 'application/epub+zip', { compression: 'STORE' });
  zip.file('META-INF/container.xml', '<?xml version="1.0" encoding="UTF-8"?><container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>');
  const images = [];
  let content = bodyOf(html).replace(/(<img\b[^>]*?\bsrc=)"data:(image\/[\w+.-]+);base64,([^"]+)"/gi, (_, prefix, mime, data) => {
    const ext = { 'image/jpeg': 'jpg', 'image/svg+xml': 'svg' }[mime] || mime.split('/')[1];
    const name = `images/img${images.length + 1}.${ext}`;
    images.push({ name, mime, data });
    return `${prefix}"${name}"`;
  });
  const splitTag = /<h1[\s>]/i.test(content) ? 'h1' : /<h2[\s>]/i.test(content) ? 'h2' : null;
  let parts = splitTag ? content.split(new RegExp(`(?=<${splitTag}[\\s>])`, 'i')) : [content];
  parts = parts.filter(part => htmlToText(part).trim() || /<img/i.test(part));
  if (!parts.length) parts = ['<p></p>'];
  const chapters = parts.map((part, index) => {
    const heading = splitTag && new RegExp(`<${splitTag}[^>]*>([\\s\\S]*?)</${splitTag}>`, 'i').exec(part)?.[1];
    const chapterTitle = heading ? htmlToText(heading).trim() : index === 0 ? title : `Section ${index + 1}`;
    return { file: `chapter${index + 1}.xhtml`, title: chapterTitle || `Section ${index + 1}`, body: toXhtml(part) };
  });
  const css = DOCUMENT_CSS.replace(/@page[^}]+}/, '');
  zip.file('OEBPS/style.css', css);
  for (const chapter of chapters) {
    zip.file(`OEBPS/${chapter.file}`, `<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE html>\n<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" lang="${language}"><head><meta charset="utf-8" /><title>${escapeHtml(chapter.title)}</title><link rel="stylesheet" href="style.css" /></head><body>\n${chapter.body}\n</body></html>`);
  }
  for (const image of images) zip.file(`OEBPS/${image.name}`, image.data, { base64: true });
  const nav = `<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE html>\n<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops"><head><meta charset="utf-8" /><title>Contents</title></head><body><nav epub:type="toc" id="toc"><h1>Contents</h1><ol>${chapters.map(chapter => `<li><a href="${chapter.file}">${escapeHtml(chapter.title)}</a></li>`).join('')}</ol></nav></body></html>`;
  zip.file('OEBPS/nav.xhtml', nav);
  const uid = `urn:uuid:${crypto.randomUUID()}`;
  const opf = `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="uid" xml:lang="${language}">
<metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:identifier id="uid">${uid}</dc:identifier><dc:title>${escapeHtml(title)}</dc:title><dc:creator>${escapeHtml(author)}</dc:creator><dc:language>${language}</dc:language><meta property="dcterms:modified">${new Date().toISOString().replace(/\.\d+Z$/, 'Z')}</meta></metadata>
<manifest><item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/><item id="css" href="style.css" media-type="text/css"/>${chapters.map((chapter, index) => `<item id="c${index + 1}" href="${chapter.file}" media-type="application/xhtml+xml"/>`).join('')}${images.map((image, index) => `<item id="i${index + 1}" href="${image.name}" media-type="${image.mime}"/>`).join('')}</manifest>
<spine>${chapters.map((_, index) => `<itemref idref="c${index + 1}"/>`).join('')}</spine>
</package>`;
  zip.file('OEBPS/content.opf', opf);
  return zip.generateAsync({ type: 'nodebuffer', mimeType: 'application/epub+zip', compression: 'DEFLATE', compressionOptions: { level: 9 } });
}

/** Loads any natively supported document as HTML. */
export async function readDocumentAsHtml(input, ext, ctx) {
  if (ctx?.htmlContent) return { html: ctx.htmlContent, title: ctx.stem };
  switch (ext) {
    case 'docx': case 'docm': case 'dotx': {
      const mammoth = require('mammoth');
      const result = await mammoth.convertToHtml({ path: input }, { styleMap: ['p[style-name=\'Title\'] => h1:fresh', 'p[style-name=\'Subtitle\'] => h2:fresh'] });
      return { html: result.value, title: titleOf(result.value, ctx.stem) };
    }
    case 'md': case 'markdown': {
      const { marked } = require('marked');
      const html = marked.parse(await fs.readFile(input, 'utf8'), { gfm: true, breaks: false });
      return { html, title: titleOf(html, ctx.stem) };
    }
    case 'txt': case 'text': case 'log':
      return { html: textToHtml(await readText(input)), title: ctx.stem };
    case 'html': case 'htm': case 'xhtml': {
      const html = await readText(input);
      return { html, title: titleOf(html, ctx.stem), isFullHtml: true };
    }
    case 'rtf':
      return { html: textToHtml(rtfToText(await fs.readFile(input, 'latin1'))), title: ctx.stem };
    case 'epub': {
      const { html, title } = await epubToHtml(input);
      return { html, title: title || ctx.stem };
    }
    default:
      throw new Error(`.${ext} documents need LibreOffice. Install it and MeowConvert will detect it automatically.`);
  }
}

async function readText(file) {
  const buffer = await fs.readFile(file);
  if (buffer[0] === 0xff && buffer[1] === 0xfe) return buffer.toString('utf16le').slice(1);
  if (buffer[0] === 0xfe && buffer[1] === 0xff) return Buffer.from(buffer).swap16().toString('utf16le').slice(1);
  const text = buffer.toString('utf8');
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

/** Writes HTML to the requested document format. */
export async function writeDocumentFromHtml(source, target, ctx) {
  const { html, title, isFullHtml } = source;
  const out = await ctx.output(`${ctx.stem}.${target === 'md' ? 'md' : target}`);
  const options = ctx.options;
  switch (target) {
    case 'pdf': {
      const full = isFullHtml ? html : wrapHtml(html, title);
      const pdf = await ctx.htmlToPdf(full, { pageSize: options.pageSize || 'A4', landscape: options.orientation === 'landscape', baseDir: isFullHtml ? path.dirname(ctx.input) : null, margins: options.margins });
      await fs.writeFile(out, pdf);
      break;
    }
    case 'docx': {
      const HTMLtoDOCX = require('html-to-docx');
      const content = isFullHtml ? bodyOf(html).replace(/<(script|style)[\s\S]*?<\/\1>/gi, '') : html;
      const buffer = await HTMLtoDOCX(`<!doctype html><html><body>${content}</body></html>`, null, { title, creator: 'MeowConvert', table: { row: { cantSplit: true } }, font: 'Calibri', fontSize: 22, footer: false, header: false, pageNumber: false });
      await fs.writeFile(out, buffer);
      break;
    }
    case 'html':
      await fs.writeFile(out, isFullHtml ? html : wrapHtml(html, title), 'utf8');
      break;
    case 'txt':
      await fs.writeFile(out, htmlToText(html), 'utf8');
      break;
    case 'md': {
      const TurndownService = require('turndown');
      const service = new TurndownService({ headingStyle: 'atx', codeBlockStyle: 'fenced', bulletListMarker: '-', emDelimiter: '*' });
      service.remove(['script', 'style', 'head', 'title']);
      service.addRule('tableCell', { filter: ['th', 'td'], replacement: content => ` ${content.replace(/\n+/g, ' ').trim()} |` });
      service.addRule('tableRow', { filter: 'tr', replacement: (content, node) => {
        let table = node.parentNode;
        while (table && table.nodeName !== 'TABLE') table = table.parentNode;
        const isHeader = table?.querySelector('tr') === node; // first row becomes the Markdown header
        const cells = [...node.childNodes].filter(child => /^(TD|TH)$/.test(child.nodeName)).length || 1;
        return `\n|${content}${isHeader ? `\n|${' --- |'.repeat(cells)}` : ''}`;
      } });
      service.addRule('table', { filter: 'table', replacement: content => `\n\n${content.trim()}\n\n` });
      await fs.writeFile(out, `${service.turndown(isFullHtml ? bodyOf(html) : html).trim()}\n`, 'utf8');
      break;
    }
    case 'epub':
      await fs.writeFile(out, await htmlToEpub(isFullHtml ? bodyOf(html) : html, { title: title || ctx.stem }));
      break;
    default:
      throw new Error(`Cannot write ${target.toUpperCase()} documents.`);
  }
}

export async function convertDocument(ctx, ext) {
  const source = await readDocumentAsHtml(ctx.input, ext, ctx);
  ctx.progress(0.5);
  await writeDocumentFromHtml(source, ctx.target, ctx);
}
