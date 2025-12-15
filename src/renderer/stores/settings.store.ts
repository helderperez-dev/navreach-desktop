import { create } from 'zustand';
import type { ModelProvider, MCPServer, APITool } from '@shared/types';

interface SettingsState {
  modelProviders: ModelProvider[];
  mcpServers: MCPServer[];
  apiTools: APITool[];
  isLoading: boolean;
  loadSettings: () => Promise<void>;
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

export const useSettingsStore = create<SettingsState>((set) => ({
  modelProviders: [],
  mcpServers: [],
  apiTools: [],
  isLoading: false,

  loadSettings: async () => {
    set({ isLoading: true });
    try {
      const settings = await window.api.settings.getAll();
      set({
        modelProviders: settings.modelProviders || [],
        mcpServers: settings.mcpServers || [],
        apiTools: settings.apiTools || [],
      });
    } finally {
      set({ isLoading: false });
    }
  },

  addModelProvider: async (provider) => {
    await window.api.settings.set('modelProviders', [
      ...((await window.api.settings.get<ModelProvider[]>('modelProviders')) || []),
      provider,
    ]);
    set((state) => ({ modelProviders: [...state.modelProviders, provider] }));
  },

  updateModelProvider: async (provider) => {
    const providers = (await window.api.settings.get<ModelProvider[]>('modelProviders')) || [];
    const updated = providers.map((p) => (p.id === provider.id ? provider : p));
    await window.api.settings.set('modelProviders', updated);
    set({ modelProviders: updated });
  },

  deleteModelProvider: async (id) => {
    const providers = (await window.api.settings.get<ModelProvider[]>('modelProviders')) || [];
    const filtered = providers.filter((p) => p.id !== id);
    await window.api.settings.set('modelProviders', filtered);
    set({ modelProviders: filtered });
  },

  addMCPServer: async (server) => {
    await window.api.settings.set('mcpServers', [
      ...((await window.api.settings.get<MCPServer[]>('mcpServers')) || []),
      server,
    ]);
    set((state) => ({ mcpServers: [...state.mcpServers, server] }));
  },

  updateMCPServer: async (server) => {
    const servers = (await window.api.settings.get<MCPServer[]>('mcpServers')) || [];
    const updated = servers.map((s) => (s.id === server.id ? server : s));
    await window.api.settings.set('mcpServers', updated);
    set({ mcpServers: updated });
  },

  deleteMCPServer: async (id) => {
    const servers = (await window.api.settings.get<MCPServer[]>('mcpServers')) || [];
    const filtered = servers.filter((s) => s.id !== id);
    await window.api.settings.set('mcpServers', filtered);
    set({ mcpServers: filtered });
  },

  addAPITool: async (tool) => {
    await window.api.settings.set('apiTools', [
      ...((await window.api.settings.get<APITool[]>('apiTools')) || []),
      tool,
    ]);
    set((state) => ({ apiTools: [...state.apiTools, tool] }));
  },

  updateAPITool: async (tool) => {
    const tools = (await window.api.settings.get<APITool[]>('apiTools')) || [];
    const updated = tools.map((t) => (t.id === tool.id ? tool : t));
    await window.api.settings.set('apiTools', updated);
    set({ apiTools: updated });
  },

  deleteAPITool: async (id) => {
    const tools = (await window.api.settings.get<APITool[]>('apiTools')) || [];
    const filtered = tools.filter((t) => t.id !== id);
    await window.api.settings.set('apiTools', filtered);
    set({ apiTools: filtered });
  },
}));
