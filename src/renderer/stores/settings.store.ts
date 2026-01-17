import { create } from 'zustand';
import type { ModelProvider, MCPServer, APITool, AppSettings } from '../../shared/types';
import { useAuthStore } from './auth.store';

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
  reset: () => void;
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  settings: {},
  modelProviders: [],
  mcpServers: [],
  apiTools: [],
  isLoading: false,

  reset: () => {
    set({
      settings: {},
      modelProviders: [],
      mcpServers: [],
      apiTools: [],
      isLoading: false
    });
  },

  loadSettings: async () => {
    set({ isLoading: true });
    try {
      const accessToken = useAuthStore.getState().session?.access_token;
      const settings = await window.api.settings.getAll(accessToken);
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
    // Basic settings (theme, etc) still go to local store for now
    await window.api.settings.set(key, value);
    set((state) => ({
      settings: { ...state.settings, [key]: value }
    }));
  },

  addModelProvider: async (provider) => {
    const accessToken = useAuthStore.getState().session?.access_token;
    const { success, provider: savedProvider, error } = await window.api.settings.addModelProvider(provider, accessToken);
    if (success) {
      set((state) => ({ modelProviders: [...state.modelProviders, savedProvider || provider] }));
    } else {
      console.error('Failed to add model provider:', error);
    }
  },

  updateModelProvider: async (provider) => {
    const accessToken = useAuthStore.getState().session?.access_token;
    const { success, error } = await window.api.settings.updateModelProvider(provider, accessToken);
    if (success) {
      set((state) => ({
        modelProviders: state.modelProviders.map((p) => (p.id === provider.id ? provider : p))
      }));
    } else {
      console.error('Failed to update model provider:', error);
    }
  },

  deleteModelProvider: async (id) => {
    const accessToken = useAuthStore.getState().session?.access_token;
    const { success, error } = await window.api.settings.deleteModelProvider(id, accessToken);
    if (success) {
      set((state) => ({
        modelProviders: state.modelProviders.filter((p) => p.id !== id)
      }));
    } else {
      console.error('Failed to delete model provider:', error);
    }
  },

  addMCPServer: async (server) => {
    const accessToken = useAuthStore.getState().session?.access_token;
    const { success, server: savedServer, error } = await window.api.settings.addMCPServer(server, accessToken);
    if (success) {
      set((state) => ({ mcpServers: [...state.mcpServers, savedServer || server] }));
    } else {
      console.error('Failed to add MCP server:', error);
      throw new Error(error || 'Failed to add MCP server');
    }
  },

  updateMCPServer: async (server) => {
    const accessToken = useAuthStore.getState().session?.access_token;
    const { success, server: updatedServer, error } = await window.api.settings.updateMCPServer(server, accessToken);
    if (success) {
      set((state) => ({
        mcpServers: state.mcpServers.map((s) => (s.id === server.id ? (updatedServer || server) : s))
      }));
    } else {
      console.error('Failed to update MCP server:', error);
      throw new Error(error || 'Failed to update MCP server');
    }
  },

  deleteMCPServer: async (id) => {
    const accessToken = useAuthStore.getState().session?.access_token;
    const { success, error } = await window.api.settings.deleteMCPServer(id, accessToken);
    if (success) {
      set((state) => ({
        mcpServers: state.mcpServers.filter((s) => s.id !== id)
      }));
    } else {
      console.error('Failed to delete MCP server:', error);
      throw new Error(error || 'Failed to delete MCP server');
    }
  },

  addAPITool: async (tool) => {
    const accessToken = useAuthStore.getState().session?.access_token;
    const { success, tool: savedTool, error } = await window.api.settings.addAPITool(tool, accessToken);
    if (success) {
      set((state) => ({ apiTools: [...state.apiTools, savedTool || tool] }));
    } else {
      console.error('Failed to add API tool:', error);
    }
  },

  updateAPITool: async (tool) => {
    const accessToken = useAuthStore.getState().session?.access_token;
    const { success, error } = await window.api.settings.updateAPITool(tool, accessToken);
    if (success) {
      set((state) => ({
        apiTools: state.apiTools.map((t) => (t.id === tool.id ? tool : t))
      }));
    } else {
      console.error('Failed to update API tool:', error);
    }
  },

  deleteAPITool: async (id) => {
    const accessToken = useAuthStore.getState().session?.access_token;
    const { success, error } = await window.api.settings.deleteAPITool(id, accessToken);
    if (success) {
      set((state) => ({
        apiTools: state.apiTools.filter((t) => t.id !== id)
      }));
    } else {
      console.error('Failed to delete API tool:', error);
    }
  },
}));
