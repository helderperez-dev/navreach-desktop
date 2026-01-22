import { supabase } from './supabase';
import {
    TargetList,
    Target,
    CreateTargetListInput,
    CreateTargetInput
} from '@/types/targets';

export const targetService = {
    // Target Lists
    async getTargetLists(workspaceId?: string) {
        let query = supabase
            .from('target_lists')
            .select(`
                *,
                target_assignments(count)
            `);

        if (workspaceId) {
            query = query.eq('workspace_id', workspaceId);
        }

        const { data, error } = await query.order('created_at', { ascending: false });

        const formattedData = data?.map((list: any) => ({
            ...list,
            target_count: list.target_assignments?.[0]?.count || 0
        }));

        return { data: formattedData as TargetList[], error };
    },

    async createTargetList(input: CreateTargetListInput) {
        const { data, error } = await supabase
            .from('target_lists')
            .insert([input])
            .select()
            .single();
        return { data: data as TargetList, error };
    },

    async updateTargetList(id: string, updates: Partial<CreateTargetListInput>) {
        const { data, error } = await supabase
            .from('target_lists')
            .update(updates)
            .eq('id', id)
            .select()
            .single();
        return { data: data as TargetList, error };
    },

    async deleteTargetList(id: string) {
        const { error } = await supabase
            .from('target_lists')
            .delete()
            .eq('id', id);
        return { error };
    },

    // Targets
    async getTargets(listId: string, offset: number = 0, limit: number = 50, searchQuery?: string) {
        let query = supabase
            .from('target_assignments')
            .select(`
                target:targets(*, assignments:target_assignments(list_id, target_lists(name)))
            `)
            .eq('list_id', listId);

        if (searchQuery) {
            // This is trickier with the junction table. For now, let's filter on the target side.
            // In a real app we'd use a more complex join or full text search.
            query = query.or(`name.ilike.%${searchQuery}%,email.ilike.%${searchQuery}%,url.ilike.%${searchQuery}%`, { foreignTable: 'targets' });
        }

        const { data, error } = await query
            .order('created_at', { ascending: false })
            .range(offset, offset + limit - 1);

        const targets = data?.map((d: any) => ({
            ...d.target,
            list_id: listId, // Keep it for compatibility
            target_lists: d.target.assignments?.find((a: any) => a.list_id === listId)?.target_lists || { name: 'Unassigned' }, // Prioritize current list
            all_list_names: d.target.assignments?.map((a: any) => a.target_lists?.name).filter(Boolean) || [],
            all_list_ids: d.target.assignments?.map((a: any) => a.list_id) || []
        })) || [];

        return { data: targets as Target[], error };
    },

    async getAllTargetsInList(listId: string) {
        let query = supabase
            .from('target_assignments')
            .select(`
                target:targets(*, assignments:target_assignments(list_id, target_lists(name)))
            `)
            .eq('list_id', listId);

        const { data, error } = await query.order('created_at', { ascending: false });

        const targets = data?.map((d: any) => ({
            ...d.target,
            list_id: listId,
            target_lists: d.target.assignments?.find((a: any) => a.list_id === listId)?.target_lists || { name: 'Unassigned' },
            all_list_names: d.target.assignments?.map((a: any) => a.target_lists?.name).filter(Boolean) || [],
            all_list_ids: d.target.assignments?.map((a: any) => a.list_id) || []
        })) || [];

        return { data: targets as Target[], error };
    },

    async getAllWorkspaceTargets(workspaceId: string, offset: number = 0, limit: number = 50, searchQuery?: string) {
        let query = supabase
            .from('targets')
            .select('*, assignments:target_assignments(list_id, target_lists(name))')
            .eq('workspace_id', workspaceId)
            .order('created_at', { ascending: false });

        if (searchQuery) {
            query = query.or(`name.ilike.%${searchQuery}%,email.ilike.%${searchQuery}%,url.ilike.%${searchQuery}%`);
        }

        const { data, error } = await query.range(offset, offset + limit - 1);

        const formatted = data?.map((t: any) => ({
            ...t,
            target_lists: t.assignments?.[0]?.target_lists || { name: 'Unassigned' },
            all_list_names: t.assignments?.map((a: any) => a.target_lists?.name).filter(Boolean) || [],
            all_list_ids: t.assignments?.map((a: any) => a.list_id) || [],
            list_to_target_map: t.assignments?.reduce((acc: any, a: any) => {
                acc[a.list_id] = t.id;
                return acc;
            }, {})
        }));

        return { data: formatted as any[], error };
    },

    async getEngagedWorkspaceTargets(workspaceId: string, offset: number = 0, limit: number = 50, searchQuery?: string) {
        let query = supabase
            .from('targets')
            .select('*, assignments:target_assignments(list_id, target_lists(name))')
            .eq('workspace_id', workspaceId)
            .not('last_interaction_at', 'is', null)
            .order('last_interaction_at', { ascending: false });

        if (searchQuery) {
            query = query.or(`name.ilike.%${searchQuery}%,email.ilike.%${searchQuery}%,url.ilike.%${searchQuery}%`);
        }

        const { data, error } = await query.range(offset, offset + limit - 1);

        const formatted = data?.map((t: any) => ({
            ...t,
            target_lists: t.assignments?.[0]?.target_lists || { name: 'Unassigned' },
            all_list_names: t.assignments?.map((a: any) => a.target_lists?.name).filter(Boolean) || [],
            all_list_ids: t.assignments?.map((a: any) => a.list_id) || [],
            list_to_target_map: t.assignments?.reduce((acc: any, a: any) => {
                acc[a.list_id] = t.id;
                return acc;
            }, {})
        }));

        return { data: formatted as any[], error };
    },

    async createTarget(input: any) {
        // 1. Separate target data and list assignment
        const { list_id, ...targetData } = input;

        // Ensure we don't pass undefined/null ID which might cause DB constraint errors
        if (!targetData.id) {
            delete targetData.id;
        }

        // 2. Upsert the target itself (unique by URL in workspace)
        // Note: For now we'll handle uniqueness in the app logic or let DB fail if constraint is added.
        // We omit list_id from the targets table insert soon, but for backward compatibility we keep it if column exists.

        const { data: target, error: targetError } = await supabase
            .from('targets')
            .upsert([targetData], { onConflict: 'url, workspace_id' })
            .select()
            .single();

        if (targetError) return { data: null, error: targetError };

        // 3. Create the assignment
        if (list_id && target) {
            await supabase
                .from('target_assignments')
                .upsert({ target_id: target.id, list_id })
                .select();
        }

        return { data: target as Target, error: null };
    },

    async updateTarget(id: string, updates: Partial<Target>) {
        const { data, error } = await supabase
            .from('targets')
            .update(updates)
            .eq('id', id)
            .select()
            .single();
        return { data: data as Target, error };
    },

    async deleteTarget(id: string) {
        const { error } = await supabase
            .from('targets')
            .delete()
            .eq('id', id);
        return { error };
    },

    async bulkCreateTargets(targets: any[]) {
        const { data, error } = await supabase
            .from('targets')
            .upsert(targets, { onConflict: 'url, workspace_id' })
            .select();
        return { data: data as Target[], error };
    },

    async deleteTargetAssignment(targetId: string, listId: string) {
        const { error } = await supabase
            .from('target_assignments')
            .delete()
            .eq('target_id', targetId)
            .eq('list_id', listId);
        return { error };
    },

    async syncTargetAssignments(targetId: string, listIds: string[]) {
        // 1. Get current assignments
        const { data: current } = await supabase
            .from('target_assignments')
            .select('list_id')
            .eq('target_id', targetId);

        const currentIds = current?.map(c => c.list_id) || [];

        // 2. Determine what to add and remove
        const toAdd = listIds.filter(id => !currentIds.includes(id));
        const toRemove = currentIds.filter(id => !listIds.includes(id));

        // 3. Perform operations
        if (toAdd.length > 0) {
            await supabase.from('target_assignments').insert(toAdd.map(id => ({ target_id: targetId, list_id: id })));
        }
        if (toRemove.length > 0) {
            await supabase.from('target_assignments').delete().eq('target_id', targetId).in('list_id', toRemove);
        }
    }
};
