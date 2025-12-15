import { contextBridge, ipcRenderer } from 'electron';

export type BrowserAPI = typeof browserAPI;
export type SettingsAPI = typeof settingsAPI;
export type MCPAPI = typeof mcpAPI;
export type WindowAPI = typeof windowAPI;

const browserAPI = {
  navigate: (tabId: string, url: string) => ipcRenderer.invoke('browser:navigate', tabId, url),
  goBack: (tabId: string) => ipcRenderer.invoke('browser:go-back', tabId),
  goForward: (tabId: string) => ipcRenderer.invoke('browser:go-forward', tabId),
  reload: (tabId: string) => ipcRenderer.invoke('browser:reload', tabId),
  stop: (tabId: string) => ipcRenderer.invoke('browser:stop', tabId),
  click: (tabId: string, selector: string) => ipcRenderer.invoke('browser:click', tabId, selector),
  type: (tabId: string, selector: string, text: string) => ipcRenderer.invoke('browser:type', tabId, selector, text),
  screenshot: (tabId: string) => ipcRenderer.invoke('browser:screenshot', tabId),
  extract: (tabId: string, selector: string) => ipcRenderer.invoke('browser:extract', tabId, selector),
  scroll: (tabId: string, direction: 'up' | 'down', amount: number) => ipcRenderer.invoke('browser:scroll', tabId, direction, amount),
  evaluate: (tabId: string, script: string) => ipcRenderer.invoke('browser:evaluate', tabId, script),
  getPageContent: (tabId: string) => ipcRenderer.invoke('browser:get-page-content', tabId),
  registerWebview: (tabId: string, webContentsId: number) => ipcRenderer.invoke('browser:register-webview', tabId, webContentsId),
  unregisterWebview: (tabId: string) => ipcRenderer.invoke('browser:unregister-webview', tabId),
  allowNavigation: (url: string) => ipcRenderer.invoke('browser:allow-navigation', url),
};

const settingsAPI = {
  get: <T>(key: string) => ipcRenderer.invoke('settings:get', key) as Promise<T>,
  set: <T>(key: string, value: T) => ipcRenderer.invoke('settings:set', key, value),
  getAll: () => ipcRenderer.invoke('settings:get-all'),
  reset: () => ipcRenderer.invoke('settings:reset'),
};

const mcpAPI = {
  connect: (serverId: string) => ipcRenderer.invoke('mcp:connect', serverId),
  disconnect: (serverId: string) => ipcRenderer.invoke('mcp:disconnect', serverId),
  listTools: (serverId: string) => ipcRenderer.invoke('mcp:list-tools', serverId),
  callTool: (serverId: string, toolName: string, args: Record<string, unknown>) => 
    ipcRenderer.invoke('mcp:call-tool', serverId, toolName, args),
  getStatus: (serverId: string) => ipcRenderer.invoke('mcp:get-status', serverId),
};

const windowAPI = {
  minimize: () => ipcRenderer.invoke('window:minimize'),
  maximize: () => ipcRenderer.invoke('window:maximize'),
  close: () => ipcRenderer.invoke('window:close'),
};

const aiAPI = {
  chat: (request: unknown) => ipcRenderer.invoke('ai:chat', request),
  chatSync: (request: unknown) => ipcRenderer.invoke('ai:chat-sync', request),
  onStreamChunk: (callback: (data: { content: string; done: boolean }) => void) => {
    const handler = (_event: unknown, data: { content: string; done: boolean }) => callback(data);
    ipcRenderer.on('ai:stream-chunk', handler);
    return () => ipcRenderer.removeListener('ai:stream-chunk', handler);
  },
};

const debugAPI = {
  onLog: (callback: (data: { type: string; message: string; data?: any }) => void) => {
    const handler = (_event: unknown, data: { type: string; message: string; data?: any }) => callback(data);
    ipcRenderer.on('debug:log', handler);
    return () => ipcRenderer.removeListener('debug:log', handler);
  },
};

contextBridge.exposeInMainWorld('api', {
  browser: browserAPI,
  settings: settingsAPI,
  mcp: mcpAPI,
  window: windowAPI,
  ai: aiAPI,
  debug: debugAPI,
});

export type DebugAPI = typeof debugAPI;

declare global {
  interface Window {
    api: {
      browser: BrowserAPI;
      settings: SettingsAPI;
      mcp: MCPAPI;
      window: WindowAPI;
      debug: DebugAPI;
    };
  }
}
