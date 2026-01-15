import { contextBridge, ipcRenderer } from 'electron';

console.log('Preload script starting...');

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
  startRecording: (tabId: string) => ipcRenderer.invoke('browser:start-recording', tabId),
  stopRecording: (tabId: string) => ipcRenderer.invoke('browser:stop-recording', tabId),
  onRecordingAction: (callback: (data: any) => void) => {
    const handler = (_event: any, data: any) => callback(data);
    ipcRenderer.on('recorder:action', handler);
    return () => ipcRenderer.removeListener('recorder:action', handler);
  },
  startInspector: (tabId: string) => ipcRenderer.invoke('browser:start-inspector', tabId),
  stopInspector: (tabId: string) => ipcRenderer.invoke('browser:stop-inspector', tabId),
  onInspectorAction: (callback: (data: any) => void) => {
    const handler = (_event: any, data: any) => callback(data);
    ipcRenderer.on('inspector:action', handler);
    return () => ipcRenderer.removeListener('inspector:action', handler);
  },
  registerWebview: (tabId: string, webContentsId: number) => ipcRenderer.invoke('browser:register-webview', tabId, webContentsId),
  unregisterWebview: (tabId: string) => ipcRenderer.invoke('browser:unregister-webview', tabId),
  allowNavigation: (url: string) => ipcRenderer.invoke('browser:allow-navigation', url),
  openExternal: (url: string) => ipcRenderer.invoke('browser:open-external', url),
  download: (url: string) => ipcRenderer.invoke('browser:download', url),
};

const settingsAPI = {
  get: <T>(key: string) => ipcRenderer.invoke('settings:get', key) as Promise<T>,
  set: <T>(key: string, value: T) => ipcRenderer.invoke('settings:set', key, value),
  getAll: () => ipcRenderer.invoke('settings:get-all'),
  reset: () => ipcRenderer.invoke('settings:reset'),

  // Platform Knowledge
  getPlatformKnowledge: () => ipcRenderer.invoke('settings:get-platform-knowledge'),
  addPlatformKnowledge: (record: any) => ipcRenderer.invoke('settings:add-platform-knowledge', record),
  updatePlatformKnowledge: (record: any) => ipcRenderer.invoke('settings:update-platform-knowledge', record),
  deletePlatformKnowledge: (id: string) => ipcRenderer.invoke('settings:delete-platform-knowledge', id),

  // Agent Profile
  getAgentProfile: () => ipcRenderer.invoke('settings:get-agent-profile'),
  updateAgentProfile: (profile: any) => ipcRenderer.invoke('settings:update-agent-profile', profile),

  // Dynamic Knowledge Bases
  getKnowledgeBases: () => ipcRenderer.invoke('settings:get-knowledge-bases'),
  createKnowledgeBase: (name: string, description?: string) => ipcRenderer.invoke('settings:create-knowledge-base', name, description),
  deleteKnowledgeBase: (id: string) => ipcRenderer.invoke('settings:delete-knowledge-base', id),
  getKBContent: (kbId: string) => ipcRenderer.invoke('settings:get-kb-content', kbId),
  addKBContent: (kbId: string, content: string, title?: string) => ipcRenderer.invoke('settings:add-kb-content', kbId, content, title),
  deleteKBContent: (id: string) => ipcRenderer.invoke('settings:delete-kb-content', id),
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
  onMenuAction: (callback: (action: string) => void) => {
    const handler = (_event: unknown, action: string) => callback(action);
    ipcRenderer.on('menu:action', handler);
    return () => ipcRenderer.removeListener('menu:action', handler);
  },
  onFullScreenChange: (callback: (isFullScreen: boolean) => void) => {
    const handler = (_event: unknown, isFullScreen: boolean) => callback(isFullScreen);
    ipcRenderer.on('window:fullscreen-change', handler);
    return () => ipcRenderer.removeListener('window:fullscreen-change', handler);
  }
};

