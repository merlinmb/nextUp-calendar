'use strict';

const { contextBridge, ipcRenderer } = require('electron');

// SERVER_URL and READ_TOKEN are injected by main.js via additionalArguments
const serverArg = process.argv.find(a => a.startsWith('--server-url='));
const serverUrl = serverArg ? serverArg.slice('--server-url='.length) : 'http://homebridge.local:3050';

const tokenArg  = process.argv.find(a => a.startsWith('--read-token='));
const readToken = tokenArg ? tokenArg.slice('--read-token='.length) : '';

contextBridge.exposeInMainWorld('electronAPI', {
  serverUrl,
  readToken,
  onRefresh: (cb) => ipcRenderer.on('ipc:do-refresh', cb),
  loadConfig:  ()          => ipcRenderer.invoke('config:load'),
  saveConfig:  (overrides) => ipcRenderer.invoke('config:save', overrides),
});
