import { create } from 'zustand';
import { useWorkspaceStore } from './workspace.store';
import { supabase } from '../lib/supabase';
import { toast } from 'sonner';

interface Task {
    id: string;
    workspace_id: string;
    user_id: string;
    task_type: string;
    status: 'queued' | 'processing' | 'completed' | 'failed';
    payload: any;
    result?: any;
    error_message?: string;
    started_at?: string;
    completed_at?: string;
    priority: number;
    created_at: string;
}

interface TasksState {
    tasks: Task[];
    isLoading: boolean;
    error: string | null;
    pendingCount: number;
    fetchTasks: () => Promise<void>;
    addTask: (type: string, payload: any, priority?: number) => Promise<void>;
    addTasksBatch: (tasks: { type: string, payload: any, priority?: number }[]) => Promise<void>;
    deleteTask: (taskId: string) => Promise<void>;
    retryTask: (taskId: string) => Promise<void>;
    clearCompleted: () => Promise<void>;
    subscribeToChanges: () => void;
    unsubscribe: () => void;
    processQueue: () => Promise<void>;
}

export const useTasksStore = create<TasksState>((set, get) => ({
    tasks: [],
    isLoading: false,
    error: null,
    pendingCount: 0,

    fetchTasks: async () => {
        const workspaceId = useWorkspaceStore.getState().currentWorkspace?.id;
        if (!workspaceId) return;

        set({ isLoading: true });
        try {
            const tasks = await window.api.tasks.list({ workspaceId });
            const pendingCount = tasks.filter((t: any) => t.status === 'queued' || t.status === 'processing').length;
            set({ tasks, isLoading: false, error: null, pendingCount });
        } catch (err: any) {
            set({ error: err.message, isLoading: false });
        }
    },

    addTask: async (type, payload, priority = 0) => {
        const workspaceId = useWorkspaceStore.getState().currentWorkspace?.id;
        const { data: { user } } = await supabase.auth.getUser();

        if (!workspaceId) {
            toast.error('No workspace selected');
            return;
        }
        if (!user) {
            toast.error('Not authenticated');
            return;
        }

        let targetId = payload.target_id;
        const { useTargetsStore } = await import('./targets.store');

        // If it's a virtual target, we MUST save it to the DB first to get a valid UUID
        if (targetId && typeof targetId === 'string' && targetId.startsWith('virtual-')) {
            const targetsStore = useTargetsStore.getState();
            const virtualTarget = targetsStore.targets.find(t => t.id === targetId);

            if (virtualTarget) {
                try {
                    toast.loading('Saving contact...', { id: 'save-target' });
                    // Use the selected list, the last active list, or fallback to first
                    const listId = targetsStore.selectedListId || targetsStore.lastSelectedListId || (targetsStore.lists.length > 0 ? targetsStore.lists[0].id : null);

                    if (!listId) {
                        toast.error('Please select or create a target list first', { id: 'save-target' });
                        return;
                    }

                    const { targetService } = await import('@/lib/targets.service');
                    const { data: realTarget, error: saveError } = await targetService.createTarget({
                        list_id: listId,
                        user_id: user.id,
                        name: virtualTarget.name || '',
                        url: virtualTarget.url || '',
                        type: virtualTarget.type || 'profile',
                        metadata: virtualTarget.metadata || {}
                    } as any);

                    if (saveError) throw saveError;
                    if (realTarget) {
                        targetId = realTarget.id;
                        payload.target_id = realTarget.id;
                        // Update the targets store locally so the UI switches from virtual to real
                        targetsStore.fetchTargets(undefined, true);
                        toast.success('Contact saved', { id: 'save-target' });
                    }
                } catch (err: any) {
                    console.error('Failed to save virtual target:', err);
                    toast.error(`Could not save contact: ${err.message}`, { id: 'save-target' });
                    return;
                }
            }
        }

        try {
            console.log('Adding task:', { type, workspaceId, userId: user.id, targetId });
            await window.api.tasks.add({
                workspaceId,
                userId: user.id,
                type,
                payload,
                priority
            });
            toast.success('Task added to queue');
            get().fetchTasks();
        } catch (err: any) {
            console.error('Task addition error:', err);
            set({ error: err.message });
            toast.error(`Failed to add task: ${err.message}`);
        }
    },

    addTasksBatch: async (tasks) => {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
            toast.error('User not authenticated');
            return;
        }

        const workspaceId = useWorkspaceStore.getState().currentWorkspace?.id;
        if (!workspaceId) {
            toast.error('No active workspace');
            return;
        }

        try {
            if (typeof window.api.tasks.addBulk !== 'function') {
                console.error('window.api.tasks.addBulk is not a function. Available methods:', Object.keys(window.api.tasks || {}));
                throw new Error('window.api.tasks.addBulk is not a function. Please restart the application.');
            }
            await window.api.tasks.addBulk({
                workspaceId,
                userId: user.id,
                tasks
            });
            toast.success(`Success! Added ${tasks.length} tasks to queue`);
            get().fetchTasks();
        } catch (err: any) {
            console.error('Bulk task addition error:', err);
            set({ error: err.message });
            toast.error(`Failed to add tasks: ${err.message}`);
        }
    },

    deleteTask: async (taskId) => {
        try {
            await window.api.tasks.delete(taskId);
            set({ tasks: get().tasks.filter(t => t.id !== taskId) });
        } catch (err: any) {
            set({ error: err.message });
        }
    },

    retryTask: async (taskId) => {
        try {
            await window.api.tasks.retry(taskId);
            get().fetchTasks();
        } catch (err: any) {
            set({ error: err.message });
        }
    },

    clearCompleted: async () => {
        const workspaceId = useWorkspaceStore.getState().currentWorkspace?.id;
        if (!workspaceId) return;

        try {
            await window.api.tasks.clearCompleted(workspaceId);
            set({ tasks: get().tasks.filter(t => t.status !== 'completed') });
        } catch (err: any) {
            set({ error: err.message });
        }
    },

    subscribeToChanges: () => {
        const workspaceId = useWorkspaceStore.getState().currentWorkspace?.id;
        if (!workspaceId) return;

        const channel = supabase
            .channel('tasks-realtime')
            .on(
                'postgres_changes',
                { event: '*', schema: 'public', table: 'task_queue', filter: `workspace_id=eq.${workspaceId}` },
                () => {
                    get().fetchTasks();
                }
            )
            .subscribe();

        // Store channel reference for cleanup
        (window as any).__tasksChannel = channel;
    },

    unsubscribe: () => {
        const channel = (window as any).__tasksChannel;
        if (channel) {
            supabase.removeChannel(channel);
            (window as any).__tasksChannel = null;
        }
    },
    processQueue: async () => {
        try {
            await window.api.tasks.process();
            get().fetchTasks();
        } catch (err: any) {
            console.error('Failed to manually trigger queue:', err);
        }
    }
}));
