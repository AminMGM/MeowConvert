import { app, BrowserWindow, Notification, dialog, ipcMain, nativeTheme, session, shell } from 'electron';
import path from 'node:path';
import fs from 'node:fs/promises';
import fssync from 'node:fs';
import os from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { runJob } from './engines/index.mjs';
import { ffmpegInfo, detectHardwareEncoder } from './engines/media.mjs';
import { findLibreOffice, findCalibre } from './engines/office.mjs';
import { reservePath, makeTempDir, removeQuietly, sanitizeFileName, stemOf } from './engines/util.mjs';

const require = createRequire(import.meta.url);
const { autoUpdater } = require('electron-updater');
const here = path.dirname(fileURLToPath(import.meta.url));
const GITHUB_PROFILE = 'https://github.com/AminMGM';
const GITHUB_REPO = 'https://github.com/AminMGM/MeowConvert';

// Development aid: an isolated profile (and single-instance lock) for test runs.
if (process.env.MEOW_USER_DATA && !app.isPackaged) app.setPath('userData', process.env.MEOW_USER_DATA);
if (!app.requestSingleInstanceLock()) app.quit();

// ───────────────────────── Settings ─────────────────────────
const DEFAULT_SETTINGS = {
  theme: 'glass',
  accent: 'violet',
  glassOpacity: 72,
  windowEffect: 'acrylic',
  reduceMotion: false,
  outputMode: 'source',
  outputFolder: path.join(app.getPath('downloads'), 'MeowConvert'),
  fileSuffix: '',
  conflict: 'rename',
  concurrency: Math.max(1, Math.min(4, Math.floor(os.cpus().length / 4) || 1)),
  hwAccel: true,
  encodeSpeed: 'balanced',
  keepMetadata: true,
  openFolderWhenDone: false,
  notifyWhenDone: true,
  autoCheckUpdates: true,
  autoDownloadUpdates: true,
  libreOfficePath: '',
  calibrePath: ''
};
const settingsFile = path.join(app.getPath('userData'), 'settings.json');
let settings = { ...DEFAULT_SETTINGS };
try {
  settings = { ...DEFAULT_SETTINGS, ...JSON.parse(fssync.readFileSync(settingsFile, 'utf8')) };
} catch {
  // First run or unreadable settings: defaults.
}

const ALLOWED = {
  theme: ['glass', 'dark', 'light'], accent: ['violet', 'blue', 'pink', 'mint', 'amber', 'red'], windowEffect: ['acrylic', 'mica', 'none'],
  outputMode: ['source', 'folder', 'ask'], conflict: ['rename', 'overwrite'], encodeSpeed: ['fast', 'balanced', 'quality']
};

