import { useState, useRef, useCallback } from 'react';
import { useTargetsStore } from '@/stores/targets.store';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Plus, List, MoreVertical, Trash2, Edit2 } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';

export function TargetListSidebar() {
    const { lists, selectedListId, setSelectedListId, addList, deleteList, updateList } = useTargetsStore();
    const [isAdding, setIsAdding] = useState(false);
    const [newListName, setNewListName] = useState('');
    const [renamingId, setRenamingId] = useState<string | null>(null);
    const [renameValue, setRenameValue] = useState('');

    // Resize logic
    const [width, setWidth] = useState(256);
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
            const newWidth = Math.min(Math.max(200, e.clientX), 450);
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

    return (
        <div
            className={cn(
                "relative border-r border-border/30 bg-card/10 flex flex-col h-full group/sidebar overflow-hidden shrink-0 transition-colors duration-300",
                isResizingActive && "border-primary/50 bg-primary/5"
            )}
            style={{ width: `${width}px` }}
        >
            <div className="p-4 border-b border-border/30 flex items-center justify-between">
                <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground truncate">Lists</h2>
                <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 hover:bg-muted p-0"
                    onClick={() => setIsAdding(true)}
                >
                    <Plus className="h-4 w-4" />
                </Button>
            </div>

            <ScrollArea className="flex-1 w-full">
                <div className="p-2 space-y-1">
                    {isAdding && (
                        <form onSubmit={handleAddList} className="px-2 py-2">
                            <Input
                                autoFocus
                                className="bg-muted/50 border-border text-foreground h-10 outline-none focus:border-primary/50 hover:border-primary/30 focus:bg-muted/80 focus-visible:ring-0 focus-visible:ring-offset-0 transition-all duration-300 ease-in-out px-3 rounded-lg text-sm"
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
                                        className="bg-muted/50 border-border text-foreground h-9 outline-none focus:border-primary/50 hover:border-primary/30 focus:bg-muted/80 focus-visible:ring-0 focus-visible:ring-offset-0 transition-all duration-300 ease-in-out px-3 rounded-lg text-sm"
                                        value={renameValue}
                                        onChange={(e) => setRenameValue(e.target.value)}
                                        onBlur={() => setRenamingId(null)}
                                    />
                                </form>
                            ) : (
                                <div
                                    className={cn(
                                        "group flex items-center gap-2 px-2 py-1.5 rounded-md transition-colors cursor-pointer min-w-0",
                                        selectedListId === list.id
                                            ? "bg-primary/10 text-primary"
                                            : "hover:bg-muted/50 text-muted-foreground hover:text-foreground"
                                    )}
                                    onClick={() => setSelectedListId(list.id)}
                                >
                                    <List className="h-4 w-4 flex-shrink-0 text-muted-foreground/50" />
                                    <div className="flex-1 min-w-0">
                                        <div className="text-sm font-medium pr-2" title={list.name}>
                                            {(() => {
                                                const maxChars = Math.floor((width - 90) / 6.5);
                                                return list.name.length > maxChars
                                                    ? `${list.name.substring(0, maxChars - 3)}...`
                                                    : list.name;
                                            })()}
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

                                        <div className="absolute right-0 opacity-0 group-hover:opacity-100 transition-all duration-300 translate-x-2 group-hover:translate-x-0 pointer-events-none group-hover:pointer-events-auto">
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
                                                        className="gap-2 text-xs text-red-400 focus:text-red-400"
                                                        onClick={() => deleteList(list.id)}
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
                </div>
            </ScrollArea>

            {/* Resizer Handle - Minimal Browser Style */}
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
        </div>
    );
}
