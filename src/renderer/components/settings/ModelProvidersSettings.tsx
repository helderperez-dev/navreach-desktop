import { useState, useEffect } from 'react';
import { Plus, Pencil, Trash2, Check, X, ChevronDown, ChevronRight, Sparkles, RefreshCw, Wifi, Star, History, Terminal, Info } from 'lucide-react';
import { CircularLoader } from '@/components/ui/CircularLoader';
import { v4 as uuidv4 } from 'uuid';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useSettingsStore } from '@/stores/settings.store';
import type { ModelProvider, ModelConfig } from '@shared/types';
import { cn } from '@/lib/utils';

const providerTypes = [
  { value: 'openai', label: 'OpenAI' },
  { value: 'anthropic', label: 'Anthropic' },
  { value: 'openrouter', label: 'OpenRouter' },
  { value: 'local', label: 'Local (GGUF)' },
  { value: 'ollama', label: 'Ollama' },
  { value: 'custom', label: 'Custom' },
] as const;

const allModels: Record<string, ModelConfig[]> = {
  openai: [
    { id: 'gpt-4o', name: 'GPT-4o', providerId: '', contextWindow: 128000, enabled: true },
    { id: 'gpt-4o-mini', name: 'GPT-4o Mini', providerId: '', contextWindow: 128000, enabled: true },
    { id: 'gpt-4-turbo', name: 'GPT-4 Turbo', providerId: '', contextWindow: 128000, enabled: true },
    { id: 'gpt-4', name: 'GPT-4', providerId: '', contextWindow: 8192, enabled: false },
    { id: 'gpt-3.5-turbo', name: 'GPT-3.5 Turbo', providerId: '', contextWindow: 16385, enabled: false },
    { id: 'o1-preview', name: 'o1 Preview', providerId: '', contextWindow: 128000, enabled: false },
    { id: 'o1-mini', name: 'o1 Mini', providerId: '', contextWindow: 128000, enabled: false },
  ],
  anthropic: [
    { id: 'claude-3-5-sonnet-20241022', name: 'Claude 3.5 Sonnet', providerId: '', contextWindow: 200000, enabled: true },
    { id: 'claude-3-5-haiku-20241022', name: 'Claude 3.5 Haiku', providerId: '', contextWindow: 200000, enabled: true },
    { id: 'claude-3-opus-20240229', name: 'Claude 3 Opus', providerId: '', contextWindow: 200000, enabled: false },
    { id: 'claude-3-sonnet-20240229', name: 'Claude 3 Sonnet', providerId: '', contextWindow: 200000, enabled: false },
    { id: 'claude-3-haiku-20240307', name: 'Claude 3 Haiku', providerId: '', contextWindow: 200000, enabled: false },
  ],
  openrouter: [
    { id: 'openai/gpt-4o', name: 'GPT-4o', providerId: '', contextWindow: 128000, enabled: true },
    { id: 'openai/gpt-4o-mini', name: 'GPT-4o Mini', providerId: '', contextWindow: 128000, enabled: true },
    { id: 'anthropic/claude-3.5-sonnet', name: 'Claude 3.5 Sonnet', providerId: '', contextWindow: 200000, enabled: true },
    { id: 'anthropic/claude-3.5-haiku', name: 'Claude 3.5 Haiku', providerId: '', contextWindow: 200000, enabled: true },
    { id: 'anthropic/claude-3-opus', name: 'Claude 3 Opus', providerId: '', contextWindow: 200000, enabled: false },
    { id: 'google/gemini-pro-1.5', name: 'Gemini Pro 1.5', providerId: '', contextWindow: 1000000, enabled: false },
    { id: 'google/gemini-flash-1.5', name: 'Gemini Flash 1.5', providerId: '', contextWindow: 1000000, enabled: false },
    { id: 'meta-llama/llama-3.1-405b-instruct', name: 'Llama 3.1 405B', providerId: '', contextWindow: 131072, enabled: false },
    { id: 'meta-llama/llama-3.1-70b-instruct', name: 'Llama 3.1 70B', providerId: '', contextWindow: 131072, enabled: false },
    { id: 'meta-llama/llama-3.1-8b-instruct', name: 'Llama 3.1 8B', providerId: '', contextWindow: 131072, enabled: false },
    { id: 'mistralai/mistral-large', name: 'Mistral Large', providerId: '', contextWindow: 128000, enabled: false },
    { id: 'mistralai/mistral-medium', name: 'Mistral Medium', providerId: '', contextWindow: 32000, enabled: false },
    { id: 'deepseek/deepseek-chat', name: 'DeepSeek Chat', providerId: '', contextWindow: 64000, enabled: false },
    { id: 'qwen/qwen-2.5-72b-instruct', name: 'Qwen 2.5 72B', providerId: '', contextWindow: 131072, enabled: false },
  ],
  custom: [],
  local: [],
  ollama: [],
};

const defaultModels: Record<string, ModelConfig[]> = {
  openai: allModels.openai.filter(m => m.enabled),
  anthropic: allModels.anthropic.filter(m => m.enabled),
  openrouter: allModels.openrouter.filter(m => m.enabled),
  custom: [],
  local: [],
  ollama: [],
};