function sanitizeSettings(patch) {
  const clean = {};
  for (const [key, value] of Object.entries(patch || {})) {
    if (!(key in DEFAULT_SETTINGS)) continue;
    const fallback = DEFAULT_SETTINGS[key];
    if (ALLOWED[key] && !ALLOWED[key].includes(value)) continue;
    if (typeof fallback === 'boolean') clean[key] = Boolean(value);
    else if (typeof fallback === 'number') clean[key] = Math.max(key === 'glassOpacity' ? 0 : 1, Math.min(key === 'glassOpacity' ? 100 : 8, Math.round(Number(value) || fallback)));
    else if (typeof value === 'string') clean[key] = key === 'fileSuffix' ? value.replace(/[<>:"/\\|?*\x00-\x1f]/g, '').slice(0, 40) : value.slice(0, 1000);
  }
  return clean;
}

async function saveSettings() {
  await fs.mkdir(path.dirname(settingsFile), { recursive: true });
  await fs.writeFile(settingsFile, JSON.stringify(settings, null, 2));
}

// ───────────────────────── Window ─────────────────────────
let mainWindow;

const SOLID_BACKGROUND = { dark: '#0f0d17', light: '#eef0f7', glass: '#00000000' };

// The window is NOT transparent: Windows 11 then draws native rounded corners and shadow, and the
// acrylic/mica backdrop fills the (rounded) window. A transparent window + backdrop paints a square
// under the corners and can leave the page blank.
function applyWindowEffect() {
  if (!mainWindow) return;
  nativeTheme.themeSource = settings.theme === 'light' ? 'light' : 'dark';
  const material = settings.theme === 'glass' ? settings.windowEffect : 'none';
  mainWindow.setBackgroundColor(material === 'none' && settings.theme === 'glass' ? '#141120' : SOLID_BACKGROUND[settings.theme]);
  if (process.platform !== 'win32') return;
  try {
    mainWindow.setBackgroundMaterial(material);
  } catch {
    // Windows 10 has no system backdrops; the tinted CSS background is used instead.
  }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1320,
    height: 860,
    minWidth: 960,
    minHeight: 640,
    frame: false,
    roundedCorners: true,
    backgroundColor: SOLID_BACKGROUND[settings.theme] || '#0f0d17',
    show: false,
    title: 'MeowConvert',
    icon: path.join(here, '..', 'build', 'icon.png'),
    webPreferences: {
      preload: path.join(here, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false
    }
  });
  applyWindowEffect();
  mainWindow.once('ready-to-show', () => mainWindow.show());
  mainWindow.on('maximize', () => mainWindow.webContents.send('window:state', { maximized: true }));
  mainWindow.on('unmaximize', () => mainWindow.webContents.send('window:state', { maximized: false }));
  // Never navigate the app window away or open new windows from it.
  mainWindow.webContents.on('will-navigate', event => event.preventDefault());
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  if (process.env.VITE_DEV_SERVER_URL) mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
  else mainWindow.loadFile(path.join(here, '..', 'dist', 'index.html'));
}

// ───────────────────────── Output locations ─────────────────────────
const outputTokens = new Map();
const knownOutputs = new Set();
const knownOutputsFile = path.join(app.getPath('userData'), 'outputs.json');
try {
  JSON.parse(fssync.readFileSync(knownOutputsFile, 'utf8')).forEach(item => knownOutputs.add(item));
} catch {
  // none yet
}
let knownSaveTimer;
function rememberOutput(file) {
  knownOutputs.add(path.resolve(file).toLowerCase());
  clearTimeout(knownSaveTimer);
  knownSaveTimer = setTimeout(() => fs.writeFile(knownOutputsFile, JSON.stringify([...knownOutputs].slice(-3000))).catch(() => {}), 500);
}

async function resolveOutDir(inputPath, token) {
  if (token && outputTokens.has(token)) return outputTokens.get(token);
  if (settings.outputMode === 'folder' && settings.outputFolder) {
    await fs.mkdir(settings.outputFolder, { recursive: true });
    return settings.outputFolder;
  }
  return path.dirname(inputPath);
}

// ───────────────────────── HTML → PDF (offline Chromium printing) ─────────────────────────
let printSession;
async function htmlToPdf(html, { pageSize = 'A4', landscape = false, baseDir = null, margins } = {}) {
  if (!printSession) {
    printSession = session.fromPartition('meow-print');
    // Fully offline: block every network request made while rendering documents.
    printSession.webRequest.onBeforeRequest({ urls: ['http://*/*', 'https://*/*', 'ws://*/*', 'wss://*/*', 'ftp://*/*'] }, (_details, callback) => callback({ cancel: true }));
  }
  const temp = await makeTempDir();
  const file = path.join(temp, 'document.html');
  const base = baseDir ? `<base href="${pathToFileURL(baseDir + path.sep).href}">` : '';
  const content = base ? (/<head[^>]*>/i.test(html) ? html.replace(/<head[^>]*>/i, match => `${match}${base}`) : `${base}${html}`) : html;
  await fs.writeFile(file, content, 'utf8');
  const win = new BrowserWindow({ show: false, width: 900, height: 1200, webPreferences: { javascript: false, sandbox: true, partition: 'meow-print', offscreen: true } });
  try {
    await win.loadFile(file);
    const size = { a4: 'A4', letter: 'Letter', legal: 'Legal', a3: 'A3', a5: 'A5' }[String(pageSize).toLowerCase()] || 'A4';
    return await win.webContents.printToPDF({ pageSize: size, landscape, printBackground: true, preferCSSPageSize: false, margins: margins === 'none' ? { marginType: 'none' } : { marginType: 'default' } });
  } finally {
    win.destroy();
    await removeQuietly(temp);
  }
}

// ───────────────────────── Jobs ─────────────────────────
const running = new Map();
const rendererFolders = new Map();

function notifyDone(summary) {
  if (!settings.notifyWhenDone || mainWindow?.isFocused() || !Notification.isSupported()) return;
  new Notification({ title: 'MeowConvert', body: summary, silent: false }).show();
}

function registerIpc() {
  ipcMain.on('window:minimize', () => mainWindow?.minimize());
  ipcMain.on('window:toggle-maximize', () => {
    if (!mainWindow) return;
    if (mainWindow.isMaximized()) mainWindow.unmaximize();
    else mainWindow.maximize();
  });
  ipcMain.on('window:close', () => mainWindow?.close());

  ipcMain.handle('settings:get', () => settings);
  ipcMain.handle('settings:set', async (_event, patch) => {
    settings = { ...settings, ...sanitizeSettings(patch) };
    await saveSettings();
    if ('theme' in patch || 'windowEffect' in patch) applyWindowEffect();
    if ('autoDownloadUpdates' in patch) autoUpdater.autoDownload = settings.autoDownloadUpdates;
    return settings;
  });
  ipcMain.handle('settings:reset', async () => {
    settings = { ...DEFAULT_SETTINGS };
    await saveSettings();
    applyWindowEffect();
    return settings;
  });

  ipcMain.handle('app:info', async () => {
    const [ffmpeg, hardware] = await Promise.all([ffmpegInfo().catch(() => null), detectHardwareEncoder().catch(() => null)]);
    let sharpVersion = null;
    try { sharpVersion = require('sharp').versions.vips; } catch { /* unavailable */ }
    return {
      version: app.getVersion(),
      packaged: app.isPackaged,
      electron: process.versions.electron,
      ffmpeg: ffmpeg?.version || null,
      vips: sharpVersion,
      hardware: hardware?.vendor || null,
      libreoffice: findLibreOffice(settings.libreOfficePath),
      calibre: findCalibre(settings.calibrePath),
      cpus: os.cpus().length
    };
  });

  ipcMain.handle('dialog:choose-folder', async (_event, purpose) => {
    const result = await dialog.showOpenDialog(mainWindow, {
      title: purpose === 'default' ? 'Default output folder' : 'Save converted files to…',
      defaultPath: settings.outputFolder,
      properties: ['openDirectory', 'createDirectory']
    });
    if (result.canceled || !result.filePaths[0]) return null;
    const folder = result.filePaths[0];
    if (purpose === 'default') {
      settings = { ...settings, outputFolder: folder, outputMode: 'folder' };
      await saveSettings();
      return { folder, settings };
    }
    const token = randomUUID();
    outputTokens.set(token, folder);
    return { folder, token };
  });
  ipcMain.handle('dialog:release-output', (_event, token) => outputTokens.delete(token));

  ipcMain.handle('dialog:locate-engine', async (_event, engine) => {
    const isCalibre = engine === 'calibre';
    const result = await dialog.showOpenDialog(mainWindow, {
      title: isCalibre ? 'Locate ebook-convert.exe (Calibre)' : 'Locate soffice.exe (LibreOffice)',
      filters: [{ name: 'Program', extensions: ['exe', 'com'] }],
      properties: ['openFile']
    });
    if (result.canceled || !result.filePaths[0]) return null;
    const file = result.filePaths[0];
    const expected = isCalibre ? /ebook-convert\.exe$/i : /soffice\.(exe|com)$/i;
    if (!expected.test(file)) throw new Error(isCalibre ? 'Please choose ebook-convert.exe from the Calibre folder.' : 'Please choose soffice.exe from the LibreOffice "program" folder.');
    settings = { ...settings, [isCalibre ? 'calibrePath' : 'libreOfficePath']: file };
    await saveSettings();
    return settings;
  });

  ipcMain.handle('job:run', async (event, job) => {
    if (!job?.id || running.has(job.id)) throw new Error('Invalid job.');
    const controller = new AbortController();
    running.set(job.id, controller);
    const sender = event.sender;
    try {
      const inputs = (job.inputs?.length ? job.inputs : [job.input]).map(String);
      const outDir = await resolveOutDir(inputs[0], job.outToken);
      const result = await runJob({ ...job, input: inputs[0], inputs }, {
        settings,
        outDir,
        signal: controller.signal,
        htmlToPdf,
        onProgress: progress => { if (!sender.isDestroyed()) sender.send('job:progress', { id: job.id, progress }); }
      });
      result.outputs.forEach(output => rememberOutput(output.path));
      return { ok: true, ...result };
    } catch (error) {
      return { ok: false, cancelled: Boolean(error.cancelled), error: error.message || String(error) };
    } finally {
      running.delete(job.id);
    }
  });
  ipcMain.on('job:cancel', (_event, id) => running.get(id)?.abort());

  // Renderer-side engines (3D, PDF rendering) hand finished bytes to the main process to save.
  ipcMain.handle('job:write', async (_event, { jobId, input, outToken, name, bytes, folder }) => {
    if (!(bytes instanceof Uint8Array) && !ArrayBuffer.isView(bytes)) throw new Error('Invalid output data.');
    let dir = await resolveOutDir(String(input), outToken);
    let createdFolder = null;
    if (folder) {
      const key = `${jobId}:${folder}`;
      if (!rendererFolders.has(key)) {
        const reservation = await reservePath(dir, sanitizeFileName(`${folder}${settings.fileSuffix || ''}`));
        await fs.mkdir(reservation.path, { recursive: true });
        reservation.release();
        rendererFolders.set(key, reservation.path);
        createdFolder = reservation.path;
        rememberOutput(reservation.path);
      }
      dir = rendererFolders.get(key);
    }
    const [base, ext] = [stemOf(String(name)), path.extname(String(name))];
    const finalName = folder ? `${base}${ext}` : `${base}${settings.fileSuffix || ''}${ext}`;
    const reservation = await reservePath(dir, finalName, { overwrite: settings.conflict === 'overwrite' && !folder });
    try {
      const target = path.resolve(reservation.path).toLowerCase() === path.resolve(String(input)).toLowerCase()
        ? (await reservePath(dir, `${base} converted${ext}`)).path
        : reservation.path;
      await fs.writeFile(target, Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength));
      rememberOutput(target);
      return { path: target, size: bytes.byteLength, folder: createdFolder || (folder ? dir : null) };
    } finally {
      reservation.release();
    }
  });
  ipcMain.handle('job:discard', async (_event, paths) => {
    for (const file of paths || []) {
      if (knownOutputs.has(path.resolve(file).toLowerCase())) await removeQuietly(file);
    }
  });
  ipcMain.on('job:release-folders', (_event, jobId) => {
    for (const key of [...rendererFolders.keys()]) if (key.startsWith(`${jobId}:`)) rendererFolders.delete(key);
  });

  ipcMain.on('app:notify', (_event, summary) => notifyDone(String(summary).slice(0, 200)));

  const BLOCKED_OPEN = /\.(exe|bat|cmd|com|ps1|psm1|vbs|vbe|js|jse|wsf|wsh|msi|msp|scr|hta|lnk|reg|cpl|jar|pif|url)$/i;
  ipcMain.handle('shell:open-path', async (_event, file) => {
    const resolved = path.resolve(String(file));
    if (!knownOutputs.has(resolved.toLowerCase()) || BLOCKED_OPEN.test(resolved)) throw new Error('Only converted files can be opened from MeowConvert.');
    const error = await shell.openPath(resolved);
    if (error) throw new Error(error);
  });
  ipcMain.handle('shell:show-item', (_event, file) => {
    const resolved = path.resolve(String(file));
    if (fssync.existsSync(resolved)) shell.showItemInFolder(resolved);
    else throw new Error('That file no longer exists.');
  });
  ipcMain.handle('shell:open-folder', async (_event, folder) => {
    const resolved = path.resolve(String(folder || settings.outputFolder));
    if (!fssync.existsSync(resolved) || !fssync.statSync(resolved).isDirectory()) throw new Error('That folder no longer exists.');
    await shell.openPath(resolved);
  });
  ipcMain.handle('shell:open-link', async (_event, which) => {
    const links = {
      github: GITHUB_PROFILE,
      repo: GITHUB_REPO,
      releases: `${GITHUB_REPO}/releases`,
      libreoffice: 'https://www.libreoffice.org/download/download-libreoffice/',
      calibre: 'https://calibre-ebook.com/download_windows'
    };
    if (links[which]) await shell.openExternal(links[which]);
  });

  // ─── Updates (GitHub releases, differential download via blockmaps) ───
  ipcMain.handle('updates:check', async () => {
    if (!app.isPackaged) return { state: 'dev', message: 'Updates are available in the installed app.' };
    const result = await autoUpdater.checkForUpdates();
    return { state: result?.isUpdateAvailable ? 'available' : 'current', version: result?.updateInfo?.version };
  });
  ipcMain.handle('updates:download', async () => {
    if (!app.isPackaged) return;
    await autoUpdater.downloadUpdate();
  });
  ipcMain.on('updates:install', () => autoUpdater.quitAndInstall(false, true));
}

