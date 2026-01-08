import { z } from 'zod';
import { DynamicStructuredTool } from '@langchain/core/tools';
import { supabase } from '../lib/supabase';

export interface PlaybookToolsContext {
    playbooks?: any[];
    supabaseClient?: any;
    workspaceId?: string;
    onPlaybookLoaded?: (playbook: any) => void;
}

export function createPlaybookTools(context?: PlaybookToolsContext): DynamicStructuredTool[] {
    const supabaseClient = context?.supabaseClient || supabase;
    const currentWorkspaceId = context?.workspaceId;

    const getPlaybooksTool = new DynamicStructuredTool({
        name: 'db_get_playbooks',
        description: 'Fetch all available playbooks. Use this to find a playbook to run or inspect.',
        schema: z.object({
            refresh: z.boolean().nullable().describe('Whether to refresh the list. Always pass true.').default(null)
        }),
        func: async () => {
            try {
                const user = await supabaseClient.auth.getUser();
                console.log('[Tool: db_get_playbooks] Execution Context:', {
                    hasContextPlaybooks: !!context?.playbooks,
                    contextCount: context?.playbooks?.length,
                    authUserId: user.data.user?.id,
                    isAuthenticated: !!user.data.user
                });

                // Return context playbooks if available, otherwise fetch from DB
                if (context?.playbooks && context.playbooks.length > 0) {
                    console.log('[Tool: db_get_playbooks] Returning from context');
                    return JSON.stringify({ success: true, playbooks: context.playbooks });
                }

                let query = supabaseClient
                    .from('playbooks')
                    .select('id, name, description, capabilities, created_at, updated_at');

                if (currentWorkspaceId) {
                    query = query.eq('workspace_id', currentWorkspaceId);
                }

                const { data, error } = await query
                    .order('updated_at', { ascending: false });

                if (error) {
                    console.error('[Tool: db_get_playbooks] DB Error:', error);
                    throw error;
                }

                console.log('[Tool: db_get_playbooks] DB Success. Count:', data?.length);
                return JSON.stringify({ success: true, playbooks: data });
            } catch (error: any) {
                return JSON.stringify({ success: false, error: error.message || String(error) });
            }
        },
    });

    const getPlaybookDetailsTool = new DynamicStructuredTool({
        name: 'db_get_playbook_details',
        description: 'Fetch detailed information about a specific playbook, including its graph (nodes and edges).',
        schema: z.object({
            id: z.string().describe('The ID of the playbook to fetch'),
        }),
        func: async ({ id }) => {
            try {
                const user = await supabaseClient.auth.getUser();
                console.log(`[Tool: db_get_playbook_details] Fetching ID: ${id}`, {
                    authUserId: user.data.user?.id,
                    hasContext: !!context?.playbooks
                });

                // Check context first
                if (context?.playbooks) {
                    const playbook = context.playbooks.find(p => p.id === id);
                    if (playbook) {
                        console.log('[Tool: db_get_playbook_details] Found in context');
                        if (context?.onPlaybookLoaded) context.onPlaybookLoaded(playbook);
                        return JSON.stringify({ success: true, playbook });
                    }
                }

                let query = supabaseClient
                    .from('playbooks')
                    .select('*')
                    .eq('id', id);

                if (currentWorkspaceId) {
                    query = query.eq('workspace_id', currentWorkspaceId);
                }

                const { data, error } = await query.maybeSingle();

                if (error) {
                    console.error('[Tool: db_get_playbook_details] DB Error:', error);
                    throw error;
                }
                if (!data) {
                    console.warn('[Tool: db_get_playbook_details] Playbook not found in DB');
                    return JSON.stringify({ success: false, error: 'Playbook not found' });
                }

                if (data && context?.onPlaybookLoaded) {
                    context.onPlaybookLoaded(data);
                }
                return JSON.stringify({ success: true, playbook: data });
            } catch (error: any) {
                return JSON.stringify({ success: false, error: error.message || String(error) });
            }
        },
    });

    const upsertPlaybookTool = new DynamicStructuredTool({
        name: 'db_save_playbook',
        description: 'Create or update a playbook. If id is empty string, it creates new. Use this to help the user build automation.',
        schema: z.object({
            id: z.string().nullable().describe('The ID to update, or empty string for new.').default(null),
            name: z.string().describe('Name of the playbook'),
            description: z.string().nullable().describe('Short description. Use empty string if none.').default(null),
            nodes_json: z.string().describe('The ReactFlow nodes array as a JSON string.'),
            edges_json: z.string().describe('The ReactFlow edges array as a JSON string.'),
            capabilities_json: z.string().nullable().describe('Capability requirements ({ browser: boolean, mcp: string[], external_api: string[] }) as a JSON string.').default(null),
            execution_defaults_json: z.string().nullable().describe('Execution settings ({ mode: "observe"|"draft"|"assist"|"auto", require_approval: boolean }) as a JSON string.').default(null),
        }),
        func: async (payload) => {
            try {
                const { data: { user } } = await supabaseClient.auth.getUser();
                if (!user) throw new Error('Not authenticated');

                const playbookData: any = {
                    name: payload.name,
                    description: payload.description,
                    graph: {
                        nodes: JSON.parse(payload.nodes_json || '[]'),
                        edges: JSON.parse(payload.edges_json || '[]')
                    },
                    capabilities: JSON.parse(payload.capabilities_json || '{}'),
                    execution_defaults: JSON.parse(payload.execution_defaults_json || '{}'),
                    user_id: user.id,
                    workspace_id: currentWorkspaceId,
                    updated_at: new Date().toISOString(),
                };

                let result;
                if (payload.id && payload.id !== '') {
                    let updateQuery = supabaseClient
                        .from('playbooks')
                        .update(playbookData)
                        .eq('id', payload.id);

                    if (currentWorkspaceId) {
                        updateQuery = updateQuery.eq('workspace_id', currentWorkspaceId);
                    }

                    result = await updateQuery
                        .select()
                        .single();
                } else {
                    result = await supabaseClient
                        .from('playbooks')
                        .insert([{
                            ...playbookData,
                            version: '1.0.0',
                            visibility: 'private'
                        }])
                        .select()
                        .single();
                }

                if (result.error) throw result.error;
                return JSON.stringify({ success: true, playbook: result.data });
            } catch (error: any) {
                return JSON.stringify({ success: false, error: error.message || String(error) });
            }
        },
    });

    const deletePlaybookTool = new DynamicStructuredTool({
        name: 'db_delete_playbook',
        description: 'Delete a playbook by ID.',
        schema: z.object({
            id: z.string().describe('The ID of the playbook to delete'),
        }),
        func: async ({ id }) => {
            try {
                let deleteQuery = supabaseClient
                    .from('playbooks')
                    .delete()
                    .eq('id', id);

                if (currentWorkspaceId) {
                    deleteQuery = deleteQuery.eq('workspace_id', currentWorkspaceId);
                }

                const { error } = await deleteQuery;

                if (error) throw error;
                return JSON.stringify({ success: true });
            } catch (error: any) {
                return JSON.stringify({ success: false, error: error.message || String(error) });
            }
        },
    });

    const humanApprovalTool = new DynamicStructuredTool({
        name: 'human_approval',
        description: 'Pause execution and wait for human approval. Use this when a playbook node requires manual confirmation before proceeding to potentially sensitive actions.',
        schema: z.object({
            message: z.string().nullable().describe('A message explaining what needs approval.').default('Manual approval required to proceed.')
        }),
        func: async ({ message }) => {
            return JSON.stringify({
                success: true,
                message: `Approval Required: ${message}`,
                needs_hitl: true
            });
        },
    });

    const agentPauseTool = new DynamicStructuredTool({
        name: 'agent_pause',
        description: 'Pause the agent execution. Use this to allow the user to take over or inspect the state.',
        schema: z.object({
            reason: z.string().nullable().describe('Reason for pausing.').default(null)
        }),
        func: async ({ reason }) => {
            return JSON.stringify({
                success: true,
                message: `Agent Paused${reason ? ': ' + reason : ''}`,
                needs_hitl: true,
                variant: 'pause'
            });
        },
    });

    const reportPlaybookNodeStatusTool = new DynamicStructuredTool({
        name: 'report_playbook_node_status',
        description: 'Report the execution status of a specific node in a playbook. YOU MUST CALL THIS before starting a node action (status="running") and after finishing (status="success" or "error").',
        schema: z.object({
            nodeId: z.string().describe('The ID of the node currently being executed'),
            status: z.enum(['running', 'success', 'error']).describe('The current status of the node'),
            message: z.string().nullable().describe('Optional message or output summary').default(null)
        }),
        func: async ({ nodeId, status, message }) => {
            // This tool is primarily for side-effects (UI updates)
            // The actual logic is handled in the main process event loop which intercepts this tool
            return JSON.stringify({
                success: true,
                message: `Node ${nodeId} status reported: ${status}`
            });
        },
    });

    return [getPlaybooksTool, getPlaybookDetailsTool, upsertPlaybookTool, deletePlaybookTool, humanApprovalTool, agentPauseTool, reportPlaybookNodeStatusTool];
}