interface OpenRouterModel {
  id: string;
  name: string;
  context_length: number;
  supported_parameters: string[];
}

interface OpenAIModel {
  id: string;
  object: string;
  created: number;
  owned_by: string;
}

async function fetchOpenAIModels(apiKey: string, baseUrl?: string): Promise<ModelConfig[]> {
  try {
    const url = baseUrl ? `${baseUrl.replace(/\/$/, '')}/models` : 'https://api.openai.com/v1/models';
    const response = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();

    if (data.data && Array.isArray(data.data)) {
      return data.data
        .filter((m: OpenAIModel) => {
          const id = m.id.toLowerCase();
          // Filter for models known to support function calling/tools
          // This includes gpt-4, gpt-3.5-turbo, and newer o1 models
          // Exclude -instruct models as they often lack tool support in chat format
          return (id.includes('gpt-') || id.includes('o1-')) && !id.includes('-instruct');
        })
        .map((m: OpenAIModel) => ({
          id: m.id,
          name: m.id.replace(/-/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase()),
          providerId: '',
          contextWindow: m.id.includes('128k') || m.id.includes('gpt-4o') || m.id.includes('o1') ? 128000 : 16384,
          enabled: false,
        }))
        .sort((a: ModelConfig, b: ModelConfig) => a.name.localeCompare(b.name));
    }
    return [];
  } catch (error) {
    console.error('Failed to fetch OpenAI models:', error);
    throw error;
  }
}

