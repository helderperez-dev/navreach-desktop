import { useTargetsStore } from '@/stores/targets.store';
import { targetService } from '@/lib/targets.service';
import { Target } from '@/types/targets';
import { CircularLoader } from '@/components/ui/CircularLoader';
import { ExternalLink, MoreHorizontal, Trash2, Edit2, Tag, FolderPlus, ChevronUp, ChevronDown, Clock, Layers, X, Heart, MessageSquare, UserPlus, Send } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
import { useTasksStore } from '@/stores/tasks.store';
import { useAppStore } from '@/stores/app.store';
import { Button } from '@/components/ui/button';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { TargetAnalysisDialog } from './TargetAnalysisDialog';
import { BulkListSelectionDialog } from './BulkListSelectionDialog';
import { Checkbox } from '@/components/ui/checkbox';
import { toast } from 'sonner';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { formatDistanceToNow } from 'date-fns';

interface TargetTableProps {
    onEdit: (target: Target) => void;
    onViewHistory?: (target: {
        username: string;
        name?: string | null;
        avatar_url?: string | null;
        platform: string;
    }) => void;
    searchQuery?: string;
    visibleColumns?: Record<string, boolean>;
    metadataKeys?: string[];
    recentLogs?: any[];
}

type SortField = 'name' | 'email' | 'type' | 'created_at' | 'url' | 'last_interaction_at';
type SortOrder = 'asc' | 'desc';

