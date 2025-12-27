export interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  timestamp: number;
  toolCalls?: ToolCall[];
  toolResults?: ToolResult[];
}

export interface ToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

export interface ToolResult {
  toolCallId: string;
  result: unknown;
  error?: string;
}

export interface Conversation {
  id: string;
  title: string;
  messages: Message[];
  createdAt: number;
  updatedAt: number;
  modelId: string;
}

export interface ModelProvider {
  id: string;
  name: string;
  type: 'openai' | 'anthropic' | 'openrouter' | 'custom';
  apiKey: string;
  baseUrl?: string;
  models: ModelConfig[];
  enabled: boolean;
}

export interface ModelConfig {
  id: string;
  name: string;
  providerId: string;
  contextWindow: number;
  maxOutputTokens?: number;
  enabled?: boolean;
}

export interface MCPServer {
  id: string;
  name: string;
  type: 'stdio' | 'sse';
  enabled: boolean;
  config: MCPStdioConfig | MCPSSEConfig;
}

export interface MCPStdioConfig {
  command: string;
  args?: string[];
  env?: Record<string, string>;
}

export interface MCPSSEConfig {
  url: string;
  headers?: Record<string, string>;
}

export interface APITool {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
  endpoint: string;
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  headers?: Record<string, string>;
  bodyTemplate?: string;
  responseMapping?: string;
}

export interface AppSettings {
  theme: 'light' | 'dark' | 'system';
  sidebarCollapsed: boolean;
  chatPanelCollapsed: boolean;
  chatPanelWidth: number;
  defaultModelId?: string;
  modelProviders: ModelProvider[];
  mcpServers: MCPServer[];
  apiTools: APITool[];
  preventSleep: boolean;
  agentRunMode: 'manual' | 'indefinite' | 'timer';
  agentRunDuration: number; // in minutes
}

export interface BrowserTab {
  id: string;
  url: string;
  title: string;
  favicon?: string;
  isLoading: boolean;
  canGoBack: boolean;
  canGoForward: boolean;
}

export interface BrowserState {
  tabs: BrowserTab[];
  activeTabId: string | null;
}
