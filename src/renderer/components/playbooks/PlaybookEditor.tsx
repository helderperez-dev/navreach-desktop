
import { useCallback, useEffect, useRef, useState } from 'react';
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
const initialDefaults: PlaybookExecutionDefaults = { mode: 'observe', require_approval: true };

function PlaybookEditorContent({ playbookId, onBack }: PlaybookEditorProps) {
    const reactFlowWrapper = useRef<HTMLDivElement>(null);
    const [nodes, setNodes, onNodesChange] = useNodesState([]);
    const [edges, setEdges, onEdgesChange] = useEdgesState([]);
    const [reactFlowInstance, setReactFlowInstance] = useState<any>(null);

    const [playbookName, setPlaybookName] = useState('New Playbook');
    const [description, setDescription] = useState('');
    const [capabilities, setCapabilities] = useState<PlaybookCapabilities>(initialCapabilities);
    const [defaults, setDefaults] = useState<PlaybookExecutionDefaults>(initialDefaults);

    const [selectedNode, setSelectedNode] = useState<any>(null);
    const [saving, setSaving] = useState(false);

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

    const loadPlaybook = async (id: string) => {
        try {
            const data = await playbookService.getPlaybookById(id);
            if (data) {
                setPlaybookName(data.name);
                setDescription(data.description);
                setCapabilities(data.capabilities);
                setDefaults(data.execution_defaults);
                if (data.graph) {
                    setNodes(data.graph.nodes || []);
                    setEdges(data.graph.edges || []);
                    // Viewport restore handled by RF if we saved it, but we can iterate later
                }
            }
        } catch (error) {
            toast.error('Failed to load playbook');
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

            // Normalize data: Some JSONs might have nodes/edges at root, others inside 'graph'
            const nodesToImport = data.graph?.nodes || data.nodes;
            const edgesToImport = data.graph?.edges || data.edges;

            if (!Array.isArray(nodesToImport)) return;

            // Determine if this is a "Full Playbook" (Replacement) or "Partial Nodes" (Merge)
            // It's a full replacement if it has playbook metadata OR we are clicking on an empty/new canvas
            const isFullPlaybook = !!(data.graph || data.capabilities || data.name || (nodes.length <= 2 && nodes.every(n => n.type === 'start' || n.type === 'end')));

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

                // Auto-fit view after state registers
                setTimeout(() => reactFlowInstance?.fitView({ duration: 800 }), 100);
                return;
            }

            // Scenario 2: Partial Paste (Merge with existing)
            let filteredNodes = nodesToImport;
            const hasStart = nodes.some(n => n.type === 'start');
            const hasEnd = nodes.some(n => n.type === 'end');

            filteredNodes = filteredNodes.filter((n: any) => {
                if (n.type === 'start' && hasStart) return false;
                if (n.type === 'end' && hasEnd) return false;
                return true;
            });

            if (filteredNodes.length === 0) {
                toast.error('Could not paste: Start/End nodes already exist');
                return;
            }

            // Generate new IDs and offset position
            const idMap: Record<string, string> = {};
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

            setNodes((nds) => nds.map((n) => ({ ...n, selected: false })).concat(newNodes));
            setEdges((eds) => eds.map((e) => ({ ...e, selected: false })).concat(newEdges));

            toast.success(`Pasted ${newNodes.length} nodes`);
        } catch (e) {
            console.error('Paste error:', e);
        }
    }, [nodes, reactFlowInstance, setNodes, setEdges, setPlaybookName, setDescription, setCapabilities, setDefaults]);

    useEffect(() => {
        window.addEventListener('paste', onPaste);
        window.addEventListener('copy', onCopy);
        return () => {
            window.removeEventListener('paste', onPaste);
            window.removeEventListener('copy', onCopy);
        };
    }, [onPaste, onCopy]);

    const onLayout = useCallback(() => {
        const dagreGraph = new dagre.graphlib.Graph();
        dagreGraph.setDefaultEdgeLabel(() => ({}));

        // Layout settings
        const nodeWidth = 260;
        const nodeHeight = 160;

        dagreGraph.setGraph({ rankdir: 'LR', nodesep: 50, ranksep: 100 });

        nodes.forEach((node) => {
            dagreGraph.setNode(node.id, { width: nodeWidth, height: nodeHeight });
        });

        edges.forEach((edge) => {
            dagreGraph.setEdge(edge.source, edge.target);
        });

        dagre.layout(dagreGraph);

        const layoutedNodes = nodes.map((node) => {
            const nodeWithPosition = dagreGraph.node(node.id);
            return {
                ...node,
                position: {
                    x: nodeWithPosition.x - nodeWidth / 2,
                    y: nodeWithPosition.y - nodeHeight / 2,
                },
            };
        });

        setNodes(layoutedNodes);

        // Fit view after layout
        setTimeout(() => reactFlowInstance?.fitView({ duration: 800 }), 50);
    }, [nodes, edges, reactFlowInstance, setNodes]);

    const handleSave = async () => {
        // Validate
        const startNode = nodes.find(n => n.type === 'start');
        const endNode = nodes.find(n => n.type === 'end');
        if (!startNode || !endNode) {
            toast.error('Playbook must have a Start and End node.');
            return;
        }

        setSaving(true);
        try {
            const payload = {
                name: playbookName,
                description,
                graph: { nodes, edges },
                capabilities,
                execution_defaults: defaults
            };

            if (playbookId) {
                await playbookService.updatePlaybook(playbookId, payload);
                toast.success('Playbook updated');
            } else {
                const created = await playbookService.createPlaybook({
                    ...payload,
                    name: playbookName, // ensure name is passed
                    description: description || '',
                } as any);
                // In a real app we might redirect or update ID
                toast.success('Playbook created');
                if (created?.id) {
                    // Might handle ID update if we stay on page
                }
                onBack(); // Return to list for now
            }
        } catch (error) {
            toast.error('Failed to save playbook');
            console.error(error);
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="flex flex-col h-full bg-background no-drag">
            <PlaybookToolbar
                playbookName={playbookName}
                onNameChange={setPlaybookName}
                playbook={{ capabilities, execution_defaults: defaults }}
                onMetadataChange={(meta) => {
                    if (meta.capabilities) setCapabilities(meta.capabilities);
                    if (meta.execution_defaults) setDefaults(meta.execution_defaults);
                }}
                onSave={handleSave}
                onBack={onBack}
                onLayout={onLayout}
                saving={saving}
            />

            <div className="flex-1 flex overflow-hidden">
                <NodePalette />

                <div className="flex-1 h-full relative" ref={reactFlowWrapper}>
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
                        defaultEdgeOptions={{
                            type: 'smoothstep',
                            animated: false,
                            reconnectable: true,
                            deletable: true,
                            style: { strokeWidth: 2 }
                        }}
                        deleteKeyCode={['Backspace', 'Delete']}
                        fitView
                        snapToGrid
                        selectionOnDrag
                        selectionMode={SelectionMode.Partial}
                        panOnDrag={[1, 2]}
                        className="bg-muted/5"
                        proOptions={{ hideAttribution: true }}
                    >
                        <Background color="#555" gap={16} />
                        <Controls />
                    </ReactFlow>
                </div>

                {selectedNode && (
                    <NodeConfigPanel
                        selectedNode={selectedNode}
                        nodes={nodes}
                        edges={edges}
                        onUpdate={updateNodeData}
                        onClose={() => setSelectedNode(null)}
                        onDelete={deleteNode}
                    />
                )}
            </div>
        </div>
    );
}

export function PlaybookEditor(props: PlaybookEditorProps) {
    return (
        <ReactFlowProvider>
            <PlaybookEditorContent {...props} />
        </ReactFlowProvider>
    );
}
