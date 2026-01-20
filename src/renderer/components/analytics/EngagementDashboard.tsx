import { useState, useEffect, useMemo, useRef } from 'react';
import { AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { motion, AnimatePresence } from 'framer-motion';
import * as Dialog from '@radix-ui/react-dialog';
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
    Activity,
    X,
    SlidersHorizontal
} from 'lucide-react';
import { formatDistanceToNow, isWithinInterval, subDays, startOfDay, endOfDay, subHours, subMinutes, addMinutes } from 'date-fns';
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


const ChartTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
        return (
            <div className="bg-background/95 backdrop-blur-md border border-border/50 p-2.5 rounded-xl shadow-2xl transition-all duration-300">
                <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-1">{label}</p>
                <p className="text-sm font-bold text-primary">{payload[0].value.toLocaleString()} <span className="text-[10px] text-muted-foreground font-normal lowercase">events</span></p>
            </div>
        );
    }
    return null;
};

const Sparkline = ({ data, color = "#3b82f6" }: { data: number[] | { name: string; value: number }[]; color?: string }) => {
    const chartData = useMemo(() => {
        if (data.length === 0) return [];
        return data.map((item, i) => {
            if (typeof item === 'number') return { value: item, index: i };
            return { value: item.value, index: i, name: item.name };
        });
    }, [data]);

    if (chartData.length < 2) return null;

    return (
        <div
            className="h-full w-full select-none outline-none focus:outline-none pointer-events-none"
            tabIndex={-1}
            style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
        >
            <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData}>
                    <defs>
                        <linearGradient id={`gradient-${color}`} x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor={color} stopOpacity={0.3} />
                            <stop offset="95%" stopColor={color} stopOpacity={0} />
                        </linearGradient>
                    </defs>
                    <Area
                        type="monotone"
                        dataKey="value"
                        stroke={color}
                        strokeWidth={2}
                        fillOpacity={1}
                        fill={`url(#gradient-${color})`}
                        isAnimationActive={true}
                        animationDuration={1500}
                    />
                </AreaChart>
            </ResponsiveContainer>
        </div>
    );
};

const MetricBarChart = ({ data, color = "#3b82f6" }: { data: { name: string; value: number }[]; color?: string }) => {
    return (
        <div
            className="h-full w-full select-none outline-none focus:outline-none"
            tabIndex={-1}
            onMouseDown={(e) => e.preventDefault()}
            style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
        >
            <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data} margin={{ top: 10, right: 10, left: -20, bottom: 25 }}>
                    <Tooltip
                        content={<ChartTooltip />}
                        cursor={{ fill: 'rgba(255,255,255,0.05)', radius: 8 }}
                        animationDuration={200}
                    />
                    <XAxis
                        dataKey="name"
                        axisLine={false}
                        tickLine={false}
                        tick={{ fill: 'rgba(255,255,255,0.3)', fontSize: 8, fontWeight: 600 }}
                        interval={data.length > 20 ? 4 : 1}
                        dy={6}
                    />
                    <YAxis
                        axisLine={false}
                        tickLine={false}
                        tick={{ fill: 'rgba(255,255,255,0.05)', fontSize: 8 }}
                    />
                    <Bar
                        dataKey="value"
                        fill={color}
                        radius={[4, 4, 0, 0]}
                        opacity={0.6}
                        isAnimationActive={true}
                        activeBar={{ opacity: 1, fill: color }}
                    />
                </BarChart>
            </ResponsiveContainer>
        </div>
    );
};

const DonutChart = ({ data, colors }: { data: { label: string; value: number }[]; colors: string[] }) => {
    const total = useMemo(() => data.reduce((acc, d) => acc + d.value, 0), [data]);

    return (
        <div
            className="h-full w-full select-none outline-none focus:outline-none"
            tabIndex={-1}
            onMouseDown={(e) => e.preventDefault()}
            style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
        >
            <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                    <Tooltip
                        content={({ active, payload }: any) => {
                            if (active && payload && payload.length) {
                                return (
                                    <div className="bg-background/95 backdrop-blur-md border border-border/50 p-2 pb-1.5 rounded-xl shadow-2xl">
                                        <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">{payload[0].name}</p>
                                        <p className="text-sm font-bold text-primary">
                                            {payload[0].value.toLocaleString()}
                                            <span className="text-[10px] text-muted-foreground font-normal ml-1">
                                                ({Math.round((payload[0].value / total) * 100)}%)
                                            </span>
                                        </p>
                                    </div>
                                );
                            }
                            return null;
                        }}
                    />
                    <Pie
                        data={data}
                        cx="50%"
                        cy="50%"
                        innerRadius={38}
                        outerRadius={48}
                        paddingAngle={4}
                        dataKey="value"
                        nameKey="label"
                        stroke="none"
                        startAngle={90}
                        endAngle={-270}
                    >
                        {data.map((entry, index) => (
                            <Cell
                                key={`cell-${index}`}
                                fill={colors[index % colors.length]}
                                className="outline-none"
                            />
                        ))}
                    </Pie>
                </PieChart>
            </ResponsiveContainer>
        </div>
    );
};

