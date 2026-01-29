import { create } from 'zustand';
import { useWorkspaceStore } from '@/stores/workspace.store';
import { useSubscriptionStore } from '@/stores/subscription.store';
import { TargetList, Target } from '@/types/targets';
import { TargetSegment, CreateSegmentInput, FilterCondition } from '@/types/segments';
import { targetService } from '@/lib/targets.service';
import { segmentService } from '@/lib/segments.service';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/auth.store';
import { RealtimeChannel } from '@supabase/supabase-js';

interface TargetsState {
    lists: TargetList[];
    selectedListId: string | null;
    segments: TargetSegment[];
    selectedSegmentId: string | null;
    targets: Target[];
    allMetadataKeys: string[];
    isLoading: boolean;
    error: string | null;
    recentLogs: any[];

    viewMode: 'list' | 'all' | 'engaged' | 'segment';
    setViewMode: (mode: 'list' | 'all' | 'engaged' | 'segment') => void;
    lastSelectedListId: string | null;

    fetchLists: (silent?: boolean) => Promise<void>;
    fetchSegments: (silent?: boolean) => Promise<void>;
    setSelectedListId: (id: string | null) => void;
    setSelectedSegmentId: (id: string | null) => void;
    fetchTargets: (listId?: string, silent?: boolean) => Promise<void>;
    fetchRecentLogs: () => Promise<void>;

    addList: (name: string, description?: string) => Promise<void>;
    updateList: (id: string, updates: Partial<TargetList>) => Promise<void>;
    deleteList: (id: string) => Promise<void>;

    addSegment: (input: CreateSegmentInput) => Promise<void>;
    updateSegment: (id: string, updates: Partial<CreateSegmentInput>) => Promise<void>;
    deleteSegment: (id: string) => Promise<void>;

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

    // Search
    searchQuery: string;
    searchTimeout: NodeJS.Timeout | null;
    setSearchQuery: (query: string) => void;

    // Duplicates
    checkDuplicate: (url: string) => Promise<Target[]>;

    // Many-to-Many assignments
    saveTargetAssignments: (targetData: any, listIds: string[]) => Promise<Target | null>;
    bulkSaveTargetAssignments: (targetsData: any[], listIds: string[]) => Promise<Target[]>;
}

