import { IpcMain } from 'electron';
import { getScopedSupabase, mainTokenStore } from '../lib/supabase';
import { taskQueueService } from '../services/task-queue.service';

export function setupTaskHandlers(ipcMain: IpcMain) {
    ipcMain.handle('tasks:list', async (_event, { workspaceId, limit = 50 }) => {
        const { accessToken, refreshToken } = mainTokenStore.getTokens();
        console.log('[Tasks IPC] Listing tasks with tokens:', { accessToken: accessToken ? 'Present' : 'Missing' });
        const client = await getScopedSupabase(accessToken || undefined, refreshToken || undefined);

        const { data, error } = await client
            .from('task_queue')
            .select('*')
            .eq('workspace_id', workspaceId)
            .order('created_at', { ascending: false })
            .limit(limit);

        if (error) throw error;
        return data;
    });

    ipcMain.handle('tasks:add', async (_event, { workspaceId, userId, type, payload, priority }) => {
        console.log('[Tasks IPC] Adding task request:', { type, workspaceId, userId, payload: !!payload });
        return taskQueueService.addTask(workspaceId, userId, type, payload, priority);
    });

    ipcMain.handle('tasks:add-bulk', async (_event, { workspaceId, userId, tasks }) => {
        console.log('[Tasks IPC] Adding bulk tasks request:', { count: tasks.length, workspaceId, userId });
        return taskQueueService.addTasks(workspaceId, userId, tasks);
    });

    ipcMain.handle('tasks:delete', async (_event, taskId) => {
        const { accessToken, refreshToken } = mainTokenStore.getTokens();
        const client = await getScopedSupabase(accessToken || undefined, refreshToken || undefined);

        const { error } = await client
            .from('task_queue')
            .delete()
            .eq('id', taskId);

        if (error) throw error;
        return { success: true };
    });

    ipcMain.handle('tasks:retry', async (_event, taskId) => {
        const { accessToken, refreshToken } = mainTokenStore.getTokens();
        const client = await getScopedSupabase(accessToken || undefined, refreshToken || undefined);

        const { error } = await client
            .from('task_queue')
            .update({ status: 'queued', error_message: null, started_at: null, completed_at: null })
            .eq('id', taskId);

        if (error) throw error;

        taskQueueService.processNextTask();
        return { success: true };
    });

    ipcMain.handle('tasks:clear-completed', async (_event, workspaceId) => {
        const { accessToken, refreshToken } = mainTokenStore.getTokens();
        const client = await getScopedSupabase(accessToken || undefined, refreshToken || undefined);

        const { error } = await client
            .from('task_queue')
            .delete()
            .eq('workspace_id', workspaceId)
            .eq('status', 'completed');

        if (error) throw error;
        return { success: true };
    });

    ipcMain.handle('tasks:process', async () => {
        console.log('[Tasks IPC] Manually triggering queue processing');
        taskQueueService.processNextTask();
        return { success: true };
    });
}
