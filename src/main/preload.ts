import { contextBridge, ipcRenderer } from 'electron';
import type { AppSettings } from '../shared/types';

console.log('Preload script starting...');

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
  registerWebview: (tabId: string, webContentsId: number) => ipcRenderer.invoke('browser:register-webview', tabId, webContentsId) as Promise<{ success: boolean; reason?: string }>,
  unregisterWebview: (tabId: string) => ipcRenderer.invoke('browser:unregister-webview', tabId),
  allowNavigation: (url: string) => ipcRenderer.invoke('browser:allow-navigation', url),
  openExternal: (url: string) => ipcRenderer.invoke('browser:open-external', url),
  download: (url: string) => ipcRenderer.invoke('browser:download', url),
};

const settingsAPI = {
  get: <T>(key: string) => ipcRenderer.invoke('settings:get', key) as Promise<T>,
  set: <T>(key: string, value: T) => ipcRenderer.invoke('settings:set', key, value),
  getAll: (accessToken?: string) => ipcRenderer.invoke('settings:get-all', accessToken) as Promise<AppSettings>,
  reset: () => ipcRenderer.invoke('settings:reset'),

  // Platform Knowledge
  getPlatformKnowledge: (accessToken?: string) => ipcRenderer.invoke('settings:get-platform-knowledge', accessToken) as Promise<any[]>,
  addPlatformKnowledge: (record: any, accessToken?: string) => ipcRenderer.invoke('settings:add-platform-knowledge', record, accessToken) as Promise<{ success: boolean; data?: any; error?: string }>,
  updatePlatformKnowledge: (record: any, accessToken?: string) => ipcRenderer.invoke('settings:update-platform-knowledge', record, accessToken) as Promise<{ success: boolean; data?: any; error?: string }>,
  deletePlatformKnowledge: (id: string, accessToken?: string) => ipcRenderer.invoke('settings:delete-platform-knowledge', id, accessToken) as Promise<{ success: boolean; error?: string }>,

  // Agent Profile
  getAgentProfile: (accessToken?: string) => ipcRenderer.invoke('settings:get-agent-profile', accessToken) as Promise<any>,
  updateAgentProfile: (profile: any, accessToken?: string) => ipcRenderer.invoke('settings:update-agent-profile', profile, accessToken) as Promise<{ success: boolean; error?: string }>,

  // Dynamic Knowledge Bases
  getKnowledgeBases: (accessToken?: string) => ipcRenderer.invoke('settings:get-knowledge-bases', accessToken) as Promise<any[]>,
  createKnowledgeBase: (name: string, description?: string, accessToken?: string) => ipcRenderer.invoke('settings:create-knowledge-base', name, description, accessToken) as Promise<{ success: boolean; data?: any; error?: string }>,
  deleteKnowledgeBase: (id: string, accessToken?: string) => ipcRenderer.invoke('settings:delete-knowledge-base', id, accessToken) as Promise<{ success: boolean; error?: string }>,
  getKBContent: (kbId: string, accessToken?: string) => ipcRenderer.invoke('settings:get-kb-content', kbId, accessToken) as Promise<any[]>,
  addKBContent: (kbId: string, content: string, title?: string, accessToken?: string) => ipcRenderer.invoke('settings:add-kb-content', kbId, content, title, accessToken) as Promise<{ success: boolean; data?: any; error?: string }>,
  deleteKBContent: (id: string, accessToken?: string) => ipcRenderer.invoke('settings:delete-kb-content', id, accessToken) as Promise<{ success: boolean; error?: string }>,

  // Model Providers
  addModelProvider: (provider: any, accessToken?: string) => ipcRenderer.invoke('settings:add-model-provider', provider, accessToken) as Promise<{ success: boolean; provider?: any; error?: string }>,
  updateModelProvider: (provider: any, accessToken?: string) => ipcRenderer.invoke('settings:update-model-provider', provider, accessToken) as Promise<{ success: boolean; provider?: any; error?: string }>,
  deleteModelProvider: (id: string, accessToken?: string) => ipcRenderer.invoke('settings:delete-model-provider', id, accessToken) as Promise<{ success: boolean; error?: string }>,

  // MCP Servers
  addMCPServer: (server: any, accessToken?: string) => ipcRenderer.invoke('settings:add-mcp-server', server, accessToken) as Promise<{ success: boolean; server?: any; error?: string }>,
  updateMCPServer: (server: any, accessToken?: string) => ipcRenderer.invoke('settings:update-mcp-server', server, accessToken) as Promise<{ success: boolean; server?: any; error?: string }>,
  deleteMCPServer: (id: string, accessToken?: string) => ipcRenderer.invoke('settings:delete-mcp-server', id, accessToken) as Promise<{ success: boolean; error?: string }>,

  // API Tools
  addAPITool: (tool: any, accessToken?: string) => ipcRenderer.invoke('settings:add-api-tool', tool, accessToken) as Promise<{ success: boolean; tool?: any; error?: string }>,
  updateAPITool: (tool: any, accessToken?: string) => ipcRenderer.invoke('settings:update-api-tool', tool, accessToken) as Promise<{ success: boolean; tool?: any; error?: string }>,
  deleteAPITool: (id: string, accessToken?: string) => ipcRenderer.invoke('settings:delete-api-tool', id, accessToken) as Promise<{ success: boolean; error?: string }>,
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
  platform: process.platform,
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
  },
  openFile: (options: { title?: string; filters?: { name: string; extensions: string[] }[] }) => ipcRenderer.invoke('dialog:open-file', options) as Promise<string | null>,
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
  updateSession: (tokens: { accessToken: string; refreshToken: string }) => ipcRenderer.invoke('ai:update-session', tokens),
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