export const useTargetsStore = create<TargetsState>((set, get) => ({
    viewMode: 'list',
    lists: [],
    selectedListId: null,
    segments: [],
    selectedSegmentId: null,
    targets: [],
    allMetadataKeys: [],
    isLoading: false,
    error: null,
    recentLogs: [],
    realtimeChannel: null as RealtimeChannel | null,

    // Pagination defaults
    page: 0,
    hasMore: true,
    limit: 50,
    isFetchingMore: false,

    // Search defaults
    searchQuery: '',
    searchTimeout: null,

    setSearchQuery: (query: string) => {
        const { searchTimeout } = get();
        if (searchTimeout) clearTimeout(searchTimeout);

        set({ searchQuery: query, hasMore: false });

        const timeout = setTimeout(() => {
            set({ page: 0, hasMore: true, targets: [], isLoading: true });
            get().fetchTargets();
        }, 500);

        set({ searchTimeout: timeout });
    },

    setViewMode: (mode) => {
        const currentMode = get().viewMode;
        if (currentMode === mode && (mode === 'list' || mode === 'segment')) return; // No change needed

        set({ viewMode: mode, page: 0, hasMore: true, targets: [] }); // Reset pagination and targets on view change

        if (mode === 'all' || mode === 'engaged') {
            get().fetchLists(true); // This also calls fetchRecentLogs()
            get().fetchTargets();
        } else if (mode === 'list' && !get().selectedListId && get().lists.length > 0) {
            // only select first list if we don't have one selected yet
            get().setSelectedListId(get().lists[0].id);
        } else if (mode === 'segment' && !get().selectedSegmentId && get().segments.length > 0) {
            get().setSelectedSegmentId(get().segments[0].id);
        }
    },

    lastSelectedListId: null as string | null,

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
                    lastSelectedListId: nextSelectedId || get().lastSelectedListId,
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

    fetchSegments: async (silent = false) => {
        if (!silent) set({ isLoading: true });
        const workspaceId = useWorkspaceStore.getState().currentWorkspace?.id;
        if (!workspaceId) {
            set({ isLoading: false });
            return;
        }

        const { data, error } = await segmentService.getSegments(workspaceId);

        if (error) {
            set({ error: error.message, isLoading: false });
            toast.error(`Failed to fetch segments: ${error.message}`);
        } else {
            const fetchedSegments = data || [];
            const currentSelectedId = get().selectedSegmentId;
            const isSelectedValid = fetchedSegments.some(s => s.id === currentSelectedId);

            if (!isSelectedValid) {
                const nextSelectedId = fetchedSegments.length > 0 ? fetchedSegments[0].id : null;
                set({
                    segments: fetchedSegments,
                    selectedSegmentId: nextSelectedId,
                    isLoading: false
                });
                if (nextSelectedId && get().viewMode === 'segment') {
                    get().fetchTargets();
                }
            } else {
                set({ segments: fetchedSegments, isLoading: false });
                if (currentSelectedId && get().viewMode === 'segment') {
                    get().fetchTargets(undefined, true);
                }
            }
        }
    },

    setSelectedSegmentId: (id) => {
        set({ selectedSegmentId: id });
        if (id && get().viewMode === 'segment') {
            get().fetchTargets();
        }
    },

    setSelectedListId: (id) => {
        set({ selectedListId: id });
        if (id) {
            set({ lastSelectedListId: id });
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
        let hasMoreToLoad = false;
        let dbData: any[] = []; // Hoist declaration

        try {
            if (viewMode === 'segment') {
                const workspaceId = useWorkspaceStore.getState().currentWorkspace?.id;
                const segment = get().segments.find(s => s.id === get().selectedSegmentId);
                if (workspaceId && segment) {
                    const result = await segmentService.getTargetsByFilters(workspaceId, segment.filters, offset, limit);
                    newData = result.data || [];
                    error = result.error;
                    if (newData.length >= limit) hasMoreToLoad = true;
                }
            } else if (viewMode === 'all') {
                const workspaceId = useWorkspaceStore.getState().currentWorkspace?.id;
                if (workspaceId) {
                    const result = await targetService.getAllWorkspaceTargets(workspaceId, offset, limit, get().searchQuery);
                    newData = result.data || [];
                    error = result.error;
                    if (newData.length >= limit) hasMoreToLoad = true;
                }
            } else if (viewMode === 'engaged') {
                const workspaceId = useWorkspaceStore.getState().currentWorkspace?.id;
                const session = useAuthStore.getState().session;

                if (workspaceId && session?.access_token) {
                    // 1. Fetch official engaged targets from DB
                    const result = await targetService.getEngagedWorkspaceTargets(workspaceId, offset, limit, get().searchQuery);
                    dbData = result.data || [];
                    const dbError = result.error;

                    if (dbError) {
                        error = dbError;
                    } else {
                        // 2. Fetch engagement logs for this page
                        try {
                            const logs = await window.api.engagement.getLogs(session.access_token, {
                                limit,
                                offset,
                                searchQuery: get().searchQuery
                            });

                            // Check raw counts for pagination continuation
                            if ((dbData?.length || 0) >= limit || logs.length >= limit) {
                                hasMoreToLoad = true;
                            }

                            // 3. Merge targets and logs (similar to fetchTargets)
                            const virtualTargets: any[] = [];
                            const latestLogsByUsername = new Map<string, any>();

                            logs.forEach((log: any) => {
                                // Filter out passive actions
                                if (['scan', 'view', 'visit', 'search', 'analyze'].includes(log.action_type)) return;

                                const username = log.target_username?.toLowerCase();
                                if (username && !latestLogsByUsername.has(username)) {
                                    latestLogsByUsername.set(username, log);
                                }
                            });

                            latestLogsByUsername.forEach((log, username) => {
                                // Check if this user is in the current DB batch
                                const inCurrentBatch = dbData?.some(t => {
                                    const targetUsername = t.metadata?.username?.toLowerCase() ||
                                        t.url?.split('/').pop()?.split('?')[0].toLowerCase();
                                    return targetUsername === username;
                                });

                                // Check if this user is already in the store (previous pages)
                                const inExisting = get().targets.some(t => {
                                    const targetUsername = t.metadata?.username?.toLowerCase() ||
                                        t.url?.split('/').pop()?.split('?')[0].toLowerCase();
                                    return targetUsername === username;
                                });

                                if (!inCurrentBatch && !inExisting) {
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
                                        target_lists: { name: 'Unsaved Discovery' }
                                    });
                                }
                            });

                            // Combine and sort
                            newData = [...(dbData || []), ...virtualTargets];
                            newData.sort((a, b) => {
                                const dateA = new Date(a.last_interaction_at || 0).getTime();
                                const dateB = new Date(b.last_interaction_at || 0).getTime();
                                return dateB - dateA;
                            });

                        } catch (err) {
                            console.error('Failed to merge engagement logs in loadMore:', err);
                            newData = dbData || [];
                        }
                    }
                }
            } else if (selectedListId) {
                const result = await targetService.getTargets(selectedListId, offset, limit, get().searchQuery);
                newData = result.data || [];
                error = result.error;
                if (newData.length >= limit) hasMoreToLoad = true;
            }

            if (error) throw error;

            // Determine hasMore based on RAW data counts, not the deduplicated/merged result
            // If either source returned a full page, we definitely have more to scan
            const rawDbCount = (viewMode === 'engaged' ? (dbData?.length || 0) : newData.length);
            // Note: For 'engaged', we need to check the local logs variable, but it's scoped in the try block
            // effectively we need to move the hasMore calc inside or bubble it up.

            // Let's rely on the fact that if we found *any* raw data that filled the limit, we should continue.
            // However, scope is tricky. Let's simplify:

            // In 'engaged' mode, 'newData' length is not reliable for pagination.

            let addedAny = false;

            if (newData.length > 0) {
                set((state) => {
                    const updatedTargets = [...state.targets];
                    const existingIds = new Set(updatedTargets.map(t => t.id));
                    const existingUsernames = new Set(updatedTargets.map(t => {
                        const u = t.metadata?.username?.toLowerCase() ||
                            t.url?.split('/').pop()?.split('?')[0].toLowerCase();
                        return u;
                    }).filter(Boolean));

                    newData.forEach(newTarget => {
                        const newUsername = newTarget.metadata?.username?.toLowerCase() ||
                            newTarget.url?.split('/').pop()?.split('?')[0].toLowerCase();

                        if (viewMode === 'engaged') {
                            const virtualIndex = updatedTargets.findIndex(t => {
                                if (!t.id.startsWith('virtual-')) return false;
                                const tUsername = t.metadata?.username?.toLowerCase() ||
                                    t.url?.split('/').pop()?.split('?')[0].toLowerCase();
                                return tUsername === newUsername;
                            });

                            if (virtualIndex !== -1) {
                                // Replace virtual with real if it's new
                                updatedTargets[virtualIndex] = newTarget;
                                addedAny = true;
                            } else if (!existingIds.has(newTarget.id) && !existingUsernames.has(newUsername)) {
                                updatedTargets.push(newTarget);
                                addedAny = true;
                            }
                        } else {
                            if (!existingIds.has(newTarget.id)) {
                                updatedTargets.push(newTarget);
                                addedAny = true;
                            }
                        }
                    });

                    // Update metadata keys
                    const newKeys = new Set(get().allMetadataKeys);
                    newData.forEach(t => {
                        if (t.metadata) {
                            Object.keys(t.metadata).forEach(key => newKeys.add(key));
                        }
                    });

                    return {
                        targets: updatedTargets,
                        allMetadataKeys: Array.from(newKeys).sort(),
                        page: nextPage,
                        hasMore: hasMoreToLoad,
                        isFetchingMore: false
                    };
                });
            } else {
                set({ hasMore: hasMoreToLoad, page: nextPage, isFetchingMore: false });
            }

            // Gap handling: If we found no new items (or all were duplicates) but there's more in the DB, fetch again
            if (hasMoreToLoad && !addedAny) {
                setTimeout(() => {
                    const state = get();
                    if (state.hasMore && !state.isFetchingMore) {
                        state.loadMoreTargets();
                    }
                }, 100);
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
        let hasMoreToLoad: boolean | undefined;

        if (get().viewMode === 'all') {
            const workspaceId = useWorkspaceStore.getState().currentWorkspace?.id;
            if (!workspaceId) {
                set({ isLoading: false });
                return;
            }
            ({ data, error } = await targetService.getAllWorkspaceTargets(workspaceId, 0, limit, get().searchQuery));
        } else if (get().viewMode === 'engaged') {
            const workspaceId = useWorkspaceStore.getState().currentWorkspace?.id;
            const session = useAuthStore.getState().session;

            if (!workspaceId || !session?.access_token) {
                set({ isLoading: false });
                return;
            }

            // 1. Fetch official engaged targets
            const { data: targetsData, error: targetsError } = await targetService.getEngagedWorkspaceTargets(workspaceId, 0, limit, get().searchQuery);

            // 2. Fetch engagement logs to create "Virtual Targets" for ad-hoc engagements
            try {
                const logs = await window.api.engagement.getLogs(session.access_token, {
                    limit,
                    searchQuery: get().searchQuery
                });

                // Check raw counts for pagination
                if ((targetsData?.length || 0) >= limit || logs.length >= limit) {
                    hasMoreToLoad = true;
                }

                // 3. Merge targets and logs
                const virtualTargets: any[] = [];
                const latestLogsByUsername = new Map<string, any>();

                // Group logs by username to get the latest interaction for each
                logs.forEach((log: any) => {
                    // Filter out passive actions
                    if (['scan', 'view', 'visit', 'search', 'analyze'].includes(log.action_type)) return;

                    const username = log.target_username?.toLowerCase();
                    if (username && !latestLogsByUsername.has(username)) {
                        latestLogsByUsername.set(username, log);
                    }
                });

                // Group existing targets by username/url too to avoid duplicates in the engaged view
                const groupedExistingTargets = new Map<string, any>();
                (targetsData || []).forEach(t => {
                    const username = t.metadata?.username?.toLowerCase() ||
                        t.url?.split('/').pop()?.split('?')[0].toLowerCase();
                    if (!username) return;

                    if (groupedExistingTargets.has(username)) {
                        const existing = groupedExistingTargets.get(username);
                        // Add this list name to the aggregated list names
                        if (t.target_lists?.name) {
                            existing.all_list_names = [...(existing.all_list_names || []), t.target_lists.name];
                            existing.all_list_ids = [...(existing.all_list_ids || []), t.list_id];
                            existing.list_to_target_map = { ...(existing.list_to_target_map || {}), [t.list_id]: t.id };
                        }
                    } else {
                        groupedExistingTargets.set(username, {
                            ...t,
                            all_list_names: t.target_lists?.name ? [t.target_lists.name] : [],
                            all_list_ids: [t.list_id],
                            list_to_target_map: { [t.list_id]: t.id }
                        });
                    }
                });

                latestLogsByUsername.forEach((log, username) => {
                    // Check if this user is already in our official targets list
                    const existing = groupedExistingTargets.get(username);

                    if (!existing) {
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
                            target_lists: { name: 'Unsaved Discovery' },
                            all_list_names: ['Unsaved Discovery']
                        });
                    }
                });

                data = [...Array.from(groupedExistingTargets.values()), ...virtualTargets];

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
        } else if (get().viewMode === 'segment') {
            const workspaceId = useWorkspaceStore.getState().currentWorkspace?.id;
            const segment = get().segments.find(s => s.id === get().selectedSegmentId);
            if (!workspaceId || !segment) {
                set({ targets: [], isLoading: false });
                return;
            }
            const result = await segmentService.getTargetsByFilters(workspaceId, segment.filters, 0, limit);
            data = result.data;
            error = result.error;
        } else {
            // If explicit listId provided, use it. Otherwise use selectedListId from store
            const idToUse = listId || get().selectedListId;
            if (!idToUse) {
                set({ targets: [], isLoading: false });
                return;
            }
            ({ data, error } = await targetService.getTargets(idToUse, 0, limit, get().searchQuery));
        }

        if (error) {
            set({ error: error.message, isLoading: false });
            toast.error(`Failed to fetch targets: ${error.message}`);
        } else {
            const fetchedTargets = data || [];

            // Extract metadata keys
            const newKeys = new Set(get().allMetadataKeys);
            fetchedTargets.forEach(t => {
                if (t.metadata) {
                    Object.keys(t.metadata).forEach(key => newKeys.add(key));
                }
            });

            set({
                targets: fetchedTargets,
                allMetadataKeys: Array.from(newKeys).sort(),
                isLoading: false,
                // Check if we have more to load based on raw counts check if available, 
                // otherwise fallback to data length (safe for non-engaged views)
                hasMore: typeof hasMoreToLoad !== 'undefined' ? hasMoreToLoad : fetchedTargets.length >= limit
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

    addSegment: async (input: CreateSegmentInput) => {
        const workspaceId = useWorkspaceStore.getState().currentWorkspace?.id;
        const userId = useAuthStore.getState().user?.id;
        if (!workspaceId || !userId) return;

        set({ isLoading: true });
        const { data, error } = await segmentService.createSegment(workspaceId, userId, input);
        if (error) {
            toast.error(`Failed to create segment: ${error.message}`);
        } else if (data) {
            set({
                segments: [data, ...get().segments],
                selectedSegmentId: data.id,
                viewMode: 'segment'
            });
            toast.success('Segment created successfully');
            get().fetchTargets();
        }
        set({ isLoading: false });
    },

    updateSegment: async (id: string, updates: Partial<CreateSegmentInput>) => {
        set({ isLoading: true });
        const { data, error } = await segmentService.updateSegment(id, updates);
        if (error) {
            toast.error(`Failed to update segment: ${error.message}`);
        } else if (data) {
            set({
                segments: get().segments.map(s => s.id === id ? data : s)
            });
            toast.success('Segment updated');
            if (get().selectedSegmentId === id && get().viewMode === 'segment') {
                get().fetchTargets();
            }
        }
        set({ isLoading: false });
    },

    deleteSegment: async (id: string) => {
        const { error } = await segmentService.deleteSegment(id);
        if (error) {
            toast.error(`Failed to delete segment: ${error.message}`);
        } else {
            const remainingSegments = get().segments.filter(s => s.id !== id);
            const nextSelectedId = remainingSegments.length > 0 ? remainingSegments[0].id : null;
            set({
                segments: remainingSegments,
                selectedSegmentId: nextSelectedId
            });
            if (get().viewMode === 'segment') {
                if (nextSelectedId) get().fetchTargets();
                else set({ targets: [] });
            }
            toast.success('Segment deleted successfully');
        }
    },

    checkDuplicate: async (url: string) => {
        if (!url) return [];
        const workspaceId = useWorkspaceStore.getState().currentWorkspace?.id;
        if (!workspaceId) return [];

        // Clean URL for better matching (strip query params, trailing slashes)
        const cleanUrl = url.split('?')[0].replace(/\/$/, '').toLowerCase();

        // 1. Check current store first (quick)
        const inStore = get().targets.filter(t => {
            const tUrl = t.url?.split('?')[0].replace(/\/$/, '').toLowerCase();
            return tUrl === cleanUrl && !t.id.startsWith('virtual-');
        });
        if (inStore.length > 0) return inStore;

        // 2. Query DB for a global workspace check
        const { data, error } = await supabase
            .from('targets')
            .select('*')
            .eq('workspace_id', workspaceId)
            .ilike('url', `%${cleanUrl}%`);

        if (error) {
            console.error('Error checking duplicate:', error);
            return [];
        }

        // Exact match check on results
        return (data || []).filter(match => {
            const mUrl = match.url?.split('?')[0].replace(/\/$/, '').toLowerCase();
            return mUrl === cleanUrl;
        }) as Target[];
    },

    saveTargetAssignments: async (targetData: any, listIds: string[]) => {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
            toast.error('User not authenticated');
            return null;
        }

        const workspaceId = useWorkspaceStore.getState().currentWorkspace?.id;
        if (!workspaceId) {
            toast.error('No active workspace');
            return null;
        }

        set({ isLoading: true });
        try {
            // 1. Upsert target
            const { data: target, error } = await targetService.createTarget({
                ...targetData,
                workspace_id: workspaceId,
                user_id: user.id
            });

            if (error) throw error;
            if (!target) throw new Error('Failed to create target');

            // 2. Sync Assignments
            await targetService.syncTargetAssignments(target.id, listIds);

            // 3. Refresh lists counts and current view
            await get().fetchLists(true);
            await get().fetchTargets(get().selectedListId || undefined, true);

            toast.success('Assignments updated successfully');
            return target;
        } catch (err: any) {
            toast.error(`Failed to save: ${err.message}`);
            return null;
        } finally {
            set({ isLoading: false });
        }
    },

    bulkSaveTargetAssignments: async (targetsData: any[], listIds: string[]) => {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
            toast.error('User not authenticated');
            return [];
        }

        const workspaceId = useWorkspaceStore.getState().currentWorkspace?.id;
        if (!workspaceId) {
            toast.error('No active workspace');
            return [];
        }

        set({ isLoading: true });
        const savedTargets: Target[] = [];
        const errors: string[] = [];

        try {
            // Process all targets
            for (const targetData of targetsData) {
                try {
                    // 1. Upsert target
                    const { data: target, error } = await targetService.createTarget({
                        ...targetData,
                        workspace_id: workspaceId,
                        user_id: user.id
                    });

                    if (error) throw error;
                    if (!target) throw new Error('Failed to create target');

                    // 2. Sync Assignments
                    if (listIds.length > 0) {
                        await targetService.syncTargetAssignments(target.id, listIds);
                    }

                    savedTargets.push(target);
                } catch (err: any) {
                    errors.push(targetData.name || 'Unknown');
                }
            }

            // 3. Refresh lists counts and current view ONCE at the end
            await get().fetchLists(true);
            await get().fetchTargets(get().selectedListId || undefined, true);

            // 4. Show single toast
            if (errors.length > 0) {
                toast.warning(`Saved ${savedTargets.length} of ${targetsData.length} targets. ${errors.length} failed.`);
            } else if (listIds.length > 0) {
                toast.success(`Successfully saved ${savedTargets.length} targets to list`);
            }

            return savedTargets;
        } catch (err: any) {
            toast.error(`Bulk save failed: ${err.message}`);
            return savedTargets;
        } finally {
            set({ isLoading: false });
        }
    },

    addTarget: async (targetInput: any) => {
        const { list_id, ...data } = targetInput;
        await get().saveTargetAssignments(data, [list_id]);
    },

    updateTarget: async (id: string, updates: Partial<Target>) => {
        const listIds = (updates as any).list_ids;

        if (id.startsWith('virtual-')) {
            if (!listIds || listIds.length === 0) {
                toast.error('Please select at least one list');
                return;
            }
            const { list_id, ...data } = updates as any;
            await get().saveTargetAssignments(data, listIds);
            return;
        }

        if (listIds) {
            const { list_id, ...data } = updates as any;
            await get().saveTargetAssignments({ ...data, id }, listIds);
        } else {
            const { data, error } = await targetService.updateTarget(id, updates);
            if (error) {
                toast.error(`Failed to update target: ${error.message}`);
            } else if (data) {
                set({
                    targets: get().targets.map(t => t.id === id ? data : t)
                });
                toast.success('Target updated successfully');
            }
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

        const listId = get().selectedListId;
        if (listId) {
            const { error } = await targetService.deleteTargetAssignment(id, listId);
            if (error) {
                toast.error(`Failed to remove assignment: ${error.message}`);
            } else {
                set({
                    targets: get().targets.filter(t => t.id !== id)
                });
                await get().fetchLists(true);
                toast.success('Target removed from list');
            }
        }
    },

    bulkAddTargets: async (targetsInput: any[]) => {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
            toast.error('User not authenticated');
            return;
        }

        const listId = targetsInput[0]?.list_id;
        const workspaceId = useWorkspaceStore.getState().currentWorkspace?.id;

        if (!workspaceId) {
            toast.error('No active workspace');
            return;
        }

        if (listId) {
            const subStore = useSubscriptionStore.getState();
            const limits = subStore.limits;
            const isPro = subStore.isPro();
            const list = get().lists.find(l => l.id === listId);

            if (!isPro && (list?.target_count || 0) + targetsInput.length > limits.target_limit) {
                subStore.openUpgradeModal(
                    "Target Limit Reached",
                    `Free accounts are limited to ${limits.target_limit} targets per list. Upgrade to Pro to add unlimited targets and scale your growth.`
                );
                return;
            }
        }

        set({ isLoading: true });

        try {
            // 1. Deduplicate local input by URL
            const uniqueInputMap = new Map<string, any>();
            targetsInput.forEach(t => {
                const url = t.url?.toLowerCase().trim();
                const cleanUrl = url?.replace(/\/$/, '');
                if (cleanUrl && !uniqueInputMap.has(cleanUrl)) {
                    uniqueInputMap.set(cleanUrl, { ...t, url: cleanUrl });
                }
            });

            const uniqueUrls = Array.from(uniqueInputMap.keys());
            if (uniqueUrls.length === 0) {
                set({ isLoading: false });
                return;
            }

            // 2. Lookup existing IDs for these URLs to enable correct UPSERT
            const existingMap = new Map<string, string>(); // URL -> ID
            const chunkSize = 100;

            for (let i = 0; i < uniqueUrls.length; i += chunkSize) {
                const chunk = uniqueUrls.slice(i, i + chunkSize);
                const { data: existing } = await supabase
                    .from('targets')
                    .select('id, url')
                    .eq('workspace_id', workspaceId)
                    .in('url', chunk);

                existing?.forEach(t => {
                    const matchUrl = t.url?.toLowerCase().trim().replace(/\/$/, '');
                    if (matchUrl) existingMap.set(matchUrl, t.id);
                });
            }

            // 3. Prepare Upsert Payload (Attach IDs to existing, new ones get simple insert)
            const upsertPayload: any[] = [];
            uniqueInputMap.forEach((targetData, url) => {
                const existingId = existingMap.get(url);
                const { list_id, ...data } = targetData; // Remove list_id as it doesn't belong in 'targets' table anymore

                const payloadItem: any = {
                    ...data,
                    user_id: user.id,
                    workspace_id: workspaceId
                };

                if (existingId) {
                    payloadItem.id = existingId;
                }

                upsertPayload.push(payloadItem);
            });

            // 4. Perform Bulk Upsert via Service
            const { data: resultTargets, error } = await targetService.bulkCreateTargets(upsertPayload);
            if (error) throw error;
            if (!resultTargets) throw new Error("No data returned from import");

            // 5. Ensure Assignments
            if (listId && resultTargets.length > 0) {
                const assignments = resultTargets.map(t => ({
                    target_id: t.id,
                    list_id: listId
                }));
                const { error: assignError } = await targetService.bulkCreateAssignments(assignments);
                if (assignError) throw assignError;
            }

            // 6. Update Store
            set((state) => {
                const updatedTargets = [...state.targets];
                const stateIds = new Set(updatedTargets.map(t => t.id));
                let newCount = 0;

                resultTargets.forEach(t => {
                    if (!stateIds.has(t.id)) {
                        updatedTargets.unshift(t);
                        newCount++;
                    } else {
                        // Update existing in place
                        const idx = updatedTargets.findIndex(ut => ut.id === t.id);
                        if (idx !== -1) updatedTargets[idx] = t;
                    }
                });

                const updatedLists = state.lists.map(l =>
                    l.id === listId
                        ? { ...l, target_count: (l.target_count || 0) + newCount }
                        : l
                );

                return { targets: updatedTargets, lists: updatedLists };
            });

            // 7. Refresh & Toast
            get().fetchLists(true);
            if (listId) get().fetchTargets(listId, true);

            toast.success(`Successfully processed ${resultTargets.length} targets`);

        } catch (error: any) {
            toast.error(`Failed to import targets: ${error.message}`);
        } finally {
            set({ isLoading: false });
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
            viewMode: 'list',
            searchQuery: '',
            searchTimeout: null
        });
    }
}));
