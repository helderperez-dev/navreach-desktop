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
import { MentionInput, Group } from '@/components/ui/mention-input';
import { NODE_DEFINITIONS } from './nodeDefs';
import { PlaybookNodeType } from '@/types/playbook';
import { X, Sparkles, ChevronRight } from 'lucide-react';
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
        // Find nodes providing targets upstream
        const groups: Group[] = [];

        const findUpstream = (nodeId: string, visited = new Set<string>()) => {
            if (visited.has(nodeId)) return;
            visited.add(nodeId);

            const incoming = edges.filter(e => e.target === nodeId);
            incoming.forEach(edge => {
                const sourceNode = nodes.find(n => n.id === edge.source);
                if (sourceNode) {
                    if (sourceNode.type === 'use_target_list' || sourceNode.type === 'generate_targets') {
                        const listId = sourceNode.data.config?.list_id;
                        const sample = listId ? samples[listId] : null;

                        const vars = [
                            {
                                label: 'URL',
                                value: '{{target.url}}',
                                example: sample?.url || 'https://example.com/profile'
                            },
                            {
                                label: 'Name',
                                value: '{{target.name}}',
                                example: sample?.name || 'John Doe'
                            },
                            {
                                label: 'Email',
                                value: '{{target.email}}',
                                example: sample?.email || 'john@example.com'
                            },
                            {
                                label: 'Type',
                                value: '{{target.type}}',
                                example: sample?.type || 'profile'
                            }
                        ];

                        if (sample && sample.metadata) {
                            Object.entries(sample.metadata).forEach(([key, value]) => {
                                vars.push({
                                    label: key.charAt(0).toUpperCase() + key.slice(1).replace(/_/g, ' '),
                                    value: `{{target.metadata.${key}}}`,
                                    example: String(value)
                                });
                            });
                        }

                        groups.push({
                            nodeName: sourceNode.data.label,
                            variables: vars
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
                                    <SelectTrigger className="w-full h-12 rounded-xl border border-border bg-muted/30 px-4 py-2 text-[13px] shadow-sm hover:border-primary/30 focus:ring-0 focus:ring-offset-0">
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
                                    placeholder="https://linkedin.com/in/..."
                                    className="h-12 rounded-xl text-[13px]"
                                />
                            </Field>
                        )}
                    </div>
                );
            case 'wait':
                return (
                    <Field label="Duration (ms)">
                        <Input
                            type="number"
                            value={config.duration || 1000}
                            onChange={(e) => handleConfigChange('duration', parseInt(e.target.value))}
                        />
                    </Field>
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
            case 'engage':
                return (
                    <div className="space-y-4">
                        <Field label="Channel">
                            <Select
                                value={config.channel || 'dm'}
                                onValueChange={(v) => handleConfigChange('channel', v)}
                            >
                                <SelectTrigger><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="dm">Direct Message</SelectItem>
                                    <SelectItem value="comment">Comment</SelectItem>
                                    <SelectItem value="x_reply">X Reply</SelectItem>
                                </SelectContent>
                            </Select>
                        </Field>
                        <Field label="Tone">
                            <Select
                                value={config.tone || 'direct'}
                                onValueChange={(v) => handleConfigChange('tone', v)}
                            >
                                <SelectTrigger><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="direct">Direct</SelectItem>
                                    <SelectItem value="curious">Curious</SelectItem>
                                </SelectContent>
                            </Select>
                        </Field>
                        <Field label="Length">
                            <Select
                                value={config.length || 'medium'}
                                onValueChange={(v) => handleConfigChange('length', v)}
                            >
                                <SelectTrigger><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="short">Short</SelectItem>
                                    <SelectItem value="medium">Medium</SelectItem>
                                </SelectContent>
                            </Select>
                        </Field>
                        <div className="flex items-center justify-between">
                            <Field>
                                <div className="flex items-center justify-between">
                                    <Label>Personalization</Label>
                                    <Switch
                                        checked={config.personalization || false}
                                        onCheckedChange={(c) => handleConfigChange('personalization', c)}
                                    />
                                </div>
                            </Field>
                        </div>
                    </div>
                );
            case 'x_search':
                return (
                    <div className="space-y-4">
                        <Field label="Query">
                            <MentionInput
                                value={config.query || ''}
                                onChange={(e) => handleConfigChange('query', e.target.value)}
                                placeholder="Search query..."
                                variableGroups={variableGroups}
                            />
                        </Field>
                        <Field label="Filter">
                            <Select
                                value={config.filter || 'latest'}
                                onValueChange={(v) => handleConfigChange('filter', v)}
                            >
                                <SelectTrigger><SelectValue /></SelectTrigger>
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
                );
            case 'x_scout_topics':
                return (
                    <div className="space-y-4">
                        <Field label="Max Items">
                            <Input
                                type="number"
                                value={config.limit || 10}
                                onChange={(e) => handleConfigChange('limit', parseInt(e.target.value))}
                                className="h-9 text-xs"
                            />
                        </Field>
                        <div className="text-[10px] text-muted-foreground p-2 bg-muted/40 rounded">
                            Scouts visible tweets for:
                            <ul className="list-disc pl-4 mt-1 space-y-0.5">
                                <li>Trending hashtags</li>
                                <li>Active accounts</li>
                            </ul>
                        </div>
                    </div>
                );
            case 'x_scout_community':
                return (
                    <div className="space-y-4">
                        <Field label="Community ID / URL">
                            <MentionInput
                                value={config.communityId || ''}
                                onChange={(e) => handleConfigChange('communityId', e.target.value)}
                                placeholder="e.g. 1493446837214187523 or URL"
                                variableGroups={variableGroups}
                            />
                        </Field>
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
                        <div className="text-[10px] text-muted-foreground p-2 bg-muted/40 rounded">
                            Goes to the specific X Community to scout for high-intent targets.
                        </div>
                    </div>
                );
            case 'x_advanced_search':
                return (
                    <div className="space-y-4">
                        <Field label="All Words">
                            <MentionInput
                                value={config.allWords || ''}
                                onChange={(e) => handleConfigChange('allWords', e.target.value)}
                                placeholder="e.g. openai chatgpt"
                                variableGroups={variableGroups}
                            />
                        </Field>
                        <Field label="Any Words (OR)">
                            <MentionInput
                                value={config.anyWords || ''}
                                onChange={(e) => handleConfigChange('anyWords', e.target.value)}
                                placeholder="e.g. ai ml dl"
                                variableGroups={variableGroups}
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
                        <Field label="Exclude Words">
                            <Input
                                value={config.noneWords || ''}
                                onChange={(e) => handleConfigChange('noneWords', e.target.value)}
                                placeholder="e.g. crypto"
                                className="h-9 text-xs"
                            />
                        </Field>
                        <Field label="Hashtags">
                            <Input
                                value={config.hashtags || ''}
                                onChange={(e) => handleConfigChange('hashtags', e.target.value)}
                                placeholder="e.g. #ai #saas"
                                className="h-9 text-xs"
                            />
                        </Field>
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
                            <Field label="Min Comms">
                                <Input
                                    type="number"
                                    value={config.minReplies || 0}
                                    onChange={(e) => handleConfigChange('minReplies', parseInt(e.target.value))}
                                    className="h-9 text-xs"
                                />
                            </Field>
                        </div>
                        <Field label="Language">
                            <Input
                                value={config.lang || ''}
                                onChange={(e) => handleConfigChange('lang', e.target.value)}
                                placeholder="en, pt, es..."
                                className="h-9 text-xs"
                            />
                        </Field>
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
                );
            case 'x_like':
                return (
                    <div className="space-y-4">
                        <Field label="Tweet Index">
                            <MentionInput
                                value={config.index?.toString() || '0'}
                                onChange={(e) => handleConfigChange('index', e.target.value)}
                                variableGroups={variableGroups}
                                placeholder="0, 1, 2... or {{loop.index}}"
                            />
                        </Field>
                        <Field label="Action">
                            <Select
                                value={config.action || 'like'}
                                onValueChange={(v) => handleConfigChange('action', v)}
                            >
                                <SelectTrigger><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="like">Like</SelectItem>
                                    <SelectItem value="unlike">Unlike</SelectItem>
                                    <SelectItem value="toggle">Toggle</SelectItem>
                                </SelectContent>
                            </Select>
                        </Field>
                    </div>
                );
            case 'x_reply':
                return (
                    <div className="space-y-4">
                        <Field label="Tweet Index">
                            <MentionInput
                                value={config.index?.toString() || '0'}
                                onChange={(e) => handleConfigChange('index', e.target.value)}
                                variableGroups={variableGroups}
                                placeholder="0, 1, 2... or {{loop.index}}"
                            />
                        </Field>
                        <Field label="Reply Text">
                            <MentionInput
                                value={config.text || ''}
                                onChange={(e) => handleConfigChange('text', e.target.value)}
                                placeholder="Write your reply..."
                                variableGroups={variableGroups}
                            />
                        </Field>
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
                        <Field label="Skip Keywords (comma separated)">
                            <Input
                                value={config.skip_keywords || ''}
                                onChange={(e) => handleConfigChange('skip_keywords', e.target.value)}
                                placeholder="promotional, official, bot..."
                                className="h-9 text-[12px]"
                            />
                        </Field>
                    </div>
                );
            case 'x_post':
                return (
                    <div className="space-y-4">
                        <Field label="Post Content">
                            <MentionInput
                                value={config.text || ''}
                                onChange={(e) => handleConfigChange('text', e.target.value)}
                                placeholder="What is happening?!"
                                variableGroups={variableGroups}
                            />
                        </Field>
                    </div>
                );
            case 'x_follow':
                return (
                    <div className="space-y-4">
                        <Field label="Target Index">
                            <MentionInput
                                value={config.index?.toString() || '0'}
                                onChange={(e) => handleConfigChange('index', e.target.value)}
                                variableGroups={variableGroups}
                                placeholder="0, 1, 2... or {{loop.index}}"
                            />
                        </Field>
                        <Field label="Action">
                            <Select
                                value={config.action || 'follow'}
                                onValueChange={(v) => handleConfigChange('action', v)}
                            >
                                <SelectTrigger><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="follow">Follow</SelectItem>
                                    <SelectItem value="unfollow">Unfollow</SelectItem>
                                    <SelectItem value="toggle">Toggle</SelectItem>
                                </SelectContent>
                            </Select>
                        </Field>
                    </div>
                );
            case 'x_engage':
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
                        <Field label="Actions (comma separated)">
                            <Input
                                value={config.actions || 'like,follow'}
                                onChange={(e) => handleConfigChange('actions', e.target.value)}
                                placeholder="like,follow,retweet,reply"
                            />
                        </Field>
                        <Field label="Reply Text (if reply enabled)">
                            <MentionInput
                                value={config.replyText || ''}
                                onChange={(e) => handleConfigChange('replyText', e.target.value)}
                                placeholder="Reply text..."
                                variableGroups={variableGroups}
                            />
                        </Field>
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
                        <Field label="Skip Keywords (comma separated)">
                            <Input
                                value={config.skip_keywords || ''}
                                onChange={(e) => handleConfigChange('skip_keywords', e.target.value)}
                                placeholder="promotional, official, bot..."
                                className="h-9 text-[12px]"
                            />
                        </Field>
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
            case 'reddit_search':
                return (
                    <div className="space-y-4">
                        <Field label="Query">
                            <MentionInput
                                value={config.query || ''}
                                onChange={(e) => handleConfigChange('query', e.target.value)}
                                placeholder="Search query..."
                                variableGroups={variableGroups}
                            />
                        </Field>
                        <Field label="Sort">
                            <Select value={config.sort || 'relevance'} onValueChange={(v) => handleConfigChange('sort', v)}>
                                <SelectTrigger><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="relevance">Relevance</SelectItem>
                                    <SelectItem value="hot">Hot</SelectItem>
                                    <SelectItem value="top">Top</SelectItem>
                                    <SelectItem value="new">New</SelectItem>
                                    <SelectItem value="comments">Comments</SelectItem>
                                </SelectContent>
                            </Select>
                        </Field>
                        <Field label="Time">
                            <Select value={config.time || 'all'} onValueChange={(v) => handleConfigChange('time', v)}>
                                <SelectTrigger><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="hour">Hour</SelectItem>
                                    <SelectItem value="day">Day</SelectItem>
                                    <SelectItem value="week">Week</SelectItem>
                                    <SelectItem value="month">Month</SelectItem>
                                    <SelectItem value="year">Year</SelectItem>
                                    <SelectItem value="all">All Time</SelectItem>
                                </SelectContent>
                            </Select>
                        </Field>
                        <Field label="Type">
                            <Select value={config.type || 'posts'} onValueChange={(v) => handleConfigChange('type', v)}>
                                <SelectTrigger><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="posts">Posts</SelectItem>
                                    <SelectItem value="communities">Communities</SelectItem>
                                    <SelectItem value="people">People</SelectItem>
                                </SelectContent>
                            </Select>
                        </Field>
                    </div>
                );
            case 'reddit_scout_community':
                return (
                    <div className="space-y-4">
                        <Field label="Subreddit">
                            <MentionInput
                                value={config.subreddit || ''}
                                onChange={(e) => handleConfigChange('subreddit', e.target.value)}
                                placeholder="e.g. SaaS or r/SaaS"
                                variableGroups={variableGroups}
                            />
                        </Field>
                        <Field label="Sort">
                            <Select value={config.sort || 'hot'} onValueChange={(v) => handleConfigChange('sort', v)}>
                                <SelectTrigger><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="hot">Hot</SelectItem>
                                    <SelectItem value="new">New</SelectItem>
                                    <SelectItem value="top">Top</SelectItem>
                                    <SelectItem value="rising">Rising</SelectItem>
                                </SelectContent>
                            </Select>
                        </Field>
                        <Field label="Limit">
                            <Input
                                type="number"
                                value={config.limit || 10}
                                onChange={(e) => handleConfigChange('limit', parseInt(e.target.value))}
                            />
                        </Field>
                    </div>
                );
            case 'reddit_vote':
                return (
                    <div className="space-y-4">
                        <Field label="Index">
                            <MentionInput
                                value={config.index?.toString() || '0'}
                                onChange={(e) => handleConfigChange('index', e.target.value)}
                                placeholder="0, 1, 2... or {{loop.index}}"
                                variableGroups={variableGroups}
                            />
                        </Field>
                        <Field label="Action">
                            <Select value={config.action || 'up'} onValueChange={(v) => handleConfigChange('action', v)}>
                                <SelectTrigger><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="up">Upvote</SelectItem>
                                    <SelectItem value="down">Downvote</SelectItem>
                                </SelectContent>
                            </Select>
                        </Field>
                        <Field label="Target Type">
                            <Select value={config.type || 'post'} onValueChange={(v) => handleConfigChange('type', v)}>
                                <SelectTrigger><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="post">Post</SelectItem>
                                    <SelectItem value="comment">Comment</SelectItem>
                                </SelectContent>
                            </Select>
                        </Field>
                    </div>
                );
            case 'reddit_comment':
                return (
                    <div className="space-y-4">
                        <Field label="Index">
                            <MentionInput
                                value={config.index?.toString() || '0'}
                                onChange={(e) => handleConfigChange('index', e.target.value)}
                                placeholder="0, 1, 2... or {{loop.index}}"
                                variableGroups={variableGroups}
                            />
                        </Field>
                        <Field label="Target Type">
                            <Select value={config.type || 'post'} onValueChange={(v) => handleConfigChange('type', v)}>
                                <SelectTrigger><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="post">Post</SelectItem>
                                    <SelectItem value="comment">Comment</SelectItem>
                                </SelectContent>
                            </Select>
                        </Field>
                        <Field label="Comment Text">
                            <MentionInput
                                value={config.text || ''}
                                onChange={(e) => handleConfigChange('text', e.target.value)}
                                placeholder="Write your comment..."
                                variableGroups={variableGroups}
                            />
                        </Field>
                    </div>
                );
            case 'reddit_join':
                return (
                    <div className="space-y-4">
                        <Field label="Subreddit (Optional)">
                            <MentionInput
                                value={config.subreddit || ''}
                                onChange={(e) => handleConfigChange('subreddit', e.target.value)}
                                placeholder="Leave empty to use current page"
                                variableGroups={variableGroups}
                            />
                        </Field>
                        <Field label="Action">
                            <Select value={config.action || 'join'} onValueChange={(v) => handleConfigChange('action', v)}>
                                <SelectTrigger><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="join">Join</SelectItem>
                                    <SelectItem value="leave">Leave</SelectItem>
                                    <SelectItem value="toggle">Toggle</SelectItem>
                                </SelectContent>
                            </Select>
                        </Field>
                    </div>
                );
            case 'linkedin_search':
                return (
                    <div className="space-y-4">
                        <Field label="Query">
                            <MentionInput
                                value={config.query || ''}
                                onChange={(e) => handleConfigChange('query', e.target.value)}
                                placeholder="Search LinkedIn..."
                                variableGroups={variableGroups}
                            />
                        </Field>
                        <Field label="Type">
                            <Select value={config.type || 'people'} onValueChange={(v) => handleConfigChange('type', v)}>
                                <SelectTrigger><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">All</SelectItem>
                                    <SelectItem value="people">People</SelectItem>
                                    <SelectItem value="jobs">Jobs</SelectItem>
                                    <SelectItem value="posts">Posts</SelectItem>
                                    <SelectItem value="companies">Companies</SelectItem>
                                </SelectContent>
                            </Select>
                        </Field>
                    </div>
                );
            case 'linkedin_connect':
                return (
                    <div className="space-y-4">
                        <Field label="Personalized Note (Optional)">
                            <MentionInput
                                value={config.message || ''}
                                onChange={(e) => handleConfigChange('message', e.target.value)}
                                placeholder="I'd like to connect to discuss {{target.metadata.role}}..."
                                variableGroups={variableGroups}
                            />
                        </Field>
                    </div>
                );
            case 'linkedin_message':
                return (
                    <div className="space-y-4">
                        <Field label="Message content">
                            <MentionInput
                                value={config.message || ''}
                                onChange={(e) => handleConfigChange('message', e.target.value)}
                                placeholder="Hello {{target.name}}, I saw your profile and..."
                                variableGroups={variableGroups}
                            />
                        </Field>
                    </div>
                );
            case 'instagram_post':
                return (
                    <div className="space-y-4">
                        <Field label="Caption">
                            <MentionInput
                                value={config.caption || ''}
                                onChange={(e) => handleConfigChange('caption', e.target.value)}
                                placeholder="Write your caption..."
                                variableGroups={variableGroups}
                            />
                        </Field>
                    </div>
                );
            case 'instagram_engage':
                return (
                    <div className="space-y-4">
                        <Field label="Action">
                            <Select value={config.action || 'like'} onValueChange={(v) => handleConfigChange('action', v)}>
                                <SelectTrigger><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="like">Like</SelectItem>
                                    <SelectItem value="comment">Comment</SelectItem>
                                </SelectContent>
                            </Select>
                        </Field>
                        {config.action === 'comment' && (
                            <Field label="Comment Text">
                                <MentionInput
                                    value={config.commentText || ''}
                                    onChange={(e) => handleConfigChange('commentText', e.target.value)}
                                    variableGroups={variableGroups}
                                />
                            </Field>
                        )}
                    </div>
                );
            case 'bluesky_post':
                return (
                    <div className="space-y-4">
                        <Field label="Post content">
                            <MentionInput
                                value={config.text || ''}
                                onChange={(e) => handleConfigChange('text', e.target.value)}
                                placeholder="What's up in the sky?"
                                variableGroups={variableGroups}
                            />
                        </Field>
                    </div>
                );
            case 'bluesky_reply':
                return (
                    <div className="space-y-4">
                        <Field label="Post Index">
                            <Input
                                type="number"
                                value={config.index || 0}
                                onChange={(e) => handleConfigChange('index', parseInt(e.target.value))}
                            />
                        </Field>
                        <Field label="Reply content">
                            <MentionInput
                                value={config.text || ''}
                                onChange={(e) => handleConfigChange('text', e.target.value)}
                                variableGroups={variableGroups}
                            />
                        </Field>
                    </div>
                );
            case 'browser_accessibility_tree':
                return (
                    <div className="space-y-4">
                        <div className="text-[10px] text-muted-foreground p-2 bg-muted/40 rounded">
                            Retrieves the simplified accessibility tree of the page. No configuration needed.
                        </div>
                    </div>
                );
            case 'browser_inspect':
                return (
                    <div className="space-y-4">
                        <Field label="Selector">
                            <MentionInput
                                value={config.selector || ''}
                                onChange={(e) => handleConfigChange('selector', e.target.value)}
                                placeholder="CSS selector to inspect..."
                                variableGroups={variableGroups}
                            />
                        </Field>
                        <div className="text-[10px] text-muted-foreground p-2 bg-muted/40 rounded">
                            Analyzes visibility, z-index, and computed styles of the matched element.
                        </div>
                    </div>
                );
            case 'browser_highlight':
                return (
                    <div className="space-y-4">
                        <Field label="Selector">
                            <MentionInput
                                value={config.selector || ''}
                                onChange={(e) => handleConfigChange('selector', e.target.value)}
                                placeholder="CSS selector to highlight..."
                                variableGroups={variableGroups}
                            />
                        </Field>
                        <Field label="Duration (ms)">
                            <Input
                                type="number"
                                value={config.duration || 2000}
                                onChange={(e) => handleConfigChange('duration', parseInt(e.target.value))}
                                placeholder="2000"
                            />
                        </Field>
                    </div>
                );
            case 'browser_console_logs':
                return (
                    <div className="space-y-4">
                        <div className="text-[10px] text-muted-foreground p-2 bg-muted/40 rounded">
                            Retrieves the last 50 console messages from the page. No configuration needed.
                        </div>
                    </div>
                );
            case 'browser_grid':
                return (
                    <div className="space-y-4">
                        <div className="text-[10px] text-muted-foreground p-2 bg-muted/40 rounded">
                            Overlays a numbered coordinate grid on the page for 30 seconds to assist in finding target X/Y coordinates.
                        </div>
                    </div>
                );
            case 'humanize':
                return (
                    <div className="space-y-4">
                        <Field label="Text to Humanize">
                            <MentionInput
                                value={config.text || ''}
                                onChange={(e) => handleConfigChange('text', e.target.value)}
                                placeholder="{{item.content}}"
                                variableGroups={variableGroups}
                            />
                        </Field>
                        <Field label="Tone">
                            <Input
                                value={config.tone || ''}
                                onChange={(e) => handleConfigChange('tone', e.target.value)}
                                placeholder="Casual, professional, witty..."
                            />
                        </Field>
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
