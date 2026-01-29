import { z } from 'zod';
import { DynamicStructuredTool } from '@langchain/core/tools';
import { supabase } from '../lib/supabase';
import { taskQueueService } from './task-queue.service';

export interface TargetToolsContext {
    targetLists?: any[];
    supabaseClient?: any;
    workspaceId?: string;
    taskQueueService?: any;
}

export function createTargetTools(context?: TargetToolsContext): DynamicStructuredTool[] {
    const supabaseClient = context?.supabaseClient || supabase;
    const currentWorkspaceId = context?.workspaceId;
    const activeTaskQueueService = context?.taskQueueService || taskQueueService;
    // Authorized Supabase client

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
                const finalLimit = limit || 20;
                const finalOffset = offset || 0;
                let data: any[] = [];
                let count = 0;
                let listName = null;

                if (list_id && list_id.trim() !== '') {
                    // Strategy 1: Fetch via assignments (Junction Table)
                    // This is the most reliable way to get targets in a specific list
                    const { data: assignments, count: total, error } = await supabaseClient
                        .from('target_assignments')
                        .select('target:targets!target_assignments_target_id_fkey(*)', { count: 'exact' })
                        .eq('list_id', list_id)
                        .order('created_at', { ascending: false })
                        .range(finalOffset, finalOffset + finalLimit - 1);

                    if (error) throw error;

                    // Unwraps the target object from the assignment
                    data = (assignments || []).map((a: any) => a.target).filter(Boolean);
                    count = total || 0;

                    // Fetch list name for friendly display
                    const { data: listData } = await supabaseClient
                        .from('target_lists')
                        .select('name')
                        .eq('id', list_id)
                        .maybeSingle();

                    if (listData) {
                        listName = listData.name;
                    }

                } else {
                    // Strategy 2: Fetch all targets in workspace
                    // Direct query on targets table is simpler and avoids ambiguous joins
                    let query = supabaseClient.from('targets').select('*', { count: 'exact' });

                    if (currentWorkspaceId) {
                        // Targets table has workspace_id, so we can filter directly
                        query = query.eq('workspace_id', currentWorkspaceId);
                    }

                    const { data: targets, count: total, error } = await query
                        .order('created_at', { ascending: false })
                        .range(finalOffset, finalOffset + finalLimit - 1);

                    if (error) throw error;
                    data = targets || [];
                    count = total || 0;
                }

                return JSON.stringify({
                    success: true,
                    targets: data,
                    total: count,
                    limit: finalLimit,
                    offset: finalOffset,
                    list_name: listName
                });
            } catch (error: any) {
                console.error('db_get_targets error:', error);
                const errorMsg = error?.message || (typeof error === 'object' ? JSON.stringify(error) : String(error));
                return JSON.stringify({ success: false, error: errorMsg });
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
                console.error('db_get_target_lists error:', error);
                const errorMsg = error?.message || (typeof error === 'object' ? JSON.stringify(error) : String(error));
                return JSON.stringify({ success: false, error: errorMsg });
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
                console.error('db_create_target_list error:', error);
                const errorMsg = error?.message || (typeof error === 'object' ? JSON.stringify(error) : String(error));
                return JSON.stringify({ success: false, error: errorMsg });
            }
        },
    });

    const createTargetTool = new DynamicStructuredTool({
        name: 'db_create_target',
        description: 'Add a single specific target (person/post/company). CRITICAL: Do NOT use this for search results or bulk data; use capture_leads_bulk instead.',
        schema: z.object({
            list_id: z.string().nullable().describe('The ID of the target list. Pass null or empty string if not in a list.').default(null),
            name: z.string().describe('Name of the target'),
            url: z.string().describe('URL of the target (e.g., profile URL)'),
            type: z.string().describe('Type of target (person, post, company). Use "person" as default.'),
            metadata_json: z.union([z.string(), z.record(z.any())]).nullable().describe('Metadata fields as a JSON string or object.').default(null),
        }),
        func: async (payload) => {
            try {
                const { metadata_json, list_id, ...rest } = payload;
                const { data: { user } } = await supabaseClient.auth.getUser();
                if (!user) throw new Error('Not authenticated');

                let finalWorkspaceId = currentWorkspaceId;
                if (list_id && list_id.trim().length > 10) {
                    const { data: listData } = await supabaseClient
                        .from('target_lists')
                        .select('workspace_id')
                        .eq('id', list_id)
                        .single();
                    if (listData?.workspace_id) finalWorkspaceId = listData.workspace_id;
                }

                const metadata = typeof metadata_json === 'string'
                    ? JSON.parse(metadata_json || '{}')
                    : (metadata_json || {});

                const upsertData: any = {
                    ...rest,
                    metadata,
                    user_id: user.id,
                    workspace_id: finalWorkspaceId
                };

                const { data, error } = await supabaseClient
                    .from('targets')
                    .upsert([upsertData], { onConflict: 'url, workspace_id' })
                    .select()
                    .single();

                if (error) throw error;

                // Handle assignment if list_id is provided
                if (list_id && list_id.trim().length > 10) {
                    await supabaseClient
                        .from('target_assignments')
                        .upsert([{ target_id: data.id, list_id: list_id }], { onConflict: 'target_id, list_id' });

                    // Auto-queue for profile analysis if enabled for workspace
                    try {
                        if (finalWorkspaceId) {
                            const { data: ws } = await supabaseClient.from('workspaces').select('auto_profile_analysis').eq('id', finalWorkspaceId).single();
                            if (ws?.auto_profile_analysis && data.type === 'person') {
                                await activeTaskQueueService.addTask(finalWorkspaceId, user.id, 'profile_analysis', {
                                    url: data.url,
                                    target_id: data.id,
                                    username: data.name
                                });
                            }
                        }
                    } catch (autoErr) {
                        console.error('Auto-queue failed:', autoErr);
                    }
                }

                return JSON.stringify({ success: true, target: data });
            } catch (error: any) {
                console.error('db_create_target error:', error);
                const errorMsg = error?.message || (typeof error === 'object' ? JSON.stringify(error) : String(error));
                return JSON.stringify({ success: false, error: errorMsg });
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
            metadata_json: z.union([z.string(), z.record(z.any())]).nullable().describe('Key-value pairs to merge into existing metadata as a JSON string or object. Pass "{}" if no change.').default(null),
        }),
        func: async ({ id, status, last_interaction_at, metadata_json }) => {
            try {
                const updates: any = {};
                if (status) updates.status = status;
                if (last_interaction_at) updates.last_interaction_at = last_interaction_at;

                const metadata = typeof metadata_json === 'string'
                    ? JSON.parse(metadata_json || '{}')
                    : (metadata_json || {});
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
            } catch (error: any) {
                console.error('db_update_target error:', error);
                const errorMsg = error?.message || (typeof error === 'object' ? JSON.stringify(error) : String(error));
                return JSON.stringify({ success: false, error: errorMsg });
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

                // 1. Resolve workspace_id for the list to ensure correct scoping
                const { data: listData } = await supabaseClient
                    .from('target_lists')
                    .select('workspace_id')
                    .eq('id', targetListId)
                    .single();

                const finalWorkspaceId = listData?.workspace_id || currentWorkspaceId;

                const dataToUpsert = leads.map(l => ({
                    workspace_id: finalWorkspaceId,
                    name: l.name,
                    url: l.url,
                    type: l.type,
                    metadata: l.metadata,
                    user_id: user.id
                    // Note: We don't include list_id here because we'll handle assignments explicitly
                    // to support targets existing in multiple lists.
                }));

                // 2. Perform Upsert to handle "unique_target_url_per_workspace"
                const { data: upsertedTargets, error: upsertError } = await supabaseClient
                    .from('targets')
                    .upsert(dataToUpsert, {
                        onConflict: 'url, workspace_id',
                        ignoreDuplicates: false // Updates metadata if user exists
                    })
                    .select('id, url, name, type');

                if (upsertError) throw upsertError;

                // 3. Ensure assignments in the junction table
                if (upsertedTargets && upsertedTargets.length > 0) {
                    const assignments = upsertedTargets.map((t: any) => ({
                        target_id: t.id,
                        list_id: targetListId
                    }));

                    const { error: assignError } = await supabaseClient
                        .from('target_assignments')
                        .upsert(assignments, { onConflict: 'target_id, list_id' });

                    if (assignError) {
                        console.error('Assignment error after bulk capture:', assignError);
                    }
                }

                // 4. Auto-queue for profile analysis if enabled for workspace
                try {
                    if (finalWorkspaceId) {
                        const { data: ws } = await supabaseClient.from('workspaces').select('auto_profile_analysis').eq('id', finalWorkspaceId).single();
                        if (ws?.auto_profile_analysis) {
                            for (const target of upsertedTargets || []) {
                                if (target.type === 'person') {
                                    await activeTaskQueueService.addTask(finalWorkspaceId, user.id, 'profile_analysis', {
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

                return JSON.stringify({
                    success: true,
                    count: upsertedTargets?.length || 0,
                    message: `Successfully captured ${upsertedTargets?.length} leads. Existing targets were updated and added to the list.`
                });
            } catch (error: any) {
                console.error('capture_leads_bulk error:', error);
                const errorMsg = error?.message || (typeof error === 'object' ? JSON.stringify(error) : String(error));
                return JSON.stringify({ success: false, error: errorMsg });
            }
        }
    });

    return [getTargetsTool, getTargetListsTool, createTargetListTool, createTargetTool, updateTargetMetadataTool, captureLeadsBulkTool];
}
