import { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    BarChart2,
    Download,
    Heart,
    MessageSquare,
    UserPlus,
    Send,
    RefreshCw,
    Clock,
    ExternalLink,
    Search,
    Filter,
    Calendar,
    ChevronDown,
    Zap,
    Users,
    TrendingUp,
    Target as TargetIcon,
    ArrowUpRight,
    ArrowDownRight,
    LayoutGrid,
    LayoutList,
    MoreHorizontal,
    Globe,
    Activity
} from 'lucide-react';
import { formatDistanceToNow, isWithinInterval, subDays, startOfDay } from 'date-fns';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { useAuthStore } from '@/stores/auth.store';
import { EngagementLog, EngagementStats } from '@shared/types/engagement.types';
import { TargetHistorySheet } from './TargetHistorySheet';
import { supabase } from '@/lib/supabase';

type DateFilter = 'all' | 'today' | '7d' | '30d';

interface InsightCardProps {
    title: string;
    value: number | string;
    icon: React.ReactNode;
    subtitle: string;
    trend?: string;
    trendUp?: boolean;
    description?: string;
}

const InsightCard = ({ title, value, subtitle, icon, trend, trendUp, description }: InsightCardProps) => (
    <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
    >
        <Card className="border-border/30 bg-muted/10 backdrop-blur-md shadow-2xl rounded-[2.5rem] overflow-hidden group hover:border-border/50 transition-all cursor-default relative">
            <div className="absolute top-6 right-6 text-muted-foreground/20 group-hover:text-muted-foreground/40 transition-all transform group-hover:scale-110">
                {icon}
            </div>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 px-8 pt-8">
                <CardTitle className="text-[10px] font-black text-muted-foreground uppercase tracking-[0.2em]">{title}</CardTitle>
            </CardHeader>
            <CardContent className="px-8 pb-8 pt-0">
                <div className="flex items-baseline gap-2">
                    <div className="text-4xl font-extrabold tracking-tight text-foreground">{typeof value === 'number' ? value.toLocaleString() : value}</div>
                </div>
                <div className="flex items-center justify-between mt-4">
                    <p className="text-[11px] font-black text-muted-foreground">
                        {subtitle}
                    </p>
                    {trend && (
                        <div className={cn(
                            "text-[10px] font-black px-2 py-1 rounded-lg flex items-center gap-1 border",
                            trendUp === undefined ? "bg-muted/30 text-muted-foreground border-border/20" :
                                trendUp ? "bg-emerald-500/10 text-emerald-500 border-emerald-500/20" : "bg-rose-500/10 text-rose-500 border-rose-500/20"
                        )}>
                            {trendUp !== undefined && (trendUp ? <ArrowUpRight className="h-2.5 w-2.5" /> : <ArrowDownRight className="h-2.5 w-2.5" />)}
                            {trend}
                        </div>
                    )}
                </div>
                {description && (
                    <p className="text-[9px] text-muted-foreground/30 mt-4 font-black uppercase tracking-[0.2em]">
                        {description}
                    </p>
                )}
            </CardContent>
        </Card>
    </motion.div>
);

