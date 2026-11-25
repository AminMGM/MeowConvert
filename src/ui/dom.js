import { icon } from './icons.js';

export const $ = (selector, root = document) => root.querySelector(selector);
export const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

export function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
}

export function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes < 0) return '—';
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) { value /= 1024; unit += 1; }
  return `${value >= 100 ? value.toFixed(0) : value.toFixed(1)} ${units[unit]}`;
}

export function formatDuration(seconds) {
  if (!Number.isFinite(seconds)) return '';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor(seconds % 3600 / 60);
  const s = (seconds % 60).toFixed(1).padStart(4, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${s}` : `${m}:${s}`;
}

export function timeAgo(timestamp) {
  const diff = (Date.now() - timestamp) / 1000;
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)} min ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} h ago`;
  return new Date(timestamp).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: diff > 31536000 ? 'numeric' : undefined });
}

export const uid = () => crypto.randomUUID();

let toastTimer;
export function toast(message, kind = 'info') {
  let element = $('#toast');
  if (!element) {
    element = document.createElement('div');
    element.id = 'toast';
    element.setAttribute('role', 'status');
    document.body.append(element);
  }
  element.className = `toast glass ${kind}`;
  element.innerHTML = `${icon(kind === 'error' ? 'alert' : kind === 'success' ? 'check' : 'info', 18)}<span>${escapeHtml(message)}</span>`;
  requestAnimationFrame(() => element.classList.add('visible'));
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => element.classList.remove('visible'), kind === 'error' ? 6000 : 3500);
}

/** Small reusable confirm sheet. Resolves true/false. */
export function confirmDialog({ title, message, confirm = 'Confirm', danger = false }) {
  return new Promise(resolve => {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `<div class="modal glass" role="dialog" aria-modal="true"><h3>${escapeHtml(title)}</h3><p>${escapeHtml(message)}</p><div class="modal-actions"><button class="btn ghost" data-no>Cancel</button><button class="btn ${danger ? 'danger' : 'primary'}" data-yes>${escapeHtml(confirm)}</button></div></div>`;
    const close = value => { overlay.classList.remove('visible'); setTimeout(() => overlay.remove(), 200); resolve(value); };
    overlay.addEventListener('click', event => { if (event.target === overlay) close(false); });
    overlay.querySelector('[data-no]').addEventListener('click', () => close(false));
    overlay.querySelector('[data-yes]').addEventListener('click', () => close(true));
    document.body.append(overlay);
    requestAnimationFrame(() => overlay.classList.add('visible'));
    overlay.querySelector('[data-yes]').focus();
  });
}
