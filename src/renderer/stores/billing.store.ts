import { create } from 'zustand';
import { supabase } from '@/lib/supabase';

interface Subscription {
    id: string;
    status: 'trialing' | 'active' | 'canceled' | 'incomplete' | 'incomplete_expired' | 'past_due' | 'unpaid' | 'paused';
    price_id: string;
    cancel_at_period_end: boolean;
    current_period_end: string;
}

interface BillingState {
    credits: number;
    subscription: Subscription | null;
    isLoading: boolean;

    fetchCredits: () => Promise<void>;
    fetchSubscription: () => Promise<void>;
    reset: () => void;
}

export const useBillingStore = create<BillingState>((set) => ({
    credits: 0,
    subscription: null,
    isLoading: false,

    fetchCredits: async () => {
        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) return;

            const { data, error } = await supabase
                .from('credit_balances')
                .select('balance')
                .eq('user_id', user.id)
                .single();

            if (error && error.code !== 'PGRST116') { // PGRST116 is no rows returned
                console.error('[BillingStore] Error fetching credits:', error);
                return;
            }

            set({ credits: data?.balance || 0 });
        } catch (err) {
            console.error('[BillingStore] Failed to fetch credits:', err);
        }
    },

    fetchSubscription: async () => {
        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) return;

            const { data, error } = await supabase
                .from('subscriptions')
                .select('*')
                .eq('user_id', user.id)
                .in('status', ['active', 'trialing'])
                .maybeSingle();

            if (error) {
                console.error('[BillingStore] Error fetching subscription:', error);
                return;
            }

            set({ subscription: data as Subscription | null });
        } catch (err) {
            console.error('[BillingStore] Failed to fetch subscription:', err);
        }
    },

    reset: () => set({ credits: 0, subscription: null, isLoading: false })
}));
