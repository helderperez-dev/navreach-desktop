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
        openExternal: (url: string) => Promise<{ success: boolean }>;
        download: (url: string) => Promise<{ success: boolean }>;
      };
      settings: {
        get: <T>(key: string) => Promise<T>;
        set: (key: string, value: unknown) => Promise<{ success: boolean }>;
        getAll: (accessToken?: string) => Promise<import('@shared/types').AppSettings>;
        reset: () => Promise<{ success: boolean }>;
        addModelProvider: (provider: import('@shared/types').ModelProvider, accessToken?: string) => Promise<{ success: boolean; provider?: import('@shared/types').ModelProvider; error?: string }>;
        updateModelProvider: (provider: import('@shared/types').ModelProvider, accessToken?: string) => Promise<{ success: boolean; provider?: import('@shared/types').ModelProvider; error?: string }>;
        deleteModelProvider: (id: string, accessToken?: string) => Promise<{ success: boolean; error?: string }>;
        addMCPServer: (server: import('@shared/types').MCPServer, accessToken?: string) => Promise<{ success: boolean; server?: import('@shared/types').MCPServer; error?: string }>;
        updateMCPServer: (server: import('@shared/types').MCPServer, accessToken?: string) => Promise<{ success: boolean; server?: import('@shared/types').MCPServer; error?: string }>;
        deleteMCPServer: (id: string, accessToken?: string) => Promise<{ success: boolean; error?: string }>;
        addAPITool: (tool: import('@shared/types').APITool, accessToken?: string) => Promise<{ success: boolean; tool?: import('@shared/types').APITool; error?: string }>;
        updateAPITool: (tool: import('@shared/types').APITool, accessToken?: string) => Promise<{ success: boolean; tool?: import('@shared/types').APITool; error?: string }>;
        deleteAPITool: (id: string, accessToken?: string) => Promise<{ success: boolean; error?: string }>;
        testAPITool: (tool: import('@shared/types').APITool) => Promise<{ success: boolean; data?: any; error?: string; status?: number; statusText?: string }>;

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
        connect: (serverId: string) => Promise<{ success: boolean; reason?: string }>;
        disconnect: (serverId: string) => Promise<{ success: boolean; reason?: string }>;
        listTools: (serverId: string) => Promise<{ success: boolean; tools?: any[]; reason?: string }>;
        callTool: (serverId: string, toolName: string, args: Record<string, unknown>) => Promise<{ success: boolean; result?: unknown; reason?: string }>;
        getStatus: (serverId: string) => Promise<{ status: string }>;
        getAllStatuses: () => Promise<Record<string, string>>;
      };
      window: {
        minimize: () => void;
        maximize: () => void;
        close: () => void;
        openFile: (options: { title?: string; filters?: { name: string; extensions: string[] }[] }) => Promise<string | null>;
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
          segments?: any[];
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
          segments?: any[];
        }) => Promise<{ success: boolean; response?: string; error?: string }>;
        stop: () => Promise<void>;
        onStreamChunk: (callback: (data: { content: string; done: boolean; toolCall?: any; toolResult?: any }) => void) => () => void;
        listWorkflows: () => Promise<{ name: string; path: string }[]>;
        testConnection: (provider: import('@shared/types').ModelProvider, modelId?: string) => Promise<{ success: boolean; message: string; response?: string }>;
        fetchModels: (params: { apiKey?: string; baseUrl?: string; type: string }) => Promise<import('@shared/types').ModelConfig[]>;
        onPlaybookStatus: (callback: (data: { nodeId: string; status: 'running' | 'success' | 'error'; message?: string }) => void) => () => void;
        suggest: (request: any) => Promise<{ success: boolean; suggestions?: { label: string; prompt: string }[]; error?: string }>;
        resetContext: (workspaceId?: string) => Promise<{ success: boolean; error?: string }>;
        updateSession: (tokens: { accessToken: string; refreshToken: string }) => Promise<{ success: boolean; error?: string }>;
      };
      debug: {
        onLog: (callback: (data: { type: string; message: string; data?: any }) => void) => () => void;
      };
      auth: {
        onAuthCallback: (callback: (hash: string) => void) => () => void;
      };
      stripe: {
        getConfig: () => Promise<{ publishableKey: string; proPriceId: string; credits100PriceId: string; credits500PriceId: string; credits1000PriceId: string }>;
        createPaymentIntent: (amount: number, currency: string, metadata?: any, customerId?: string) => Promise<{ clientSecret: string; id: string }>;
        fulfillPaymentIntent: (paymentIntentId: string) => Promise<{ success: boolean; balance?: number; message?: string }>;
        createSubscription: (customerId: string, priceId: string, promoCode?: string) => Promise<{
          clientSecret: string;
          amount?: number;
          subtotal?: number;
          currency?: string;
        }>;
        createCustomer: (email: string, name?: string) => Promise<{ id: string }>;
        createPortalSession: (customerId: string, returnUrl: string) => Promise<{ url: string }>;
        getInvoices: (customerId: string) => Promise<any[]>;
        getPaymentMethods: (customerId: string) => Promise<any[]>;
        cancelSubscription: (subscriptionId: string) => Promise<any>;
        updateSubscription: (subscriptionId: string, params: any) => Promise<any>;
        createSetupIntent: (customerId: string) => Promise<{ clientSecret: string }>;
        deletePaymentMethod: (paymentMethodId: string) => Promise<{ success: boolean }>;
        getSubscriptions: (customerId: string) => Promise<any[]>;
        getCustomer: (customerId: string) => Promise<any>;
        setDefaultPaymentMethod: (customerId: string, paymentMethodId: string) => Promise<{ success: boolean }>;
        getTierLimits: (accessToken?: string) => Promise<{
          ai_actions_limit: number;
          workspace_limit: number;
          target_list_limit: number;
          target_limit: number;
        }>;
        getUsage: (accessToken: string, type: string) => Promise<any>;
        trackUsage: (accessToken: string, type: string, incrementBy?: number) => Promise<any>;
      };
      engagement: {
        getLogs: (accessToken: string, options?: any) => Promise<import('@shared/types/engagement.types').EngagementLog[]>;
        getStats: (accessToken: string) => Promise<import('@shared/types/engagement.types').EngagementStats>;
        exportCsv: (accessToken: string) => Promise<{ success: boolean; filePath?: string; error?: string }>;
      };
      tasks: {
        list: (params: { workspaceId: string; limit?: number }) => Promise<any[]>;
        add: (params: { workspaceId: string; userId: string; type: string; payload: any; priority?: number }) => Promise<any>;
        addBulk: (data: { workspaceId: string; userId: string; tasks: any[] }) => Promise<any>;
        delete: (taskId: string) => Promise<{ success: boolean }>;
        retry: (taskId: string) => Promise<{ success: boolean }>;
        clearCompleted: (workspaceId: string) => Promise<{ success: boolean }>;
        process: () => Promise<{ success: boolean }>;
      };
    };
  }
}
