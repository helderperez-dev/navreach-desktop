import { useTargetsStore } from '@/stores/targets.store';
import { Target } from '@/types/targets';
import { CircularLoader } from '@/components/ui/CircularLoader';
import { ExternalLink, MoreHorizontal, Trash2, Edit2, Tag, ChevronUp, ChevronDown, Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import { useState, useMemo, useRef } from 'react';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';

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
    recentEngagedUsers?: any[];
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
    recentEngagedUsers = []
}: TargetTableProps) {
    const { targets, isLoading, deleteTarget, viewMode } = useTargetsStore();
    const [sortField, setSortField] = useState<SortField>(viewMode === 'engaged' ? 'last_interaction_at' : 'created_at');
    const [sortOrder, setSortOrder] = useState<SortOrder>('desc');
    const tableRef = useRef<HTMLTableElement>(null);

    // Column Resizing State (Percentages)
    const [columnWidths, setColumnWidths] = useState<Record<string, number>>({
        name: 15,
        email: 20,
        type: 10,
        url: 25,
        tags: 15,
        created: 10
    });

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


    if (isLoading && targets.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center p-12 space-y-4">
                <CircularLoader className="h-8 w-8 text-primary" />
                <p className="text-sm text-muted-foreground animate-pulse">Loading targets...</p>
            </div>
        );
    }

    if (targets.length === 0) {
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
        <div className="w-full">
            <div className="overflow-x-auto shadow-none">
                <table
                    ref={tableRef}
                    className="text-left border-separate border-spacing-0 table-fixed w-full"
                >
                    <thead className="">
                        <tr className="border-b border-border/30">
                            {visibleColumns.name && (
                                <th
                                    className="px-6 py-4 text-xs font-semibold uppercase tracking-wider text-muted-foreground relative group transition-colors hover:text-foreground"
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
                                    className="px-6 py-4 text-xs font-semibold uppercase tracking-wider text-muted-foreground relative group transition-colors hover:text-foreground"
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
                                    className="px-6 py-4 text-xs font-semibold uppercase tracking-wider text-muted-foreground relative group transition-colors hover:text-foreground"
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
                                    className="px-6 py-4 text-xs font-semibold uppercase tracking-wider text-muted-foreground relative group transition-colors hover:text-foreground"
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
                                    className="px-6 py-4 text-xs font-semibold uppercase tracking-wider text-muted-foreground relative group"
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
                                    className="px-6 py-4 text-xs font-semibold uppercase tracking-wider text-muted-foreground relative group transition-colors hover:text-foreground"
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
                                        className="px-6 py-4 text-xs font-semibold uppercase tracking-wider text-muted-foreground relative group transition-colors hover:text-foreground"
                                        style={{ width: `${metadataWidths[key] || 10}%` }}
                                    >
                                        <div className="truncate w-full">
                                            {key.replace(/_/g, ' ')}
                                        </div>
                                        <div
                                            className="absolute right-0 top-0 h-full w-[2px] cursor-col-resize bg-transparent group-hover:bg-border/50 transition-colors z-10"
                                            onMouseDown={(e) => startResizing(key, e.clientX, metadataWidths[key] || 10, true)}
                                        />
                                    </th>
                                )
                            ))}
                            <th className="px-6 py-4 text-right w-[60px]"></th>
                        </tr>
                    </thead>
                    <tbody className="">
                        {filteredAndSortedTargets.map((target) => (
                            <tr
                                key={target.id}
                                className="group relative hover:bg-accent/40 active:bg-accent/60 transition-all duration-200 cursor-pointer"
                                onClick={() => onEdit(target)}
                            >
                                {visibleColumns.name && (
                                    <td className="px-6 py-4 overflow-hidden first:rounded-l-xl last:rounded-r-xl">
                                        <div className="flex items-center gap-3">
                                            <Avatar className="h-8 w-8 rounded-lg border border-border/50 shrink-0">
                                                <AvatarImage src={target.metadata?.avatar_url || target.metadata?.profile_image} className="object-cover" />
                                                <AvatarFallback className="rounded-lg bg-muted text-[10px] font-bold text-muted-foreground">
                                                    {(target.name || 'U').substring(0, 2).toUpperCase()}
                                                </AvatarFallback>
                                            </Avatar>
                                            <div className="flex flex-col min-w-0 gap-0.5">
                                                <div className="font-medium text-sm text-foreground group-hover:text-foreground/80 transition-colors truncate">
                                                    {target.name}
                                                </div>
                                                <div className="flex items-center gap-2">
                                                    {(target as any).target_lists?.name && (
                                                        <span className="text-[9px] font-medium text-muted-foreground/70 bg-muted/50 px-1 py-0 rounded border border-border/40 truncate">
                                                            {(target as any).target_lists.name}
                                                        </span>
                                                    )}
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
                                        <div className="text-sm text-muted-foreground truncate">{target.email || '-'}</div>
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
                                                className="text-xs text-muted-foreground hover:text-foreground transition-colors truncate min-w-0 flex-1"
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
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
