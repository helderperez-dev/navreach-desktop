import { app, BrowserWindow, shell, ipcMain, nativeImage } from 'electron';
import { autoUpdater } from 'electron-updater';
import { join } from 'path';
import { electronApp, optimizer, is } from '@electron-toolkit/utils';
import { setupBrowserHandlers } from './ipc/browser';
import { setupSettingsHandlers } from './ipc/settings';
import { setupMCPHandlers } from './ipc/mcp';
import { setupAIHandlers } from './services/ai';
import { setupMenu } from './menu';
import { config } from 'dotenv';

// Load environment variables for Main process
config();

// Force app name for dev and production
app.name = 'Reavion';

let mainWindow: BrowserWindow | null = null;

// Register protocol
if (process.defaultApp) {
  if (process.argv.length >= 2) {
    app.setAsDefaultProtocolClient('reavion', process.execPath, [join(__dirname, '../../')]);
  }
} else {
  app.setAsDefaultProtocolClient('reavion');
}

function handleAuthRedirect(url: string): void {
  const hash = url.split('#')[1];
  if (hash && mainWindow) {
    mainWindow.webContents.send('supabase:auth-callback', hash);
  }
}

function createWindow(): void {
  const iconPath = is.dev
    ? join(__dirname, '../../src/assets/icon.png')
    : join(__dirname, '../renderer/assets/icon.png'); // Fallback for production

  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1000,
    minHeight: 700,
    show: false,
    frame: false,
    icon: nativeImage.createFromPath(iconPath),
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

  // Setup application menu
  setupMenu(mainWindow);

  mainWindow.on('ready-to-show', () => {
    mainWindow?.maximize();
    mainWindow?.show();
  });

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url);
    return { action: 'deny' };
  });

  mainWindow.on('enter-full-screen', () => {
    mainWindow?.webContents.send('window:fullscreen-change', true);
  });

  mainWindow.on('leave-full-screen', () => {
    mainWindow?.webContents.send('window:fullscreen-change', false);
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
      const url = commandLine.pop();
      if (url && url.startsWith('reavion://')) {
        if (mainWindow.isMinimized()) mainWindow.restore();
        mainWindow.focus();
        handleAuthRedirect(url);
      }
    }
  });

  app.whenReady().then(() => {
    electronApp.setAppUserModelId('com.reavion.app');

    // Auto-updater
    autoUpdater.checkForUpdatesAndNotify();

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
      app.quit();
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
  app.quit();
});

