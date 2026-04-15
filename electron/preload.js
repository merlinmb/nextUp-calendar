'use strict';

const { contextBridge, ipcRenderer } = require('electron');

require('dotenv').config();

contextBridge.exposeInMainWorld('electronAPI', {
  serverUrl: process.env.SERVER_URL || 'http://homebridge.local:3050',
  onRefresh: (cb) => ipcRenderer.on('ipc:do-refresh', cb),
});