async function fetchOpenRouterModels(): Promise<ModelConfig[]> {
  try {
    const response = await fetch('https://openrouter.ai/api/v1/models');
    const data = await response.json();

    if (data.data && Array.isArray(data.data)) {
      return data.data
        .filter((m: OpenRouterModel) => {
          // Allow all models, but we'll mark them if they support tools later
          return true;
        })
        .map((m: OpenRouterModel) => ({
          id: m.id,
          name: m.name.replace(/^.*?\//, '').replace(/-/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase()),
          providerId: '',
          contextWindow: m.context_length || 4096,
          enabled: false,
          // Store capabilities if needed, for now we assume basic chat works
        }))
        .sort((a: ModelConfig, b: ModelConfig) => a.name.localeCompare(b.name));
    }
    return [];
  } catch (error) {
    console.error('Failed to fetch OpenRouter models:', error);
    return [];
  }
}

async function fetchOllamaModels(baseUrl?: string): Promise<ModelConfig[]> {
  try {
    const url = baseUrl ? `${baseUrl.replace(/\/$/, '')}/api/tags` : 'http://localhost:11434/api/tags';
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const data = await response.json();
    if (data.models && Array.isArray(data.models)) {
      return data.models.map((m: any) => ({
        id: m.name,
        name: m.name,
        providerId: '',
        contextWindow: 4096, // Default for most local models
        enabled: true,
      }));
    }
    return [];
  } catch (error) {
    console.error('Failed to fetch Ollama models:', error);
    return [];
  }
}

export function ModelProvidersSettings() {
  const { settings, updateSetting, modelProviders, loadSettings, addModelProvider, updateModelProvider, deleteModelProvider, isLoading } = useSettingsStore();
  const [isAdding, setIsAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showModels, setShowModels] = useState(true);
  const [formData, setFormData] = useState<Partial<ModelProvider>>({
    name: '',
    type: 'openai',
    apiKey: '',
    baseUrl: '',
    enabled: true,
    models: [],
  });
  const [modelStates, setModelStates] = useState<Record<string, boolean>>({});
  const [availableModels, setAvailableModels] = useState<Record<string, ModelConfig[]>>(allModels);
  const [isFetchingModels, setIsFetchingModels] = useState(false);

  const [searchQuery, setSearchQuery] = useState('');
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string; error?: string; response?: string } | null>(null);

  // Per-model verification status
  const [modelStatus, setModelStatus] = useState<Record<string, {
    state: 'idle' | 'loading' | 'success' | 'error',
    error?: string,
    agentic?: boolean,
    log?: string,
    rawResponse?: string,
    trace?: { step: string; detail?: string; status: 'info' | 'success' | 'warn' | 'error' }[],
    schema?: any,
    timestamp?: number
  }>>({});

  const [viewingLogModelId, setViewingLogModelId] = useState<string | null>(null);
  const [showOnlyConnected, setShowOnlyConnected] = useState(true);

  useEffect(() => {
    loadSettings();
  }, []);

  const handleAdd = () => {
    setIsAdding(true);
    const type = 'openai';
    const models = availableModels[type] || [];
    const initialModelStates: Record<string, boolean> = {};
    models.forEach(m => {
      initialModelStates[m.id] = false;
    });
    setModelStates(initialModelStates);
    setFormData({
      name: '',
      type,
      apiKey: '',
      baseUrl: '',
      enabled: true,
      models: [],
    });
    setShowModels(true);
    setSearchQuery('');
  };

  const handleFetchModels = async () => {
    if (formData.type !== 'openrouter' && formData.type !== 'openai' && formData.type !== 'ollama') return;

    setIsFetchingModels(true);
    try {
      let fetchedModels: ModelConfig[] = [];
      if (formData.type === 'openrouter') {
        fetchedModels = await fetchOpenRouterModels();
      } else if (formData.type === 'openai') {
        if (!formData.apiKey) {
          alert('API Key is required to fetch OpenAI models');
          return;
        }
        fetchedModels = await fetchOpenAIModels(formData.apiKey, formData.baseUrl);
      } else if (formData.type === 'ollama') {
        fetchedModels = await fetchOllamaModels(formData.baseUrl);
      }

      if (fetchedModels.length > 0) {
        const type = formData.type;
        const newAvailableModels = { ...availableModels, [type]: fetchedModels };
        setAvailableModels(newAvailableModels);

        const newModelStates: Record<string, boolean> = {};
        fetchedModels.forEach(m => {
          newModelStates[m.id] = modelStates[m.id] ?? false;
        });
        setModelStates(newModelStates);
      }
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Failed to fetch models');
    } finally {
      setIsFetchingModels(false);
    }
  };

  const handleTestConnection = async () => {
    if (!formData.apiKey && formData.type !== 'local' && formData.type !== 'ollama') {
      alert('API Key is required');
      return;
    }
    setIsTesting(true);
    setTestResult(null);
    try {
      // Construct a temporary provider object from form data
      const tempProvider: ModelProvider = {
        id: editingId || 'temp',
        name: formData.name || 'Temp',
        type: formData.type as any,
        apiKey: formData.apiKey || '',
        baseUrl: formData.baseUrl,
        enabled: true,
        models: formData.models || []
      };

      const result = await window.api.ai.testConnection(tempProvider) as any;
      setTestResult(result);
    } catch (e: any) {
      setTestResult({ success: false, message: e.message || String(e) });
    } finally {
      setIsTesting(false);
    }
  };

  const handleVerifyModel = async (model: ModelConfig) => {
    if (!formData.apiKey && formData.type !== 'local' && formData.type !== 'ollama') {
      alert('API Key is required to test model connectivity');
      return;
    }

    setModelStatus(prev => ({
      ...prev,
      [model.id]: { state: 'loading' }
    }));

    try {
      const tempProvider: ModelProvider = {
        id: editingId || 'temp',
        name: formData.name || 'Temp',
        type: formData.type as any,
        apiKey: formData.apiKey || '',
        baseUrl: formData.baseUrl,
        enabled: true,
        models: formData.models || []
      };

      const result = await window.api.ai.testConnection(tempProvider, model.id) as any;

      if (result.success) {
        setModelStatus(prev => ({
          ...prev,
          [model.id]: {
            state: 'success',
            agentic: result.agentic,
            log: result.message,
            rawResponse: result.response,
            trace: result.trace,
            schema: result.schema,
            timestamp: Date.now()
          }
        }));
      } else {
        setModelStatus(prev => ({
          ...prev,
          [model.id]: {
            state: 'error',
            error: result.error || 'Failed',
            log: result.message || 'Test failed with provider error',
            rawResponse: result.error || JSON.stringify(result),
            trace: result.trace,
            schema: result.schema,
            timestamp: Date.now()
          }
        }));
        // Auto-disable if it failed and was enabled
        if (modelStates[model.id]) {
          toggleModel(model.id);
        }
      }
    } catch (e: any) {
      setModelStatus(prev => ({
        ...prev,
        [model.id]: { state: 'error', error: e.message || String(e) }
      }));
    }
  };

  const handleVerifyAllEnabled = async () => {
    const enabledModelsToVerify = currentModels.filter(m => modelStates[m.id]);
    for (const model of enabledModelsToVerify) {
      // Run sequentially to avoid rate limits or UI lag
      await handleVerifyModel(model);
    }
  };

  const handleEdit = (provider: ModelProvider) => {
    setEditingId(provider.id);
    const type = provider.type;
    if (type === 'local' || type === 'ollama' || type === 'custom') {
      setAvailableModels(prev => ({
        ...prev,
        [type]: [...((prev[type] || []).filter(m => !provider.models.some(pm => pm.id === m.id))), ...provider.models]
      }));
    }

    const currentAvailableModels = (type === 'local' || type === 'ollama' || type === 'custom')
      ? [...((availableModels[type] || []).filter(m => !provider.models.some(pm => pm.id === m.id))), ...provider.models]
      : availableModels[type] || [];

    const initialModelStates: Record<string, boolean> = {};
    currentAvailableModels.forEach(m => {
      const existingModel = provider.models.find(pm => pm.id === m.id);
      initialModelStates[m.id] = existingModel ? (existingModel.enabled !== false) : false;
    });
    setModelStates(initialModelStates);
    setFormData(provider);
    setShowModels(true);
    setSearchQuery('');
  };

  const handleSave = async () => {
    if (!formData.name) {
      alert('Please enter a name for this provider');
      return;
    }
    if (!formData.apiKey && formData.type !== 'local' && formData.type !== 'ollama') {
      alert('API Key is required for this provider type');
      return;
    }

    const providerId = editingId || uuidv4();
    const type = formData.type || 'openai';
    const models = availableModels[type] || [];
    const enabledModels = models
      .filter(m => modelStates[m.id])
      .map(m => ({ ...m, providerId, enabled: true }));

    const provider: ModelProvider = {
      id: providerId,
      name: formData.name!,
      type: formData.type as ModelProvider['type'],
      apiKey: formData.apiKey || '',
      baseUrl: formData.baseUrl,
      enabled: formData.enabled ?? true,
      models: enabledModels,
    };

    try {
      if (editingId) {
        await updateModelProvider(provider);
      } else {
        await addModelProvider(provider);
      }

      setIsAdding(false);
      setEditingId(null);
      setFormData({});
      setModelStates({});
    } catch (err) {
      alert('Failed to save provider: ' + (err instanceof Error ? err.message : String(err)));
    }
  };

  const handleCancel = () => {
    setIsAdding(false);
    setEditingId(null);
    setFormData({});
    setModelStates({});
  };

  const handleTypeChange = (type: string) => {
    const models = availableModels[type] || [];
    const newModelStates: Record<string, boolean> = {};
    models.forEach(m => {
      newModelStates[m.id] = false;
    });
    setModelStates(newModelStates);
    setFormData((prev) => ({
      ...prev,
      type: type as ModelProvider['type'],
      models: [],
    }));
    setSearchQuery('');
  };

  const toggleModel = (modelId: string) => {
    setModelStates(prev => ({
      ...prev,
      [modelId]: !prev[modelId],
    }));
  };

  const enableAllModels = () => {
    const type = formData.type || 'openai';
    const models = availableModels[type] || [];
    const newStates: Record<string, boolean> = {};
    models.forEach(m => { newStates[m.id] = true; });
    setModelStates(newStates);
  };

  const disableAllModels = () => {
    const type = formData.type || 'openai';
    const models = availableModels[type] || [];
    const newStates: Record<string, boolean> = {};
    models.forEach(m => { newStates[m.id] = false; });
    setModelStates(newStates);
  };

  const enabledCount = Object.values(modelStates).filter(Boolean).length;

  const currentModels = availableModels[formData.type || 'openai'] || [];
  const filteredModels = currentModels.filter(m => {
    const matchesSearch = !searchQuery ||
      m.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      m.id.toLowerCase().includes(searchQuery.toLowerCase());

    if (showOnlyConnected) {
      const status = modelStatus[m.id]?.state;
      // Show if verified, currently verifying, or if it's explicitly enabled (so user can see what they've picked)
      // Actually strictly following "not connected yet" means only success/loading
      return matchesSearch && (status === 'success' || status === 'loading');
    }
    return matchesSearch;
  });

  return (
    <div className="space-y-6">
      {isLoading ? (
        <div className="flex h-[400px] items-center justify-center">
          <CircularLoader className="h-6 w-6" />
        </div>
      ) : (
        <>
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-semibold">Model Providers</h2>
              <p className="text-sm text-muted-foreground mt-1">
                Configure AI model providers for the Reavion Agent.
              </p>
            </div>
            {!isAdding && !editingId && (
              <Button onClick={handleAdd} size="sm">
                <Plus className="h-4 w-4 mr-2" />
                Add Provider
              </Button>
            )}
          </div>

          {(isAdding || editingId) && (
            <div className="border border-border/10 rounded-lg p-4 space-y-4 bg-card">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Name</label>
                  <Input
                    value={formData.name || ''}
                    onChange={(e) => setFormData((prev) => ({ ...prev, name: e.target.value }))}
                    placeholder="My OpenAI"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Type</label>
                  <select
                    value={formData.type || 'openai'}
                    onChange={(e) => handleTypeChange(e.target.value)}
                    className="w-full h-9 px-3 rounded-md border border-input bg-transparent text-sm"
                  >
                    {providerTypes.map((type) => (
                      <option key={type.value} value={type.value}>
                        {type.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {formData.type === 'local' && (
                <div className="space-y-4 p-4 border rounded-lg bg-secondary/10 border-border/20">
                  <div className="flex items-center justify-between">
                    <h4 className="text-sm font-medium">Local Models</h4>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={async () => {
                        try {
                          // Use a native file picker
                          const modelPath = await window.api.window.openFile({
                            title: 'Select GGUF Model',
                            filters: [
                              { name: 'GGUF Models', extensions: ['gguf'] }
                            ]
                          });

                          if (!modelPath) return;

                          // Extract filename for default name
                          const fileName = modelPath.split(/[\\/]/).pop()?.replace('.gguf', '') || 'Llama Model';

                          const newModel: ModelConfig = {
                            id: modelPath, // Use path as ID for simplicity in local
                            name: fileName,
                            providerId: editingId || 'temp',
                            contextWindow: 8192,
                            enabled: true,
                            path: modelPath
                          };

                          setAvailableModels(prev => ({
                            ...prev,
                            local: [...(prev.local || []), newModel]
                          }));

                          setModelStates(prev => ({
                            ...prev,
                            [newModel.id]: true
                          }));

                          // Also update formData immediately so it shows up
                          setFormData(prev => ({
                            ...prev,
                            models: [...(prev.models || []), newModel]
                          }));
                        } catch (err) {
                          console.error('Failed to add local model:', err);
                          alert('Error selecting file: ' + (err instanceof Error ? err.message : String(err)));
                        }
                      }}
                    >
                      <Plus className="h-3 w-3 mr-1" />
                      Add .gguf Model
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Add local GGUF models. Make sure you have downloaded the model file to your computer.
                  </p>
                </div>
              )}

              <div className="space-y-2">
                <label className="text-sm font-medium">
                  {formData.type === 'local' || formData.type === 'ollama' ? 'Configuration' : 'API Key'}
                </label>
                <Input
                  type={formData.type === 'local' || formData.type === 'ollama' ? 'text' : 'password'}
                  value={formData.apiKey || ''}
                  onChange={(e) => setFormData((prev) => ({ ...prev, apiKey: e.target.value }))}
                  placeholder={formData.type === 'local' ? 'Local model configuration (optional)' : formData.type === 'ollama' ? 'Not required for local Ollama' : 'sk-...'}
                  disabled={formData.type === 'local' || formData.type === 'ollama'}
                  className={formData.type === 'local' || formData.type === 'ollama' ? 'hidden' : ''}
                />
              </div>

              {(formData.type === 'custom' || formData.type === 'openai' || formData.type === 'ollama') && (
                <div className="space-y-2">
                  <label className="text-sm font-medium">Base URL {(formData.type === 'openai' || formData.type === 'ollama') && <span className="text-xs text-muted-foreground font-normal">(Optional)</span>}</label>
                  <Input
                    value={formData.baseUrl || ''}
                    onChange={(e) => setFormData((prev) => ({ ...prev, baseUrl: e.target.value }))}
                    placeholder={formData.type === 'openai' ? "https://api.openai.com/v1" : formData.type === 'ollama' ? "http://localhost:11434" : "https://api.example.com/v1"}
                  />
                </div>
              )}

              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="enabled"
                  checked={formData.enabled ?? true}
                  onChange={(e) => setFormData((prev) => ({ ...prev, enabled: e.target.checked }))}
                  className="rounded border-input"
                />
                <label htmlFor="enabled" className="text-sm">Enabled</label>
              </div>

              {formData.type !== 'custom' && (
                <div className="space-y-3 pt-2">
                  <div
                    className="flex items-center justify-between cursor-pointer"
                    onClick={() => {
                      const willShow = !showModels;
                      setShowModels(willShow);
                      if (willShow) {
                        handleVerifyAllEnabled();
                      }
                    }}
                  >
                    <div className="flex items-center gap-2">
                      {showModels ? (
                        <ChevronDown className="h-4 w-4 text-muted-foreground" />
                      ) : (
                        <ChevronRight className="h-4 w-4 text-muted-foreground" />
                      )}
                      <span className="text-sm font-medium">Available Models</span>
                      <span className="text-[10px] h-4.5 flex items-center bg-secondary/80 text-muted-foreground px-2 rounded-full font-bold uppercase tracking-wider border border-border/10">
                        {showOnlyConnected
                          ? `${currentModels.filter(m => modelStatus[m.id]?.state === 'success').length} connected`
                          : `${enabledCount} of ${currentModels.length} enabled`
                        }
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      {(formData.type === 'openrouter' || formData.type === 'openai' || formData.type === 'ollama') && (
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); handleFetchModels(); }}
                          disabled={isFetchingModels}
                          className="flex items-center gap-1 text-xs text-foreground/70 hover:text-foreground hover:underline disabled:opacity-50"
                        >
                          {isFetchingModels ? (
                            <CircularLoader className="h-3 w-3" />
                          ) : (
                            <RefreshCw className="h-3 w-3" />
                          )}
                          {isFetchingModels ? 'Fetching...' : 'Fetch models'}
                        </button>
                      )}
                      <span className="text-muted-foreground">·</span>
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); handleVerifyAllEnabled(); }}
                        className="text-xs text-blue-500 hover:text-blue-600 hover:underline"
                      >
                        Verify enabled
                      </button>
                      <span className="text-muted-foreground">·</span>
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); enableAllModels(); }}
                        className="text-xs text-foreground/70 hover:text-foreground hover:underline"
                      >
                        Enable all
                      </button>
                      <span className="text-muted-foreground">·</span>
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); disableAllModels(); }}
                        className="text-xs text-muted-foreground hover:text-foreground"
                      >
                        Disable all
                      </button>
                    </div>
                  </div>

                  {showModels && (
                    <div className="flex flex-col gap-3 mt-4">
                      <div className="flex items-center justify-between gap-4">
                        <div className="relative flex-1">
                          <Input
                            placeholder="Search models..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="pl-8 h-9"
                          />
                          <div className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground">
                            <Plus className="h-3 w-3 rotate-45" />
                          </div>
                        </div>
                        <div className="flex items-center gap-2 px-2 py-1.5 rounded-md bg-secondary/20 border border-border/10">
                          <label htmlFor="toggle-connected" className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground whitespace-nowrap">
                            {showOnlyConnected ? "Connected" : "All Models"}
                          </label>
                          <input
                            type="checkbox"
                            id="toggle-connected"
                            checked={!showOnlyConnected}
                            onChange={(e) => setShowOnlyConnected(!e.target.checked)}
                            className="h-3.5 w-3.5 rounded border-input"
                          />
                        </div>
                      </div>

                      {showOnlyConnected && filteredModels.length === 0 && (
                        <div className="py-8 text-center border border-dashed border-border/20 rounded-lg bg-secondary/5">
                          <Wifi className="h-8 w-8 text-muted-foreground/30 mx-auto mb-2 animate-pulse" />
                          <p className="text-sm text-muted-foreground font-medium">Verifying connectivity...</p>
                          <p className="text-xs text-muted-foreground/60 mt-1">Models will appear here once confirmed.</p>
                          <Button
                            variant="link"
                            size="sm"
                            className="mt-2 text-blue-500 h-auto p-0"
                            onClick={() => setShowOnlyConnected(false)}
                          >
                            View all models
                          </Button>
                        </div>
                      )}

                      <div className="grid gap-2 max-h-[400px] overflow-y-auto pr-1 custom-scrollbar">
                        {filteredModels.length === 0 && !showOnlyConnected ? (
                          <div className="text-center py-8 text-muted-foreground text-sm">
                            {searchQuery ? 'No models match your search' : 'No models available'}
                          </div>
                        ) : (
                          filteredModels.map((model) => (
                            <div
                              key={model.id}
                              onClick={() => {
                                // Prevent enabling if model failed test
                                if (modelStatus[model.id]?.state === 'error') {
                                  alert("This model failed connectivity tests and cannot be enabled. Please re-verify or check your API key/credits.");
                                  return;
                                }
                                toggleModel(model.id);
                              }}
                              className={cn(
                                'flex items-center justify-between p-3 rounded-lg border cursor-pointer transition-all',
                                modelStates[model.id]
                                  ? 'bg-muted border-muted-foreground/30 hover:bg-muted/80'
                                  : 'bg-secondary/30 border-border/50 hover:bg-secondary/50',
                                modelStatus[model.id]?.state === 'error' && 'opacity-60 grayscale-[0.5]'
                              )}
                            >
                              <div className="flex items-center gap-3">
                                <div
                                  className={cn(
                                    'w-5 h-5 rounded-md border-2 flex items-center justify-center transition-colors',
                                    modelStates[model.id]
                                      ? 'bg-foreground border-foreground'
                                      : 'border-muted-foreground/30',
                                    modelStatus[model.id]?.state === 'error' && 'border-red-500/50'
                                  )}
                                >
                                  {modelStates[model.id] && (
                                    <Check className="h-3 w-3 text-primary-foreground" />
                                  )}
                                  {!modelStates[model.id] && modelStatus[model.id]?.state === 'error' && (
                                    <X className="h-3 w-3 text-red-500" />
                                  )}
                                </div>
                                <div>
                                  <div className="flex items-center gap-2">
                                    <span className={cn(
                                      'text-sm font-medium flex items-center gap-1.5',
                                      modelStates[model.id] ? 'text-foreground' : 'text-muted-foreground'
                                    )}>
                                      {model.name}
                                      {modelStatus[model.id]?.agentic && (
                                        <div className="flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-blue-500/10 border border-blue-500/20 text-[10px] text-blue-500 font-bold uppercase tracking-wider">
                                          <Sparkles className="h-2.5 w-2.5" />
                                          Agent Ready
                                        </div>
                                      )}
                                    </span>
                                    {allModels.openrouter.some(m => m.id === model.id && m.enabled) && (
                                      <span title="Recommended">
                                        <Sparkles className="h-3 w-3 text-amber-500" />
                                      </span>
                                    )}
                                  </div>
                                  <span className="text-xs text-muted-foreground font-mono">
                                    {model.id}
                                  </span>
                                </div>
                              </div>
                              <div className="flex items-center gap-3">
                                <div className="text-xs text-muted-foreground">
                                  {(model.contextWindow / 1000).toFixed(0)}K ctx
                                </div>

                                <div className="flex items-center gap-1">
                                  {modelStatus[model.id]?.state !== 'idle' && (
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="h-8 w-8 text-muted-foreground/50 hover:text-blue-500"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setViewingLogModelId(model.id);
                                      }}
                                      title="View test logs"
                                    >
                                      <Terminal className="h-4 w-4" />
                                    </Button>
                                  )}
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className={cn(
                                      "h-8 w-8",
                                      modelStatus[model.id]?.state === 'success' ? "text-green-500" :
                                        modelStatus[model.id]?.state === 'error' ? "text-red-500" :
                                          "text-muted-foreground/30 hover:text-blue-500"
                                    )}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleVerifyModel(model);
                                    }}
                                    disabled={modelStatus[model.id]?.state === 'loading'}
                                    title={modelStatus[model.id]?.error || "Test model connectivity"}
                                  >
                                    {modelStatus[model.id]?.state === 'loading' ? (
                                      <CircularLoader className="h-3.5 w-3.5" />
                                    ) : modelStatus[model.id]?.state === 'success' ? (
                                      <Check className="h-4 w-4" />
                                    ) : modelStatus[model.id]?.state === 'error' ? (
                                      <X className="h-4 w-4" />
                                    ) : (
                                      <Wifi className="h-4 w-4" />
                                    )}
                                  </Button>

                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className={cn(
                                      "h-8 w-8",
                                      settings.defaultModelId === model.id ? "text-yellow-400 hover:text-yellow-500" : "text-muted-foreground/30 hover:text-yellow-400"
                                    )}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      updateSetting('defaultModelId', model.id);
                                    }}
                                    title="Set as default model"
                                  >
                                    <Star className="h-4 w-4" fill={settings.defaultModelId === model.id ? "currentColor" : "none"} />
                                  </Button>
                                </div>
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {formData.type === 'custom' && (
                <div className="p-4 rounded-lg bg-secondary/30 border border-border/50">
                  <p className="text-sm text-muted-foreground">
                    For custom providers, models will be auto-detected or you can manually configure them after saving.
                  </p>
                </div>
              )}

              {testResult && (
                <div className={cn(
                  "p-3 rounded-lg text-sm flex items-start gap-2",
                  testResult.success ? "bg-green-500/10 text-green-500 border border-green-500/20" : "bg-destructive/10 text-destructive border border-destructive/20"
                )}>
                  {testResult.success ? <Check className="h-4 w-4 mt-0.5" /> : <X className="h-4 w-4 mt-0.5" />}
                  <div>
                    <p className="font-medium">{testResult.success ? 'Connection Verified' : 'Connection Failed'}</p>
                    <p className="text-xs opacity-90 mt-1">{testResult.message || testResult.error}</p>
                    {testResult.response && (
                      <p className="text-xs font-mono mt-1 opacity-75">Response: "{testResult.response}"</p>
                    )}
                  </div>
                </div>
              )}

              <div className="flex justify-end gap-2 pt-2">
                <Button variant="ghost" size="sm" onClick={handleCancel}>
                  <X className="h-4 w-4 mr-1" />
                  Cancel
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={handleTestConnection}
                  disabled={isTesting || (!formData.apiKey && formData.type !== 'local' && formData.type !== 'ollama')}
                >
                  {isTesting ? <CircularLoader className="h-4 w-4 mr-2" /> : <Wifi className="h-4 w-4 mr-2" />}
                  Test Connection
                </Button>
                <Button size="sm" onClick={handleSave} disabled={enabledCount === 0 && formData.type !== 'custom'}>
                  <Check className="h-4 w-4 mr-1" />
                  Save
                </Button>
              </div>
            </div>
          )
          }


          <div className="space-y-3">
            {modelProviders.map((provider) => (
              <div
                key={provider.id}
                className="flex items-center justify-between p-4 border border-border/10 rounded-lg bg-card"
              >
                <div className="flex items-center gap-3">
                  <div
                    className={`w-2 h-2 rounded-full ${provider.enabled ? 'bg-green-500' : 'bg-muted'}`}
                  />
                  <div>
                    <h3 className="font-medium">{provider.id === 'system-default' ? 'Reavion' : provider.name}</h3>
                    <p className="text-xs text-muted-foreground">
                      {provider.id === 'system-default' ? `${provider.models.length} model` : `${provider.type} · ${provider.models.length} models`}
                    </p>
                    {provider.models.find(m => m.id === settings.defaultModelId) ? (
                      <div className="flex items-center gap-1.5 mt-1.5">
                        <span className="inline-flex items-center gap-1 text-[10px] bg-yellow-500/10 text-yellow-600 dark:text-yellow-400 px-2 py-0.5 rounded font-medium border border-yellow-500/20">
                          <Star className="w-3 h-3" fill="currentColor" />
                          {provider.id === 'system-default' ? 'Default' : `Default: ${provider.models.find(m => m.id === settings.defaultModelId)?.name}`}
                        </span>
                      </div>
                    ) : (
                      provider.enabled && provider.models.length > 0 && !settings.defaultModelId && (
                        <div className="flex items-center gap-1.5 mt-1.5">
                          <span className="inline-flex items-center gap-1 text-[10px] bg-muted text-muted-foreground px-2 py-0.5 rounded font-medium border border-border">
                            <Star className="w-3 h-3 text-muted-foreground/50" />
                            No default selected
                          </span>
                        </div>
                      )
                    )}
                    {/* Fallback Badge for System Default Provider only implies it is a system-wide default if no local is set anywhere.
                    However, finding 'settings.defaultModelId' works globally.
                    So the above conditional is correct for specific providers.
                    What if we want to show 'System Default' usage badge?
                    If !settings.defaultModelId, the system default is implicitly active.
                */}
                    {provider.id === 'system-default' && !settings.defaultModelId && (
                      <div className="flex items-center gap-1.5 mt-1.5">
                        <span className="inline-flex items-center gap-1 text-[10px] bg-blue-500/10 text-blue-600 dark:text-blue-400 px-2 py-0.5 rounded font-medium border border-blue-500/20">
                          <Check className="w-3 h-3" />
                          Active
                        </span>
                      </div>
                    )}

                  </div>
                </div>
                <div className="flex items-center gap-1">
                  {provider.id === 'system-default' ? (
                    <div className="flex items-center px-3 py-1 bg-secondary/50 rounded text-xs text-muted-foreground">
                      System Managed
                    </div>
                  ) : (
                    <>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => handleEdit(provider)}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-destructive hover:text-destructive"
                        onClick={() => deleteModelProvider(provider.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </>
                  )}
                </div>
              </div>
            ))}
            {modelProviders.length === 0 && !isAdding && (
              <div className="text-center py-8 text-muted-foreground">
                <p>No model providers configured.</p>
                <p className="text-sm">Add a provider to start using the Reavion Agent.</p>
              </div>
            )}
          </div>
        </>
      )}

      <Dialog open={!!viewingLogModelId} onOpenChange={(open) => !open && setViewingLogModelId(null)}>
        <DialogContent className="max-w-2xl bg-card border-border/20">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Terminal className="h-5 w-5 text-blue-500" />
              Test Logs: {currentModels.find(m => m.id === viewingLogModelId)?.name || viewingLogModelId}
            </DialogTitle>
            <DialogDescription>
              Execution trace from the agentic compatibility test.
            </DialogDescription>
          </DialogHeader>

          {viewingLogModelId && modelStatus[viewingLogModelId] && (
            <div className="space-y-5 py-2">
              <div className="flex items-center justify-between text-xs text-muted-foreground px-1 pb-2 border-b border-border/10">
                <span className="flex items-center gap-1">
                  <History className="h-3 w-3" />
                  Last tested: {new Date(modelStatus[viewingLogModelId].timestamp || 0).toLocaleString()}
                </span>
                <div className="flex items-center gap-2">
                  <span className={cn(
                    "px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-widest",
                    modelStatus[viewingLogModelId].state === 'success' ? "bg-green-500/10 text-green-500" : "bg-red-500/10 text-red-500"
                  )}>
                    {modelStatus[viewingLogModelId].state}
                  </span>
                  {modelStatus[viewingLogModelId].agentic && (
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-widest bg-blue-500/10 text-blue-500">
                      Agent Ready
                    </span>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-3">
                  <h4 className="text-xs font-bold uppercase tracking-widest text-muted-foreground flex items-center gap-2">
                    <Info className="h-3.5 w-3.5" />
                    Status Summary
                  </h4>
                  <div className={cn(
                    "p-3 rounded-xl border text-[13px] leading-relaxed",
                    modelStatus[viewingLogModelId].state === 'success' ? "bg-green-500/5 border-green-500/10 text-foreground/90" : "bg-red-500/5 border-red-500/10 text-red-400"
                  )}>
                    {modelStatus[viewingLogModelId].error || modelStatus[viewingLogModelId].log}
                  </div>

                  <h4 className="text-xs font-bold uppercase tracking-widest text-muted-foreground flex items-center gap-2 pt-2">
                    <Sparkles className="h-3.5 w-3.5" />
                    Recommended Action
                  </h4>
                  <div className="p-3 rounded-xl bg-secondary/20 border border-border/10 text-[12px] text-muted-foreground leading-relaxed italic">
                    {modelStatus[viewingLogModelId].state === 'success'
                      ? "Success! This model is fully compatible with Reavion Agentic tools. You can safely use it for complex tasks."
                      : modelStatus[viewingLogModelId].error?.includes("No endpoints found that support tool use")
                        ? "OpenRouter Error: This free/preview model currently has no providers that support tool calls. Try a non-free version or a larger model (e.g., Claude 3.5 Sonnet)."
                        : modelStatus[viewingLogModelId].error?.includes("Functional Incompatibility")
                          ? "The model is connected but failed the agentic logic test. It may be too small or lack sufficient reasoning for tools. Use a larger model."
                          : "Verify your API key has credits and that the model ID is correct for this provider. Check your provider's dashboard for incidents."
                    }
                  </div>
                </div>

                <div className="space-y-3">
                  <h4 className="text-xs font-bold uppercase tracking-widest text-muted-foreground flex items-center gap-2">
                    <History className="h-3.5 w-3.5" />
                    Execution Trace
                  </h4>
                  <div className="space-y-1.5 max-h-[220px] overflow-y-auto pr-2 custom-scrollbar thin-scrollbar">
                    {modelStatus[viewingLogModelId].trace?.map((t, i) => (
                      <div key={i} className="group flex gap-3 text-xs border-l-[1px] border-border/20 pl-4 py-2 hover:bg-secondary/5 rounded-r-md transition-colors relative">
                        <div className={cn(
                          "absolute -left-[5px] top-3 w-[9px] h-[9px] rounded-full border-2 border-card",
                          t.status === 'success' ? "bg-green-500" :
                            t.status === 'error' ? "bg-red-500" :
                              t.status === 'warn' ? "bg-amber-500" : "bg-blue-500"
                        )} />
                        <div>
                          <div className="font-bold text-foreground/80 flex items-center gap-1.5">
                            {t.step}
                            <span className="text-[10px] text-muted-foreground/40 font-normal">Step {i + 1}</span>
                          </div>
                          {t.detail && <div className="text-muted-foreground/70 mt-1 font-mono text-[9px] leading-tight break-all bg-black/20 p-1.5 rounded border border-border/5">{t.detail}</div>}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div className="space-y-3 pt-2">
                <h4 className="text-xs font-bold uppercase tracking-widest text-muted-foreground flex items-center gap-2">
                  <Terminal className="h-3.5 w-3.5" />
                  Raw Model Output
                </h4>
                <div className="relative group">
                  <ScrollArea className="h-[120px] w-full rounded-xl border border-border/10 bg-black/60 p-3">
                    <pre className="text-[11px] font-mono whitespace-pre-wrap break-all text-blue-200/60 leading-tight">
                      {modelStatus[viewingLogModelId].rawResponse || "No raw response captured."}
                    </pre>
                  </ScrollArea>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
