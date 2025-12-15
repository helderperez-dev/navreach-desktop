import { useState } from 'react';
import { Server, Wrench, Key } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { MCPSettings } from './MCPSettings';
import { APIToolsSettings } from './APIToolsSettings';
import { ModelProvidersSettings } from './ModelProvidersSettings';

type SettingsTab = 'mcp' | 'api-tools' | 'model-providers';

const tabs: { id: SettingsTab; label: string; icon: React.ReactNode }[] = [
  { id: 'mcp', label: 'MCP Servers', icon: <Server className="h-4 w-4" /> },
  { id: 'api-tools', label: 'API Tools', icon: <Wrench className="h-4 w-4" /> },
  { id: 'model-providers', label: 'Model Providers', icon: <Key className="h-4 w-4" /> },
];

export function SettingsLayout() {
  const [activeTab, setActiveTab] = useState<SettingsTab>('model-providers');

  return (
    <div className="flex h-full">
      <div className="w-56 border-r border-border bg-card">
        <div className="p-4 border-b border-border">
          <h1 className="text-lg font-semibold">Settings</h1>
        </div>
        <nav className="p-2 space-y-1">
          {tabs.map((tab) => (
            <Button
              key={tab.id}
              variant={activeTab === tab.id ? 'secondary' : 'ghost'}
              className="w-full justify-start gap-2"
              onClick={() => setActiveTab(tab.id)}
            >
              {tab.icon}
              <span className="text-sm">{tab.label}</span>
            </Button>
          ))}
        </nav>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-6 max-w-3xl">
          {activeTab === 'mcp' && <MCPSettings />}
          {activeTab === 'api-tools' && <APIToolsSettings />}
          {activeTab === 'model-providers' && <ModelProvidersSettings />}
        </div>
      </ScrollArea>
    </div>
  );
}
