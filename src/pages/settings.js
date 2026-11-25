import { store, setSettings, resetSettings, refreshInfo, onStoreChange, ACCENT_NAMES, accentColor } from '../core/store.js';
import { icon } from '../ui/icons.js';
import { escapeHtml, toast, confirmDialog, $ } from '../ui/dom.js';
import logoUrl from '../assets/logo.svg';

let root;
onStoreChange(part => { if ((part === 'info' || part === 'update') && root?.isConnected && root.querySelector('.settings')) render(); });

const switchHtml = (key, value) => `<button class="switch ${value ? 'on' : ''}" role="switch" aria-checked="${Boolean(value)}" data-toggle="${key}"><i></i></button>`;
const segmented = (key, value, options) => `<div class="segmented" data-seg="${key}">${options.map(([id, label]) => `<button class="${String(value) === String(id) ? 'active' : ''}" data-value="${id}">${label}</button>`).join('')}</div>`;
const row = (title, hint, control) => `<div class="setting-row"><div class="label"><b>${title}</b>${hint ? `<small>${hint}</small>` : ''}</div><div class="control">${control}</div></div>`;

function engineRow(name, detail, ok, extra = '') {
  return `<div class="engine"><span class="dot ${ok ? '' : 'off'}"></span><div class="label"><b>${name}</b><small title="${escapeHtml(detail)}">${escapeHtml(detail)}</small></div>${extra}</div>`;
}