function setupUpdater() {
  if (!app.isPackaged) return;
  autoUpdater.autoDownload = settings.autoDownloadUpdates;
  autoUpdater.autoInstallOnAppQuit = true;
  const send = status => mainWindow?.webContents.send('updates:status', status);
  autoUpdater.on('checking-for-update', () => send({ state: 'checking', message: 'Checking for updates…' }));
  autoUpdater.on('update-available', info => send({ state: 'available', version: info.version, message: `Version ${info.version} is available.` }));
  autoUpdater.on('update-not-available', () => send({ state: 'current', message: 'You’re on the latest version.' }));
  autoUpdater.on('download-progress', progress => send({ state: 'downloading', percent: progress.percent, message: `Downloading changes… ${Math.round(progress.percent)}%` }));
  autoUpdater.on('update-downloaded', info => send({ state: 'ready', version: info.version, message: `Version ${info.version} is ready. Restart to finish updating.` }));
  autoUpdater.on('error', error => send({ state: 'error', message: `Update failed: ${error.message}` }));
  if (settings.autoCheckUpdates) setTimeout(() => autoUpdater.checkForUpdates().catch(() => {}), 6000);
}

function filesFromArgv(argv) {
  return argv.slice(1).filter(arg => !arg.startsWith('-') && path.isAbsolute(arg) && fssync.existsSync(arg) && fssync.statSync(arg).isFile() && arg.toLowerCase() !== process.execPath.toLowerCase());
}

