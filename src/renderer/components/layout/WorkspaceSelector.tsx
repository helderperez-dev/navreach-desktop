
import { useEffect, useState } from 'react';
import { ChevronsUpDown, Plus, Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
    DropdownMenuShortcut
} from '@/components/ui/dropdown-menu';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useWorkspaceStore } from '@/stores/workspace.store';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

export function WorkspaceSelector() {
    const { workspaces, currentWorkspace, setCurrentWorkspace, fetchWorkspaces, createWorkspace } = useWorkspaceStore();
    const [open, setOpen] = useState(false);
    const [showNewWorkspaceDialog, setShowNewWorkspaceDialog] = useState(false);
    const [newWorkspaceName, setNewWorkspaceName] = useState('');

    useEffect(() => {
        fetchWorkspaces();
    }, []);

    const handleCreateWorkspace = async () => {
        if (!newWorkspaceName.trim()) return;
        await createWorkspace(newWorkspaceName);
        setNewWorkspaceName('');
        setShowNewWorkspaceDialog(false);
    };

    // If no workspace selected (or loading), show placeholder
    const displayName = currentWorkspace?.name || "Select Workspace";
    const displayInitial = currentWorkspace?.name?.[0] || "?";

    return (
        <Dialog open={showNewWorkspaceDialog} onOpenChange={setShowNewWorkspaceDialog}>
            <DropdownMenu open={open} onOpenChange={setOpen}>
                <DropdownMenuTrigger asChild>
                    <Button
                        variant="ghost"
                        size="sm"
                        className="gap-2 h-8 px-2 mr-2"
                    >
                        <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md border bg-background text-[10px] font-semibold uppercase">
                            {displayInitial}
                        </div>
                        <span className="text-sm font-medium truncate max-w-[150px]">
                            {displayName}
                        </span>
                        <ChevronsUpDown className="h-3 w-3 text-muted-foreground opacity-50" />
                    </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent
                    className="w-56"
                    align="end"
                >
                    <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
                        Workspaces
                    </DropdownMenuLabel>
                    {workspaces.map((workspace) => (
                        <DropdownMenuItem
                            key={workspace.id}
                            onSelect={() => setCurrentWorkspace(workspace.id)}
                            className="flex items-center gap-2"
                        >
                            <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md border bg-background text-xs font-medium uppercase">
                                {workspace.name[0]}
                            </div>
                            <span className="flex-1 truncate">{workspace.name}</span>
                            {workspace.id === currentWorkspace?.id && (
                                <Check className="ml-auto h-4 w-4" />
                            )}
                        </DropdownMenuItem>
                    ))}
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onSelect={() => setShowNewWorkspaceDialog(true)}>
                        <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-dashed bg-background">
                            <Plus className="h-4 w-4" />
                        </div>
                        <span className="ml-2">New Workspace</span>
                    </DropdownMenuItem>
                </DropdownMenuContent>
            </DropdownMenu>

            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Create Workspace</DialogTitle>
                    <DialogDescription>
                        Add a new workspace to organize your targets and playbooks.
                    </DialogDescription>
                </DialogHeader>
                <div className="grid gap-4 py-4">
                    <div className="grid gap-2">
                        <Label htmlFor="name">Name</Label>
                        <Input
                            id="name"
                            placeholder="My New Workspace"
                            value={newWorkspaceName}
                            onChange={(e) => setNewWorkspaceName(e.target.value)}
                        />
                    </div>
                </div>
                <DialogFooter>
                    <Button variant="outline" onClick={() => setShowNewWorkspaceDialog(false)}>Cancel</Button>
                    <Button onClick={handleCreateWorkspace}>Create Workspace</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
