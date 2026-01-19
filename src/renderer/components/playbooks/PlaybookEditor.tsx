import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import { motion, AnimatePresence } from 'framer-motion';
import { PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { CircularLoader } from '@/components/ui/CircularLoader';

import { TooltipProvider } from '@/components/ui/tooltip';
import ReactFlow, {
    Background,
    Controls,
    Panel,
    addEdge,
    useNodesState,
    useEdgesState,
    ReactFlowProvider,
    Connection,
    Edge,
    SelectionMode
} from 'reactflow';
import 'reactflow/dist/style.css';
import { toast } from 'sonner';

import { Playbook, PlaybookCapabilities, PlaybookExecutionDefaults } from '@/types/playbook';
import { playbookService } from '@/services/playbookService';
import { useAppStore } from '@/stores/app.store';
import { useChatStore } from '@/stores/chat.store';
import { useBrowserStore } from '@/stores/browser.store';
import { useSettingsStore } from '@/stores/settings.store';
import { useWorkspaceStore } from '@/stores/workspace.store';
import { NodePalette } from './NodePalette';
import { PlaybookToolbar } from './PlaybookToolbar';
import { NodeConfigPanel } from './NodeConfigPanel';
import { nodeTypes } from './nodes';
import { NODE_DEFINITIONS } from './nodeDefs';
import { PlaybookNodeType } from '@/types/playbook';
import { v4 as uuidv4 } from 'uuid';
import dagre from 'dagre';

interface PlaybookEditorProps {
    playbookId: string | null;
    onBack: () => void;
}

const initialCapabilities: PlaybookCapabilities = {
    browser: true,
    mcp: [],
    external_api: []
};
const initialDefaults: PlaybookExecutionDefaults = { mode: 'observe', require_approval: true, speed: 'normal' };

function PlaybookEditorContent({ playbookId, onBack }: PlaybookEditorProps) {
    const reactFlowWrapper = useRef<HTMLDivElement>(null);
    const [nodes, setNodes, onNodesChange] = useNodesState([]);
    const [edges, setEdges, onEdgesChange] = useEdgesState([]);
    const [reactFlowInstance, setReactFlowInstance] = useState<any>(null);

    const [playbookName, setPlaybookName] = useState('New Playbook');
    const [description, setDescription] = useState('');
    const [version, setVersion] = useState('1.0.0');
    const [capabilities, setCapabilities] = useState<PlaybookCapabilities>(initialCapabilities);
    const [defaults, setDefaults] = useState<PlaybookExecutionDefaults>(initialDefaults);

    const [selectedNode, setSelectedNode] = useState<any>(null);
    const [saving, setSaving] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
    const [executionLogs, setExecutionLogs] = useState<{ id: string, msg: string, type: 'info' | 'success' | 'error' | 'running', time: string, timestamp: number }[]>([]);
    const [layoutDirection, setLayoutDirection] = useState<'TB' | 'LR'>('TB');
    const isRunning = useChatStore(s => s.isStreaming);
    const nodesRef = useRef(nodes);
    useEffect(() => {
        nodesRef.current = nodes;
    }, [nodes]);


    useEffect(() => {
        if (playbookId) {
            loadPlaybook(playbookId);
        } else {
            // Initialize new playbook with Start and End nodes
            setNodes([
                { id: 'start-1', type: 'start', position: { x: 100, y: 100 }, data: { label: 'Start' } },
                { id: 'end-1', type: 'end', position: { x: 500, y: 100 }, data: { label: 'End' } },
            ]);
            setEdges([]);
            setPlaybookName('New Playbook');
        }
    }, [playbookId]);

    const edgesRef = useRef(edges);
    useEffect(() => {
        edgesRef.current = edges;
    }, [edges]);

    const lastActiveNodeRef = useRef<string | null>(null);

    // Playbook Execution Status Listener
    useEffect(() => {
        if (!window.api.ai.onPlaybookStatus) return;

        const cleanup = window.api.ai.onPlaybookStatus((data) => {
            // CRITICAL: Ignore updates if we are not actively streaming/running
            if (!useChatStore.getState().isStreaming) {
                console.warn('[PlaybookEditor] Ignoring status update after stop:', data);
                return;
            }

            // Helper to get all descendant node IDs (to reset them when a parent re-runs)
            const getDescendants = (nodeId: string, currentEdges: Edge[]): string[] => {
                const descendants: string[] = [];
                const queue = [nodeId];
                const visited = new Set<string>();

                while (queue.length > 0) {
                    const currentId = queue.shift()!;
                    if (visited.has(currentId)) continue;
                    visited.add(currentId);

                    const children = currentEdges
                        .filter(e => e.source === currentId)
                        .map(e => e.target);

                    for (const childId of children) {
                        if (!visited.has(childId)) {
                            // Don't include the starting node itself in descendants 
                            if (childId !== nodeId) {
                                descendants.push(childId);
                            }
                            queue.push(childId);
                        }
                    }
                }
                return descendants;
            };

            // 1. Update Nodes visually
            setNodes((nds) => {
                // Use ref for edges to avoid stale closure without effect re-run
                const currentEdges = edgesRef.current;
                const descendantIds = data.status === 'running' ? getDescendants(data.nodeId, currentEdges) : [];

                return nds.map((node) => {
                    // Update the target node
                    if (node.id === data.nodeId) {
                        const isLoop = node.type === 'loop';
                        const currentCount = node.data?.loopCount || 0;
                        const newCount = (isLoop && data.status === 'running') ? currentCount + 1 : currentCount;

                        return {
                            ...node,
                            data: {
                                ...node.data,
                                executionStatus: data.status,
                                executionMessage: data.message,
                                loopCount: newCount
                            }
                        };
                    }

                    // Reset descendants if parent is starting over
                    if (descendantIds.includes(node.id)) {
                        return {
                            ...node,
                            data: {
                                ...node.data,
                                executionStatus: undefined,
                                executionMessage: undefined
                                // We purposefully DON'T reset loopCount here 
                            }
                        };
                    }

                    return node;
                });
            });

            // 2. Update Edges to show active path
            // We use lastActiveNodeRef to know where we came from, resolving ambiguity in loops.
            const sourceNodeId = lastActiveNodeRef.current;

            // If this node is "running", highlight the path TO it.
            if (data.status === 'running') {
                setEdges((eds) => eds.map((edge) => {
                    // Logic: Highlight if this edge connects Previous -> Current
                    const isTraversedPath = edge.target === data.nodeId && edge.source === sourceNodeId;

                    // FALLBACK: If sourceNodeId is null, this is the first node of the run.
                    // We highlight ANY incoming edge to this node since we're just starting.
                    const isFirstPath = sourceNodeId === null && edge.target === data.nodeId;

                    const isActive = isTraversedPath || isFirstPath;

                    if (isActive) {
                        return {
                            ...edge,
                            animated: true,
                            style: { ...edge.style, strokeDasharray: '5,5', strokeWidth: 3, stroke: '#3b82f6' } // Blue active
                        };
                    }

                    // Reset others for clarity as requested
                    return {
                        ...edge,
                        animated: false,
                        style: { ...edge.style, strokeDasharray: undefined, strokeWidth: 2, stroke: undefined }
                    };
                }));

                // Update the ref for next step
                lastActiveNodeRef.current = data.nodeId;
            }

            // 3. Add to Logs
            if (data.message || data.status) {
                const type = data.status;
                const nodeLabel = nodesRef.current.find(n => n.id === data.nodeId)?.data?.label || data.nodeId;
                const logMsg = data.message || (data.status === 'running' ? `Starting ${nodeLabel}...` : `${nodeLabel}: ${data.status}`);

                setExecutionLogs(prev => [
                    { id: uuidv4(), msg: logMsg, type, time: '', timestamp: Date.now() },
                    ...prev.slice(0, 99)
                ]);
            }
        });

        return cleanup;
    }, [setNodes, setEdges, nodesRef]); // Removed 'edges' to prevent re-subscribe on every animation frame


    // Narration stream listener for isolated playbook runs
    useEffect(() => {
        if (!isRunning) return;

        let currentNarration = '';
        const cleanup = window.api.ai.onStreamChunk((data) => {
            if (data.content) {
                currentNarration += data.content;
            }
            if (data.done || data.toolCall) {
                if (currentNarration.trim()) {
                    setExecutionLogs(prev => [
                        {
                            id: uuidv4(),
                            msg: `Agent: ${currentNarration.trim()}`,
                            type: 'info',
                            time: '',
                            timestamp: Date.now()
                        },
                        ...prev.slice(0, 99)
                    ]);
                    currentNarration = '';
                }
            }
        });
        return cleanup;
    }, [isRunning]);


    const loadPlaybook = async (id: string) => {
        setIsLoading(true);
        try {
            const data = await playbookService.getPlaybookById(id);
            if (data) {
                setPlaybookName(data.name);
                setDescription(data.description || '');
                setVersion(data.version || '1.0.0');
                setCapabilities(data.capabilities);
                setDefaults({
                    ...data.execution_defaults,
                    speed: data.execution_defaults?.speed || 'normal'
                });
                if (data.graph) {
                    // Always clear execution status when loading to ensure it starts fresh
                    const sanitizedNodes = (data.graph.nodes || []).map((node: any) => ({
                        ...node,
                        data: {
                            ...node.data,
                            executionStatus: undefined,
                            executionMessage: undefined,
                            loopCount: 0
                        }
                    }));
                    setNodes(sanitizedNodes);
                    const sanitizedEdges = (data.graph.edges || []).map((edge: any) => ({
                        ...edge,
                        animated: false,
                        style: { ...edge.style, strokeDasharray: undefined, strokeWidth: 2 }
                    }));
                    setEdges(sanitizedEdges);
                    // Viewport restore handled by RF if we saved it, but we can iterate later
                }
            }
        } catch (error) {
            toast.error('Failed to load playbook');
        } finally {
            setIsLoading(false);
        }
    };

    const onConnect = useCallback((params: Connection) => {
        const edge = {
            ...params,
            type: 'smoothstep',
            animated: false,
            style: { strokeWidth: 2 }
        };
        setEdges((eds) => addEdge(edge, eds));
    }, [setEdges]);

    const onDragOver = useCallback((event: React.DragEvent) => {
        event.preventDefault();
        event.dataTransfer.dropEffect = 'move';
    }, []);

    const onDrop = useCallback(
        (event: React.DragEvent) => {
            event.preventDefault();

            const type = event.dataTransfer.getData('application/reactflow') as PlaybookNodeType;

            if (typeof type === 'undefined' || !type) {
                return;
            }

            // Check constraints
            if (type === 'start') {
                const hasStart = nodes.find(n => n.type === 'start');
                if (hasStart) {
                    toast.error('Only one Start node allowed.');
                    return;
                }
            }
            if (type === 'end') {
                const hasEnd = nodes.find(n => n.type === 'end');
                if (hasEnd) {
                    toast.error('Only one End node allowed.');
                    return;
                }
            }

            const position = reactFlowInstance.screenToFlowPosition({
                x: event.clientX,
                y: event.clientY,
            });

            const newNode = {
                id: uuidv4(),
                type,
                position,
                data: { label: NODE_DEFINITIONS[type].label, config: {} },
            };

            setNodes((nds) => nds.concat(newNode));
        },
        [reactFlowInstance, nodes]
    );

    const onNodeClick = useCallback((_: React.MouseEvent, node: any) => {
        setSelectedNode(node);
    }, []);

    const onPaneClick = useCallback(() => {
        setSelectedNode(null);
    }, []);

    const updateNodeData = useCallback((id: string, newData: any) => {
        setNodes((nds) => nds.map((node) => {
            if (node.id === id) {
                return { ...node, data: newData };
            }
            return node;
        }));
        // Also update selected node for immediate partial feedback if needed, 
        // though typically we use the nodes state
        setSelectedNode((prev: any) => prev?.id === id ? { ...prev, data: newData } : prev);
    }, [setNodes]);

    const deleteNode = useCallback((id: string) => {
        setNodes((nds) => nds.filter(n => n.id !== id));
        setEdges((eds) => eds.filter(e => e.source !== id && e.target !== id));
        setSelectedNode(null);
    }, [setNodes, setEdges]);

    const onCopy = useCallback((event: ClipboardEvent) => {
        const target = event.target as HTMLElement;
        if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
            return;
        }

        const selectedNodes = nodes.filter(n => n.selected);
        if (selectedNodes.length === 0) return;

        const selectedEdges = edges.filter(e =>
            selectedNodes.some(n => n.id === e.source) &&
            selectedNodes.some(n => n.id === e.target)
        );

        const dataToCopy = {
            nodes: selectedNodes,
            edges: selectedEdges
        };

        event.clipboardData?.setData('text/plain', JSON.stringify(dataToCopy, null, 2));
        event.preventDefault();
        toast.info(`Copied ${selectedNodes.length} nodes to clipboard`);
    }, [nodes, edges]);

    const onPaste = useCallback((event: ClipboardEvent) => {
        const target = event.target as HTMLElement;
        if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
            return;
        }

        const clipboardData = event.clipboardData?.getData('text');
        if (!clipboardData) return;

        let text = clipboardData;

        // Clean markdown code blocks if present
        if (text.includes('```')) {
            const matches = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
            if (matches && matches[1]) {
                text = matches[1];
            }
        }

        try {
            const data = JSON.parse(text);

            let nodesToImport = [];
            let edgesToImport = [];

            // Detect format
            if (Array.isArray(data)) {
                // Determine if it's an array of nodes
                if (data.every(i => i.id && i.type && i.position)) {
                    nodesToImport = data;
                }
            } else if (data.nodes || data.graph?.nodes) {
                // Standard export format
                nodesToImport = data.graph?.nodes || data.nodes;
                edgesToImport = data.graph?.edges || data.edges || [];
            } else if (data.id && data.type && data.position) {
                // Single node object
                nodesToImport = [data];
            }

            if (!nodesToImport || nodesToImport.length === 0) return;

            // Determine if this is a "Full Playbook" (Replacement)
            const isFullPlaybook = !!(data.graph || data.capabilities || (data.name && data.description));

            if (isFullPlaybook) {
                if (nodes.length > 2 && !window.confirm('You are pasting a full playbook. Replace current contents?')) {
                    return;
                }

                setNodes(nodesToImport);
                setEdges(edgesToImport || []);
                if (data.name) setPlaybookName(data.name);
                if (data.description) setDescription(data.description);
                if (data.capabilities) setCapabilities(data.capabilities);
                if (data.execution_defaults) setDefaults(data.execution_defaults);

                toast.success('Full playbook imported');
                setTimeout(() => reactFlowInstance?.fitView({ duration: 800 }), 100);
                return;
            }

            // Scenario 2: Partial Paste (Merge with existing)
            let filteredNodes = nodesToImport;

            // Check for duplicate Start/End only if we already have them
            const hasStart = nodes.some(n => n.type === 'start');
            const hasEnd = nodes.some(n => n.type === 'end');

            filteredNodes = filteredNodes.filter((n: any) => {
                if (n.type === 'start' && hasStart) return false;
                if (n.type === 'end' && hasEnd) return false;
                return true;
            });

            if (filteredNodes.length === 0 && nodesToImport.length > 0) {
                toast.warning('Skipped Start/End nodes (already exist).');
                return; // Or just return if nothing left
            }

            // Generate new IDs and offset position
            const idMap: Record<string, string> = {};
            const mousePos = { x: 100, y: 100 }; // Ideally use real mouse pos if possible, but hard here.

            // Calculate center of pasted group to offset relative to view center? 
            // Simple offset: +50px

            const newNodes = filteredNodes.map((node: any) => {
                const newId = uuidv4();
                idMap[node.id] = newId;
                return {
                    ...node,
                    id: newId,
                    position: {
                        x: (node.position?.x || 0) + 50,
                        y: (node.position?.y || 0) + 50,
                    },
                    selected: true,
                };
            });

            const newEdges = (edgesToImport || [])
                .filter((e: any) => idMap[e.source] && idMap[e.target])
                .map((edge: any) => ({
                    ...edge,
                    id: uuidv4(),
                    source: idMap[edge.source],
                    target: idMap[edge.target],
                    selected: true,
                }));

            // Deselect visible nodes
            setNodes((nds) => nds.map((n) => ({ ...n, selected: false })).concat(newNodes));
            setEdges((eds) => eds.map((e) => ({ ...e, selected: false })).concat(newEdges));

            toast.success(`Pasted ${newNodes.length} nodes`);
        } catch (e) {
            console.error('Paste error:', e);
            // Don't toast error on every random paste (could be text)
        }
    }, [nodes, reactFlowInstance, setNodes, setEdges]);

    useEffect(() => {
        window.addEventListener('paste', onPaste);
        window.addEventListener('copy', onCopy);
        return () => {
            window.removeEventListener('paste', onPaste);
            window.removeEventListener('copy', onCopy);
        };
    }, [onPaste, onCopy]);

    const onLayout = useCallback((direction: 'TB' | 'LR' = 'TB') => {
        const dagreGraph = new dagre.graphlib.Graph();
        dagreGraph.setDefaultEdgeLabel(() => ({}));

        // Direction: 'TB' (Top-to-Bottom) or 'LR' (Left-to-Right)
        // Increased separation to prevent overlapping
        dagreGraph.setGraph({
            rankdir: direction,
            nodesep: 250, // Increased from 200
            ranksep: 300,  // Increased significantly from 150 to handle loops better
            acyclicer: 'greedy'
        });

        const nodeWidth = 250;
        const nodeHeight = 120;

        nodes.forEach((node) => {
            const width = node.width || nodeWidth;
            const height = node.height || nodeHeight;
            dagreGraph.setNode(node.id, { width, height });
        });

        edges.forEach((edge) => {
            dagreGraph.setEdge(edge.source, edge.target);
        });

        dagre.layout(dagreGraph);

        // 1. Apply new positions calculated by Dagre
        const layoutedNodes = nodes.map((node) => {
            const nodeWithPosition = dagreGraph.node(node.id);
            const width = node.width || nodeWidth;
            const height = node.height || nodeHeight;
            return {
                ...node,
                position: {
                    x: nodeWithPosition.x - width / 2,
                    y: nodeWithPosition.y - height / 2,
                },
            };
        });

        setLayoutDirection(direction);
        const nodesWithDirection = layoutedNodes.map(n => ({
            ...n,
            data: { ...n.data, layoutDirection: direction }
        }));
        setNodes(nodesWithDirection);

        // 2. Optimize connections based on direction
        // We preserve specialized logic handles (like loop backs) to let ReactFlow find the path
        const layoutedEdges = edges.map(edge => {
            const isSpecializedHandle = edge.sourceHandle &&
                ['true', 'false', 'done', 'item'].includes(edge.sourceHandle);

            // If it's a specialized Logic handle, we KEEP it as is. 
            // The node component logic will render it on the Right usually.
            if (isSpecializedHandle) return edge;

            // Otherwise, standardize for clean flow
            const sourceHandle = direction === 'TB' ? 'bottom-source' : 'right-source';
            const targetHandle = direction === 'TB' ? 'top-target' : 'left-target';

            return {
                ...edge,
                sourceHandle,
                targetHandle,
                type: 'smoothstep'
            };
        });

        setEdges(layoutedEdges);
        setTimeout(() => reactFlowInstance?.fitView({ duration: 800 }), 50);
    }, [nodes, edges, reactFlowInstance, setNodes, setEdges]);

    const savePlaybook = async (overrides?: Partial<Playbook>): Promise<string | null> => {
        // Validate with current state OR overrides
        const currentNodes = overrides?.graph?.nodes || nodes;
        const currentEdges = overrides?.graph?.edges || edges;
        const currentDescription = overrides?.description !== undefined ? overrides.description : description;
        const currentVersion = overrides?.version !== undefined ? overrides.version : version;
        const currentDefaults = overrides?.execution_defaults || defaults;
        const currentCapabilities = overrides?.capabilities || capabilities;

        const startNode = currentNodes.find(n => n.type === 'start');
        const endNode = currentNodes.find(n => n.type === 'end');

        if (!startNode) {
            toast.error('Playbook must have a Start node.');
            return null;
        }

        if (!endNode && currentDefaults.mode !== 'auto') {
            toast.error('Playbook must have an End node (or set Mode to Autonomous).');
            return null;
        }

        setSaving(true);
        try {
            const payload = {
                name: playbookName,
                description: currentDescription,
                version: currentVersion,
                graph: { nodes: currentNodes, edges: currentEdges },
                capabilities: currentCapabilities,
                execution_defaults: currentDefaults,
                workspace_id: useWorkspaceStore.getState().currentWorkspace?.id // Inject Workspace ID
            };

            if (playbookId) {
                await playbookService.updatePlaybook(playbookId, payload);
                toast.success('Playbook updated');
                return playbookId;
            } else {
                const created = await playbookService.createPlaybook({
                    ...payload,
                    name: playbookName,
                    description: currentDescription || '',
                    version: currentVersion || '1.0.0'
                } as any);
                toast.success('Playbook created');
                return created?.id || null;
            }
        } catch (error) {
            toast.error('Failed to save playbook');
            console.error(error);
            return null;
        } finally {
            setSaving(false);
        }
    };

    const handleSaveClick = async (meta?: Partial<Playbook>) => {
        const id = await savePlaybook(meta);
        if (id && !playbookId) {
            onBack();
        }
    };

    const handleRun = async () => {
        // 1. Immediately show the split browser view
        useAppStore.getState().setShowPlaybookBrowser(true);
        // Reset browser state to show loading screen
        useBrowserStore.getState().resetBrowserState();

        // Stop any existing execution first to avoid conflicts
        if (useChatStore.getState().isStreaming) {
            toast.info('Stopping previous session...');
            await window.api.ai.stop();
            useChatStore.getState().setIsStreaming(false);
            // Small delay to ensure stop propagates
            await new Promise(r => setTimeout(r, 500));
        }

        const id = await savePlaybook();
        if (id) {
            resetNodeStatuses();
            setExecutionLogs([{ id: 'start', msg: 'System: Starting Playbook execution...', type: 'info', time: '', timestamp: Date.now() }]);

            // Set the selected model if configured in defaults
            if (defaults.model) {
                const { modelProviders } = useSettingsStore.getState();
                let foundModel = null;
                for (const provider of modelProviders) {
                    const m = provider.models.find(mod => mod.id === defaults.model);
                    if (m) {
                        foundModel = { ...m, providerId: provider.id };
                        break;
                    }
                }
                if (foundModel) {
                    useChatStore.getState().setSelectedModel(foundModel);
                }
            }

            // Run playbook in an isolated instance
            useChatStore.getState().setPendingPrompt({
                content: `Run playbook {{playbooks.${id}}}`,
                isIsolated: true,
                playbookId: id
            });

            // 2. Collapse Chat (User wants logs, not chat)
            useAppStore.setState({ chatPanelCollapsed: true });

            // 3. Clear selected node (Hide config panel)
            setSelectedNode(null);
        }
    };


    const resetNodeStatuses = useCallback(() => {
        lastActiveNodeRef.current = null;
        setNodes((nds) => nds.map((node) => ({
            ...node,
            data: {
                ...node.data,
                executionStatus: undefined,
                executionMessage: undefined,
                loopCount: 0
            }
        })));
        setEdges((eds) => eds.map((edge) => ({
            ...edge,
            animated: false,
            style: { ...edge.style, stroke: undefined, strokeWidth: 2, strokeDasharray: undefined }
        })));
    }, [setNodes, setEdges]);

    const handleStop = () => {
        window.api.ai.stop();
        useChatStore.getState().setIsStreaming(false);
        useChatStore.getState().setRunningConversationId(null);

        // Prevent auto-restart loops
        useChatStore.getState().setPendingPrompt(null);

        // FULL RESET: highlights, lines, browser
        resetNodeStatuses();
        useBrowserStore.getState().resetBrowserState();
        useAppStore.getState().setShowPlaybookBrowser(false);

        setExecutionLogs(prev => [
            { id: uuidv4(), msg: 'System: Execution stopped by user.', type: 'error', time: '', timestamp: Date.now() },
            ...prev
        ]);
        toast.info('Execution stopped');
    };





    // Auto-reset statuses after execution finishes
    useEffect(() => {
        if (!isRunning && executionLogs.length > 1) {
            // Reset immediately when stopped/finished as per user request
            resetNodeStatuses();
        }
    }, [isRunning, resetNodeStatuses]);

    const playbookMeta = useMemo(() => ({
        description,
        version,
        capabilities,
        execution_defaults: defaults
    }), [description, version, capabilities, defaults]);

    if (isLoading) {
        return (
            <div className="flex-1 flex items-center justify-center bg-background">
                <CircularLoader className="h-8 w-8 text-primary" />
            </div>
        );
    }

    return (
        <div className="flex flex-col h-full bg-background no-drag">
            <PlaybookToolbar
                playbookName={playbookName}
                onNameChange={setPlaybookName}
                playbook={playbookMeta}
                onMetadataChange={(meta) => {
                    if (meta.description !== undefined) setDescription(meta.description || '');
                    if (meta.version !== undefined) setVersion(meta.version || '1.0.0');
                    if (meta.capabilities) setCapabilities(meta.capabilities);
                    if (meta.execution_defaults) setDefaults(meta.execution_defaults);
                }}
                onSave={handleSaveClick}
                onRun={handleRun}
                onStop={handleStop}
                isRunning={isRunning}
                onBack={onBack}
                onLayout={onLayout}
                layoutDirection={layoutDirection}
                saving={saving}
            />

            <div className="flex-1 flex overflow-hidden">
                <AnimatePresence initial={false}>
                    {!isRunning && !isSidebarCollapsed && (
                        <motion.div
                            initial={{ width: 0, opacity: 0 }}
                            animate={{ width: 280, opacity: 1 }}
                            exit={{ width: 0, opacity: 0 }}
                            transition={{ duration: 0.2, ease: 'easeInOut' }}
                            className="h-full flex-shrink-0 overflow-hidden border-r border-border/40 bg-card/30 backdrop-blur-sm"
                        >
                            <NodePalette />
                        </motion.div>
                    )}
                </AnimatePresence>

                <div className="flex-1 h-full relative" ref={reactFlowWrapper}>
                    {!isRunning && (
                        <Button
                            variant="ghost"
                            size="icon"
                            className="absolute top-4 left-4 z-[60] h-8 w-8 bg-card/80 backdrop-blur-md border border-border/50 shadow-sm hover:bg-muted"
                            onClick={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
                        >
                            {isSidebarCollapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
                        </Button>
                    )}
                    <ReactFlow
                        nodes={nodes}
                        edges={edges}
                        onNodesChange={onNodesChange}
                        onEdgesChange={onEdgesChange}
                        onConnect={onConnect}
                        onInit={setReactFlowInstance}
                        onDrop={onDrop}
                        onDragOver={onDragOver}
                        onNodeClick={onNodeClick}
                        onPaneClick={onPaneClick}
                        nodeTypes={nodeTypes}
                        isValidConnection={(connection) => connection.source !== connection.target}
                        // Lock interactivity during execution
                        nodesDraggable={!isRunning}
                        nodesConnectable={!isRunning}
                        elementsSelectable={!isRunning}
                        edgesFocusable={!isRunning}
                        nodesFocusable={!isRunning}
                        panOnDrag={true} // Allow panning with any button or touch
                        zoomOnScroll={true}
                        zoomOnDoubleClick={true}
                        defaultEdgeOptions={{
                            type: 'smoothstep',
                            animated: false,
                            reconnectable: !isRunning,
                            deletable: !isRunning,
                            style: { strokeWidth: 2, stroke: '#52525b' }, // Darker zinc-600 line
                            labelStyle: { fill: '#a1a1aa', fontWeight: 500, fontSize: 11 }, // Lighter text
                            labelBgStyle: { fill: '#18181b', stroke: '#27272a', strokeWidth: 1 }, // Dark bg (zinc-950) with border
                            labelBgPadding: [8, 4],
                            labelBgBorderRadius: 6,
                        }}
                        deleteKeyCode={isRunning ? null : ['Backspace', 'Delete']}
                        fitView
                        snapToGrid
                        selectionOnDrag={!isRunning}
                        selectionMode={SelectionMode.Partial}
                        className="bg-zinc-100 dark:bg-zinc-900/20"
                        proOptions={{ hideAttribution: true }}
                    >

                        <Background color="currentColor" className="opacity-[0.15] dark:opacity-[0.25]" gap={16} />
                        <Controls />
                    </ReactFlow>

                    {/* Simple Log Overlay */}
                    {executionLogs.length > 0 && (
                        <div className="absolute bottom-4 right-4 w-80 max-h-48 glass-panel z-50 overflow-hidden flex flex-col shadow-2xl border border-white/10 rounded-xl">
                            <div className="px-3 py-2 border-b border-white/5 bg-white/5 flex items-center justify-between">
                                <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Execution Logs</span>
                                <button
                                    onClick={() => setExecutionLogs([])}
                                    className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                                >
                                    Clear
                                </button>
                            </div>
                            <div className="p-3 overflow-y-auto space-y-2 font-mono text-[11px] scrollbar-thin">
                                {executionLogs.map(log => (
                                    <div key={log.id} className="flex gap-2 leading-tight">
                                        <span className="text-muted-foreground/40 shrink-0">
                                            {new Date(log.timestamp || Date.now()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                        </span>
                                        <span className={cn(
                                            "break-words",
                                            log.type === 'error' && "text-destructive",
                                            log.type === 'success' && "text-emerald-400",
                                            log.type === 'running' && "text-amber-400 animate-pulse",
                                            log.type === 'info' && "text-blue-400"
                                        )}>
                                            {log.msg}
                                        </span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>

                <AnimatePresence>
                    {selectedNode && (
                        <motion.div
                            initial={{ x: 320, opacity: 0 }}
                            animate={{ x: 0, opacity: 1 }}
                            exit={{ x: 320, opacity: 0 }}
                            transition={{ type: 'spring', stiffness: 300, damping: 30 }}
                            className="z-[100] h-full shadow-2xl relative"
                        >
                            <NodeConfigPanel
                                selectedNode={selectedNode}
                                nodes={nodes}
                                edges={edges}
                                onUpdate={updateNodeData}
                                onClose={() => setSelectedNode(null)}
                                onDelete={deleteNode}
                            />
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>
        </div>
    );
}

export function PlaybookEditor(props: PlaybookEditorProps) {
    return (
        <ReactFlowProvider>
            <TooltipProvider delayDuration={400}>
                <PlaybookEditorContent {...props} />
            </TooltipProvider>
        </ReactFlowProvider>
    );
}
