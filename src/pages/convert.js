// Home: a drop-focused converter. Empty → one big drop target. With files → queue grouped by category.
import { CATEGORIES, OUTPUTS, targetsFor, defaultTarget, missingEngineFor, acceptAttr } from '../../shared/formats.mjs';
import { icon, CATEGORY_ICONS } from '../ui/icons.js';
import { escapeHtml, toast, $ } from '../ui/dom.js';
import { rowHtml, paintProgress, bindRowActions, releaseEntry } from '../ui/rows.js';
import { renderOptions, bindOptions, defaultsFor } from '../ui/controls.js';
import { OPTION_DEFS } from '../core/options.js';
import { store, capabilities } from '../core/store.js';
import { toEntry, toPathEntry, siblingMap, pickFiles } from '../core/files.js';
import { runTasks, prepareOutput } from '../core/queue.js';
import { showFormatsSheet } from '../ui/formats-sheet.js';

const CATEGORY_ORDER = Object.keys(CATEGORIES);
const KIND_LABELS = { video: 'Video', animation: 'Animation', frames: 'Frames', audio: 'Audio', image: 'Image', document: 'Document', ebook: 'eBook', pdfimage: 'PDF pages', sheet: 'Spreadsheet', slides: 'Presentation', archive: 'Archive', font: 'Font', model: '3D' };

const state = {
  entries: [],
  options: Object.fromEntries(Object.entries(OPTION_DEFS).map(([cat, defs]) => [cat, defaultsFor(defs)])),
  optionTab: null,
  advancedOpen: false,
  running: false
};
let root;

export const badgeCount = () => state.entries.filter(entry => entry.status !== 'done').length;

export function addFiles(files, { fromPaths = false } = {}) {
  const caps = capabilities();
  const siblings = fromPaths ? new Map() : siblingMap(files);
  let unsupported = 0;
  const needs = new Set();
  for (const file of files) {
    const entry = fromPaths ? toPathEntry(file) : toEntry(file);
    if (!entry.category || ['mtl', 'bin'].includes(entry.ext)) { unsupported += !['mtl', 'bin'].includes(entry.ext); continue; }
    const target = defaultTarget(entry.ext, caps);
    if (!target) { needs.add(missingEngineFor(entry.ext)); unsupported += 1; continue; }
    entry.target = target;
    if (entry.category === 'model') entry.siblings = siblings;
    if (state.entries.some(existing => existing.path && existing.path === entry.path && existing.status === 'ready')) continue;
    state.entries.push(entry);
  }
  if (needs.has('libreoffice')) toast('Some files need LibreOffice (free). Install it and MeowConvert picks it up automatically — see Settings → Engines.', 'error');
  else if (needs.has('calibre')) toast('Kindle/FB2 eBooks need Calibre (free). See Settings → Engines.', 'error');
  else if (unsupported) toast(`${unsupported} file${unsupported === 1 ? ' is' : 's are'} not a supported format and ${unsupported === 1 ? 'was' : 'were'} skipped.`, 'error');
  render();
}

function groups() {
  const map = new Map();
  for (const entry of state.entries) {
    if (!map.has(entry.category)) map.set(entry.category, []);
    map.get(entry.category).push(entry);
  }
  return [...map.entries()].sort((a, b) => CATEGORY_ORDER.indexOf(a[0]) - CATEGORY_ORDER.indexOf(b[0]));
}

function targetSelect(targets, selected, attrs) {
  const byKind = new Map();
  for (const id of targets) {
    const kind = OUTPUTS[id].kind;
    if (!byKind.has(kind)) byKind.set(kind, []);
    byKind.get(kind).push(id);
  }
  const body = byKind.size === 1
    ? targets.map(id => `<option value="${id}" ${id === selected ? 'selected' : ''}>${escapeHtml(OUTPUTS[id].label)}</option>`).join('')
    : [...byKind.entries()].map(([kind, ids]) => `<optgroup label="${KIND_LABELS[kind] || kind}">${ids.map(id => `<option value="${id}" ${id === selected ? 'selected' : ''}>${escapeHtml(OUTPUTS[id].label)}</option>`).join('')}</optgroup>`).join('');
  const placeholder = selected ? '' : '<option value="" selected disabled>Choose…</option>';
  return `<div class="select-wrap"><select class="compact" ${attrs}>${placeholder}${body}</select></div>`;
}

function emptyView() {
  return `<div class="home-empty"><div class="dropzone glass" id="home-drop" tabindex="0" role="button" aria-label="Choose files to convert">
    <div class="drop-orb">${icon('upload', 46)}</div>
    <h2>Drop files to convert</h2>
    <p>Videos, audio, images, documents, eBooks, spreadsheets, archives, fonts and 3D models.</p>
    <div class="drop-actions"><button class="btn primary big" data-act="browse">${icon('plus', 19)} Choose files</button></div>
    <div class="cat-chips">${Object.entries(CATEGORIES).map(([id, cat]) => `<button class="cat-chip" data-formats="${id}" style="--c:${cat.color}"><i></i>${cat.label}</button>`).join('')}</div>
    <span class="offline-note">${icon('shield', 15)} Everything runs on this PC. Nothing is uploaded.</span>
  </div></div>`;
}

