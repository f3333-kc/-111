const fs = require('fs');
const path = require('path');
const { app, BrowserWindow } = require('electron');
const { startServer, PORT } = require('./server.js');
const { resolveApiBaseUrl } = require('./config');

let mainWindow;

function loadAppConfig() {
  const configPath = path.join(__dirname, 'app-config.json');

  try {
    const raw = fs.readFileSync(configPath, 'utf8');
    const parsed = JSON.parse(raw || '{}');
    return parsed.apiUrl || parsed.apiURL || '';
  } catch (error) {
    return '';
  }
}

function createWindow() {
  const appUrl = resolveApiBaseUrl(process.env.APP_API_URL || loadAppConfig() || `http://localhost:${PORT}`);
  const shouldStartLocalServer = /localhost|127\.0\.0\.1|0\.0\.0\.0/i.test(appUrl);

  mainWindow = new BrowserWindow({
    width: 1200,
    height: 900,
    minWidth: 980,
    minHeight: 700,
    title: '护航单后台',
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  });

  if (shouldStartLocalServer) {
    startServer(PORT);
  }

  mainWindow.loadURL(appUrl);
  mainWindow.setMenuBarVisibility(false);
}

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('before-quit', () => {
  if (mainWindow) {
    mainWindow.removeAllListeners();
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
