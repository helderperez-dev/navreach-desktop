import { useState, useEffect } from 'react';
import { Plus, Pencil, Trash2, Check, X } from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useSettingsStore } from '@/stores/settings.store';
import type { APITool } from '@shared/types';

const httpMethods = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'] as const;

export function APIToolsSettings() {
  const { apiTools, loadSettings, addAPITool, updateAPITool, deleteAPITool } = useSettingsStore();
  const [isAdding, setIsAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState<Partial<APITool>>({
    name: '',
    description: '',
    endpoint: '',
    method: 'GET',
    headers: {},
    bodyTemplate: '',
    enabled: true,
  });

  useEffect(() => {
    loadSettings();
  }, []);

  const handleAdd = () => {
    setIsAdding(true);
    setFormData({
      name: '',
      description: '',
      endpoint: '',
      method: 'GET',
      headers: {},
      bodyTemplate: '',
      enabled: true,
    });
  };

  const handleEdit = (tool: APITool) => {
    setEditingId(tool.id);
    setFormData(tool);
  };

  const handleSave = async () => {
    if (!formData.name || !formData.endpoint) return;

    const tool: APITool = {
      id: editingId || uuidv4(),
      name: formData.name!,
      description: formData.description || '',
      endpoint: formData.endpoint!,
      method: formData.method as APITool['method'],
      headers: formData.headers,
      bodyTemplate: formData.bodyTemplate,
      enabled: formData.enabled ?? true,
    };

    if (editingId) {
      await updateAPITool(tool);
    } else {
      await addAPITool(tool);
    }

    setIsAdding(false);
    setEditingId(null);
    setFormData({});
  };

  const handleCancel = () => {
    setIsAdding(false);
    setEditingId(null);
    setFormData({});
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold">API Tools</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Configure external APIs as tools for the AI agent.
          </p>
        </div>
        {!isAdding && !editingId && (
          <Button onClick={handleAdd} size="sm">
            <Plus className="h-4 w-4 mr-2" />
            Add API Tool
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
                placeholder="Weather API"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Method</label>
              <select
                value={formData.method || 'GET'}
                onChange={(e) => setFormData((prev) => ({ ...prev, method: e.target.value as APITool['method'] }))}
                className="w-full h-9 px-3 rounded-md border border-input bg-transparent text-sm"
              >
                {httpMethods.map((method) => (
                  <option key={method} value={method}>
                    {method}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">Description</label>
            <Input
              value={formData.description || ''}
              onChange={(e) => setFormData((prev) => ({ ...prev, description: e.target.value }))}
              placeholder="Get current weather for a location"
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">Endpoint URL</label>
            <Input
              value={formData.endpoint || ''}
              onChange={(e) => setFormData((prev) => ({ ...prev, endpoint: e.target.value }))}
              placeholder="https://api.example.com/weather?location={{location}}"
            />
            <p className="text-xs text-muted-foreground">
              Use {'{{variable}}'} for dynamic parameters
            </p>
          </div>

          {(formData.method === 'POST' || formData.method === 'PUT' || formData.method === 'PATCH') && (
            <div className="space-y-2">
              <label className="text-sm font-medium">Body Template (JSON)</label>
              <textarea
                value={formData.bodyTemplate || ''}
                onChange={(e) => setFormData((prev) => ({ ...prev, bodyTemplate: e.target.value }))}
                placeholder='{"query": "{{query}}"}'
                className="w-full h-24 px-3 py-2 text-sm font-mono bg-secondary rounded-md border-0 resize-none focus:outline-none focus:ring-1 focus:ring-ring"
              />
            </div>
          )}

          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="api-enabled"
              checked={formData.enabled ?? true}
              onChange={(e) => setFormData((prev) => ({ ...prev, enabled: e.target.checked }))}
              className="rounded border-input"
            />
            <label htmlFor="api-enabled" className="text-sm">Enabled</label>
          </div>

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
        {apiTools.map((tool) => (
          <div
            key={tool.id}
            className="flex items-center justify-between p-4 border border-border rounded-lg bg-card"
          >
            <div className="flex items-center gap-3">
              <div className={`w-2 h-2 rounded-full ${tool.enabled ? 'bg-green-500' : 'bg-muted'}`} />
              <div>
                <h3 className="font-medium">{tool.name}</h3>
                <p className="text-xs text-muted-foreground">
                  {tool.method} · {tool.endpoint.slice(0, 50)}{tool.endpoint.length > 50 ? '...' : ''}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={() => handleEdit(tool)}
              >
                <Pencil className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-destructive hover:text-destructive"
                onClick={() => deleteAPITool(tool.id)}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          </div>
        ))}

        {apiTools.length === 0 && !isAdding && (
          <div className="text-center py-8 text-muted-foreground">
            <p>No API tools configured.</p>
            <p className="text-sm">Add an API tool to extend AI capabilities.</p>
          </div>
        )}
      </div>
    </div>
  );
}
