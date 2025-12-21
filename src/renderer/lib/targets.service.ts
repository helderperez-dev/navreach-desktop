import { supabase } from './supabase';
import {
    TargetList,
    Target,
    CreateTargetListInput,
    CreateTargetInput
} from '@/types/targets';

export const targetService = {
    // Target Lists
    async getTargetLists() {
        const { data, error } = await supabase
            .from('target_lists')
            .select(`
                *,
                targets:targets(count)
            `)
            .order('created_at', { ascending: false });

        const formattedData = data?.map(list => ({
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
