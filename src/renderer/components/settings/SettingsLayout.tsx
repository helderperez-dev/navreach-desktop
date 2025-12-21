import { useState } from 'react';
import { Server, Wrench, Key, ShieldCheck } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { MCPSettings } from './MCPSettings';
import { APIToolsSettings } from './APIToolsSettings';
import { IntegrationsSettings } from './IntegrationsSettings';
import { ModelProvidersSettings } from './ModelProvidersSettings';

type SettingsTab = 'mcp' | 'api-tools' | 'model-providers' | 'integrations';

const tabs: { id: SettingsTab; label: string; icon: React.ReactNode }[] = [
  { id: 'mcp', label: 'MCP Servers', icon: <Server className="h-4 w-4" /> },
  { id: 'api-tools', label: 'API Tools', icon: <Wrench className="h-4 w-4" /> },
  { id: 'model-providers', label: 'Model Providers', icon: <Key className="h-4 w-4" /> },
  { id: 'integrations', label: 'Integrations', icon: <ShieldCheck className="h-4 w-4" /> },
];

export function SettingsLayout() {
  const [activeTab, setActiveTab] = useState<SettingsTab>('mcp');

  return (
    <div className="flex flex-col h-full bg-background overflow-hidden">
      <div className="h-16 border-b border-border flex items-center px-6 bg-card/50 backdrop-blur-sm">
        <h1 className="text-xl font-semibold bg-gradient-to-r from-white to-white/60 bg-clip-text text-transparent">
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
                  ? "bg-blue-600/10 text-blue-400"
                  : "text-muted-foreground hover:bg-white/5 hover:text-white"
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
