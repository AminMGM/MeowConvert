// App-wide state: settings (persisted by the main process), engine info and conversion history.
const listeners = new Set();
const HISTORY_KEY = 'meow-history-v2';

export const store = {
  settings: {
    theme: 'glass', accent: 'violet', glassOpacity: 72, windowEffect: 'acrylic', reduceMotion: false,
    outputMode: 'source', outputFolder: '', fileSuffix: '', conflict: 'rename', concurrency: 2, hwAccel: true,
    encodeSpeed: 'balanced', keepMetadata: true, openFolderWhenDone: false, notifyWhenDone: true,
    autoCheckUpdates: true, autoDownloadUpdates: true, libreOfficePath: '', calibrePath: ''
  },
  info: null,
  history: loadHistory(),
  update: { state: 'idle', message: '' },
  isDesktop: Boolean(window.meow)
};

function loadHistory() {
  try {
    return JSON.parse(localStorage.getItem(HISTORY_KEY)) || [];
  } catch {
    return [];
  }
}

export function onStoreChange(callback) {
  listeners.add(callback);
  return () => listeners.delete(callback);
}

function emit(part) {
  listeners.forEach(callback => callback(part));
}

export async function initStore() {
  if (!window.meow) return;
  store.settings = { ...store.settings, ...(await window.meow.getSettings()) };
  applyAppearance();
  refreshInfo();
  window.meow.onUpdateStatus(status => {
    store.update = status;
    emit('update');
  });
}

export async function refreshInfo() {
  if (!window.meow) return null;
  store.info = await window.meow.getInfo();
  emit('info');
  return store.info;
}

export async function setSettings(patch) {
  if (window.meow) store.settings = await window.meow.setSettings(patch);
  else store.settings = { ...store.settings, ...patch };
  applyAppearance();
  emit('settings');
}

export async function resetSettings() {
  if (window.meow) store.settings = await window.meow.resetSettings();
  applyAppearance();
  emit('settings');
}

export function capabilities() {
  return { libreoffice: Boolean(store.info?.libreoffice), calibre: Boolean(store.info?.calibre) };
}

const ACCENTS = {
  violet: ['#8b5cf6', '#c4b5fd', '139 92 246'], blue: ['#3b82f6', '#93c5fd', '59 130 246'], pink: ['#ec4899', '#f9a8d4', '236 72 153'],
  mint: ['#10b981', '#6ee7b7', '16 185 129'], amber: ['#f59e0b', '#fcd34d', '245 158 11'], red: ['#ef4444', '#fca5a5', '239 68 68']
};
export const ACCENT_NAMES = Object.keys(ACCENTS);
export const accentColor = name => ACCENTS[name]?.[0] || ACCENTS.violet[0];

export function applyAppearance() {
  const { theme, accent, glassOpacity, reduceMotion, windowEffect } = store.settings;
  const root = document.documentElement;
  root.dataset.theme = theme;
  root.dataset.effect = theme === 'glass' ? windowEffect : 'none';
  root.classList.toggle('reduce-motion', Boolean(reduceMotion));
  const [strong, soft, rgb] = ACCENTS[accent] || ACCENTS.violet;
  root.style.setProperty('--accent', strong);
  root.style.setProperty('--accent-soft', soft);
  root.style.setProperty('--accent-rgb', rgb);
  // Tint strength 0 → crystal clear, 100 → heavily frosted.
  root.style.setProperty('--tint', (0.08 + glassOpacity / 100 * 0.72).toFixed(3));
}

export function addHistory(entry) {
  store.history.unshift({ id: crypto.randomUUID(), time: Date.now(), ...entry });
  store.history = store.history.slice(0, 500);
  localStorage.setItem(HISTORY_KEY, JSON.stringify(store.history));
  emit('history');
}

export function removeHistory(id) {
  store.history = id ? store.history.filter(item => item.id !== id) : [];
  localStorage.setItem(HISTORY_KEY, JSON.stringify(store.history));
  emit('history');
}
