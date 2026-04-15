'use strict';

const { contextBridge, ipcRenderer } = require('electron');

// SERVER_URL is injected by main.js via additionalArguments — no fs needed.
const serverArg = process.argv.find(a => a.startsWith('--server-url='));
const serverUrl = serverArg ? serverArg.slice('--server-url='.length) : 'http://homebridge.local:3050';

contextBridge.exposeInMainWorld('electronAPI', {
  serverUrl,
  onRefresh: (cb) => ipcRenderer.on('ipc:do-refresh', cb),
});