export function render(container) {
  if (container) root = container;
  if (!root?.isConnected) return;
  const s = store.settings;
  const info = store.info || {};
  const update = store.update || {};
  const themes = [['glass', 'Glass', 'Frosted, see-through', 'glass-p'], ['dark', 'Dark', 'Solid and calm', 'dark-p'], ['light', 'Light', 'Bright and airy', 'light-p']];
  root.innerHTML = `<div class="page"><div class="page-head"><div><h1>Settings</h1><p>Make MeowConvert work the way you like.</p></div></div>
  <div class="settings">
    <section class="glass card">
      <h2 class="section-title">${icon('palette', 19)} Appearance</h2>
      <div class="themes">${themes.map(([id, title, sub, preview]) => `<button class="theme-card ${s.theme === id ? 'active' : ''}" data-theme-pick="${id}"><div class="preview ${preview}"></div><b>${title}</b><small>${sub}</small></button>`).join('')}</div>
      ${row('Accent colour', '', `<div class="swatches">${ACCENT_NAMES.map(name => `<button class="swatch ${s.accent === name ? 'active' : ''}" style="--c:${accentColor(name)}" data-accent="${name}" title="${name}"></button>`).join('')}</div>`)}
      ${s.theme === 'glass' ? row('Glass tint', 'Lower is clearer, higher is more frosted', `<div class="range-row"><input type="range" min="0" max="100" value="${s.glassOpacity}" data-range="glassOpacity" style="--fill:${s.glassOpacity}%" /><output>${s.glassOpacity}%</output></div>`) : ''}
      ${s.theme === 'glass' ? row('Window backdrop', 'Windows 11 blurs what is behind the window', segmented('windowEffect', s.windowEffect, [['acrylic', 'Acrylic'], ['mica', 'Mica'], ['none', 'None']])) : ''}
      ${row('Reduce motion', 'Turn off animations', switchHtml('reduceMotion', s.reduceMotion))}
    </section>

    <section class="glass card">
      <h2 class="section-title">${icon('folder', 19)} Output</h2>
      ${row('Save converted files', '', segmented('outputMode', s.outputMode, [['source', 'Next to originals'], ['folder', 'In a folder'], ['ask', 'Ask each time']]))}
      ${s.outputMode === 'folder' ? row('Output folder', escapeHtml(s.outputFolder), `<button class="btn" data-act="open-folder">${icon('folderOpen', 16)} Open</button><button class="btn" data-act="pick-folder">Change…</button>`) : ''}
      ${row('Filename suffix', 'Added to every output name, e.g. “photo-small.webp”', `<div class="input-wrap" style="width:200px"><input type="text" data-text="fileSuffix" value="${escapeHtml(s.fileSuffix)}" placeholder="none" maxlength="40" /></div>`)}
      ${row('If a file already exists', '', segmented('conflict', s.conflict, [['rename', 'Keep both'], ['overwrite', 'Replace']]))}
      ${row('Keep metadata', 'Preserve tags, EXIF and document info where possible', switchHtml('keepMetadata', s.keepMetadata))}
      ${row('Show files when done', 'Open the output folder after a batch finishes', switchHtml('openFolderWhenDone', s.openFolderWhenDone))}
      ${row('Notify when done', 'Windows notification if MeowConvert is in the background', switchHtml('notifyWhenDone', s.notifyWhenDone))}
    </section>

    <section class="glass card">
      <h2 class="section-title">${icon('zap', 19)} Performance</h2>
      ${row('Files at the same time', `This PC has ${info.cpus || '?'} CPU threads`, segmented('concurrency', s.concurrency, [[1, '1'], [2, '2'], [3, '3'], [4, '4'], [6, '6']]))}
      ${row('Hardware video encoding', info.hardware ? `Uses ${info.hardware} for H.264/HEVC — much faster` : 'No compatible GPU encoder found; the CPU is used', switchHtml('hwAccel', s.hwAccel))}
      ${row('Encoding speed', 'Faster creates slightly bigger videos', segmented('encodeSpeed', s.encodeSpeed, [['fast', 'Fast'], ['balanced', 'Balanced'], ['quality', 'Smallest']]))}
    </section>

    <section class="glass card">
      <h2 class="section-title">${icon('cpu', 19)} Engines</h2>
      <p class="muted" style="margin:4px 0 6px">Built in and fully offline:</p>
      ${engineRow('FFmpeg', info.ffmpeg ? `Version ${info.ffmpeg} — video, audio, GIF and image codecs` : 'Checking…', Boolean(info.ffmpeg))}
      ${engineRow('libvips', info.vips ? `Version ${info.vips} — fast image processing` : 'Checking…', Boolean(info.vips))}
      ${engineRow('Documents, PDF, spreadsheets, archives, fonts & 3D', 'pdf-lib · pdf.js · SheetJS · Mammoth · 7-Zip · three.js', true)}
      <p class="muted" style="margin:16px 0 6px">Optional free add-ons (detected automatically):</p>
      ${engineRow('LibreOffice', info.libreoffice || 'Not found — needed for DOC, ODT, RTF output and PowerPoint files', Boolean(info.libreoffice), `${info.libreoffice ? '' : '<button class="btn ghost" data-link="libreoffice">Get it</button>'}<button class="btn ghost" data-locate="libreoffice">Locate…</button>`)}
      ${engineRow('Calibre', info.calibre || 'Not found — needed for MOBI, AZW3 and FB2 eBooks', Boolean(info.calibre), `${info.calibre ? '' : '<button class="btn ghost" data-link="calibre">Get it</button>'}<button class="btn ghost" data-locate="calibre">Locate…</button>`)}
      <div style="margin-top:10px"><button class="btn ghost" data-act="rescan">${icon('refresh', 16)} Scan again</button></div>
    </section>

    <section class="glass card">
      <h2 class="section-title">${icon('refresh', 19)} Updates</h2>
      ${row(`MeowConvert ${escapeHtml(info.version || '')}`, escapeHtml(update.message || 'Updates download only the parts of the app that changed.'), `${update.state === 'ready' ? `<button class="btn primary" data-act="install">${icon('refresh', 16)} Restart & update</button>` : update.state === 'available' && !s.autoDownloadUpdates ? `<button class="btn primary" data-act="download">Download</button>` : `<button class="btn" data-act="check" ${update.state === 'checking' || update.state === 'downloading' ? 'disabled' : ''}>${icon('refresh', 16)} Check now</button>`}`)}
      ${update.state === 'downloading' ? `<div class="update-bar"><i style="width:${Math.round(update.percent || 0)}%"></i></div>` : ''}
      ${row('Check automatically', 'Looks for new releases on GitHub when the app starts', switchHtml('autoCheckUpdates', s.autoCheckUpdates))}
      ${row('Download automatically', 'Installs when you next close the app', switchHtml('autoDownloadUpdates', s.autoDownloadUpdates))}
    </section>

    <section class="glass card">
      <div class="about"><img src="${logoUrl}" alt="" /><div><b style="font-size:17px">MeowConvert</b><div class="muted">Private, offline file conversion for Windows.</div>
        <div style="margin-top:6px">Made with &lt;3 by <a data-link="github">AminMGM</a> · <a data-link="repo">Source on GitHub</a></div></div>
        <div style="margin-left:auto"><button class="btn ghost" data-act="reset">Reset settings</button></div></div>
    </section>
  </div></div>`;
  bind();
}

