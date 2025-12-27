import { IpcMain, BrowserWindow, webContents } from 'electron';
import { registerWebviewContents, unregisterWebviewContents, getWebviewContents, setNavigationBlocked, allowNavigation } from '../services/browser-tools';

export function setupBrowserHandlers(ipcMain: IpcMain): void {
  ipcMain.handle('browser:navigate', async (_event, tabId: string, url: string) => {
    const contents = getWebviewContents(tabId);
    if (!contents) {
      throw new Error(`Tab ${tabId} not found`);
    }
    // Allow navigation for this URL before loading
    allowNavigation(url);
    await contents.loadURL(url);
    return { success: true, url };
  });

  ipcMain.handle('browser:allow-navigation', async (_event, url: string) => {
    allowNavigation(url);
    return { success: true };
  });

  ipcMain.handle('browser:go-back', async (_event, tabId: string) => {
    const contents = getWebviewContents(tabId);
    if (!contents) throw new Error(`Tab ${tabId} not found`);
    if (contents.canGoBack()) {
      contents.goBack();
      return { success: true };
    }
    return { success: false, reason: 'Cannot go back' };
  });

  ipcMain.handle('browser:go-forward', async (_event, tabId: string) => {
    const contents = getWebviewContents(tabId);
    if (!contents) throw new Error(`Tab ${tabId} not found`);
    if (contents.canGoForward()) {
      contents.goForward();
      return { success: true };
    }
    return { success: false, reason: 'Cannot go forward' };
  });

  ipcMain.handle('browser:reload', async (_event, tabId: string) => {
    const contents = getWebviewContents(tabId);
    if (!contents) throw new Error(`Tab ${tabId} not found`);
    contents.reload();
    return { success: true };
  });

  ipcMain.handle('browser:stop', async (_event, tabId: string) => {
    const contents = getWebviewContents(tabId);
    if (!contents) throw new Error(`Tab ${tabId} not found`);
    contents.stop();
    return { success: true };
  });

  ipcMain.handle('browser:click', async (_event, tabId: string, selector: string) => {
    const contents = getWebviewContents(tabId);
    if (!contents) throw new Error(`Tab ${tabId} not found`);

    const result = await contents.executeJavaScript(`
      (function() {
        const element = document.querySelector('${selector.replace(/'/g, "\\'")}');
        if (!element) return { success: false, reason: 'Element not found' };
        element.click();
        return { success: true };
      })()
    `);
    return result;
  });

  ipcMain.handle('browser:type', async (_event, tabId: string, selector: string, text: string) => {
    const contents = getWebviewContents(tabId);
    if (!contents) throw new Error(`Tab ${tabId} not found`);

    const result = await contents.executeJavaScript(`
      (function() {
        const element = document.querySelector('${selector.replace(/'/g, "\\'")}');
        if (!element) return { success: false, reason: 'Element not found' };
        // element.focus();
        element.value = '${text.replace(/'/g, "\\'")}';
        element.dispatchEvent(new Event('input', { bubbles: true }));
        element.dispatchEvent(new Event('change', { bubbles: true }));
        return { success: true };
      })()
    `);
    return result;
  });

  ipcMain.handle('browser:screenshot', async (_event, tabId: string) => {
    const contents = getWebviewContents(tabId);
    if (!contents) throw new Error(`Tab ${tabId} not found`);

    const image = await contents.capturePage();
    return { success: true, data: image.toDataURL() };
  });

  ipcMain.handle('browser:extract', async (_event, tabId: string, selector: string) => {
    const contents = getWebviewContents(tabId);
    if (!contents) throw new Error(`Tab ${tabId} not found`);

    const result = await contents.executeJavaScript(`
      (function() {
        const element = document.querySelector('${selector.replace(/'/g, "\\'")}');
        if (!element) return { success: false, reason: 'Element not found' };
        return { success: true, text: element.innerText, html: element.innerHTML };
      })()
    `);
    return result;
  });

  ipcMain.handle('browser:scroll', async (_event, tabId: string, direction: 'up' | 'down', amount: number) => {
    const contents = getWebviewContents(tabId);
    if (!contents) throw new Error(`Tab ${tabId} not found`);

    const scrollAmount = direction === 'down' ? amount : -amount;
    await contents.executeJavaScript(`window.scrollBy(0, ${scrollAmount})`);
    return { success: true };
  });

  ipcMain.handle('browser:evaluate', async (_event, tabId: string, script: string) => {
    const contents = getWebviewContents(tabId);
    if (!contents) throw new Error(`Tab ${tabId} not found`);

    try {
      const result = await contents.executeJavaScript(script);
      return { success: true, result };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  });

  ipcMain.handle('browser:get-page-content', async (_event, tabId: string) => {
    const contents = getWebviewContents(tabId);
    if (!contents) throw new Error(`Tab ${tabId} not found`);

    const result = await contents.executeJavaScript(`
      (function() {
        return {
          title: document.title,
          url: window.location.href,
          text: document.body.innerText,
          html: document.documentElement.outerHTML
        };
      })()
    `);
    return { success: true, ...result };
  });

  ipcMain.handle('browser:register-webview', async (_event, tabId: string, webContentsId: number) => {
    const contents = webContents.fromId(webContentsId);
    if (contents) {
      registerWebviewContents(tabId, contents);
      return { success: true };
    }
    return { success: false, reason: 'WebContents not found' };
  });

  ipcMain.handle('browser:unregister-webview', async (_event, tabId: string) => {
    unregisterWebviewContents(tabId);
    return { success: true };
  });
}
