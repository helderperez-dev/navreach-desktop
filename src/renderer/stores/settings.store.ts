import { create } from 'zustand';
import type { ModelProvider, MCPServer, APITool, AppSettings } from '../../shared/types';

interface SettingsState {
  settings: Partial<AppSettings>;
  modelProviders: ModelProvider[];
  mcpServers: MCPServer[];
  apiTools: APITool[];
  isLoading: boolean;
  loadSettings: () => Promise<void>;
  updateSetting: <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => Promise<void>;
  addModelProvider: (provider: ModelProvider) => Promise<void>;
  updateModelProvider: (provider: ModelProvider) => Promise<void>;
  deleteModelProvider: (id: string) => Promise<void>;
  addMCPServer: (server: MCPServer) => Promise<void>;
  updateMCPServer: (server: MCPServer) => Promise<void>;
  deleteMCPServer: (id: string) => Promise<void>;
  addAPITool: (tool: APITool) => Promise<void>;
  updateAPITool: (tool: APITool) => Promise<void>;
  deleteAPITool: (id: string) => Promise<void>;
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  settings: {},
  modelProviders: [],
  mcpServers: [],
  apiTools: [],
  isLoading: false,

  loadSettings: async () => {
    set({ isLoading: true });
    try {
      const settings = await window.api.settings.getAll();
      set({
        settings,
        modelProviders: settings.modelProviders || [],
        mcpServers: settings.mcpServers || [],
        apiTools: settings.apiTools || [],
      });
    } finally {
      set({ isLoading: false });
    }
  },

  updateSetting: async (key, value) => {
    await window.api.settings.set(key, value);
    set((state) => ({
      settings: { ...state.settings, [key]: value }
    }));
  },

  addModelProvider: async (provider) => {
    const providers = [...get().modelProviders, provider];
    await window.api.settings.set('modelProviders', providers);
    set({ modelProviders: providers });
  },

  updateModelProvider: async (provider) => {
    const updated = get().modelProviders.map((p) => (p.id === provider.id ? provider : p));
    await window.api.settings.set('modelProviders', updated);
    set({ modelProviders: updated });
  },

  deleteModelProvider: async (id) => {
    const filtered = get().modelProviders.filter((p) => p.id !== id);
    await window.api.settings.set('modelProviders', filtered);
    set({ modelProviders: filtered });
  },

  addMCPServer: async (server) => {
    const servers = [...get().mcpServers, server];
    await window.api.settings.set('mcpServers', servers);
    set({ mcpServers: servers });
  },

  updateMCPServer: async (server) => {
    const updated = get().mcpServers.map((s) => (s.id === server.id ? server : s));
    await window.api.settings.set('mcpServers', updated);
    set({ mcpServers: updated });
  },

  deleteMCPServer: async (id) => {
    const filtered = get().mcpServers.filter((s) => s.id !== id);
    await window.api.settings.set('mcpServers', filtered);
    set({ mcpServers: filtered });
  },

  addAPITool: async (tool) => {
    const tools = [...get().apiTools, tool];
    await window.api.settings.set('apiTools', tools);
    set({ apiTools: tools });
  },

  updateAPITool: async (tool) => {
    const updated = get().apiTools.map((t) => (t.id === tool.id ? tool : t));
    await window.api.settings.set('apiTools', updated);
    set({ apiTools: updated });
  },

  deleteAPITool: async (id) => {
    const filtered = get().apiTools.filter((t) => t.id !== id);
    await window.api.settings.set('apiTools', filtered);
    set({ apiTools: filtered });
  },
}));