export function EngagementDashboard() {
    const { session } = useAuthStore();
    const accessToken = session?.access_token;
    const userId = session?.user?.id;

    const [logs, setLogs] = useState<EngagementLog[]>([]);
    const [stats, setStats] = useState<EngagementStats | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isExporting, setIsExporting] = useState(false);
    const [viewMode, setViewMode] = useState<'grid' | 'table'>('table');

    // Filters
    const [dateFilter, setDateFilter] = useState<DateFilter>('all');
    const [platformFilter, setPlatformFilter] = useState<string>('all');
    const [actionFilter, setActionFilter] = useState<string>('all');
    const [searchQuery, setSearchQuery] = useState('');

    const [selectedTarget, setSelectedTarget] = useState<{
        username: string;
        name?: string | null;
        avatar_url?: string | null;
        platform: string;
    } | null>(null);

    const fetchData = async () => {
        if (!accessToken) return;
        setIsLoading(true);
        try {
            const [fetchedLogs, fetchedStats] = await Promise.all([
                window.api.engagement.getLogs(accessToken, { limit: 200 }),
                window.api.engagement.getStats(accessToken)
            ]);
            setLogs(fetchedLogs);
            setStats(fetchedStats);
        } catch (error) {
            console.error('Failed to fetch engagement data:', error);
        } finally {
            setIsLoading(false);
        }
    };

    // Real-time subscription
    useEffect(() => {
        if (!userId) return;

        console.log('[EngagementDashboard] Setting up real-time subscription for user:', userId);

        const channel = supabase
            .channel(`engagement_logs_user_${userId}`)
            .on(
                'postgres_changes',
                {
                    event: 'INSERT',
                    schema: 'public',
                    table: 'engagement_logs',
                    filter: `user_id=eq.${userId}`
                },
                (payload) => {
                    const newLog = payload.new as EngagementLog;
                    console.log('[EngagementDashboard] New engagement log received:', newLog);

                    setLogs(prev => [newLog, ...prev]);

                    // Update stats locally to avoid a full fetch if possible, 
                    // or just trigger a background fetch for stats
                    setStats(prev => {
                        if (!prev) return null;
                        return {
                            ...prev,
                            total: prev.total + 1,
                            byType: {
                                ...prev.byType,
                                [newLog.action_type]: (prev.byType[newLog.action_type] || 0) + 1
                            },
                            byPlatform: {
                                ...prev.byPlatform,
                                [newLog.platform]: (prev.byPlatform[newLog.platform] || 0) + 1
                            }
                        };
                    });
                }
            )
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, [userId]);

    useEffect(() => {
        fetchData();
    }, [accessToken]);

    const handleExport = async () => {
        if (!accessToken) return;
        setIsExporting(true);
        try {
            const result = await window.api.engagement.exportCsv(accessToken);
            if (result.success) {
                // Success notification is handled by the main process
            }
        } catch (error) {
            console.error('Export failed:', error);
        } finally {
            setIsExporting(false);
        }
    };

    // Filtered Logs
    const filteredLogs = useMemo(() => {
        return logs.filter(log => {
            // Platform filter
            if (platformFilter !== 'all' && log.platform !== platformFilter) return false;

            // Action filter
            if (actionFilter !== 'all' && log.action_type !== actionFilter) return false;

            // Date filter
            if (dateFilter !== 'all') {
                const logDate = new Date(log.created_at);
                const now = new Date();
                let start;
                if (dateFilter === 'today') start = startOfDay(now);
                else if (dateFilter === '7d') start = subDays(now, 7);
                else if (dateFilter === '30d') start = subDays(now, 30);

                if (start && !isWithinInterval(logDate, { start, end: now })) return false;
            }

            // Search query
            if (searchQuery) {
                const query = searchQuery.toLowerCase();
                return (
                    log.target_username.toLowerCase().includes(query) ||
                    (log.target_name?.toLowerCase().includes(query) || false) ||
                    log.action_type.toLowerCase().includes(query)
                );
            }

            return true;
        });
    }, [logs, platformFilter, actionFilter, dateFilter, searchQuery]);

    // Advanced Stats Calculation
    const advancedStats = useMemo(() => {
        if (logs.length === 0) return {
            uniqueTargets: 0,
            engagementScore: 0,
            growthTrend: 0,
            avgPerDay: 0
        };

        const uniqueTargets = new Set(logs.map(l => l.target_username)).size;

        // Weight: Reply=3, Follow=2, Like=1
        const engagementScore = logs.reduce((acc, log) => {
            if (log.action_type === 'reply') return acc + 3;
            if (log.action_type === 'follow') return acc + 2;
            if (log.action_type === 'like') return acc + 1;
            return acc + 1;
        }, 0);

        // Growth Trend: Compare last 7 days vs previous 7 days
        const now = new Date();
        const last7DaysCount = logs.filter(l => isWithinInterval(new Date(l.created_at), { start: subDays(now, 7), end: now })).length;
        const prev7DaysCount = logs.filter(l => isWithinInterval(new Date(l.created_at), { start: subDays(now, 14), end: subDays(now, 7) })).length;

        const growthTrend = prev7DaysCount === 0 ? 100 : Math.round(((last7DaysCount - prev7DaysCount) / prev7DaysCount) * 100);

        const firstLogDate = new Date(logs[logs.length - 1].created_at);
        const daysDiff = Math.max(1, Math.round((now.getTime() - firstLogDate.getTime()) / (1000 * 60 * 60 * 24)));
        const avgPerDay = Math.round((logs.length / daysDiff) * 10) / 10;

        return {
            uniqueTargets,
            engagementScore,
            growthTrend,
            avgPerDay
        };
    }, [logs]);

    const getActionIcon = (type: string) => {
        switch (type) {
            case 'like': return <Heart className="h-4 w-4 text-pink-500/50" />;
            case 'reply': return <MessageSquare className="h-4 w-4 text-blue-500/50" />;
            case 'follow': return <UserPlus className="h-4 w-4 text-emerald-500/50" />;
            case 'dm': return <Send className="h-4 w-4 text-indigo-500/50" />;
            case 'post': return <BarChart2 className="h-4 w-4 text-foreground/50" />;
            default: return <RefreshCw className="h-4 w-4 text-muted-foreground/50" />;
        }
    };

    const platforms = useMemo(() => {
        const set = new Set(logs.map(l => l.platform));
        return Array.from(set);
    }, [logs]);

    const activeFiltersCount = (platformFilter !== 'all' ? 1 : 0) + (actionFilter !== 'all' ? 1 : 0) + (dateFilter !== 'all' ? 1 : 0);

    return (
        <div className="h-full flex overflow-hidden bg-background">
            <div className="flex-1 flex flex-col p-6 min-w-0 overflow-hidden">
                {/* Header / Filter Toolbar */}
                <div className="flex flex-col gap-6 mb-8 text-left">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <div className="p-2.5 rounded-2xl bg-muted/40 border border-border/10">
                                <Activity className="h-6 w-6 text-foreground/70" />
                            </div>
                            <div>
                                <h2 className="text-2xl font-bold tracking-tight text-foreground">Insights</h2>
                                <div className="flex items-center gap-2 text-[11px] font-medium text-muted-foreground mt-0.5">
                                    <span className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-emerald-500/5 border border-emerald-500/10">
                                        <div className="h-1 w-1 rounded-full bg-emerald-500 animate-pulse" />
                                        <span className="text-emerald-500/80">Live</span>
                                    </span>
                                    <span>•</span>
                                    <span>{logs.length} Total Events</span>
                                </div>
                            </div>
                        </div>

                        <div className="flex items-center gap-2">
                            <div className="bg-muted/20 p-1 rounded-xl border border-border/20 flex items-center gap-1 mr-2">
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    className={cn("h-8 w-8 p-0 rounded-lg", viewMode === 'table' && "bg-background shadow-sm text-foreground")}
                                    onClick={() => setViewMode('table')}
                                >
                                    <LayoutList className="h-4 w-4" />
                                </Button>
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    className={cn("h-8 w-8 p-0 rounded-lg", viewMode === 'grid' && "bg-background shadow-sm text-foreground")}
                                    onClick={() => setViewMode('grid')}
                                >
                                    <LayoutGrid className="h-4 w-4" />
                                </Button>
                            </div>
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={handleExport}
                                disabled={isExporting}
                                className="rounded-xl border-border/40 hover:bg-muted/50 transition-all active:scale-95"
                            >
                                <Download className="h-4 w-4 mr-2" />
                                Export
                            </Button>
                        </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-3">
                        <div className="relative flex-1 min-w-[200px]">
                            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/50" />
                            <input
                                type="text"
                                placeholder="Search interactions..."
                                className="w-full h-10 pl-11 pr-4 rounded-xl border border-border/40 bg-muted/20 focus:outline-none focus:ring-1 focus:ring-primary/40 transition-all text-sm placeholder:text-muted-foreground/40"
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                            />
                        </div>

                        <div className="flex items-center gap-2">
                            <Select value={dateFilter} onValueChange={(v: DateFilter) => setDateFilter(v)}>
                                <SelectTrigger className="w-[130px] h-10 rounded-xl border-border/40 bg-muted/20">
                                    <Calendar className="h-3.5 w-3.5 mr-2 text-muted-foreground/60" />
                                    <SelectValue placeholder="Date range" />
                                </SelectTrigger>
                                <SelectContent className="rounded-xl border-border/40">
                                    <SelectItem value="all">All Time</SelectItem>
                                    <SelectItem value="today">Today</SelectItem>
                                    <SelectItem value="7d">Last 7 Days</SelectItem>
                                    <SelectItem value="30d">Last 30 Days</SelectItem>
                                </SelectContent>
                            </Select>

                            <Select value={platformFilter} onValueChange={setPlatformFilter}>
                                <SelectTrigger className="w-[140px] h-10 rounded-xl border-border/40 bg-muted/20">
                                    <Globe className="h-3.5 w-3.5 mr-2 text-muted-foreground/60" />
                                    <SelectValue placeholder="Platform" />
                                </SelectTrigger>
                                <SelectContent className="rounded-xl border-border/40">
                                    <SelectItem value="all">Platforms</SelectItem>
                                    {platforms.map(p => (
                                        <SelectItem key={p} value={p}>{p}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>

                            <Select value={actionFilter} onValueChange={setActionFilter}>
                                <SelectTrigger className="w-[130px] h-10 rounded-xl border-border/40 bg-muted/20">
                                    <Filter className="h-3.5 w-3.5 mr-2 text-muted-foreground/60" />
                                    <SelectValue placeholder="Action" />
                                </SelectTrigger>
                                <SelectContent className="rounded-xl border-border/40">
                                    <SelectItem value="all">Actions</SelectItem>
                                    <SelectItem value="like">Likes</SelectItem>
                                    <SelectItem value="reply">Replies</SelectItem>
                                    <SelectItem value="follow">Follows</SelectItem>
                                    <SelectItem value="dm">DMs</SelectItem>
                                </SelectContent>
                            </Select>

                            {(activeFiltersCount > 0 || searchQuery) && (
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-10 rounded-xl text-muted-foreground hover:text-foreground"
                                    onClick={() => {
                                        setDateFilter('all');
                                        setPlatformFilter('all');
                                        setActionFilter('all');
                                        setSearchQuery('');
                                    }}
                                >
                                    Clear
                                </Button>
                            )}
                        </div>
                    </div>
                </div>

                {/* Smart Stats Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-10">
                    <InsightCard
                        title="Unique Outreach"
                        value={advancedStats.uniqueTargets}
                        icon={<Users className="h-4 w-4" />}
                        subtitle="Engaged users"
                        trend={advancedStats.growthTrend > 0 ? `+${advancedStats.growthTrend}%` : `${advancedStats.growthTrend}%`}
                        trendUp={advancedStats.growthTrend >= 0}
                    />
                    <InsightCard
                        title="Engagement Score"
                        value={advancedStats.engagementScore}
                        icon={<Zap className="h-4 w-4" />}
                        subtitle="Weighted impact"
                        trend={`${advancedStats.avgPerDay}/day`}
                        description="Replies=3, Follows=2, Likes=1"
                    />
                    <InsightCard
                        title="Active Response"
                        value={stats?.byType['reply'] || 0}
                        icon={<MessageSquare className="h-4 w-4" />}
                        subtitle="Comment engagement"
                        trend={stats?.total ? `${Math.round(((stats.byType['reply'] || 0) / stats.total) * 100)}% share` : '0%'}
                    />
                    <InsightCard
                        title="Total Actions"
                        value={stats?.total || 0}
                        icon={<TrendingUp className="h-4 w-4" />}
                        subtitle="Overall activity"
                        trend={advancedStats.growthTrend >= 0 ? 'Growing' : 'Steady'}
                        trendUp={advancedStats.growthTrend >= 0}
                    />
                </div>

                {/* Main Content Area */}
                <Card className="flex-1 min-h-0 border-border/10 bg-card/20 shadow-2xl rounded-[2.5rem] overflow-hidden flex flex-col transition-all">
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 px-8 py-6">
                        <div>
                            <CardTitle className="text-xl font-bold">Activity Feed</CardTitle>
                            <CardDescription>
                                {filteredLogs.length === logs.length
                                    ? "Displaying latest interactions across all platforms"
                                    : `Showing ${filteredLogs.length} matching interactions`}
                            </CardDescription>
                        </div>
                        {isLoading && <RefreshCw className="h-4 w-4 animate-spin text-muted-foreground" />}
                    </CardHeader>

                    <CardContent className="flex-1 overflow-hidden p-0">
                        <ScrollArea className="h-full">
                            <div className="px-8 pb-8">
                                <AnimatePresence mode="popLayout">
                                    {viewMode === 'table' ? (
                                        <table className="w-full text-sm">
                                            <thead>
                                                <tr className="text-muted-foreground border-b border-border/20">
                                                    <th className="font-semibold text-left py-4 px-2 uppercase tracking-wider text-[10px]">Action</th>
                                                    <th className="font-semibold text-left py-4 px-2 uppercase tracking-wider text-[10px]">Target</th>
                                                    <th className="font-semibold text-left py-4 px-2 uppercase tracking-wider text-[10px]">Source</th>
                                                    <th className="font-semibold text-left py-4 px-2 uppercase tracking-wider text-[10px]">Timestamp</th>
                                                    <th className="font-semibold text-right py-4 px-2 uppercase tracking-wider text-[10px]">Actions</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-border/10">
                                                {filteredLogs.length === 0 ? (
                                                    <tr>
                                                        <td colSpan={5} className="py-24 text-center">
                                                            <div className="flex flex-col items-center gap-3 text-muted-foreground">
                                                                <div className="p-4 rounded-full bg-muted/50">
                                                                    <Search className="h-8 w-8 opacity-20" />
                                                                </div>
                                                                <p className="italic text-base">No matching interactions found.</p>
                                                                <Button
                                                                    variant="link"
                                                                    className="text-primary hover:no-underline"
                                                                    onClick={() => {
                                                                        setDateFilter('all');
                                                                        setPlatformFilter('all');
                                                                        setActionFilter('all');
                                                                        setSearchQuery('');
                                                                    }}
                                                                >
                                                                    Reset all filters
                                                                </Button>
                                                            </div>
                                                        </td>
                                                    </tr>
                                                ) : (
                                                    filteredLogs.map((log) => (
                                                        <motion.tr
                                                            layout
                                                            key={log.id}
                                                            initial={{ opacity: 0 }}
                                                            animate={{ opacity: 1 }}
                                                            exit={{ opacity: 0 }}
                                                            className="group hover:bg-primary/[0.03] transition-colors border-border/5"
                                                        >
                                                            <td className="py-4 px-2">
                                                                <div className="flex items-center gap-3">
                                                                    <div className="h-10 w-10 rounded-xl bg-muted/20 border border-border/10 flex items-center justify-center group-hover:bg-background transition-colors shadow-sm">
                                                                        {getActionIcon(log.action_type)}
                                                                    </div>
                                                                    <div className="flex flex-col">
                                                                        <span className="capitalize font-bold text-white/90">{log.action_type}</span>
                                                                        <span className="text-[10px] text-muted-foreground/60 font-bold uppercase tracking-wider">Outreach</span>
                                                                    </div>
                                                                </div>
                                                            </td>
                                                            <td className="py-4 px-2">
                                                                <div
                                                                    className="flex items-center gap-3 cursor-pointer group/target w-fit"
                                                                    onClick={() => setSelectedTarget({
                                                                        username: log.target_username,
                                                                        name: log.target_name,
                                                                        avatar_url: log.target_avatar_url,
                                                                        platform: log.platform
                                                                    })}
                                                                >
                                                                    <div className="relative">
                                                                        {log.target_avatar_url ? (
                                                                            <img src={log.target_avatar_url} className="h-9 w-9 rounded-full border border-border/40 group-hover/target:border-primary/50 transition-all group-hover/target:scale-105" alt="" />
                                                                        ) : (
                                                                            <div className="h-9 w-9 rounded-full bg-gradient-to-br from-muted to-muted/50 flex items-center justify-center border border-border/40 font-bold text-[10px] text-muted-foreground group-hover/target:border-primary/50 transition-all group-hover/target:scale-105">
                                                                                {log.target_username?.[0]?.toUpperCase() || 'U'}
                                                                            </div>
                                                                        )}
                                                                        <div className="absolute -bottom-1 -right-1 h-3 w-3 rounded-full border-2 border-background bg-emerald-500/40" />
                                                                    </div>
                                                                    <div className="flex flex-col">
                                                                        <span className="font-bold text-white group-hover/target:text-primary transition-colors">{log.target_name || log.target_username}</span>
                                                                        <span className="text-xs text-muted-foreground/60 font-mono">@{log.target_username}</span>
                                                                    </div>
                                                                </div>
                                                            </td>
                                                            <td className="py-4 px-2">
                                                                <div className="flex items-center gap-2">
                                                                    <span className="text-[9px] font-bold px-2 py-0.5 rounded-lg bg-muted border border-border/10 text-muted-foreground/60 uppercase tracking-widest">
                                                                        {log.platform.replace('.com', '')}
                                                                    </span>
                                                                </div>
                                                            </td>
                                                            <td className="py-4 px-2 text-muted-foreground font-medium">
                                                                <div className="flex items-center gap-1.5 whitespace-nowrap text-xs">
                                                                    <Clock className="h-3 w-3 opacity-50" />
                                                                    {formatDistanceToNow(new Date(log.created_at), { addSuffix: true })}
                                                                </div>
                                                            </td>
                                                            <td className="py-4 px-2 text-right">
                                                                <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                                                    <Button
                                                                        variant="ghost"
                                                                        size="sm"
                                                                        className="h-8 w-8 p-0 rounded-lg hover:bg-primary/10 hover:text-primary transition-all"
                                                                        onClick={() => {
                                                                            const url = (log.metadata as any)?.url || (log.target_username ? `https://${log.platform.replace('.com', '')}.com/${log.target_username}` : '#');
                                                                            if (url !== '#') window.open(url, '_blank');
                                                                        }}
                                                                    >
                                                                        <ExternalLink className="h-4 w-4" />
                                                                    </Button>
                                                                    <Button
                                                                        variant="ghost"
                                                                        size="sm"
                                                                        className="h-8 w-8 p-0 rounded-lg hover:bg-muted transition-all"
                                                                        onClick={() => setSelectedTarget({
                                                                            username: log.target_username,
                                                                            name: log.target_name,
                                                                            avatar_url: log.target_avatar_url,
                                                                            platform: log.platform
                                                                        })}
                                                                    >
                                                                        <MoreHorizontal className="h-4 w-4" />
                                                                    </Button>
                                                                </div>
                                                            </td>
                                                        </motion.tr>
                                                    ))
                                                )}
                                            </tbody>
                                        </table>
                                    ) : (
                                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 pb-4">
                                            {filteredLogs.map((log) => (
                                                <motion.div
                                                    layout
                                                    key={log.id}
                                                    initial={{ opacity: 0, scale: 0.95 }}
                                                    animate={{ opacity: 1, scale: 1 }}
                                                    exit={{ opacity: 0, scale: 0.95 }}
                                                    className="group p-4 rounded-2xl bg-muted/20 border border-border/20 hover:border-primary/30 transition-all hover:bg-muted/30 cursor-pointer"
                                                    onClick={() => setSelectedTarget({
                                                        username: log.target_username,
                                                        name: log.target_name,
                                                        avatar_url: log.target_avatar_url,
                                                        platform: log.platform
                                                    })}
                                                >
                                                    <div className="flex items-start justify-between mb-3">
                                                        <div className="h-10 w-10 rounded-xl bg-card border border-border/20 flex items-center justify-center shadow-sm">
                                                            {getActionIcon(log.action_type)}
                                                        </div>
                                                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-background border border-border/30 text-muted-foreground uppercase">
                                                            {log.platform.replace('.com', '')}
                                                        </span>
                                                    </div>
                                                    <div className="flex items-center gap-3 mb-4">
                                                        {log.target_avatar_url ? (
                                                            <img src={log.target_avatar_url} className="h-10 w-10 rounded-lg border border-border/20" alt="" />
                                                        ) : (
                                                            <div className="h-10 w-10 rounded-lg bg-card border border-border/20 flex items-center justify-center font-bold text-xs text-muted-foreground">
                                                                {log.target_username?.[0]?.toUpperCase()}
                                                            </div>
                                                        )}
                                                        <div className="flex flex-col min-w-0">
                                                            <span className="font-bold text-foreground truncate">{log.target_name || log.target_username}</span>
                                                            <span className="text-xs text-muted-foreground truncate font-mono">@{log.target_username}</span>
                                                        </div>
                                                    </div>
                                                    <div className="flex items-center justify-between text-[10px] text-muted-foreground font-medium border-t border-border/10 pt-3 mt-auto">
                                                        <span className="capitalize">{log.action_type}</span>
                                                        <span>{formatDistanceToNow(new Date(log.created_at), { addSuffix: true })}</span>
                                                    </div>
                                                </motion.div>
                                            ))}
                                        </div>
                                    )}
                                </AnimatePresence>
                            </div>
                        </ScrollArea>
                    </CardContent>
                </Card>
            </div>
            <TargetHistorySheet
                isOpen={!!selectedTarget}
                onClose={() => setSelectedTarget(null)}
                target={selectedTarget}
            />
        </div>
    );
}
