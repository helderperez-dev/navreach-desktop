import { create } from 'zustand';
import { useWorkspaceStore } from '@/stores/workspace.store';
import { useSubscriptionStore } from '@/stores/subscription.store';
import { TargetList, Target } from '@/types/targets';
import { targetService } from '@/lib/targets.service';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/auth.store';
import { RealtimeChannel } from '@supabase/supabase-js';

interface TargetsState {
    lists: TargetList[];
    selectedListId: string | null;
    targets: Target[];
    isLoading: boolean;
    error: string | null;
    recentLogs: any[];

    viewMode: 'list' | 'all' | 'engaged';
    setViewMode: (mode: 'list' | 'all' | 'engaged') => void;

    fetchLists: (silent?: boolean) => Promise<void>;
    setSelectedListId: (id: string | null) => void;
    fetchTargets: (listId?: string, silent?: boolean) => Promise<void>;
    fetchRecentLogs: () => Promise<void>;

    addList: (name: string, description?: string) => Promise<void>;
    updateList: (id: string, updates: Partial<TargetList>) => Promise<void>;
    deleteList: (id: string) => Promise<void>;

    addTarget: (target: any) => Promise<void>;
    updateTarget: (id: string, updates: Partial<Target>) => Promise<void>;
    deleteTarget: (id: string) => Promise<void>;
    bulkAddTargets: (targets: any[]) => Promise<void>;
    realtimeChannel: RealtimeChannel | null;
    subscribeToChanges: () => void;
    unsubscribe: () => void;
    reset: () => void;

    // Pagination
    page: number;
    hasMore: boolean;
    limit: number;
    isFetchingMore: boolean;
    loadMoreTargets: () => Promise<void>;
}

