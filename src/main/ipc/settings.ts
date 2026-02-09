import { IpcMain, powerSaveBlocker } from 'electron';
import Store from 'electron-store';
import { supabase, getScopedSupabase, getUserIdFromToken } from '../lib/supabase';
import type { AppSettings, ModelProvider, MCPServer, APITool } from '../../shared/types';

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
// CRITICAL: Force clear complex objects from local store to ensure we only use DB data
// This prevents stale/other user's data from persisting locally
store.set('mcpServers', []);
store.set('modelProviders', []);
store.set('apiTools', []);

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

  ipcMain.handle('settings:get-all', async (_event, accessToken?: string) => {
    const localSettings = store.store;

    // CLEANUP: Remove legacy local data that should now be in DB
    if (store.has('modelProviders')) store.delete('modelProviders' as any);
    if (store.has('mcpServers')) store.delete('mcpServers' as any);
    if (store.has('apiTools')) store.delete('apiTools' as any);

    // Filter out DB-backed fields from local storage to prevent leakage
    // of other users' data if the machine is shared or if persistent store
    // has stale data.
    const safeLocalSettings = {
      ...localSettings,
      modelProviders: [],
      mcpServers: [],
      apiTools: []
    };

    console.log('[Settings] get-all called with token:', accessToken ? 'YES (truncated: ' + accessToken.substring(0, 10) + '...)' : 'NO');
    if (!accessToken) return safeLocalSettings;

    try {
      const scopedSupabase = await getScopedSupabase(accessToken);
      const { data: { user } } = await scopedSupabase.auth.getUser();
      console.log('[Settings] Scoped client authenticated as:', user?.email || 'ANONYMOUS', 'ID:', user?.id || 'NONE');

      // Fetch all user-scoped settings
      const [providersRes, serversRes, toolsRes, sysSettingsRes, fallbackChainRes] = await Promise.all([
        scopedSupabase.from('model_providers').select('*').order('created_at'),
        scopedSupabase.from('mcp_servers').select('*').order('created_at'),
        scopedSupabase.from('api_tools').select('*').order('created_at'),
        // Use global client for system settings as they are not user-scoped
        supabase.from('system_settings').select('key, value'),
        supabase.from('ai_fallback_chain').select('*').order('sort_order', { ascending: true })
      ]);

      // Debug logging
      console.log('[Settings] Fetched model_providers:', providersRes.data?.length || 0, 'items', providersRes.error ? `Error: ${providersRes.error.message}` : '');
      console.log('[Settings] Fetched ai_fallback_chain:', fallbackChainRes.data?.length || 0, 'items', fallbackChainRes.error ? `Error: ${fallbackChainRes.error.message}` : '');

      const sysSettings = (sysSettingsRes.data || []).reduce((acc: any, curr: any) => {
        acc[curr.key] = curr.value;
        return acc;
      }, {});

      let defaultProviderType = undefined;
      let defaultModelId = undefined;

      // NEW LOGIC: Use dedicated table (ai_fallback_chain)
      const fallbackChain = fallbackChainRes.data || [];
      if (fallbackChain && fallbackChain.length > 0) {
        defaultModelId = fallbackChain[0].model_id;
        defaultProviderType = fallbackChain[0].provider_id;
      }

      if (!defaultProviderType) defaultProviderType = sysSettings['default_ai_provider'];
      if (!defaultModelId) defaultModelId = sysSettings['default_ai_model'];

      // BACK COMPATIBILITY: Derive defaults from fallback chain if legacy keys are missing
      if (!defaultProviderType || !defaultModelId) {
        try {
          const rawChain = sysSettings['reavion_nexus_fallback_chain'];
          if (rawChain) {
            const chain = typeof rawChain === 'string' ? JSON.parse(rawChain) : rawChain;
            if (Array.isArray(chain) && chain.length > 0) {
              const firstItem = chain[0];
              if (typeof firstItem === 'string') {
                defaultModelId = defaultModelId || firstItem;
                defaultProviderType = defaultProviderType || 'openrouter';
              } else {
                defaultModelId = defaultModelId || firstItem.model;
                defaultProviderType = defaultProviderType || (firstItem.gateway || firstItem.provider || 'openrouter');
              }
            }
          }
        } catch (e) {
          console.error('Error parsing fallback chain for settings defaults:', e);
        }
      }

      const modelProviders = (providersRes.data || []).map((p: any) => ({
        id: p.id,
        name: p.name,
        type: p.type,
        apiKey: p.api_key,
        baseUrl: p.base_url,
        models: p.models,
        enabled: p.enabled
      }));

      const mcpServers = (serversRes.data || []).map((s: any) => ({
        id: s.id,
        name: s.name,
        type: s.type,
        enabled: s.enabled,
        config: s.config
      }));

      const apiTools = (toolsRes.data || []).map((t: any) => ({
        id: t.id,
        name: t.name,
        description: t.description,
        enabled: t.enabled,
        endpoint: t.endpoint,
        method: t.method,
        headers: t.headers,
        queryParams: t.query_params,
        bodyTemplate: t.body_template,
        responseMapping: t.response_mapping,
        lastTestSuccess: t.last_test_success
      }));

      // Sync to local store for main-process services (like AI Agent)
      store.set('modelProviders', modelProviders);
      store.set('mcpServers', mcpServers);
      store.set('apiTools', apiTools);
      if (defaultModelId) {
        store.set('defaultModelId', defaultModelId);
      }

      // In-memory merge with system defaults
      if (defaultProviderType && defaultModelId) {
        const systemProvider: any = {
          id: 'system-default',
          name: 'Reavion',
          type: 'openai',
          enabled: true,
          models: [
            {
              id: defaultModelId,
              name: 'Reavion', // User wants branded default name
              providerId: 'system-default',
              contextWindow: 128000,
              enabled: true
            }
          ]
        };

        const finalProviders = [systemProvider, ...modelProviders.filter((p: any) => p.id !== 'system-default')];

        const currentUser = getUserIdFromToken(accessToken);
        console.log('[Settings] Returning providers for User ID:', currentUser, 'Count:', finalProviders.length);

        return {
          ...localSettings,
          defaultModelId,
          modelProviders: finalProviders,
          mcpServers,
          apiTools
        };
      }

      return {
        ...localSettings,
        modelProviders,
        mcpServers,
        apiTools
      };

    } catch (error) {
      console.error('Failed to fetch settings from DB:', error);
      return safeLocalSettings;
    }
  });

  ipcMain.handle('settings:reset', async () => {
    store.clear();
    Object.entries(defaultSettings).forEach(([key, value]) => {
      store.set(key as keyof AppSettings, value);
    });
    return { success: true };
  });

  // Model Providers
  ipcMain.handle('settings:add-model-provider', async (_event, provider: ModelProvider, accessToken?: string) => {
    if (!accessToken) return { success: false, error: 'Not authenticated' };

    const userId = getUserIdFromToken(accessToken);
    if (!userId) return { success: false, error: 'Invalid access token' };

    const scopedSupabase = await getScopedSupabase(accessToken);

    const { data, error } = await scopedSupabase
      .from('model_providers')
      .insert({
        id: provider.id.length > 30 ? provider.id : undefined, // use existing if valid UUID, else let DB generate
        user_id: userId, // Explicitly set user_id for RLS policy
        name: provider.name,
        type: provider.type,
        api_key: provider.apiKey,
        base_url: provider.baseUrl,
        models: provider.models,
        enabled: provider.enabled
      })
      .select()
      .single();

    if (error) return { success: false, error: error.message };

    // Sync to local store
    const current = store.get('modelProviders') || [];
    store.set('modelProviders', [...current, data]);

    return { success: true, provider: data };
  });

  ipcMain.handle('settings:update-model-provider', async (_event, provider: ModelProvider, accessToken?: string) => {
    const scopedSupabase = await getScopedSupabase(accessToken);
    const { error } = await scopedSupabase
      .from('model_providers')
      .update({
        name: provider.name,
        type: provider.type,
        api_key: provider.apiKey,
        base_url: provider.baseUrl,
        models: provider.models,
        enabled: provider.enabled,
        updated_at: new Date().toISOString()
      })
      .eq('id', provider.id);

    if (error) return { success: false, error: error.message };

    // Sync to local store
    const current = store.get('modelProviders') || [];
    store.set('modelProviders', current.map((p: any) => p.id === provider.id ? { ...p, ...provider } : p));

    return { success: true, provider };
  });

  ipcMain.handle('settings:delete-model-provider', async (_event, providerId: string, accessToken?: string) => {
    const scopedSupabase = await getScopedSupabase(accessToken);
    const { error } = await scopedSupabase
      .from('model_providers')
      .delete()
      .eq('id', providerId);

    if (error) return { success: false, error: error.message };

    // Sync to local store
    const current = store.get('modelProviders') || [];
    store.set('modelProviders', current.filter((p: any) => p.id !== providerId));

    return { success: true };
  });

  // MCP Servers
  ipcMain.handle('settings:add-mcp-server', async (_event, server: MCPServer, accessToken?: string) => {
    if (!accessToken) return { success: false, error: 'Not authenticated' };

    const userId = getUserIdFromToken(accessToken);
    if (!userId) return { success: false, error: 'Invalid access token' };

    const scopedSupabase = await getScopedSupabase(accessToken);

    const { data, error } = await scopedSupabase
      .from('mcp_servers')
      .insert({
        id: server.id.length > 30 ? server.id : undefined,
        user_id: userId, // Explicitly set user_id for RLS policy
        name: server.name,
        type: server.type,
        enabled: server.enabled,
        config: server.config
      })
      .select()
      .single();

    if (error) return { success: false, error: error.message };

    // Sync to local store
    const current = store.get('mcpServers') || [];
    store.set('mcpServers', [...current, data]);

    return { success: true, server: data };
  });

  ipcMain.handle('settings:update-mcp-server', async (_event, server: MCPServer, accessToken?: string) => {
    const scopedSupabase = await getScopedSupabase(accessToken);
    const { data, error } = await scopedSupabase
      .from('mcp_servers')
      .update({
        name: server.name,
        type: server.type,
        enabled: server.enabled,
        config: server.config,
        updated_at: new Date().toISOString()
      })
      .eq('id', server.id)
      .select()
      .single();

    if (error) return { success: false, error: error.message };

    // Sync to local store
    const current = store.get('mcpServers') || [];
    store.set('mcpServers', current.map((s: any) => s.id === server.id ? data : s));

    return { success: true, server: data };
  });

  ipcMain.handle('settings:delete-mcp-server', async (_event, serverId: string, accessToken?: string) => {
    const scopedSupabase = await getScopedSupabase(accessToken);
    const { error } = await scopedSupabase
      .from('mcp_servers')
      .delete()
      .eq('id', serverId);

    if (error) return { success: false, error: error.message };

    // Sync to local store
    const current = store.get('mcpServers') || [];
    store.set('mcpServers', current.filter((s: any) => s.id !== serverId));

    return { success: true };
  });

  // API Tools
  ipcMain.handle('settings:add-api-tool', async (_event, tool: APITool, accessToken?: string) => {
    if (!accessToken) return { success: false, error: 'Not authenticated' };

    const userId = getUserIdFromToken(accessToken);
    if (!userId) return { success: false, error: 'Invalid access token' };

    const scopedSupabase = await getScopedSupabase(accessToken);
    const { data, error } = await scopedSupabase
      .from('api_tools')
      .insert({
        id: tool.id.length > 30 ? tool.id : undefined,
        user_id: userId, // Explicitly set user_id for RLS policy
        name: tool.name,
        description: tool.description,
        enabled: tool.enabled,
        endpoint: tool.endpoint,
        method: tool.method,
        headers: tool.headers,
        query_params: tool.queryParams,
        body_template: tool.bodyTemplate,
        response_mapping: tool.responseMapping,
        last_test_success: tool.lastTestSuccess
      })
      .select()
      .single();

    if (error) return { success: false, error: error.message };

    const formattedTool: APITool = {
      id: data.id,
      name: data.name,
      description: data.description,
      enabled: data.enabled,
      endpoint: data.endpoint,
      method: data.method,
      headers: data.headers,
      queryParams: data.query_params,
      bodyTemplate: data.body_template,
      responseMapping: data.response_mapping,
      lastTestSuccess: data.last_test_success
    };

    // Sync to local store
    const current = store.get('apiTools') || [];
    store.set('apiTools', [...current, formattedTool]);

    return { success: true, tool: formattedTool };
  });

  ipcMain.handle('settings:update-api-tool', async (_event, tool: APITool, accessToken?: string) => {
    const scopedSupabase = await getScopedSupabase(accessToken);
    const { error } = await scopedSupabase
      .from('api_tools')
      .update({
        name: tool.name,
        description: tool.description,
        enabled: tool.enabled,
        endpoint: tool.endpoint,
        method: tool.method,
        headers: tool.headers,
        query_params: tool.queryParams,
        body_template: tool.bodyTemplate,
        response_mapping: tool.responseMapping,
        last_test_success: tool.lastTestSuccess,
        updated_at: new Date().toISOString()
      })
      .eq('id', tool.id);

    if (error) return { success: false, error: error.message };

    // Sync to local store
    const current = store.get('apiTools') || [];
    store.set('apiTools', current.map((t: any) => t.id === tool.id ? {
      ...t,
      name: tool.name,
      description: tool.description,
      enabled: tool.enabled,
      endpoint: tool.endpoint,
      method: tool.method,
      headers: tool.headers,
      queryParams: tool.queryParams,
      bodyTemplate: tool.bodyTemplate,
      responseMapping: tool.responseMapping,
      lastTestSuccess: tool.lastTestSuccess
    } : t));

    return { success: true, tool };
  });

  ipcMain.handle('settings:delete-api-tool', async (_event, toolId: string, accessToken?: string) => {
    const scopedSupabase = await getScopedSupabase(accessToken);
    const { error } = await scopedSupabase
      .from('api_tools')
      .delete()
      .eq('id', toolId);

    if (error) return { success: false, error: error.message };

    // Sync to local store
    const current = store.get('apiTools') || [];
    store.set('apiTools', current.filter((t: any) => t.id !== toolId));

    return { success: true };
  });

  ipcMain.handle('settings:test-api-tool', async (_event, tool: APITool) => {
    try {
      let finalEndpoint = tool.endpoint;

      // 1. Handle Query Parameters
      if (tool.queryParams && Object.keys(tool.queryParams).length > 0) {
        const url = new URL(finalEndpoint);
        Object.entries(tool.queryParams).forEach(([key, value]) => {
          if (key && value) url.searchParams.append(key, value);
        });
        finalEndpoint = url.toString();
      }

      // 2. Prepare Request
      const options: RequestInit = {
        method: tool.method || 'GET',
        headers: {
          'Content-Type': 'application/json',
          ...(tool.headers || {}),
        },
      };

      if (tool.method !== 'GET' && tool.bodyTemplate) {
        options.body = tool.bodyTemplate;
      }

      const response = await fetch(finalEndpoint, options);
      const isJson = response.headers.get('content-type')?.includes('application/json');
      const data = isJson ? await response.json() : await response.text();

      if (!response.ok) {
        return {
          success: false,
          status: response.status,
          statusText: response.statusText,
          error: typeof data === 'string' ? data : JSON.stringify(data),
          data
        };
      }

      return {
        success: true,
        status: response.status,
        statusText: response.statusText,
        data
      };
    } catch (error: any) {
      return { success: false, error: error.message || String(error) };
    }
  });

  // Platform Knowledge Handlers
  ipcMain.handle('settings:get-platform-knowledge', async (_event, accessToken?: string) => {
    const scopedSupabase = await getScopedSupabase(accessToken);
    const userId = getUserIdFromToken(accessToken || '');

    if (!userId) return [];

    const { data, error } = await scopedSupabase
      .from('platform_knowledge')
      .select('*')
      .eq('user_id', userId)
      .order('domain', { ascending: true });

    if (error) {
      console.error('Error fetching platform knowledge:', error);
      return [];
    }
    return data;
  });

  ipcMain.handle('settings:add-platform-knowledge', async (_event, record: any, accessToken?: string) => {
    if (!accessToken) return { success: false, error: 'Not authenticated' };

    const userId = getUserIdFromToken(accessToken);
    if (!userId) return { success: false, error: 'Invalid access token' };

    const scopedSupabase = await getScopedSupabase(accessToken);
    const { data, error } = await scopedSupabase
      .from('platform_knowledge')
      .insert({ ...record, user_id: userId }) // Explicitly set user_id for RLS policy
      .select()
      .single();

    if (error) {
      console.error('Error adding platform knowledge:', error);
      return { success: false, error: error.message };
    }
    return { success: true, data };
  });

  ipcMain.handle('settings:update-platform-knowledge', async (_event, record: any, accessToken?: string) => {
    const scopedSupabase = await getScopedSupabase(accessToken);
    const userId = getUserIdFromToken(accessToken || '');
    if (!userId) return { success: false, error: 'Not authenticated' };

    const { id, ...updates } = record;
    const { data, error } = await scopedSupabase
      .from('platform_knowledge')
      .update(updates)
      .eq('id', id)
      .eq('user_id', userId)
      .select()
      .single();

    if (error) {
      console.error('Error updating platform knowledge:', error);
      return { success: false, error: error.message };
    }
    return { success: true, data };
  });

  ipcMain.handle('settings:delete-platform-knowledge', async (_event, id: string, accessToken?: string) => {
    const scopedSupabase = await getScopedSupabase(accessToken);
    const userId = getUserIdFromToken(accessToken || '');
    if (!userId) return { success: false, error: 'Not authenticated' };

    const { error } = await scopedSupabase
      .from('platform_knowledge')
      .delete()
      .eq('id', id)
      .eq('user_id', userId);

    if (error) {
      console.error('Error deleting platform knowledge:', error);
      return { success: false, error: error.message };
    }
    return { success: true };
  });

  // Agent Profile Handlers
  ipcMain.handle('settings:get-agent-profile', async (_event, accessToken?: string) => {
    const scopedSupabase = await getScopedSupabase(accessToken);
    const { data, error } = await scopedSupabase
      .from('user_settings')
      .select('agent_profile')
      .maybeSingle();

    if (error || !data) {
      return { persona: '', icp: '', tone: '' };
    }
    return data.agent_profile || { persona: '', icp: '', tone: '' };
  });

  ipcMain.handle('settings:update-agent-profile', async (_event, profile: any, accessToken?: string) => {
    const scopedSupabase = await getScopedSupabase(accessToken);
    const { data: existing } = await scopedSupabase.from('user_settings').select('user_id').maybeSingle();

    if (existing) {
      const { error } = await scopedSupabase
        .from('user_settings')
        .update({ agent_profile: profile, updated_at: new Date().toISOString() })
        .eq('user_id', existing.user_id);

      if (error) return { success: false, error: error.message };
      return { success: true };
    } else {
      // Create user settings if not exists
      const { error } = await scopedSupabase
        .from('user_settings')
        .insert({ agent_profile: profile });

      if (error) return { success: false, error: error.message };
      return { success: true };
    }
  });

  // Dynamic Knowledge Base Handlers
  ipcMain.handle('settings:get-knowledge-bases', async (_event, accessToken?: string) => {
    const scopedSupabase = await getScopedSupabase(accessToken);
    const userId = getUserIdFromToken(accessToken || '');

    if (!userId) return [];

    const { data, error } = await scopedSupabase
      .from('knowledge_bases')
      .select('*')
      .eq('user_id', userId)
      .order('name');
    return error ? [] : data;
  });

  ipcMain.handle('settings:create-knowledge-base', async (_event, name: string, description?: string, accessToken?: string) => {
    if (!accessToken) {
      console.error('Create KB failed: Missing access token');
      return { success: false, error: 'Not authenticated' };
    }

    const userId = getUserIdFromToken(accessToken);
    if (!userId) return { success: false, error: 'Invalid access token' };

    const scopedSupabase = await getScopedSupabase(accessToken);

    const { data, error } = await scopedSupabase
      .from('knowledge_bases')
      .insert({
        user_id: userId, // Explicitly set user_id for RLS policy
        name,
        description
      })
      .select()
      .single();

    return error ? { success: false, error: error.message } : { success: true, data };
  });

  ipcMain.handle('settings:update-knowledge-base', async (_event, id: string, name: string, description?: string, accessToken?: string) => {
    const scopedSupabase = await getScopedSupabase(accessToken);
    const userId = getUserIdFromToken(accessToken || '');

    if (!userId) return { success: false, error: 'Not authenticated' };

    const { data, error } = await scopedSupabase
      .from('knowledge_bases')
      .update({
        name,
        description,
        updated_at: new Date().toISOString()
      })
      .eq('id', id)
      .eq('user_id', userId)
      .select()
      .single();

    return error ? { success: false, error: error.message } : { success: true, data };
  });

  ipcMain.handle('settings:delete-knowledge-base', async (_event, id: string, accessToken?: string) => {
    const scopedSupabase = await getScopedSupabase(accessToken);
    const userId = getUserIdFromToken(accessToken || '');

    if (!userId) return { success: false, error: 'Not authenticated' };

    const { error } = await scopedSupabase
      .from('knowledge_bases')
      .delete()
      .eq('id', id)
      .eq('user_id', userId);
    return { success: !error, error: error?.message };
  });

  ipcMain.handle('settings:get-kb-content', async (_event, kbId: string, accessToken?: string) => {
    const scopedSupabase = await getScopedSupabase(accessToken);
    const { data, error } = await scopedSupabase.from('knowledge_content').select('*').eq('kb_id', kbId).order('created_at');
    return error ? [] : data;
  });

  ipcMain.handle('settings:add-kb-content', async (_event, kbId: string, content: string, title?: string, accessToken?: string) => {
    const scopedSupabase = await getScopedSupabase(accessToken);
    const { data, error } = await scopedSupabase.from('knowledge_content').insert({ kb_id: kbId, content, title }).select().single();
    return error ? { success: false, error: error.message } : { success: true, data };
  });

  ipcMain.handle('settings:delete-kb-content', async (_event, id: string, accessToken?: string) => {
    const scopedSupabase = await getScopedSupabase(accessToken);
    const { error } = await scopedSupabase.from('knowledge_content').delete().eq('id', id);
    return { success: !error, error: error?.message };
  });
}
