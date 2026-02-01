import { getScopedSupabase, mainTokenStore } from '../lib/supabase';
import { profileScraperService } from './profile-scraper.service';

export class TaskQueueService {
    private static instance: TaskQueueService;
    private pollingInterval: NodeJS.Timeout | null = null;
    private isProcessing = false;

    private constructor() { }

    static getInstance(): TaskQueueService {
        if (!TaskQueueService.instance) {
            TaskQueueService.instance = new TaskQueueService();
        }
        return TaskQueueService.instance;
    }

    startPolling() {
        if (this.pollingInterval) return;
        this.pollingInterval = setInterval(() => this.processNextTask(), 10000); // Poll every 10 seconds
        console.log('Task Queue Polling started');
    }

    stopPolling() {
        if (this.pollingInterval) {
            clearInterval(this.pollingInterval);
            this.pollingInterval = null;
        }
    }

    async processNextTask() {
        if (this.isProcessing) return;
        this.isProcessing = true;

        let shouldCheckAgainImmediately = false;

        try {
            const { accessToken, refreshToken } = mainTokenStore.getTokens();
            if (!accessToken) {
                console.warn('[TaskQueueService] No access token available for processing');
                this.isProcessing = false;
                return;
            }

            const client = await getScopedSupabase(accessToken, refreshToken || undefined);

            // Cleanup "zombie" tasks (stuck in processing for > 5 mins)
            const fiveMinsAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
            const { error: cleanupError } = await client
                .from('task_queue')
                .update({
                    status: 'failed',
                    error_message: 'Task timed out or app restarted during processing',
                    completed_at: new Date().toISOString()
                })
                .eq('status', 'processing')
                .lt('started_at', fiveMinsAgo);

            if (cleanupError) {
                console.error('[TaskQueueService] Failed to cleanup zombie tasks:', cleanupError);
                // If the cleanup fails due to auth/rate limit, don't proceed to fetching
                if (cleanupError.message?.includes('JWT expired') || cleanupError.message?.includes('rate limit')) {
                    this.isProcessing = false;
                    return;
                }
            }

            // Find one pending task
            const { data: task, error } = await client
                .from('task_queue')
                .select('*')
                .eq('status', 'queued')
                .order('priority', { ascending: false })
                .order('created_at', { ascending: true })
                .limit(1)
                .maybeSingle();

            if (error) {
                console.error('[TaskQueueService] Failed to fetch next task:', error);

                // If it's a fetch error or socket error, retry after a short delay instead of stopping completely
                const errorMsg = String(error.message || '').toLowerCase();
                if (errorMsg.includes('fetch failed') || errorMsg.includes('socket') || errorMsg.includes('und_err')) {
                    console.log('[TaskQueueService] Transient network error detected. Retrying in 5s...');
                    setTimeout(() => {
                        this.isProcessing = false;
                        this.processNextTask();
                    }, 5000);
                    return;
                }

                this.isProcessing = false;
                return;
            }

            if (!task) {
                this.isProcessing = false;
                return;
            }

            // We found a task, so we should check for more after this one is done
            shouldCheckAgainImmediately = true;

            console.log(`[TaskQueueService] Processing task: ${task.id} (${task.task_type})`);

            // Mark as processing
            await client
                .from('task_queue')
                .update({ status: 'processing', started_at: new Date().toISOString() })
                .eq('id', task.id);

            // Execution with overall timeout of 60 seconds
            const executeTask = async () => {
                if (task.task_type === 'profile_analysis') {
                    return await profileScraperService.analyzeProfile(task.payload.url, task.payload.target_id);
                } else {
                    throw new Error(`Unknown task type: ${task.task_type}`);
                }
            };

            const timeoutPromise = new Promise((_, reject) =>
                setTimeout(() => reject(new Error('Task execution timed out (60s)')), 60000)
            );

            try {
                const result = await Promise.race([
                    executeTask(),
                    timeoutPromise
                ]);

                // Mark as completed
                await client
                    .from('task_queue')
                    .update({
                        status: 'completed',
                        completed_at: new Date().toISOString(),
                        result: result
                    })
                    .eq('id', task.id);

                console.log(`[TaskQueueService] Task ${task.id} completed successfully`);

            } catch (err: any) {
                console.error(`[TaskQueueService] Task ${task.id} failed:`, err);
                await client
                    .from('task_queue')
                    .update({
                        status: 'failed',
                        completed_at: new Date().toISOString(),
                        error_message: err.message || String(err)
                    })
                    .eq('id', task.id);
            }

        } catch (err: any) {
            console.error('[TaskQueueService] Fatal error in processNextTask:', err);
            shouldCheckAgainImmediately = false; // Stop immediate retry on fatal error
        } finally {
            this.isProcessing = false;
            // Check for more tasks immediately ONLY if we just processed one successfully
            // and no fatal error occurred. This prevents the "thundering herd" on errors.
            if (shouldCheckAgainImmediately) {
                setTimeout(() => this.processNextTask(), 1000); // 1s buffer instead of 500ms
            }
        }
    }

    async addTasks(workspaceId: string, userId: string, tasks: { type: string, payload: any, priority?: number }[]) {
        const { accessToken, refreshToken } = mainTokenStore.getTokens();
        const client = await getScopedSupabase(accessToken || undefined, refreshToken || undefined);

        const tasksToInsert = tasks.map(task => ({
            workspace_id: workspaceId,
            user_id: userId,
            task_type: task.type,
            payload: task.payload,
            status: 'queued',
            priority: task.priority || 0
        }));

        const { data, error } = await client
            .from('task_queue')
            .insert(tasksToInsert)
            .select();

        if (error) {
            console.error('[TaskQueueService] Failed to add tasks bulk:', error);
            throw error;
        }

        console.log(`[TaskQueueService] ${data.length} tasks added successfully`);
        this.processNextTask();

        return data;
    }

    async addTask(workspaceId: string, userId: string, type: string, payload: any, priority = 0) {
        return this.addTasks(workspaceId, userId, [{ type, payload, priority }]);
    }
}

export const taskQueueService = TaskQueueService.getInstance();
