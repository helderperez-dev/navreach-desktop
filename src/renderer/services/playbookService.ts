
import { supabase } from '@/lib/supabase';
import { CreatePlaybookDTO, Playbook, UpdatePlaybookDTO } from '@/types/playbook';

export const playbookService = {
    async getPlaybooks(): Promise<Playbook[]> {
        const { data, error } = await supabase
            .from('playbooks')
            .select('*')
            .order('updated_at', { ascending: false });

        if (error) throw error;
        return data || [];
    },

    async getPlaybookById(id: string): Promise<Playbook | null> {
        const { data, error } = await supabase
            .from('playbooks')
            .select('*')
            .eq('id', id)
            .single();

        if (error) throw error;
        return data;
    },

    async createPlaybook(playbook: CreatePlaybookDTO): Promise<Playbook> {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error('User not authenticated');

        const { data, error } = await supabase
            .from('playbooks')
            .insert([{
                ...playbook,
                user_id: user.id,
                version: '1.0.0',
                visibility: 'private'
            }])
            .select()
            .single();

        if (error) throw error;
        return data;
    },

    async updatePlaybook(id: string, updates: UpdatePlaybookDTO): Promise<Playbook> {
        const { data, error } = await supabase
            .from('playbooks')
            .update({
                ...updates,
                updated_at: new Date().toISOString(),
            })
            .eq('id', id)
            .select()
            .single();

        if (error) throw error;
        return data;
    },

    async deletePlaybook(id: string): Promise<void> {
        const { error } = await supabase
            .from('playbooks')
            .delete()
            .eq('id', id);

        if (error) throw error;
    },

    // Export interface for AI Agent
    async getPlaybookForExecution(id: string) {
        const { data, error } = await supabase
            .from('playbooks')
            .select('graph, capabilities, execution_defaults')
            .eq('id', id)
            .single();

        if (error) throw error;
        return data;
    }
};
