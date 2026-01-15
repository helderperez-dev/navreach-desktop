
import { supabase } from '@/lib/supabase';

export interface UserProfile {
    id: string;
    email?: string;
    full_name?: string;
    avatar_url?: string;
}

export const userService = {
    async uploadAvatar(file: File, userId: string): Promise<string> {
        const fileExt = file.name.split('.').pop();
        const fileName = `${userId}-${Date.now()}.${fileExt}`;
        const filePath = `${fileName}`;

        const { data, error: uploadError } = await supabase.storage
            .from('avatars')
            .upload(filePath, file, {
                upsert: true
            });

        if (uploadError) {
            throw uploadError;
        }

        const { data: urlData } = supabase.storage
            .from('avatars')
            .getPublicUrl(filePath);

        return urlData.publicUrl;
    },

    async updateProfile(userId: string, updates: { full_name?: string; avatar_url?: string }) {
        const { error } = await supabase.auth.updateUser({
            data: updates
        });

        if (error) {
            throw error;
        }
    },

    async getUserProfile(): Promise<UserProfile | null> {
        const { data: { user } } = await supabase.auth.getUser();

        if (!user) return null;

        return {
            id: user.id,
            email: user.email,
            full_name: user.user_metadata?.full_name,
            avatar_url: user.user_metadata?.avatar_url
        };
    }
};
