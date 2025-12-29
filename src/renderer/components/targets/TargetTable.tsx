import { useTargetsStore } from '@/stores/targets.store';
import { Target } from '@/types/targets';
import { ExternalLink, MoreHorizontal, Trash2, Edit2, Tag, ChevronUp, ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import { useState, useMemo, useRef } from 'react';

interface TargetTableProps {
    onEdit: (target: Target) => void;
    searchQuery?: string;
    visibleColumns?: Record<string, boolean>;
    metadataKeys?: string[];
}

type SortField = 'name' | 'email' | 'type' | 'created_at' | 'url';
type SortOrder = 'asc' | 'desc';

export function TargetTable({
    onEdit,
    searchQuery = '',
    visibleColumns = {
        name: true,
        email: true,
        type: true,
        url: true,
        tags: true,
        created: true
    },
    metadataKeys = []
}: TargetTableProps) {
    const { targets, isLoading, deleteTarget } = useTargetsStore();
    const [sortField, setSortField] = useState<SortField>('created_at');
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

            if (sortField === 'created_at') {
                valA = new Date(a.created_at).getTime();
                valB = new Date(b.created_at).getTime();
            }

            if (valA < valB) return sortOrder === 'asc' ? -1 : 1;
            if (valA > valB) return sortOrder === 'asc' ? 1 : -1;
            return 0;
        });

        return result;
    }, [targets, searchQuery, sortField, sortOrder]);


    if (isLoading && targets.length === 0) {
        return (
            <div className="space-y-4">
                {[...Array(5)].map((_, i) => (
                    <div key={i} className="h-16 w-full rounded-xl bg-muted/40 animate-pulse" />
                ))}
            </div>
        );
    }

    if (targets.length === 0) {
        return (
            <div className="h-[300px] flex flex-col items-center justify-center text-center bg-card/20 rounded-2xl border border-dashed border-border/50">
                <p className="text-sm text-muted-foreground">This list is empty.</p>
                <p className="text-xs text-muted-foreground/60 mt-1">Add your first target to get started.</p>
            </div>
        );
    }

    const SortIcon = ({ field }: { field: SortField }) => {
        if (sortField !== field) return null;
        return sortOrder === 'asc' ? <ChevronUp className="h-3 w-3 ml-1" /> : <ChevronDown className="h-3 w-3 ml-1" />;
    };

    return (
        <div className="rounded-2xl border border-border/30 bg-card/10 overflow-hidden w-full h-full flex flex-col shadow-sm">
            <div className="overflow-x-auto custom-scrollbar w-full">
                <table
                    ref={tableRef}
                    className="text-left border-collapse table-fixed w-full"
                >
                    <thead className="bg-card/30">
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
                    <tbody className="divide-y divide-border/30">
                        {filteredAndSortedTargets.map((target) => (
                            <tr
                                key={target.id}
                                className="hover:bg-accent/50 active:bg-accent/30 transition-colors group cursor-pointer"
                                onClick={() => onEdit(target)}
                            >
                                {visibleColumns.name && (
                                    <td className="px-6 py-4 overflow-hidden">
                                        <div className="font-medium text-sm text-foreground group-hover:text-primary transition-colors truncate">
                                            {target.name}
                                        </div>
                                    </td>
                                )}
                                {visibleColumns.email && (
                                    <td className="px-6 py-4 overflow-hidden">
                                        <div className="text-sm text-muted-foreground truncate">{target.email || '-'}</div>
                                    </td>
                                )}
                                {visibleColumns.type && (
                                    <td className="px-6 py-4 overflow-hidden">
                                        <span className={cn(
                                            "inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium uppercase tracking-wider shrink-0",
                                            target.type === 'profile' && "bg-primary/10 text-primary border border-primary/20",
                                            target.type === 'company' && "bg-purple-500/10 dark:text-purple-400 text-purple-600 border border-purple-500/20",
                                            target.type === 'post' && "bg-green-500/10 dark:text-green-400 text-green-600 border border-green-500/20",
                                            target.type === 'lead' && "bg-orange-500/10 dark:text-orange-400 text-orange-600 border border-orange-500/20",
                                            target.type === 'other' && "bg-slate-500/10 dark:text-slate-400 text-slate-500 border border-slate-500/20"
                                        )}>
                                            {target.type}
                                        </span>
                                    </td>
                                )}
                                {visibleColumns.url && (
                                    <td className="px-6 py-4 overflow-hidden">
                                        <div className="flex items-center gap-1 group/link max-w-full">
                                            <a
                                                href={target.url}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="text-xs text-muted-foreground hover:text-primary transition-colors truncate min-w-0 flex-1"
                                                onClick={(e) => e.stopPropagation()}
                                            >
                                                {target.url}
                                            </a>
                                            <ExternalLink className="h-3 w-3 shrink-0 opacity-0 group-hover/link:opacity-100 transition-opacity text-primary" />
                                        </div>
                                    </td>
                                )}
                                {visibleColumns.tags && (
                                    <td className="px-6 py-4 overflow-hidden">
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
                                    <td className="px-6 py-4 text-xs text-muted-foreground whitespace-nowrap overflow-hidden">
                                        {new Date(target.created_at).toLocaleDateString()}
                                    </td>
                                )}
                                {metadataKeys.map((key) => (
                                    visibleColumns[key] && (
                                        <td key={key} className="px-6 py-4 text-xs text-muted-foreground overflow-hidden">
                                            <div className="truncate w-full">
                                                {target.metadata?.[key]?.toString() || '-'}
                                            </div>
                                        </td>
                                    )
                                ))}
                                <td className="px-6 py-4 text-right">
                                    <DropdownMenu>
                                        <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                                            <Button variant="ghost" size="icon" className="h-8 w-8 hover:bg-muted/50 p-0">
                                                <MoreHorizontal className="h-4 w-4" />
                                            </Button>
                                        </DropdownMenuTrigger>
                                        <DropdownMenuContent align="end" className="w-40 bg-popover border-border shadow-2xl">
                                            <DropdownMenuItem
                                                className="gap-2 text-xs"
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    onEdit(target);
                                                }}
                                            >
                                                <Edit2 className="h-3 w-3" />
                                                Edit Target
                                            </DropdownMenuItem>
                                            <DropdownMenuItem
                                                className="gap-2 text-xs text-red-400 focus:text-red-400"
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    deleteTarget(target.id);
                                                }}
                                            >
                                                <Trash2 className="h-3 w-3" />
                                                Delete
                                            </DropdownMenuItem>
                                        </DropdownMenuContent>
                                    </DropdownMenu>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
