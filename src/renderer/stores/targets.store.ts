import { create } from 'zustand';
import { useWorkspaceStore } from '@/stores/workspace.store';
import { useSubscriptionStore } from '@/stores/subscription.store';
import { TargetList, Target } from '@/types/targets';
import { targetService } from '@/lib/targets.service';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/auth.store';

interface TargetsState {
    lists: TargetList[];
    selectedListId: string | null;
    targets: Target[];
    isLoading: boolean;
    error: string | null;

    viewMode: 'list' | 'all' | 'engaged';
    setViewMode: (mode: 'list' | 'all' | 'engaged') => void;

    fetchLists: () => Promise<void>;
    setSelectedListId: (id: string | null) => void;
    fetchTargets: (listId?: string) => Promise<void>;

    addList: (name: string, description?: string) => Promise<void>;
    updateList: (id: string, updates: Partial<TargetList>) => Promise<void>;
    deleteList: (id: string) => Promise<void>;

    addTarget: (target: any) => Promise<void>;
    updateTarget: (id: string, updates: Partial<Target>) => Promise<void>;
    deleteTarget: (id: string) => Promise<void>;
    bulkAddTargets: (targets: any[]) => Promise<void>;
    reset: () => void;
}

export const useTargetsStore = create<TargetsState>((set, get) => ({
    lists: [],
    selectedListId: null,
    targets: [],
    isLoading: false,
    error: null,
    viewMode: 'list',

    setViewMode: (mode) => {
        const currentMode = get().viewMode;
        if (currentMode === mode && mode === 'list') return; // No change needed

        set({ viewMode: mode });

        if (mode === 'all' || mode === 'engaged') {
            set({ selectedListId: null });
            get().fetchTargets();
        } else if (mode === 'list' && !get().selectedListId && get().lists.length > 0) {
            // only select first list if we don't have one selected yet
            get().setSelectedListId(get().lists[0].id);
        }
    },

    fetchLists: async () => {
        set({ isLoading: true });
        const workspaceId = useWorkspaceStore.getState().currentWorkspace?.id;
        const { data, error } = await targetService.getTargetLists(workspaceId);

        if (error) {
            set({ error: error.message, isLoading: false });
            toast.error(`Failed to fetch lists: ${error.message}`);
        } else {
            const fetchedLists = data || [];
            const currentSelectedId = get().selectedListId;

            // Check if the current selected list belongs to the new lists
            const isSelectedValid = fetchedLists.some(l => l.id === currentSelectedId);

            if (!isSelectedValid) {
                // Workspace changed or list deleted, clear current selection
                const nextSelectedId = fetchedLists.length > 0 ? fetchedLists[0].id : null;
                set({
                    lists: fetchedLists,
                    selectedListId: nextSelectedId,
                    targets: [], // Clear targets from previous workspace
                    isLoading: false
                });
                if (nextSelectedId) {
                    get().fetchTargets(nextSelectedId);
                }
            } else {
                set({ lists: fetchedLists, isLoading: false });
            }
        }
    },

    setSelectedListId: (id) => {
        set({ selectedListId: id });
        if (id) {
            get().fetchTargets(id);
            get().fetchLists(); // Refresh counts when switching lists
        } else {
            set({ targets: [] });
        }
    },

    fetchTargets: async (listId) => {
        set({ isLoading: true });

        let data, error;

        if (get().viewMode === 'all') {
            const workspaceId = useWorkspaceStore.getState().currentWorkspace?.id;
            if (!workspaceId) {
                set({ isLoading: false });
                return;
            }
            ({ data, error } = await targetService.getAllWorkspaceTargets(workspaceId));
        } else if (get().viewMode === 'engaged') {
            const workspaceId = useWorkspaceStore.getState().currentWorkspace?.id;
            const session = useAuthStore.getState().session;

            if (!workspaceId || !session?.access_token) {
                set({ isLoading: false });
                return;
            }

            // 1. Fetch official engaged targets
            const { data: targetsData, error: targetsError } = await targetService.getEngagedWorkspaceTargets(workspaceId);

            // 2. Fetch engagement logs to create "Virtual Targets" for ad-hoc engagements
            try {
                const logs = await window.api.engagement.getLogs(session.access_token, {
                    limit: 100
                });

                // 3. Merge targets and logs
                const virtualTargets: any[] = [];
                const latestLogsByUsername = new Map<string, any>();

                // Group logs by username to get the latest interaction for each
                logs.forEach((log: any) => {
                    const username = log.target_username?.toLowerCase();
                    if (username && !latestLogsByUsername.has(username)) {
                        latestLogsByUsername.set(username, log);
                    }
                });

                latestLogsByUsername.forEach((log, username) => {
                    // Check if this user is already in our official targets list
                    // We check by username or by matching the username at the end of the URL
                    const isExisting = targetsData?.some(t => {
                        const targetUsername = t.metadata?.username?.toLowerCase() ||
                            t.url?.split('/').pop()?.split('?')[0].toLowerCase();
                        return targetUsername === username;
                    });

                    if (!isExisting) {
                        virtualTargets.push({
                            id: `virtual-${log.id}`,
                            name: log.target_name || log.target_username,
                            url: log.platform === 'x.com'
                                ? `https://x.com/${log.target_username}`
                                : (log.platform === 'linkedin' ? `https://linkedin.com/in/${log.target_username}` : log.target_username),
                            type: 'person',
                            metadata: {
                                username: log.target_username,
                                platform: log.platform,
                                avatar_url: log.target_avatar_url,
                                ...((log.target_details as any) || {})
                            },
                            last_interaction_at: log.created_at,
                            created_at: log.created_at,
                            target_lists: { name: 'Ad-hoc' }
                        });
                    }
                });

                data = [...(targetsData || []), ...virtualTargets];

                // Sort combined list by last interaction
                data.sort((a, b) => {
                    const dateA = new Date(a.last_interaction_at || 0).getTime();
                    const dateB = new Date(b.last_interaction_at || 0).getTime();
                    return dateB - dateA;
                });
            } catch (err) {
                console.error('Failed to merge engagement logs:', err);
                data = targetsData;
                error = targetsError;
            }
        } else {
            // If explicit listId provided, use it. Otherwise use selectedListId from store
            const idToUse = listId || get().selectedListId;
            if (!idToUse) {
                set({ targets: [], isLoading: false });
                return;
            }
            ({ data, error } = await targetService.getTargets(idToUse));
        }

        if (error) {
            set({ error: error.message, isLoading: false });
            toast.error(`Failed to fetch targets: ${error.message}`);
        } else {
            set({ targets: data || [], isLoading: false });
        }
    },

    addList: async (name, description) => {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
            toast.error('User not authenticated');
            return;
        }

        const workspaceId = useWorkspaceStore.getState().currentWorkspace?.id;
        if (!workspaceId) {
            toast.error('No workspace selected');
            return;
        }

        const subStore = useSubscriptionStore.getState();
        const limits = subStore.limits;
        const isPro = subStore.isPro();

        if (!isPro && get().lists.length >= limits.target_list_limit) {
            subStore.openUpgradeModal(
                "Target List Limit Reached",
                `Free accounts are limited to ${limits.target_list_limit} target lists. Upgrade to Pro to create unlimited lists and organize your outreach better.`
            );
            return;
        }

        const { data, error } = await targetService.createTargetList({
            name,
            description,
            user_id: user.id,
            workspace_id: workspaceId
        });

        if (error) {
            toast.error(`Failed to create list: ${error.message}`);
        } else if (data) {
            set({
                lists: [{ ...data, target_count: 0 }, ...get().lists],
                selectedListId: data.id
            });
            get().fetchTargets(data.id);
            toast.success('List created successfully');
        }
    },

    updateList: async (id, updates) => {
        const { data, error } = await targetService.updateTargetList(id, updates as any);
        if (error) {
            toast.error(`Failed to update list: ${error.message}`);
        } else if (data) {
            set({
                lists: get().lists.map(l => l.id === id ? data : l)
            });
            toast.success('List updated successfully');
        }
    },

    deleteList: async (id) => {
        const { error } = await targetService.deleteTargetList(id);
        if (error) {
            toast.error(`Failed to delete list: ${error.message}`);
        } else {
            const remainingLists = get().lists.filter(l => l.id !== id);
            const nextSelectedId = remainingLists.length > 0 ? remainingLists[0].id : null;
            set({
                lists: remainingLists,
                selectedListId: nextSelectedId
            });
            if (nextSelectedId) {
                get().fetchTargets(nextSelectedId);
            } else {
                set({ targets: [] });
            }
            toast.success('List deleted successfully');
        }
    },

    addTarget: async (targetInput) => {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
            toast.error('User not authenticated');
            return;
        }

        const subStore = useSubscriptionStore.getState();
        const limits = subStore.limits;
        const isPro = subStore.isPro();
        const list = get().lists.find(l => l.id === targetInput.list_id);

        if (!isPro && (list?.target_count || 0) >= limits.target_limit) {
            subStore.openUpgradeModal(
                "Target Limit Reached",
                `Free accounts are limited to ${limits.target_limit} targets per list. Upgrade to Pro to add unlimited targets and scale your growth.`
            );
            return;
        }

        const { data, error } = await targetService.createTarget({
            ...targetInput,
            user_id: user.id
        });

        if (error) {
            toast.error(`Failed to add target: ${error.message}`);
        } else if (data) {
            set({
                targets: [data, ...get().targets],
                lists: get().lists.map(l => l.id === data.list_id ? { ...l, target_count: (l.target_count || 0) + 1 } : l)
            });
            get().fetchLists(); // Sync counts with DB
            toast.success('Target added successfully');
        }
    },

    updateTarget: async (id, updates) => {
        if (id.startsWith('virtual-')) {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) {
                toast.error('User not authenticated');
                return;
            }

            // If we're updating a virtual target, it means we're converting it to a real one
            // We need a list_id. Use the selected one or the first one available
            const listId = get().selectedListId || (get().lists.length > 0 ? get().lists[0].id : null);

            if (!listId) {
                toast.error('Please select or create a target list first');
                return;
            }

            const { data, error } = await targetService.createTarget({
                ...updates,
                list_id: listId,
                user_id: user.id,
                name: updates.name || '',
                url: updates.url || '',
                type: updates.type || 'profile'
            } as any);

            if (error) {
                toast.error(`Failed to save interaction contact: ${error.message}`);
            } else if (data) {
                set({
                    targets: get().targets.map(t => t.id === id ? data : t),
                    lists: get().lists.map(l => l.id === listId ? { ...l, target_count: (l.target_count || 0) + 1 } : l)
                });
                get().fetchLists();
                toast.success('Contact saved to list');
            }
            return;
        }

        const { data, error } = await targetService.updateTarget(id, updates);
        if (error) {
            toast.error(`Failed to update target: ${error.message}`);
        } else if (data) {
            set({
                targets: get().targets.map(t => t.id === id ? data : t)
            });
            toast.success('Target updated successfully');
        }
    },

    deleteTarget: async (id) => {
        if (id.startsWith('virtual-')) {
            set({
                targets: get().targets.filter(t => t.id !== id)
            });
            toast.success('Removed from view');
            return;
        }

        const targetToDelete = get().targets.find(t => t.id === id);
        const { error } = await targetService.deleteTarget(id);
        if (error) {
            toast.error(`Failed to delete target: ${error.message}`);
        } else {
            set({
                targets: get().targets.filter(t => t.id !== id),
                lists: targetToDelete ? get().lists.map(l => l.id === targetToDelete.list_id ? { ...l, target_count: Math.max(0, (l.target_count || 0) - 1) } : l) : get().lists
            });
            get().fetchLists(); // Sync counts with DB
            toast.success('Target deleted successfully');
        }
    },

    bulkAddTargets: async (targetsInput) => {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
            toast.error('User not authenticated');
            return;
        }

        const listId = targetsInput[0]?.list_id;
        if (listId) {
            const subStore = useSubscriptionStore.getState();
            const limits = subStore.limits;
            const isPro = subStore.isPro();
            const list = get().lists.find(l => l.id === listId);

            if (!isPro && (list?.target_count || 0) >= limits.target_limit) {
                subStore.openUpgradeModal(
                    "Target Limit Reached",
                    `Free accounts are limited to ${limits.target_limit} targets per list. Upgrade to Pro to add unlimited targets and scale your growth.`
                );
                return;
            }
        }

        const targetsWithUser = targetsInput.map(t => ({ ...t, user_id: user.id }));
        const { data, error } = await targetService.bulkCreateTargets(targetsWithUser);

        if (error) {
            toast.error(`Failed to import targets: ${error.message}`);
        } else if (data && data.length > 0) {
            const listId = data[0].list_id;
            set({
                targets: [...data, ...get().targets],
                lists: get().lists.map(l => l.id === listId ? { ...l, target_count: (l.target_count || 0) + data.length } : l)
            });
            get().fetchLists(); // Sync counts with DB
            toast.success(`Successfully imported ${data.length} targets`);
        }
    },

    reset: () => set({
        lists: [],
        selectedListId: null,
        targets: [],
        isLoading: false,
        error: null,
        viewMode: 'list'
    })
}));
