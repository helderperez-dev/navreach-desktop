import { useState, useEffect } from 'react';
import { Plus, Pencil, Trash2, Check, X, ChevronDown, ChevronRight, Sparkles, RefreshCw, Wifi, Star, History, Terminal, Info, MoreVertical } from 'lucide-react';
import { CircularLoader } from '@/components/ui/CircularLoader';
import { v4 as uuidv4 } from 'uuid';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogHeader,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Field } from "@/components/ui/field";
import { Label } from "@/components/ui/label";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useSettingsStore } from '@/stores/settings.store';
import type { ModelProvider, ModelConfig } from '@shared/types';
import { cn } from '@/lib/utils';
import { useConfirmation } from '@/providers/ConfirmationProvider';


const providerTypes = [
  { value: 'openai', label: 'OpenAI' },
  { value: 'anthropic', label: 'Anthropic' },
  { value: 'openrouter', label: 'OpenRouter' },
  { value: 'z-ai', label: 'Z.AI' },
  { value: 'lmstudio', label: 'LM Studio' },
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
  'z-ai': [],
};

const defaultModels: Record<string, ModelConfig[]> = {
  openai: allModels.openai.filter(m => m.enabled),
  anthropic: allModels.anthropic.filter(m => m.enabled),
  openrouter: allModels.openrouter.filter(m => m.enabled),
  custom: [],
  local: [],
  ollama: [],
  'z-ai': allModels['z-ai'].filter(m => m.enabled),
  lmstudio: [],
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


export function ModelProvidersSettings() {
  const { confirm } = useConfirmation();
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




  // Track if we have explicitly fetched/loaded models for the current form
  // New providers start as false (requiring fetch), Edited start as true
  const [hasFetchedModels, setHasFetchedModels] = useState(false);

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
    // Hide default models until user fetches
    setHasFetchedModels(false);
  };

  const handleFetchModels = async () => {
    if (formData.type !== 'openrouter' && formData.type !== 'openai' && formData.type !== 'ollama' && formData.type !== 'z-ai' && formData.type !== 'lmstudio') return;

    setIsFetchingModels(true);
    try {
      setHasFetchedModels(false);

      const fetchedModels: ModelConfig[] = await window.api.ai.fetchModels({
        apiKey: formData.apiKey,
        baseUrl: formData.baseUrl,
        type: formData.type || 'openai'
      });

      if (fetchedModels.length > 0) {
        const type = formData.type;
        const newAvailableModels = { ...availableModels, [type]: fetchedModels };
        setAvailableModels(newAvailableModels);

        const newModelStates: Record<string, boolean> = {};
        fetchedModels.forEach(m => {
          newModelStates[m.id] = modelStates[m.id] ?? false;
        });
        setModelStates(newModelStates);
        // Mark as fetched so they appear
        setHasFetchedModels(true);
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
    setHasFetchedModels(true);
  };

  const handleSave = async () => {
    if (!formData.name) {
      alert('Please enter a name for this provider');
      return;
    }
    if (!formData.apiKey && formData.type !== 'local' && formData.type !== 'ollama' && formData.type !== 'lmstudio') {
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
    // Reset fetch state on type change
    setHasFetchedModels(false);
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

  // Logic: Use defaults from availableModels ONLY if we have fetched (or editing).
  // If adding new, we hide defaults until fetch.
  // Exception: local/custom/ollama usually rely on manual entry or simple defaults, 
  // but for OpenAI/Anthropic/OpenRouter we want to enforce the "empty until fetch" rule.
  const rawModels = availableModels[formData.type || 'openai'] || [];
  const currentModels = (isAdding && !hasFetchedModels && ['openai', 'anthropic', 'openrouter', 'z-ai', 'lmstudio'].includes(formData.type || ''))
    ? []
    : rawModels;

  const filteredModels = currentModels.filter(m => {
    const matchesSearch = !searchQuery ||
      m.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      m.id.toLowerCase().includes(searchQuery.toLowerCase());

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
                <Field label="Name">
                  <Input
                    value={formData.name || ''}
                    onChange={(e) => setFormData((prev) => ({ ...prev, name: e.target.value }))}
                    placeholder="My OpenAI"
                  />
                </Field>
                <Field label="Type">
                  <Select
                    value={formData.type || 'openai'}
                    onValueChange={(value) => handleTypeChange(value)}
                  >
                    <SelectTrigger className="w-full h-12">
                      <SelectValue placeholder="Select type" />
                    </SelectTrigger>
                    <SelectContent>
                      {providerTypes.map((type) => (
                        <SelectItem key={type.value} value={type.value}>
                          {type.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
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

              <Field label={formData.type === 'local' || formData.type === 'ollama' || formData.type === 'lmstudio' ? 'Configuration' : 'API Key'}>
                <Input
                  type={formData.type === 'local' || formData.type === 'ollama' || formData.type === 'lmstudio' ? 'text' : 'password'}
                  value={formData.apiKey || ''}
                  onChange={(e) => setFormData((prev) => ({ ...prev, apiKey: e.target.value }))}
                  placeholder={
                    formData.type === 'local' ? 'Local model configuration (optional)' :
                      formData.type === 'ollama' ? 'Not required for local Ollama' :
                        formData.type === 'lmstudio' ? 'Not required for local LM Studio' :
                          'sk-...'
                  }
                  disabled={formData.type === 'local' || formData.type === 'ollama' || formData.type === 'lmstudio'}
                  className={formData.type === 'local' || formData.type === 'ollama' || formData.type === 'lmstudio' ? 'hidden' : ''}
                />
              </Field>

              {(formData.type === 'custom' || formData.type === 'openai' || formData.type === 'ollama' || formData.type === 'z-ai' || formData.type === 'lmstudio') && (
                <Field label={`Base URL ${formData.type !== 'custom' ? '(Optional)' : ''}`}>
                  <Input
                    value={formData.baseUrl || ''}
                    onChange={(e) => setFormData((prev) => ({ ...prev, baseUrl: e.target.value }))}
                    placeholder={
                      formData.type === 'ollama' ? "http://localhost:11434" :
                        formData.type === 'lmstudio' ? "http://localhost:1234/v1" :
                          formData.type === 'z-ai' ? "https://api.z.ai/api/coding/paas/v4" :
                            formData.type === 'openai' ? "https://api.openai.com/v1" :
                              "https://api.example.com/v1"
                    }
                  />
                </Field>
              )}

              <div className="flex items-center gap-3 h-12 px-4 rounded-xl border border-border bg-muted/20 hover:bg-muted/30 transition-colors cursor-pointer" onClick={() => setFormData((prev) => ({ ...prev, enabled: !prev.enabled }))}>
                <Checkbox
                  id="enabled"
                  checked={formData.enabled ?? true}
                  onCheckedChange={(checked) => setFormData((prev) => ({ ...prev, enabled: !!checked }))}
                  onClick={(e) => e.stopPropagation()}
                />
                <Label htmlFor="enabled" className="cursor-pointer select-none flex-1">
                  Enabled
                </Label>
              </div>

              {formData.type !== 'custom' && (
                <div className="space-y-3 pt-2">
                  <div
                    className="flex items-center justify-between cursor-pointer"
                    onClick={() => {
                      const willShow = !showModels;
                      setShowModels(willShow);
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
                        {`${enabledCount} of ${currentModels.length} enabled`}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      {(formData.type === 'openrouter' || formData.type === 'openai' || formData.type === 'ollama' || formData.type === 'z-ai' || formData.type === 'lmstudio') && (
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
                          <label className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground whitespace-nowrap">
                            All Models
                          </label>
                        </div>
                      </div>



                      <div className="grid gap-2 max-h-[400px] overflow-y-auto pr-1 custom-scrollbar">
                        {filteredModels.length === 0 ? (
                          <div className="text-center py-8 text-muted-foreground text-sm">
                            {searchQuery ? 'No models match your search' : 'No models available'}
                          </div>
                        ) : (
                          filteredModels.map((model) => (
                            <div
                              key={model.id}
                              onClick={() => {
                                toggleModel(model.id);
                              }}
                              className={cn(
                                'flex items-center justify-between p-3 rounded-lg border cursor-pointer transition-all',
                                modelStates[model.id]
                                  ? 'bg-muted border-muted-foreground/30 hover:bg-muted/80'
                                  : 'bg-secondary/30 border-border/50 hover:bg-secondary/50'
                              )}
                            >
                              <div className="flex items-center gap-3">
                                <Checkbox
                                  checked={modelStates[model.id]}
                                  onCheckedChange={() => toggleModel(model.id)}
                                  onClick={(e) => e.stopPropagation()}
                                />
                                <div>
                                  <div className="flex items-center gap-2">
                                    <span className={cn(
                                      'text-sm font-medium flex items-center gap-1.5',
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
                              <div className="flex items-center gap-3">
                                <div className="text-xs text-muted-foreground">
                                  {(model.contextWindow / 1000).toFixed(0)}K ctx
                                </div>



                                <div className="flex items-center gap-1">

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
                    {(testResult as any).trace && (testResult as any).trace.length > 0 && (
                      <div className="mt-2 p-2 bg-black/20 rounded border border-white/10 text-[10px] font-mono overflow-x-auto max-h-[200px] overflow-y-auto">
                        <div className="font-semibold mb-1 opacity-70">Diagnostic Trace:</div>
                        {((testResult as any).trace).map((step: any, i: number) => (
                          <div key={i} className={cn("mb-0.5", step.status === 'error' ? 'text-red-400' : step.status === 'warn' ? 'text-yellow-400' : step.status === 'success' ? 'text-green-400' : 'text-muted-foreground')}>
                            <span className="opacity-70">[{step.step}]</span> {step.detail}
                          </div>
                        ))}
                      </div>
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
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                        >
                          <MoreVertical className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => handleEdit(provider)}>
                          <Pencil className="h-4 w-4 mr-2" />
                          Edit
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          className="text-destructive focus:text-destructive"
                          onClick={async () => {
                            const confirmed = await confirm({
                              title: 'Delete Provider',
                              description: `Are you sure you want to delete "${provider.name}"? This will remove all associated models.`,
                              confirmLabel: 'Delete',
                              variant: 'destructive'
                            });
                            if (confirmed) deleteModelProvider(provider.id);
                          }}
                        >

                          <Trash2 className="h-4 w-4 mr-2" />
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
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
      )
      }


    </div >
  );
}