function sendOpenedFiles(paths) {
  if (!paths.length || !mainWindow) return;
  const files = paths.map(file => ({ path: file, name: path.basename(file), size: fssync.statSync(file).size }));
  mainWindow.webContents.send('app:open-files', files);
}

app.on('second-instance', (_event, argv) => {
  if (!mainWindow) return;
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.focus();
  sendOpenedFiles(filesFromArgv(argv));
});

app.whenReady().then(() => {
  app.setAppUserModelId('com.aminmgm.meowconvert');
  registerIpc();
  createWindow();
  setupUpdater();
  mainWindow.webContents.once('did-finish-load', () => sendOpenedFiles(filesFromArgv(process.argv)));
  // Development aid: MEOW_SNAPSHOT=<dir> renders each page and saves PNGs of the app's own window content, then quits.
  if (process.env.MEOW_SNAPSHOT && !app.isPackaged) {
    mainWindow.webContents.once('did-finish-load', async () => {
      const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
      const steps = process.env.MEOW_SNAPSHOT_STEPS_FILE ? JSON.parse(await fs.readFile(process.env.MEOW_SNAPSHOT_STEPS_FILE, 'utf8')) : JSON.parse(process.env.MEOW_SNAPSHOT_STEPS || '[["home",""]]');
      await wait(1500);
      for (const [name, script] of steps) {
        if (script) await mainWindow.webContents.executeJavaScript(script).catch(error => console.error('snapshot script', name, error));
        await wait(1200);
        const image = await mainWindow.webContents.capturePage();
        await fs.writeFile(path.join(process.env.MEOW_SNAPSHOT, `${name}.png`), image.toPNG());
      }
      app.quit();
    });
  }
  // Warm up engine detection in the background so the first conversion starts instantly.
  setTimeout(() => { ffmpegInfo().catch(() => {}); if (settings.hwAccel) detectHardwareEncoder().catch(() => {}); }, 1500);
});

app.on('window-all-closed', () => {
  for (const controller of running.values()) controller.abort();
  app.quit();
});