function bind() {
  root.querySelectorAll('[data-theme-pick]').forEach(button => button.addEventListener('click', () => setSettings({ theme: button.dataset.themePick }).then(render)));
  root.querySelectorAll('[data-accent]').forEach(button => button.addEventListener('click', () => setSettings({ accent: button.dataset.accent }).then(render)));
  root.querySelectorAll('[data-toggle]').forEach(button => button.addEventListener('click', async () => {
    const key = button.dataset.toggle;
    await setSettings({ [key]: !store.settings[key] });
    button.classList.toggle('on', store.settings[key]);
    button.setAttribute('aria-checked', String(store.settings[key]));
    if (key === 'hwAccel') refreshInfo();
  }));
  root.querySelectorAll('[data-seg]').forEach(group => group.querySelectorAll('button').forEach(button => button.addEventListener('click', async () => {
    const key = group.dataset.seg;
    const value = key === 'concurrency' ? Number(button.dataset.value) : button.dataset.value;
    if (key === 'outputMode' && value === 'folder' && !store.settings.outputFolder) {
      const picked = await window.meow.chooseFolder('default');
      if (!picked) return;
    }
    await setSettings({ [key]: value });
    render();
  })));
  root.querySelectorAll('[data-range]').forEach(input => {
    input.addEventListener('input', () => {
      input.style.setProperty('--fill', `${input.value}%`);
      input.nextElementSibling.textContent = `${input.value}%`;
      document.documentElement.style.setProperty('--tint', (0.08 + input.value / 100 * 0.72).toFixed(3));
    });
    input.addEventListener('change', () => setSettings({ [input.dataset.range]: Number(input.value) }));
  });
  root.querySelectorAll('[data-text]').forEach(input => input.addEventListener('change', () => setSettings({ [input.dataset.text]: input.value })));
  root.querySelectorAll('[data-link]').forEach(link => link.addEventListener('click', () => window.meow?.openLink(link.dataset.link)));
  root.querySelectorAll('[data-locate]').forEach(button => button.addEventListener('click', async () => {
    try {
      const result = await window.meow.locateEngine(button.dataset.locate);
      if (result) { store.settings = result; await refreshInfo(); toast('Engine found and saved.', 'success'); }
    } catch (error) {
      toast(error.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, ''), 'error');
    }
  }));
  $('[data-act="rescan"]', root).addEventListener('click', () => refreshInfo().then(() => toast('Engines rescanned.', 'success')));
  $('[data-act="pick-folder"]', root)?.addEventListener('click', async () => { const result = await window.meow.chooseFolder('default'); if (result) { store.settings = result.settings; render(); } });
  $('[data-act="open-folder"]', root)?.addEventListener('click', () => window.meow.openFolder(store.settings.outputFolder).catch(error => toast(error.message, 'error')));
  $('[data-act="check"]', root)?.addEventListener('click', async () => {
    try {
      const result = await window.meow.checkForUpdates();
      if (result?.state === 'dev') { store.update = { state: 'idle', message: result.message }; render(); }
    } catch (error) {
      store.update = { state: 'error', message: `Could not check for updates: ${error.message}` };
      render();
    }
  });
  $('[data-act="download"]', root)?.addEventListener('click', () => window.meow.downloadUpdate().catch(error => toast(error.message, 'error')));
  $('[data-act="install"]', root)?.addEventListener('click', () => window.meow.installUpdate());
  $('[data-act="reset"]', root).addEventListener('click', async () => {
    if (await confirmDialog({ title: 'Reset all settings?', message: 'Appearance, output and performance settings go back to their defaults. History is kept.', confirm: 'Reset' })) { await resetSettings(); render(); }
  });
}
