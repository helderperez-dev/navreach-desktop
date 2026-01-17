import { supabase } from '@/lib/supabase';
import type { PlatformKnowledge, KnowledgeBase, KnowledgeContent } from '@shared/types';

export const knowledgeService = {
    // Knowledge Bases
    async getKnowledgeBases(): Promise<KnowledgeBase[]> {
        const { data, error } = await supabase.from('knowledge_bases').select('*').order('name');
        if (error) throw error;
        return data || [];
    },

    async createKnowledgeBase(name: string, description?: string): Promise<KnowledgeBase> {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error('User not authenticated');

        const { data, error } = await supabase
            .from('knowledge_bases')
            .insert({
                name,
                description,
                user_id: user.id
            })
            .select()
            .single();

        if (error) throw error;
        return data;
    },

    async deleteKnowledgeBase(id: string): Promise<void> {
        const { error } = await supabase.from('knowledge_bases').delete().eq('id', id);
        if (error) throw error;
    },

    // Knowledge Content
    async getKBContent(kbId: string): Promise<KnowledgeContent[]> {
        const { data, error } = await supabase
            .from('knowledge_content')
            .select('*')
            .eq('kb_id', kbId)
            .order('created_at');
        if (error) throw error;
        return data || [];
    },

    async addKBContent(kbId: string, content: string, title?: string): Promise<KnowledgeContent> {
        const { data, error } = await supabase
            .from('knowledge_content')
            .insert({ kb_id: kbId, content, title })
            .select()
            .single();
        if (error) throw error;
        return data;
    },

    async deleteKBContent(id: string): Promise<void> {
        const { error } = await supabase.from('knowledge_content').delete().eq('id', id);
        if (error) throw error;
    },

    // Platform Knowledge (Elements)
    async getPlatformKnowledge(): Promise<PlatformKnowledge[]> {
        const { data, error } = await supabase
            .from('platform_knowledge')
            .select('*')
            .order('domain');
        if (error) throw error;
        return data || [];
    },

    async addPlatformKnowledge(record: Partial<PlatformKnowledge>): Promise<PlatformKnowledge> {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error('User not authenticated');

        // Remove id if present to allow auto-generation
        const { id, created_at, updated_at, ...insertData } = record;

        const { data, error } = await supabase
            .from('platform_knowledge')
            .insert({
                ...insertData,
                user_id: user.id
            })
            .select()
            .single();
        if (error) throw error;
        return data;
    },

    async updatePlatformKnowledge(record: Partial<PlatformKnowledge>): Promise<PlatformKnowledge> {
        if (!record.id) throw new Error('ID required for update');

        const { data, error } = await supabase
            .from('platform_knowledge')
            .update({
                ...record,
                updated_at: new Date().toISOString()
            })
            .eq('id', record.id)
            .select()
            .single();
        if (error) throw error;
        return data;
    },

    async deletePlatformKnowledge(id: string): Promise<void> {
        const { error } = await supabase.from('platform_knowledge').delete().eq('id', id);
        if (error) throw error;
    }
};
