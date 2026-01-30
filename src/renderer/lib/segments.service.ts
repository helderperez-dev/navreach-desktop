import { supabase } from './supabase';
import { TargetSegment, CreateSegmentInput, FilterCondition } from '@/types/segments';
import { Target } from '@/types/targets';

export const segmentService = {
    async getSegments(workspaceId: string) {
        const { data, error } = await supabase
            .from('target_segments')
            .select('*')
            .eq('workspace_id', workspaceId)
            .order('created_at', { ascending: false });

        return { data: data as TargetSegment[], error };
    },

    async createSegment(workspaceId: string, userId: string, input: CreateSegmentInput) {
        const { data, error } = await supabase
            .from('target_segments')
            .insert([{
                ...input,
                workspace_id: workspaceId,
                user_id: userId
            }])
            .select()
            .single();

        return { data: data as TargetSegment, error };
    },

    async updateSegment(id: string, updates: Partial<CreateSegmentInput>) {
        const { data, error } = await supabase
            .from('target_segments')
            .update(updates)
            .eq('id', id)
            .select()
            .single();

        return { data: data as TargetSegment, error };
    },

    async deleteSegment(id: string) {
        const { error } = await supabase
            .from('target_segments')
            .delete()
            .eq('id', id);

        return { error };
    },

    async getTargetsByFilters(workspaceId: string, filters: FilterCondition[], match_type: 'all' | 'any' = 'all', offset = 0, limit = 50) {
        let query = supabase
            .from('targets')
            .select('*, assignments:target_assignments!target_assignments_target_id_fkey(list_id, target_lists!target_assignments_list_id_fkey(name))')
            .eq('workspace_id', workspaceId);

        if (filters.length > 0) {
            if (match_type === 'any') {
                const orConditions: string[] = [];

                filters.forEach(filter => {
                    const { field, operator, value, metadataKey } = filter;
                    let targetField = field;
                    if (field === 'metadata' && metadataKey) {
                        targetField = `metadata->>${metadataKey}`;
                    }

                    switch (operator) {
                        case 'equals':
                            orConditions.push(`${targetField}.eq.${value}`);
                            break;
                        case 'not_equals':
                            orConditions.push(`${targetField}.neq.${value}`);
                            break;
                        case 'contains':
                            orConditions.push(`${targetField}.ilike.*${value}*`);
                            break;
                        case 'not_contains':
                            // NOT ILIKE is tricky in OR strings, might need a different approach or skip for now if too complex
                            // For now, let's use the standard PostgREST syntax if possible
                            break;
                        case 'starts_with':
                            orConditions.push(`${targetField}.ilike.${value}*`);
                            break;
                        case 'ends_with':
                            orConditions.push(`${targetField}.ilike.*${value}`);
                            break;
                        case 'is_empty':
                            orConditions.push(`${targetField}.is.null`);
                            orConditions.push(`${targetField}.eq.""`);
                            break;
                        case 'is_not_empty':
                            orConditions.push(`${targetField}.not.is.null`);
                            orConditions.push(`${targetField}.neq.""`);
                            break;
                        case 'gt':
                            orConditions.push(`${targetField}.gt.${value}`);
                            break;
                        case 'gte':
                            orConditions.push(`${targetField}.gte.${value}`);
                            break;
                        case 'lt':
                            orConditions.push(`${targetField}.lt.${value}`);
                            break;
                        case 'lte':
                            orConditions.push(`${targetField}.lte.${value}`);
                            break;
                    }
                });

                if (orConditions.length > 0) {
                    query = query.or(orConditions.join(','));
                }
            } else {
                // Apply filters sequentially (AND)
                filters.forEach(filter => {
                    const { field, operator, value, metadataKey } = filter;
                    let targetField = field;

                    // Handle metadata filtering
                    if (field === 'metadata' && metadataKey) {
                        targetField = `metadata->>${metadataKey}`;
                    }

                    switch (operator) {
                        case 'equals':
                            query = query.eq(targetField, value);
                            break;
                        case 'not_equals':
                            query = query.neq(targetField, value);
                            break;
                        case 'contains':
                            query = query.ilike(targetField, `%${value}%`);
                            break;
                        case 'not_contains':
                            query = query.not('ilike', targetField, `%${value}%`);
                            break;
                        case 'starts_with':
                            query = query.ilike(targetField, `${value}%`);
                            break;
                        case 'ends_with':
                            query = query.ilike(targetField, `%${value}`);
                            break;
                        case 'is_empty':
                            query = query.or(`${targetField}.is.null,${targetField}.eq.""`);
                            break;
                        case 'is_not_empty':
                            query = query.not(`${targetField}`, 'is', null).neq(targetField, '');
                            break;
                        case 'gt':
                            query = query.gt(targetField, value);
                            break;
                        case 'gte':
                            query = query.gte(targetField, value);
                            break;
                        case 'lt':
                            query = query.lt(targetField, value);
                            break;
                        case 'lte':
                            query = query.lte(targetField, value);
                            break;
                        case 'in':
                            if (Array.isArray(value)) {
                                query = query.in(targetField, value);
                            }
                            break;
                        case 'not_in':
                            if (Array.isArray(value)) {
                                query = query.not(targetField, 'in', `(${value.join(',')})`);
                            }
                            break;
                    }
                });
            }
        }

        const { data, error, count } = await query
            .order('created_at', { ascending: false })
            .range(offset, offset + limit - 1);

        const formatted = data?.map((t: any) => ({
            ...t,
            target_lists: t.assignments?.[0]?.target_lists || { name: 'Unassigned' },
            all_list_names: t.assignments?.map((a: any) => a.target_lists?.name).filter(Boolean) || [],
            all_list_ids: t.assignments?.map((a: any) => a.list_id) || []
        }));

        return { data: formatted as Target[], error, count };
    }
};
