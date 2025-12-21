import { z } from 'zod';
import { DynamicStructuredTool } from '@langchain/core/tools';
import { supabase } from '../lib/supabase';

export function createTargetTools(context?: { targetLists?: any[], supabaseClient?: any }): DynamicStructuredTool[] {
    const supabaseClient = context?.supabaseClient || supabase;

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
                let query = supabaseClient.from('targets').select('*', { count: 'exact' });
                let listName = null;

                if (list_id && list_id.trim() !== '') {
                    query = query.eq('list_id', list_id);

                    // Fetch list name for friendly display
                    const { data: listData } = await supabaseClient
                        .from('target_lists')
                        .select('name')
                        .eq('id', list_id)
                        .single();

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

                const { data, error } = await supabaseClient
                    .from('target_lists')
                    .select('*')
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
                const { data: { user } } = await supabase.auth.getUser();
                if (!user) throw new Error('Not authenticated');

                const { data, error } = await supabase
                    .from('target_lists')
                    .insert([{ name, description, user_id: user.id }])
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
            url: z.string().describe('URL of the target (e.g., LinkedIn profile URL)'),
            type: z.string().describe('Type of target (person, post, company). Use "person" as default.'),
            metadata_json: z.string().nullable().describe('Metadata fields as a JSON string. Pass "{}" if none.').default(null),
        }),
        func: async (payload) => {
            try {
                const { metadata_json, ...rest } = payload;
                const metadata = JSON.parse(metadata_json || '{}');
                const { data: { user } } = await supabase.auth.getUser();
                if (!user) throw new Error('Not authenticated');

                const { data, error } = await supabase
                    .from('targets')
                    .insert([{ ...rest, metadata, user_id: user.id }])
                    .select()
                    .single();

                if (error) throw error;
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
                    const { data: existing } = await supabase.from('targets').select('metadata').eq('id', id).single();
                    updates.metadata = { ...(existing?.metadata || {}), ...metadata };
                }

                const { data, error } = await supabase
                    .from('targets')
                    .update(updates)
                    .eq('id', id)
                    .select()
                    .single();

                if (error) throw error;
                return JSON.stringify({ success: true, target: data });
            } catch (error) {
                return JSON.stringify({ success: false, error: String(error) });
            }
        },
    });

    return [getTargetsTool, getTargetListsTool, createTargetListTool, createTargetTool, updateTargetMetadataTool];
}
