import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ScrollArea } from '@/components/ui/scroll-area';
import { EngagementLog } from '@shared/types/engagement.types';
import { useAuthStore } from '@/stores/auth.store';
import { Button } from '@/components/ui/button';
import {
    ExternalLink,
    MessageSquare,
    Heart,
    UserPlus,
    Send,
    BarChart2,
    RefreshCw,
    Clock,
    X,
    User,
    Globe,
    ArrowUpRight,
    Zap
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';
import { CircularLoader } from '@/components/ui/CircularLoader';

interface TargetHistorySheetProps {
    isOpen: boolean;
    onClose: () => void;
    target: {
        username: string;
        name?: string | null;
        avatar_url?: string | null;
        platform: string;
    } | null;
    noAnimation?: boolean;
}

export function TargetHistorySheet({ isOpen, onClose, target, noAnimation = false }: TargetHistorySheetProps) {
    const { session } = useAuthStore();
    const [logs, setLogs] = useState<EngagementLog[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [stableTarget, setStableTarget] = useState(target);

    useEffect(() => {
        if (target) {
            setStableTarget(target);
        }
    }, [target]);

    useEffect(() => {
        if (isOpen && stableTarget && session?.access_token) {
            const fetchHistory = async () => {
                setIsLoading(true);
                try {
                    const history = await window.api.engagement.getLogs(session.access_token, {
                        target_username: stableTarget.username,
                        limit: 50
                    });
                    setLogs(history);
                } catch (error) {
                    console.error('Failed to fetch target history:', error);
                } finally {
                    setIsLoading(false);
                }
            };
            fetchHistory();
        }
    }, [isOpen, stableTarget, session?.access_token]);

    const openProfile = () => {
        if (!stableTarget) return;
        const url = stableTarget.username ? `https://${stableTarget.platform.replace('.com', '')}.com/${stableTarget.username}` : '#';
        if (url !== '#') window.open(url, '_blank');
    };

    const getActionIcon = (type: string) => {
        const iconClassName = "h-3.5 w-3.5 text-muted-foreground/60";
        switch (type) {
            case 'like': return <Heart className={iconClassName} />;
            case 'reply': return <MessageSquare className={iconClassName} />;
            case 'follow': return <UserPlus className={iconClassName} />;
            case 'dm': return <Send className={iconClassName} />;
            case 'post': return <BarChart2 className={iconClassName} />;
            default: return <RefreshCw className={iconClassName} />;
        }
    };

    const content = stableTarget ? (
        <div className="w-[480px] h-full flex flex-col">
            <div className="px-8 py-8 border-b border-border/5 bg-muted/5 relative">
                <Button
                    variant="ghost"
                    size="icon"
                    className="absolute top-4 right-4 h-8 w-8 rounded-xl hover:bg-muted"
                    onClick={onClose}
                >
                    <Separator orientation="vertical" className="h-4 absolute -left-2 top-2 opacity-20" />
                    <X className="h-4 w-4 text-muted-foreground/40" />
                </Button>
                <div
                    className="flex items-center gap-5 cursor-pointer group/header w-fit"
                    onClick={openProfile}
                >
                    <div className="relative">
                        {stableTarget.avatar_url ? (
                            <img src={stableTarget.avatar_url} className="h-16 w-16 rounded-2xl border border-border/20 shadow-xl object-cover transition-transform group-hover/header:scale-105" alt="" />
                        ) : (
                            <div className="h-16 w-16 rounded-2xl bg-muted/20 flex items-center justify-center border border-border/20 shadow-xl font-bold text-2xl text-muted-foreground transition-transform group-hover/header:scale-105">
                                {(stableTarget.username && stableTarget.username[0]?.toUpperCase()) || 'U'}
                            </div>
                        )}
                        <div className="absolute -bottom-1 -right-1 h-5 w-5 rounded-lg bg-background border border-border/10 shadow-sm flex items-center justify-center">
                            <Globe className="h-2.5 w-2.5 text-muted-foreground/80" />
                        </div>
                    </div>
                    <div className="text-left flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                            <h2 className="text-xl font-semibold tracking-tight text-foreground group-hover/header:text-primary transition-colors truncate">
                                {stableTarget.name || stableTarget.username}
                            </h2>
                            <ArrowUpRight className="h-3.5 w-3.5 text-muted-foreground/30 group-hover/header:opacity-100 transition-all transform group-hover/header:translate-x-0.5 group-hover/header:-translate-y-0.5" />
                        </div>
                        <div className="flex items-center gap-2 mt-1">
                            <span className="text-sm font-medium text-muted-foreground/70">@{stableTarget.username}</span>
                            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-secondary text-muted-foreground/80 border border-border/20 uppercase tracking-wider">
                                {stableTarget.platform}
                            </span>
                        </div>
                    </div>
                </div>

                <div className="grid grid-cols-2 gap-3 mt-6">
                    <div className="px-5 py-5 rounded-2xl bg-secondary/20 border border-border/10">
                        <p className="text-[10px] font-semibold text-muted-foreground/60 uppercase tracking-wider">Interactions</p>
                        <p className="text-3xl font-bold mt-1 text-foreground leading-none">{logs.length}</p>
                    </div>
                    <div className="px-5 py-5 rounded-2xl bg-secondary/20 border border-border/10">
                        <p className="text-[10px] font-semibold text-muted-foreground/60 uppercase tracking-wider">Impact Score</p>
                        <div className="flex items-center gap-2 mt-1">
                            <p className="text-3xl font-bold text-foreground leading-none">{logs.length * 5}</p>
                        </div>
                    </div>
                </div>
            </div>

            <ScrollArea className="flex-1">
                <div className="p-8 space-y-6">
                    <div className="flex items-center justify-between">
                        <h3 className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground/50">Engagement History</h3>
                        <Clock className="h-3.5 w-3.5 text-muted-foreground/20" />
                    </div>

                    {isLoading ? (
                        <div className="flex h-64 items-center justify-center">
                            <CircularLoader className="h-6 w-6" />
                        </div>
                    ) : logs.length === 0 ? (
                        <div className="text-center py-24">
                            <div className="inline-flex p-6 rounded-[2rem] bg-muted/10 border border-border/5 mb-4">
                                <Clock className="h-10 w-10 text-muted-foreground/10" />
                            </div>
                            <p className="text-muted-foreground/60 font-bold text-xs uppercase tracking-widest">No recorded interactions</p>
                        </div>
                    ) : (
                        <div className="relative border-l border-white/5 ml-2.5 space-y-8 pb-10">
                            {logs.map((log) => (
                                <div key={log.id} className="relative pl-8">
                                    <div className="absolute -left-[4.5px] top-2 h-2 w-2 rounded-full bg-muted-foreground/30 ring-4 ring-background shadow-sm" />

                                    <div className="flex flex-col gap-3">
                                        <div className="text-[10px] font-semibold text-muted-foreground/40 uppercase tracking-wider">
                                            {formatDistanceToNow(new Date(log.created_at), { addSuffix: true })}
                                        </div>

                                        <div className="flex flex-col gap-4 p-5 rounded-2xl bg-secondary/15 border border-border/10 hover:border-border/20 transition-all group">
                                            <div className="flex items-center justify-between">
                                                <div className="flex items-center gap-3">
                                                    <div className="p-2 rounded-lg bg-background border border-border/20 shadow-sm">
                                                        {getActionIcon(log.action_type)}
                                                    </div>
                                                    <div className="flex flex-col">
                                                        <span className="text-sm font-semibold capitalize text-foreground/90">
                                                            {log.action_type}
                                                        </span>
                                                        {log.metadata && (log.metadata as any).action_status && (
                                                            <span className="text-[9px] font-bold text-emerald-500/80 uppercase tracking-wide">
                                                                {(log.metadata as any).action_status}
                                                            </span>
                                                        )}
                                                    </div>
                                                </div>
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    className="h-8 w-8 p-0 rounded-xl hover:bg-muted opacity-50 group-hover:opacity-100 transition-all"
                                                    onClick={() => {
                                                        const url = (log.metadata as any)?.url || (log.target_username ? `https://${log.platform.replace('.com', '')}.com/${log.target_username}` : '#');
                                                        if (url !== '#') window.open(url, '_blank');
                                                    }}
                                                >
                                                    <ArrowUpRight className="h-4 w-4 text-muted-foreground" />
                                                </Button>
                                            </div>

                                            {log.metadata && (log.metadata as any).target_tweet_text && (
                                                <div className="flex flex-col gap-1.5">
                                                    <span className="text-[9px] font-bold text-muted-foreground/40 uppercase tracking-wider pl-0.5">Context</span>
                                                    <div className="text-xs text-muted-foreground/70 bg-muted/5 p-3 rounded-xl border border-border/5 italic leading-relaxed">
                                                        "{(log.metadata as any).target_tweet_text}"
                                                    </div>
                                                </div>
                                            )}

                                            {log.metadata && ((log.metadata as any).reply_text || (log.metadata as any).dm_text || (log.metadata as any).post_content) && (
                                                <div className="flex flex-col gap-1.5">
                                                    <span className="text-[9px] font-bold text-primary/40 uppercase tracking-wider pl-0.5">Your response</span>
                                                    <p className="text-sm text-foreground/80 leading-relaxed font-medium px-0.5">
                                                        {(log.metadata as any).reply_text || (log.metadata as any).dm_text || (log.metadata as any).post_content}
                                                    </p>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </ScrollArea>
        </div>
    ) : null;

    if (noAnimation) return content;

    return (
        <AnimatePresence>
            {isOpen && stableTarget && (
                <motion.div
                    initial={{ width: 0, opacity: 0 }}
                    animate={{ width: 480, opacity: 1 }}
                    exit={{ width: 0, opacity: 0 }}
                    transition={{ duration: 0.2, ease: 'easeInOut' }}
                    className="h-full border-l border-border/20 bg-background shadow-2xl flex flex-col overflow-hidden shrink-0 relative"
                >
                    {content}
                </motion.div>
            )}
        </AnimatePresence>
    );
}
