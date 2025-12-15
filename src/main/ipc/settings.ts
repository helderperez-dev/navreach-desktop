import { IpcMain } from 'electron';
import Store from 'electron-store';
import type { AppSettings, ModelProvider, MCPServer, APITool } from '../../shared/types';

const defaultSettings: AppSettings = {
  theme: 'dark',
  sidebarCollapsed: false,
  chatPanelCollapsed: false,
  chatPanelWidth: 400,
  defaultModelId: undefined,
  modelProviders: [],
  mcpServers: [],
  apiTools: [],
};

const store = new Store<AppSettings>({
  name: 'settings',
  defaults: defaultSettings,
});

export function setupSettingsHandlers(ipcMain: IpcMain): void {
  ipcMain.handle('settings:get', async (_event, key: keyof AppSettings) => {
    return store.get(key);
  });

  ipcMain.handle('settings:set', async (_event, key: keyof AppSettings, value: unknown) => {
    store.set(key, value);
    return { success: true };
  });

  ipcMain.handle('settings:get-all', async () => {
    return store.store;
  });

  ipcMain.handle('settings:reset', async () => {
    store.clear();
    Object.entries(defaultSettings).forEach(([key, value]) => {
      store.set(key as keyof AppSettings, value);
    });
    return { success: true };
  });

  ipcMain.handle('settings:add-model-provider', async (_event, provider: ModelProvider) => {
    const providers = store.get('modelProviders') || [];
    providers.push(provider);
    store.set('modelProviders', providers);
    return { success: true, provider };
  });

  ipcMain.handle('settings:update-model-provider', async (_event, provider: ModelProvider) => {
    const providers = store.get('modelProviders') || [];
    const index = providers.findIndex((p) => p.id === provider.id);
    if (index === -1) {
      return { success: false, reason: 'Provider not found' };
    }
    providers[index] = provider;
    store.set('modelProviders', providers);
    return { success: true, provider };
  });

  ipcMain.handle('settings:delete-model-provider', async (_event, providerId: string) => {
    const providers = store.get('modelProviders') || [];
    const filtered = providers.filter((p) => p.id !== providerId);
    store.set('modelProviders', filtered);
    return { success: true };
  });

  ipcMain.handle('settings:add-mcp-server', async (_event, server: MCPServer) => {
    const servers = store.get('mcpServers') || [];
    servers.push(server);
    store.set('mcpServers', servers);
    return { success: true, server };
  });

  ipcMain.handle('settings:update-mcp-server', async (_event, server: MCPServer) => {
    const servers = store.get('mcpServers') || [];
    const index = servers.findIndex((s) => s.id === server.id);
    if (index === -1) {
      return { success: false, reason: 'Server not found' };
    }
    servers[index] = server;
    store.set('mcpServers', servers);
    return { success: true, server };
  });

  ipcMain.handle('settings:delete-mcp-server', async (_event, serverId: string) => {
    const servers = store.get('mcpServers') || [];
    const filtered = servers.filter((s) => s.id !== serverId);
    store.set('mcpServers', filtered);
    return { success: true };
  });

  ipcMain.handle('settings:add-api-tool', async (_event, tool: APITool) => {
    const tools = store.get('apiTools') || [];
    tools.push(tool);
    store.set('apiTools', tools);
    return { success: true, tool };
  });

  ipcMain.handle('settings:update-api-tool', async (_event, tool: APITool) => {
    const tools = store.get('apiTools') || [];
    const index = tools.findIndex((t) => t.id === tool.id);
    if (index === -1) {
      return { success: false, reason: 'Tool not found' };
    }
    tools[index] = tool;
    store.set('apiTools', tools);
    return { success: true, tool };
  });

  ipcMain.handle('settings:delete-api-tool', async (_event, toolId: string) => {
    const tools = store.get('apiTools') || [];
    const filtered = tools.filter((t) => t.id !== toolId);
    store.set('apiTools', filtered);
    return { success: true };
  });
}
