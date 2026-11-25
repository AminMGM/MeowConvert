// PDF rendering and text extraction with pdf.js (runs in the app window: needs canvas).
import * as pdfjs from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
const assetBase = new URL('./pdfjs/', document.baseURI).href;

// pdf.js v6: documents are released through their loading task.
async function openPdf(bytes) {
  const task = pdfjs.getDocument({ data: bytes, cMapUrl: `${assetBase}cmaps/`, cMapPacked: true, standardFontDataUrl: `${assetBase}standard_fonts/`, isEvalSupported: false });
  try {
    const doc = await task.promise;
    doc.release = () => task.destroy();
    return doc;
  } catch (error) {
    task.destroy();
    if (error?.name === 'PasswordException') throw new Error('This PDF is password protected.');
    throw new Error(`Could not open the PDF (${error.message}).`);
  }
}

function parseRange(spec, count) {
  const text = String(spec || '').trim();
  if (!text || text === 'all') return [...Array(count).keys()].map(index => index + 1);
  const pages = new Set();
  for (const part of text.split(/[,;\s]+/).filter(Boolean)) {
    const match = /^(\d*)-(\d*)$/.exec(part);
    if (match) {
      for (let page = Number(match[1] || 1); page <= Math.min(Number(match[2] || count), count); page += 1) pages.add(page);
    } else if (Number(part) >= 1 && Number(part) <= count) pages.add(Number(part));
  }
  if (!pages.size) throw new Error('The page range does not match any page.');
  return [...pages].sort((a, b) => a - b);
}

/** Renders pages to PNG/JPG/WEBP. write(name, bytes) saves each page. */
export async function pdfToImages(bytes, { format = 'png', dpi = 150, quality = 90, pages: range = 'all', stem }, write, onProgress, signal) {
  const doc = await openPdf(bytes);
  try {
    const pages = parseRange(range, doc.numPages);
    const mime = { png: 'image/png', jpg: 'image/jpeg', webp: 'image/webp' }[format];
    const scale = Math.max(0.5, Math.min(6, Number(dpi) / 72));
    for (let index = 0; index < pages.length; index += 1) {
      if (signal?.aborted) throw Object.assign(new Error('Cancelled'), { cancelled: true });
      const page = await doc.getPage(pages[index]);
      const viewport = page.getViewport({ scale });
      const maxSide = 12000;
      const fit = Math.min(1, maxSide / Math.max(viewport.width, viewport.height));
      const finalViewport = fit < 1 ? page.getViewport({ scale: scale * fit }) : viewport;
      const canvas = new OffscreenCanvas(Math.ceil(finalViewport.width), Math.ceil(finalViewport.height));
      const context = canvas.getContext('2d', { alpha: format === 'png' });
      if (format !== 'png') { context.fillStyle = '#fff'; context.fillRect(0, 0, canvas.width, canvas.height); }
      await page.render({ canvasContext: context, viewport: finalViewport, background: format === 'png' ? 'rgba(0,0,0,0)' : '#ffffff' }).promise;
      const blob = await canvas.convertToBlob({ type: mime, quality: Number(quality) / 100 });
      await write(`${stem} page ${String(pages[index]).padStart(String(doc.numPages).length, '0')}.${format}`, new Uint8Array(await blob.arrayBuffer()));
      page.cleanup();
      onProgress((index + 1) / pages.length);
    }
  } finally {
    await doc.release();
  }
}

/** Extracts text into simple semantic HTML (paragraphs, headings by font size, page breaks). */
export async function pdfToHtml(bytes, onProgress, signal) {
  const doc = await openPdf(bytes);
  try {
    const parts = [];
    let scanned = 0;
    for (let number = 1; number <= doc.numPages; number += 1) {
      if (signal?.aborted) throw Object.assign(new Error('Cancelled'), { cancelled: true });
      const page = await doc.getPage(number);
      const content = await page.getTextContent();
      const lines = [];
      for (const item of content.items) {
        if (!('str' in item)) continue;
        const y = Math.round(item.transform[5]);
        const size = Math.round(Math.hypot(item.transform[2], item.transform[3]));
        const last = lines.at(-1);
        if (last && Math.abs(last.y - y) <= Math.max(2, size * 0.3)) {
          last.text += (last.text && !last.text.endsWith(' ') && item.str && !item.str.startsWith(' ') && item.transform[4] - last.endX > size * 0.15 ? ' ' : '') + item.str;
          last.endX = item.transform[4] + item.width;
          last.size = Math.max(last.size, size);
        } else {
          lines.push({ y, size, text: item.str, endX: item.transform[4] + item.width, gap: last ? last.y - y : 0 });
        }
        if (item.hasEOL && lines.at(-1)) lines.at(-1).eol = true;
      }
      const sizes = lines.map(line => line.size).sort((a, b) => a - b);
      const body = sizes[Math.floor(sizes.length / 2)] || 11;
      let paragraph = [];
      const flush = () => {
        if (paragraph.length) parts.push(`<p>${escape(paragraph.join(' ').replace(/-\s+(?=[a-z])/g, ''))}</p>`);
        paragraph = [];
      };
      for (const line of lines) {
        const text = line.text.trim();
        if (!text) { flush(); continue; }
        if (line.size >= body * 1.45 && text.length < 120) { flush(); parts.push(`<h${line.size >= body * 1.9 ? 1 : 2}>${escape(text)}</h${line.size >= body * 1.9 ? 1 : 2}>`); continue; }
        if (line.gap > line.size * 1.9) flush();
        paragraph.push(text);
      }
      flush();
      if (lines.length) scanned += 1;
      if (number < doc.numPages) parts.push('<div class="page-break"></div>');
      page.cleanup();
      onProgress(number / doc.numPages * 0.6);
    }
    if (!scanned) throw new Error('This PDF has no selectable text (it is probably scanned images). Convert it to images instead.');
    return parts.join('\n');
  } finally {
    await doc.release();
  }
}

export async function pdfPageCount(bytes) {
  const doc = await openPdf(bytes);
  const count = doc.numPages;
  await doc.release();
  return count;
}

function escape(text) {
  return text.replace(/[&<>]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[char]);
}
