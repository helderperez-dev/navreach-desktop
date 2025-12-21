import { useState } from 'react';
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
        <div className="w-64 border-r border-border bg-card/30 flex flex-col h-full">
            <div className="p-4 border-b border-border flex items-center justify-between">
                <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Lists</h2>
                <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 hover:bg-white/5"
                    onClick={() => setIsAdding(true)}
                >
                    <Plus className="h-4 w-4" />
                </Button>
            </div>

            <ScrollArea className="flex-1">
                <div className="p-2 space-y-1">
                    {isAdding && (
                        <form onSubmit={handleAddList} className="px-2 py-2">
                            <Input
                                autoFocus
                                className="bg-white/5 border-white/10 text-white h-10 outline-none focus:border-white/20 hover:border-white/20 focus:bg-white/[0.07] focus-visible:ring-0 focus-visible:ring-offset-0 transition-[border-color,background-color] duration-300 ease-in-out px-3 rounded-lg text-sm"
                                placeholder="List name..."
                                value={newListName}
                                onChange={(e) => setNewListName(e.target.value)}
                                onBlur={() => !newListName && setIsAdding(false)}
                            />
                        </form>
                    )}

                    {lists.map((list) => (
                        <div key={list.id}>
                            {renamingId === list.id ? (
                                <form onSubmit={handleRename} className="px-2 py-1">
                                    <Input
                                        autoFocus
                                        className="bg-white/5 border-white/10 text-white h-9 outline-none focus:border-white/20 hover:border-white/20 focus:bg-white/[0.07] focus-visible:ring-0 focus-visible:ring-offset-0 transition-[border-color,background-color] duration-300 ease-in-out px-3 rounded-lg text-sm"
                                        value={renameValue}
                                        onChange={(e) => setRenameValue(e.target.value)}
                                        onBlur={() => setRenamingId(null)}
                                    />
                                </form>
                            ) : (
                                <div
                                    className={cn(
                                        "group flex items-center gap-2 px-2 py-1.5 rounded-md transition-colors cursor-pointer",
                                        selectedListId === list.id
                                            ? "bg-blue-600/10 text-blue-400"
                                            : "hover:bg-white/5 text-muted-foreground hover:text-white"
                                    )}
                                    onClick={() => setSelectedListId(list.id)}
                                >
                                    <List className="h-4 w-4 flex-shrink-0" />
                                    <span className="flex-1 text-sm truncate font-medium">{list.name}</span>

                                    <div className="relative flex items-center">
                                        {list.target_count !== undefined && (
                                            <span className={cn(
                                                "px-2 py-0.5 text-[10px] font-bold bg-white/5 border border-white/10 rounded-md text-muted-foreground transition-all duration-300 ease-in-out",
                                                "group-hover:translate-x-[-32px] group-hover:bg-white/10 group-hover:text-white"
                                            )}>
                                                {list.target_count}
                                            </span>
                                        )}

                                        <div className="absolute right-0 opacity-0 group-hover:opacity-100 transition-all duration-300 ease-in-out translate-x-2 group-hover:translate-x-0 flex items-center">
                                            <DropdownMenu>
                                                <DropdownMenuTrigger asChild>
                                                    <Button
                                                        variant="ghost"
                                                        size="icon"
                                                        className="h-7 w-7 p-0 hover:bg-white/10 transition-colors"
                                                        onClick={(e) => e.stopPropagation()}
                                                    >
                                                        <MoreVertical className="h-3.5 w-3.5" />
                                                    </Button>
                                                </DropdownMenuTrigger>
                                                <DropdownMenuContent align="end" className="w-40 bg-[#121214] border-white/5 shadow-2xl">
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
        </div>
    );
}