function queueView() {
  const caps = capabilities();
  const all = state.entries;
  const busy = all.some(entry => entry.status === 'running' || entry.status === 'queued');
  const pending = all.filter(entry => ['ready', 'error', 'cancelled'].includes(entry.status));
  const done = all.filter(entry => entry.status === 'done').length;
  const groupHtml = groups().map(([cat, entries]) => {
    const info = CATEGORIES[cat];
    const editable = entries.filter(entry => ['ready', 'error', 'cancelled'].includes(entry.status));
    let common = null;
    for (const entry of editable) {
      const targets = targetsFor(entry.ext, caps);
      common = common ? common.filter(id => targets.includes(id)) : targets;
    }
    const shared = editable.length && editable.every(entry => entry.target === editable[0].target) ? editable[0].target : '';
    const allTo = editable.length > 1 && common?.length ? `<label class="all-to">All to ${targetSelect(common, shared, `data-all="${cat}"`)}</label>` : '';
    return `<section class="group glass" style="--c:${info.color}">
      <div class="group-head"><div class="group-icon">${icon(CATEGORY_ICONS[cat], 19)}</div><div><h3>${info.label}</h3><small>${entries.length} file${entries.length === 1 ? '' : 's'}</small></div><div class="spacer"></div>${allTo}</div>
      <div class="rows">${entries.map(entry => rowHtml(entry, { targetHtml: `<span>to</span>${targetSelect(targetsFor(entry.ext, caps), entry.target, `data-target="${entry.id}"`)}` })).join('')}</div>
    </section>`;
  }).join('');
  return `
    <div class="queue-head">
      <div><h1>${all.length} file${all.length === 1 ? '' : 's'}</h1><span class="muted">${done ? `${done} converted · ` : ''}grouped by type</span></div>
      <div class="actions">
        <button class="btn" data-act="browse">${icon('plus', 17)} Add files</button>
        ${done ? `<button class="btn ghost" data-act="clear-done">${icon('check', 16)} Clear finished</button>` : ''}
        <button class="btn ghost" data-act="clear" ${busy ? 'disabled' : ''}>${icon('trash', 16)} Clear all</button>
      </div>
    </div>
    ${groupHtml}
    ${advancedView()}
    <div class="action-bar glass">
      <div class="where">${icon('folder', 18)}<span>${escapeHtml(outputLabel())}</span><button class="btn ghost" data-act="output">Change</button></div>
      ${busy ? `<button class="btn danger big" data-act="cancel-all">${icon('stop', 17)} Cancel</button>` : ''}
      <button class="btn primary big" data-act="convert" ${pending.length && !busy ? '' : 'disabled'}>${icon('sparkles', 19)} Convert${pending.length ? ` ${pending.length}` : ''}</button>
    </div>`;
}

function outputLabel() {
  const { outputMode, outputFolder } = store.settings;
  if (outputMode === 'folder') return `Saving to ${outputFolder}`;
  if (outputMode === 'ask') return 'You’ll choose a folder when converting';
  return 'Saving next to the original files';
}

function optionContext(cat) {
  const kinds = new Set(state.entries.filter(entry => entry.category === cat).map(entry => OUTPUTS[entry.target]?.kind));
  const targets = new Set(state.entries.filter(entry => entry.category === cat).map(entry => entry.target));
  return { animation: kinds.has('animation'), frames: kinds.has('frames'), pdf: targets.has('pdf'), svg: targets.has('svg') };
}

function advancedView() {
  const cats = groups().map(([cat]) => cat).filter(cat => OPTION_DEFS[cat]?.length);
  if (!cats.length) return '';
  if (!cats.includes(state.optionTab)) state.optionTab = cats[0];
  const cat = state.optionTab;
  return `<details class="advanced glass" ${state.advancedOpen ? 'open' : ''}>
    <summary>${icon('settings', 18)} Advanced settings <span class="faint">— optional, sensible defaults are already set</span>${icon('chevronDown', 18, 'chev')}</summary>
    ${cats.length > 1 ? `<div class="tabs">${cats.map(id => `<button data-tab="${id}" class="${id === cat ? 'active' : ''}">${CATEGORIES[id].label}</button>`).join('')}</div>` : ''}
    <div class="fields" id="adv-fields">${renderOptions(OPTION_DEFS[cat], state.options[cat], `adv-${cat}`, optionContext(cat))}</div>
  </details>`;
}

