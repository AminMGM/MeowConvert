import { store, removeHistory } from '../core/store.js';
import { icon } from '../ui/icons.js';
import { escapeHtml, formatBytes, timeAgo, toast, confirmDialog, $ } from '../ui/dom.js';

let root;
let query = '';

export function render(container) {
  if (container) root = container;
  if (!root?.isConnected) return;
  const items = store.history.filter(item => !query || `${item.inputName} ${item.target} ${item.outputs.map(output => output.path).join(' ')}`.toLowerCase().includes(query.toLowerCase()));
  const totalFiles = store.history.reduce((sum, item) => sum + item.outputs.length, 0);
  const saved = store.history.reduce((sum, item) => {
    const out = item.outputs.reduce((total, output) => total + (output.size || 0), 0);
    return sum + Math.max(0, (item.inputSize || 0) - out);
  }, 0);
  root.innerHTML = `<div class="page">
    <div class="page-head"><div><h1>History</h1><p>Every conversion you’ve made on this PC.</p></div>
      <div style="display:flex;gap:8px"><label class="tool-search">${icon('search', 18)}<input type="search" id="history-search" placeholder="Search history…" value="${escapeHtml(query)}" /></label>
      ${store.history.length ? `<button class="btn ghost" data-act="clear">${icon('trash', 16)} Clear</button>` : ''}</div></div>
    <div class="stats">
      <div class="stat glass"><b>${store.history.length}</b><small>Jobs completed</small></div>
      <div class="stat glass"><b>${totalFiles}</b><small>Files created</small></div>
      <div class="stat glass"><b>${formatBytes(saved)}</b><small>Space saved by compressing</small></div>
    </div>
    ${items.length ? `<section class="group glass"><div class="rows">${items.map(item => {
      const first = item.outputs[0];
      const size = item.outputs.reduce((total, output) => total + (output.size || 0), 0);
      const name = first.path.split(/[\\/]/).pop();
      return `<div class="row" data-id="${item.id}" style="--c:var(--accent)">
        <div class="thumb">${icon(first.isFolder ? 'folder' : 'check', 20)}</div>
        <div class="meta"><b title="${escapeHtml(first.path)}">${escapeHtml(name)}${item.outputs.length > 1 ? ` +${item.outputs.length - 1}` : ''}</b>
          <small>${escapeHtml(item.inputName)} → ${escapeHtml(item.target || '')} · ${formatBytes(item.inputSize)} → ${formatBytes(size)} · ${timeAgo(item.time)}</small></div>
        <div></div>
        <div class="row-actions">
          ${!first.isFolder && item.outputs.length === 1 ? `<button class="icon-btn" data-open title="Open">${icon('external', 17)}</button>` : ''}
          <button class="icon-btn" data-show title="Show in folder">${icon('folderOpen', 17)}</button>
          <button class="icon-btn danger" data-remove title="Remove from history">${icon('x', 16)}</button>
        </div></div>`;
    }).join('')}</div></section>` : `<div class="empty glass"><div class="drop-orb">${icon('clock', 36)}</div><b>${store.history.length ? 'Nothing matches your search' : 'No conversions yet'}</b><span>Converted files will be listed here.</span></div>`}
  </div>`;
  const search = $('#history-search', root);
  search.addEventListener('input', () => {
    query = search.value;
    const position = search.selectionStart;
    render();
    const next = $('#history-search', root);
    next.focus();
    next.setSelectionRange(position, position);
  });
  $('[data-act="clear"]', root)?.addEventListener('click', async () => {
    if (await confirmDialog({ title: 'Clear history?', message: 'This only clears the list. Your converted files are not deleted.', confirm: 'Clear history', danger: true })) { removeHistory(null); render(); }
  });
  root.querySelectorAll('.row').forEach(row => {
    const item = store.history.find(entry => entry.id === row.dataset.id);
    row.querySelector('[data-open]')?.addEventListener('click', () => window.meow.openPath(item.outputs[0].path).catch(error => toast(error.message, 'error')));
    row.querySelector('[data-show]').addEventListener('click', () => window.meow.showItem(item.outputs[0].path).catch(error => toast(error.message, 'error')));
    row.querySelector('[data-remove]').addEventListener('click', () => { removeHistory(item.id); render(); });
  });
}
