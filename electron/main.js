'use strict';

require('dotenv').config();

const { app, BrowserWindow, Tray, Menu, screen, nativeImage } = require('electron');
const path = require('path');

const WIDGET_W = 320;
const WIDGET_H = 480;

let win;
let tray;

function getBottomRightPosition() {
  const { width, height } = screen.getPrimaryDisplay().workAreaSize;
  return {
    x: width  - WIDGET_W - 16,
    y: height - WIDGET_H - 16,
  };
}

function createWindow() {
  const { x, y } = getBottomRightPosition();

  win = new BrowserWindow({
    width:       WIDGET_W,
    height:      WIDGET_H,
    x,
    y,
    frame:       false,
    resizable:   false,
    alwaysOnTop: true,
    skipTaskbar: true,
    transparent: true,
    show:        false,
    webPreferences: {
      preload:          path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration:  false,
    },
  });

  win.loadFile(path.join(__dirname, 'renderer.html'));

  // Hide when focus is lost
  win.on('blur', () => {
    if (win && !win.isDestroyed()) win.hide();
  });
}

function createTray() {
  const icon = nativeImage.createEmpty();
  tray = new Tray(icon);
  tray.setToolTip('nextUp Calendar');

  tray.on('click', () => {
    if (!win) return;
    if (win.isVisible()) {
      win.hide();
    } else {
      const { x, y } = getBottomRightPosition();
      win.setPosition(x, y);
      win.show();
      win.focus();
      // Trigger a data refresh each time the widget is shown
      win.webContents.send('ipc:do-refresh');
    }
  });

  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Refresh',
      click: () => {
        if (win && win.isVisible()) win.webContents.send('ipc:do-refresh');
      },
    },
    { type: 'separator' },
    { label: 'Quit', click: () => app.quit() },
  ]);

  tray.on('right-click', () => tray.popUpContextMenu(contextMenu));
}

app.whenReady().then(() => {
  createWindow();
  createTray();
});

app.on('window-all-closed', () => {
  // Do not quit — app lives in the system tray
});
