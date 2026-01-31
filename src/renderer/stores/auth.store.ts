import { create } from 'zustand';
import { supabase } from '@/lib/supabase';
import { Session, User } from '@supabase/supabase-js';

interface AuthState {
    session: Session | null;
    user: User | null;
    profile: any | null;
    isLoading: boolean;
    setSession: (session: Session | null) => void;
    fetchProfile: () => Promise<void>;
    signOut: () => Promise<void>;
    signInWithGoogle: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set) => ({
    session: null,
    user: null,
    profile: null,
    isLoading: true,
    setSession: (session) => {
        set({ session, user: session?.user ?? null, isLoading: false });
        if (session) {
            useAuthStore.getState().fetchProfile();
        } else {
            set({ profile: null });
        }
    },
    fetchProfile: async () => {
        const { session } = useAuthStore.getState();
        if (!session?.user) return;

        try {
            const { data, error } = await supabase
                .from('profiles')
                .select('*')
                .eq('id', session.user.id)
                .single();

            if (error) throw error;
            set({ profile: data });
        } catch (error) {
            console.error('[AuthStore] Failed to fetch profile:', error);
        }
    },
    signOut: async () => {
        await supabase.auth.signOut();
        set({ session: null, user: null, profile: null });
    },
    signInWithGoogle: async () => {
        const { data, error } = await supabase.auth.signInWithOAuth({
            provider: 'google',
            options: {
                redirectTo: 'reavion://auth-callback',
                skipBrowserRedirect: true,
            },
        });
        if (error) throw error;
        if (data?.url) {
            await window.api.browser.openExternal(data.url);
        }
    },
}));
