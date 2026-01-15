import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { useBillingStore } from './billing.store';

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
    trackAIAction: () => void;
    resetDailyUsage: () => void;
    fetchLimits: (accessToken?: string) => Promise<void>;

    // UI state (not persisted)
    isUpgradeModalOpen: boolean;
    modalTitle: string;
    modalDescription: string;
    openUpgradeModal: (title?: string, description?: string) => void;
    closeUpgradeModal: () => void;
}

export const useSubscriptionStore = create<SubscriptionState>()(
    persist(
        (set, get) => ({
            dailyUsage: {
                date: new Date().toISOString().split('T')[0],
                aiActions: 0,
            },

            limits: {
                ai_actions_limit: 10,
                workspace_limit: 1,
                target_list_limit: 3,
                target_limit: 50
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

                const today = new Date().toISOString().split('T')[0];
                const currentUsage = get().dailyUsage;

                if (currentUsage.date !== today) {
                    return true; // Will be reset on track
                }

                return currentUsage.aiActions < get().limits.ai_actions_limit;
            },

            trackAIAction: () => {
                const today = new Date().toISOString().split('T')[0];
                const currentUsage = get().dailyUsage;

                if (currentUsage.date !== today) {
                    set({ dailyUsage: { date: today, aiActions: 1 } });
                } else {
                    set({ dailyUsage: { ...currentUsage, aiActions: currentUsage.aiActions + 1 } });
                }
            },

            resetDailyUsage: () => {
                set({ dailyUsage: { date: new Date().toISOString().split('T')[0], aiActions: 0 } });
            },

            fetchLimits: async (accessToken?: string) => {
                try {
                    const limits = await window.api.stripe.getTierLimits(accessToken);
                    if (limits) {
                        set({ limits });
                    }
                } catch (error) {
                    console.error('[SubscriptionStore] Failed to fetch limits:', error);
                }
            },

            // UI state
            isUpgradeModalOpen: false,
            modalTitle: 'Level up to Pro',
            modalDescription: "You've hit a limit on your Free plan. Upgrade now to unlock unlimited potential.",

            openUpgradeModal: (title, description) => {
                set({
                    isUpgradeModalOpen: true,
                    modalTitle: title || 'Level up to Pro',
                    modalDescription: description || "You've hit a limit on your Free plan. Upgrade now to unlock unlimited potential."
                });
            },

            closeUpgradeModal: () => {
                set({ isUpgradeModalOpen: false });
            }
        }),
        {
            name: 'reavion-subscription-usage',
            partialize: (state) => ({ dailyUsage: state.dailyUsage, limits: state.limits }),
        }
    )
);
