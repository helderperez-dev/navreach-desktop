import { create } from 'zustand';
import { supabase } from '@/lib/supabase';
import { Session, User } from '@supabase/supabase-js';

interface AuthState {
    session: Session | null;
    user: User | null;
    isLoading: boolean;
    setSession: (session: Session | null) => void;
    signOut: () => Promise<void>;
    signInWithGoogle: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set) => ({
    session: null,
    user: null,
    isLoading: true,
    setSession: (session) => set({ session, user: session?.user ?? null, isLoading: false }),
    signOut: async () => {
        await supabase.auth.signOut();
        set({ session: null, user: null });
    },
    signInWithGoogle: async () => {
        const { error } = await supabase.auth.signInWithOAuth({
            provider: 'google',
            options: {
                redirectTo: 'navreach://auth-callback', // We need to handle this in main process
            },
        });
        if (error) throw error;
    },
}));
