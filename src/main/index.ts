import { app, BrowserWindow, shell, ipcMain } from 'electron';
import { join } from 'path';
import { electronApp, optimizer, is } from '@electron-toolkit/utils';
import { setupBrowserHandlers } from './ipc/browser';
import { setupSettingsHandlers } from './ipc/settings';
import { setupMCPHandlers } from './ipc/mcp';
import { setupAIHandlers } from './services/ai';
import { config } from 'dotenv';

// Load environment variables for Main process
config();

let mainWindow: BrowserWindow | null = null;

// Register protocol
if (process.defaultApp) {
  if (process.argv.length >= 2) {
    app.setAsDefaultProtocolClient('navreach', process.execPath, [join(__dirname, '../../')]);
  }
} else {
  app.setAsDefaultProtocolClient('navreach');
}

function handleAuthRedirect(url: string): void {
  const hash = url.split('#')[1];
  if (hash && mainWindow) {
    mainWindow.webContents.send('supabase:auth-callback', hash);
  }
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1000,
    minHeight: 700,
    show: false,
    frame: false,
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 16, y: 16 },
    backgroundColor: '#0A0A0B',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false,
      webviewTag: true,
    },
  });

  mainWindow.on('ready-to-show', () => {
    mainWindow?.show();
  });

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url);
    return { action: 'deny' };
  });

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL']);
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'));
  }
}

// Handle second instance (Windows)
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', (_event, commandLine) => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
      const url = commandLine.pop();
      if (url) handleAuthRedirect(url);
    }
  });

  app.whenReady().then(() => {
    electronApp.setAppUserModelId('com.navreach.app');

    app.on('browser-window-created', (_, window) => {
      optimizer.watchWindowShortcuts(window);
    });

    setupBrowserHandlers(ipcMain);
    setupSettingsHandlers(ipcMain);
    setupMCPHandlers(ipcMain);
    setupAIHandlers(ipcMain);

    ipcMain.handle('window:minimize', () => {
      mainWindow?.minimize();
    });

    ipcMain.handle('window:maximize', () => {
      if (mainWindow?.isMaximized()) {
        mainWindow.unmaximize();
      } else {
        mainWindow?.maximize();
      }
    });

    ipcMain.handle('window:close', () => {
      mainWindow?.close();
    });

    createWindow();

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
      }
    });
  });
}

// Handle protocol on macOS
app.on('open-url', (event, url) => {
  event.preventDefault();
  handleAuthRedirect(url);
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
