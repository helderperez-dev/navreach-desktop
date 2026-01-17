import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { useBillingStore } from './billing.store';
import { useAuthStore } from './auth.store';

const getLocalDateString = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

export interface TierLimits {
    ai_actions_limit: number;
    workspace_limit: number;
    target_list_limit: number;
    target_limit: number;
}

interface DailyUsage {
    date: string;
    aiActions: number;
}

interface SubscriptionState {
    dailyUsage: DailyUsage;
    limits: TierLimits;

    // Help methods
    isPro: () => boolean;
    getTier: () => 'free' | 'pro';

    // Feature gating
    canRunAIAction: () => boolean;

    // Actions
    trackAIAction: () => Promise<void>;
    incrementAIActionLocal: () => void;
    resetDailyUsage: () => Promise<void>;
    fetchLimits: (accessToken?: string) => Promise<void>;

    // UI state (not persisted)
    isUpgradeModalOpen: boolean;
    modalTitle: string;
    modalDescription: string;
    openUpgradeModal: (title?: string, description?: string) => void;
    closeUpgradeModal: () => void;
    reset: () => void;
}

export const useSubscriptionStore = create<SubscriptionState>()(
    persist(
        (set, get) => ({
            dailyUsage: {
                date: getLocalDateString(),
                aiActions: 0,
            },

            limits: {
                ai_actions_limit: 100,
                workspace_limit: 1,
                target_list_limit: 3,
                target_limit: 20
            },

            isPro: () => {
                const sub = useBillingStore.getState().subscription;
                return sub?.status === 'active' || sub?.status === 'trialing';
            },

            getTier: () => {
                return get().isPro() ? 'pro' : 'free';
            },

            canRunAIAction: () => {
                if (get().isPro()) return true;

                const currentUsage = get().dailyUsage;
                // If usage is old, we assume it's reset in the DB and will be refreshed
                return currentUsage.aiActions < get().limits.ai_actions_limit;
            },

            trackAIAction: async () => {
                const accessToken = useAuthStore.getState().session?.access_token;
                if (!accessToken) return;

                try {
                    const usage = await window.api.stripe.trackUsage(accessToken, 'ai_actions', 1);
                    if (usage) {
                        set({
                            dailyUsage: {
                                date: usage.usage_date,
                                aiActions: usage.count
                            }
                        });
                    }
                } catch (error) {
                    console.error('[SubscriptionStore] Failed to track usage:', error);
                    // Fallback to local increment if DB fails? 
                    // Better to just keep local state updated to avoid lag
                    const currentUsage = get().dailyUsage;
                    set({ dailyUsage: { ...currentUsage, aiActions: currentUsage.aiActions + 1 } });
                }
            },

            incrementAIActionLocal: () => {
                const currentUsage = get().dailyUsage;
                set({ dailyUsage: { ...currentUsage, aiActions: currentUsage.aiActions + 1 } });
            },

            resetDailyUsage: async () => {
                // Not really needed if it's automatic in DB, but can be manual
                set({ dailyUsage: { date: getLocalDateString(), aiActions: 0 } });
            },

            fetchLimits: async (accessToken?: string) => {
                if (!accessToken) return;
                try {
                    const [limits, usage] = await Promise.all([
                        window.api.stripe.getTierLimits(accessToken),
                        window.api.stripe.getUsage(accessToken, 'ai_actions')
                    ]);

                    if (limits) set({ limits });
                    if (usage) {
                        set({
                            dailyUsage: {
                                date: usage.usage_date,
                                aiActions: usage.count
                            }
                        });
                    }
                } catch (error) {
                    console.error('[SubscriptionStore] Failed to fetch limits/usage:', error);
                }
            },

            // UI state
            isUpgradeModalOpen: false as boolean,
            modalTitle: 'Level up to Pro',
            modalDescription: "You've hit a limit on your Free plan. Upgrade now to unlock unlimited potential.",

            openUpgradeModal: (title?: string, description?: string) => {
                set({
                    isUpgradeModalOpen: true,
                    modalTitle: title || 'Level up to Pro',
                    modalDescription: description || "You've hit a limit on your Free plan. Upgrade now to unlock unlimited potential."
                });
            },

            closeUpgradeModal: () => {
                set({ isUpgradeModalOpen: false });
            },

            reset: () => {
                set({
                    dailyUsage: {
                        date: getLocalDateString(),
                        aiActions: 0,
                    },
                    limits: {
                        ai_actions_limit: 100,
                        workspace_limit: 1,
                        target_list_limit: 3,
                        target_limit: 20
                    },
                    isUpgradeModalOpen: false
                });
            }
        }),
        {
            name: 'reavion-subscription-usage',
            partialize: (state: any) => ({ limits: state.limits }), // Only persist limits locally
        }
    )
);