export const useTargetsStore = create<TargetsState>((set, get) => ({
    lists: [],
    selectedListId: null,
    targets: [],
    isLoading: false,
    error: null,
    recentLogs: [],
    viewMode: 'list',
    realtimeChannel: null as RealtimeChannel | null,

    // Pagination defaults
    page: 0,
    hasMore: true,
    limit: 50,
    isFetchingMore: false,

    setViewMode: (mode) => {
        const currentMode = get().viewMode;
        if (currentMode === mode && mode === 'list') return; // No change needed

        set({ viewMode: mode, page: 0, hasMore: true, targets: [] }); // Reset pagination and targets on view change

        if (mode === 'all' || mode === 'engaged') {
            get().fetchLists(true); // This also calls fetchRecentLogs()
            get().fetchTargets();
        } else if (mode === 'list' && !get().selectedListId && get().lists.length > 0) {
            // only select first list if we don't have one selected yet
            get().setSelectedListId(get().lists[0].id);
        }
    },

    fetchLists: async (silent = false) => {
        if (!silent) set({ isLoading: true });
        const workspaceId = useWorkspaceStore.getState().currentWorkspace?.id;
        const { data, error } = await targetService.getTargetLists(workspaceId);

        if (error) {
            set({ error: error.message, isLoading: false });
            toast.error(`Failed to fetch lists: ${error.message}`);
        } else {
            // Also fetch recent logs to keep the activity feed fresh
            get().fetchRecentLogs();

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
                set({ lists: fetchedLists, isLoading: false, page: 0, hasMore: true });
                // Re-fetch targets for the current selection to ensure data is fresh
                if (currentSelectedId) {
                    get().fetchTargets(currentSelectedId, true);
                } else if (get().viewMode === 'all' || get().viewMode === 'engaged') {
                    get().fetchTargets(undefined, true);
                }
            }
        }
    },

    setSelectedListId: (id) => {
        set({ selectedListId: id });
        if (id) {
            get().fetchTargets(id);
            get().fetchLists(true); // Refresh counts when switching lists
        } else {
            set({ targets: [] });
        }
    },

    loadMoreTargets: async () => {
        const { page, limit, hasMore, isFetchingMore, viewMode, selectedListId } = get();
        if (!hasMore || isFetchingMore) return;

        set({ isFetchingMore: true });
        const nextPage = page + 1;
        const offset = nextPage * limit;

        let newData: any[] = [];
        let error = null;

        try {
            if (viewMode === 'all') {
                const workspaceId = useWorkspaceStore.getState().currentWorkspace?.id;
                if (workspaceId) {
                    const result = await targetService.getAllWorkspaceTargets(workspaceId, offset, limit);
                    newData = result.data || [];
                    error = result.error;
                }
            } else if (viewMode === 'engaged') {
                const workspaceId = useWorkspaceStore.getState().currentWorkspace?.id;
                if (workspaceId) {
                    // For engaged, later pages only fetch from DB. Virtual targets are only computed on page 0.
                    const result = await targetService.getEngagedWorkspaceTargets(workspaceId, offset, limit);
                    newData = result.data || [];
                    error = result.error;
                }
            } else if (selectedListId) {
                const result = await targetService.getTargets(selectedListId, offset, limit);
                newData = result.data || [];
                error = result.error;
            }

            if (error) throw error;

            if (newData.length > 0) {
                set((state) => {
                    let updatedTargets = [...state.targets];

                    // Smart merge for 'engaged' view to handle virtual targets
                    if (viewMode === 'engaged') {
                        newData.forEach(newTarget => {
                            // Check if we have a virtual target for this user (same username/url)
                            const newUsername = newTarget.metadata?.username?.toLowerCase() ||
                                newTarget.url?.split('/').pop()?.split('?')[0].toLowerCase();

                            const virtualIndex = updatedTargets.findIndex(t => {
                                if (!t.id.startsWith('virtual-')) return false;
                                const tUsername = t.metadata?.username?.toLowerCase() ||
                                    t.url?.split('/').pop()?.split('?')[0].toLowerCase();
                                return tUsername === newUsername;
                            });

                            if (virtualIndex !== -1) {
                                // Replace virtual with real
                                updatedTargets[virtualIndex] = newTarget;
                            } else {
                                // Only append if not already in list (safe check)
                                const exists = updatedTargets.some(t => t.id === newTarget.id);
                                if (!exists) {
                                    updatedTargets.push(newTarget);
                                }
                            }
                        });
                    } else {
                        updatedTargets = [...updatedTargets, ...newData];
                    }

                    return {
                        targets: updatedTargets,
                        page: nextPage,
                        hasMore: newData.length === limit,
                        isFetchingMore: false
                    };
                });
            } else {
                set({ hasMore: false, isFetchingMore: false });
            }

        } catch (err: any) {
            toast.error(`Failed to load more targets: ${err.message}`);
            set({ isFetchingMore: false });
        }
    },

    fetchRecentLogs: async () => {
        const session = useAuthStore.getState().session;
        if (!session?.access_token) return;
        try {
            const logs = await window.api.engagement.getLogs(session.access_token, { limit: 100 });
            set({ recentLogs: logs });
        } catch (error) {
            console.error('[TargetsStore] Failed to fetch recent logs:', error);
        }
    },

    fetchTargets: async (listId, silent = false) => {
        if (!silent) set({ isLoading: true });
        // Reset pagination when doing a fresh fetch
        set({ page: 0, hasMore: true });
        const limit = get().limit;

        let data, error;

        if (get().viewMode === 'all') {
            const workspaceId = useWorkspaceStore.getState().currentWorkspace?.id;
            if (!workspaceId) {
                set({ isLoading: false });
                return;
            }
            ({ data, error } = await targetService.getAllWorkspaceTargets(workspaceId, 0, limit));
        } else if (get().viewMode === 'engaged') {
            const workspaceId = useWorkspaceStore.getState().currentWorkspace?.id;
            const session = useAuthStore.getState().session;

            if (!workspaceId || !session?.access_token) {
                set({ isLoading: false });
                return;
            }

            // 1. Fetch official engaged targets
            const { data: targetsData, error: targetsError } = await targetService.getEngagedWorkspaceTargets(workspaceId, 0, limit);

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
            ({ data, error } = await targetService.getTargets(idToUse, 0, limit));
        }

        if (error) {
            set({ error: error.message, isLoading: false });
            toast.error(`Failed to fetch targets: ${error.message}`);
        } else {
            set({
                targets: data || [],
                isLoading: false,
                hasMore: (data || []).length === limit
            });
        }
    },

    addList: async (name: string, description?: string) => {
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

    updateList: async (id: string, updates: Partial<TargetList>) => {
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

    deleteList: async (id: string) => {
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

    addTarget: async (targetInput: any) => {
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
            get().fetchLists(true); // Sync counts with DB
            toast.success('Target added successfully');
        }
    },

    updateTarget: async (id: string, updates: Partial<Target>) => {
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
                const listId = data.list_id;
                set({
                    targets: get().targets.map(t => t.id === id ? data : t),
                    lists: get().lists.map(l => l.id === listId ? { ...l, target_count: (l.target_count || 0) + 1 } : l)
                });
                get().fetchLists(true);
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

    deleteTarget: async (id: string) => {
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
            get().fetchLists(true); // Sync counts with DB
            toast.success('Target deleted successfully');
        }
    },

    bulkAddTargets: async (targetsInput: any[]) => {
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
            get().fetchLists(true); // Sync counts with DB
            toast.success(`Successfully imported ${data.length} targets`);
        }
    },

    subscribeToChanges: () => {
        const workspaceId = useWorkspaceStore.getState().currentWorkspace?.id;
        const userId = useAuthStore.getState().session?.user?.id;

        if (!workspaceId || !userId) return;

        // Cleanup existing subscription if any
        get().unsubscribe();

        console.log('[Realtime] Subscribing to workspace:', workspaceId);

        const channel = supabase
            .channel(`targets-realtime-${workspaceId}`)
            .on('postgres_changes', {
                event: '*',
                schema: 'public',
                table: 'target_lists',
                filter: `workspace_id=eq.${workspaceId}`
            }, () => {
                get().fetchLists(true);
            })
            .on('postgres_changes', {
                event: '*',
                schema: 'public',
                table: 'targets',
            }, (payload) => {
                // Since we can't easily filter targets by workspace_id across lists via postgres_changes filter
                // we just refresh if the changed target belongs to our lists or if we are in 'all'/'engaged' mode
                get().fetchTargets(undefined, true);
                get().fetchLists(true); // Sync counts
            })
            .on('postgres_changes', {
                event: 'INSERT',
                schema: 'public',
                table: 'engagement_logs',
                filter: `user_id=eq.${userId}`
            }, (payload) => {
                console.log('[Realtime] New engagement log received:', payload.new);
                set({ recentLogs: [payload.new, ...get().recentLogs].slice(0, 100) });
                if (get().viewMode === 'engaged' || get().viewMode === 'all') {
                    get().fetchTargets(undefined, true);
                }
                get().fetchLists(true);
            })
            .subscribe((status) => {
                if (status === 'SUBSCRIBED') {
                    console.log('[Realtime] Successfully subscribed to changes');
                }
            });

        set({ realtimeChannel: channel });
    },

    unsubscribe: () => {
        const channel = get().realtimeChannel;
        if (channel) {
            console.log('[Realtime] Unsubscribing from changes');
            supabase.removeChannel(channel);
            set({ realtimeChannel: null });
        }
    },

    reset: () => {
        get().unsubscribe();
        set({
            lists: [],
            selectedListId: null,
            targets: [],
            isLoading: false,
            error: null,
            recentLogs: [],
            viewMode: 'list'
        });
    }
}));
