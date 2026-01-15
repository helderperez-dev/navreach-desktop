import { create } from 'zustand';
import { Workspace } from '@/types/workspace';
import { workspaceService } from '@/services/workspace.service';
import { useChatStore } from './chat.store';
import { useSubscriptionStore } from './subscription.store';
import { toast } from 'sonner';

interface WorkspaceState {
    workspaces: Workspace[];
    currentWorkspace: Workspace | null;
    isLoading: boolean;

    fetchWorkspaces: () => Promise<void>;
    setCurrentWorkspace: (id: string) => void;
    createWorkspace: (name: string) => Promise<void>;
    updateWorkspace: (id: string, updates: Partial<Workspace>) => Promise<void>;
}

export const useWorkspaceStore = create<WorkspaceState>((set, get) => ({
    workspaces: [],
    currentWorkspace: null,
    isLoading: false,

    fetchWorkspaces: async () => {
        set({ isLoading: true });
        try {
            const spaces = await workspaceService.getWorkspaces();
            set({ workspaces: spaces });

            // Restore selected workspace from local storage or default to first
            const storedId = localStorage.getItem('reavion_current_workspace_id');
            let selected = spaces.find(w => w.id === storedId);

            if (!selected && spaces.length > 0) {
                // Default to the first one (usually personal)
                selected = spaces[0];
            }

            if (selected) {
                set({ currentWorkspace: selected });
                localStorage.setItem('reavion_current_workspace_id', selected.id);

                // Migrate legacy conversations to the first workspace (usually personal)
                // This ensures they show up correctly in at least one workspace.
                if (spaces.length > 0) {
                    useChatStore.getState().assignWorkspaces(spaces[0].id);
                }
            }
        } catch (error: any) {
            console.error('Failed to fetch workspaces:', error);
            toast.error('Failed to load workspaces');
        } finally {
            set({ isLoading: false });
        }
    },

    setCurrentWorkspace: (id: string) => {
        const workspace = get().workspaces.find(w => w.id === id);
        if (workspace) {
            set({ currentWorkspace: workspace });
            localStorage.setItem('reavion_current_workspace_id', id);
            // Trigger browser reload or session switch? 
            // The browser session partitioning is handled by the browser component reading this ID.
            // We might need to reload the browser view if we switch workspaces.
        }
    },

    createWorkspace: async (name: string) => {
        const subStore = useSubscriptionStore.getState();
        const limits = subStore.limits;
        const isPro = subStore.isPro();

        if (!isPro && get().workspaces.length >= limits.workspace_limit) {
            subStore.openUpgradeModal(
                "Workspace Limit Reached",
                `Free accounts are limited to ${limits.workspace_limit} workspace. Upgrade to Pro to create unlimited workspaces for different clients or projects.`
            );
            return;
        }

        try {
            const newWorkspace = await workspaceService.createWorkspace(name);
            const workspaces = [...get().workspaces, newWorkspace];
            // Sort by name
            workspaces.sort((a, b) => a.name.localeCompare(b.name));

            set({ workspaces, currentWorkspace: newWorkspace });
            localStorage.setItem('reavion_current_workspace_id', newWorkspace.id);
            toast.success('Workspace created');
        } catch (error: any) {
            console.error('Failed to create workspace:', error);
            toast.error(`Failed to create workspace: ${error.message}`);
        }
    },

    updateWorkspace: async (id: string, updates: Partial<Workspace>) => {
        try {
            const updated = await workspaceService.updateWorkspace(id, updates);
            const workspaces = get().workspaces.map(w => w.id === id ? updated : w);
            set({ workspaces });
            if (get().currentWorkspace?.id === id) {
                set({ currentWorkspace: updated });
            }
            toast.success('Workspace updated');
        } catch (error: any) {
            console.error('Failed to update workspace:', error);
            toast.error(`Failed to update workspace: ${error.message}`);
        }
    }
}));
