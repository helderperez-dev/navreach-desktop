import { useState, useEffect } from 'react';
import { Plus, Pencil, Trash2, Check, X, ChevronDown, ChevronRight, Sparkles, RefreshCw, Loader2 } from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useSettingsStore } from '@/stores/settings.store';
import type { ModelProvider, ModelConfig } from '@shared/types';
import { cn } from '@/lib/utils';

const providerTypes = [
  { value: 'openai', label: 'OpenAI' },
  { value: 'anthropic', label: 'Anthropic' },
  { value: 'openrouter', label: 'OpenRouter' },
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
};

const defaultModels: Record<string, ModelConfig[]> = {
  openai: allModels.openai.filter(m => m.enabled),
  anthropic: allModels.anthropic.filter(m => m.enabled),
  openrouter: allModels.openrouter.filter(m => m.enabled),
  custom: [],
};

interface OpenRouterModel {
  id: string;
  name: string;
  context_length: number;
  pricing: {
    prompt: string;
    completion: string;
  };
}

async function fetchOpenRouterModels(): Promise<ModelConfig[]> {
  try {
    const response = await fetch('https://openrouter.ai/api/v1/models');
    const data = await response.json();

    if (data.data && Array.isArray(data.data)) {
      return data.data
        .filter((m: OpenRouterModel) => m.id && m.name)
        .map((m: OpenRouterModel) => ({
          id: m.id,
          name: m.name.replace(/^.*?\//, '').replace(/-/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase()),
          providerId: '',
          contextWindow: m.context_length || 4096,
          enabled: false,
        }))
        .sort((a: ModelConfig, b: ModelConfig) => a.name.localeCompare(b.name));
    }
    return [];
  } catch (error) {
    console.error('Failed to fetch OpenRouter models:', error);
    return [];
  }
}

export function ModelProvidersSettings() {
  const { modelProviders, loadSettings, addModelProvider, updateModelProvider, deleteModelProvider } = useSettingsStore();
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

  useEffect(() => {
    loadSettings();
  }, []);

  const handleAdd = () => {
    setIsAdding(true);
    const type = 'openai';
    const models = availableModels[type] || [];
    const initialModelStates: Record<string, boolean> = {};
    models.forEach(m => {
      initialModelStates[m.id] = m.enabled ?? false;
    });
    setModelStates(initialModelStates);
    setFormData({
      name: '',
      type,
      apiKey: '',
      baseUrl: '',
      enabled: true,
      models: models.filter(m => m.enabled),
    });
    setShowModels(true);
    setSearchQuery('');
  };

  const handleFetchModels = async () => {
    if (formData.type !== 'openrouter') return;

    setIsFetchingModels(true);
    try {
      const fetchedModels = await fetchOpenRouterModels();
      if (fetchedModels.length > 0) {
        const newAvailableModels = { ...availableModels, openrouter: fetchedModels };
        setAvailableModels(newAvailableModels);

        const newModelStates: Record<string, boolean> = {};
        fetchedModels.forEach(m => {
          newModelStates[m.id] = modelStates[m.id] ?? false;
        });
        setModelStates(newModelStates);
      }
    } finally {
      setIsFetchingModels(false);
    }
  };

  const handleEdit = (provider: ModelProvider) => {
    setEditingId(provider.id);
    const type = provider.type;
    const models = availableModels[type] || [];
    const initialModelStates: Record<string, boolean> = {};
    models.forEach(m => {
      const existingModel = provider.models.find(pm => pm.id === m.id);
      initialModelStates[m.id] = existingModel ? (existingModel.enabled !== false) : false;
    });
    setModelStates(initialModelStates);
    setFormData(provider);
    setShowModels(true);
    setSearchQuery('');
  };

  const handleSave = async () => {
    if (!formData.name || !formData.apiKey) return;

    const type = formData.type || 'openai';
    const models = availableModels[type] || [];
    const enabledModels = models
      .filter(m => modelStates[m.id])
      .map(m => ({ ...m, providerId: editingId || uuidv4(), enabled: true }));

    const provider: ModelProvider = {
      id: editingId || uuidv4(),
      name: formData.name!,
      type: formData.type as ModelProvider['type'],
      apiKey: formData.apiKey!,
      baseUrl: formData.baseUrl,
      enabled: formData.enabled ?? true,
      models: enabledModels,
    };

    if (editingId) {
      await updateModelProvider(provider);
    } else {
      await addModelProvider(provider);
    }

    setIsAdding(false);
    setEditingId(null);
    setFormData({});
    setModelStates({});
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
      newModelStates[m.id] = m.enabled ?? false;
    });
    setModelStates(newModelStates);
    setFormData((prev) => ({
      ...prev,
      type: type as ModelProvider['type'],
      models: models.filter(m => m.enabled),
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
  const filteredModels = searchQuery
    ? currentModels.filter(m =>
      m.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      m.id.toLowerCase().includes(searchQuery.toLowerCase())
    )
    : currentModels;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold">Model Providers</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Configure AI model providers for the Navreach Agent.
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
        <div className="border border-border rounded-lg p-4 space-y-4 bg-card">
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

          <div className="space-y-2">
            <label className="text-sm font-medium">API Key</label>
            <Input
              type="password"
              value={formData.apiKey || ''}
              onChange={(e) => setFormData((prev) => ({ ...prev, apiKey: e.target.value }))}
              placeholder="sk-..."
            />
          </div>

          {formData.type === 'custom' && (
            <div className="space-y-2">
              <label className="text-sm font-medium">Base URL</label>
              <Input
                value={formData.baseUrl || ''}
                onChange={(e) => setFormData((prev) => ({ ...prev, baseUrl: e.target.value }))}
                placeholder="https://api.example.com/v1"
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
                onClick={() => setShowModels(!showModels)}
              >
                <div className="flex items-center gap-2">
                  {showModels ? (
                    <ChevronDown className="h-4 w-4 text-muted-foreground" />
                  ) : (
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  )}
                  <span className="text-sm font-medium">Available Models</span>
                  <span className="text-xs text-muted-foreground px-2 py-0.5 rounded-full bg-secondary">
                    {enabledCount} of {currentModels.length} enabled
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  {formData.type === 'openrouter' && (
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); handleFetchModels(); }}
                      disabled={isFetchingModels}
                      className="flex items-center gap-1 text-xs text-primary hover:underline disabled:opacity-50"
                    >
                      {isFetchingModels ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        <RefreshCw className="h-3 w-3" />
                      )}
                      {isFetchingModels ? 'Fetching...' : 'Fetch models'}
                    </button>
                  )}
                  <span className="text-muted-foreground">·</span>
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); enableAllModels(); }}
                    className="text-xs text-primary hover:underline"
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
                <>
                  <Input
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search models..."
                    className="h-8 text-sm"
                  />
                  <div className="grid gap-2 max-h-[350px] overflow-y-auto pr-2">
                    {filteredModels.length === 0 ? (
                      <div className="text-center py-8 text-muted-foreground text-sm">
                        {searchQuery ? 'No models match your search' : 'No models available'}
                      </div>
                    ) : (
                      filteredModels.map((model) => (
                        <div
                          key={model.id}
                          onClick={() => toggleModel(model.id)}
                          className={cn(
                            'flex items-center justify-between p-3 rounded-lg border cursor-pointer transition-all',
                            modelStates[model.id]
                              ? 'bg-primary/5 border-primary/30 hover:bg-primary/10'
                              : 'bg-secondary/30 border-border/50 hover:bg-secondary/50'
                          )}
                        >
                          <div className="flex items-center gap-3">
                            <div
                              className={cn(
                                'w-5 h-5 rounded-md border-2 flex items-center justify-center transition-colors',
                                modelStates[model.id]
                                  ? 'bg-primary border-primary'
                                  : 'border-muted-foreground/30'
                              )}
                            >
                              {modelStates[model.id] && (
                                <Check className="h-3 w-3 text-primary-foreground" />
                              )}
                            </div>
                            <div>
                              <div className="flex items-center gap-2">
                                <span className={cn(
                                  'text-sm font-medium',
                                  modelStates[model.id] ? 'text-foreground' : 'text-muted-foreground'
                                )}>
                                  {model.name}
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
                          <div className="text-xs text-muted-foreground">
                            {(model.contextWindow / 1000).toFixed(0)}K ctx
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </>
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

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" size="sm" onClick={handleCancel}>
              <X className="h-4 w-4 mr-1" />
              Cancel
            </Button>
            <Button size="sm" onClick={handleSave} disabled={enabledCount === 0 && formData.type !== 'custom'}>
              <Check className="h-4 w-4 mr-1" />
              Save
            </Button>
          </div>
        </div>
      )}

      <div className="space-y-3">
        {modelProviders.map((provider) => (
          <div
            key={provider.id}
            className="flex items-center justify-between p-4 border border-border rounded-lg bg-card"
          >
            <div className="flex items-center gap-3">
              <div
                className={`w-2 h-2 rounded-full ${provider.enabled ? 'bg-green-500' : 'bg-muted'}`}
              />
              <div>
                <h3 className="font-medium">{provider.name}</h3>
                <p className="text-xs text-muted-foreground">
                  {provider.type} · {provider.models.length} models
                </p>
              </div>
            </div>
            <div className="flex items-center gap-1">
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
            </div>
          </div>
        ))}

        {modelProviders.length === 0 && !isAdding && (
          <div className="text-center py-8 text-muted-foreground">
            <p>No model providers configured.</p>
            <p className="text-sm">Add a provider to start using the Navreach Agent.</p>
          </div>
        )}
      </div>
    </div>
  );
}
