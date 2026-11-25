import { CATEGORIES, categoryOf } from '../../shared/formats.mjs';
import { TOOLS, TOOL_GROUPS, toolById, toolAccepts } from '../core/tools.js';
import { icon } from '../ui/icons.js';
import { escapeHtml, toast, $, formatDuration } from '../ui/dom.js';
import { renderOptions, bindOptions, defaultsFor } from '../ui/controls.js';
import { rowHtml, paintProgress, bindRowActions, releaseEntry } from '../ui/rows.js';
import { toEntry, pickFiles } from '../core/files.js';
import { runTasks, prepareOutput } from '../core/queue.js';
import { renderUnits } from './units.js';

const GROUP_COLORS = { video: CATEGORIES.video.color, audio: CATEGORIES.audio.color, image: CATEGORIES.image.color, pdf: '#ff6b6b', archive: CATEGORIES.archive.color, more: '#7dd3fc' };
const state = { toolId: null, query: '', entries: [], values: {} };
let root;

export function render(container) {
  if (container) root = container;
  if (!root?.isConnected) return;
  const tool = state.toolId && toolById(state.toolId);
  root.innerHTML = `<div class="page">${tool ? toolView(tool) : catalogView()}</div>`;
  if (tool) bindTool(tool);
  else bindCatalog();
}

export function openTool(id) {
  if (state.toolId !== id) { state.entries.forEach(releaseEntry); state.entries = []; }
  state.toolId = id;
  render();
}

/** Files dropped anywhere while a tool is open go to that tool. Returns true if handled. */
export function acceptDrop(files) {
  const tool = state.toolId && toolById(state.toolId);
  if (!tool || tool.special) return false;
  addFiles(tool, files);
  return true;
}

function catalogView() {
  const query = state.query.trim().toLowerCase();
  const matches = TOOLS.filter(tool => !query || `${tool.name} ${tool.desc} ${tool.group}`.toLowerCase().includes(query));
  const groups = TOOL_GROUPS.map(group => {
    const tools = matches.filter(tool => tool.group === group.id);
    if (!tools.length) return '';
    return `<section class="tool-group"><h2>${icon(group.icon, 16)} ${group.label}</h2><div class="tool-grid">${tools.map(tool => `
      <button class="tool-card glass" data-tool="${tool.id}" style="--c:${GROUP_COLORS[tool.group]}">
        <span class="t-icon">${icon(tool.icon, 21)}</span><b>${escapeHtml(tool.name)}</b><small>${escapeHtml(tool.desc)}</small>
      </button>`).join('')}</div></section>`;
  }).join('');
  return `<div class="page-head"><div><h1>Tools</h1><p>Compress, trim, merge, split and more. Everything runs offline.</p></div>
    <label class="tool-search">${icon('search', 18)}<input type="search" id="tool-search" placeholder="Search tools…" value="${escapeHtml(state.query)}" /></label></div>
    ${groups || '<div class="empty glass">No tools match your search.</div>'}`;
}

function bindCatalog() {
  root.querySelectorAll('[data-tool]').forEach(card => card.addEventListener('click', () => openTool(card.dataset.tool)));
  const search = $('#tool-search', root);
  search.addEventListener('input', () => {
    state.query = search.value;
    const position = search.selectionStart;
    render();
    const next = $('#tool-search', root);
    next.focus();
    next.setSelectionRange(position, position);
  });
}

function acceptLabel(tool) {
  if (tool.accept === '*') return 'any files';
  const exts = tool.accept;
  return exts.length > 8 ? `${exts.slice(0, 7).map(ext => ext.toUpperCase()).join(', ')} and more` : exts.map(ext => ext.toUpperCase()).join(', ');
}

