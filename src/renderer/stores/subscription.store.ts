import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { useBillingStore } from './billing.store';
import { useWorkspaceStore } from './workspace.store';
import { useTargetsStore } from './targets.store';

export const FREE_TIER_AI_ACTIONS_LIMIT = 10;

interface DailyUsage {
    date: string;
    aiActions: number;
}

interface SubscriptionState {
    dailyUsage: DailyUsage;

    // Help methods
    isPro: () => boolean;
    getTier: () => 'free' | 'pro';

    // Feature gating
    canCreateWorkspace: () => boolean;
    canAddTargetList: () => boolean;
    canAddTarget: (listId: string) => boolean;
    canRunAIAction: () => boolean;

    // Actions
    trackAIAction: () => void;
    resetDailyUsage: () => void;

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

            isPro: () => {
                const sub = useBillingStore.getState().subscription;
                return sub?.status === 'active' || sub?.status === 'trialing';
            },

            getTier: () => {
                return get().isPro() ? 'pro' : 'free';
            },

            canCreateWorkspace: () => {
                if (get().isPro()) return true;
                const workspaceCount = useWorkspaceStore.getState().workspaces.length;
                return workspaceCount < 1;
            },

            canAddTargetList: () => {
                if (get().isPro()) return true;
                const listCount = useTargetsStore.getState().lists.length;
                return listCount < 3;
            },

            canAddTarget: (listId: string) => {
                if (get().isPro()) return true;
                const list = useTargetsStore.getState().lists.find(l => l.id === listId);
                return (list?.target_count || 0) < 50;
            },

            canRunAIAction: () => {
                if (get().isPro()) return true;

                const today = new Date().toISOString().split('T')[0];
                const currentUsage = get().dailyUsage;

                if (currentUsage.date !== today) {
                    return true; // Will be reset on track
                }

                return currentUsage.aiActions < FREE_TIER_AI_ACTIONS_LIMIT;
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
            partialize: (state) => ({ dailyUsage: state.dailyUsage }),
        }
    )
);
