import { useEffect, useState, useRef, useMemo } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { useTargetsStore } from '@/stores/targets.store';
import { useWorkspaceStore } from '@/stores/workspace.store';
import { TargetListSidebar } from './TargetListSidebar';
import { TargetTable } from './TargetTable';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Plus, Search, Users, X, Zap, Upload, SlidersHorizontal, LayoutGrid, Puzzle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
    DropdownMenuSeparator,
    DropdownMenuCheckboxItem,
} from '@/components/ui/dropdown-menu';
import { TargetForm } from './TargetForm';
import { CSVImportDialog } from './CSVImportDialog';
import { IntegrationDialog } from './IntegrationDialog';
import { Target } from '@/types/targets';
import { Code2 } from 'lucide-react';
import { cn } from '@/lib/utils';

import { CircularLoader } from '@/components/ui/CircularLoader';

export function TargetListView() {
    const { targets, fetchLists, selectedListId, fetchTargets, isLoading } = useTargetsStore();
    const { currentWorkspace } = useWorkspaceStore();
    const [isTargetFormOpen, setIsTargetFormOpen] = useState(false);
    const [isImportOpen, setIsImportOpen] = useState(false);
    const [isIntegrationOpen, setIsIntegrationOpen] = useState(false);
    const [isViewOptionsOpen, setIsViewOptionsOpen] = useState(false);
    const [editingTarget, setEditingTarget] = useState<Target | null>(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [isSearchExpanded, setIsSearchExpanded] = useState(false);
    const [visibleColumns, setVisibleColumns] = useState<Record<string, boolean>>({
        name: true,
        email: true,
        type: true,
        url: true,
        tags: true,
        created: true
    });

    // Discover all unique metadata keys from targets
    const metadataKeys = useMemo(() => {
        const keys = new Set<string>();
        targets.forEach(target => {
            if (target.metadata) {
                Object.keys(target.metadata).forEach(key => keys.add(key));
            }
        });
        return Array.from(keys).sort();
    }, [targets]);

    const searchContainerRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    // Focus input when expanded
    useEffect(() => {
        if (isSearchExpanded && inputRef.current) {
            inputRef.current.focus();
        }
    }, [isSearchExpanded]);

    // Handle click outside to collapse
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (searchContainerRef.current && !searchContainerRef.current.contains(event.target as Node)) {
                if (!searchQuery) {
                    setIsSearchExpanded(false);
                }
            }
        };

        if (isSearchExpanded) {
            document.addEventListener('mousedown', handleClickOutside);
        }

        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, [isSearchExpanded, searchQuery]);

    const handleEditTarget = (target: Target) => {
        setEditingTarget(target);
        setIsTargetFormOpen(true);
    };

    const handleAddTarget = () => {
        setEditingTarget(null);
        setIsTargetFormOpen(true);
    };

    useEffect(() => {
        if (currentWorkspace?.id) {
            fetchLists();
        }
    }, [fetchLists, currentWorkspace?.id]);

    const toggleColumn = (column: string) => {
        setVisibleColumns(prev => ({
            ...prev,
            [column]: !prev[column]
        }));
    };

    return (
        <div className="flex h-full bg-background">
            <TargetListSidebar />

            <div className="flex-1 flex flex-col min-w-0">
                {/* Header Section */}
                <div className="h-16 border-b border-border/30 flex items-center justify-between px-6 bg-card/40 backdrop-blur-md sticky top-0 z-30">
                    <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-xl bg-muted/40 flex items-center justify-center border border-border/40 shadow-sm transition-all">
                            <Users className="h-4 w-4 text-muted-foreground/70" />
                        </div>
                        <h1 className="text-lg font-semibold text-foreground/90 tracking-tight">
                            Targets
                        </h1>
                    </div>

                    <div className="flex items-center gap-4">
                        <div className="flex items-center gap-1">
                            {/* Expanding Search Component */}
                            <div
                                ref={searchContainerRef}
                                className={cn(
                                    "relative flex items-center transition-all duration-300 ease-in-out overflow-hidden h-9",
                                    isSearchExpanded || searchQuery ? "w-64 bg-muted rounded-xl" : "w-10"
                                )}
                            >
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    className={cn(
                                        "h-10 w-10 p-0 shrink-0 transition-colors rounded-xl focus-visible:ring-0 focus-visible:outline-none focus-visible:bg-muted/50",
                                        (isSearchExpanded || searchQuery) ? "text-foreground" : "text-muted-foreground hover:text-foreground hover:bg-muted"
                                    )}
                                    onClick={() => {
                                        setIsSearchExpanded(!isSearchExpanded);
                                    }}
                                >
                                    <Search className="h-4 w-4" />
                                </Button>
                                <div className="relative flex-1 flex items-center min-w-0 pr-2">
                                    <input
                                        ref={inputRef}
                                        placeholder="Search Leads..."
                                        className={cn(
                                            "bg-transparent border-none text-xs outline-none text-foreground/80 placeholder:text-muted-foreground/50 transition-all duration-300 w-full focus:outline-none",
                                            isSearchExpanded || searchQuery ? "opacity-100 pl-1 pr-8" : "opacity-0 w-0 pointer-events-none"
                                        )}
                                        value={searchQuery}
                                        onChange={(e) => setSearchQuery(e.target.value)}
                                    />
                                    {searchQuery && (isSearchExpanded || searchQuery) && (
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                setSearchQuery('');
                                                inputRef.current?.focus();
                                            }}
                                            className="absolute right-2 p-1 text-muted-foreground/40 hover:text-foreground/60 transition-colors rounded-md focus:outline-none focus:text-foreground"
                                        >
                                            <X className="h-3.5 w-3.5" />
                                        </button>
                                    )}
                                </div>
                            </div>

                            <Button
                                variant="ghost"
                                size="sm"
                                className="h-10 w-10 p-0 text-muted-foreground hover:text-foreground hover:bg-muted rounded-xl transition-all focus-visible:ring-0 focus-visible:outline-none focus-visible:bg-muted focus-visible:text-foreground"
                                onClick={() => setIsIntegrationOpen(true)}
                                disabled={!selectedListId}
                                title="API Integration"
                            >
                                <Puzzle className="h-4 w-4" />
                            </Button>
                            <Button
                                variant="ghost"
                                size="sm"
                                className="h-10 w-10 p-0 text-muted-foreground hover:text-foreground hover:bg-muted rounded-xl transition-all focus-visible:ring-0 focus-visible:outline-none focus-visible:bg-muted focus-visible:text-foreground"
                                onClick={() => setIsImportOpen(true)}
                                disabled={!selectedListId}
                                title="Import CSV"
                            >
                                <Upload className="h-4 w-4" />
                            </Button>

                            <Button
                                variant="ghost"
                                size="sm"
                                className={cn(
                                    "h-10 w-10 p-0 rounded-xl transition-all focus-visible:ring-0 focus-visible:outline-none",
                                    isViewOptionsOpen
                                        ? "bg-muted text-foreground"
                                        : "text-muted-foreground hover:text-foreground hover:bg-muted focus-visible:bg-muted focus-visible:text-foreground"
                                )}
                                onClick={() => setIsViewOptionsOpen(true)}
                                title="View Options"
                            >
                                <SlidersHorizontal className="h-4 w-4" />
                            </Button>
                        </div>

                        <div className="w-[1px] h-4 bg-border mx-1" />

                        <Button
                            size="sm"
                            className="h-9 gap-2 bg-secondary/80 hover:bg-secondary text-secondary-foreground rounded-lg px-4 transition-all active:scale-95 border border-border/50 font-medium shadow-sm"
                            onClick={handleAddTarget}
                            disabled={!selectedListId}
                        >
                            <Plus className="h-3.5 w-3.5" />
                            <span className="text-sm">New Target</span>
                        </Button>
                    </div>
                </div>

                {/* View Options Slider (Right Side) */}
                <Dialog.Root open={isViewOptionsOpen} onOpenChange={setIsViewOptionsOpen}>
                    <Dialog.Portal>
                        <Dialog.Overlay className="fixed inset-0 bg-black/40 backdrop-blur-[2px] z-50 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=open]:fade-in-0 data-[state=closed]:fade-out-0 duration-300" />
                        <Dialog.Content className="fixed right-0 top-0 h-full w-[300px] bg-popover border-l border-border shadow-2xl z-50 flex flex-col data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=open]:slide-in-from-right data-[state=closed]:slide-out-to-right duration-300">
                            <div className="p-6 border-b border-border/50 flex items-center justify-between">
                                <h2 className="text-sm font-semibold text-foreground/80 uppercase tracking-wider">View Settings</h2>
                                <Dialog.Close asChild>
                                    <Button variant="ghost" size="icon" className="h-8 w-8 hover:bg-muted rounded-full">
                                        <X className="h-4 w-4 text-muted-foreground" />
                                    </Button>
                                </Dialog.Close>
                            </div>

                            <div className="p-6 space-y-8">
                                <div className="space-y-4">
                                    <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Visible Columns</label>
                                    <div className="space-y-2">
                                        <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest block mb-4">Standard Columns</label>
                                        {Object.entries({
                                            name: 'Name',
                                            email: 'Email',
                                            type: 'Type',
                                            url: 'URL',
                                            tags: 'Tags',
                                            created: 'Created'
                                        }).map(([key, label]) => (
                                            <button
                                                key={key}
                                                onClick={() => toggleColumn(key)}
                                                className="w-full flex items-center justify-between p-3 rounded-xl bg-muted/20 border border-border/50 hover:border-border transition-all group"
                                            >
                                                <span className="text-xs text-muted-foreground group-hover:text-foreground transition-colors">{label}</span>
                                                <div className={cn(
                                                    "w-8 h-4 rounded-full transition-all relative flex items-center px-1",
                                                    visibleColumns[key] ? "bg-muted-foreground/40" : "bg-muted"
                                                )}>
                                                    <div className={cn(
                                                        "w-2.5 h-2.5 bg-white rounded-full transition-all",
                                                        visibleColumns[key] ? "translate-x-3.5" : "translate-x-0"
                                                    )} />
                                                </div>
                                            </button>
                                        ))}

                                        {metadataKeys.length > 0 && (
                                            <div className="pt-4 space-y-4">
                                                <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest block mb-4 border-t border-border/50 pt-6">Custom Attributes</label>
                                                {metadataKeys.map((key) => (
                                                    <button
                                                        key={key}
                                                        onClick={() => toggleColumn(key)}
                                                        className="w-full flex items-center justify-between p-3 rounded-xl bg-muted/20 border border-border/50 hover:border-border transition-all group"
                                                    >
                                                        <span className="text-xs text-muted-foreground group-hover:text-foreground transition-colors capitalize">{key.replace(/_/g, ' ')}</span>
                                                        <div className={cn(
                                                            "w-8 h-4 rounded-full transition-all relative flex items-center px-1",
                                                            visibleColumns[key] ? "bg-muted-foreground/40" : "bg-muted"
                                                        )}>
                                                            <div className={cn(
                                                                "w-2.5 h-2.5 bg-white rounded-full transition-all",
                                                                visibleColumns[key] ? "translate-x-3.5" : "translate-x-0"
                                                            )} />
                                                        </div>
                                                    </button>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                </div>

                                <div className="space-y-4">
                                    <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Display Density</label>
                                    <div className="p-4 rounded-xl bg-muted/40 border border-border/50 text-xs text-muted-foreground leading-relaxed italic">
                                        Note: These options only affect your current view session. Global table settings can be adjusted in the application settings.
                                    </div>
                                </div>
                            </div>
                        </Dialog.Content>
                    </Dialog.Portal>
                </Dialog.Root>

                <ScrollArea className="flex-1">
                    <div className="p-6 min-w-0 overflow-hidden">
                        {isLoading ? (
                            <div className="flex h-[400px] items-center justify-center">
                                <CircularLoader className="h-6 w-6" />
                            </div>
                        ) : !selectedListId ? (
                            <div className="h-[400px] flex flex-col items-center justify-center text-center">
                                <div className="w-16 h-16 rounded-2xl bg-muted flex items-center justify-center mb-4">
                                    <Plus className="h-8 w-8 text-muted-foreground" />
                                </div>
                                <h2 className="text-lg font-medium mb-1">No list selected</h2>
                                <p className="text-sm text-muted-foreground max-w-[250px]">
                                    Select a target list from the sidebar or create a new one to get started.
                                </p>
                            </div>
                        ) : (
                            <TargetTable
                                onEdit={handleEditTarget}
                                searchQuery={searchQuery}
                                visibleColumns={visibleColumns}
                                metadataKeys={metadataKeys}
                            />
                        )}
                    </div>
                </ScrollArea>

                <TargetForm
                    open={isTargetFormOpen}
                    onOpenChange={setIsTargetFormOpen}
                    target={editingTarget}
                />

                <CSVImportDialog
                    open={isImportOpen}
                    onOpenChange={setIsImportOpen}
                />

                {selectedListId && (
                    <IntegrationDialog
                        open={isIntegrationOpen}
                        onOpenChange={setIsIntegrationOpen}
                        listId={selectedListId}
                    />
                )}
            </div>
        </div>
    );
}
