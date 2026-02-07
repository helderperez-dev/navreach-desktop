import { useState, useRef, useCallback } from 'react';
import { motion } from 'framer-motion';
import { useTargetsStore } from '@/stores/targets.store';
import { useAppStore } from '@/stores/app.store';
import { useSubscriptionStore } from '@/stores/subscription.store';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Plus, List, MoreVertical, Trash2, Edit2, Globe, Clock, Download } from 'lucide-react';
import { ExportDialog } from './ExportDialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { CircularLoader } from '@/components/ui/CircularLoader';
import { SegmentBuilderDialog } from './SegmentBuilderDialog';
import { useConfirmation } from '@/providers/ConfirmationProvider';


export function TargetListSidebar() {
    const {
        lists, selectedListId, setSelectedListId,
        segments, selectedSegmentId, setSelectedSegmentId,
        addList, deleteList, updateList,
        fetchSegments,
        isLoading, viewMode, setViewMode, exportTargets,
        setIsExportModalOpen, setExportListId
    } = useTargetsStore();
    const { confirm } = useConfirmation();
    const { isPro } = useSubscriptionStore();

    const { targetSidebarCollapsed } = useAppStore();
    const [isAdding, setIsAdding] = useState(false);
    const [newListName, setNewListName] = useState('');
    const [renamingId, setRenamingId] = useState<string | null>(null);
    const [renameValue, setRenameValue] = useState('');
    const [activeTab, setActiveTab] = useState<'lists' | 'segments'>('lists');

    // Resize logic
    const [width, setWidth] = useState(400);
    const [isResizingActive, setIsResizingActive] = useState(false);

    const isResizing = useRef(false);

    const startResizing = useCallback((e: React.MouseEvent) => {
        isResizing.current = true;
        setIsResizingActive(true);
        document.addEventListener('mousemove', handleMouseMove);
        document.addEventListener('mouseup', stopResizing);
        document.body.style.cursor = 'col-resize';
        document.body.style.userSelect = 'none';
    }, []);

    const stopResizing = useCallback(() => {
        isResizing.current = false;
        setIsResizingActive(false);
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', stopResizing);
        document.body.style.cursor = 'default';
        document.body.style.userSelect = 'auto';
    }, []);

    const handleMouseMove = useCallback((e: MouseEvent) => {
        if (!isResizing.current) return;
        requestAnimationFrame(() => {
            const newWidth = Math.min(Math.max(160, e.clientX), 450);
            setWidth(newWidth);
        });
    }, []);

    const handleAddList = async (e: React.FormEvent) => {
        e.preventDefault();
        if (newListName.trim()) {
            await addList(newListName.trim());
            setNewListName('');
            setIsAdding(false);
        }
    };

    const handleRename = async (e: React.FormEvent) => {
        e.preventDefault();
        if (renamingId && renameValue.trim()) {
            await updateList(renamingId, { name: renameValue.trim() });
            setRenamingId(null);
            setRenameValue('');
        }
    };

    const startRenaming = (list: any) => {
        setRenamingId(list.id);
        setRenameValue(list.name);
    };

    const [segmentBuilderOpen, setSegmentBuilderOpen] = useState(false);
    const [editingSegmentId, setEditingSegmentId] = useState<string | null>(null);

    const handleAddSegment = () => {
        setEditingSegmentId(null);
        setSegmentBuilderOpen(true);
    };

    const handleEditSegment = (id: string) => {
        setEditingSegmentId(id);
        setSegmentBuilderOpen(true);
    };

    return (
        <motion.div
            initial={false}
            animate={{
                width: targetSidebarCollapsed ? 0 : width,
                opacity: targetSidebarCollapsed ? 0 : 1
            }}
            transition={{
                duration: isResizingActive ? 0 : 0.2,
                ease: 'easeInOut',
                opacity: { duration: 0.2 }
            }}
            className={cn(
                "relative border-r border-border/10 bg-card/10 flex flex-col h-full group/sidebar overflow-hidden shrink-0 transition-colors duration-300",
                isResizingActive && "border-border/50 bg-muted/5",
                targetSidebarCollapsed && "border-r-0"
            )}
        >
            <div className="flex flex-col h-full w-full" style={{ width: `${width}px` }}>
                <div className="p-2 pb-0 space-y-1">
                    <div
                        className={cn(
                            "group flex items-center px-4 py-2.5 rounded-xl transition-all cursor-pointer",
                            viewMode === 'all'
                                ? "bg-secondary/40 text-foreground"
                                : "hover:bg-secondary/20 text-muted-foreground/70 hover:text-foreground"
                        )}
                        onClick={() => setViewMode('all')}
                    >
                        <div className="flex-1 font-medium text-[13px]">All Contacts</div>
                    </div>

                    <div
                        className={cn(
                            "group flex items-center px-4 py-2.5 rounded-xl transition-all cursor-pointer",
                            viewMode === 'engaged'
                                ? "bg-secondary/40 text-foreground"
                                : "hover:bg-secondary/20 text-muted-foreground/70 hover:text-foreground"
                        )}
                        onClick={() => setViewMode('engaged')}
                    >
                        <div className="flex-1 font-medium text-[13px]">Engaged</div>
                    </div>
                </div>

                <div className="mt-4 px-4 pb-2">
                    <div className="flex p-1 bg-muted/30 rounded-xl border border-border/5">
                        <button
                            onClick={() => setActiveTab('lists')}
                            className={cn(
                                "flex-1 flex items-center justify-center gap-2 py-2 text-[11px] font-semibold rounded-lg transition-all duration-200",
                                activeTab === 'lists'
                                    ? "bg-background shadow-sm text-foreground border border-border/10"
                                    : "text-muted-foreground hover:text-foreground"
                            )}
                        >
                            Lists
                        </button>
                        <button
                            onClick={() => setActiveTab('segments')}
                            className={cn(
                                "flex-1 flex items-center justify-center gap-2 py-2 text-[11px] font-semibold rounded-lg transition-all duration-200",
                                activeTab === 'segments'
                                    ? "bg-background shadow-sm text-foreground border border-border/10"
                                    : "text-muted-foreground hover:text-foreground"
                            )}
                        >
                            Segments
                        </button>
                    </div>
                </div>

                <div className="px-5 py-3 flex items-center justify-between group/header">
                    <div className="flex items-center gap-2">
                        <h2 className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground/60 truncate">
                            {activeTab === 'lists' ? 'Your Lists' : 'Your Segments'}
                        </h2>
                        {activeTab === 'lists' && !isPro() && (
                            <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-md bg-muted/30 text-muted-foreground/40 border border-border/20">
                                {lists.length}/3
                            </span>
                        )}
                    </div>
                    <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 hover:bg-muted opacity-0 group-hover/header:opacity-100 transition-opacity"
                        onClick={activeTab === 'lists' ? () => setIsAdding(true) : handleAddSegment}
                    >
                        <Plus className="h-3.5 w-3.5" />
                    </Button>
                </div>

                <ScrollArea className="flex-1 w-full">
                    <div className="p-2 space-y-1">
                        {activeTab === 'lists' ? (
                            <>
                                {isLoading && lists.length === 0 && (
                                    <div className="flex justify-center p-4">
                                        <CircularLoader className="h-4 w-4 text-muted-foreground" />
                                    </div>
                                )}

                                {isAdding && (
                                    <form onSubmit={handleAddList} className="px-2 py-2">
                                        <Input
                                            autoFocus
                                            className="bg-muted/50 border-border text-foreground h-10 outline-none focus:border-border hover:border-muted-foreground/30 focus:bg-muted/80 focus-visible:ring-0 focus-visible:ring-offset-0 transition-all duration-300 ease-in-out px-3 rounded-lg text-sm"
                                            placeholder="List name..."
                                            value={newListName}
                                            onChange={(e) => setNewListName(e.target.value)}
                                            onBlur={() => !newListName && setIsAdding(false)}
                                        />
                                    </form>
                                )}

                                {lists.map((list) => (
                                    <div key={list.id} className="min-w-0">
                                        {renamingId === list.id ? (
                                            <form onSubmit={handleRename} className="px-2 py-1">
                                                <Input
                                                    autoFocus
                                                    className="bg-muted/50 border-border text-foreground h-9 outline-none focus:border-border hover:border-muted-foreground/30 focus:bg-muted/80 focus-visible:ring-0 focus-visible:ring-offset-0 transition-all duration-300 ease-in-out px-3 rounded-lg text-sm"
                                                    value={renameValue}
                                                    onChange={(e) => setRenameValue(e.target.value)}
                                                    onBlur={() => setRenamingId(null)}
                                                />
                                            </form>
                                        ) : (
                                            <div
                                                className={cn(
                                                    "group flex items-start gap-3 px-4 py-2.5 rounded-xl transition-all cursor-pointer min-w-0 border border-transparent",
                                                    viewMode === 'list' && selectedListId === list.id
                                                        ? "bg-secondary/40 text-foreground border-border/10"
                                                        : "hover:bg-secondary/20 text-muted-foreground/70 hover:text-foreground"
                                                )}
                                                onClick={() => {
                                                    setViewMode('list');
                                                    setSelectedListId(list.id);
                                                }}
                                            >
                                                <div className="flex-1 min-w-0 font-medium text-[13px] pt-0.5">
                                                    <div className="pr-2 break-words leading-relaxed" title={list.name}>
                                                        {list.name}
                                                    </div>
                                                </div>

                                                <div className="relative flex items-center justify-end w-14 h-7 flex-shrink-0 overflow-visible">
                                                    {list.target_count !== undefined && (
                                                        <span className={cn(
                                                            "px-2 py-0.5 text-[10px] font-bold bg-muted/40 border border-border/20 rounded-md text-muted-foreground transition-all duration-300 whitespace-nowrap",
                                                            "group-hover:bg-muted group-hover:text-foreground group-hover:-translate-x-8"
                                                        )}>
                                                            {list.target_count}
                                                        </span>
                                                    )}

                                                    <div className="absolute right-0 opacity-0 group-hover:opacity-100 transition-all duration-300 translate-x-3 group-hover:translate-x-0 pointer-events-none group-hover:pointer-events-auto">
                                                        <DropdownMenu>
                                                            <DropdownMenuTrigger asChild>
                                                                <Button
                                                                    variant="ghost"
                                                                    size="icon"
                                                                    className="h-7 w-7 p-0 hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
                                                                    onClick={(e) => e.stopPropagation()}
                                                                >
                                                                    <MoreVertical className="h-3.5 w-3.5" />
                                                                </Button>
                                                            </DropdownMenuTrigger>
                                                            <DropdownMenuContent align="end" className="w-40 bg-popover border-border shadow-2xl">
                                                                <DropdownMenuItem
                                                                    className="gap-2 text-xs"
                                                                    onClick={() => startRenaming(list)}
                                                                >
                                                                    <Edit2 className="h-3 w-3" />
                                                                    Rename
                                                                </DropdownMenuItem>
                                                                <DropdownMenuItem
                                                                    className="gap-2 text-xs"
                                                                    onClick={() => {
                                                                        setExportListId(list.id);
                                                                        setIsExportModalOpen(true);
                                                                    }}
                                                                >
                                                                    <Download className="h-3 w-3 text-muted-foreground" />
                                                                    Export
                                                                </DropdownMenuItem>
                                                                <DropdownMenuItem
                                                                    className="gap-2 text-xs text-red-400 focus:text-red-400"
                                                                    onClick={async () => {
                                                                        const confirmed = await confirm({
                                                                            title: 'Delete List',
                                                                            description: `Are you sure you want to delete "${list.name}"? This will not delete the contacts inside, but the list will be removed.`,
                                                                            confirmLabel: 'Delete',
                                                                            variant: 'destructive'
                                                                        });
                                                                        if (confirmed) deleteList(list.id);
                                                                    }}
                                                                >

                                                                    <Trash2 className="h-3 w-3" />
                                                                    Delete
                                                                </DropdownMenuItem>
                                                            </DropdownMenuContent>
                                                        </DropdownMenu>
                                                    </div>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </>
                        ) : (
                            <>
                                {segments.length === 0 && !isLoading && (
                                    <div className="px-4 py-8 text-center">
                                        <div className="mb-3 flex justify-center">
                                            <div className="w-12 h-12 rounded-full bg-muted/20 flex items-center justify-center">
                                                <Clock className="h-6 w-6 text-muted-foreground/30" />
                                            </div>
                                        </div>
                                        <h3 className="text-xs font-semibold text-muted-foreground">No segments yet</h3>
                                        <p className="text-[10px] text-muted-foreground/50 mt-1 max-w-[150px] mx-auto leading-relaxed">
                                            Create a dynamic segment to automatically filter your contacts.
                                        </p>
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            className="mt-4 h-8 text-[10px] font-bold rounded-lg border-border/40 hover:bg-muted/30"
                                            onClick={handleAddSegment}
                                        >
                                            Create Segment
                                        </Button>
                                    </div>
                                )}
                                {segments.map((segment) => (
                                    <div key={segment.id} className="min-w-0">
                                        <div
                                            className={cn(
                                                "group flex items-start gap-3 px-4 py-2.5 rounded-xl transition-all cursor-pointer min-w-0 border border-transparent",
                                                viewMode === 'segment' && selectedSegmentId === segment.id
                                                    ? "bg-secondary/40 text-foreground border-border/10"
                                                    : "hover:bg-secondary/20 text-muted-foreground/70 hover:text-foreground"
                                            )}
                                            onClick={() => {
                                                setViewMode('segment');
                                                setSelectedSegmentId(segment.id);
                                            }}
                                        >
                                            <div className="flex-1 min-w-0 font-medium text-[13px] pt-0.5">
                                                <div className="pr-2 break-words leading-relaxed" title={segment.name}>
                                                    {segment.name}
                                                </div>
                                            </div>
                                            <div className="relative flex items-center justify-end w-14 h-7 flex-shrink-0">
                                                <div className="opacity-0 group-hover:opacity-100 transition-all duration-300">
                                                    <DropdownMenu>
                                                        <DropdownMenuTrigger asChild>
                                                            <Button
                                                                variant="ghost"
                                                                size="icon"
                                                                className="h-7 w-7 p-0 hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
                                                                onClick={(e) => e.stopPropagation()}
                                                            >
                                                                <MoreVertical className="h-3.5 w-3.5" />
                                                            </Button>
                                                        </DropdownMenuTrigger>
                                                        <DropdownMenuContent align="end" className="w-40 bg-popover border-border shadow-2xl">
                                                            <DropdownMenuItem
                                                                className="gap-2 text-xs"
                                                                onClick={() => handleEditSegment(segment.id)}
                                                            >
                                                                <Edit2 className="h-3 w-3" />
                                                                Edit
                                                            </DropdownMenuItem>
                                                            <DropdownMenuItem
                                                                className="gap-2 text-xs"
                                                                onClick={() => {
                                                                    setExportListId(segment.id);
                                                                    setIsExportModalOpen(true);
                                                                }}
                                                            >
                                                                <Download className="h-3 w-3 text-muted-foreground" />
                                                                Export
                                                            </DropdownMenuItem>
                                                            <DropdownMenuItem
                                                                className="gap-2 text-xs text-red-400 focus:text-red-400"
                                                                onClick={async () => {
                                                                    const confirmed = await confirm({
                                                                        title: 'Delete Segment',
                                                                        description: `Are you sure you want to delete "${segment.name}"? This action cannot be undone.`,
                                                                        confirmLabel: 'Delete',
                                                                        variant: 'destructive'
                                                                    });
                                                                    if (confirmed) useTargetsStore.getState().deleteSegment(segment.id);
                                                                }}
                                                            >

                                                                <Trash2 className="h-3 w-3" />
                                                                Delete
                                                            </DropdownMenuItem>
                                                        </DropdownMenuContent>
                                                    </DropdownMenu>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </>
                        )}
                    </div>
                </ScrollArea>

                {/* Resizer Handle */}
                <div
                    className="absolute top-0 -right-[2px] w-[4px] h-full cursor-col-resize z-50 group/handle"
                    onMouseDown={startResizing}
                >
                    <div className={cn(
                        "absolute inset-y-0 right-[1.5px] w-[1px] transition-all duration-200",
                        isResizingActive
                            ? "bg-primary/20 scale-x-[2]"
                            : "bg-transparent group-hover/handle:bg-border"
                    )} />
                </div>
            </div >

            <SegmentBuilderDialog
                open={segmentBuilderOpen}
                onOpenChange={setSegmentBuilderOpen}
                segmentId={editingSegmentId}
            />
        </motion.div >
    );
}
