import { useState, useMemo } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { Button } from '@/components/ui/button';
import { Target, TargetList } from '@/types/targets';
import { ListTodo, Check, X, FolderPlus, Search, Hash } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Input } from '@/components/ui/input';

interface TargetAnalysisDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    target: Target | null;
    lists: TargetList[];
    onConfirm: (listId: string | null) => void;
}

export function TargetAnalysisDialog({ open, onOpenChange, target, lists, onConfirm }: TargetAnalysisDialogProps) {
    const [selectedListId, setSelectedListId] = useState<string | null>(
        target?.list_id && target.list_id !== 'virtual' ? target.list_id : null
    );
    const [searchQuery, setSearchQuery] = useState('');

    const filteredLists = useMemo(() => {
        if (!searchQuery) return lists;
        const q = searchQuery.toLowerCase();
        return lists.filter(l => l.name.toLowerCase().includes(q));
    }, [lists, searchQuery]);

    const handleConfirm = () => {
        onConfirm(selectedListId);
        onOpenChange(false);
    };

    if (!target) return null;

    return (
        <Dialog.Root open={open} onOpenChange={onOpenChange}>
            <Dialog.Portal>
                <Dialog.Overlay className="fixed inset-0 bg-background/80 backdrop-blur-sm data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 z-50" />
                <Dialog.Content className="fixed left-[50%] top-[50%] z-50 grid w-full max-w-lg translate-x-[-50%] translate-y-[-50%] gap-4 border bg-background p-6 shadow-lg duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[state=closed]:slide-out-to-left-1/2 data-[state=closed]:slide-out-to-top-[48%] data-[state=open]:slide-in-from-left-1/2 data-[state=open]:slide-in-from-top-[48%] sm:rounded-xl md:w-full">

                    {/* Header */}
                    <div className="flex items-center justify-between border-b pb-4">
                        <div className="flex items-center gap-3">
                            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
                                <ListTodo className="h-5 w-5 text-primary" />
                            </div>
                            <div>
                                <Dialog.Title className="text-lg font-semibold leading-none tracking-tight">
                                    Analyze Profile
                                </Dialog.Title>
                                <Dialog.Description className="text-sm text-muted-foreground mt-1.5">
                                    Choose a destination for <span className="font-medium text-foreground">@{target.name}</span>
                                </Dialog.Description>
                            </div>
                        </div>
                        <Dialog.Close asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full opacity-70 ring-offset-background transition-opacity hover:opacity-100 disabled:pointer-events-none data-[state=open]:bg-accent data-[state=open]:text-muted-foreground">
                                <X className="h-4 w-4" />
                                <span className="sr-only">Close</span>
                            </Button>
                        </Dialog.Close>
                    </div>

                    {/* Search */}
                    <div className="relative">
                        <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                        <Input
                            placeholder="Search existing lists..."
                            className="pl-9 bg-muted/30 border-muted-foreground/20 focus-visible:ring-foreground/10"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                        />
                    </div>

                    {/* Content */}
                    <ScrollArea className="h-[300px] -mr-4 pr-4">
                        <div className="space-y-2">
                            {/* No List Option */}
                            <div
                                onClick={() => setSelectedListId(null)}
                                className={cn(
                                    "relative flex cursor-pointer select-none items-center rounded-lg border p-3 transition-colors hover:bg-muted/50",
                                    selectedListId === null
                                        ? "border-foreground/30 bg-muted"
                                        : "border-transparent bg-muted/20"
                                )}
                            >
                                <div className="flex items-center gap-3 flex-1 overflow-hidden">
                                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border bg-background/50">
                                        <FolderPlus className="h-4 w-4 text-muted-foreground" />
                                    </div>
                                    <div className="flex flex-col gap-0.5 overflow-hidden">
                                        <span className="text-sm font-medium truncate">Quick Analysis</span>
                                        <span className="text-xs text-muted-foreground truncate">Analyze without saving to a specific list</span>
                                    </div>
                                </div>
                                {selectedListId === null && (
                                    <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
                                        <Check className="h-3 w-3" />
                                    </div>
                                )}
                            </div>

                            {/* Separator if needed, or just space */}
                            {lists.length > 0 && <div className="h-px bg-border/50 my-2" />}

                            {/* Lists */}
                            {filteredLists.length === 0 ? (
                                <div className="py-8 text-center text-sm text-muted-foreground">
                                    No lists found matching "{searchQuery}"
                                </div>
                            ) : (
                                filteredLists.map((list) => (
                                    <div
                                        key={list.id}
                                        onClick={() => setSelectedListId(list.id)}
                                        className={cn(
                                            "relative flex cursor-pointer select-none items-center rounded-lg border p-3 transition-colors hover:bg-muted/50",
                                            selectedListId === list.id
                                                ? "border-foreground/30 bg-muted"
                                                : "border-transparent"
                                        )}
                                    >
                                        <div className="flex items-center gap-3 flex-1 overflow-hidden">
                                            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
                                                <Hash className="h-4 w-4" />
                                            </div>
                                            <div className="flex flex-col gap-0.5 overflow-hidden">
                                                <span className="text-sm font-medium truncate">{list.name}</span>
                                                <span className="text-xs text-muted-foreground truncate">{list.target_count || 0} targets</span>
                                            </div>
                                        </div>
                                        {selectedListId === list.id && (
                                            <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-foreground text-background">
                                                <Check className="h-3 w-3" />
                                            </div>
                                        )}
                                    </div>
                                ))
                            )}
                        </div>
                    </ScrollArea>

                    {/* Footer */}
                    <div className="flex items-center justify-end gap-3 pt-2 border-t mt-2">
                        <Button variant="outline" onClick={() => onOpenChange(false)}>
                            Cancel
                        </Button>
                        <Button onClick={handleConfirm} className="gap-2 px-6">
                            {selectedListId ? (
                                <>
                                    <span>Save & Analyze</span>
                                </>
                            ) : (
                                <>
                                    <span>Analyze Only</span>
                                </>
                            )}
                        </Button>
                    </div>
                </Dialog.Content>
            </Dialog.Portal>
        </Dialog.Root>
    );
}