function toolView(tool) {
  if (!state.values[tool.id]) state.values[tool.id] = defaultsFor(tool.options || []);
  const head = `<div class="tool-view-head"><button class="icon-btn" data-act="back" title="All tools">${icon('chevronLeft', 20)}</button>
    <div><h1>${escapeHtml(tool.name)}</h1><p>${escapeHtml(tool.desc)}</p></div></div>`;
  if (tool.special === 'units') return head + renderUnits();
  const entries = state.entries;
  const busy = entries.some(entry => entry.status === 'running' || entry.status === 'queued');
  const pending = entries.filter(entry => ['ready', 'error', 'cancelled'].includes(entry.status));
  const runnable = tool.combine ? pending.length >= (tool.min || 1) && !busy : pending.length && !busy;
  const previewEntry = tool.preview === 'media' && entries.length === 1 ? entries[0] : null;
  const files = entries.length
    ? `${previewEntry ? mediaPreview(previewEntry) : ''}<div class="rows">${entries.map((entry, index) => rowHtml(entry, { reorder: Boolean(tool.combine), index, count: entries.length })).join('')}</div>
       <div style="display:flex;justify-content:center;padding:10px"><button class="btn ghost" data-act="browse">${icon('plus', 16)} Add ${tool.combine ? 'more' : 'files'}</button></div>`
    : `<div class="mini-drop" data-act="browse" role="button" tabindex="0">${icon('upload', 30)}<b>Drop files here</b><span>${escapeHtml(acceptLabel(tool))}${tool.combine ? ` · at least ${tool.min || 1}` : ''}</span><button class="btn primary">${icon('plus', 17)} Choose files</button></div>`;
  return `${head}<div class="tool-layout">
    <div class="tool-files glass">${files}</div>
    <aside class="tool-side glass">
      ${tool.options?.length ? `<div class="fields" id="tool-fields">${renderOptions(tool.options, state.values[tool.id], tool.id)}</div>` : '<p class="muted" style="margin:0">No settings needed.</p>'}
      ${tool.combine && entries.length > 1 ? `<div class="notice">${icon('info', 16)}<span>Files are combined in the order shown. Use the arrows to reorder.</span></div>` : ''}
      <button class="btn primary big" data-act="run" ${runnable ? '' : 'disabled'}>${icon('sparkles', 18)} ${busy ? 'Working…' : 'Start'}</button>
      ${busy ? `<button class="btn danger" data-act="cancel-all">${icon('stop', 16)} Cancel</button>` : ''}
    </aside></div>`;
}

function mediaPreview(entry) {
  if (!entry.file) return '';
  entry.mediaUrl ??= URL.createObjectURL(entry.file);
  const isAudio = categoryOf(entry.ext) === 'audio';
  return `<div class="preview-media">
    ${isAudio ? `<audio id="media" src="${entry.mediaUrl}" controls preload="metadata"></audio>` : `<video id="media" src="${entry.mediaUrl}" controls preload="metadata"></video>`}
    <div class="trim-track" id="trim-track"><div class="sel" id="trim-sel"></div><div class="head" id="trim-head"></div></div>
    <div class="trim-buttons"><button class="btn" data-mark="trimStart">${icon('scissors', 15)} Set start here</button><button class="btn" data-mark="trimEnd">${icon('scissors', 15)} Set end here</button><span class="faint" id="media-time"></span></div>
    <div class="notice" id="media-unsupported" hidden>${icon('info', 16)}<span>Preview isn’t available for this format, but trimming works — type the times in the settings.</span></div>
  </div>`;
}

const toSeconds = value => {
  if (value === '' || value === undefined || value === null) return null;
  const parts = String(value).split(':').map(Number);
  return parts.some(Number.isNaN) ? null : parts.reduce((sum, part) => sum * 60 + part, 0);
};

function bindPreview(tool) {
  const media = $('#media', root);
  if (!media) return;
  const values = state.values[tool.id];
  const paint = () => {
    const duration = media.duration || 0;
    if (!duration) return;
    const start = toSeconds(values.trimStart) ?? 0;
    const end = toSeconds(values.trimEnd) ?? duration;
    $('#trim-sel', root).style.cssText = `left:${start / duration * 100}%;width:${Math.max(0, (end - start) / duration * 100)}%`;
    $('#trim-head', root).style.left = `${media.currentTime / duration * 100}%`;
    $('#media-time', root).textContent = `${formatDuration(media.currentTime)} / ${formatDuration(duration)} · clip ${formatDuration(Math.max(0, end - start))}`;
  };
  media.addEventListener('loadedmetadata', paint);
  media.addEventListener('timeupdate', paint);
  media.addEventListener('error', () => { $('#media-unsupported', root).hidden = false; media.hidden = true; });
  $('#trim-track', root).addEventListener('click', event => {
    if (!media.duration) return;
    const rect = event.currentTarget.getBoundingClientRect();
    media.currentTime = (event.clientX - rect.left) / rect.width * media.duration;
  });
  root.querySelectorAll('[data-mark]').forEach(button => button.addEventListener('click', () => {
    values[button.dataset.mark] = formatDuration(media.currentTime).replace(/^0:/, '0:');
    const input = root.querySelector(`[data-option="${button.dataset.mark}"]`);
    if (input) input.value = values[button.dataset.mark];
    paint();
  }));
  root.querySelectorAll('[data-option="trimStart"], [data-option="trimEnd"]').forEach(input => input.addEventListener('input', paint));
}

