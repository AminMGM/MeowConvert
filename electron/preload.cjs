const { contextBridge, ipcRenderer, webUtils } = require('electron');

function subscribe(channel) {
  return callback => {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on(channel, listener);
    return () => ipcRenderer.removeListener(channel, listener);
  };
}

contextBridge.exposeInMainWorld('meow', {
  // window
  minimize: () => ipcRenderer.send('window:minimize'),
  toggleMaximize: () => ipcRenderer.send('window:toggle-maximize'),
  close: () => ipcRenderer.send('window:close'),
  onWindowState: subscribe('window:state'),
  // files
  pathForFile: file => webUtils.getPathForFile(file),
  onOpenFiles: subscribe('app:open-files'),
  // settings & info
  getSettings: () => ipcRenderer.invoke('settings:get'),
  setSettings: patch => ipcRenderer.invoke('settings:set', patch),
  resetSettings: () => ipcRenderer.invoke('settings:reset'),
  getInfo: () => ipcRenderer.invoke('app:info'),
  chooseFolder: purpose => ipcRenderer.invoke('dialog:choose-folder', purpose),
  releaseOutput: token => ipcRenderer.invoke('dialog:release-output', token),
  locateEngine: engine => ipcRenderer.invoke('dialog:locate-engine', engine),
  // jobs
  runJob: job => ipcRenderer.invoke('job:run', job),
  cancelJob: id => ipcRenderer.send('job:cancel', id),
  writeOutput: payload => ipcRenderer.invoke('job:write', payload),
  discardOutputs: paths => ipcRenderer.invoke('job:discard', paths),
  releaseFolders: jobId => ipcRenderer.send('job:release-folders', jobId),
  onJobProgress: subscribe('job:progress'),
  notify: summary => ipcRenderer.send('app:notify', summary),
  // shell
  openPath: file => ipcRenderer.invoke('shell:open-path', file),
  showItem: file => ipcRenderer.invoke('shell:show-item', file),
  openFolder: folder => ipcRenderer.invoke('shell:open-folder', folder),
  openLink: which => ipcRenderer.invoke('shell:open-link', which),
  // updates
  checkForUpdates: () => ipcRenderer.invoke('updates:check'),
  downloadUpdate: () => ipcRenderer.invoke('updates:download'),
  installUpdate: () => ipcRenderer.send('updates:install'),
  onUpdateStatus: subscribe('updates:status')
});
