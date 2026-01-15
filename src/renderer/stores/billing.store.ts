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

    // Global Customer/Config State
    customerId: string | null;
    stripeConfig: any | null;

    // Payment Modal State
    isPaymentModalOpen: boolean;
    clientSecret: string;
    paymentContext: {
        amount?: string;
        description?: string;
        promoCode?: string;
        subtotal?: number;
        total?: number;
        formattedSubtotal?: string;
        formattedDiscount?: string;
    };

    // Actions
    fetchCredits: () => Promise<void>;
    fetchSubscription: () => Promise<void>;
    loadStripeConfig: () => Promise<void>;
    loadCustomerId: () => Promise<string | null>;
    ensureCustomer: () => Promise<string>;
    initiateSubscription: (priceId?: string, promoCode?: string) => Promise<void>;
    setPaymentModalOpen: (open: boolean) => void;
    handlePaymentSuccess: () => void;
    reset: () => void;
}

export const useBillingStore = create<BillingState>((set, get) => ({
    credits: 0,
    subscription: null,
    isLoading: false,

    customerId: null,
    stripeConfig: null,

    isPaymentModalOpen: false,
    clientSecret: '',
    paymentContext: {},

    fetchCredits: async () => {
        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) return;

            const { data, error } = await supabase
                .from('credit_balances')
                .select('balance')
                .eq('user_id', user.id)
                .single();

            if (error && error.code !== 'PGRST116') return;
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

            if (error) return;
            set({ subscription: data as Subscription | null });
        } catch (err) {
            console.error('[BillingStore] Failed to fetch subscription:', err);
        }
    },

    loadStripeConfig: async () => {
        try {
            const config = await window.api.stripe.getConfig();
            set({ stripeConfig: config });
        } catch (err) {
            console.error('[BillingStore] Failed to load Stripe config:', err);
        }
    },

    loadCustomerId: async () => {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
            const { data: profile } = await supabase.from('profiles').select('stripe_customer_id').eq('id', user.id).single();
            const cid = profile?.stripe_customer_id;
            set({ customerId: cid });
            return cid;
        }
        return null;
    },

    ensureCustomer: async () => {
        const currentId = get().customerId;
        if (currentId) return currentId;

        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error('Not authenticated');

        const customer = await window.api.stripe.createCustomer(user.email!, user.user_metadata?.full_name);
        const cid = customer.id;
        await supabase.from('profiles').update({ stripe_customer_id: cid }).eq('id', user.id);
        set({ customerId: cid });
        return cid;
    },

    initiateSubscription: async (priceId, promoCode?: string) => {
        const targetPriceId = priceId || get().stripeConfig?.proPriceId || import.meta.env.VITE_STRIPE_PRO_PRICE_ID;
        if (!targetPriceId) {
            console.error('[BillingStore] No price ID available');
            return;
        }

        set({ isLoading: true });
        try {
            const cid = await get().ensureCustomer();
            const response = await (window.api.stripe as any).createSubscription(cid, targetPriceId, promoCode);

            const { clientSecret, amount = 4999, subtotal = 4999, currency = 'usd' } = response;

            // Format currency helper
            const formatAmount = (val: any) => {
                const num = typeof val === 'number' ? val : 0;
                return new Intl.NumberFormat('en-US', {
                    style: 'currency',
                    currency: currency || 'USD',
                }).format(num / 100);
            };

            set({
                clientSecret,
                paymentContext: {
                    amount: formatAmount(amount),
                    subtotal: subtotal,
                    total: amount,
                    formattedSubtotal: formatAmount(subtotal),
                    formattedDiscount: formatAmount((subtotal || 0) - (amount || 0)),
                    description: 'Pro Subscription',
                    promoCode
                },
                isPaymentModalOpen: true
            });
        } catch (error: any) {
            console.error('[BillingStore] Subscription error:', error);
            throw error;
        } finally {
            set({ isLoading: false });
        }
    },

    setPaymentModalOpen: (open) => set({ isPaymentModalOpen: open }),

    handlePaymentSuccess: () => {
        set({ isPaymentModalOpen: false });
        const { fetchCredits, fetchSubscription } = get();
        setTimeout(() => {
            fetchCredits();
            fetchSubscription();
        }, 2000);
    },

    reset: () => set({
        credits: 0,
        subscription: null,
        isLoading: false,
        customerId: null,
        stripeConfig: null,
        isPaymentModalOpen: false,
        clientSecret: '',
        paymentContext: {}
    })
}));