function addFiles(tool, files) {
  let skipped = 0;
  for (const file of files) {
    if (!toolAccepts(tool, file.name)) { skipped += 1; continue; }
    const entry = toEntry(file);
    entry.category ??= 'archive';
    state.entries.push(entry);
  }
  if (skipped) toast(`${skipped} file${skipped === 1 ? '' : 's'} can’t be used with ${tool.name}.`, 'error');
  render();
}

function bindTool(tool) {
  $('[data-act="back"]', root).addEventListener('click', () => { state.toolId = null; render(); });
  if (tool.special === 'units') return import('./units.js').then(module => module.bindUnits(root));
  const values = state.values[tool.id];
  const fields = $('#tool-fields', root);
  if (fields) {
    const bind = () => bindOptions(fields, tool.options, values, (_values, structural) => {
      if (!structural) return;
      fields.innerHTML = renderOptions(tool.options, values, tool.id);
      bind();
    });
    bind();
  }
  root.querySelectorAll('[data-act="browse"]').forEach(element => element.addEventListener('click', async event => {
    event.stopPropagation();
    const accept = tool.accept === '*' ? '' : tool.accept.map(ext => `.${ext}`).join(',');
    addFiles(tool, await pickFiles({ accept }));
  }));
  $('[data-act="run"]', root)?.addEventListener('click', () => run(tool));
  $('[data-act="cancel-all"]', root)?.addEventListener('click', () => {
    state.entries.forEach(entry => { entry.task?.controller?.abort(); if (entry.status === 'queued') { entry.status = 'cancelled'; if (entry.task) entry.task.status = 'cancelled'; } });
  });
  const list = $('.rows', root);
  if (list) {
    bindRowActions(list, id => state.entries.find(entry => entry.id === id), {
      remove: entry => { releaseEntry(entry); state.entries = state.entries.filter(item => item !== entry); render(); },
      up: entry => move(entry, -1),
      down: entry => move(entry, 1),
      refresh: render
    });
  }
  bindPreview(tool);
}

function move(entry, delta) {
  const index = state.entries.indexOf(entry);
  const next = index + delta;
  if (next < 0 || next >= state.entries.length) return;
  [state.entries[index], state.entries[next]] = [state.entries[next], state.entries[index]];
  render();
}

async function run(tool) {
  if (!window.meow) { toast('Tools run in the MeowConvert desktop app.', 'error'); return; }
  const values = { ...state.values[tool.id] };
  const pending = state.entries.filter(entry => ['ready', 'error', 'cancelled'].includes(entry.status));
  if (!pending.length) return;
  const output = await prepareOutput();
  if (!output) return;
  const sync = (entries, task, kind) => {
    for (const entry of entries) {
      entry.status = task.status;
      entry.progress = task.progress;
      entry.result = task.result;
      if (kind === 'progress') paintProgress(root, entry);
    }
    if (kind !== 'progress') render();
  };
  let tasks;
  if (tool.combine) {
    const spec = { ...tool.combine(pending, values), entries: pending, toolName: tool.name };
    const task = { label: `${tool.name} (${pending.length} files)`, spec, onUpdate: (current, kind) => sync(pending, current, kind) };
    pending.forEach(entry => { entry.status = 'queued'; entry.task = task; entry.result = null; });
    tasks = [task];
  } else {
    tasks = pending.map(entry => {
      const spec = tool.tool
        ? { tool: tool.tool, entries: [entry], options: values, toolName: tool.name }
        : { entry, ...tool.build(entry, values) };
      const task = { label: entry.name, spec, onUpdate: (current, kind) => sync([entry], current, kind) };
      entry.status = 'queued';
      entry.result = null;
      entry.task = task;
      return task;
    });
  }
  render();
  const summary = await runTasks(tasks, { outToken: output.token });
  if (summary.failed) toast(tasks.find(task => task.status === 'error')?.result?.error || 'Something went wrong.', 'error');
  else if (summary.done) toast('Done! Your files are ready.', 'success');
}
