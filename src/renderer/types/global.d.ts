export { };

declare global {
  interface Window {
    api: {
      browser: {
        navigate: (tabId: string, url: string) => Promise<{ success: boolean; url?: string }>;
        goBack: (tabId: string) => Promise<{ success: boolean }>;
        goForward: (tabId: string) => Promise<{ success: boolean }>;
        reload: (tabId: string) => Promise<{ success: boolean }>;
        stop: (tabId: string) => Promise<{ success: boolean }>;
        click: (tabId: string, selector: string) => Promise<{ success: boolean }>;
        type: (tabId: string, selector: string, text: string) => Promise<{ success: boolean }>;
        screenshot: (tabId: string) => Promise<{ success: boolean; data?: string }>;
        extract: (tabId: string, selector: string) => Promise<{ success: boolean; content?: string }>;
        scroll: (tabId: string, direction: 'up' | 'down', amount?: number) => Promise<{ success: boolean }>;
        evaluate: (tabId: string, script: string) => Promise<{ success: boolean; result?: unknown }>;
        getContent: (tabId: string) => Promise<{ success: boolean; html?: string; text?: string }>;
        registerWebview: (tabId: string, webContentsId: number) => Promise<{ success: boolean }>;
        unregisterWebview: (tabId: string) => Promise<{ success: boolean }>;
        allowNavigation: (url: string) => Promise<{ success: boolean }>;
        startRecording: (tabId: string) => Promise<{ success: boolean; error?: string }>;
        stopRecording: (tabId: string) => Promise<{ success: boolean; error?: string }>;
        onRecordingAction: (callback: (data: any) => void) => () => void;
        startInspector: (tabId: string) => Promise<{ success: boolean; error?: string }>;
        stopInspector: (tabId: string) => Promise<{ success: boolean; error?: string }>;
        onInspectorAction: (callback: (data: any) => void) => () => void;
      };
      settings: {
        get: <T>(key: string) => Promise<T>;
        set: (key: string, value: unknown) => Promise<{ success: boolean }>;
        getAll: () => Promise<import('@shared/types').AppSettings>;
        reset: () => Promise<{ success: boolean }>;
        addModelProvider: (provider: import('@shared/types').ModelProvider) => Promise<{ success: boolean; provider: import('@shared/types').ModelProvider }>;
        updateModelProvider: (provider: import('@shared/types').ModelProvider) => Promise<{ success: boolean; provider?: import('@shared/types').ModelProvider }>;
        deleteModelProvider: (id: string) => Promise<{ success: boolean }>;
        addMCPServer: (server: import('@shared/types').MCPServer) => Promise<{ success: boolean; server: import('@shared/types').MCPServer }>;
        updateMCPServer: (server: import('@shared/types').MCPServer) => Promise<{ success: boolean; server?: import('@shared/types').MCPServer }>;
        deleteMCPServer: (id: string) => Promise<{ success: boolean }>;
        addAPITool: (tool: import('@shared/types').APITool) => Promise<{ success: boolean; tool: import('@shared/types').APITool }>;
        updateAPITool: (tool: import('@shared/types').APITool) => Promise<{ success: boolean; tool?: import('@shared/types').APITool }>;
        deleteAPITool: (id: string) => Promise<{ success: boolean }>;

        getPlatformKnowledge: () => Promise<import('@shared/types').PlatformKnowledge[]>;
        addPlatformKnowledge: (record: Partial<import('@shared/types').PlatformKnowledge>) => Promise<{ success: boolean; data?: import('@shared/types').PlatformKnowledge; error?: string }>;
        updatePlatformKnowledge: (record: Partial<import('@shared/types').PlatformKnowledge>) => Promise<{ success: boolean; data?: import('@shared/types').PlatformKnowledge; error?: string }>;
        deletePlatformKnowledge: (id: string) => Promise<{ success: boolean; error?: string }>;

        getAgentProfile: () => Promise<{ persona: string; icp: string; tone: string }>;
        updateAgentProfile: (profile: { persona: string; icp: string; tone: string }) => Promise<{ success: boolean; error?: string }>;

        getKnowledgeBases: () => Promise<import('@shared/types').KnowledgeBase[]>;
        createKnowledgeBase: (name: string, description?: string) => Promise<{ success: boolean; data?: import('@shared/types').KnowledgeBase; error?: string }>;
        deleteKnowledgeBase: (id: string) => Promise<{ success: boolean; error?: string }>;
        getKBContent: (kbId: string) => Promise<import('@shared/types').KnowledgeContent[]>;
        addKBContent: (kbId: string, content: string, title?: string) => Promise<{ success: boolean; data?: import('@shared/types').KnowledgeContent; error?: string }>;
        deleteKBContent: (id: string) => Promise<{ success: boolean; error?: string }>;
      };
      mcp: {
        connect: (serverId: string) => Promise<{ success: boolean }>;
        disconnect: (serverId: string) => Promise<{ success: boolean }>;
        listTools: (serverId: string) => Promise<{ success: boolean; tools?: unknown[] }>;
        callTool: (serverId: string, toolName: string, args: Record<string, unknown>) => Promise<{ success: boolean; result?: unknown }>;
        getStatus: () => Promise<Record<string, { connected: boolean }>>;
      };
      window: {
        minimize: () => void;
        maximize: () => void;
        close: () => void;
      };
      ai: {
        chat: (request: {
          messages: import('@shared/types').Message[];
          model: import('@shared/types').ModelConfig;
          provider: import('@shared/types').ModelProvider;
          systemPrompt?: string;
          maxIterations?: number;
          infiniteMode?: boolean;
          initialUserPrompt?: string;
          accessToken?: string;
          refreshToken?: string;
          playbooks?: any[];
          targetLists?: any[];
          agentRunLimit?: number | null;
          isPlaybookRun?: boolean;
          speed?: 'slow' | 'normal' | 'fast';
          workspaceId?: string;
          workspaceSettings?: {
            disabledTools?: string[];
            disabledMCPServers?: string[];
          };
        }) => Promise<{ success: boolean; response?: string; error?: string }>;
        chatSync: (request: {
          messages: import('@shared/types').Message[];
          model: import('@shared/types').ModelConfig;
          provider: import('@shared/types').ModelProvider;
          systemPrompt?: string;
          maxIterations?: number;
          infiniteMode?: boolean;
          initialUserPrompt?: string;
          accessToken?: string;
          playbooks?: any[];
          targetLists?: any[];
        }) => Promise<{ success: boolean; response?: string; error?: string }>;
        stop: () => Promise<void>;
        onStreamChunk: (callback: (data: { content: string; done: boolean; toolCall?: any; toolResult?: any }) => void) => () => void;
        listWorkflows: () => Promise<{ name: string; path: string }[]>;
        testConnection: (provider: import('@shared/types').ModelProvider, modelId?: string) => Promise<{ success: boolean; message: string; response?: string }>;
        onPlaybookStatus: (callback: (data: { nodeId: string; status: 'running' | 'success' | 'error'; message?: string }) => void) => () => void;
        suggest: (request: any) => Promise<{ success: boolean; suggestions?: { label: string; prompt: string }[]; error?: string }>;
        resetContext: (workspaceId?: string) => Promise<{ success: boolean; error?: string }>;
      };
      debug: {
        onLog: (callback: (data: { type: string; message: string; data?: any }) => void) => () => void;
      };
      auth: {
        onAuthCallback: (callback: (hash: string) => void) => () => void;
      };
    };
  }
}
