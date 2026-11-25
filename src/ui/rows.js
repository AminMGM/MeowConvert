// File rows with live progress, shared by the converter and the tools.
import { CATEGORIES } from '../../shared/formats.mjs';
import { icon, CATEGORY_ICONS } from './icons.js';
import { escapeHtml, formatBytes, toast } from './dom.js';

const IMAGE_PREVIEW = new Set(['jpg', 'jpeg', 'jfif', 'png', 'webp', 'avif', 'gif', 'bmp', 'svg', 'ico']);

export function thumbFor(entry) {
  if (!entry.thumb && entry.file && IMAGE_PREVIEW.has(entry.ext) && entry.size < 40 * 1024 * 1024) entry.thumb = URL.createObjectURL(entry.file);
  return entry.thumb ? `<img src="${entry.thumb}" alt="" loading="lazy" decoding="async" />` : icon(CATEGORY_ICONS[entry.category] || 'document', 21);
}

export function releaseEntry(entry) {
  if (entry.thumb) URL.revokeObjectURL(entry.thumb);
  if (entry.mediaUrl) URL.revokeObjectURL(entry.mediaUrl);
}

function metaLine(entry) {
  const result = entry.result;
  if (entry.status === 'error') return `<small class="error">${escapeHtml(result?.error || 'Failed')}</small>`;
  if (entry.status === 'done' && result?.outputs?.length) {
    const size = result.outputs.reduce((sum, item) => sum + (item.size || 0), 0);
    const first = result.outputs[0];
    const change = entry.size && size ? Math.round((1 - size / entry.size) * 100) : null;
    const summary = first.isFolder ? `${first.count} files` : escapeHtml(first.path.split(/[\\/]/).pop());
    return `<small class="ok">${summary} · ${formatBytes(size)}${change !== null && change >= 1 ? ` · ${change}% smaller` : ''}${result.notes?.length ? ` · ${escapeHtml(result.notes.join(' '))}` : ''}</small>`;
  }
  return `<small>${formatBytes(entry.size)} · ${escapeHtml(entry.ext.toUpperCase() || 'FILE')}</small>`;
}

function statusPill(entry) {
  switch (entry.status) {
    case 'running': return `<span class="status-pill running"><span class="spinner"></span>${Math.round((entry.progress || 0) * 100)}%</span>`;
    case 'queued': return '<span class="status-pill cancelled">Queued</span>';
    case 'done': return `<span class="status-pill done">${icon('check', 14)}Done</span>`;
    case 'error': return `<span class="status-pill error">${icon('alert', 14)}Failed</span>`;
    case 'cancelled': return '<span class="status-pill cancelled">Cancelled</span>';
    default: return '';
  }
}

function actions(entry, { reorder, index, count }) {
  const parts = [];
  if (entry.status === 'running' || entry.status === 'queued') parts.push(`<button class="icon-btn danger" data-act="cancel" title="Cancel">${icon('stop', 16)}</button>`);
  if (entry.status === 'done') {
    const first = entry.result?.outputs?.[0];
    if (first && !first.isFolder && entry.result.outputs.length === 1) parts.push(`<button class="icon-btn" data-act="open" title="Open">${icon('external', 17)}</button>`);
    parts.push(`<button class="icon-btn" data-act="show" title="Show in folder">${icon('folderOpen', 17)}</button>`);
  }
  if (reorder && entry.status !== 'running') {
    parts.push(`<button class="icon-btn" data-act="up" title="Move up" ${index === 0 ? 'disabled' : ''}>${icon('chevronDown', 16, 'flip-up')}</button>`);
    parts.push(`<button class="icon-btn" data-act="down" title="Move down" ${index === count - 1 ? 'disabled' : ''}>${icon('chevronDown', 16)}</button>`);
  }
  if (entry.status !== 'running' && entry.status !== 'queued') parts.push(`<button class="icon-btn danger" data-act="remove" title="Remove">${icon('x', 16)}</button>`);
  return parts.join('');
}

export function rowHtml(entry, { targetHtml = '', reorder = false, index = 0, count = 1 } = {}) {
  const color = CATEGORIES[entry.category]?.color || '#999';
  return `<div class="row ${entry.status}" data-id="${entry.id}" style="--c:${color};--p:${entry.progress || 0}">
    <div class="thumb">${thumbFor(entry)}</div>
    <div class="meta"><b title="${escapeHtml(entry.path || entry.name)}">${escapeHtml(entry.name)}</b>${metaLine(entry)}</div>
    <div class="row-target">${entry.status === 'ready' || entry.status === 'cancelled' || entry.status === 'error' ? targetHtml : statusPill(entry)}</div>
    <div class="row-actions">${actions(entry, { reorder, index, count })}</div>
    <div class="progress"></div>
  </div>`;
}

/** Updates just the progress bits of a row (cheap, called often). */
export function paintProgress(root, entry) {
  const row = root.querySelector(`.row[data-id="${entry.id}"]`);
  if (!row) return;
  row.style.setProperty('--p', entry.progress || 0);
  const pill = row.querySelector('.status-pill.running');
  if (pill) pill.lastChild.textContent = `${Math.round((entry.progress || 0) * 100)}%`;
}

/** Shared click handling for row action buttons. handlers: { remove(entry), up(entry), down(entry) } */
export function bindRowActions(root, getEntry, handlers) {
  root.addEventListener('click', async event => {
    const button = event.target.closest('[data-act]');
    if (!button) return;
    const entry = getEntry(button.closest('.row')?.dataset.id);
    if (!entry) return;
    const act = button.dataset.act;
    try {
      if (act === 'cancel') {
        if (entry.task?.controller) entry.task.controller.abort();
        if (entry.task) entry.task.status = 'cancelled';
        entry.status = 'cancelled';
        handlers.refresh?.();
      } else if (act === 'open') await window.meow.openPath(entry.result.outputs[0].path);
      else if (act === 'show') await window.meow.showItem(entry.result.outputs[0].path);
      else handlers[act]?.(entry);
    } catch (error) {
      toast(error.message, 'error');
    }
  });
}
