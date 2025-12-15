import { useState, useEffect } from 'react';
import { Plus, Pencil, Trash2, Check, X, Play, Square } from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useSettingsStore } from '@/stores/settings.store';
import type { MCPServer, MCPStdioConfig, MCPSSEConfig } from '@shared/types';

export function MCPSettings() {
  const { mcpServers, loadSettings, addMCPServer, updateMCPServer, deleteMCPServer } = useSettingsStore();
  const [isAdding, setIsAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [jsonMode, setJsonMode] = useState(false);
  const [jsonInput, setJsonInput] = useState('');
  const [formData, setFormData] = useState<Partial<MCPServer>>({
    name: '',
    type: 'stdio',
    enabled: true,
    config: { command: '', args: [], env: {} },
  });

  useEffect(() => {
    loadSettings();
  }, []);

  const handleAdd = () => {
    setIsAdding(true);
    setJsonMode(false);
    setFormData({
      name: '',
      type: 'stdio',
      enabled: true,
      config: { command: '', args: [], env: {} },
    });
  };

  const handleEdit = (server: MCPServer) => {
    setEditingId(server.id);
    setJsonMode(false);
    setFormData(server);
  };

  const handleSave = async () => {
    if (jsonMode) {
      try {
        const parsed = JSON.parse(jsonInput);
        const server: MCPServer = {
          id: editingId || uuidv4(),
          name: parsed.name || 'Unnamed Server',
          type: parsed.transport?.type === 'sse' ? 'sse' : 'stdio',
          enabled: true,
          config: parsed.transport?.type === 'sse'
            ? { url: parsed.transport.url, headers: parsed.transport.headers }
            : { command: parsed.command, args: parsed.args || [], env: parsed.env || {} },
        };
        if (editingId) {
          await updateMCPServer(server);
        } else {
          await addMCPServer(server);
        }
      } catch (e) {
        console.error('Invalid JSON:', e);
        return;
      }
    } else {
      if (!formData.name) return;

      const server: MCPServer = {
        id: editingId || uuidv4(),
        name: formData.name!,
        type: formData.type as 'stdio' | 'sse',
        enabled: formData.enabled ?? true,
        config: formData.config!,
      };

      if (editingId) {
        await updateMCPServer(server);
      } else {
        await addMCPServer(server);
      }
    }

    setIsAdding(false);
    setEditingId(null);
    setFormData({});
    setJsonInput('');
  };

  const handleCancel = () => {
    setIsAdding(false);
    setEditingId(null);
    setFormData({});
    setJsonInput('');
  };

  const handleConnect = async (serverId: string) => {
    try {
      await window.api.mcp.connect(serverId);
    } catch (e) {
      console.error('Failed to connect:', e);
    }
  };

  const handleDisconnect = async (serverId: string) => {
    try {
      await window.api.mcp.disconnect(serverId);
    } catch (e) {
      console.error('Failed to disconnect:', e);
    }
  };

  const stdioConfig = formData.config as MCPStdioConfig | undefined;
  const sseConfig = formData.config as MCPSSEConfig | undefined;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold">MCP Servers</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Configure Model Context Protocol servers (stdio and SSE).
          </p>
        </div>
        {!isAdding && !editingId && (
          <Button onClick={handleAdd} size="sm">
            <Plus className="h-4 w-4 mr-2" />
            Add Server
          </Button>
        )}
      </div>

      {(isAdding || editingId) && (
        <div className="border border-border rounded-lg p-4 space-y-4 bg-card">
          <div className="flex items-center gap-2 mb-4">
            <Button
              variant={!jsonMode ? 'secondary' : 'ghost'}
              size="sm"
              onClick={() => setJsonMode(false)}
            >
              Form
            </Button>
            <Button
              variant={jsonMode ? 'secondary' : 'ghost'}
              size="sm"
              onClick={() => setJsonMode(true)}
            >
              JSON
            </Button>
          </div>

          {jsonMode ? (
            <div className="space-y-2">
              <label className="text-sm font-medium">MCP Server JSON Configuration</label>
              <textarea
                value={jsonInput}
                onChange={(e) => setJsonInput(e.target.value)}
                placeholder={`{
  "name": "my-server",
  "command": "npx",
  "args": ["-y", "@modelcontextprotocol/server-example"],
  "env": {}
}`}
                className="w-full h-48 px-3 py-2 text-sm font-mono bg-secondary rounded-md border-0 resize-none focus:outline-none focus:ring-1 focus:ring-ring"
              />
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Name</label>
                  <Input
                    value={formData.name || ''}
                    onChange={(e) => setFormData((prev) => ({ ...prev, name: e.target.value }))}
                    placeholder="My MCP Server"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Type</label>
                  <select
                    value={formData.type || 'stdio'}
                    onChange={(e) => {
                      const type = e.target.value as 'stdio' | 'sse';
                      setFormData((prev) => ({
                        ...prev,
                        type,
                        config: type === 'stdio'
                          ? { command: '', args: [], env: {} }
                          : { url: '', headers: {} },
                      }));
                    }}
                    className="w-full h-9 px-3 rounded-md border border-input bg-transparent text-sm"
                  >
                    <option value="stdio">stdio</option>
                    <option value="sse">SSE</option>
                  </select>
                </div>
              </div>

              {formData.type === 'stdio' ? (
                <>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Command</label>
                    <Input
                      value={stdioConfig?.command || ''}
                      onChange={(e) => setFormData((prev) => ({
                        ...prev,
                        config: { ...stdioConfig, command: e.target.value } as MCPStdioConfig,
                      }))}
                      placeholder="npx"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Arguments (comma-separated)</label>
                    <Input
                      value={stdioConfig?.args?.join(', ') || ''}
                      onChange={(e) => setFormData((prev) => ({
                        ...prev,
                        config: {
                          ...stdioConfig,
                          args: e.target.value.split(',').map((s) => s.trim()).filter(Boolean),
                        } as MCPStdioConfig,
                      }))}
                      placeholder="-y, @modelcontextprotocol/server-example"
                    />
                  </div>
                </>
              ) : (
                <div className="space-y-2">
                  <label className="text-sm font-medium">URL</label>
                  <Input
                    value={sseConfig?.url || ''}
                    onChange={(e) => setFormData((prev) => ({
                      ...prev,
                      config: { ...sseConfig, url: e.target.value } as MCPSSEConfig,
                    }))}
                    placeholder="https://example.com/mcp/sse"
                  />
                </div>
              )}

              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="mcp-enabled"
                  checked={formData.enabled ?? true}
                  onChange={(e) => setFormData((prev) => ({ ...prev, enabled: e.target.checked }))}
                  className="rounded border-input"
                />
                <label htmlFor="mcp-enabled" className="text-sm">Enabled</label>
              </div>
            </>
          )}

          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={handleCancel}>
              <X className="h-4 w-4 mr-1" />
              Cancel
            </Button>
            <Button size="sm" onClick={handleSave}>
              <Check className="h-4 w-4 mr-1" />
              Save
            </Button>
          </div>
        </div>
      )}

      <div className="space-y-3">
        {mcpServers.map((server) => (
          <div
            key={server.id}
            className="flex items-center justify-between p-4 border border-border rounded-lg bg-card"
          >
            <div className="flex items-center gap-3">
              <div className={`w-2 h-2 rounded-full ${server.enabled ? 'bg-green-500' : 'bg-muted'}`} />
              <div>
                <h3 className="font-medium">{server.name}</h3>
                <p className="text-xs text-muted-foreground">
                  {server.type} · {server.type === 'stdio'
                    ? (server.config as MCPStdioConfig).command
                    : (server.config as MCPSSEConfig).url}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={() => handleConnect(server.id)}
                title="Connect"
              >
                <Play className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={() => handleDisconnect(server.id)}
                title="Disconnect"
              >
                <Square className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={() => handleEdit(server)}
              >
                <Pencil className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-destructive hover:text-destructive"
                onClick={() => deleteMCPServer(server.id)}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          </div>
        ))}

        {mcpServers.length === 0 && !isAdding && (
          <div className="text-center py-8 text-muted-foreground">
            <p>No MCP servers configured.</p>
            <p className="text-sm">Add a server to extend AI capabilities.</p>
          </div>
        )}
      </div>
    </div>
  );
}
