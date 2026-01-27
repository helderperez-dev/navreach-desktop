import { useState, useEffect } from 'react';
import { Plus, Pencil, Trash2, Check, X, Play, Square } from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { CircularLoader } from '@/components/ui/CircularLoader';
import { toast } from 'sonner';
import { useSettingsStore } from '@/stores/settings.store';
import type { MCPServer, MCPStdioConfig, MCPSSEConfig } from '@shared/types';

export function MCPSettings() {
  const { mcpServers, loadSettings, addMCPServer, updateMCPServer, deleteMCPServer, isLoading } = useSettingsStore();
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

  /* JSON <-> Form Sync Logic */
  const syncFormToJson = () => {
    // Convert current formData to the requested JSON structure
    const config = formData.config as MCPStdioConfig | MCPSSEConfig;
    let jsonStruct: any = {};

    if (formData.type === 'sse') {
      jsonStruct = {
        name: formData.name,
        transport: {
          type: 'sse',
          url: (config as MCPSSEConfig).url,
          headers: (config as MCPSSEConfig).headers
        }
      };
    } else {
      // STDIO: Use the "Named" structure if name exists, or flat
      const stdio = config as MCPStdioConfig;
      const serverConfig = {
        command: stdio.command,
        args: stdio.args,
        env: stdio.env
      };

      if (formData.name) {
        jsonStruct = {
          [formData.name]: serverConfig
        };
      } else {
        jsonStruct = serverConfig;
      }
    }
    setJsonInput(JSON.stringify(jsonStruct, null, 2));
  };

  const syncJsonToForm = (jsonStr: string) => {
    try {
      if (!jsonStr.trim()) return;
      const parsed = JSON.parse(jsonStr);
      let extracted: Partial<MCPServer> = { ...formData };

      // Case 1: Wrapped in "mcpServers"
      let root = parsed;
      if (parsed.mcpServers) root = parsed.mcpServers;

      const keys = Object.keys(root);
      const firstVal = root[keys[0]];

      // Case 2: Named Key Structure e.g. { "ClickUp": { command: ... } }
      // We assume it's this structure if the first value is an object containing 'command' or 'url'
      // AND the root itself doesn't have 'command'/'url' at the top level
      const isNamedKey = keys.length === 1 && typeof firstVal === 'object' && !Array.isArray(firstVal) &&
        ('command' in firstVal || 'url' in firstVal || 'transport' in firstVal);

      if (isNamedKey) {
        extracted.name = keys[0];
        const inner = firstVal;
        if (inner.url) { // Simple SSE
          extracted.type = 'sse';
          extracted.config = { url: inner.url, headers: inner.headers || {} };
        } else if (inner.transport?.type === 'sse') { // Complex SSE
          extracted.type = 'sse';
          extracted.config = { url: inner.transport.url, headers: inner.transport.headers || {} };
        } else { // STDIO
          extracted.type = 'stdio';
          extracted.config = {
            command: inner.command || '',
            args: inner.args || [],
            env: inner.env || {}
          };
        }
      }
      // Case 3: Flat Structure e.g. { "command": "npx", ... } OR { "name": "My Server", ... }
      else {
        if (parsed.name) extracted.name = parsed.name;

        if (parsed.transport?.type === 'sse') {
          extracted.type = 'sse';
          extracted.config = { url: parsed.transport.url, headers: parsed.transport.headers || {} };
        } else if (parsed.url) {
          extracted.type = 'sse';
          extracted.config = { url: parsed.url, headers: parsed.headers || {} };
        } else {
          extracted.type = 'stdio';
          const currentConfig = extracted.config as MCPStdioConfig | undefined;
          extracted.config = {
            command: parsed.command || currentConfig?.command || '',
            args: parsed.args || currentConfig?.args || [],
            env: parsed.env || currentConfig?.env || {}
          };
        }
      }

      setFormData(extracted);
    } catch (e) {
      // invalid json, ignore
    }
  };

  const handleTabChange = (mode: boolean) => {
    if (mode === true) { // Switching TO JSON
      syncFormToJson();
    } else { // Switching TO Form
      syncJsonToForm(jsonInput);
    }
    setJsonMode(mode);
  };

  const handleSave = async () => {
    // If in JSON mode, ensure we parse one last time to get latest data
    if (jsonMode) {
      // Re-parse logic for the save to be 100% sure.
    }

    let finalData = { ...formData };
    if (jsonMode) {
      try {
        const parsed = JSON.parse(jsonInput);
        let root = parsed.mcpServers ? parsed.mcpServers : parsed;
        const keys = Object.keys(root);
        if (keys.length === 0) {
          toast.error("JSON is empty");
          return;
        }

        const firstVal = root[keys[0]];
        // Be more lenient: if it looks like a named object (single key, value is object), treat as named
        const isNamedKey = keys.length === 1 && typeof firstVal === 'object' && !Array.isArray(firstVal);

        if (isNamedKey) {
          finalData.name = keys[0];
          const inner = firstVal;
          // Determine type based on content
          finalData.type = (inner.url || inner.transport?.type === 'sse') ? 'sse' : 'stdio';

          if (finalData.type === 'stdio') {
            finalData.config = {
              command: inner.command || '',
              args: inner.args || [],
              env: inner.env || {}
            };
          } else {
            const url = inner.url || inner.transport?.url || '';
            finalData.config = { url, headers: inner.headers || {} };
          }
        } else {
          // Flat structure
          if (parsed.name) finalData.name = parsed.name;
          finalData.type = (parsed.transport?.type === 'sse' || parsed.url) ? 'sse' : 'stdio';
          if (finalData.type === 'stdio') {
            finalData.config = {
              command: parsed.command || '',
              args: parsed.args || [],
              env: parsed.env || {}
            };
          } else {
            finalData.config = { url: parsed.url || parsed.transport?.url || '', headers: parsed.headers || {} };
          }
        }
      } catch (e) {
        console.error("JSON Parse Error", e);
        toast.error("Invalid JSON format");
        return;
      }
    }

    if (!finalData.name) {
      toast.error("Server name is required");
      return;
    }

    // Validate config
    if (finalData.type === 'stdio') {
      const conf = finalData.config as MCPStdioConfig;
      if (!conf.command) {
        toast.error("Command is required for stdio server");
        return;
      }
    } else {
      const conf = finalData.config as MCPSSEConfig;
      if (!conf.url) {
        toast.error("URL is required for SSE server");
        return;
      }
    }

    try {
      const server: MCPServer = {
        id: editingId || uuidv4(),
        name: finalData.name!,
        type: finalData.type as 'stdio' | 'sse',
        enabled: finalData.enabled ?? true,
        config: finalData.config!,
      };

      if (editingId) {
        await updateMCPServer(server);
        toast.success("Server updated");
      } else {
        await addMCPServer(server);
        toast.success("Server added");
      }

      // Force refresh from DB to ensure persistence and handle any trigger-side effects
      await loadSettings();

      setIsAdding(false);
      setEditingId(null);
      setFormData({});
      setJsonInput('');
    } catch (error) {
      console.error(error);
      const msg = error instanceof Error ? error.message : "Failed to save server";
      if (msg.includes('Not authenticated') || msg.includes('JWT expired')) {
        toast.error("Session expired. Please sign in again.");
      } else {
        toast.error(msg);
      }
    }
  };

  useEffect(() => {
    console.log('MCPServers updated:', mcpServers);
  }, [mcpServers]);

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

  const handleEnvChange = (key: string, value: string, type: 'key' | 'value', index: number) => {
    const currentEnv = (formData.config as MCPStdioConfig).env || {};
    const entries = Object.entries(currentEnv);

    if (index >= entries.length) {
      // New entry
      if (type === 'key') entries.push([value, '']);
    } else {
      // Update entry
      if (type === 'key') entries[index][0] = value;
      else entries[index][1] = value;
    }

    const newEnv = Object.fromEntries(entries.filter(([k]) => k !== ''));
    setFormData(prev => ({
      ...prev,
      config: { ...prev.config, env: newEnv } as MCPStdioConfig
    }));
  };

  const removeEnv = (key: string) => {
    const currentEnv = { ...(formData.config as MCPStdioConfig).env };
    delete currentEnv[key];
    setFormData(prev => ({
      ...prev,
      config: { ...prev.config, env: currentEnv } as MCPStdioConfig
    }));
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this server?')) return;
    try {
      await deleteMCPServer(id);
      toast.success('Server deleted');
      await loadSettings();
    } catch (error) {
      console.error('Failed to delete server:', error);
      const msg = error instanceof Error ? error.message : "Failed to delete server";
      if (msg.includes('Not authenticated') || msg.includes('JWT expired')) {
        toast.error("Session expired. Please sign in again.");
      } else {
        toast.error(msg);
      }
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
        <div className="border border-border/10 rounded-lg p-4 space-y-4 bg-card">
          <div className="flex items-center gap-2 mb-4">
            <Button
              variant={!jsonMode ? 'secondary' : 'ghost'}
              size="sm"
              onClick={() => handleTabChange(false)}
            >
              Form
            </Button>
            <Button
              variant={jsonMode ? 'secondary' : 'ghost'}
              size="sm"
              onClick={() => handleTabChange(true)}
            >
              JSON
            </Button>
          </div>

          {jsonMode ? (
            <div className="space-y-2">
              <label className="text-sm font-medium">MCP Server Configuration (JSON)</label>
              <p className="text-xs text-muted-foreground">Paste your configuration object here. We support standard MCP JSON structures.</p>
              <textarea
                value={jsonInput}
                onChange={(e) => {
                  setJsonInput(e.target.value);
                  // Optional: Live sync to form if valid? 
                  // Let's just sync on Tab Change to keep it performant
                }}
                onBlur={() => syncJsonToForm(jsonInput)}
                placeholder={`{
  "ClickUp": {
    "command": "npx",
    "args": [
      "-y",
      "@taazkareem/clickup-mcp-server@latest"
    ],
    "env": {
      "CLICKUP_API_KEY": "your-key"
    }
  }
}`}
                className="w-full h-64 px-3 py-2 text-sm font-mono bg-secondary rounded-md border-0 resize-none focus:outline-none focus:ring-1 focus:ring-ring"
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
                    <label className="text-sm font-medium">Arguments (space-separated)</label>
                    <Input
                      value={stdioConfig?.args?.join(' ') || ''}
                      onChange={(e) => setFormData((prev) => ({
                        ...prev,
                        config: {
                          ...stdioConfig,
                          args: e.target.value.split(' ').map((s) => s.trim()).filter(Boolean),
                        } as MCPStdioConfig,
                      }))}
                      placeholder="-y @modelcontextprotocol/server-example"
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-medium">Environment Variables</label>
                    <div className="space-y-2">
                      {Object.entries((formData.config as MCPStdioConfig).env || {}).map(([key, val], idx) => (
                        <div key={idx} className="flex gap-2">
                          <Input placeholder="KEY" value={key} onChange={(e) => handleEnvChange(key, e.target.value, 'key', idx)} className="flex-1" />
                          <Input placeholder="VALUE" value={val} onChange={(e) => handleEnvChange(key, e.target.value, 'value', idx)} className="flex-1" />
                          <Button variant="ghost" size="icon" onClick={() => removeEnv(key)}><Trash2 className="h-4 w-4" /></Button>
                        </div>
                      ))}
                      {/* Empty row for adding new */}
                      <div className="flex gap-2">
                        <Input
                          placeholder="NEW_KEY"
                          value=""
                          onChange={(e) => {
                            const newKey = e.target.value;
                            if (!newKey) return;
                            setFormData(prev => ({
                              ...prev,
                              config: {
                                ...prev.config,
                                env: { ...((prev.config as MCPStdioConfig).env || {}), [newKey]: '' }
                              } as MCPStdioConfig
                            }));
                          }}
                          className="flex-1 opacity-50 focus:opacity-100"
                        />
                        <Input placeholder="VALUE" disabled className="flex-1 opacity-50" />
                        <div className="w-10" />
                      </div>
                    </div>
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
        {isLoading ? (
          <div className="flex justify-center py-8">
            <CircularLoader className="h-8 w-8 text-primary" />
          </div>
        ) : (
          <>
            {mcpServers.map((server) => (
              <div
                key={server.id}
                className="flex items-center justify-between p-4 border border-border/10 rounded-lg bg-card"
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
                    onClick={() => handleDelete(server.id)}
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
          </>
        )}
      </div>
    </div>
  );
}
