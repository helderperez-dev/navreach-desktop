import { useEffect } from 'react';
import { useTasksStore } from '@/stores/tasks.store';
import { useAppStore } from '@/stores/app.store';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import {
    RefreshCw,
    Trash2,
    Layers,
    AlertCircle,
    Clock,
    X,
    RotateCcw
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatDistanceToNow } from 'date-fns';

export function TaskQueueSidebar() {
    const { tasks, isLoading, error, fetchTasks, deleteTask, retryTask, clearCompleted, processQueue } = useTasksStore();
    const { toggleQueueSidebar } = useAppStore();

    useEffect(() => {
        fetchTasks();
        const interval = setInterval(fetchTasks, 5000);
        return () => clearInterval(interval);
    }, []);


    const getStatusColor = (status: string) => {
        switch (status) {
            case 'processing': return 'bg-blue-500/10 text-blue-500 border-blue-500/20';
            case 'completed': return 'bg-green-500/10 text-green-500 border-green-500/20';
            case 'failed': return 'bg-red-500/10 text-red-500 border-red-500/20';
            default: return 'bg-muted/50 text-muted-foreground border-border';
        }
    };

    return (
        <div className="flex flex-col h-full bg-background w-full">
            <div className="px-6 py-6 border-b border-border/5 bg-muted/5">
                <div className="flex items-center justify-between mb-6">
                    <div className="flex items-center gap-2">
                        <Layers className="w-5 h-5 text-foreground" />
                        <h2 className="text-lg font-semibold tracking-tight text-foreground">Queue</h2>
                    </div>
                    <div className="flex items-center gap-1">
                        <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 rounded-xl text-muted-foreground hover:text-foreground hover:bg-muted"
                            onClick={() => processQueue()}
                            disabled={isLoading}
                        >
                            <RefreshCw className={cn("w-4 h-4", isLoading && "animate-spin")} />
                        </Button>
                        <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 rounded-xl text-muted-foreground hover:text-foreground hover:bg-muted"
                            onClick={toggleQueueSidebar}
                        >
                            <X className="w-4 h-4" />
                        </Button>
                    </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                    <div className="px-4 py-4 rounded-2xl bg-secondary/20 border border-border/10">
                        <p className="text-[10px] font-semibold text-muted-foreground/60 uppercase tracking-wider">Pending Tasks</p>
                        <div className="flex items-center gap-2 mt-1">
                            <p className="text-2xl font-bold text-foreground leading-none">{tasks.filter(t => t.status === 'queued' || t.status === 'processing').length}</p>
                            {tasks.some(t => t.status === 'processing') && <span className="flex h-2 w-2 rounded-full bg-blue-500 animate-pulse" />}
                        </div>
                    </div>
                    <div className="px-4 py-4 rounded-2xl bg-secondary/20 border border-border/10">
                        <p className="text-[10px] font-semibold text-muted-foreground/60 uppercase tracking-wider">Completed</p>
                        <div className="flex items-center justify-between mt-1">
                            <p className="text-2xl font-bold text-foreground leading-none">{tasks.filter(t => t.status === 'completed').length}</p>
                            {tasks.some(t => t.status === 'completed') && (
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-5 w-5 p-0 text-muted-foreground/50 hover:text-red-500"
                                    onClick={clearCompleted}
                                    title="Clear Completed"
                                >
                                    <Trash2 className="w-3 h-3" />
                                </Button>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            <ScrollArea className="flex-1">
                <div className="p-6 space-y-4">
                    {error ? (
                        <div className="flex flex-col items-center justify-center py-24 text-center">
                            <div className="inline-flex p-6 rounded-[2rem] bg-red-500/10 border border-red-500/5 mb-4">
                                <AlertCircle className="w-10 h-10 text-red-500" />
                            </div>
                            <p className="text-red-500 font-bold text-xs uppercase tracking-widest mb-1">Failed to load tasks</p>
                            <p className="text-muted-foreground/60 text-[10px] max-w-[200px]">{error}</p>
                            <Button
                                variant="outline"
                                size="sm"
                                className="mt-4 rounded-xl text-[10px] h-8"
                                onClick={() => fetchTasks()}
                            >
                                <RefreshCw className="w-3 h-3 mr-2" />
                                Retry
                            </Button>
                        </div>
                    ) : tasks.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-24 text-center">
                            <div className="inline-flex p-6 rounded-[2rem] bg-muted/10 border border-border/5 mb-4">
                                <Clock className="w-10 h-10 text-muted-foreground/10" />
                            </div>
                            <p className="text-muted-foreground/60 font-bold text-xs uppercase tracking-widest">No analysis tasks in queue</p>
                        </div>
                    ) : (
                        tasks.map((task) => (
                            <div
                                key={task.id}
                                className={cn(
                                    "relative p-4 rounded-2xl bg-secondary/15 border transition-all duration-200 group",
                                    task.status === 'processing'
                                        ? "border-blue-500/30 ring-1 ring-blue-500/10 shadow-sm"
                                        : "border-border/10 hover:border-border/20"
                                )}
                            >
                                <div className="flex items-start justify-between gap-3 mb-3">
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2 mb-1.5">
                                            <span className={cn(
                                                "text-[10px] font-bold px-1.5 py-0.5 rounded-md uppercase tracking-wider border",
                                                task.status === 'processing' ? "bg-blue-500/10 text-blue-500 border-blue-500/20" :
                                                    task.status === 'completed' ? "bg-emerald-500/10 text-emerald-500 border-emerald-500/20" :
                                                        task.status === 'failed' ? "bg-red-500/10 text-red-500 border-red-500/20" :
                                                            "bg-secondary text-muted-foreground border-border/20"
                                            )}>
                                                {task.status}
                                            </span>
                                            <span className="text-[10px] font-semibold text-muted-foreground/40 uppercase tracking-wider">
                                                {formatDistanceToNow(new Date(task.created_at), { addSuffix: true })}
                                            </span>
                                        </div>

                                        <div className="font-semibold text-sm text-foreground/90 truncate mb-1">
                                            {task.payload.username || task.payload.url || 'Unknown Target'}
                                        </div>

                                        <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground/60 font-medium">
                                            <span>{task.task_type.replace('_', ' ')}</span>
                                            {task.status === 'processing' && (
                                                <span className="flex items-center gap-1.5 text-blue-500/80">
                                                    <span>•</span>
                                                    <span className="animate-pulse">Analyzing...</span>
                                                </span>
                                            )}
                                        </div>
                                    </div>

                                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity absolute top-3 right-3">
                                        {task.status === 'failed' && (
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                className="h-7 w-7 rounded-lg text-blue-500 hover:bg-blue-500/10"
                                                onClick={() => retryTask(task.id)}
                                            >
                                                <RotateCcw className="w-3.5 h-3.5" />
                                            </Button>
                                        )}
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            className="h-7 w-7 rounded-lg text-muted-foreground/60 hover:text-red-500 hover:bg-red-500/10"
                                            onClick={() => deleteTask(task.id)}
                                        >
                                            <Trash2 className="w-3.5 h-3.5" />
                                        </Button>
                                    </div>
                                </div>

                                {task.error_message && (
                                    <div className="mt-3 p-3 rounded-xl bg-red-500/5 border border-red-500/10 flex gap-2 items-start">
                                        <AlertCircle className="w-3.5 h-3.5 text-red-500 mt-0.5 shrink-0" />
                                        <span className="text-[11px] font-medium text-red-500/90 leading-relaxed break-words">
                                            {task.error_message}
                                        </span>
                                    </div>
                                )}

                                {task.status === 'processing' && (
                                    <div className="mt-4 flex items-center gap-2">
                                        <div className="flex-1 h-1 bg-muted/40 rounded-full overflow-hidden">
                                            <div className="h-full bg-blue-500 animate-shimmer w-[40%]" />
                                        </div>
                                    </div>
                                )}
                            </div>
                        ))
                    )}
                </div>
            </ScrollArea>
        </div>
    );
}
