import { CATEGORIES, OUTPUTS, VIDEO_IN, AUDIO_IN, IMAGE_IN, DOC_IN, EBOOK_IN, SHEET_IN, SLIDE_IN, ARCHIVE_IN, FONT_IN, MODEL_IN, targetsFor } from '../../shared/formats.mjs';
import { icon, CATEGORY_ICONS } from './icons.js';
import { capabilities } from '../core/store.js';

const INPUTS = { video: VIDEO_IN, audio: AUDIO_IN, image: IMAGE_IN, document: DOC_IN, ebook: EBOOK_IN, spreadsheet: SHEET_IN, presentation: SLIDE_IN, archive: ARCHIVE_IN, font: FONT_IN, model: MODEL_IN };
const NOTES = {
  document: 'DOC, ODT, WPS and WPD inputs plus DOC/ODT/RTF outputs use LibreOffice when it is installed.',
  ebook: 'MOBI, AZW3, FB2 and other Kindle formats use Calibre when it is installed. EPUB works out of the box.',
  presentation: 'Presentations are converted with LibreOffice when it is installed.'
};

/** Shows every supported input and output format, optionally scrolled to a category. */
export function showFormatsSheet(focus) {
  const caps = { libreoffice: true, calibre: true };
  const installed = capabilities();
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  const sections = Object.entries(CATEGORIES).map(([id, cat]) => {
    const outputs = new Set();
    INPUTS[id].forEach(ext => targetsFor(ext, caps).forEach(target => outputs.add(OUTPUTS[target].label)));
    const missing = (id === 'presentation' && !installed.libreoffice) || (id === 'ebook' && !installed.calibre) || (id === 'document' && !installed.libreoffice);
    return `<div class="format-cat" id="fmt-${id}" style="--c:${cat.color}">
      <h4><span style="color:${cat.color}">${icon(CATEGORY_ICONS[id], 17)}</span>${cat.label}</h4>
      <div class="list"><span class="faint">From</span>${INPUTS[id].map(ext => `<span>${ext.toUpperCase()}</span>`).join('')}</div>
      <div class="list" style="margin-top:6px"><span class="faint">To</span>${[...outputs].map(label => `<span>${label}</span>`).join('')}</div>
      ${NOTES[id] && missing ? `<div class="notice" style="margin-top:10px">${icon('info', 16)}<span>${NOTES[id]}</span></div>` : ''}
    </div>`;
  }).join('');
  overlay.innerHTML = `<div class="modal sheet glass" role="dialog" aria-modal="true" aria-label="Supported formats">
    <div style="display:flex;justify-content:space-between;align-items:center"><div><h3>Supported formats</h3><span class="muted">All conversions run offline on this PC.</span></div><button class="icon-btn" data-close aria-label="Close">${icon('x', 18)}</button></div>
    ${sections}</div>`;
  const close = () => { overlay.classList.remove('visible'); setTimeout(() => overlay.remove(), 200); document.removeEventListener('keydown', onKey); };
  const onKey = event => { if (event.key === 'Escape') close(); };
  overlay.addEventListener('click', event => { if (event.target === overlay || event.target.closest('[data-close]')) close(); });
  document.addEventListener('keydown', onKey);
  document.body.append(overlay);
  requestAnimationFrame(() => {
    overlay.classList.add('visible');
    if (focus) overlay.querySelector(`#fmt-${focus}`)?.scrollIntoView({ block: 'start' });
  });
}