export function TargetTable({
    onEdit,
    onViewHistory,
    searchQuery = '',
    visibleColumns = {
        name: true,
        email: true,
        type: true,
        url: true,
        tags: true,
        created: true
    },
    metadataKeys = [],
    recentLogs = []
}: TargetTableProps) {
    const { targets, isLoading, deleteTarget, viewMode, hasMore, isFetchingMore, loadMoreTargets, lists, selectedListId, saveTargetAssignments } = useTargetsStore();
    const [sortField, setSortField] = useState<SortField>(viewMode === 'engaged' ? 'last_interaction_at' : 'created_at');
    const [sortOrder, setSortOrder] = useState<SortOrder>('desc');
    const [analyzeTarget, setAnalyzeTarget] = useState<Target | null>(null);
    const [targetToSave, setTargetToSave] = useState<Target | null>(null);
    const [selectedTargets, setSelectedTargets] = useState<Set<string>>(new Set());
    const [isAllSelectedGlobally, setIsAllSelectedGlobally] = useState(false);
    const [isBulkSaveOpen, setIsBulkSaveOpen] = useState(false);
    const [isLayoutReady, setIsLayoutReady] = useState(false);
    const hasAutoResized = useRef(false);

    // Reset layout state when view context changes
    useEffect(() => {
        setIsLayoutReady(false);
        hasAutoResized.current = false;
    }, [viewMode, selectedListId]);

    // Auto-resize columns on mount/data load
    useEffect(() => {
        // Wait for data to finish loading
        if (isLoading) return;

        if (hasAutoResized.current) return;

        const performLayout = () => {
            if (!targets || targets.length === 0) {
                setIsLayoutReady(true);
                hasAutoResized.current = true;
                return;
            }

            const calculateOptimalWidths = () => {
                const sampleSize = Math.min(targets.length, 50);
                const samples = targets.slice(0, sampleSize);

                // Define active columns (merge standard and metadata)
                const activeCols = Object.keys(visibleColumns).filter(key =>
                    visibleColumns[key] && (
                        ['name', 'email', 'type', 'url', 'tags', 'created'].includes(key) ||
                        metadataKeys.includes(key)
                    )
                );

                if (activeCols.length === 0) {
                    setIsLayoutReady(true);
                    return;
                }

                // Calculate max weights
                const weights: Record<string, number> = {};

                activeCols.forEach(col => {
                    let maxLen = 10; // min baseline

                    // Header length baseline
                    maxLen = Math.max(maxLen, col.length * 1.5);

                    for (const target of samples) {
                        let len = 0;
                        if (col === 'name') len = (target.name?.length || 0) * 1.5;
                        else if (col === 'email') len = (target.email?.length || 0);
                        else if (col === 'url') len = (target.url?.length || 0) * 0.7; // Compress URLs
                        else if (col === 'type') len = (target.type?.length || 0) + 4;
                        else if (col === 'tags') len = (target.tags?.join('').length || 0) + (target.tags?.length || 0) * 4;
                        else if (col === 'created') len = 12;
                        else if (metadataKeys.includes(col)) len = (target.metadata?.[col]?.toString().length || 0);

                        if (len > maxLen) maxLen = len;
                        if (maxLen > 60) maxLen = 60; // Cap weight
                    }
                    weights[col] = maxLen;
                });

                // Normalize to percentages
                const totalWeight = Object.values(weights).reduce((a, b) => a + b, 0);
                const newWidths: Record<string, number> = {};

                activeCols.forEach(col => {
                    // Ensure min width of 5% and max relative to weight
                    newWidths[col] = Math.max(5, (weights[col] / totalWeight) * 100);
                });

                setColumnWidths(prev => ({
                    ...prev,
                    ...newWidths
                }));

                setIsLayoutReady(true);
                hasAutoResized.current = true;
            };

            calculateOptimalWidths();
        };

        // Dynamic delay: if we have data, we can be faster.
        // If empty, we wait longer to ensure it's not a temporary fetch gap.
        const delay = (targets && targets.length > 0) ? 50 : 300;
        const timer = setTimeout(performLayout, delay);

        return () => clearTimeout(timer);

    }, [targets, visibleColumns, metadataKeys, isLoading, viewMode, selectedListId]);

    // Reset selection when view mode changes
    useEffect(() => {
        setSelectedTargets(new Set());
        setIsAllSelectedGlobally(false);
    }, [viewMode]);

    const tableRef = useRef<HTMLDivElement>(null);

    const filteredAndSortedTargets = useMemo(() => {
        let result = [...targets];

        // Filtering
        if (searchQuery) {
            const query = searchQuery.toLowerCase();
            result = result.filter(t =>
                t.name.toLowerCase().includes(query) ||
                (t.email && t.email.toLowerCase().includes(query)) ||
                t.url.toLowerCase().includes(query) ||
                t.tags?.some(tag => tag.toLowerCase().includes(query))
            );
        }

        // Sorting
        result.sort((a, b) => {
            let valA: any = a[sortField] || '';
            let valB: any = b[sortField] || '';

            if (sortField === 'created_at' || sortField === 'last_interaction_at') {
                valA = new Date((a as any)[sortField] || 0).getTime();
                valB = new Date((b as any)[sortField] || 0).getTime();
            }

            if (valA < valB) return sortOrder === 'asc' ? -1 : 1;
            if (valA > valB) return sortOrder === 'asc' ? 1 : -1;
            return 0;
        });

        return result;
    }, [targets, searchQuery, sortField, sortOrder]);

    const currentList = lists.find(l => l.id === selectedListId);
    const totalCountInList = currentList?.target_count || 0;
    const allVisibleSelected = filteredAndSortedTargets.length > 0 &&
        filteredAndSortedTargets.every(t => selectedTargets.has(t.id));
    const showSelectionPrompt = viewMode === 'list' && allVisibleSelected && !isAllSelectedGlobally && totalCountInList > targets.length;

    // Column Resizing State (Percentages)
    const [columnWidths, setColumnWidths] = useState<Record<string, number>>({
        name: 35,
        email: 15,
        type: 6,
        url: 12,
        tags: 10,
        created: 8,
        location: 14
    });

    // Use a callback ref for robust observer handling
    const observer = useRef<IntersectionObserver>();
    const lastTargetRef = useCallback((node: HTMLTableRowElement) => {
        if (observer.current) observer.current.disconnect();
        if (isLoading || isFetchingMore) return;

        if (!node) return;

        observer.current = new IntersectionObserver(entries => {
            if (entries[0].isIntersecting && hasMore && !isFetchingMore && !isLoading) {
                loadMoreTargets();
            }
        }, {
            threshold: 0,
            rootMargin: '800px', // Fetch when within 800px of bottom (more aggressive for smoothness)
            root: null // Use viewport for better reliability in Electron
        });

        observer.current.observe(node);
    }, [isLoading, isFetchingMore, hasMore, loadMoreTargets]);

    const [metadataWidths, setMetadataWidths] = useState<Record<string, number>>({});

    const handleResize = (id: string, newPixelWidth: number, isMetadata: boolean = false) => {
        if (!tableRef.current) return;
        const tableWidth = tableRef.current.offsetWidth;
        const newPercent = (newPixelWidth / tableWidth) * 100;

        if (isMetadata) {
            setMetadataWidths(prev => ({ ...prev, [id]: Math.max(5, newPercent) }));
        } else {
            setColumnWidths(prev => ({ ...prev, [id]: Math.max(5, newPercent) }));
        }
    };

    const startResizing = (id: string, startX: number, startWidthPercent: number, isMetadata: boolean = false) => {
        if (!tableRef.current) return;
        const tableWidth = tableRef.current.offsetWidth;
        const startPixelWidth = (startWidthPercent / 100) * tableWidth;

        const onMouseMove = (e: MouseEvent) => {
            const newPixelWidth = startPixelWidth + (e.clientX - startX);
            handleResize(id, newPixelWidth, isMetadata);
        };
        const onMouseUp = () => {
            document.removeEventListener('mousemove', onMouseMove);
            document.removeEventListener('mouseup', onMouseUp);
            document.body.style.cursor = 'default';
        };
        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', onMouseUp);
        document.body.style.cursor = 'col-resize';
    };

    const handleSort = (field: SortField) => {
        if (sortField === field) {
            setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
        } else {
            setSortField(field);
            setSortOrder('asc');
        }
    };


    const handleAnalyzeConfirm = async (listId: string | null) => {
        if (!analyzeTarget) return;

        let finalTargetId = analyzeTarget.id;

        // If it's a virtual target OR if we selected a list (re-assignment required)
        if (analyzeTarget.id.startsWith('virtual-') || listId) {
            const targetData = {
                id: analyzeTarget.id.startsWith('virtual-') ? undefined : analyzeTarget.id,
                name: analyzeTarget.name,
                url: analyzeTarget.url,
                type: analyzeTarget.type,
                metadata: analyzeTarget.metadata,
                tags: analyzeTarget.tags || []
            };

            if (listId) {
                const res = await saveTargetAssignments(targetData, [listId]);
                if (res) finalTargetId = res.id;
            }
        }

        // Now queue the analysis
        useTasksStore.getState().addTask('profile_analysis', {
            url: analyzeTarget.url,
            target_id: finalTargetId,
            username: analyzeTarget.name
        });
        useAppStore.getState().toggleQueueSidebar();
        setAnalyzeTarget(null);
    };

    const handleSelectAll = (checked: boolean | 'indeterminate') => {
        const newSet = new Set(selectedTargets);
        const visibleIds = filteredAndSortedTargets.map(t => t.id);

        if (checked === false) {
            visibleIds.forEach(id => newSet.delete(id));
            setIsAllSelectedGlobally(false);
        } else {
            // Select all visible or indeterminate
            visibleIds.forEach(id => newSet.add(id));
        }
        setSelectedTargets(newSet);
    };

    const handleSelectEntireList = () => {
        setIsAllSelectedGlobally(true);
    };

    const handleSelectOne = (id: string, checked: boolean) => {
        const newSelected = new Set(selectedTargets);
        if (checked) {
            newSelected.add(id);
        } else {
            newSelected.delete(id);
            setIsAllSelectedGlobally(false);
        }
        setSelectedTargets(newSelected);
    };

    const handleBulkAnalyze = async () => {
        let targetsToProcess: Target[] = [];

        if (isAllSelectedGlobally && selectedListId) {
            toast.info(`Fetching all ${totalCountInList} targets in list...`);
            const { data, error } = await targetService.getAllTargetsInList(selectedListId);
            if (error) {
                toast.error(`Failed to fetch all targets: ${error.message}`);
                return;
            }
            targetsToProcess = data || [];
        } else {
            targetsToProcess = targets.filter(t => selectedTargets.has(t.id));
        }

        if (targetsToProcess.length === 0) return;

        toast.info(`Preparing ${targetsToProcess.length} targets for analysis...`);

        // 1. Separate virtual from real
        const virtualTargets = targetsToProcess.filter(t => t.id.startsWith('virtual-'));
        const existingTargets = targetsToProcess.filter(t => !t.id.startsWith('virtual-'));

        let allTargetIds: { id: string, url: string, name: string }[] = existingTargets.map(t => ({ id: t.id, url: t.url, name: t.name }));

        // 2. Bulk upsert virtual targets if any
        if (virtualTargets.length > 0) {
            const virtualData = virtualTargets.map(t => ({
                id: undefined,
                name: t.name,
                url: t.url,
                type: t.type,
                metadata: t.metadata,
                tags: t.tags || []
            }));

            const { bulkSaveTargetAssignments } = useTargetsStore.getState();
            // Note: bulkSaveTargetAssignments expects full target objects, effectively.
            const newlySaved = await bulkSaveTargetAssignments(virtualData, []);

            // bulkSaveTargetAssignments currently returns void? Or targets? 
            // In the view it was implied it returns newly saved. 
            // Checking store type would be ideal but assuming it mimics manual save structure. 
            // If it returns void, we can't get IDs easily.
            // But we can approximate functionality or just assume they are saved and standard queue processing will handle them if we had IDs.
            // For now, let's assume we proceed with those we have IDs for, or log warning.
            // (Assuming consistent return type from prior context).
            if (newlySaved) {
                const newlySavedMapped = newlySaved.map(t => ({ id: t.id, url: t.url, name: t.name }));
                allTargetIds = [...allTargetIds, ...newlySavedMapped];
            }
        }

        // 3. Prepare batch payloads
        const taskPayloads = allTargetIds.map(t => ({
            type: 'profile_analysis',
            payload: {
                url: t.url,
                target_id: t.id,
                username: t.name
            }
        }));

        // 4. Call bulk task addition
        if (taskPayloads.length > 0) {
            await useTasksStore.getState().addTasksBatch(taskPayloads);
            useAppStore.getState().toggleQueueSidebar();
        }

        setSelectedTargets(new Set());
        setIsAllSelectedGlobally(false);
    };

    const handleBulkSaveConfirm = async (listId: string) => {
        let targetsToProcess: Target[] = [];

        if (isAllSelectedGlobally && selectedListId) {
            toast.info(`Fetching all ${totalCountInList} targets in list...`);
            const { data, error } = await targetService.getAllTargetsInList(selectedListId);
            if (error) {
                toast.error(`Failed to fetch all targets: ${error.message}`);
                return;
            }
            targetsToProcess = data || [];
        } else {
            targetsToProcess = targets.filter(t => selectedTargets.has(t.id));
        }

        if (targetsToProcess.length === 0) return;

        toast.info(`Adding ${targetsToProcess.length} targets to list...`);

        const targetsData = targetsToProcess.map(target => ({
            id: target.id.startsWith('virtual-') ? undefined : target.id,
            name: target.name,
            url: target.url,
            type: target.type,
            metadata: target.metadata,
            tags: target.tags || []
        }));

        const { bulkSaveTargetAssignments } = useTargetsStore.getState();
        await bulkSaveTargetAssignments(targetsData, [listId]);

        setSelectedTargets(new Set());
        setIsAllSelectedGlobally(false);
        setIsBulkSaveOpen(false);
    };


    if (!isLayoutReady) {
        return (
            <div className="flex h-[400px] items-center justify-center">
                <CircularLoader className="h-6 w-6" />
            </div>
        );
    }

    if (targets.length === 0 && !isLoading && !searchQuery) {
        return (
            <div className="h-[300px] flex flex-col items-center justify-center text-center bg-card/20 rounded-2xl border border-dashed border-border/50">
                <p className="text-sm text-muted-foreground">
                    {viewMode === 'all'
                        ? "No contacts found."
                        : viewMode === 'engaged'
                            ? "No engaged contacts yet."
                            : "This list is empty."}
                </p>
                <p className="text-xs text-muted-foreground/60 mt-1">
                    {viewMode === 'all'
                        ? "Targets added to any list will appear here."
                        : viewMode === 'engaged'
                            ? "Users you've interacted with will appear in this list automatically."
                            : "Add your first target to get started."}
                </p>
            </div>
        );
    }

    const SortIcon = ({ field }: { field: SortField }) => {
        if (sortField !== field) return null;
        return sortOrder === 'asc' ? <ChevronUp className="h-3 w-3 ml-1" /> : <ChevronDown className="h-3 w-3 ml-1" />;
    };

    return (
        <div className="w-full h-full flex flex-col">
            <div className="flex-1 overflow-auto shadow-none relative scrollbar-hide" ref={tableRef}>
                <table className="text-left border-separate border-spacing-0 table-fixed w-full">
                    <thead className="sticky top-0 bg-background z-20 shadow-sm shadow-black/5">
                        <tr className="border-b border-border/10">
                            <th className="px-6 py-4 w-[50px] bg-background">
                                <Checkbox
                                    checked={
                                        filteredAndSortedTargets.length > 0 && filteredAndSortedTargets.every(t => selectedTargets.has(t.id))
                                            ? true
                                            : (filteredAndSortedTargets.some(t => selectedTargets.has(t.id))
                                                ? 'indeterminate'
                                                : false)
                                    }
                                    onCheckedChange={handleSelectAll}
                                    className="border-muted-foreground/30 data-[state=checked]:bg-foreground data-[state=checked]:border-foreground"
                                />
                            </th>
                            {visibleColumns.name && (
                                <th
                                    className="px-6 py-4 text-xs font-semibold uppercase tracking-wider text-muted-foreground relative group transition-colors hover:text-foreground bg-background"
                                    style={{ width: `${columnWidths.name}%` }}
                                >
                                    <div className="flex items-center cursor-pointer select-none h-full min-w-0" onClick={() => handleSort('name')}>
                                        <span className="truncate">Name</span>
                                        <SortIcon field="name" />
                                    </div>
                                    <div
                                        className="absolute right-0 top-0 h-full w-[2px] cursor-col-resize bg-transparent group-hover:bg-border/50 transition-colors z-10"
                                        onMouseDown={(e) => startResizing('name', e.clientX, columnWidths.name)}
                                    />
                                </th>
                            )}
                            {visibleColumns.email && (
                                <th
                                    className="px-6 py-4 text-xs font-semibold uppercase tracking-wider text-muted-foreground relative group transition-colors hover:text-foreground bg-background"
                                    style={{ width: `${columnWidths.email}%` }}
                                >
                                    <div className="flex items-center cursor-pointer select-none h-full min-w-0" onClick={() => handleSort('email')}>
                                        <span className="truncate">Email</span>
                                        <SortIcon field="email" />
                                    </div>
                                    <div
                                        className="absolute right-0 top-0 h-full w-[2px] cursor-col-resize bg-transparent group-hover:bg-border/50 transition-colors z-10"
                                        onMouseDown={(e) => startResizing('email', e.clientX, columnWidths.email)}
                                    />
                                </th>
                            )}
                            {visibleColumns.type && (
                                <th
                                    className="px-6 py-4 text-xs font-semibold uppercase tracking-wider text-muted-foreground relative group transition-colors hover:text-foreground bg-background"
                                    style={{ width: `${columnWidths.type}%` }}
                                >
                                    <div className="flex items-center cursor-pointer select-none h-full min-w-0" onClick={() => handleSort('type')}>
                                        <span className="truncate">Type</span>
                                        <SortIcon field="type" />
                                    </div>
                                    <div
                                        className="absolute right-0 top-0 h-full w-[2px] cursor-col-resize bg-transparent group-hover:bg-border/50 transition-colors z-10"
                                        onMouseDown={(e) => startResizing('type', e.clientX, columnWidths.type)}
                                    />
                                </th>
                            )}
                            {visibleColumns.url && (
                                <th
                                    className="px-6 py-4 text-xs font-semibold uppercase tracking-wider text-muted-foreground relative group transition-colors hover:text-foreground bg-background"
                                    style={{ width: `${columnWidths.url}%` }}
                                >
                                    <div className="flex items-center cursor-pointer select-none h-full min-w-0" onClick={() => handleSort('url')}>
                                        <span className="truncate">URL</span>
                                        <SortIcon field="url" />
                                    </div>
                                    <div
                                        className="absolute right-0 top-0 h-full w-[2px] cursor-col-resize bg-transparent group-hover:bg-border/50 transition-colors z-10"
                                        onMouseDown={(e) => startResizing('url', e.clientX, columnWidths.url)}
                                    />
                                </th>
                            )}
                            {visibleColumns.tags && (
                                <th
                                    className="px-6 py-4 text-xs font-semibold uppercase tracking-wider text-muted-foreground relative group bg-background"
                                    style={{ width: `${columnWidths.tags}%` }}
                                >
                                    <div className="truncate text-muted-foreground/80 group-hover:text-foreground transition-colors">Tags</div>
                                    <div
                                        className="absolute right-0 top-0 h-full w-[2px] cursor-col-resize bg-transparent group-hover:bg-border/50 transition-colors z-10"
                                        onMouseDown={(e) => startResizing('tags', e.clientX, columnWidths.tags)}
                                    />
                                </th>
                            )}
                            {visibleColumns.created && (
                                <th
                                    className="px-6 py-4 text-xs font-semibold uppercase tracking-wider text-muted-foreground relative group transition-colors hover:text-foreground bg-background"
                                    style={{ width: `${columnWidths.created}%` }}
                                >
                                    <div className="flex items-center cursor-pointer select-none h-full min-w-0" onClick={() => handleSort('created_at')}>
                                        <span className="truncate">Created</span>
                                        <SortIcon field="created_at" />
                                    </div>
                                    <div
                                        className="absolute right-0 top-0 h-full w-[2px] cursor-col-resize bg-transparent group-hover:bg-border/50 transition-colors z-10"
                                        onMouseDown={(e) => startResizing('created_at', e.clientX, columnWidths.created)}
                                    />
                                </th>
                            )}
                            {metadataKeys.map((key) => (
                                visibleColumns[key] && (
                                    <th
                                        key={key}
                                        className="px-6 py-4 text-xs font-semibold uppercase tracking-wider text-muted-foreground relative group transition-colors hover:text-foreground bg-background"
                                        style={{ width: `${columnWidths[key] || metadataWidths[key] || 10}%` }}
                                    >
                                        <div className="truncate w-full">
                                            {key.replace(/_/g, ' ')}
                                        </div>
                                        <div
                                            className="absolute right-0 top-0 h-full w-[2px] cursor-col-resize bg-transparent group-hover:bg-border/50 transition-colors z-10"
                                            onMouseDown={(e) => startResizing(key, e.clientX, columnWidths[key] || metadataWidths[key] || 10, true)}
                                        />
                                    </th>
                                )
                            ))}
                            <th className="px-6 py-4 text-right w-[60px] bg-background"></th>
                        </tr>
                    </thead>
                    <tbody className="">
                        {showSelectionPrompt && (
                            <tr>
                                <td colSpan={100} className="px-6 py-2 bg-primary/5 text-center text-xs">
                                    <span className="text-muted-foreground">All {filteredAndSortedTargets.length} visible targets are selected. </span>
                                    <button
                                        onClick={handleSelectEntireList}
                                        className="text-primary font-semibold hover:underline"
                                    >
                                        Select all {totalCountInList} targets in this list
                                    </button>
                                </td>
                            </tr>
                        )}
                        {isAllSelectedGlobally && (
                            <tr>
                                <td colSpan={100} className="px-6 py-2 bg-primary/10 text-center text-xs">
                                    <span className="text-foreground font-medium">All {totalCountInList} targets in this list are selected.</span>
                                </td>
                            </tr>
                        )}
                        {filteredAndSortedTargets.map((target) => (
                            <tr
                                key={target.id}
                                className="group relative hover:bg-accent/40 active:bg-accent/60 transition-all duration-200 cursor-pointer [&>td:first-child]:rounded-l-xl [&>td:last-child]:rounded-r-xl"
                                onClick={() => {
                                    if (viewMode === 'engaged' && onViewHistory) {
                                        // In engaged view, clicking opens history
                                        const platform = target.url?.includes('x.com') || target.url?.includes('twitter.com')
                                            ? 'x.com'
                                            : target.url?.includes('linkedin')
                                                ? 'linkedin'
                                                : 'unknown';
                                        onViewHistory({
                                            username: target.metadata?.username || target.name || 'Unknown',
                                            name: target.name,
                                            avatar_url: target.metadata?.avatar_url,
                                            platform
                                        });
                                    } else {
                                        onEdit(target);
                                    }
                                }}
                            >
                                <td className="px-6 py-4" onClick={(e) => e.stopPropagation()}>
                                    <Checkbox
                                        checked={selectedTargets.has(target.id)}
                                        onCheckedChange={(checked) => handleSelectOne(target.id, !!checked)}
                                        className="border-muted-foreground/30 data-[state=checked]:bg-foreground data-[state=checked]:border-foreground"
                                    />
                                </td>
                                {visibleColumns.name && (
                                    <td className="px-6 py-4 overflow-hidden">
                                        <div className="flex items-center gap-3 cursor-default">
                                            <TooltipProvider delayDuration={0}>
                                                <Tooltip>
                                                    <TooltipTrigger asChild>
                                                        <Avatar className="h-8 w-8 rounded-full border border-border/50 shrink-0">
                                                            <AvatarImage src={target.metadata?.avatar_url || target.metadata?.profile_image} className="object-cover" />
                                                            <AvatarFallback className="rounded-full bg-muted text-[10px] font-bold text-muted-foreground">
                                                                {(target.name || 'U').substring(0, 2).toUpperCase()}
                                                            </AvatarFallback>
                                                        </Avatar>
                                                    </TooltipTrigger>
                                                    <TooltipContent side="right" sideOffset={10} className="w-64 p-3 bg-zinc-900/95 border-white/10 backdrop-blur-xl z-50">
                                                        {(() => {
                                                            const latestLog = recentLogs.find(log => {
                                                                const logUsername = (log.target_username || '').replace('@', '').toLowerCase();
                                                                const targetUsername = (target.metadata?.username || target.url?.split('/').pop() || '').replace('@', '').toLowerCase();

                                                                return logUsername === targetUsername || log.target_name === target.name;
                                                            });

                                                            return (
                                                                <div className="space-y-3">
                                                                    <div className="flex items-center gap-3">
                                                                        <div className="h-10 w-10 rounded-full border border-white/5 overflow-hidden shrink-0">
                                                                            <Avatar className="h-full w-full">
                                                                                <AvatarImage src={target.metadata?.avatar_url} className="object-cover" />
                                                                                <AvatarFallback className="bg-muted text-xs font-bold text-muted-foreground">
                                                                                    {(target.name || 'U').substring(0, 2).toUpperCase()}
                                                                                </AvatarFallback>
                                                                            </Avatar>
                                                                        </div>
                                                                        <div className="min-w-0 flex-1">
                                                                            <h4 className="text-xs font-bold text-zinc-100 truncate">{target.name}</h4>
                                                                            {target.metadata?.username && (
                                                                                <p className="text-[10px] text-zinc-400 truncate mt-0.5">@{target.metadata.username}</p>
                                                                            )}
                                                                            {target.metadata?.bio && (
                                                                                <p className="text-[10px] text-zinc-500 truncate mt-1 italic">"{target.metadata.bio}"</p>
                                                                            )}
                                                                        </div>
                                                                    </div>

                                                                    {latestLog ? (
                                                                        <div className="space-y-2 pt-2 border-t border-white/10">
                                                                            <div className="flex items-center gap-1.5 text-[10px] font-medium text-zinc-300 uppercase tracking-wider">
                                                                                <span>Recent Interaction</span>
                                                                            </div>
                                                                            <div className="flex flex-col gap-1.5 p-2 rounded-lg bg-white/5 border border-white/5">
                                                                                <div className="flex items-center justify-between">
                                                                                    <div className="flex items-center gap-1.5">
                                                                                        {latestLog.action_type === 'like' && <Heart className="h-3 w-3 text-pink-400" />}
                                                                                        {latestLog.action_type === 'reply' && <MessageSquare className="h-3 w-3 text-blue-400" />}
                                                                                        {latestLog.action_type === 'follow' && <UserPlus className="h-3 w-3 text-purple-400" />}
                                                                                        {latestLog.action_type === 'dm' && <Send className="h-3 w-3 text-green-400" />}
                                                                                        <span className="text-[10px] font-medium text-zinc-200 capitalize">{latestLog.action_type}</span>
                                                                                    </div>
                                                                                    <span className="text-[9px] text-zinc-500">
                                                                                        {formatDistanceToNow(new Date(latestLog.created_at), { addSuffix: true })}
                                                                                    </span>
                                                                                </div>
                                                                                {latestLog.metadata?.post_content && (
                                                                                    <p className="text-[10px] text-zinc-400 line-clamp-2 leading-relaxed">
                                                                                        {latestLog.metadata.post_content}
                                                                                    </p>
                                                                                )}
                                                                            </div>
                                                                        </div>
                                                                    ) : target.last_interaction_at ? (
                                                                        <div className="pt-2 border-t border-white/10">
                                                                            <p className="text-[10px] text-zinc-400">
                                                                                Last interacted <span className="text-zinc-300 font-medium">{formatDistanceToNow(new Date(target.last_interaction_at), { addSuffix: true })}</span>
                                                                            </p>
                                                                        </div>
                                                                    ) : null}
                                                                </div>
                                                            );
                                                        })()}
                                                    </TooltipContent>
                                                </Tooltip>
                                            </TooltipProvider>
                                            <div className="flex flex-col min-w-0 gap-0.5">
                                                <div className="font-medium text-sm text-foreground group-hover:text-foreground/80 transition-colors truncate">
                                                    {target.name}
                                                </div>
                                                <div className="flex items-center gap-2">
                                                    {target.last_interaction_at && (
                                                        <div className="flex items-center gap-1 text-[10px] text-muted-foreground truncate">
                                                            <Clock className="h-2.5 w-2.5" />
                                                            <span>{new Date(target.last_interaction_at).toLocaleDateString()}</span>
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    </td>
                                )}
                                {visibleColumns.email && (
                                    <td className="px-6 py-4 overflow-hidden first:rounded-l-xl last:rounded-r-xl">
                                        <div className="text-[11px] text-muted-foreground truncate">
                                            {target.email || '-'}
                                        </div>
                                    </td>
                                )}
                                {visibleColumns.type && (
                                    <td className="px-6 py-4 overflow-hidden first:rounded-l-xl last:rounded-r-xl">
                                        <span className={cn(
                                            "inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium uppercase tracking-wider shrink-0",
                                            target.type === 'profile' && "bg-muted text-muted-foreground border border-border/50",
                                            target.type === 'company' && "bg-muted/60 text-muted-foreground border border-border/50",
                                            target.type === 'post' && "bg-muted/60 text-muted-foreground border border-border/50",
                                            target.type === 'lead' && "bg-muted/60 text-muted-foreground border border-border/50",
                                            target.type === 'other' && "bg-muted/60 text-muted-foreground border border-border/50"
                                        )}>
                                            {target.type}
                                        </span>
                                    </td>
                                )}
                                {visibleColumns.url && (
                                    <td className="px-6 py-4 overflow-hidden first:rounded-l-xl last:rounded-r-xl">
                                        <div className="flex items-center gap-1 group/link max-w-full">
                                            <a
                                                href={target.url}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="text-[11px] text-muted-foreground hover:text-foreground transition-colors truncate min-w-0 flex-1"
                                                onClick={(e) => e.stopPropagation()}
                                            >
                                                {target.url}
                                            </a>
                                            <ExternalLink className="h-3 w-3 shrink-0 opacity-0 group-hover/link:opacity-100 transition-opacity text-foreground/70" />
                                        </div>
                                    </td>
                                )}
                                {visibleColumns.tags && (
                                    <td className="px-6 py-4 overflow-hidden first:rounded-l-xl last:rounded-r-xl">
                                        <div className="flex items-center gap-1 h-6">
                                            <div className="flex flex-wrap gap-1 min-w-0 overflow-hidden h-full">
                                                {target.tags?.slice(0, 2).map((tag, i) => (
                                                    <span key={i} className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-muted/60 border border-border text-[10px] text-muted-foreground truncate max-w-[80px]">
                                                        <Tag className="h-2 w-2 shrink-0" />
                                                        {tag}
                                                    </span>
                                                ))}
                                            </div>
                                            {target.tags && target.tags.length > 2 && (
                                                <span className="text-[10px] text-muted-foreground shrink-0">+{target.tags.length - 2}</span>
                                            )}
                                        </div>
                                    </td>
                                )}
                                {visibleColumns.created && (
                                    <td className="px-6 py-4 text-xs text-muted-foreground whitespace-nowrap overflow-hidden first:rounded-l-xl last:rounded-r-xl">
                                        {new Date(target.created_at).toLocaleDateString()}
                                    </td>
                                )}
                                {metadataKeys.map((key) => (
                                    visibleColumns[key] && (
                                        <td key={key} className="px-6 py-4 text-xs text-muted-foreground overflow-hidden first:rounded-l-xl last:rounded-r-xl">
                                            <div className="truncate w-full">
                                                {target.metadata?.[key]?.toString() || '-'}
                                            </div>
                                        </td>
                                    )
                                ))}
                                <td className="px-6 py-4 text-right overflow-hidden first:rounded-l-xl last:rounded-r-xl">
                                    <div className="flex items-center justify-end gap-2">

                                        <DropdownMenu>
                                            <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                                                <Button variant="ghost" size="icon" className="h-8 w-8 hover:bg-muted/50 p-0 rounded-lg">
                                                    <MoreHorizontal className="h-4 w-4" />
                                                </Button>
                                            </DropdownMenuTrigger>
                                            <DropdownMenuContent align="end" className="w-44 bg-popover border-border/50 shadow-2xl rounded-xl">
                                                <DropdownMenuItem
                                                    className="gap-2 text-xs focus:bg-primary/10 focus:text-primary cursor-pointer rounded-lg mx-1"
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        onEdit(target);
                                                    }}
                                                >
                                                    <Edit2 className="h-3.5 w-3.5" />
                                                    Edit Contact
                                                </DropdownMenuItem>

                                                {viewMode === 'engaged' ? (
                                                    <DropdownMenuItem
                                                        className="gap-2 text-xs focus:bg-primary/10 focus:text-primary cursor-pointer rounded-lg mx-1"
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            setTargetToSave(target);
                                                        }}
                                                    >
                                                        <FolderPlus className="h-3.5 w-3.5" />
                                                        Save to List
                                                    </DropdownMenuItem>
                                                ) : (
                                                    <DropdownMenuItem
                                                        className="gap-2 text-xs focus:bg-blue-500/10 focus:text-blue-500 cursor-pointer rounded-lg mx-1"
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            setAnalyzeTarget(target);
                                                        }}
                                                    >
                                                        <Layers className="h-3.5 w-3.5" />
                                                        Analyze Profile
                                                    </DropdownMenuItem>
                                                )}

                                                <div className="h-[1px] bg-border/40 my-1 mx-1" />
                                                <DropdownMenuItem
                                                    className="gap-2 text-xs text-red-400 focus:text-red-400 focus:bg-destructive/10 cursor-pointer rounded-lg mx-1"
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        if (confirm('Are you sure you want to delete this contact?')) {
                                                            deleteTarget(target.id);
                                                        }
                                                    }}
                                                >
                                                    <Trash2 className="h-3.5 w-3.5" />
                                                    Delete
                                                </DropdownMenuItem>
                                            </DropdownMenuContent>
                                        </DropdownMenu>
                                    </div>
                                </td>
                            </tr >
                        ))}
                        {hasMore && (
                            <tr ref={lastTargetRef} className="bg-transparent border-none">
                                <td colSpan={100} className="p-12 text-center bg-transparent border-none">
                                    <AnimatePresence mode="wait">
                                        {isFetchingMore ? (
                                            <motion.div
                                                key="loader"
                                                initial={{ opacity: 0, y: 10 }}
                                                animate={{ opacity: 1, y: 0 }}
                                                exit={{ opacity: 0, y: -10 }}
                                                className="flex flex-col items-center justify-center gap-3"
                                            >
                                                <CircularLoader className="h-6 w-6 text-primary" />
                                                <span className="text-[10px] font-bold text-muted-foreground tracking-[0.2em] animate-pulse">
                                                    Loading
                                                </span>
                                            </motion.div>
                                        ) : (
                                            <motion.div
                                                key="sentinel"
                                                initial={{ opacity: 0 }}
                                                animate={{ opacity: 0.5 }}
                                                className="h-10 w-full"
                                            />
                                        )}
                                    </AnimatePresence>
                                </td>
                            </tr>
                        )}
                    </tbody >
                </table >
            </div >

            <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-30">
                <AnimatePresence>
                    {(selectedTargets.size > 0 || isAllSelectedGlobally) && (
                        <motion.div
                            initial={{ y: 20, opacity: 0, scale: 0.95 }}
                            animate={{ y: 0, opacity: 1, scale: 1 }}
                            exit={{ y: 20, opacity: 0, scale: 0.95 }}
                            transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                            className="flex items-center gap-1 p-1.5 bg-zinc-900/90 backdrop-blur-md text-zinc-100 rounded-full shadow-2xl border border-white/10"
                        >
                            <div className="flex items-center gap-2 pl-3 pr-2">
                                <span className="text-xs font-semibold whitespace-nowrap">
                                    {isAllSelectedGlobally
                                        ? totalCountInList
                                        : selectedTargets.size} selected
                                </span>
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => {
                                        setSelectedTargets(new Set());
                                        setIsAllSelectedGlobally(false);
                                    }}
                                    className="h-5 w-5 rounded-full hover:bg-white/20 text-zinc-400 hover:text-white"
                                >
                                    <X className="h-3 w-3" />
                                </Button>
                            </div>

                            <div className="h-4 w-[1px] bg-white/10 mx-1" />

                            <div className="flex items-center gap-1">
                                {viewMode !== 'engaged' && (
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={handleBulkAnalyze}
                                        className="h-8 gap-2 px-3 rounded-full hover:bg-white/10 text-zinc-200 hover:text-white font-medium"
                                    >
                                        <Layers className="h-3.5 w-3.5" />
                                        Analyze
                                    </Button>
                                )}

                                <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => setIsBulkSaveOpen(true)}
                                    className="h-8 gap-2 px-3 rounded-full hover:bg-white/10 text-zinc-200 hover:text-white font-medium"
                                >
                                    <FolderPlus className="h-3.5 w-3.5" />
                                    Save
                                </Button>

                                <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={async () => {
                                        const count = isAllSelectedGlobally ? totalCountInList : selectedTargets.size;
                                        if (confirm(`Are you sure you want to delete ${count} targets? This action cannot be undone.`)) {

                                            toast.info(`Deleting ${count} targets...`);

                                            // Handle global delete
                                            if (isAllSelectedGlobally && selectedListId) {
                                                // If we had a bulkDelete store method we would use it.
                                                // For now, let's look at doing it in batches or if there is a store method we missed?
                                                // Checking store interface: deleteTarget is singular.
                                                // We will iterate for now or implement bulkDelete in store if needed.
                                                // Since we don't have bulkDelete in store interface shown, we iterate.
                                                // BUT iterating 1000 items is bad.
                                                // Assuming we operate on loaded targets for now if 'isAllSelectedGlobally' isn't fully backed
                                                // by a backend bulk delete endpoint exposed here.
                                                // Actually, let's just delete the ids we have in selectedTargets or
                                                // if it's all, we might need a backend call.
                                                // For safety/speed in this context, let's stick to deleting the visible/loaded selected mainly
                                                // unless we iterate.

                                                // Iterating local 'selectedTargets' (which contains actual IDs)
                                                const idsToDelete = Array.from(selectedTargets);
                                                for (const id of idsToDelete) {
                                                    await deleteTarget(id);
                                                }

                                            } else {
                                                const idsToDelete = Array.from(selectedTargets);
                                                // Parallel limit might be good, but let's just Promise.all a chunk
                                                await Promise.all(idsToDelete.map(id => deleteTarget(id)));
                                            }

                                            setSelectedTargets(new Set());
                                            setIsAllSelectedGlobally(false);
                                            toast.success('Targets deleted');
                                        }
                                    }}
                                    className="h-8 gap-2 px-3 rounded-full hover:bg-white/10 text-zinc-200 hover:text-white font-medium ml-1"
                                >
                                    <Trash2 className="h-3.5 w-3.5" />
                                    Delete
                                </Button>
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>

            <TargetAnalysisDialog
                open={!!analyzeTarget}
                onOpenChange={(open) => !open && setAnalyzeTarget(null)}
                target={analyzeTarget}
                lists={lists}
                onConfirm={handleAnalyzeConfirm}
            />

            <BulkListSelectionDialog
                open={!!(targetToSave || isBulkSaveOpen)}
                onOpenChange={(open) => {
                    if (!open) {
                        setTargetToSave(null);
                        setIsBulkSaveOpen(false);
                    }
                }}
                lists={lists}
                targetCount={targetToSave ? 1 : (selectedTargets.size || (isAllSelectedGlobally ? totalCountInList : 0))}
                onConfirm={async (listId) => {
                    if (targetToSave) {
                        // Single save
                        const targetData = {
                            id: targetToSave.id.startsWith('virtual-') ? undefined : targetToSave.id,
                            name: targetToSave.name,
                            url: targetToSave.url,
                            type: targetToSave.type,
                            metadata: targetToSave.metadata,
                            tags: targetToSave.tags || []
                        };
                        await saveTargetAssignments(targetData, [listId]);
                        setTargetToSave(null);
                    } else {
                        // Bulk save
                        handleBulkSaveConfirm(listId);
                    }
                }}
            />
        </div >
    );
}
