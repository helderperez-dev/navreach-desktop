import { useEffect, useState, useRef, useMemo } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { useTargetsStore } from '@/stores/targets.store';
import { TargetListSidebar } from './TargetListSidebar';
import { TargetTable } from './TargetTable';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Plus, Search, LayoutGrid, X, Zap, FileUp, SlidersHorizontal } from 'lucide-react';
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

export function TargetListView() {
    const { targets, fetchLists, selectedListId, fetchTargets, isLoading } = useTargetsStore();
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
        fetchLists();
    }, [fetchLists]);

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
                <div className="h-16 border-b border-white/5 flex items-center justify-between px-6 bg-[#0A0A0B]/80 backdrop-blur-md sticky top-0 z-30">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-blue-600/10 flex items-center justify-center border border-blue-500/20">
                            <LayoutGrid className="h-5 w-5 text-blue-400" />
                        </div>
                        <h1 className="text-lg font-semibold text-white tracking-tight">
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
                                    isSearchExpanded || searchQuery ? "w-64 bg-white/[0.03] rounded-xl" : "w-10"
                                )}
                            >
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    className={cn(
                                        "h-10 w-10 p-0 shrink-0 transition-colors rounded-xl focus-visible:ring-0 focus-visible:outline-none focus-visible:bg-white/[0.08]",
                                        (isSearchExpanded || searchQuery) ? "text-blue-400" : "text-white/40 hover:text-white hover:bg-white/5"
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
                                            "bg-transparent border-none text-xs outline-none text-white/80 placeholder:text-white/20 transition-all duration-300 w-full focus:outline-none",
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
                                            className="absolute right-2 p-1 text-white/20 hover:text-white/60 transition-colors rounded-md focus:outline-none focus:text-white"
                                        >
                                            <X className="h-3.5 w-3.5" />
                                        </button>
                                    )}
                                </div>
                            </div>

                            <Button
                                variant="ghost"
                                size="sm"
                                className="h-10 w-10 p-0 text-white/40 hover:text-white hover:bg-white/5 rounded-xl transition-all focus-visible:ring-0 focus-visible:outline-none focus-visible:bg-white/[0.08] focus-visible:text-blue-400"
                                onClick={() => setIsIntegrationOpen(true)}
                                disabled={!selectedListId}
                                title="API Integration"
                            >
                                <Zap className="h-4 w-4" />
                            </Button>
                            <Button
                                variant="ghost"
                                size="sm"
                                className="h-10 w-10 p-0 text-white/40 hover:text-white hover:bg-white/5 rounded-xl transition-all focus-visible:ring-0 focus-visible:outline-none focus-visible:bg-white/[0.08] focus-visible:text-blue-400"
                                onClick={() => setIsImportOpen(true)}
                                disabled={!selectedListId}
                                title="Import CSV"
                            >
                                <FileUp className="h-4 w-4" />
                            </Button>

                            <Button
                                variant="ghost"
                                size="sm"
                                className={cn(
                                    "h-10 w-10 p-0 rounded-xl transition-all focus-visible:ring-0 focus-visible:outline-none",
                                    isViewOptionsOpen
                                        ? "bg-blue-600/10 text-blue-400"
                                        : "text-white/40 hover:text-white hover:bg-white/5 focus-visible:bg-white/[0.08] focus-visible:text-blue-400"
                                )}
                                onClick={() => setIsViewOptionsOpen(true)}
                                title="View Options"
                            >
                                <SlidersHorizontal className="h-4 w-4" />
                            </Button>
                        </div>

                        <div className="w-[1px] h-4 bg-white/10 mx-1" />

                        <Button
                            size="sm"
                            className="h-10 gap-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl px-5 transition-all active:scale-95 border border-white/10 font-semibold focus-visible:ring-2 focus-visible:ring-blue-500/50 focus-visible:outline-none"
                            onClick={handleAddTarget}
                            disabled={!selectedListId}
                        >
                            <Plus className="h-4 w-4" />
                            <span className="text-sm">New Target</span>
                        </Button>
                    </div>
                </div>

                {/* View Options Slider (Right Side) */}
                <Dialog.Root open={isViewOptionsOpen} onOpenChange={setIsViewOptionsOpen}>
                    <Dialog.Portal>
                        <Dialog.Overlay className="fixed inset-0 bg-black/40 backdrop-blur-[2px] z-50 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=open]:fade-in-0 data-[state=closed]:fade-out-0 duration-300" />
                        <Dialog.Content className="fixed right-0 top-0 h-full w-[300px] bg-[#0A0A0B] border-l border-white/10 shadow-2xl z-50 flex flex-col data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=open]:slide-in-from-right data-[state=closed]:slide-out-to-right duration-300">
                            <div className="p-6 border-b border-white/5 flex items-center justify-between">
                                <h2 className="text-sm font-semibold text-white/80 uppercase tracking-wider">View Settings</h2>
                                <Dialog.Close asChild>
                                    <Button variant="ghost" size="icon" className="h-8 w-8 hover:bg-white/5 rounded-full">
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
                                                className="w-full flex items-center justify-between p-3 rounded-xl bg-white/[0.02] border border-white/5 hover:border-white/10 transition-all group"
                                            >
                                                <span className="text-xs text-white/60 group-hover:text-white transition-colors">{label}</span>
                                                <div className={cn(
                                                    "w-8 h-4 rounded-full transition-all relative flex items-center px-1",
                                                    visibleColumns[key] ? "bg-blue-600" : "bg-white/10"
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
                                                <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest block mb-4 border-t border-white/5 pt-6">Custom Attributes</label>
                                                {metadataKeys.map((key) => (
                                                    <button
                                                        key={key}
                                                        onClick={() => toggleColumn(key)}
                                                        className="w-full flex items-center justify-between p-3 rounded-xl bg-white/[0.02] border border-white/5 hover:border-white/10 transition-all group"
                                                    >
                                                        <span className="text-xs text-white/60 group-hover:text-white transition-colors capitalize">{key.replace(/_/g, ' ')}</span>
                                                        <div className={cn(
                                                            "w-8 h-4 rounded-full transition-all relative flex items-center px-1",
                                                            visibleColumns[key] ? "bg-blue-600" : "bg-white/10"
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
                                    <div className="p-4 rounded-xl bg-blue-600/5 border border-blue-500/10 text-xs text-blue-200/60 leading-relaxed italic">
                                        More display options coming soon.
                                    </div>
                                </div>
                            </div>
                        </Dialog.Content>
                    </Dialog.Portal>
                </Dialog.Root>

                <ScrollArea className="flex-1">
                    <div className="p-6 min-w-0 overflow-hidden">
                        {!selectedListId ? (
                            <div className="h-[400px] flex flex-col items-center justify-center text-center">
                                <div className="w-16 h-16 rounded-2xl bg-white/5 flex items-center justify-center mb-4">
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
