import { app, BrowserWindow, shell, ipcMain, nativeImage, dialog } from 'electron';

// SILENCE NOISY LANGCHAIN WARNINGS
process.env.LANGCHAIN_ADAPTER_MIGRATION_WARNING = 'false';
process.env.LANGCHAIN_VERBOSE = 'false';
process.env.ELECTRON_DISABLE_SECURITY_WARNINGS = 'true';

// Monkey-patch console.warn to forcefully silence the migration warning
const originalWarn = console.warn;
console.warn = (...args) => {
  if (typeof args[0] === 'string' && args[0].includes('New LangChain packages are available')) {
    return;
  }
  originalWarn(...args);
};

import { autoUpdater } from 'electron-updater';
import { join } from 'path';
import { electronApp, optimizer, is } from '@electron-toolkit/utils';
import { setupBrowserHandlers } from './ipc/browser';
import { setupSettingsHandlers } from './ipc/settings';
import { setupMCPHandlers } from './ipc/mcp';
import { setupAIHandlers } from './services/ai';
import { setupStripeHandlers } from './ipc/stripe';
import { setupEngagementHandlers } from './ipc/engagement';
import { setupTaskHandlers } from './ipc/tasks';
import { setupMenu } from './menu';
import { analytics, setupAnalyticsHandlers } from './services/analytics';
import { initOTLPLogging, shutdownLogging } from './services/logging';
import { taskQueueService } from './services/task-queue.service';
import { config } from 'dotenv';

// Load environment variables for Main process
config();

// MASK SIGNALS: Disable blink automation signals app-wide
// This is the most effective way to set navigator.webdriver to false
app.commandLine.appendSwitch('disable-blink-features', 'AutomationControlled');
app.commandLine.appendSwitch('disable-infobars');
app.commandLine.appendSwitch('no-sandbox'); // Be careful with this, but often helpful for evasion in isolated environments

// Initialize Analytics & Logging
analytics.init();
initOTLPLogging();

// Force app name for dev and production
app.name = 'Reavion';
app.setName('Reavion');

let mainWindow: BrowserWindow | null = null;

// Register protocol
const protocol = 'reavion';
let pendingAuthHash: string | null = null;

if (process.defaultApp) {
  if (process.argv.length >= 2) {
    app.setAsDefaultProtocolClient(protocol, process.execPath, [join(__dirname, '../../')]);
  }
} else {
  app.setAsDefaultProtocolClient(protocol);
}

function handleAuthRedirect(url: string): void {
  console.log('[Main] Handling auth redirect URL:', url);
  // Supabase URL can contain the tokens after # or ?
  const hash = url.includes('#') ? url.split('#')[1] : url.split('?')[1];

  if (hash) {
    if (mainWindow && mainWindow.webContents) {
      console.log('[Main] Sending auth callback to renderer');
      mainWindow.webContents.send('supabase:auth-callback', hash);
    } else {
      console.log('[Main] No main window or webContents yet, storing pending auth hash');
      pendingAuthHash = hash;
    }
  }
}

// Handle protocol URL on Windows/Linux (Initial instance)
const initialProtocolUrl = process.argv.find((arg) => arg.startsWith(`${protocol}://`));
if (initialProtocolUrl) {
  handleAuthRedirect(initialProtocolUrl);
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
      partition: 'persist:main',
    },
  });

  // Setup application menu
  setupMenu(mainWindow);

  mainWindow.on('ready-to-show', () => {
    mainWindow?.maximize();
    // Use showInactive to prevent stealing focus from other apps on launch
    mainWindow?.showInactive();

    // Handle pending auth hash from cold start
    if (pendingAuthHash && mainWindow) {
      mainWindow.webContents.send('supabase:auth-callback', pendingAuthHash);
      pendingAuthHash = null;
    }
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
        // Only focus if not already focused to avoid stealing from other apps
        if (!mainWindow.isVisible()) {
          mainWindow.show();
        }
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
    setupStripeHandlers(ipcMain);
    setupAnalyticsHandlers(ipcMain);
    setupEngagementHandlers(ipcMain);
    setupTaskHandlers(ipcMain);

    // Start background task processing
    taskQueueService.startPolling();

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

    ipcMain.handle('dialog:open-file', async (_event, options: { title?: string; filters?: { name: string; extensions: string[] }[] }) => {
      if (!mainWindow) return null;
      const result = await dialog.showOpenDialog(mainWindow, {
        title: options.title || 'Select File',
        properties: ['openFile'],
        filters: options.filters || [],
      });
      if (result.canceled) return null;
      return result.filePaths[0];
    });

    createWindow();

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
      }
    });

    analytics.track('App Started', { isDev: is.dev });
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

app.on('will-quit', async () => {
  await Promise.all([
    analytics.shutdown(),
    shutdownLogging()
  ]);
});