const aiAPI = {
  chat: (request: unknown) => ipcRenderer.invoke('ai:chat', request),
  chatSync: (request: unknown) => ipcRenderer.invoke('ai:chat-sync', request),
  stop: () => ipcRenderer.invoke('ai:stop'),
  onStreamChunk: (callback: (data: { content: string; done: boolean; isNarration?: boolean; toolCall?: any; toolResult?: any }) => void) => {
    const handler = (_event: unknown, data: { content: string; done: boolean; isNarration?: boolean; toolCall?: any; toolResult?: any }) => callback(data);
    ipcRenderer.on('ai:stream-chunk', handler);
    return () => ipcRenderer.removeListener('ai:stream-chunk', handler);
  },
  listWorkflows: () => ipcRenderer.invoke('ai:list-workflows'),
  suggest: (request: unknown) => ipcRenderer.invoke('ai:suggest', request),
  testConnection: (provider: any, modelId?: string) => ipcRenderer.invoke('ai:test-connection', { provider, modelId }),
  onPlaybookStatus: (callback: (data: { nodeId: string; status: 'running' | 'success' | 'error'; message?: string }) => void) => {
    const handler = (_event: unknown, data: any) => callback(data);
    ipcRenderer.on('ai:playbook-status', handler);
    return () => ipcRenderer.removeListener('ai:playbook-status', handler);
  },
  resetContext: (workspaceId?: string) => ipcRenderer.invoke('ai:reset-context', workspaceId),
};

const debugAPI = {
  onLog: (callback: (data: { type: string; message: string; data?: any }) => void) => {
    const handler = (_event: unknown, data: { type: string; message: string; data?: any }) => callback(data);
    ipcRenderer.on('debug:log', handler);
    return () => ipcRenderer.removeListener('debug:log', handler);
  },
};

const authAPI = {
  onAuthCallback: (callback: (hash: string) => void) => {
    const handler = (_event: unknown, hash: string) => callback(hash);
    ipcRenderer.on('supabase:auth-callback', handler);
    return () => ipcRenderer.removeListener('supabase:auth-callback', handler);
  },
};

const stripeAPI = {
  getConfig: () => ipcRenderer.invoke('stripe:get-config'),
  createPaymentIntent: (amount: number, currency: string, metadata?: any, customerId?: string) =>
    ipcRenderer.invoke('stripe:create-payment-intent', { amount, currency, metadata, customerId }),
  fulfillPaymentIntent: (paymentIntentId: string) =>
    ipcRenderer.invoke('stripe:fulfill-payment-intent', paymentIntentId),
  createSubscription: (customerId: string, priceId: string) =>
    ipcRenderer.invoke('stripe:create-subscription', { customerId, priceId }),
  createCustomer: (email: string, name?: string) =>
    ipcRenderer.invoke('stripe:create-customer', { email, name }),
  createPortalSession: (customerId: string, returnUrl: string) =>
    ipcRenderer.invoke('stripe:create-portal-session', { customerId, returnUrl }),
  getInvoices: (customerId: string) =>
    ipcRenderer.invoke('stripe:get-invoices', customerId),
  getPaymentMethods: (customerId: string) =>
    ipcRenderer.invoke('stripe:get-payment-methods', customerId),
  cancelSubscription: (subscriptionId: string) =>
    ipcRenderer.invoke('stripe:cancel-subscription', subscriptionId),
  updateSubscription: (subscriptionId: string, params: any) =>
    ipcRenderer.invoke('stripe:update-subscription', { subscriptionId, params }),
  createSetupIntent: (customerId: string) =>
    ipcRenderer.invoke('stripe:create-setup-intent', customerId),
  deletePaymentMethod: (paymentMethodId: string) =>
    ipcRenderer.invoke('stripe:delete-payment-method', paymentMethodId),
  getSubscriptions: (customerId: string) =>
    ipcRenderer.invoke('stripe:get-subscriptions', customerId),
  getCustomer: (customerId: string) =>
    ipcRenderer.invoke('stripe:get-customer', customerId),
  setDefaultPaymentMethod: (customerId: string, paymentMethodId: string) =>
    ipcRenderer.invoke('stripe:set-default-payment-method', { customerId, paymentMethodId }),
};

console.log('Stripe API initialized with methods:', Object.keys(stripeAPI));

contextBridge.exposeInMainWorld('api', {
  browser: browserAPI,
  settings: settingsAPI,
  mcp: mcpAPI,
  window: windowAPI,
  ai: aiAPI,
  debug: debugAPI,
  auth: authAPI,
  stripe: stripeAPI,
});

export type DebugAPI = typeof debugAPI;

declare global {
  interface Window {
    api: {
      browser: BrowserAPI;
      settings: SettingsAPI;
      mcp: MCPAPI;
      window: WindowAPI;
      ai: typeof aiAPI;
      debug: DebugAPI;
      auth: typeof authAPI;
      stripe: typeof stripeAPI;
    };
  }
}
