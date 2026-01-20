import * as React from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue, SelectGroup, SelectLabel } from '@/components/ui/select';
import { useTargetsStore } from '@/stores/targets.store';
import { useSettingsStore } from '@/stores/settings.store';
import { playbookService } from '@/services/playbookService';
import { supabase } from '@/lib/supabase';
import { Switch } from '@/components/ui/switch';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Field } from '@/components/ui/field';
import { TagsInput } from '@/components/ui/tags-input';

import { MentionInput, Group } from '@/components/ui/mention-input';
import { NODE_DEFINITIONS } from './nodeDefs';
import { PlaybookNodeType } from '@/types/playbook';
import { X, Sparkles, ChevronRight, Play, Square } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Edge, Node } from 'reactflow';

interface NodeConfigPanelProps {
    selectedNode: any | null;
    nodes: Node[];
    edges: Edge[];
    onUpdate: (id: string, data: any) => void;
    onClose: () => void;
    onDelete: (id: string) => void;
}

export function NodeConfigPanel({ selectedNode, nodes, edges, onUpdate, onClose, onDelete }: NodeConfigPanelProps) {
    const { lists, fetchLists } = useTargetsStore();
    const { mcpServers, apiTools, loadSettings } = useSettingsStore();
    const [samples, setSamples] = React.useState<Record<string, any>>({});
    const [playbooks, setPlaybooks] = React.useState<any[]>([]);

    React.useEffect(() => {
        loadSettings();
        playbookService.getPlaybooks().then(setPlaybooks);
        if (lists.length === 0) {
            fetchLists();
        }
    }, []);

    if (!selectedNode) return null;

    const type = selectedNode.type as PlaybookNodeType;
    const def = NODE_DEFINITIONS[type];
    const config = selectedNode.data.config || {};
    const label = selectedNode.data.label;

    const handleConfigChange = (key: string, value: any) => {
        onUpdate(selectedNode.id, {
            ...selectedNode.data,
            config: {
                ...config,
                [key]: value
            }
        });
    };

    const handleLabelChange = (value: string) => {
        onUpdate(selectedNode.id, {
            ...selectedNode.data,
            label: value
        });
    };

    const getUpstreamVariables = React.useCallback(() => {
        const groups: Group[] = [];

        const findUpstream = (nodeId: string, visited = new Set<string>()) => {
            if (visited.has(nodeId)) return;
            visited.add(nodeId);

            const incoming = edges.filter(e => e.target === nodeId);
            incoming.forEach(edge => {
                const sourceNode = nodes.find(n => n.id === edge.source);
                if (sourceNode) {
                    const sourceDef = NODE_DEFINITIONS[sourceNode.type as PlaybookNodeType];
                    const nodeVars: any[] = [];

                    // 1. Schema-based variables (n8n style)
                    if (sourceDef?.outputs_schema) {
                        sourceDef.outputs_schema.forEach(schema => {
                            nodeVars.push({
                                label: schema.label,
                                value: `{{${sourceNode.id}.${schema.value}}}`,
                                example: schema.example
                            });
                        });
                    }

                    // 2. Legacy/List-specific variables (still needed for target lists)
                    if (sourceNode.type === 'use_target_list' || sourceNode.type === 'generate_targets') {
                        const listId = sourceNode.data.config?.list_id;
                        const sample = listId ? samples[listId] : null;

                        const legacyVars = [
                            { label: 'URL', value: '{{target.url}}', example: sample?.url },
                            { label: 'Name', value: '{{target.name}}', example: sample?.name },
                            { label: 'Email', value: '{{target.email}}', example: sample?.email },
                            { label: 'Metadata', value: '{{target.metadata}}', example: 'JSON' }
                        ];
                        nodeVars.push(...legacyVars);
                    }

                    if (nodeVars.length > 0) {
                        groups.push({
                            nodeName: sourceNode.data.label || sourceDef?.label || sourceNode.id,
                            variables: nodeVars
                        });
                    }

                    findUpstream(sourceNode.id, visited);
                }
            });
        };

        findUpstream(selectedNode.id);
        return groups;
    }, [selectedNode.id, nodes, edges, samples]);

    // Fetch samples for upstream lists
    React.useEffect(() => {
        const fetchSamples = async () => {
            const upstreamNodes = nodes.filter(n => {
                // Simple check if it's upstream would be complex, but we can just check all 'use_target_list' nodes
                // Optimization: only fetch if connected? For now, fetch all list nodes in graph to be safe/easy
                return n.type === 'use_target_list' && n.data.config?.list_id;
            });

            for (const node of upstreamNodes) {
                const listId = node.data.config.list_id;
                if (listId && !samples[listId]) {
                    const { data } = await supabase
                        .from('targets')
                        .select('name, url, email, metadata')
                        .eq('list_id', listId)
                        .limit(1)
                        .single();

                    if (data) {
                        setSamples(prev => ({ ...prev, [listId]: data }));
                    }
                }
            }
        };
        fetchSamples();
    }, [nodes, samples]); // Added samples to dependency array to prevent infinite loop if samples state is updated

    const getGlobalVariables = React.useCallback(() => {
        const groups: Group[] = [];

        if (playbooks.length > 0) {
            groups.push({
                nodeName: 'Playbooks',
                variables: playbooks.map(p => ({
                    label: p.name,
                    value: `{{playbooks.${p.id}}}`,
                    example: p.description
                }))
            });
        }

        if (lists.length > 0) {
            groups.push({
                nodeName: 'Target Lists',
                variables: lists.map(l => ({
                    label: l.name,
                    value: `{{lists.${l.id}}}`,
                    example: `${l.target_count || 0} targets`
                }))
            });
        }

        if (mcpServers.length > 0) {
            groups.push({
                nodeName: 'MCP Servers',
                variables: mcpServers.map(s => ({
                    label: s.name,
                    value: `{{mcp.${s.id}}}`,
                    example: (s.config as any).command || (s.config as any).url || 'No config'
                }))
            });
        }

        if (apiTools.length > 0) {
            groups.push({
                nodeName: 'API Tools',
                variables: apiTools.map(t => ({
                    label: t.name,
                    value: `{{apis.${t.id}}}`,
                    example: t.endpoint
                }))
            });
        }

        groups.push({
            nodeName: 'Agent',
            variables: [
                {
                    label: 'Agent Decides',
                    value: '{{agent.decide}}',
                    example: 'Let the AI choose the best target on page'
                }
            ]
        });

        return groups;
    }, [playbooks, lists, mcpServers, apiTools]);

    const renderConfigFields = () => {
        const upstreamGroups = getUpstreamVariables();
        const globalGroups = getGlobalVariables();
        const variableGroups = [...upstreamGroups, ...globalGroups];
        const hasVariables = variableGroups.length > 0;

        switch (type) {
            case 'start':
                return (
                    <div className="p-4 rounded-lg bg-muted/20 border border-border/50 text-center space-y-2">
                        <Play className="w-8 h-8 text-primary mx-auto opacity-50" />
                        <div className="text-sm font-medium text-foreground">Playbook Entry Point</div>
                        <div className="text-xs text-muted-foreground mr-1">
                            This node starts the execution flow. No configuration is required.
                        </div>
                    </div>
                );
            case 'end':
                return (
                    <div className="p-4 rounded-lg bg-muted/20 border border-border/50 text-center space-y-2">
                        <Square className="w-8 h-8 text-muted-foreground mx-auto opacity-50" />
                        <div className="text-sm font-medium text-foreground">Playbook End Point</div>
                        <div className="text-xs text-muted-foreground mr-1">
                            Execution stops here. Mark as successful completion.
                        </div>
                    </div>
                );
            case 'loop':
                return (
                    <div className="space-y-4">
                        <Field label="Loop Source">
                            <Select
                                value={config.source || 'list'}
                                onValueChange={(v) => handleConfigChange('source', v)}
                            >
                                <SelectTrigger className="h-9 text-xs"><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="list">List / Array</SelectItem>
                                    <SelectItem value="number">Count (Range)</SelectItem>
                                </SelectContent>
                            </Select>
                        </Field>

                        {config.source === 'number' ? (
                            <div className="space-y-4">
                                <div className="flex items-center justify-between px-1">
                                    <Label className="text-[12px] text-muted-foreground">Infinite Loop</Label>
                                    <Switch
                                        checked={config.infinite === true}
                                        onCheckedChange={(v) => handleConfigChange('infinite', v)}
                                    />
                                </div>
                                {config.infinite && (
                                    <p className="text-[10px] text-muted-foreground bg-muted p-2 rounded">
                                        Tip: Ensure your loop contains a "Navigate" or "Click" action (e.g. Next Page) to avoid processing the same data forever.
                                    </p>
                                )}
                                {!config.infinite && (
                                    <Field label="Iterations">
                                        <Input
                                            type="number"
                                            value={config.count || 1}
                                            onChange={(e) => handleConfigChange('count', parseInt(e.target.value))}
                                            placeholder="e.g. 5"
                                            className="h-9 text-xs"
                                        />
                                    </Field>
                                )}
                            </div>
                        ) : (
                            <Field label="Array Variable">
                                <Select
                                    value={config.items || ''}
                                    onValueChange={(v) => handleConfigChange('items', v)}
                                >
                                    <SelectTrigger className="h-9 text-xs"><SelectValue placeholder="Select items..." /></SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="custom"> Custom Variable...</SelectItem>
                                        {variableGroups.flatMap(g => g.variables).filter(v => v.value.includes('items') || v.value.includes('accounts') || v.value.includes('list')).map((v, i) => (
                                            <SelectItem key={i} value={v.value}>{v.label}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </Field>
                        )}
                        <Field label="Max Iterations (Safe Limit)">
                            <Input
                                type="number"
                                value={config.max_loops || 50}
                                onChange={(e) => handleConfigChange('max_loops', parseInt(e.target.value))}
                                className="h-9 text-xs"
                            />
                        </Field>
                    </div>
                );
            case 'navigate':
                const vars = getUpstreamVariables().flatMap(g => g.variables);
                const isManual = config.url_mode === 'manual' || (config.url && !config.url.startsWith('{{'));

                return (
                    <div className="space-y-4">
                        <div className="flex items-center justify-between">
                            <Label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider ml-1">URL Source</Label>
                            <div className="flex bg-muted/60 rounded-md p-0.5 border border-border shadow-inner">
                                <button
                                    type="button"
                                    onClick={() => handleConfigChange('url_mode', 'dynamic')}
                                    className={cn(
                                        "px-2.5 py-1 text-[10px] rounded",
                                        !isManual ? "bg-primary/20 text-primary font-medium" : "text-muted-foreground hover:text-foreground"
                                    )}
                                >
                                    Dynamic
                                </button>
                                <button
                                    type="button"
                                    onClick={() => handleConfigChange('url_mode', 'manual')}
                                    className={cn(
                                        "px-2.5 py-1 text-[10px] rounded",
                                        isManual ? "bg-primary/20 text-primary font-medium" : "text-muted-foreground hover:text-foreground"
                                    )}
                                >
                                    Manual
                                </button>
                            </div>
                        </div>

                        {!isManual ? (
                            <Field>
                                <Select
                                    value={config.url || ''}
                                    onValueChange={(v) => handleConfigChange('url', v)}
                                >
                                    <SelectTrigger className="w-full h-12 rounded-xl border border-border bg-muted/30 px-4 py-2 text-[13px] shadow-sm hover:border-muted-foreground/30 focus:ring-0 focus:ring-offset-0">
                                        <SelectValue placeholder="Select target field..." />
                                    </SelectTrigger>
                                    <SelectContent className="bg-popover border-border/50 max-h-[300px] shadow-2xl rounded-xl">
                                        {vars.length > 0 ? (
                                            vars.map((v, i) => (
                                                <SelectItem key={i} value={v.value} className="focus:bg-accent/50 data-[state=checked]:bg-primary/10 py-2.5">
                                                    <div className="flex flex-col items-start text-left">
                                                        <span className="font-medium text-xs text-foreground leading-tight">{v.label}</span>
                                                        {v.example && (
                                                            <span className="text-[9px] text-muted-foreground/60 truncate max-w-[200px] mt-1 italic">
                                                                {v.example}
                                                            </span>
                                                        )}
                                                    </div>
                                                </SelectItem>
                                            ))
                                        ) : (
                                            <div className="px-3 py-6 text-[11px] text-center text-muted-foreground flex flex-col items-center gap-2">
                                                <div className="w-8 h-8 rounded-full bg-muted/50 flex items-center justify-center">
                                                    <X className="w-4 h-4 opacity-20" />
                                                </div>
                                                <span>No upstream fields found.<br />Connect a list node first.</span>
                                            </div>
                                        )}
                                    </SelectContent>
                                </Select>
                            </Field>
                        ) : (
                            <Field>
                                <Input
                                    value={config.url || ''}
                                    onChange={(e) => handleConfigChange('url', e.target.value)}
                                    placeholder="https://x.com/profile"
                                    className="h-12 rounded-xl text-[13px]"
                                />
                            </Field>
                        )}
                    </div>
                );
            case 'wait':
                // Helper to determine best unit for display if not explicitly set
                const currentMs = config.duration || 1000;

                // We use a ref to track if we've initialized local state to avoid re-calculating on every render
                // forcing the UI to jump around if the user matches a perfect multiple.
                // Actually, just local state initialized once per node selection is best.
                // But since 'case' is inside a render function, we can't conditionally call hooks easily 
                // without extracting a component.
                // Let's extract a small inline component or just use immediate calculation for simplicity
                // but that prevents "1.5 minutes" from staying as "1.5 minutes" if we just store ms.

                // Strategy: Calculate "Best Unit" for display ONLY if we don't have a better idea.
                let bestUnit = 'ms';
                let bestVal = currentMs;

                if (currentMs >= 3600000 && currentMs % 3600000 === 0) { bestUnit = 'h'; bestVal = currentMs / 3600000; }
                else if (currentMs >= 60000 && currentMs % 60000 === 0) { bestUnit = 'm'; bestVal = currentMs / 60000; }
                else if (currentMs >= 1000 && currentMs % 1000 === 0) { bestUnit = 's'; bestVal = currentMs / 1000; }

                return (
                    <WaitNodeConfig
                        valueMs={currentMs}
                        onChange={(val) => handleConfigChange('duration', val)}
                        initialUnit={bestUnit}
                        initialValue={bestVal}
                        key={selectedNode.id} // Re-mount on node change to reset local state
                    />
                );
            case 'click':
                return (
                    <div className="space-y-4">
                        <Field label="Selector">
                            <Input
                                value={config.selector || ''}
                                onChange={(e) => handleConfigChange('selector', e.target.value)}
                                placeholder="button.submit, #id, etc."
                                className="h-12 rounded-xl text-[13px]"
                            />
                        </Field>
                    </div>
                );
            case 'type':
                return (
                    <div className="space-y-4">
                        <Field label="Selector">
                            <Input
                                value={config.selector || ''}
                                onChange={(e) => handleConfigChange('selector', e.target.value)}
                                placeholder="input[name='email']"
                                className="h-12 rounded-xl text-[13px]"
                            />
                        </Field>
                        <Field label="Text">
                            <Input
                                value={config.text || ''}
                                onChange={(e) => handleConfigChange('text', e.target.value)}
                                placeholder="Enter text to type..."
                                className="h-12 rounded-xl text-[13px]"
                            />
                        </Field>
                    </div>
                );
            case 'scroll':
                return (
                    <div className="space-y-4">
                        <Field label="Direction">
                            <Select
                                value={config.direction || 'down'}
                                onValueChange={(v) => handleConfigChange('direction', v)}
                            >
                                <SelectTrigger><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="down">Down</SelectItem>
                                    <SelectItem value="up">Up</SelectItem>
                                </SelectContent>
                            </Select>
                        </Field>
                        <Field label="Amount (px)">
                            <Input
                                type="number"
                                value={config.amount || 800}
                                onChange={(e) => handleConfigChange('amount', parseInt(e.target.value))}
                                placeholder="800"
                            />
                        </Field>
                    </div>
                );
            case 'use_target_list':
                return (
                    <div className="space-y-4">
                        <Field label="List ID">
                            <Select
                                value={config.list_id || ''}
                                onValueChange={(v) => handleConfigChange('list_id', v)}
                            >
                                <SelectTrigger>
                                    <SelectValue placeholder="Select a list" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="agent_decide">
                                        <div className="flex items-center gap-2">
                                            <Sparkles className="h-3 w-3 text-primary" />
                                            <span>Agent Decides</span>
                                        </div>
                                    </SelectItem>
                                    {lists.map(list => (
                                        <SelectItem key={list.id} value={list.id}>
                                            {list.name}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </Field>
                        <Field label="Mode">
                            <Select
                                value={config.mode || 'all'}
                                onValueChange={(v) => handleConfigChange('mode', v)}
                            >
                                <SelectTrigger><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">All Items</SelectItem>
                                    <SelectItem value="limit">Limit</SelectItem>
                                    <SelectItem value="random">Random</SelectItem>
                                </SelectContent>
                            </Select>
                        </Field>
                        {config.mode === 'limit' && (
                            <Field label="Limit">
                                <Input
                                    type="number"
                                    value={config.limit || 10}
                                    onChange={(e) => handleConfigChange('limit', parseInt(e.target.value))}
                                />
                            </Field>
                        )}
                    </div>
                );
            case 'x_scout':
                const scoutMode = config.mode || 'niche'; // default
                return (
                    <div className="space-y-4">
                        <Field label="Scout Mode">
                            <Select
                                value={scoutMode}
                                onValueChange={(v) => handleConfigChange('mode', v)}
                            >
                                <SelectTrigger className="h-9 text-xs"><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="niche">Niche / Topic</SelectItem>
                                    <SelectItem value="community">X Community</SelectItem>
                                    <SelectItem value="followers">Competitor Audience</SelectItem>
                                </SelectContent>
                            </Select>
                        </Field>

                        <Field label={scoutMode === 'niche' ? 'Target Niche' : scoutMode === 'community' ? 'Community URL/ID' : 'Competitor Username'}>
                            {scoutMode === 'niche' ? (
                                <TagsInput
                                    value={config.target ? config.target.split(',').map((s: string) => s.trim()).filter(Boolean) : []}
                                    onChange={(tags) => handleConfigChange('target', tags.join(', '))}
                                    placeholder="e.g. SaaS, AI Marketing (Press Enter)"
                                />
                            ) : (
                                <MentionInput
                                    value={config.target || ''}
                                    onChange={(e) => handleConfigChange('target', e.target.value)}
                                    placeholder={scoutMode === 'community' ? 'Community URL or ID' : 'e.g. @competitor_handle'}
                                    variableGroups={variableGroups}
                                />
                            )}
                        </Field>

                        {scoutMode !== 'followers' && (
                            <Field label="Filter">
                                <Select
                                    value={config.filter || 'latest'}
                                    onValueChange={(v) => handleConfigChange('filter', v)}
                                >
                                    <SelectTrigger className="h-9 text-xs"><SelectValue /></SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="top">Top</SelectItem>
                                        <SelectItem value="latest">Latest</SelectItem>
                                    </SelectContent>
                                </Select>
                            </Field>
                        )}

                        <Field label="Max Items">
                            <Input
                                type="number"
                                value={config.limit || 10}
                                onChange={(e) => handleConfigChange('limit', parseInt(e.target.value))}
                                className="h-9 text-xs"
                            />
                        </Field>

                        <div className="text-[10px] text-muted-foreground p-2 bg-muted/40 rounded border border-border/20">
                            {scoutMode === 'niche' && 'Scouts search results for trending active accounts and hashtags.'}
                            {scoutMode === 'community' && 'Scouts a specific X Community for high-intent members.'}
                            {scoutMode === 'followers' && 'Scouts the followers of a competitor to find potential leads.'}
                        </div>
                    </div>
                );
            case 'condition': {
                const logicMode = config.logic_mode || 'simple';
                return (
                    <div className="space-y-4">
                        <Field label="Logic Mode">
                            <Select
                                value={logicMode}
                                onValueChange={(v) => handleConfigChange('logic_mode', v)}
                            >
                                <SelectTrigger className="h-9 text-xs"><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="simple">Simple Logic</SelectItem>
                                    <SelectItem value="ai">AI Instruction</SelectItem>
                                </SelectContent>
                            </Select>
                        </Field>

                        {logicMode === 'simple' && (
                            <>
                                <Field label="If Value">
                                    <MentionInput
                                        value={config.operand1 || ''}
                                        onChange={(e) => handleConfigChange('operand1', e.target.value)}
                                        placeholder="{{variable}} or value"
                                        variableGroups={variableGroups}
                                    />
                                </Field>
                                <Field label="Operator">
                                    <Select
                                        value={config.operator || 'equals'}
                                        onValueChange={(v) => handleConfigChange('operator', v)}
                                    >
                                        <SelectTrigger className="h-9 text-xs"><SelectValue /></SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="equals">Equals (==)</SelectItem>
                                            <SelectItem value="not_equals">Not Equals (!=)</SelectItem>
                                            <SelectItem value="contains">Contains</SelectItem>
                                            <SelectItem value="greater_than">Greater Than (&gt;)</SelectItem>
                                            <SelectItem value="less_than">Less Than (&lt;)</SelectItem>
                                            <SelectItem value="is_empty">Is Empty</SelectItem>
                                            <SelectItem value="is_not_empty">Is Not Empty</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </Field>
                                {!['is_empty', 'is_not_empty'].includes(config.operator) && (
                                    <Field label="Value to Compare">
                                        <MentionInput
                                            value={config.operand2 || ''}
                                            onChange={(e) => handleConfigChange('operand2', e.target.value)}
                                            placeholder="Value to check against"
                                            variableGroups={variableGroups}
                                        />
                                    </Field>
                                )}
                            </>
                        )}

                        {logicMode === 'ai' && (
                            <Field label="Condition Instruction">
                                <Textarea
                                    value={config.instruction || ''}
                                    onChange={(e) => handleConfigChange('instruction', e.target.value)}
                                    placeholder="e.g. Check if the user looks like a qualified lead based on their bio."
                                    className="min-h-[100px] text-xs"
                                />
                            </Field>
                        )}

                        <div className="text-[10px] text-muted-foreground p-2 bg-muted/40 rounded border border-border/20">
                            Green output is triggered if True. Red output if False.
                        </div>
                    </div>
                );
            }
            case 'x_profile': {
                const profileMode = config.mode || 'target'; // default to target
                return (
                    <div className="space-y-4">
                        <Field label="Profile Mode">
                            <Select
                                value={profileMode}
                                onValueChange={(v) => handleConfigChange('mode', v)}
                            >
                                <SelectTrigger className="h-9 text-xs"><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="target">Unseen Target (Scrape)</SelectItem>
                                    <SelectItem value="me">Current User (Me)</SelectItem>
                                </SelectContent>
                            </Select>
                        </Field>
                        {profileMode === 'target' && (
                            <Field label="Target Handle">
                                <MentionInput
                                    value={config.username || ''}
                                    onChange={(e) => handleConfigChange('username', e.target.value)}
                                    placeholder="e.g. @elonmusk"
                                    variableGroups={variableGroups}
                                />
                            </Field>
                        )}
                        <div className="text-[10px] text-muted-foreground p-2 bg-muted/40 rounded border border-border/20">
                            {profileMode === 'target' ? 'Visits a profile to scrape bio, location, and verification status for qualification.' : 'Checks the currently logged-in user profile stats.'}
                        </div>
                    </div>
                );
            }
            case 'x_dm':
                return (
                    <div className="space-y-4">
                        <Field label="Target Username">
                            <MentionInput
                                value={config.username || ''}
                                onChange={(e) => handleConfigChange('username', e.target.value)}
                                placeholder="@username or {{target.handle}}"
                                variableGroups={variableGroups}
                            />
                        </Field>
                        <Field label="Message Text">
                            <MentionInput
                                value={config.text || ''}
                                onChange={(e) => handleConfigChange('text', e.target.value)}
                                placeholder="Hey, saw your post about..."
                                variableGroups={variableGroups}
                            />
                        </Field>
                        <Field label="Passcode (PIN)">
                            <div className="space-y-2">
                                <Input
                                    type="password"
                                    maxLength={4}
                                    value={config.pin || ''}
                                    onChange={(e) => handleConfigChange('pin', e.target.value)}
                                    placeholder="4-digit PIN (optional)"
                                    className="h-9 text-xs font-mono tracking-[1em]"
                                />
                                <p className="text-[10px] text-muted-foreground bg-amber-500/5 border border-amber-500/10 p-2 rounded">
                                    Required only if the conversation is encrypted. If X prompts for a PIN and it's not provided, the step will fail.
                                </p>
                            </div>
                        </Field>
                    </div>
                );
            case 'x_switch_tab':
                return (
                    <div className="space-y-4">
                        <Field label="Tab Name">
                            <Select
                                value={config.tab_name || 'Following'}
                                onValueChange={(v) => handleConfigChange('tab_name', v)}
                            >
                                <SelectTrigger className="h-9 text-xs"><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="For you">For you</SelectItem>
                                    <SelectItem value="Following">Following</SelectItem>
                                </SelectContent>
                            </Select>
                        </Field>
                        <div className="text-[10px] text-muted-foreground p-2 bg-muted/40 rounded border border-border/20">
                            Switches between the main timeline views on the X Home page. This will refresh the visible posts.
                        </div>
                    </div>
                );
            case 'x_analyze_notifications':
                return (
                    <div className="space-y-4">
                        <Field label="Notification Filter">
                            <Select
                                value={config.filter || 'all'}
                                onValueChange={(v) => handleConfigChange('filter', v)}
                            >
                                <SelectTrigger className="h-9 text-xs"><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">All Notifications</SelectItem>
                                    <SelectItem value="verified">Priority (Verified)</SelectItem>
                                    <SelectItem value="mentions">Mentions Only</SelectItem>
                                </SelectContent>
                            </Select>
                        </Field>
                        <Field label="Max Notifications">
                            <Input
                                type="number"
                                min={1}
                                max={50}
                                value={config.limit || 20}
                                onChange={(e) => handleConfigChange('limit', parseInt(e.target.value) || 20)}
                                className="h-9 text-xs"
                            />
                        </Field>
                        <div className="text-[10px] text-muted-foreground p-2 bg-muted/40 rounded border border-border/20">
                            Navigates to the notifications page and extracts the most recent interactions.
                        </div>
                    </div>
                );
            case 'x_advanced_search':
                return (
                    <div className="space-y-6 pb-4">
                        {/* Section: Keywords */}
                        <div className="space-y-3">
                            <Label className="text-[10px] font-bold uppercase tracking-widest text-primary/70 mb-2 block">Keywords & Content</Label>
                            <Field label="All Words">
                                <TagsInput
                                    value={config.allWords ? config.allWords.split(',').map((s: string) => s.trim()).filter(Boolean) : []}
                                    onChange={(tags) => handleConfigChange('allWords', tags.join(', '))}
                                    placeholder="e.g. openai, chatgpt"
                                />
                            </Field>
                            <Field label="Any Words (OR)">
                                <TagsInput
                                    value={config.anyWords ? config.anyWords.split(',').map((s: string) => s.trim()).filter(Boolean) : []}
                                    onChange={(tags) => handleConfigChange('anyWords', tags.join(', '))}
                                    placeholder="e.g. ai, ml, dl"
                                />
                            </Field>
                            <Field label="Exact Phrase">
                                <MentionInput
                                    value={config.exactPhrase || ''}
                                    onChange={(e) => handleConfigChange('exactPhrase', e.target.value)}
                                    placeholder="e.g. artificial intelligence"
                                    variableGroups={variableGroups}
                                />
                            </Field>
                            <div className="grid grid-cols-2 gap-3">
                                <Field label="Exclude Words">
                                    <TagsInput
                                        value={config.noneWords ? config.noneWords.split(',').map((s: string) => s.trim()).filter(Boolean) : []}
                                        onChange={(tags) => handleConfigChange('noneWords', tags.join(', '))}
                                        placeholder="e.g. crypto, nft"
                                    />
                                </Field>
                                <Field label="Hashtags">
                                    <TagsInput
                                        value={config.hashtags ? config.hashtags.split(',').map((s: string) => s.trim()).filter(Boolean) : []}
                                        onChange={(tags) => handleConfigChange('hashtags', tags.join(', '))}
                                        placeholder="#ai, #saas"
                                    />
                                </Field>
                            </div>
                            <Field label="Cashtags">
                                <TagsInput
                                    value={config.cashtags ? config.cashtags.split(',').map((s: string) => s.trim()).filter(Boolean) : []}
                                    onChange={(tags) => handleConfigChange('cashtags', tags.join(', '))}
                                    placeholder="$BTC, $TSLA"
                                />
                            </Field>
                        </div>

                        {/* Section: Accounts */}
                        <div className="space-y-3 pt-2 border-t border-border/40">
                            <Label className="text-[10px] font-bold uppercase tracking-widest text-primary/70 mb-2 block">Accounts & Lists</Label>
                            <div className="grid grid-cols-2 gap-3">
                                <Field label="From Accounts">
                                    <TagsInput
                                        value={config.fromAccount ? config.fromAccount.split(',').map((s: string) => s.trim()).filter(Boolean) : []}
                                        onChange={(tags) => handleConfigChange('fromAccount', tags.join(', '))}
                                        placeholder="@elonmusk"
                                    />
                                </Field>
                                <Field label="To Accounts">
                                    <TagsInput
                                        value={config.toAccount ? config.toAccount.split(',').map((s: string) => s.trim()).filter(Boolean) : []}
                                        onChange={(tags) => handleConfigChange('toAccount', tags.join(', '))}
                                        placeholder="@reavion"
                                    />
                                </Field>
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                                <Field label="Mentions Accounts">
                                    <TagsInput
                                        value={config.mentionsAccount ? config.mentionsAccount.split(',').map((s: string) => s.trim()).filter(Boolean) : []}
                                        onChange={(tags) => handleConfigChange('mentionsAccount', tags.join(', '))}
                                        placeholder="@google"
                                    />
                                </Field>
                                <Field label="Retweets Of">
                                    <TagsInput
                                        value={config.retweetsOf ? config.retweetsOf.split(',').map((s: string) => s.trim()).filter(Boolean) : []}
                                        onChange={(tags) => handleConfigChange('retweetsOf', tags.join(', '))}
                                        placeholder="@openai"
                                    />
                                </Field>
                            </div>
                            <Field label="From List ID">
                                <Input
                                    value={config.listId || ''}
                                    onChange={(e) => handleConfigChange('listId', e.target.value)}
                                    placeholder="e.g. 1234567890"
                                    className="h-9 text-xs"
                                />
                            </Field>
                        </div>

                        {/* Section: Filtering & Types */}
                        <div className="space-y-3 pt-2 border-t border-border/40">
                            <Label className="text-[10px] font-bold uppercase tracking-widest text-primary/70 mb-2 block">Filtering & Media</Label>

                            <div className="grid grid-cols-2 gap-2">
                                {[
                                    { id: 'isRetweet', label: 'Retweets Only' },
                                    { id: 'isReply', label: 'Replies Only' },
                                    { id: 'isQuote', label: 'Quotes Only' },
                                    { id: 'isVerified', label: 'Verified Only' },
                                    { id: 'hasLinks', label: 'Has Links' },
                                    { id: 'hasImages', label: 'Has Images' },
                                    { id: 'hasVideo', label: 'Has Video' },
                                    { id: 'hasMedia', label: 'Any Media' },
                                    { id: 'positiveSentiment', label: 'Positive :)' },
                                    { id: 'negativeSentiment', label: 'Negative :(' },
                                    { id: 'questionsOnly', label: 'Questions ?' }
                                ].map((filter) => (
                                    <div key={filter.id} className="flex items-center justify-between p-2 rounded bg-muted/30 border border-border/40">
                                        <Label className="text-[10px]">{filter.label}</Label>
                                        <Switch
                                            checked={!!config[filter.id]}
                                            onCheckedChange={(c) => handleConfigChange(filter.id, c)}
                                            className="scale-75"
                                        />
                                    </div>
                                ))}
                            </div>

                            <Field label="Containing URL">
                                <Input
                                    value={config.urlContained || ''}
                                    onChange={(e) => handleConfigChange('urlContained', e.target.value)}
                                    placeholder="e.g. github.com"
                                    className="h-9 text-xs"
                                />
                            </Field>
                        </div>

                        {/* Section: Engagement */}
                        <div className="space-y-3 pt-2 border-t border-border/40">
                            <Label className="text-[10px] font-bold uppercase tracking-widest text-primary/70 mb-2 block">Engagement Thresholds</Label>
                            <div className="grid grid-cols-3 gap-2">
                                <Field label="Min Likes">
                                    <Input
                                        type="number"
                                        value={config.minLikes || 0}
                                        onChange={(e) => handleConfigChange('minLikes', parseInt(e.target.value))}
                                        className="h-9 text-xs"
                                    />
                                </Field>
                                <Field label="Min RTs">
                                    <Input
                                        type="number"
                                        value={config.minRetweets || 0}
                                        onChange={(e) => handleConfigChange('minRetweets', parseInt(e.target.value))}
                                        className="h-9 text-xs"
                                    />
                                </Field>
                                <Field label="Min Replies">
                                    <Input
                                        type="number"
                                        value={config.minReplies || 0}
                                        onChange={(e) => handleConfigChange('minReplies', parseInt(e.target.value))}
                                        className="h-9 text-xs"
                                    />
                                </Field>
                            </div>
                        </div>

                        {/* Section: Date & Lang */}
                        <div className="space-y-3 pt-2 border-t border-border/40">
                            <Label className="text-[10px] font-bold uppercase tracking-widest text-primary/70 mb-2 block">Date, Language & Place</Label>
                            <div className="grid grid-cols-2 gap-3">
                                <Field label="Since (YYYY-MM-DD)">
                                    <Input
                                        value={config.since || ''}
                                        onChange={(e) => handleConfigChange('since', e.target.value)}
                                        placeholder="2024-01-01"
                                        className="h-9 text-xs"
                                    />
                                </Field>
                                <Field label="Until (YYYY-MM-DD)">
                                    <Input
                                        value={config.until || ''}
                                        onChange={(e) => handleConfigChange('until', e.target.value)}
                                        placeholder="2024-12-31"
                                        className="h-9 text-xs"
                                    />
                                </Field>
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                                <Field label="Language">
                                    <Input
                                        value={config.lang || ''}
                                        onChange={(e) => handleConfigChange('lang', e.target.value)}
                                        placeholder="en, es, pt..."
                                        className="h-9 text-xs"
                                    />
                                </Field>
                                <Field label="Place/Location">
                                    <Input
                                        value={config.place || ''}
                                        onChange={(e) => handleConfigChange('place', e.target.value)}
                                        placeholder="New York City"
                                        className="h-9 text-xs"
                                    />
                                </Field>
                            </div>
                            <Field label="Result Type">
                                <Select
                                    value={config.filter || 'latest'}
                                    onValueChange={(v) => handleConfigChange('filter', v)}
                                >
                                    <SelectTrigger className="h-9 text-xs"><SelectValue /></SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="top">Top</SelectItem>
                                        <SelectItem value="latest">Latest</SelectItem>
                                        <SelectItem value="people">People</SelectItem>
                                        <SelectItem value="photos">Photos</SelectItem>
                                        <SelectItem value="videos">Videos</SelectItem>
                                    </SelectContent>
                                </Select>
                            </Field>
                        </div>
                    </div>
                );
            case 'x_post':
                return (
                    <div className="space-y-4">
                        <Field label="Post Instruction">
                            <MentionInput
                                value={config.instruction || config.text || ''}
                                onChange={(e) => {
                                    handleConfigChange('instruction', e.target.value);
                                    // Clear legacy text to avoid confusion
                                    if (config.text) handleConfigChange('text', undefined);
                                }}
                                placeholder="Describe what to post (e.g. 'Write a tweet about AI')..."
                                variableGroups={variableGroups}
                            />
                        </Field>
                    </div>
                );
            case 'x_engage':
                const currentActions = (config.actions || '').split(',').map((a: string) => a.trim().toLowerCase()).filter(Boolean);

                const toggleAction = (action: string, enabled: boolean) => {
                    const newActions = enabled
                        ? [...currentActions, action]
                        : currentActions.filter((a: string) => a !== action);
                    handleConfigChange('actions', newActions.join(','));
                };

                return (
                    <div className="space-y-4">
                        <Field label="Target Index">
                            <MentionInput
                                value={config.targetIndex?.toString() || '0'}
                                onChange={(e) => handleConfigChange('targetIndex', e.target.value)}
                                variableGroups={variableGroups}
                                placeholder="0, 1, 2... or {{loop.index}}"
                            />
                        </Field>

                        <div className="space-y-2">
                            <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/80">Actions</Label>
                            <div className="grid grid-cols-2 gap-2">
                                {[
                                    { id: 'like', label: 'Like' },
                                    { id: 'retweet', label: 'Repost' },
                                    { id: 'follow', label: 'Follow' },
                                    { id: 'reply', label: 'Reply' }
                                ].map((action) => (
                                    <div key={action.id} className="flex items-center justify-between p-2 rounded bg-muted/30 border border-border/40">
                                        <Label className="text-xs">{action.label}</Label>
                                        <Switch
                                            checked={currentActions.includes(action.id)}
                                            onCheckedChange={(c) => toggleAction(action.id, c)}
                                            className="scale-75"
                                        />
                                    </div>
                                ))}
                            </div>
                        </div>

                        {currentActions.includes('reply') && (
                            <div className="space-y-3 animate-in fade-in slide-in-from-top-1 duration-200">
                                <div className="space-y-3 animate-in fade-in slide-in-from-top-1 duration-200">
                                    <Field label="Reply Instruction">
                                        <Textarea
                                            value={config.instruction || config.replyText || config.text || config.value || ''}
                                            onChange={(e) => {
                                                handleConfigChange('instruction', e.target.value);
                                                // Clear legacy fields
                                                if (config.replyText) handleConfigChange('replyText', undefined);
                                                if (config.text) handleConfigChange('text', undefined);
                                                if (config.value) handleConfigChange('value', undefined);
                                            }}
                                            placeholder="Instructions for the reply (e.g. 'Write a friendly comment about {{item.text}}')..."
                                            className="min-h-[100px] text-xs resize-none"
                                        />
                                    </Field>
                                </div>
                            </div>
                        )}

                        <div className="space-y-3 pt-2 border-t border-border/40">
                            <div className="flex items-center justify-between px-1">
                                <Label className="text-[12px] text-muted-foreground">Humanize / Rewrite Content</Label>
                                <Switch
                                    checked={config.enable_humanize === true}
                                    onCheckedChange={(v) => handleConfigChange('enable_humanize', v)}
                                />
                            </div>

                            {config.enable_humanize && (
                                <div className="space-y-3 pl-2 animate-in fade-in slide-in-from-top-1 duration-200">
                                    <Field label="Rewrite Instruction">
                                        <Textarea
                                            value={config.humanize_instruction || ''}
                                            onChange={(e) => handleConfigChange('humanize_instruction', e.target.value)}
                                            placeholder="e.g. Make it witty, professional, and under 280 chars..."
                                            className="min-h-[80px] text-xs resize-none"
                                        />
                                    </Field>
                                </div>
                            )}
                        </div>

                        {(() => {
                            const currentMs = config.wait_between_ms || 2000;
                            let bestUnit = 'ms';
                            let bestVal = currentMs;

                            if (currentMs >= 3600000 && currentMs % 3600000 === 0) { bestUnit = 'h'; bestVal = currentMs / 3600000; }
                            else if (currentMs >= 60000 && currentMs % 60000 === 0) { bestUnit = 'm'; bestVal = currentMs / 60000; }
                            else if (currentMs >= 1000 && currentMs % 1000 === 0) { bestUnit = 's'; bestVal = currentMs / 1000; }

                            return (
                                <div className="space-y-1">
                                    <WaitNodeConfig
                                        label="Wait between actions"
                                        valueMs={currentMs}
                                        onChange={(val) => handleConfigChange('wait_between_ms', val)}
                                        initialUnit={bestUnit}
                                        initialValue={bestVal}
                                        key={`${selectedNode.id}-wait`}
                                    />
                                    <p className="text-[10px] text-muted-foreground mt-[-8px] px-1 pb-2">
                                        Adds a delay between likes, follows, and replies to appear more human.
                                    </p>
                                </div>
                            );
                        })()}

                        <div className="pt-4 pb-2 border-t border-border">
                            <Label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider ml-1">Skip Filters</Label>
                        </div>
                        <div className="flex items-center justify-between px-1">
                            <Label className="text-[12px] text-muted-foreground">Skip logged-in user</Label>
                            <Switch
                                checked={config.skip_self !== false}
                                onCheckedChange={(v) => handleConfigChange('skip_self', v)}
                            />
                        </div>
                        <div className="flex items-center justify-between px-1">
                            <Label className="text-[12px] text-muted-foreground">Skip verified/business profiles</Label>
                            <Switch
                                checked={config.skip_verified === true}
                                onCheckedChange={(v) => handleConfigChange('skip_verified', v)}
                            />
                        </div>
                        <div className="flex items-center justify-between px-1">
                            <Label className="text-[12px] text-muted-foreground">Only engage with verified users</Label>
                            <Switch
                                checked={config.only_verified === true}
                                onCheckedChange={(v) => handleConfigChange('only_verified', v)}
                            />
                        </div>
                        <Field label="Skip Keywords">
                            <TagsInput
                                value={config.skip_keywords ? config.skip_keywords.split(',').map((s: string) => s.trim()).filter(Boolean) : []}
                                onChange={(tags) => handleConfigChange('skip_keywords', tags.join(', '))}
                                placeholder="promotional, official, bot... (Press Enter)"
                            />
                        </Field>
                    </div>
                );
            case 'x_scan_posts':
                return (
                    <div className="space-y-4">
                        <Field label="Query (Optional)">
                            <MentionInput
                                value={config.query || ''}
                                onChange={(e) => handleConfigChange('query', e.target.value)}
                                placeholder="e.g. to:me or from:elonmusk"
                                variableGroups={variableGroups}
                            />
                        </Field>
                        <Field label="Max Posts">
                            <Input
                                type="number"
                                value={config.limit || 15}
                                onChange={(e) => handleConfigChange('limit', parseInt(e.target.value))}
                                className="h-9 text-xs"
                            />
                        </Field>
                        <div className="text-[10px] text-muted-foreground p-2 bg-muted/40 rounded border border-border/20">
                            Scans the current page or performs a search to identify multiple posts and their authors in a single operation. Use "to:me" for mentions.
                        </div>
                    </div>
                );
            case 'generate_targets':
                return (
                    <div className="space-y-4">
                        <Field label="Instruction">
                            <Textarea
                                value={config.instruction || ''}
                                onChange={(e) => handleConfigChange('instruction', e.target.value)}
                                placeholder="Describe targets to find..."
                            />
                        </Field>
                        <Field label="Target List">
                            <Select
                                value={config.list_id || ''}
                                onValueChange={(v) => handleConfigChange('list_id', v)}
                            >
                                <SelectTrigger>
                                    <SelectValue placeholder="Select a list..." />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="new_list">+ Create New List</SelectItem>
                                    {lists.map((l: any) => (
                                        <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </Field>
                        <Field label="Max Targets">
                            <Input
                                type="number"
                                value={config.max_targets || 10}
                                onChange={(e) => handleConfigChange('max_targets', parseInt(e.target.value))}
                            />
                        </Field>
                        <Field label="Output Type">
                            <Select
                                value={config.output_type || 'profile'}
                                onValueChange={(v) => handleConfigChange('output_type', v)}
                            >
                                <SelectTrigger><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="profile">Profile</SelectItem>
                                    <SelectItem value="post">Post</SelectItem>
                                    <SelectItem value="website">Website</SelectItem>
                                </SelectContent>
                            </Select>
                        </Field>
                    </div>
                );

            case 'extract':
                return (
                    <div className="space-y-4">
                        <Field label="Instruction">
                            <Textarea
                                value={config.instruction || ''}
                                onChange={(e) => handleConfigChange('instruction', e.target.value)}
                                placeholder="Describe what data to extract... (e.g. 'Get the price and product name')"
                                className="min-h-[100px] text-xs"
                            />
                        </Field>
                        <Field label="Selector (Optional)">
                            <MentionInput
                                value={config.selector || ''}
                                onChange={(e) => handleConfigChange('selector', e.target.value)}
                                placeholder="Scope to element (e.g. .product-card)"
                                variableGroups={variableGroups}
                            />
                        </Field>
                        <div className="text-[10px] text-muted-foreground p-2 bg-muted/40 rounded border border-border/20">
                            The AI will analyze the page (or the selected element) and extract the structured data you requested.
                        </div>
                    </div>
                );
            case 'capture_leads':
                return (
                    <div className="space-y-4">
                        <Field label="Destination List">
                            <Select
                                value={config.targetListId || ''}
                                onValueChange={(v) => handleConfigChange('targetListId', v)}
                            >
                                <SelectTrigger>
                                    <SelectValue placeholder="Select a list..." />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="new_list">
                                        <div className="flex items-center gap-2">
                                            <Sparkles className="h-3 w-3 text-primary" />
                                            <span>+ Create New List</span>
                                        </div>
                                    </SelectItem>
                                    {lists.map((list: any) => (
                                        <SelectItem key={list.id} value={list.id}>
                                            {list.name}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </Field>

                        <Field label="Leads Source (Variable)">
                            <MentionInput
                                value={config.leads || ''}
                                onChange={(e) => handleConfigChange('leads', e.target.value)}
                                placeholder="{{x_scout.accounts}} or leave empty for Auto"
                                variableGroups={variableGroups}
                            />
                        </Field>

                        <Field label="Default Type">
                            <Select
                                value={config.defaultType || 'person'}
                                onValueChange={(v) => handleConfigChange('defaultType', v)}
                            >
                                <SelectTrigger><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="person">Person</SelectItem>
                                    <SelectItem value="company">Company</SelectItem>
                                    <SelectItem value="post">Post</SelectItem>
                                </SelectContent>
                            </Select>
                        </Field>

                        <div className="text-[10px] text-muted-foreground p-2 bg-muted/40 rounded border border-border/20">
                            Saves the leads found in the specified source variable (or from context) into the selected Target List.
                        </div>
                    </div>
                );
            // Add more cases as needed for other nodes
            default:
                return (
                    <div className="text-xs text-muted-foreground">
                        Configuration enabled via <code>data.config</code> key on this node.
                        <div className="mt-4">
                            <Field label="Generic Config (JSON)">
                                <Textarea
                                    value={JSON.stringify(config, null, 2)}
                                    onChange={(e) => {
                                        try {
                                            const parsed = JSON.parse(e.target.value);
                                            onUpdate(selectedNode.id, {
                                                ...selectedNode.data,
                                                config: parsed
                                            });
                                        } catch { }
                                    }}
                                    className="font-mono text-xs"
                                />
                            </Field>
                        </div>
                    </div>
                );
        }
    };

    return (
        <div className="w-80 border-l border-border bg-card h-full flex flex-col shadow-xl">
            <div className="p-4 border-b border-border flex items-center justify-between">
                <h3 className="font-semibold">Node Configuration</h3>
                <Button variant="ghost" size="icon" onClick={onClose} className="h-6 w-6">
                    <X className="h-4 w-4" />
                </Button>
            </div>

            <ScrollArea className="flex-1 p-4">
                <div className="space-y-6">
                    <div className="flex items-center gap-3 p-3 bg-muted/20 rounded-lg border border-border">
                        <div className={def?.color + " p-2 rounded"}>
                            {def?.icon && <def.icon className="w-4 h-4" />}
                        </div>
                        <div>
                            <div className="text-xs text-muted-foreground">{def?.type}</div>
                            <div className="font-medium">{def?.label}</div>
                        </div>
                    </div>

                    <Field label="Label">
                        <Input
                            value={label || def?.label}
                            onChange={(e) => handleLabelChange(e.target.value)}
                        />
                    </Field>

                    <div className="h-px bg-border" />

                    <div className="space-y-4">
                        <h4 className="text-sm font-medium">Properties</h4>
                        {renderConfigFields()}
                    </div>
                </div>
            </ScrollArea>

            <div className="p-4 border-t border-border">
                <Button variant="destructive" className="w-full" onClick={() => onDelete(selectedNode.id)}>
                    Delete Node
                </Button>
            </div>
        </div>
    );
}

interface WaitNodeConfigProps {
    valueMs: number;
    onChange: (ms: number) => void;
    initialUnit: string;
    initialValue: number;
    label?: string;
}

function WaitNodeConfig({ valueMs, onChange, initialUnit, initialValue, label = "Duration" }: WaitNodeConfigProps) {
    const [unit, setUnit] = React.useState(initialUnit);
    const [val, setVal] = React.useState(initialValue);

    const handleTimeChange = (newValue: number, newUnit: string) => {
        let ms = newValue;
        if (newUnit === 's') ms = newValue * 1000;
        if (newUnit === 'm') ms = newValue * 60000;
        if (newUnit === 'h') ms = newValue * 3600000;

        setUnit(newUnit);
        setVal(newValue);
        onChange(ms);
    };

    return (
        <div className="space-y-4">
            <Field label={label}>
                <div className="flex gap-2">
                    <Input
                        type="number"
                        value={val}
                        onChange={(e) => handleTimeChange(parseFloat(e.target.value) || 0, unit)}
                        className="flex-1"
                    />
                    <Select
                        value={unit}
                        onValueChange={(v) => handleTimeChange(val, v)}
                    >
                        <SelectTrigger className="w-[110px]">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="ms">Milliseconds</SelectItem>
                            <SelectItem value="s">Seconds</SelectItem>
                            <SelectItem value="m">Minutes</SelectItem>
                            <SelectItem value="h">Hours</SelectItem>
                        </SelectContent>
                    </Select>
                </div>
            </Field>
            <div className="text-[10px] text-muted-foreground text-right pr-1">
                Total: {(valueMs / 1000).toFixed(1)}s
            </div>
        </div>
    );
}
