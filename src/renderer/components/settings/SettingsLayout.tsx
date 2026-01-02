import { useState } from 'react';
import { Server, Wrench, Key, ShieldCheck, Monitor, Settings } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ScrollArea } from '@/components/ui/scroll-area';
import { GeneralSettings } from './GeneralSettings';
import { MCPSettings } from './MCPSettings';
import { APIToolsSettings } from './APIToolsSettings';
import { IntegrationsSettings } from './IntegrationsSettings';
import { ModelProvidersSettings } from './ModelProvidersSettings';

type SettingsTab = 'general' | 'mcp' | 'api-tools' | 'model-providers' | 'integrations';

const tabs: { id: SettingsTab; label: string; icon: React.ReactNode }[] = [
  { id: 'general', label: 'General', icon: <Monitor className="h-4 w-4" /> },
  { id: 'mcp', label: 'MCP Servers', icon: <Server className="h-4 w-4" /> },
  { id: 'api-tools', label: 'API Tools', icon: <Wrench className="h-4 w-4" /> },
  { id: 'model-providers', label: 'Model Providers', icon: <Key className="h-4 w-4" /> },
  { id: 'integrations', label: 'Integrations', icon: <ShieldCheck className="h-4 w-4" /> },
];

export function SettingsLayout() {
  const [activeTab, setActiveTab] = useState<SettingsTab>('general');

  return (
    <div className="flex flex-col h-full bg-background overflow-hidden">
      <div className="h-16 border-b border-border flex items-center px-6 bg-card/50 backdrop-blur-sm gap-3">
        <div className="w-9 h-9 rounded-xl bg-muted/40 flex items-center justify-center border border-border/40 shadow-sm transition-all">
          <Settings className="h-4 w-4 text-muted-foreground/70" />
        </div>
        <h1 className="text-xl font-semibold bg-gradient-to-r from-foreground to-foreground/60 bg-clip-text text-transparent">
          Settings
        </h1>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <div className="w-64 border-r border-border bg-card/30 p-4 space-y-1">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                "w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors",
                activeTab === tab.id
                  ? "bg-muted text-foreground shadow-sm"
                  : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
              )}
            >
              {tab.icon}
              {tab.label}
            </button>
          ))}
        </div>

        {/* Content */}
        <ScrollArea className="flex-1">
          <div className="p-8 max-w-4xl mx-auto h-full">
            {activeTab === 'general' && <GeneralSettings />}
            {activeTab === 'mcp' && <MCPSettings />}
            {activeTab === 'api-tools' && <APIToolsSettings />}
            {activeTab === 'model-providers' && <ModelProvidersSettings />}
            {activeTab === 'integrations' && <IntegrationsSettings />}
          </div>
        </ScrollArea>
      </div>
    </div>
  );
}
