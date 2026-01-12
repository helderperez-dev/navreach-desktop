import { IpcMain, powerSaveBlocker } from 'electron';
import Store from 'electron-store';
import { supabase } from '../lib/supabase';
import type { AppSettings, ModelProvider, MCPServer, APITool, ModelConfig } from '../../shared/types';

let sleepBlockerId: number | null = null;

function updatePowerSaveBlocker(prevent: boolean) {
  if (prevent) {
    if (sleepBlockerId === null) {
      sleepBlockerId = powerSaveBlocker.start('prevent-app-suspension');
      console.log('Power save blocker started:', sleepBlockerId);
    }
  } else {
    if (sleepBlockerId !== null) {
      powerSaveBlocker.stop(sleepBlockerId);
      console.log('Power save blocker stopped:', sleepBlockerId);
      sleepBlockerId = null;
    }
  }
}

const defaultSettings: AppSettings = {
  theme: 'dark',
  sidebarCollapsed: false,
  chatPanelCollapsed: false,
  chatPanelWidth: 400,
  defaultModelId: undefined,
  modelProviders: [],
  mcpServers: [],
  apiTools: [],
  preventSleep: false,
  agentRunMode: 'manual',
  agentRunDuration: 60,
};

const store = new Store<AppSettings>({
  name: 'settings',
  defaults: defaultSettings,
});

// Initialize on startup
updatePowerSaveBlocker(store.get('preventSleep'));

export function setupSettingsHandlers(ipcMain: IpcMain): void {
  ipcMain.handle('settings:get', async (_event, key: keyof AppSettings) => {
    return store.get(key);
  });

  ipcMain.handle('settings:set', async (_event, key: keyof AppSettings, value: unknown) => {
    store.set(key, value);
    if (key === 'preventSleep') {
      updatePowerSaveBlocker(value as boolean);
    }
    return { success: true };
  });

  ipcMain.handle('settings:get-all', async () => {
    const localSettings = store.store;

    try {
      // Fetch system settings for managed AI provider
      const { data: systemData } = await supabase
        .from('system_settings')
        .select('key, value');

      const sysSettings = (systemData || []).reduce((acc: any, curr: any) => {
        acc[curr.key] = curr.value;
        return acc;
      }, {});

      const defaultProviderType = sysSettings['default_ai_provider'];
      const defaultModelId = sysSettings['default_ai_model'];
      const hasSystemKey = !!sysSettings['system_ai_api_key'];

      // Always prepend the System Default provider if configured, even if key is missing (visibility preference)
      if (defaultProviderType && defaultModelId) {
        // Create the system managed provider
        const systemProvider: ModelProvider = {
          id: 'system-default',
          name: 'Reavion',
          type: defaultProviderType,
          apiKey: 'managed-by-system',
          enabled: true,
          models: [
            {
              id: defaultModelId,
              name: 'Reavion Flash',
              providerId: 'system-default',
              contextWindow: 128000,
              enabled: true
            }
          ]
        };

        // If local settings already have providers, system default goes first.
        // We filter out any previous system-default if it somehow got saved to disk (unlikely but safe)
        const cleanLocalProviders = (localSettings.modelProviders || []).filter(p => p.id !== 'system-default');

        return {
          ...localSettings,
          modelProviders: [systemProvider, ...cleanLocalProviders]
        };
      }
    } catch (error) {
      console.error('Failed to fetch system settings:', error);
    }

    return localSettings;
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

  // Platform Knowledge Handlers
  ipcMain.handle('settings:get-platform-knowledge', async () => {
    const { data, error } = await supabase
      .from('platform_knowledge')
      .select('*')
      .order('domain', { ascending: true });

    if (error) {
      console.error('Error fetching platform knowledge:', error);
      return [];
    }
    return data;
  });

  ipcMain.handle('settings:add-platform-knowledge', async (_event, record: any) => {
    const { data, error } = await supabase
      .from('platform_knowledge')
      .insert(record)
      .select()
      .single();

    if (error) {
      console.error('Error adding platform knowledge:', error);
      return { success: false, error: error.message };
    }
    return { success: true, data };
  });

  ipcMain.handle('settings:update-platform-knowledge', async (_event, record: any) => {
    const { id, ...updates } = record;
    const { data, error } = await supabase
      .from('platform_knowledge')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('Error updating platform knowledge:', error);
      return { success: false, error: error.message };
    }
    return { success: true, data };
  });

  ipcMain.handle('settings:delete-platform-knowledge', async (_event, id: string) => {
    const { error } = await supabase
      .from('platform_knowledge')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('Error deleting platform knowledge:', error);
      return { success: false, error: error.message };
    }
    return { success: true };
  });

  // Agent Profile Handlers
  ipcMain.handle('settings:get-agent-profile', async () => {
    // Check for any existing user settings row
    const { data, error } = await supabase
      .from('user_settings')
      .select('agent_profile')
      .limit(1)
      .single();

    if (error) {
      return { persona: '', icp: '', tone: '' };
    }
    return data.agent_profile || { persona: '', icp: '', tone: '' };
  });

  ipcMain.handle('settings:update-agent-profile', async (_event, profile: any) => {
    // Try to get the first user_id
    const { data: existing } = await supabase.from('user_settings').select('user_id').limit(1).single();

    if (existing) {
      const { error } = await supabase
        .from('user_settings')
        .update({ agent_profile: profile, updated_at: new Date().toISOString() })
        .eq('user_id', existing.user_id);

      if (error) return { success: false, error: error.message };
      return { success: true };
    } else {
      return { success: false, error: 'No user settings found. Please save general settings first to create a user record.' };
    }
  });

  // Dynamic Knowledge Base Handlers
  ipcMain.handle('settings:get-knowledge-bases', async () => {
    const { data, error } = await supabase.from('knowledge_bases').select('*').order('name');
    return error ? [] : data;
  });

  ipcMain.handle('settings:create-knowledge-base', async (_event, name: string, description?: string) => {
    const { data, error } = await supabase.from('knowledge_bases').insert({ name, description }).select().single();
    return error ? { success: false, error: error.message } : { success: true, data };
  });

  ipcMain.handle('settings:delete-knowledge-base', async (_event, id: string) => {
    const { error } = await supabase.from('knowledge_bases').delete().eq('id', id);
    return { success: !error, error: error?.message };
  });

  ipcMain.handle('settings:get-kb-content', async (_event, kbId: string) => {
    const { data, error } = await supabase.from('knowledge_content').select('*').eq('kb_id', kbId).order('created_at');
    return error ? [] : data;
  });

  ipcMain.handle('settings:add-kb-content', async (_event, kbId: string, content: string, title?: string) => {
    const { data, error } = await supabase.from('knowledge_content').insert({ kb_id: kbId, content, title }).select().single();
    return error ? { success: false, error: error.message } : { success: true, data };
  });

  ipcMain.handle('settings:delete-kb-content', async (_event, id: string) => {
    const { error } = await supabase.from('knowledge_content').delete().eq('id', id);
    return { success: !error, error: error?.message };
  });
}