const analyticsAPI = {
  identify: (userId: string, email?: string) => ipcRenderer.invoke('analytics:identify', { userId, email }),
  group: (type: string, key: string, properties?: any) => ipcRenderer.invoke('analytics:group', { type, key, properties }),
};

const stripeAPI = {
  getConfig: () => ipcRenderer.invoke('stripe:get-config'),
  createPaymentIntent: (amount: number, currency: string, metadata?: any, customerId?: string) =>
    ipcRenderer.invoke('stripe:create-payment-intent', { amount, currency, metadata, customerId }),
  fulfillPaymentIntent: (paymentIntentId: string) =>
    ipcRenderer.invoke('stripe:fulfill-payment-intent', paymentIntentId),
  createSubscription: (customerId: string, priceId: string, promoCode?: string) =>
    ipcRenderer.invoke('stripe:create-subscription', { customerId, priceId, promoCode }),
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
  getTierLimits: (accessToken?: string) =>
    ipcRenderer.invoke('stripe:get-tier-limits', accessToken),
  getUsage: (accessToken: string, type: string) =>
    ipcRenderer.invoke('stripe:get-usage', accessToken, type),
  trackUsage: (accessToken: string, type: string, incrementBy?: number) =>
    ipcRenderer.invoke('stripe:track-usage', { accessToken, type, incrementBy }),
};

const engagementAPI = {
  getLogs: (accessToken: string, options?: any) => ipcRenderer.invoke('engagement:get-logs', { accessToken, ...options }),
  getStats: (accessToken: string) => ipcRenderer.invoke('engagement:get-stats', { accessToken }),
  exportCsv: (accessToken: string) => ipcRenderer.invoke('engagement:export-csv', { accessToken }),
};

const tasksAPI = {
  list: (params: { workspaceId: string; limit?: number }) => ipcRenderer.invoke('tasks:list', params),
  add: (params: { workspaceId: string; userId: string; type: string; payload: any; priority?: number }) => ipcRenderer.invoke('tasks:add', params),
  addBulk: (data: { workspaceId: string; userId: string; tasks: any[] }) => ipcRenderer.invoke('tasks:add-bulk', data),
  delete: (taskId: string) => ipcRenderer.invoke('tasks:delete', taskId),
  retry: (taskId: string) => ipcRenderer.invoke('tasks:retry', taskId),
  clearCompleted: (workspaceId: string) => ipcRenderer.invoke('tasks:clear-completed', workspaceId),
  process: () => ipcRenderer.invoke('tasks:process'),
};

console.log('Stripe API initialized with methods:', Object.keys(stripeAPI));
console.log('Tasks API initialized with methods:', Object.keys(tasksAPI));

export type BrowserAPI = typeof browserAPI;
export type SettingsAPI = typeof settingsAPI;
export type MCPAPI = typeof mcpAPI;

export interface WindowAPI {
  platform: string;
  minimize: () => Promise<void>;
  maximize: () => Promise<void>;
  close: () => Promise<void>;
  onMenuAction: (callback: (action: string) => void) => () => void;
  onFullScreenChange: (callback: (isFullScreen: boolean) => void) => () => void;
  openFile: (options: { title?: string; filters?: { name: string; extensions: string[] }[] }) => Promise<string | null>;
}

contextBridge.exposeInMainWorld('api', {
  browser: browserAPI,
  settings: settingsAPI,
  mcp: mcpAPI,
  window: windowAPI,
  ai: aiAPI,
  debug: debugAPI,
  auth: authAPI,
  analytics: analyticsAPI,
  stripe: stripeAPI,
  engagement: engagementAPI,
  tasks: tasksAPI,
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
      analytics: typeof analyticsAPI;
      stripe: typeof stripeAPI;
      engagement: typeof engagementAPI;
      tasks: typeof tasksAPI;
    };
  }
}
