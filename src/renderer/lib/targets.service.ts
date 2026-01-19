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
                targets:targets(count)
            `);

        if (workspaceId) {
            query = query.eq('workspace_id', workspaceId);
        }

        const { data, error } = await query.order('created_at', { ascending: false });

        const formattedData = data?.map((list: any) => ({
            ...list,
            target_count: list.targets?.[0]?.count || 0
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
    async getTargets(listId?: string) {
        let query = supabase.from('targets').select('*');
        if (listId) {
            query = query.eq('list_id', listId);
        }
        const { data, error } = await query.order('created_at', { ascending: false });
        return { data: data as Target[], error };
    },

    async getAllWorkspaceTargets(workspaceId: string) {
        const { data, error } = await supabase
            .from('targets')
            .select('*, target_lists!inner(name, workspace_id)')
            .eq('target_lists.workspace_id', workspaceId)
            .order('created_at', { ascending: false });

        return { data: data as (Target & { target_lists: { name: string } })[], error };
    },

    async getEngagedWorkspaceTargets(workspaceId: string) {
        const { data, error } = await supabase
            .from('targets')
            .select('*, target_lists!inner(name, workspace_id)')
            .eq('target_lists.workspace_id', workspaceId)
            .not('last_interaction_at', 'is', null)
            .order('last_interaction_at', { ascending: false });

        return { data: data as (Target & { target_lists: { name: string } })[], error };
    },

    async createTarget(input: CreateTargetInput) {
        const { data, error } = await supabase
            .from('targets')
            .insert([input])
            .select()
            .single();
        return { data: data as Target, error };
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

    async bulkCreateTargets(targets: CreateTargetInput[]) {
        const { data, error } = await supabase
            .from('targets')
            .insert(targets)
            .select();
        return { data: data as Target[], error };
    }
};
