
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

export function WorkspaceSelector({ isCollapsed }: { isCollapsed?: boolean }) {
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

    const trigger = (
        <Button
            variant="ghost"
            size={isCollapsed ? "icon" : "default"}
            className={cn(
                "w-full justify-start gap-3 transition-all duration-200 group px-2 text-muted-foreground hover:text-foreground hover:bg-muted/40",
                "border border-border/10 bg-muted/20",
                isCollapsed ? "h-10 w-10 mx-auto justify-center rounded-lg" : "h-10 rounded-lg shadow-none"
            )}
        >
            <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded border border-border/10 text-[10px] font-bold uppercase transition-colors">
                {displayInitial}
            </div>
            {!isCollapsed && (
                <>
                    <span className="text-sm truncate flex-1 text-left">
                        {displayName}
                    </span>
                    <ChevronsUpDown className="h-3 w-3 opacity-30 group-hover:opacity-60 transition-opacity shrink-0" />
                </>
            )}
        </Button>
    );

    const menu = (
        <DropdownMenu open={open} onOpenChange={setOpen}>
            <DropdownMenuTrigger asChild>
                {trigger}
            </DropdownMenuTrigger>
            <DropdownMenuContent
                className="w-56"
                align={isCollapsed ? "center" : "start"}
                side={isCollapsed ? "right" : "bottom"}
                sideOffset={isCollapsed ? 12 : 4}
            >
                <DropdownMenuLabel className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground/70 px-2 py-1.5">
                    Workspaces
                </DropdownMenuLabel>
                <div className="px-1 py-1">
                    {workspaces.map((workspace) => (
                        <DropdownMenuItem
                            key={workspace.id}
                            onSelect={() => setCurrentWorkspace(workspace.id)}
                            className="flex items-center gap-2 px-2 py-1.5 cursor-pointer rounded-md"
                        >
                            <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded border border-border/10 bg-background text-[10px] font-bold uppercase">
                                {workspace.name[0]}
                            </div>
                            <span className="flex-1 truncate text-xs font-medium">{workspace.name}</span>
                            {workspace.id === currentWorkspace?.id && (
                                <Check className="h-3.5 w-3.5 text-primary" />
                            )}
                        </DropdownMenuItem>
                    ))}
                </div>
                <DropdownMenuSeparator className="bg-border/10" />
                <div className="px-1 py-1">
                    <DropdownMenuItem
                        onSelect={() => setShowNewWorkspaceDialog(true)}
                        className="flex items-center gap-2 px-2 py-1.5 cursor-pointer rounded-md text-muted-foreground hover:text-foreground"
                    >
                        <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded border border-dashed border-border/20 bg-background/50">
                            <Plus className="h-3 w-3" />
                        </div>
                        <span className="text-xs font-medium">New Workspace</span>
                    </DropdownMenuItem>
                </div>
            </DropdownMenuContent>
        </DropdownMenu>
    );

    return (
        <Dialog open={showNewWorkspaceDialog} onOpenChange={setShowNewWorkspaceDialog}>
            {isCollapsed ? (
                <Tooltip delayDuration={0}>
                    <TooltipTrigger asChild>
                        {menu}
                    </TooltipTrigger>
                    <TooltipContent side="right" sideOffset={8}>
                        {displayName}
                    </TooltipContent>
                </Tooltip>
            ) : menu}

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
