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
import { ChevronUp } from 'lucide-react';
import { cn } from '@/lib/utils';

export function ModelSelector() {
  const { selectedModel, setSelectedModel } = useChatStore();
  const { modelProviders } = useSettingsStore();

  const enabledProviders = modelProviders.filter((p) => p.enabled);

  useEffect(() => {
    const systemProvider = enabledProviders.find(p => p.id === 'system-default');
    const systemModel = systemProvider?.models[0];

    // Case 1: No model selected - use system default if available, otherwise first available model
    if (!selectedModel) {
      if (systemModel) {
        setSelectedModel({ ...systemModel, providerId: 'system-default' });
      } else if (enabledProviders.length > 0) {
        const firstProvider = enabledProviders[0];
        if (firstProvider.models.length > 0) {
          setSelectedModel({ ...firstProvider.models[0], providerId: firstProvider.id });
        }
      }
      return;
    }

    // Case 2: User is on system-default, but the model ID has changed in the system settings
    if (selectedModel.providerId === 'system-default' && systemModel && selectedModel.id !== systemModel.id) {
      setSelectedModel({ ...systemModel, providerId: 'system-default' });
    }
  }, [selectedModel, enabledProviders, setSelectedModel]);

  const handleModelChange = (compositeId: string) => {
    const [providerId, ...modelIdParts] = compositeId.split('::');
    const modelId = modelIdParts.join('::');

    const provider = enabledProviders.find(p => p.id === providerId);
    if (!provider) return;

    const model = provider.models.find((m) => m.id === modelId);
    if (model) {
      setSelectedModel({ ...model, providerId: provider.id });
    }
  };

  const getDisplayName = () => {
    if (!selectedModel) return 'Select';
    return selectedModel.providerId === 'system-default' ? 'Reavion Nexus' : selectedModel.name;
  };

  if (enabledProviders.length === 0) {
    return (
      <span className="text-xs text-muted-foreground/60">No model</span>
    );
  }

  return (
    <Select value={selectedModel ? `${selectedModel.providerId}::${selectedModel.id}` : ''} onValueChange={handleModelChange}>
      <SelectTrigger className={cn(
        "h-7 px-2 text-[11px] border-0 bg-transparent shadow-none hover:bg-white/5 transition-all text-muted-foreground/60 hover:text-foreground gap-1.5 focus:ring-0 w-auto rounded-md [&>svg:last-child]:hidden [&>span:last-child]:hidden"
      )}>
        <ChevronUp className="h-3 w-3 opacity-50" />
        <span className="truncate">{getDisplayName()}</span>
      </SelectTrigger>
      <SelectContent align="start">
        {enabledProviders.map((provider) => (
          <SelectGroup key={provider.id}>
            <SelectLabel className="text-xs text-muted-foreground">
              {provider.id === 'system-default' ? 'Reavion' : provider.name}
            </SelectLabel>
            {provider.models.map((model) => {
              const compositeId = `${provider.id}::${model.id}`;
              return (
                <SelectItem key={compositeId} value={compositeId} className="text-xs">
                  {provider.id === 'system-default' ? 'Reavion Nexus' : model.name}
                </SelectItem>
              );
            })}
          </SelectGroup>
        ))}
      </SelectContent>
    </Select>
  );
}
