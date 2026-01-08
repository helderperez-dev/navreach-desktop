import { useEffect } from 'react';
import { useChatStore } from '@/stores/chat.store';
import { useSettingsStore } from '@/stores/settings.store';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
} from '@/components/ui/select';

export function ModelSelector() {
  const { selectedModel, setSelectedModel } = useChatStore();
  const { modelProviders } = useSettingsStore();

  const enabledProviders = modelProviders.filter((p) => p.enabled);

  useEffect(() => {
    if (!selectedModel && enabledProviders.length > 0) {
      const firstProvider = enabledProviders[0];
      if (firstProvider.models.length > 0) {
        setSelectedModel({ ...firstProvider.models[0], providerId: firstProvider.id });
      }
    }
  }, [selectedModel, enabledProviders, setSelectedModel]);

  const handleModelChange = (modelId: string) => {
    for (const provider of enabledProviders) {
      const model = provider.models.find((m) => m.id === modelId);
      if (model) {
        setSelectedModel({ ...model, providerId: provider.id });
        return;
      }
    }
  };

  const getDisplayName = () => {
    if (!selectedModel) return 'Select model';
    return selectedModel.providerId === 'system-default' ? 'Reavion Flash' : selectedModel.name;
  };

  if (enabledProviders.length === 0) {
    return (
      <span className="text-xs text-muted-foreground/60">No model</span>
    );
  }

  return (
    <Select value={selectedModel?.id || ''} onValueChange={handleModelChange}>
      <SelectTrigger className="h-auto px-0 py-0 text-xs border-0 bg-transparent shadow-none hover:text-foreground text-muted-foreground gap-0 w-auto focus:ring-0 [&>svg]:hidden">
        <span className="truncate">{getDisplayName()}</span>
      </SelectTrigger>
      <SelectContent align="start">
        {enabledProviders.map((provider) => (
          <SelectGroup key={provider.id}>
            <SelectLabel className="text-xs text-muted-foreground">
              {provider.id === 'system-default' ? 'Reavion' : provider.name}
            </SelectLabel>
            {provider.models.map((model) => (
              <SelectItem key={model.id} value={model.id} className="text-xs">
                {provider.id === 'system-default' ? 'Reavion Flash' : model.name}
              </SelectItem>
            ))}
          </SelectGroup>
        ))}
      </SelectContent>
    </Select>
  );
}