interface InsightCardProps {
    title: string;
    value: number | string;
    icon: React.ReactNode;
    subtitle?: string;
    trend?: string;
    trendUp?: boolean;
    chartData?: number[] | { name: string; value: number }[];
    chartColor?: string;
    className?: string; // Allow custom classes for symmetry adjustments
    footer?: React.ReactNode;
}

const InsightCard = ({ title, value, subtitle, icon, trend, trendUp, chartData, chartColor, className, footer }: InsightCardProps) => (
    <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.4 }}
        className={cn("h-full", className)}
    >
        <Card className="h-full border-border/30 bg-muted/10 backdrop-blur-md shadow-xl rounded-[2rem] overflow-hidden group hover:border-primary/20 transition-all cursor-default relative flex flex-col">
            <div className="absolute top-6 right-6 p-2 rounded-full bg-background/50 border border-border/20 text-muted-foreground/50 group-hover:text-primary group-hover:bg-primary/10 transition-all">
                {icon}
            </div>

            <CardHeader className="pb-2 px-8 pt-8 space-y-0">
                <CardTitle className="text-[11px] font-bold text-muted-foreground uppercase tracking-widest">{title}</CardTitle>
            </CardHeader>

            <CardContent className="px-8 pb-6 flex-1 flex flex-col justify-between">
                <div>
                    <div className="flex items-baseline gap-2 mb-1">
                        <div className="text-3xl font-bold tracking-tight text-foreground">{typeof value === 'number' ? value.toLocaleString() : value}</div>
                    </div>
                    {subtitle && <p className="text-xs font-medium text-muted-foreground/60">{subtitle}</p>}
                </div>

                <div className="mt-6 flex-1 flex items-end">
                    {chartData ? (
                        <div className="h-12 w-full">
                            <Sparkline data={chartData} color={chartColor || "currentColor"} />
                        </div>
                    ) : footer ? (
                        <div className="w-full">{footer}</div>
                    ) : (
                        trend && (
                            <div className={cn(
                                "text-[10px] font-bold px-2.5 py-1 rounded-lg flex items-center gap-1.5 border w-fit",
                                trendUp === undefined ? "bg-muted/50 text-muted-foreground border-border/20" :
                                    trendUp ? "bg-blue-500/10 text-blue-400 border-blue-500/20" : "bg-rose-500/10 text-rose-500 border-rose-500/20"
                            )}>
                                {trendUp !== undefined && (trendUp ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />)}
                                {trend}
                            </div>
                        )
                    )}
                </div>
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

    const [isSearchExpanded, setIsSearchExpanded] = useState(false);
    const [isFilterDrawerOpen, setIsFilterDrawerOpen] = useState(false);
    const searchContainerRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    // Focus input when expanded
    useEffect(() => {
        if (isSearchExpanded && inputRef.current) {
            inputRef.current.focus();
        }
    }, [isSearchExpanded]);

    // Handle click outside to collapse
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (searchContainerRef.current && !searchContainerRef.current.contains(event.target as Node)) {
                if (!searchQuery) {
                    setIsSearchExpanded(false);
                }
            }
        };

        if (isSearchExpanded) {
            document.addEventListener('mousedown', handleClickOutside);
        }

        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, [isSearchExpanded, searchQuery]);

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
            avgPerDay: 0,
            dailyActivity: [],
            dailyScore: [],
            dailyUnique: [],
            platformDist: [],
            actionDist: [],
            hourlyActivity: []
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

        // Activity Chart Data (Last 14 days)
        const dailyActivity = Array.from({ length: 14 }).map((_, i) => {
            const d = subDays(now, 13 - i);
            const count = logs.filter(l => isWithinInterval(new Date(l.created_at), {
                start: startOfDay(d),
                end: endOfDay(d)
            })).length;
            return { name: d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }), value: count };
        });

        // Weighted Score per Day
        const scorePerDay = Array.from({ length: 14 }).map((_, i) => {
            const d = subDays(now, 13 - i);
            const dayLogs = logs.filter(l => isWithinInterval(new Date(l.created_at), {
                start: startOfDay(d),
                end: endOfDay(d)
            }));
            return dayLogs.reduce((acc, log) => {
                if (log.action_type === 'reply') return acc + 3;
                if (log.action_type === 'follow') return acc + 2;
                if (log.action_type === 'like') return acc + 1;
                return acc + 1;
            }, 0);
        });

        const dailyUnique = Array.from({ length: 14 }).map((_, i) => {
            const d = subDays(now, 13 - i);
            const targets = new Set(logs.filter(l => isWithinInterval(new Date(l.created_at), {
                start: startOfDay(d),
                end: endOfDay(d)
            })).map(l => l.target_username));
            return { name: d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }), value: targets.size };
        });

        // 3-Day Moving Average for Score (Smoothing)
        const dailyScore = scorePerDay.map((val, i) => {
            const start = Math.max(0, i - 1);
            const end = Math.min(scorePerDay.length - 1, i + 1);
            const subset = scorePerDay.slice(start, end + 1);
            const avg = subset.reduce((a, b) => a + b, 0) / subset.length;
            const d = subDays(now, 13 - i);
            return { name: d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }), value: Math.round(avg * 10) / 10 };
        });

        // Platform Distribution
        const platformCounts: Record<string, number> = {};
        logs.forEach(l => {
            platformCounts[l.platform] = (platformCounts[l.platform] || 0) + 1;
        });
        const platformDist = Object.entries(platformCounts).map(([label, value]) => ({ label, value }));

        // Action Distribution
        const actionCounts: Record<string, number> = {};
        logs.forEach(l => {
            actionCounts[l.action_type] = (actionCounts[l.action_type] || 0) + 1;
        });
        const actionDist = Object.entries(actionCounts).map(([label, value]) => ({ label, value }));

        // Hourly Activity (last 24h)
        const hourlyActivity = Array.from({ length: 24 }).map((_, i) => {
            const h = subHours(now, 23 - i);
            const count = logs.filter(l => isWithinInterval(new Date(l.created_at), {
                start: subMinutes(h, 30),
                end: addMinutes(h, 30)
            })).length;
            return { name: h.toLocaleTimeString(undefined, { hour: 'numeric', hour12: true }), value: count };
        });

        return {
            uniqueTargets,
            engagementScore,
            growthTrend,
            avgPerDay,
            dailyActivity,
            dailyScore,
            dailyUnique,
            platformDist,
            actionDist,
            hourlyActivity
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
            <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
                <div className="p-6 pb-0 flex items-center justify-between gap-4 min-h-[44px]">
                    <div className="flex items-center gap-4 shrink-0">
                        <h2 className="text-lg font-bold tracking-tight text-foreground">Analytics</h2>
                    </div>

                    <div className="flex items-center gap-3 flex-1 justify-end">
                        {/* Expanding Search Component */}
                        <div
                            ref={searchContainerRef}
                            className={cn(
                                "relative flex items-center transition-all duration-300 ease-in-out overflow-hidden h-9",
                                isSearchExpanded || searchQuery ? "w-64 bg-muted/40 rounded-xl" : "w-10"
                            )}
                        >
                            <Button
                                variant="ghost"
                                size="sm"
                                className={cn(
                                    "h-9 w-10 p-0 shrink-0 transition-colors rounded-xl focus-visible:ring-0 focus-visible:outline-none",
                                    (isSearchExpanded || searchQuery) ? "text-foreground" : "text-muted-foreground hover:text-foreground hover:bg-muted/40"
                                )}
                                onClick={() => {
                                    setIsSearchExpanded(!isSearchExpanded);
                                }}
                            >
                                <Search className="h-4 w-4" />
                            </Button>
                            <div className="relative flex-1 flex items-center min-w-0 pr-2">
                                <input
                                    ref={inputRef}
                                    placeholder="Search interactions..."
                                    className={cn(
                                        "bg-transparent border-none text-xs outline-none text-foreground/80 placeholder:text-muted-foreground/50 transition-all duration-300 w-full focus:outline-none",
                                        isSearchExpanded || searchQuery ? "opacity-100 pl-1 pr-8" : "opacity-0 w-0 pointer-events-none"
                                    )}
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                />
                                {searchQuery && (isSearchExpanded || searchQuery) && (
                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            setSearchQuery('');
                                            inputRef.current?.focus();
                                        }}
                                        className="absolute right-2 p-1 text-muted-foreground/40 hover:text-foreground/60 transition-colors rounded-md focus:outline-none focus:text-foreground"
                                    >
                                        <X className="h-3.5 w-3.5" />
                                    </button>
                                )}
                            </div>
                        </div>

                        <div className="h-4 w-[1px] bg-border/20 mx-1" />


                        <Button
                            variant="ghost"
                            size="icon"
                            className={cn(
                                "h-9 w-9 rounded-xl transition-all",
                                activeFiltersCount > 0 ? "text-primary bg-primary/10" : "text-muted-foreground hover:text-foreground hover:bg-muted/40"
                            )}
                            onClick={() => setIsFilterDrawerOpen(true)}
                            title="Filter Analytics"
                        >
                            <SlidersHorizontal className="h-4 w-4" />
                        </Button>

                        {/* Filter Sidebar Drawer */}
                        <Dialog.Root open={isFilterDrawerOpen} onOpenChange={setIsFilterDrawerOpen}>
                            <Dialog.Portal>
                                <Dialog.Overlay className="fixed inset-0 bg-black/40 backdrop-blur-[2px] z-50 transition-opacity" />
                                <Dialog.Content className="fixed right-0 top-0 h-full w-[320px] bg-background border-l border-border shadow-2xl z-50 flex flex-col focus:outline-none">
                                    <div className="p-6 border-b border-border/50 flex items-center justify-between">
                                        <h2 className="text-sm font-semibold text-foreground/80 uppercase tracking-wider">Filters</h2>
                                        <Dialog.Close asChild>
                                            <Button variant="ghost" size="icon" className="h-8 w-8 hover:bg-muted rounded-full">
                                                <X className="h-4 w-4 text-muted-foreground" />
                                            </Button>
                                        </Dialog.Close>
                                    </div>

                                    <ScrollArea className="flex-1 p-6">
                                        <div className="space-y-8">
                                            <div className="space-y-4">
                                                <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Time Period</label>
                                                <div className="grid grid-cols-2 gap-2">
                                                    {[
                                                        { id: 'all', label: 'All Time' },
                                                        { id: 'today', label: 'Today' },
                                                        { id: '7d', label: '7 Days' },
                                                        { id: '30d', label: '30 Days' }
                                                    ].map((filter) => (
                                                        <button
                                                            key={filter.id}
                                                            onClick={() => setDateFilter(filter.id as DateFilter)}
                                                            className={cn(
                                                                "px-3 py-2 rounded-xl text-xs font-medium border transition-all text-center",
                                                                dateFilter === filter.id
                                                                    ? "bg-primary/10 border-primary text-primary"
                                                                    : "bg-muted/30 border-border/50 text-muted-foreground hover:border-border"
                                                            )}
                                                        >
                                                            {filter.label}
                                                        </button>
                                                    ))}
                                                </div>
                                            </div>

                                            <div className="space-y-4">
                                                <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Platform</label>
                                                <div className="space-y-2">
                                                    <button
                                                        onClick={() => setPlatformFilter('all')}
                                                        className={cn(
                                                            "w-full flex items-center justify-between px-3 py-2.5 rounded-xl border transition-all truncate",
                                                            platformFilter === 'all'
                                                                ? "bg-primary/10 border-primary text-primary"
                                                                : "bg-muted/30 border-border/50 text-muted-foreground hover:border-border"
                                                        )}
                                                    >
                                                        <span className="text-xs font-medium">All Platforms</span>
                                                    </button>
                                                    {platforms.map((p) => (
                                                        <button
                                                            key={p}
                                                            onClick={() => setPlatformFilter(p)}
                                                            className={cn(
                                                                "w-full flex items-center justify-between px-3 py-2.5 rounded-xl border transition-all truncate",
                                                                platformFilter === p
                                                                    ? "bg-primary/10 border-primary text-primary"
                                                                    : "bg-muted/30 border-border/50 text-muted-foreground hover:border-border"
                                                            )}
                                                        >
                                                            <span className="text-xs font-medium capitalize">{p.replace('.com', '')}</span>
                                                        </button>
                                                    ))}
                                                </div>
                                            </div>

                                            <div className="space-y-4">
                                                <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Action Type</label>
                                                <div className="space-y-2">
                                                    {[
                                                        { id: 'all', label: 'All Actions' },
                                                        { id: 'like', label: 'Likes' },
                                                        { id: 'reply', label: 'Replies' },
                                                        { id: 'follow', label: 'Follows' },
                                                        { id: 'dm', label: 'DMs' }
                                                    ].map((action) => (
                                                        <button
                                                            key={action.id}
                                                            onClick={() => setActionFilter(action.id)}
                                                            className={cn(
                                                                "w-full flex items-center justify-between px-3 py-2.5 rounded-xl border transition-all",
                                                                actionFilter === action.id
                                                                    ? "bg-primary/10 border-primary text-primary"
                                                                    : "bg-muted/30 border-border/50 text-muted-foreground hover:border-border"
                                                            )}
                                                        >
                                                            <span className="text-xs font-medium">{action.label}</span>
                                                        </button>
                                                    ))}
                                                </div>
                                            </div>
                                        </div>
                                    </ScrollArea>

                                    <div className="p-6 border-t border-border/50 bg-muted/10">
                                        <Button
                                            variant="outline"
                                            className="w-full rounded-xl"
                                            onClick={() => {
                                                setDateFilter('all');
                                                setPlatformFilter('all');
                                                setActionFilter('all');
                                                setSearchQuery('');
                                            }}
                                        >
                                            Reset Filters
                                        </Button>
                                    </div>
                                </Dialog.Content>
                            </Dialog.Portal>
                        </Dialog.Root>

                        <div className="h-4 w-[1px] bg-border/20 mx-1" />

                        {/* View & Export */}
                        <div className="flex items-center gap-2">
                            <div className="flex p-0.5 bg-muted/20 border border-border/20 rounded-xl h-9 items-center">
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    className={cn("h-7 w-7 p-0 rounded-lg hover:bg-muted/50", viewMode === 'table' && "bg-background shadow-sm text-primary hover:bg-background")}
                                    onClick={() => setViewMode('table')}
                                >
                                    <LayoutList className="h-3.5 w-3.5" />
                                </Button>
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    className={cn("h-7 w-7 p-0 rounded-lg hover:bg-muted/50", viewMode === 'grid' && "bg-background shadow-sm text-primary hover:bg-background")}
                                    onClick={() => setViewMode('grid')}
                                >
                                    <LayoutGrid className="h-3.5 w-3.5" />
                                </Button>
                            </div>

                            <Button
                                variant="outline"
                                size="sm"
                                onClick={handleExport}
                                disabled={isExporting}
                            >
                                <Download className="h-3.5 w-3.5" />
                            </Button>
                        </div>
                    </div>
                </div>

                <ScrollArea className="flex-1">
                    <div className="p-6 pt-2 pb-12 space-y-8">
                        {/* Summary Stats Grid */}
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                            {/* Card 1: Engagement Score */}
                            <InsightCard
                                title="Engagement Score"
                                value={advancedStats.engagementScore}
                                icon={<Zap className="h-4 w-4" />}
                                subtitle="Impact velocity"
                                chartData={advancedStats.dailyScore}
                                chartColor="#3b82f6"
                            />

                            {/* Card 2: Unique Outreach */}
                            <InsightCard
                                title="Unique Outreach"
                                value={advancedStats.uniqueTargets}
                                icon={<Users className="h-4 w-4" />}
                                subtitle="Total engaged users"
                                chartData={advancedStats.dailyUnique}
                                chartColor="#3b82f6"
                                trend={`${advancedStats.growthTrend > 0 ? '+' : ''}${advancedStats.growthTrend}%`}
                                trendUp={advancedStats.growthTrend >= 0}
                            />

                            {/* Card 3: Active Response */}
                            <InsightCard
                                title="Active Response"
                                value={stats?.byType['reply'] || 0}
                                icon={<MessageSquare className="h-4 w-4" />}
                                subtitle="Reply rate"
                                footer={
                                    <div className="space-y-2">
                                        <div className="flex justify-between text-[10px] font-bold text-muted-foreground/60 uppercase tracking-widest">
                                            <span>Share</span>
                                            <span>{stats?.total ? Math.round(((stats.byType['reply'] || 0) / stats.total) * 100) : 0}%</span>
                                        </div>
                                        <div className="h-1.5 w-full bg-muted/40 rounded-full overflow-hidden">
                                            <div
                                                className="h-full bg-blue-500 rounded-full"
                                                style={{ width: `${stats?.total ? Math.round(((stats.byType['reply'] || 0) / stats.total) * 100) : 0}%` }}
                                            />
                                        </div>
                                    </div>
                                }
                            />

                            {/* Card 4: Total Actions */}
                            <InsightCard
                                title="Total Actions"
                                value={stats?.total || 0}
                                icon={<Activity className="h-4 w-4" />}
                                subtitle="Overall activity"
                                chartData={advancedStats.dailyActivity}
                                chartColor="#ffffff"
                            />
                        </div>

                        {/* Detailed Trends Section */}
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                            <Card className="border-border/10 bg-muted/5 rounded-[2.5rem] p-8">
                                <CardHeader className="p-0 mb-6">
                                    <CardTitle className="text-sm font-bold text-muted-foreground uppercase tracking-wider">Activity Volume</CardTitle>
                                    <CardDescription className="text-xs">Interaction frequency per day (last 14 days)</CardDescription>
                                </CardHeader>
                                <div className="h-40 w-full mt-4">
                                    <MetricBarChart data={advancedStats.dailyActivity} color="#3b82f6" />
                                </div>
                            </Card>

                            <Card className="border-border/10 bg-muted/5 rounded-[2.5rem] p-8">
                                <CardHeader className="p-0 mb-6">
                                    <CardTitle className="text-sm font-bold text-muted-foreground uppercase tracking-wider">Hourly Intensity</CardTitle>
                                    <CardDescription className="text-xs">Peak activity times across 24h cycle</CardDescription>
                                </CardHeader>
                                <div className="h-40 w-full mt-4">
                                    <MetricBarChart data={advancedStats.hourlyActivity} color="#3b82f6" />
                                </div>
                            </Card>
                        </div>

                        {/* Distribution Section */}
                        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                            <Card className="border-border/10 bg-muted/5 rounded-[2.5rem] p-8 lg:col-span-1">
                                <CardHeader className="p-0 mb-8 text-center">
                                    <CardTitle className="text-sm font-bold text-muted-foreground uppercase tracking-wider">Platform Mix</CardTitle>
                                </CardHeader>
                                <div className="h-48 w-full flex items-center justify-center relative">
                                    <div className="w-32 h-32">
                                        <DonutChart
                                            data={advancedStats.platformDist}
                                            colors={["#3b82f6", "#60a5fa", "#ffffff", "#94a3b8"]}
                                        />
                                    </div>
                                    <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                                        <span className="text-2xl font-bold">{advancedStats.platformDist.length}</span>
                                        <span className="text-[10px] text-muted-foreground uppercase font-bold">Platforms</span>
                                    </div>
                                </div>
                                <div className="mt-8 grid grid-cols-2 gap-2 text-[10px] font-bold uppercase text-muted-foreground/60">
                                    {advancedStats.platformDist.map((p, i) => (
                                        <div key={p.label} className="flex items-center gap-2">
                                            <div className="w-2 h-2 rounded-full" style={{ backgroundColor: ["#3b82f6", "#60a5fa", "#ffffff", "#94a3b8"][i % 4] }} />
                                            <span className="truncate">{p.label.replace('.com', '')}</span>
                                        </div>
                                    ))}
                                </div>
                            </Card>

                            <Card className="border-border/10 bg-muted/5 rounded-[2.5rem] p-8 lg:col-span-2">
                                <CardHeader className="p-0 mb-6">
                                    <CardTitle className="text-sm font-bold text-muted-foreground uppercase tracking-wider">Action Breakdown</CardTitle>
                                    <CardDescription className="text-xs">Comparative volume of interaction types</CardDescription>
                                </CardHeader>
                                <div className="space-y-6 mt-8">
                                    {advancedStats.actionDist.map((a, i) => (
                                        <div key={a.label} className="space-y-2">
                                            <div className="flex justify-between text-xs font-medium">
                                                <span className="capitalize">{a.label}s</span>
                                                <span className="text-muted-foreground">{a.value} events</span>
                                            </div>
                                            <div className="h-2 w-full bg-muted/40 rounded-full overflow-hidden">
                                                <div
                                                    className="h-full bg-blue-500/40"
                                                    style={{ width: `${stats?.total ? (a.value / stats.total) * 100 : 0}%` }}
                                                />
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </Card>
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

                            <CardContent className="flex-1 p-0">
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
                                                                            <div className="absolute -bottom-1 -right-1 h-3 w-3 rounded-full border-2 border-background bg-blue-500/40" />
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
                            </CardContent>
                        </Card>
                    </div>
                </ScrollArea>
                <TargetHistorySheet
                    isOpen={!!selectedTarget}
                    onClose={() => setSelectedTarget(null)}
                    target={selectedTarget}
                />
            </div>
        </div>
    );
};