function bindAdvanced() {
  const details = $('.advanced', root);
  if (!details) return;
  details.addEventListener('toggle', () => { state.advancedOpen = details.open; });
  details.querySelectorAll('[data-tab]').forEach(button => button.addEventListener('click', () => { state.optionTab = button.dataset.tab; render(); }));
  const cat = state.optionTab;
  const container = $('#adv-fields', root);
  const bind = () => bindOptions(container, OPTION_DEFS[cat], state.options[cat], (_values, structural) => {
    if (!structural) return;
    container.innerHTML = renderOptions(OPTION_DEFS[cat], state.options[cat], `adv-${cat}`, optionContext(cat));
    bind();
  });
  bind();
}

export function render(container) {
  if (container) root = container;
  if (!root || !root.isConnected) return;
  root.innerHTML = `<div class="page">${state.entries.length ? queueView() : emptyView()}</div>`;
  bind();
  document.dispatchEvent(new CustomEvent('meow:badge'));
}

function bind() {
  root.querySelectorAll('[data-act="browse"]').forEach(button => button.addEventListener('click', async event => {
    event.stopPropagation();
    addFiles(await pickFiles({ accept: acceptAttr() }));
  }));
  const drop = $('#home-drop', root);
  drop?.addEventListener('click', async event => {
    if (event.target.closest('button')) return;
    addFiles(await pickFiles({ accept: acceptAttr() }));
  });
  drop?.addEventListener('keydown', async event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); addFiles(await pickFiles({ accept: acceptAttr() })); } });
  root.querySelectorAll('[data-formats]').forEach(chip => chip.addEventListener('click', event => { event.stopPropagation(); showFormatsSheet(chip.dataset.formats); }));
  root.querySelectorAll('[data-target]').forEach(select => select.addEventListener('change', () => {
    const entry = state.entries.find(item => item.id === select.dataset.target);
    if (!entry || !OUTPUTS[select.value]) return;
    entry.target = select.value;
    if (entry.status !== 'ready') { entry.status = 'ready'; entry.result = null; entry.progress = 0; }
    render();
  }));
  root.querySelectorAll('[data-all]').forEach(select => {
    select.addEventListener('change', () => {
      if (!OUTPUTS[select.value]) return;
      state.entries.filter(entry => entry.category === select.dataset.all && ['ready', 'error', 'cancelled'].includes(entry.status)).forEach(entry => { entry.target = select.value; });
      render();
    });
  });
  $('[data-act="clear"]', root)?.addEventListener('click', () => { state.entries.forEach(releaseEntry); state.entries = []; render(); });
  $('[data-act="clear-done"]', root)?.addEventListener('click', () => {
    state.entries.filter(entry => entry.status === 'done').forEach(releaseEntry);
    state.entries = state.entries.filter(entry => entry.status !== 'done');
    render();
  });
  $('[data-act="convert"]', root)?.addEventListener('click', convertAll);
  $('[data-act="cancel-all"]', root)?.addEventListener('click', () => {
    state.entries.forEach(entry => {
      if (entry.status === 'queued') { entry.status = 'cancelled'; if (entry.task) entry.task.status = 'cancelled'; }
      if (entry.status === 'running') entry.task?.controller?.abort();
    });
    render();
  });
  $('[data-act="output"]', root)?.addEventListener('click', () => document.dispatchEvent(new CustomEvent('meow:navigate', { detail: 'settings' })));
  const rows = root.querySelectorAll('.rows');
  rows.forEach(list => bindRowActions(list, id => state.entries.find(entry => entry.id === id), {
    remove: entry => { releaseEntry(entry); state.entries = state.entries.filter(item => item !== entry); render(); },
    refresh: render
  }));
  bindAdvanced();
}

async function convertAll() {
  const pending = state.entries.filter(entry => ['ready', 'error', 'cancelled'].includes(entry.status));
  if (!pending.length) return;
  if (!window.meow) { toast('Conversions run in the MeowConvert desktop app.', 'error'); return; }
  const output = await prepareOutput();
  if (!output) return;
  const tasks = pending.map(entry => {
    entry.status = 'queued';
    entry.progress = 0;
    entry.result = null;
    const options = { ...(state.options[entry.category] || {}) };
    const task = {
      label: entry.name,
      siblings: entry.siblings,
      spec: { entry, target: entry.target, options },
      onUpdate: (current, kind) => {
        entry.status = current.status;
        entry.progress = current.progress;
        entry.result = current.result;
        if (kind === 'progress') paintProgress(root, entry);
        else render();
      }
    };
    entry.task = task;
    return task;
  });
  render();
  const summary = await runTasks(tasks, { outToken: output.token });
  if (summary.failed) toast(`${summary.done} converted, ${summary.failed} failed. Hover a failed file to see why.`, 'error');
  else if (summary.done) toast(`${summary.done} file${summary.done === 1 ? '' : 's'} converted.`, 'success');
}

window.meow?.onOpenFiles(files => {
  addFiles(files, { fromPaths: true });
  document.dispatchEvent(new CustomEvent('meow:navigate', { detail: 'convert' }));
});
