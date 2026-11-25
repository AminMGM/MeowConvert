import './styles/app.css';
import logoUrl from './assets/logo.svg';
import { icon } from './ui/icons.js';
import { $ } from './ui/dom.js';
import { initStore, onStoreChange, applyAppearance } from './core/store.js';
import { filesFromDrop } from './core/files.js';
import * as convertPage from './pages/convert.js';
import * as toolsPage from './pages/tools.js';
import * as historyPage from './pages/history.js';
import * as settingsPage from './pages/settings.js';

const PAGES = {
  convert: { label: 'Convert', icon: 'sparkles', module: convertPage },
  tools: { label: 'Tools', icon: 'grid', module: toolsPage },
  history: { label: 'History', icon: 'clock', module: historyPage },
  settings: { label: 'Settings', icon: 'settings', module: settingsPage }
};
let current = 'convert';

function shell() {
  document.querySelector('#app').innerHTML = `
  <svg width="0" height="0" style="position:absolute" aria-hidden="true">
    <filter id="liquid-refraction" x="0" y="0" width="100%" height="100%" color-interpolation-filters="sRGB">
      <feTurbulence type="fractalNoise" baseFrequency="0.012 0.018" numOctaves="2" seed="9" result="noise" />
      <feGaussianBlur in="noise" stdDeviation="2.5" result="soft" />
      <feDisplacementMap in="SourceGraphic" in2="soft" scale="26" xChannelSelector="R" yChannelSelector="G" />
    </filter>
  </svg>
  <div class="shell">
    <div class="aurora"><i></i><i></i><i></i></div>
    <main class="scroller" id="scroller"><div id="page"></div></main>
    <header class="titlebar">
      <div class="brand"><img src="${logoUrl}" alt="" draggable="false" /><span><b>Meow</b>Convert</span></div>
      <nav class="nav liquid" id="nav" aria-label="Main">
        <span class="nav-lens" id="lens"></span>
        ${Object.entries(PAGES).map(([id, page]) => `<button data-page="${id}" class="${id === current ? 'active' : ''}" aria-current="${id === current ? 'page' : 'false'}">${icon(page.icon, 18)}<span>${page.label}</span>${id === 'convert' ? '<i class="badge" id="badge" hidden></i>' : ''}</button>`).join('')}
      </nav>
      <div class="win-controls">
        <button data-win="min" aria-label="Minimize">${icon('minimize', 16)}</button>
        <button data-win="max" aria-label="Maximize">${icon('maximize', 14)}</button>
        <button data-win="close" class="close" aria-label="Close">${icon('x', 17)}</button>
      </div>
    </header>
    <div class="signature"><a href="#" id="signature">Made with <span class="heart">&lt;3</span> by AminMGM</a></div>
    <div class="drag-overlay" id="drag-overlay"><div class="glass">${icon('upload', 40)}<span>Drop to add files</span></div></div>
  </div>`;
  document.querySelectorAll('[data-page]').forEach(button => button.addEventListener('click', () => navigate(button.dataset.page)));
  document.querySelector('[data-win="min"]').addEventListener('click', () => window.meow?.minimize());
  document.querySelector('[data-win="max"]').addEventListener('click', () => window.meow?.toggleMaximize());
  document.querySelector('[data-win="close"]').addEventListener('click', () => window.meow?.close());
  document.querySelector('.titlebar').addEventListener('dblclick', event => { if (!event.target.closest('button')) window.meow?.toggleMaximize(); });
  $('#signature').addEventListener('click', event => { event.preventDefault(); window.meow?.openLink('github'); });
  window.meow?.onWindowState(({ maximized }) => {
    document.body.classList.toggle('maximized', maximized);
    document.querySelector('[data-win="max"]').innerHTML = icon(maximized ? 'restore' : 'maximize', 14);
  });
  addEventListener('resize', () => moveLens(false));
}

function moveLens(animate = true) {
  const active = document.querySelector(`.nav [data-page="${current}"]`);
  const lens = $('#lens');
  if (!active || !lens) return;
  const nav = $('#nav').getBoundingClientRect();
  const rect = active.getBoundingClientRect();
  if (!animate) lens.style.transition = 'none';
  lens.style.width = `${rect.width}px`;
  lens.style.transform = `translateX(${rect.left - nav.left}px)`;
  if (animate) {
    lens.classList.remove('squish');
    void lens.offsetWidth;
    lens.classList.add('squish');
  } else {
    requestAnimationFrame(() => { lens.style.transition = ''; });
  }
}

export function navigate(page) {
  if (!PAGES[page]) return;
  const same = page === current;
  current = page;
  document.querySelectorAll('.nav [data-page]').forEach(button => {
    button.classList.toggle('active', button.dataset.page === page);
    button.setAttribute('aria-current', button.dataset.page === page ? 'page' : 'false');
  });
  if (!same) moveLens(true);
  $('#scroller').scrollTop = 0;
  PAGES[page].module.render($('#page'));
}

function updateBadge() {
  const badge = $('#badge');
  const count = convertPage.badgeCount();
  badge.hidden = !count || current === 'convert';
  badge.textContent = count;
}

/** Files can be dropped anywhere in the window. */
function setupDrop() {
  const overlay = $('#drag-overlay');
  let depth = 0;
  const hasFiles = event => [...(event.dataTransfer?.types || [])].includes('Files');
  addEventListener('dragenter', event => { if (!hasFiles(event)) return; event.preventDefault(); depth += 1; overlay.classList.add('visible'); });
  addEventListener('dragleave', event => { if (!hasFiles(event)) return; depth = Math.max(0, depth - 1); if (!depth) overlay.classList.remove('visible'); });
  addEventListener('dragover', event => { if (!hasFiles(event)) return; event.preventDefault(); event.dataTransfer.dropEffect = 'copy'; });
  addEventListener('drop', async event => {
    if (!hasFiles(event)) return;
    event.preventDefault();
    depth = 0;
    overlay.classList.remove('visible');
    const files = await filesFromDrop(event.dataTransfer);
    if (!files.length) return;
    if (current === 'tools' && toolsPage.acceptDrop(files)) return;
    if (current !== 'convert') navigate('convert');
    convertPage.addFiles(files);
  });
}

async function boot() {
  applyAppearance();
  shell();
  setupDrop();
  document.addEventListener('meow:navigate', event => navigate(event.detail));
  document.addEventListener('meow:badge', updateBadge);
  await initStore();
  onStoreChange(part => {
    if (part === 'settings' && current === 'convert') convertPage.render();
    if (part === 'history' && current === 'history') historyPage.render();
  });
  navigate('convert');
  requestAnimationFrame(() => moveLens(false));
  document.fonts?.ready.then(() => moveLens(false));
}

boot();
