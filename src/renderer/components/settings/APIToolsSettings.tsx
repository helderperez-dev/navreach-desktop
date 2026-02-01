import { useState, useEffect } from 'react';
import { Plus, Pencil, Trash2, Check, X, Play, Copy, RefreshCw, Send, Sparkles } from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { tomorrow } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { CircularLoader } from '@/components/ui/CircularLoader';
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { Field } from "@/components/ui/field";
import { Label } from "@/components/ui/label";
import { useSettingsStore } from '@/stores/settings.store';
import { useConfirmation } from '@/providers/ConfirmationProvider';
import type { APITool } from '@shared/types';
import { cn } from '@/lib/utils';


const httpMethods = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'] as const;

interface KeyValue {
  id: string;
  key: string;
  value: string;
  enabled: boolean;
}

export function APIToolsSettings() {
  const { confirm } = useConfirmation();
  const { apiTools, loadSettings, addAPITool, updateAPITool, deleteAPITool, isLoading } = useSettingsStore();

  const [isAdding, setIsAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState<Partial<APITool>>({
    name: '',
    description: '',
    endpoint: '',
    method: 'GET',
    headers: {},
    queryParams: {},
    bodyTemplate: '',
    enabled: true,
  });

  const [headerList, setHeaderList] = useState<KeyValue[]>([]);
  const [paramList, setParamList] = useState<KeyValue[]>([]);

  const [isTesting, setIsTesting] = useState(false);
  const [testResponse, setTestResponse] = useState<any>(null);

  useEffect(() => {
    loadSettings();
  }, []);

  const convertToKeyValueList = (obj: Record<string, string> | undefined): KeyValue[] => {
    if (!obj) return [];
    return Object.entries(obj).map(([key, value]) => ({
      id: uuidv4(),
      key,
      value,
      enabled: true,
    }));
  };

  const convertToRecord = (list: KeyValue[]): Record<string, string> => {
    return list
      .filter(item => item.enabled && item.key.trim() !== '')
      .reduce((acc, curr) => ({ ...acc, [curr.key]: curr.value }), {});
  };

  const handleAdd = () => {
    setIsAdding(true);
    setFormData({
      name: '',
      description: '',
      endpoint: '',
      method: 'GET',
      headers: {},
      queryParams: {},
      bodyTemplate: '',
      enabled: true,
    });
    setHeaderList([{ id: uuidv4(), key: '', value: '', enabled: true }]);
    setParamList([{ id: uuidv4(), key: '', value: '', enabled: true }]);
    setTestResponse(null);
  };

  const handleEdit = (tool: APITool) => {
    setEditingId(tool.id);
    setFormData(tool);
    setHeaderList(convertToKeyValueList(tool.headers));
    setParamList(convertToKeyValueList(tool.queryParams));
    setTestResponse(null);
  };

  const handleSave = async () => {
    if (!formData.name || !formData.endpoint) return;

    const tool: APITool = {
      id: editingId || uuidv4(),
      name: formData.name!,
      description: formData.description || '',
      endpoint: formData.endpoint!,
      method: formData.method as APITool['method'],
      headers: convertToRecord(headerList),
      queryParams: convertToRecord(paramList),
      bodyTemplate: formData.bodyTemplate,
      enabled: formData.enabled ?? true,
      lastTestSuccess: formData.lastTestSuccess,
    };

    try {
      if (editingId) {
        await updateAPITool(tool);
      } else {
        await addAPITool(tool);
      }

      setIsAdding(false);
      setEditingId(null);
      setFormData({});
      setHeaderList([]);
      setParamList([]);
      setTestResponse(null);
    } catch (error) {
      // Error is handled by the store's toast
      console.error('Save failed:', error);
    }
  };

  const handleCancel = () => {
    setIsAdding(false);
    setEditingId(null);
    setFormData({});
    setHeaderList([]);
    setParamList([]);
    setTestResponse(null);
  };

  const handleTest = async () => {
    setIsTesting(true);
    setTestResponse(null);
    try {
      const tool: APITool = {
        id: editingId || 'test',
        name: formData.name || 'Test Tool',
        description: formData.description || '',
        endpoint: formData.endpoint!,
        method: formData.method as APITool['method'],
        headers: convertToRecord(headerList),
        queryParams: convertToRecord(paramList),
        bodyTemplate: formData.bodyTemplate,
        enabled: true,
      };

      if (typeof window.api.settings.testAPITool !== 'function') {
        throw new Error('API tool testing function is not available. Please restart the application to apply the latest updates.');
      }

      const result = await window.api.settings.testAPITool(tool);
      setTestResponse(result);
      if (result.success) {
        setFormData(prev => ({ ...prev, lastTestSuccess: true }));
      } else {
        setFormData(prev => ({ ...prev, lastTestSuccess: false }));
      }
    } catch (error: any) {
      setTestResponse({ success: false, error: error.message || String(error) });
    } finally {
      setIsTesting(false);
    }
  };

  const updateKeyValue = (type: 'header' | 'param', id: string, updates: Partial<KeyValue>) => {
    const list = type === 'header' ? headerList : paramList;
    const setter = type === 'header' ? setHeaderList : setParamList;

    const newList = list.map((item: any) => item.id === id ? { ...item, ...updates } : item);
    setter(newList);
  };

  const addKeyValue = (type: 'header' | 'param') => {
    const setter = type === 'header' ? setHeaderList : setParamList;
    setter((prev: any) => [...prev, { id: uuidv4(), key: '', value: '', enabled: true }]);
  };

  const deleteKeyValue = (type: 'header' | 'param', id: string) => {
    const setter = type === 'header' ? setHeaderList : setParamList;
    setter((prev: any) => prev.filter((item: any) => item.id !== id));
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
        <div className="border border-border/10 rounded-lg p-4 space-y-4 bg-card">
          <div className="grid grid-cols-2 gap-4">
            <Field label="Name">
              <Input
                value={formData.name || ''}
                onChange={(e) => setFormData((prev) => ({ ...prev, name: e.target.value }))}
                placeholder="Weather API"
                className="h-12"
              />
            </Field>
            <Field label="Description">
              <Input
                value={formData.description || ''}
                onChange={(e) => setFormData((prev) => ({ ...prev, description: e.target.value }))}
                placeholder="Get current weather for a location"
                className="h-12"
              />
            </Field>
          </div>

          <Field label="API Endpoint">
            <div className="flex items-stretch overflow-hidden rounded-xl border border-input shadow-sm focus-within:ring-1 focus-within:ring-ring bg-background transition-all">
              <Select
                value={formData.method || 'GET'}
                onValueChange={(value) => setFormData((prev) => ({ ...prev, method: value as APITool['method'] }))}
              >
                <SelectTrigger className="w-[120px] h-12 border-0 border-r rounded-none bg-muted/20 hover:bg-muted/40 focus:ring-0 transition-colors font-bold text-foreground">
                  <SelectValue placeholder="GET" />
                </SelectTrigger>
                <SelectContent>
                  {httpMethods.map((method) => (
                    <SelectItem key={method} value={method}>
                      <span className={cn(
                        "font-bold",
                        method === 'GET' && "text-green-500",
                        method === 'POST' && "text-orange-500",
                        method === 'PUT' && "text-blue-500",
                        method === 'DELETE' && "text-red-500",
                        method === 'PATCH' && "text-purple-500",
                      )}>{method}</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Input
                value={formData.endpoint || ''}
                onChange={(e) => setFormData((prev) => ({ ...prev, endpoint: e.target.value }))}
                placeholder="https://api.example.com/v1/resource"
                className="flex-1 h-12 border-0 rounded-none focus-visible:ring-0 px-4 text-sm font-mono bg-transparent"
              />

              <Button
                onClick={handleTest}
                disabled={isTesting || !formData.endpoint}
                className={cn(
                  "shrink-0 h-12 px-6 font-bold transition-all rounded-none",
                  "bg-blue-600 hover:bg-blue-500 text-white border-0",
                  "disabled:opacity-50 disabled:cursor-not-allowed"
                )}
              >
                {isTesting ? (
                  <CircularLoader className="h-4 w-4 mr-2" />
                ) : (
                  <Send className="h-3.5 w-3.5 mr-2" />
                )}
                SEND
              </Button>
            </div>
            <p className="text-xs text-muted-foreground mt-2 px-1">
              Use {'{{variable}}'} for dynamic parameters
            </p>
          </Field>

          <Tabs defaultValue="params" className="w-full">
            <TabsList className="grid w-full grid-cols-3 bg-secondary/50">
              <TabsTrigger value="params">Params</TabsTrigger>
              <TabsTrigger value="headers">Headers</TabsTrigger>
              <TabsTrigger value="body">Body</TabsTrigger>
            </TabsList>

            <TabsContent value="params" className="pt-2 space-y-2">
              <div className="space-y-2">
                {paramList.map((param) => (
                  <div key={param.id} className="flex gap-2 items-center">
                    <Checkbox
                      checked={param.enabled}
                      onCheckedChange={(checked) => updateKeyValue('param', param.id, { enabled: !!checked })}
                    />
                    <Input
                      placeholder="Parameter Key"
                      value={param.key}
                      onChange={(e) => updateKeyValue('param', param.id, { key: e.target.value })}
                      className="flex-1 h-9"
                    />
                    <Input
                      placeholder="Value"
                      value={param.value}
                      onChange={(e) => updateKeyValue('param', param.id, { value: e.target.value })}
                      className="flex-1 h-9"
                    />
                    <Button variant="ghost" size="icon" className="h-9 w-9 text-muted-foreground hover:text-destructive" onClick={() => deleteKeyValue('param', param.id)}>
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
                <Button variant="outline" size="sm" className="w-full dashed" onClick={() => addKeyValue('param')}>
                  <Plus className="h-3 w-3 mr-1" /> Add Parameter
                </Button>
              </div>
            </TabsContent>

            <TabsContent value="headers" className="pt-2 space-y-2">
              <div className="space-y-2">
                {headerList.map((header) => (
                  <div key={header.id} className="flex gap-2 items-center">
                    <Checkbox
                      checked={header.enabled}
                      onCheckedChange={(checked) => updateKeyValue('header', header.id, { enabled: !!checked })}
                    />
                    <Input
                      placeholder="Header Key"
                      value={header.key}
                      onChange={(e) => updateKeyValue('header', header.id, { key: e.target.value })}
                      className="flex-1 h-9"
                    />
                    <Input
                      placeholder="Value"
                      value={header.value}
                      onChange={(e) => updateKeyValue('header', header.id, { value: e.target.value })}
                      className="flex-1 h-9"
                    />
                    <Button variant="ghost" size="icon" className="h-9 w-9 text-muted-foreground hover:text-destructive" onClick={() => deleteKeyValue('header', header.id)}>
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
                <Button variant="outline" size="sm" className="w-full dashed" onClick={() => addKeyValue('header')}>
                  <Plus className="h-3 w-3 mr-1" /> Add Header
                </Button>
              </div>
            </TabsContent>

            <TabsContent value="body" className="pt-2 space-y-2">
              {formData.method === 'GET' ? (
                <div className="py-8 text-center text-sm text-muted-foreground bg-secondary/20 rounded-lg border border-dashed">
                  GET requests typically do not have a body.
                </div>
              ) : (
                <>
                  <div className="flex justify-end">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 text-[10px] gap-1 px-2"
                      onClick={() => {
                        try {
                          const obj = JSON.parse(formData.bodyTemplate || '');
                          setFormData((prev: any) => ({ ...prev, bodyTemplate: JSON.stringify(obj, null, 2) }));
                        } catch (e) {
                          // Ignore if invalid JSON
                        }
                      }}
                    >
                      Beautify
                    </Button>
                  </div>
                  <div className="relative w-full h-48 rounded-md border border-input bg-secondary/50 focus-within:ring-1 focus-within:ring-ring overflow-hidden">
                    <div
                      id="json-body-highlighter"
                      className="absolute inset-0 pointer-events-none overflow-hidden"
                    >
                      <SyntaxHighlighter
                        language="json"
                        style={tomorrow}
                        customStyle={{
                          margin: 0,
                          padding: '12px 16px',
                          fontSize: '14px',
                          background: 'transparent',
                          lineHeight: '20px',
                          whiteSpace: 'pre-wrap',
                          wordBreak: 'break-all',
                          fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
                          letterSpacing: 'normal',
                        }}
                        codeTagProps={{
                          style: {
                            fontFamily: 'inherit',
                            lineHeight: 'inherit',
                            letterSpacing: 'inherit',
                          }
                        }}
                      >
                        {formData.bodyTemplate || ''}
                      </SyntaxHighlighter>
                    </div>
                    <textarea
                      value={formData.bodyTemplate || ''}
                      onChange={(e) => setFormData((prev: any) => ({ ...prev, bodyTemplate: e.target.value }))}
                      onScroll={(e) => {
                        const highlighter = document.getElementById('json-body-highlighter');
                        if (highlighter) {
                          highlighter.scrollTop = e.currentTarget.scrollTop;
                        }
                      }}
                      spellCheck={false}
                      placeholder='{"query": "{{query}}"}'
                      className={cn(
                        "absolute inset-0 w-full h-full px-4 py-3 bg-transparent border-0 resize-none focus:outline-none focus:ring-0",
                        "caret-foreground selection:bg-primary/30",
                        "text-transparent overflow-auto"
                      )}
                      style={{
                        WebkitTextFillColor: 'transparent',
                        fontSize: '14px',
                        lineHeight: '20px',
                        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
                        letterSpacing: 'normal',
                        wordBreak: 'break-all',
                      }}
                    />
                  </div>
                </>
              )}
            </TabsContent>
          </Tabs>

          {testResponse && (
            <div className={cn(
              "p-3 rounded-lg border space-y-2",
              testResponse.success ? "bg-green-500/5 border-green-500/20" : "bg-destructive/5 border-destructive/20"
            )}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className={cn(
                    "w-2 h-2 rounded-full",
                    testResponse.success ? "bg-green-500" : "bg-destructive"
                  )} />
                  <span className="text-sm font-medium">
                    {testResponse.success ? 'Success' : 'Request Failed'}
                  </span>
                  {testResponse.status && (
                    <span className="text-xs text-muted-foreground bg-secondary/50 px-1.5 py-0.5 rounded">
                      Status: {testResponse.status} {testResponse.statusText}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 text-muted-foreground hover:text-foreground"
                    onClick={() => {
                      const text = JSON.stringify(testResponse.data || testResponse.error, null, 2);
                      navigator.clipboard.writeText(text);
                    }}
                  >
                    <Copy className="h-3 w-3" />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setTestResponse(null)}>
                    <X className="h-3 w-3" />
                  </Button>
                </div>
              </div>
              <div className="max-h-[250px] overflow-auto rounded-md border bg-black/40">
                <SyntaxHighlighter
                  language="json"
                  style={tomorrow}
                  customStyle={{
                    margin: 0,
                    padding: '12px',
                    fontSize: '11px',
                    background: 'transparent',
                    lineHeight: '1.4'
                  }}
                  codeTagProps={{
                    style: {
                      fontFamily: '"JetBrains Mono", monospace'
                    }
                  }}
                >
                  {JSON.stringify(testResponse.data || testResponse.error, null, 2)}
                </SyntaxHighlighter>
              </div>
            </div>
          )}

          <div className="flex items-center gap-3 h-12 px-4 rounded-xl border border-border bg-muted/20 hover:bg-muted/30 transition-colors">
            <Checkbox
              id="api-enabled"
              checked={formData.enabled ?? true}
              onCheckedChange={(checked) => setFormData((prev) => ({ ...prev, enabled: !!checked }))}
            />
            <Label htmlFor="api-enabled" className="cursor-pointer select-none flex-1">
              Enabled
            </Label>
          </div>

          <div className="flex justify-end gap-2 pt-2">
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
            {apiTools.map((tool) => (
              <div
                key={tool.id}
                className="flex items-center justify-between p-4 border border-border/10 rounded-lg bg-card hover:bg-accent/5 transition-colors group"
              >
                <div className="flex items-center gap-3">
                  <div className={cn(
                    "w-2 h-2 rounded-full",
                    tool.enabled
                      ? (tool.lastTestSuccess ? 'bg-green-500' : (tool.lastTestSuccess === false ? 'bg-destructive' : 'bg-yellow-500'))
                      : 'bg-muted'
                  )} />
                  <div>
                    <h3 className="font-medium">{tool.name}</h3>
                    <p className="text-xs text-muted-foreground flex items-center gap-2">
                      <span className={cn(
                        "font-bold text-[10px] px-1.5 rounded uppercase",
                        tool.method === 'GET' && "bg-green-500/10 text-green-500",
                        tool.method === 'POST' && "bg-orange-500/10 text-orange-500",
                        tool.method === 'PUT' && "bg-blue-500/10 text-blue-500",
                        tool.method === 'DELETE' && "bg-red-500/10 text-red-500",
                        tool.method === 'PATCH' && "bg-purple-500/10 text-purple-500",
                      )}>{tool.method}</span>
                      <span className="truncate max-w-[300px]">{tool.endpoint}</span>
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
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
                    onClick={async () => {
                      const confirmed = await confirm({
                        title: 'Delete API Tool',
                        description: `Are you sure you want to delete "${tool.name}"? This action cannot be undone.`,
                        confirmLabel: 'Delete',
                        variant: 'destructive'
                      });
                      if (confirmed) deleteAPITool(tool.id);
                    }}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}

            {apiTools.length === 0 && !isAdding && (
              <div className="text-center py-12 text-muted-foreground border-2 border-dashed border-border/10 rounded-xl">
                <RefreshCw className="h-12 w-12 mx-auto mb-4 opacity-20" />
                <p className="font-medium text-foreground">No API tools configured</p>
                <p className="text-sm">Add an API tool to extend your AI agent's capabilities with external integrations.</p>
                <Button onClick={handleAdd} size="sm" variant="outline" className="mt-4">
                  <Plus className="h-4 w-4 mr-2" />
                  Add your first tool
                </Button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
