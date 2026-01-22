import { z } from 'zod';
import { DynamicStructuredTool } from '@langchain/core/tools';
import { supabase } from '../lib/supabase';

export interface TargetToolsContext {
    targetLists?: any[];
    supabaseClient?: any;
    workspaceId?: string;
}

export function createTargetTools(context?: TargetToolsContext): DynamicStructuredTool[] {
    const supabaseClient = context?.supabaseClient || supabase;
    const currentWorkspaceId = context?.workspaceId;

    const getTargetsTool = new DynamicStructuredTool({
        name: 'db_get_targets',
        description: 'Fetch targets from a specific target list. use the offset to paginate and get more targets.',
        schema: z.object({
            list_id: z.string().nullable().describe('Filter by specific target list ID, or empty string for all.').default(null),
            limit: z.number().nullable().describe('Number of targets to fetch. Use 20 as default.').default(null),
            offset: z.number().nullable().describe('Number of targets to skip. Use 0 as default.').default(null),
        }),
        func: async ({ list_id, limit, offset }) => {
            try {
                // Join with target_lists to filter by workspace since targets doesn't have workspace_id
                let query = supabaseClient.from('targets').select('*, target_lists!inner(workspace_id)', { count: 'exact' });

                if (currentWorkspaceId) {
                    query = query.eq('target_lists.workspace_id', currentWorkspaceId);
                }

                let listName = null;

                if (list_id && list_id.trim() !== '') {
                    query = query.eq('list_id', list_id);

                    // Fetch list name for friendly display
                    let listQuery = supabaseClient
                        .from('target_lists')
                        .select('name')
                        .eq('id', list_id);

                    if (currentWorkspaceId) {
                        listQuery = listQuery.eq('workspace_id', currentWorkspaceId);
                    }

                    const { data: listData } = await listQuery.single();

                    if (listData) {
                        listName = listData.name;
                    }
                }

                const finalLimit = limit || 20;
                const finalOffset = offset || 0;

                const { data, count, error } = await query
                    .order('created_at', { ascending: false })
                    .range(finalOffset, finalOffset + finalLimit - 1);

                if (error) throw error;
                return JSON.stringify({
                    success: true,
                    targets: data,
                    total: count,
                    limit: finalLimit,
                    offset: finalOffset,
                    list_name: listName
                });
            } catch (error: any) {
                return JSON.stringify({ success: false, error: error.message || String(error) });
            }
        },
    });

    const getTargetListsTool = new DynamicStructuredTool({
        name: 'db_get_target_lists',
        description: 'Fetch all available target lists. Use this to discover which lists exist.',
        schema: z.object({
            refresh: z.boolean().describe('Whether to refresh. Always pass true.')
        }),
        func: async () => {
            try {
                // Check context first
                if (context?.targetLists && context.targetLists.length > 0) {
                    return JSON.stringify({ success: true, lists: context.targetLists });
                }

                let query = supabaseClient
                    .from('target_lists')
                    .select('*');

                if (currentWorkspaceId) {
                    query = query.eq('workspace_id', currentWorkspaceId);
                }

                const { data, error } = await query
                    .order('created_at', { ascending: false });

                if (error) throw error;
                return JSON.stringify({ success: true, lists: data });
            } catch (error: any) {
                return JSON.stringify({ success: false, error: error.message || String(error) });
            }
        },
    });

    const createTargetListTool = new DynamicStructuredTool({
        name: 'db_create_target_list',
        description: 'Create a new target list to group targets.',
        schema: z.object({
            name: z.string().describe('The name of the list'),
            description: z.string().nullable().describe('Description of the list. Pass empty string if none.').default(null),
        }),
        func: async ({ name, description }) => {
            try {
                const { data: { user } } = await supabaseClient.auth.getUser();
                if (!user) throw new Error('Not authenticated');

                let finalWorkspaceId = currentWorkspaceId;

                // Fallback: If no workspace ID found in context, try to find the user's default workspace
                if (!finalWorkspaceId) {
                    const { data: member } = await supabaseClient
                        .from('workspace_members')
                        .select('workspace_id')
                        .eq('user_id', user.id)
                        .order('created_at', { ascending: true })
                        .limit(1)
                        .maybeSingle();

                    if (member) {
                        finalWorkspaceId = member.workspace_id;
                    }
                }

                if (finalWorkspaceId) {
                    const { data: existingList } = await supabaseClient
                        .from('target_lists')
                        .select('*')
                        .eq('workspace_id', finalWorkspaceId)
                        .eq('name', name)
                        .maybeSingle();

                    if (existingList) {
                        return JSON.stringify({
                            success: true,
                            list: existingList,
                            message: "Found existing list with same name, using it to consolidate targets."
                        });
                    }
                }

                const { data, error } = await supabaseClient
                    .from('target_lists')
                    .insert([{ name, description, user_id: user.id, workspace_id: finalWorkspaceId }])
                    .select()
                    .single();

                if (error) throw error;
                return JSON.stringify({ success: true, list: data });
            } catch (error: any) {
                return JSON.stringify({ success: false, error: error.message || String(error) });
            }
        },
    });

    const createTargetTool = new DynamicStructuredTool({
        name: 'db_create_target',
        description: 'Add a new target (person/post/company) to a target list.',
        schema: z.object({
            list_id: z.string().describe('The ID of the target list'),
            name: z.string().describe('Name of the target'),
            url: z.string().describe('URL of the target (e.g., profile URL)'),
            type: z.string().describe('Type of target (person, post, company). Use "person" as default.'),
            metadata_json: z.string().nullable().describe('Metadata fields as a JSON string. Pass "{}" if none.').default(null),
        }),
        func: async (payload) => {
            try {
                const { metadata_json, ...rest } = payload;
                const metadata = JSON.parse(metadata_json || '{}');
                const { data: { user } } = await supabaseClient.auth.getUser();
                if (!user) throw new Error('Not authenticated');

                const { data, error } = await supabaseClient
                    .from('targets')
                    .insert([{ ...rest, metadata, user_id: user.id }])
                    .select()
                    .single();

                if (error) throw error;

                // Auto-queue for profile analysis if enabled for workspace
                try {
                    const { data: list } = await supabaseClient.from('target_lists').select('workspace_id').eq('id', data.list_id).single();
                    if (list?.workspace_id) {
                        const { data: ws } = await supabaseClient.from('workspaces').select('auto_profile_analysis').eq('id', list.workspace_id).single();
                        if (ws?.auto_profile_analysis && data.type === 'person') {
                            const { taskQueueService } = require('./task-queue.service');
                            await taskQueueService.addTask(list.workspace_id, user.id, 'profile_analysis', {
                                url: data.url,
                                target_id: data.id,
                                username: data.name
                            });
                        }
                    }
                } catch (autoErr) {
                    console.error('Auto-queue failed:', autoErr);
                }

                return JSON.stringify({ success: true, target: data });
            } catch (error) {
                return JSON.stringify({ success: false, error: String(error) });
            }
        },
    });

    const updateTargetMetadataTool = new DynamicStructuredTool({
        name: 'db_update_target',
        description: 'Update a targets metadata or status. Use this after an interaction.',
        schema: z.object({
            id: z.string().describe('The ID of the target to update'),
            status: z.string().nullable().describe('New status (e.g., "contacted", "engaged", "converted"). Pass empty string if no change.').default(null),
            last_interaction_at: z.string().nullable().describe('ISO timestamp of the interaction. Pass empty string if no change.').default(null),
            metadata_json: z.string().nullable().describe('Key-value pairs to merge into existing metadata as a JSON string. Pass "{}" if no change.').default(null),
        }),
        func: async ({ id, status, last_interaction_at, metadata_json }) => {
            try {
                const updates: any = {};
                if (status) updates.status = status;
                if (last_interaction_at) updates.last_interaction_at = last_interaction_at;

                const metadata = JSON.parse(metadata_json || '{}');
                // First get existing metadata to merge
                if (metadata && Object.keys(metadata).length > 0) {
                    const { data: existing } = await supabaseClient.from('targets').select('metadata').eq('id', id).single();
                    updates.metadata = { ...(existing?.metadata || {}), ...metadata };
                }

                let updateQuery = supabaseClient
                    .from('targets')
                    .update(updates)
                    .eq('id', id);

                // Removed workspace_id check as the column doesn't exist on targets
                // if (currentWorkspaceId) {
                //     updateQuery = updateQuery.eq('workspace_id', currentWorkspaceId);
                // }

                const { data, error } = await updateQuery
                    .select()
                    .single();

                if (error) throw error;
                return JSON.stringify({ success: true, target: data });
            } catch (error) {
                return JSON.stringify({ success: false, error: String(error) });
            }
        },
    });

    const captureLeadsBulkTool = new DynamicStructuredTool({
        name: 'capture_leads_bulk',
        description: 'Save multiple leads (people, posts, or companies) from X (Twitter) or other websites into a target list in a single operation.',
        schema: z.object({
            targetListId: z.string().describe('The ID of the target list where leads will be saved'),
            leads: z.array(z.object({
                name: z.string().describe('The name of the person, company, or post title'),
                url: z.string().describe('The direct URL to the profile or content'),
                type: z.enum(['person', 'post', 'company', 'other']).describe('The category of this target').default('person'),
                metadata: z.record(z.any()).optional().describe('Strategic details like headline, location, description, follower count, etc.').default({}),
            })).describe('The list of leads to capture')
        }),
        func: async ({ targetListId, leads }) => {
            try {
                const { data: { user } } = await supabaseClient.auth.getUser();
                if (!user) throw new Error('Not authenticated');

                const dataToInsert = leads.map(l => ({
                    list_id: targetListId,
                    name: l.name,
                    url: l.url,
                    type: l.type,
                    metadata: l.metadata,
                    user_id: user.id
                    // workspace_id: currentWorkspaceId // Column doesn't exist on targets
                }));

                const { data, error } = await supabaseClient
                    .from('targets')
                    .insert(dataToInsert)
                    .select();

                if (error) throw error;

                // Auto-queue for profile analysis if enabled for workspace
                try {
                    const { data: list } = await supabaseClient.from('target_lists').select('workspace_id').eq('id', targetListId).single();
                    if (list?.workspace_id) {
                        const { data: ws } = await supabaseClient.from('workspaces').select('auto_profile_analysis').eq('id', list.workspace_id).single();
                        if (ws?.auto_profile_analysis) {
                            const { taskQueueService } = require('./task-queue.service');
                            for (const target of data || []) {
                                if (target.type === 'person') {
                                    await taskQueueService.addTask(list.workspace_id, user.id, 'profile_analysis', {
                                        url: target.url,
                                        target_id: target.id,
                                        username: target.name
                                    });
                                }
                            }
                        }
                    }
                } catch (autoErr) {
                    console.error('Auto-queue bulk failed:', autoErr);
                }

                return JSON.stringify({ success: true, count: data?.length || 0, message: `Successfully captured ${data?.length} leads.` });
            } catch (error: any) {
                return JSON.stringify({ success: false, error: error.message || String(error) });
            }
        }
    });

    return [getTargetsTool, getTargetListsTool, createTargetListTool, createTargetTool, updateTargetMetadataTool, captureLeadsBulkTool];
}
