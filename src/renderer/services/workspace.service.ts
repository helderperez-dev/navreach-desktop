import { supabase } from '@/lib/supabase';
import { Workspace, WorkspaceMember } from '@/types/workspace';

export const workspaceService = {
    async getWorkspaces(): Promise<Workspace[]> {
        const { data, error } = await supabase
            .from('workspaces')
            .select('*')
            .order('name');

        if (error) throw error;
        return data || [];
    },

    async createWorkspace(name: string): Promise<Workspace> {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error('User not authenticated');

        // The database trigger 'on_workspace_created' will automatically 
        // add the user as an 'owner' member.
        const { data: workspace, error: wsError } = await supabase
            .from('workspaces')
            .insert([{ name, owner_id: user.id }])
            .select()
            .single();

        if (wsError) throw wsError;

        return workspace;
    },

    async updateWorkspace(id: string, updates: Partial<Workspace>): Promise<Workspace> {
        const { data, error } = await supabase
            .from('workspaces')
            .update(updates)
            .eq('id', id)
            .select()
            .single();

        if (error) throw error;
        return data;
    },

    async getWorkspaceMembers(workspaceId: string): Promise<WorkspaceMember[]> {
        const { data, error } = await supabase
            .from('workspace_members')
            .select('*')
            .eq('workspace_id', workspaceId);

        if (error) throw error;
        return data || [];
    }
};
