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

const ActivityLineChart = ({ data, color = "#3b82f6" }: { data: { name: string; value: number }[]; color?: string }) => {
    return (
        <div className="h-full w-full">
            <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={data} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <defs>
                        <linearGradient id="colorValue" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor={color} stopOpacity={0.4} />
                            <stop offset="95%" stopColor={color} stopOpacity={0} />
                        </linearGradient>
                    </defs>
                    <Tooltip content={<ChartTooltip />} cursor={false} />
                    <Area
                        type="monotone"
                        dataKey="value"
                        stroke={color}
                        strokeWidth={3}
                        fillOpacity={1}
                        fill="url(#colorValue)"
                        activeDot={{ r: 4, fill: color, stroke: '#fff', strokeWidth: 2 }}
                        dot={{ r: 3, fill: color, strokeWidth: 0 }}
                    />
                </AreaChart>
            </ResponsiveContainer>
        </div>
    );
};

const Heatmap = ({ data, logs, color = "#3b82f6" }: { data: number[]; logs: EngagementLog[]; color?: string }) => {
    const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

    // Calculate raw counts for tooltip
    const counts = useMemo(() => {
        const grid = Array(168).fill(0);
        logs.forEach(log => {
            const date = new Date(log.created_at);
            const d = date.getDay() === 0 ? 6 : date.getDay() - 1;
            const h = date.getHours();
            grid[d * 24 + h]++;
        });
        return grid;
    }, [logs]);

    return (
        <div className="flex flex-col h-full w-full group/heatmap">
            <div className="flex-1 grid grid-cols-[32px_1fr] gap-3 mb-4">
                {/* Y-Axis: Days */}
                <div className="flex flex-col justify-between text-[10px] text-muted-foreground/40 font-bold py-1">
                    {days.map(d => <span key={d} className="h-4 flex items-center">{d}</span>)}
                </div>

                {/* Grid */}
                <div className="grid grid-cols-24 gap-1">
                    {data.map((intensity, i) => {
                        const dayIdx = Math.floor(i / 24);
                        const hour = i % 24;
                        const count = counts[i];
                        const opacity = Math.max(0.06, intensity);

                        return (
                            <div key={i} className="relative group/cell">
                                <div
                                    className="rounded-[3px] aspect-square transition-all hover:scale-125 hover:z-20 cursor-crosshair border border-white/0 hover:border-primary/50"
                                    style={{
                                        backgroundColor: color,
                                        opacity: opacity,
                                        boxShadow: opacity > 0.6 ? `0 0 12px ${color}` : 'none'
                                    }}
                                />
                                {/* Custom Tooltip for each cell */}
                                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 opacity-0 group-hover/cell:opacity-100 pointer-events-none transition-all z-50">
                                    <div className="bg-background/95 backdrop-blur-md border border-border/50 px-2.5 py-1.5 rounded-lg shadow-2xl whitespace-nowrap">
                                        <p className="text-[10px] font-bold text-foreground/90">
                                            {days[dayIdx]} at {hour === 0 ? '12 AM' : hour === 12 ? '12 PM' : hour > 12 ? `${hour - 12} PM` : `${hour} AM`}
                                        </p>
                                        <p className="text-[9px] text-primary font-bold">{count} <span className="text-muted-foreground/60 font-medium">interactions</span></p>
                                    </div>
                                    <div className="w-2 h-2 bg-background border-r border-b border-border/50 rotate-45 mx-auto -mt-1" />
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* X-Axis: Hours aligned to grid */}
            <div className="grid grid-cols-[32px_1fr] gap-3">
                <div />
                <div className="grid grid-cols-24 gap-1 text-[8px] text-muted-foreground/30 font-bold uppercase tracking-wider">
                    <span className="col-start-1 flex justify-center whitespace-nowrap">12 AM</span>
                    <span className="col-start-13 flex justify-center whitespace-nowrap">12 PM</span>
                    <span className="col-start-24 flex justify-end whitespace-nowrap">11 PM</span>
                </div>
            </div>
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
                        radius={[6, 6, 6, 6]}
                        opacity={0.8}
                        isAnimationActive={true}
                        activeBar={{ opacity: 1, fill: color, filter: 'drop-shadow(0 0 8px rgba(59, 130, 246, 0.5))' }}
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
                        innerRadius={50}
                        outerRadius={65}
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
                                className="outline-none filter drop-shadow-[0_0_8px_rgba(59,130,246,0.1)] transition-all"
                            />
                        ))}
                    </Pie>
                    <Pie
                        data={[{ value: 1 }]}
                        cx="50%"
                        cy="50%"
                        innerRadius={40}
                        outerRadius={42}
                        dataKey="value"
                        stroke="none"
                        fill="rgba(255,255,255,0.05)"
                        isAnimationActive={false}
                    />
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
        <Card className="h-full border-white/5 bg-card/50 backdrop-blur-3xl shadow-xl rounded-[2rem] overflow-hidden cursor-default relative flex flex-col p-8">
            <div className="flex items-center gap-3 mb-8">
                <div className="p-2.5 rounded-2xl bg-white/5 text-foreground/80">
                    {icon}
                </div>
                <h3 className="text-[14px] font-medium text-foreground/60 tracking-tight">{title}</h3>
            </div>
            <div className="flex-1 flex flex-col justify-between">
                <div>
                    <div className="text-4xl font-bold tracking-tight text-foreground mb-4">
                        {typeof value === 'number' ? value.toLocaleString() : value}
                    </div>
                    {subtitle && <p className="text-xs font-medium text-muted-foreground/40">{subtitle}</p>}
                </div>

                <div className="mt-4 flex items-end">
                    {chartData ? (
                        <div className="h-10 w-full">
                            <Sparkline data={chartData} color={chartColor || "#3b82f6"} />
                        </div>
                    ) : footer ? (
                        <div className="w-full">{footer}</div>
                    ) : (
                        trend && (
                            <div className={cn(
                                "text-[12px] font-bold flex items-center gap-1.5 transition-colors",
                                trendUp === undefined ? "text-muted-foreground/60" :
                                    trendUp ? "text-emerald-400" : "text-rose-400"
                            )}>
                                {trendUp !== undefined && (trendUp ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />)}
                                {trend}
                                <span className="text-white/20 font-medium lowercase ml-0.5">from last week</span>
                            </div>
                        )
                    )}
                </div>
            </div>
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

    const [isFilterDrawerOpen, setIsFilterDrawerOpen] = useState(false);



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
        if (filteredLogs.length === 0) return {
            uniqueTargets: 0,
            engagementScore: 0,
            growthTrend: 0,
            replyTrend: 0,
            scoreTrend: 0,
            avgPerDay: 0,
            dailyActivity: [],
            dailyScore: [],
            dailyUnique: [],
            platformDist: [],
            actionDist: [],
            heatmapData: Array(168).fill(0)
        };

        const uniqueTargets = new Set(filteredLogs.map(l => l.target_username)).size;

        const calcWeightedScore = (logList: EngagementLog[]) => logList.reduce((acc, log) => {
            if (log.action_type === 'reply') return acc + 3;
            if (log.action_type === 'follow') return acc + 2;
            if (log.action_type === 'like') return acc + 1;
            return acc + 1;
        }, 0);

        const engagementScore = calcWeightedScore(filteredLogs);

        // Growth Trends: Compare current filtered period vs previous period of same length
        const now = new Date();
        const last7DaysLogs = filteredLogs.filter(l => isWithinInterval(new Date(l.created_at), { start: subDays(now, 7), end: now }));
        const prev7DaysLogs = filteredLogs.filter(l => isWithinInterval(new Date(l.created_at), { start: subDays(now, 14), end: subDays(now, 7) }));

        const growthTrend = prev7DaysLogs.length === 0 ? 100 : Math.round(((last7DaysLogs.length - prev7DaysLogs.length) / prev7DaysLogs.length) * 100);

        const last7Score = calcWeightedScore(last7DaysLogs);
        const prev7Score = calcWeightedScore(prev7DaysLogs);
        const scoreTrend = prev7Score === 0 ? 100 : Math.round(((last7Score - prev7Score) / prev7Score) * 100);

        const last7Replies = last7DaysLogs.filter(l => l.action_type === 'reply').length;
        const prev7Replies = prev7DaysLogs.filter(l => l.action_type === 'reply').length;
        const replyTrend = prev7Replies === 0 ? 100 : Math.round(((last7Replies - prev7Replies) / prev7Replies) * 100);

        // Stats calculation
        const firstLogDate = new Date(filteredLogs[filteredLogs.length - 1].created_at);
        const daysDiff = Math.max(1, Math.round((now.getTime() - firstLogDate.getTime()) / (1000 * 60 * 60 * 24)));
        const avgPerDay = Math.round((filteredLogs.length / daysDiff) * 10) / 10;

        // Activity Chart Data (Last 14 days)
        const dailyActivity = Array.from({ length: 14 }).map((_, i) => {
            const d = subDays(now, 13 - i);
            const count = filteredLogs.filter(l => isWithinInterval(new Date(l.created_at), {
                start: startOfDay(d),
                end: endOfDay(d)
            })).length;
            return { name: d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }), value: count };
        });

        // Platform Distribution
        const platformCounts: Record<string, number> = {};
        filteredLogs.forEach(l => { platformCounts[l.platform] = (platformCounts[l.platform] || 0) + 1; });
        const platformDist = Object.entries(platformCounts).map(([label, value]) => ({ label, value }));

        // Action Distribution
        const actionCounts: Record<string, number> = {};
        filteredLogs.forEach(l => { actionCounts[l.action_type] = (actionCounts[l.action_type] || 0) + 1; });
        const actionDist = Object.entries(actionCounts).map(([label, value]) => ({
            label: label.charAt(0).toUpperCase() + label.slice(1) + 's',
            value: Math.round((value / filteredLogs.length) * 100),
            color: label === 'like' ? 'bg-cyan-400' : label === 'reply' ? 'bg-cyan-600/60' : label === 'follow' ? 'bg-blue-600/40' : 'bg-blue-900/40'
        }));

        // Heatmap Matrix (7 days x 24 hours)
        const heatmapGrid = Array.from({ length: 7 * 24 }).fill(0) as number[];
        filteredLogs.forEach(log => {
            const date = new Date(log.created_at);
            const day = date.getDay() === 0 ? 6 : date.getDay() - 1; // 0=Mon, 6=Sun
            const hour = date.getHours();
            heatmapGrid[day * 24 + hour]++;
        });
        const maxHeat = Math.max(...heatmapGrid, 1);
        const heatmapData = heatmapGrid.map(v => v / maxHeat);

        return {
            uniqueTargets,
            engagementScore,
            growthTrend,
            scoreTrend,
            replyTrend,
            avgPerDay,
            dailyActivity,
            platformDist,
            actionDist,
            heatmapData
        };
    }, [filteredLogs]);

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
                <ScrollArea className="flex-1">
                    <div className="p-6 pt-6 pb-12 space-y-8">
                        <div className="flex items-center justify-end gap-3 mb-2">
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

                            <Button
                                variant="outline"
                                size="sm"
                                className="h-9 px-4 rounded-xl border-white/5 bg-card/50 hover:bg-white/5 flex items-center gap-2"
                                onClick={handleExport}
                                disabled={isExporting}
                            >
                                <Download className="h-3.5 w-3.5" />
                                <span className="text-xs font-semibold">Export CSV</span>
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
                        </div>
                        {/* Summary Stats Grid */}
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                            <InsightCard
                                title="Engagement Score"
                                value={advancedStats.engagementScore}
                                icon={<Zap className="h-4 w-4" />}
                                trend={`${advancedStats.scoreTrend > 0 ? '+' : ''}${advancedStats.scoreTrend}%`}
                                trendUp={advancedStats.scoreTrend >= 0}
                            />
                            <InsightCard
                                title="Unique Outreach"
                                value={advancedStats.uniqueTargets}
                                icon={<Users className="h-4 w-4" />}
                                trend={`${advancedStats.growthTrend > 0 ? '+' : ''}${advancedStats.growthTrend}%`}
                                trendUp={advancedStats.growthTrend >= 0}
                            />
                            <InsightCard
                                title="Active Response"
                                value={stats?.byType['reply'] || 0}
                                icon={<MessageSquare className="h-4 w-4" />}
                                trend={`${advancedStats.replyTrend > 0 ? '+' : ''}${advancedStats.replyTrend}%`}
                                trendUp={advancedStats.replyTrend >= 0}
                            />
                            <InsightCard
                                title="Total Actions"
                                value={stats?.total || 0}
                                icon={<Activity className="h-4 w-4" />}
                                trend={`${advancedStats.growthTrend > 0 ? '+' : ''}${advancedStats.growthTrend}% growth`}
                                trendUp={advancedStats.growthTrend >= 0}
                            />
                        </div>

                        {/* Detailed Trends Section */}
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                            <Card className="border-white/5 bg-card/50 rounded-[2rem] p-8 relative overflow-hidden shadow-xl">
                                <CardHeader className="p-0 mb-8 flex flex-row items-center justify-between">
                                    <CardTitle className="text-[13px] font-semibold text-foreground/70 tracking-tight flex items-center gap-2">
                                        Activity Volume
                                    </CardTitle>
                                    <span className="text-[10px] text-muted-foreground/40 font-bold uppercase tracking-widest">Last 14 Days</span>
                                </CardHeader>
                                <div className="h-48 w-full relative">
                                    <div className="absolute top-0 right-1/4 translate-x-1/2 -translate-y-4 text-center z-10">
                                        <div className="text-xl font-bold">{advancedStats.dailyActivity[advancedStats.dailyActivity.length - 1]?.value || 0}</div>
                                        <div className="text-[9px] text-muted-foreground/60 uppercase font-bold">Today</div>
                                    </div>
                                    <ActivityLineChart data={advancedStats.dailyActivity} color="#3b82f6" />
                                </div>
                            </Card>

                            <Card className="border-white/5 bg-card/50 rounded-[2rem] p-8 shadow-xl">
                                <CardHeader className="p-0 mb-8 flex flex-row items-center justify-between">
                                    <CardTitle className="text-[13px] font-semibold text-foreground/70 tracking-tight">
                                        Hourly Intensity
                                    </CardTitle>
                                    <div className="flex items-center gap-2 text-[9px] text-muted-foreground/40 font-bold uppercase">
                                        <span className="opacity-60">Low</span>
                                        <div className="flex gap-1">
                                            {[0.1, 0.3, 0.6, 1].map(o => (
                                                <div key={o} className="w-4 h-1 rounded-full" style={{ backgroundColor: `rgba(59, 130, 246, ${o})` }} />
                                            ))}
                                        </div>
                                        <span className="opacity-60">High</span>
                                    </div>
                                </CardHeader>
                                <div className="h-48 w-full">
                                    <Heatmap data={advancedStats.heatmapData as number[]} logs={filteredLogs} color="#3b82f6" />
                                </div>
                            </Card>
                        </div>

                        {/* Distribution Section */}
                        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                            <Card className="flex flex-col border-white/5 bg-card/50 rounded-[2rem] p-8 shadow-xl">
                                <CardHeader className="p-0 mb-8">
                                    <CardTitle className="text-[13px] font-semibold text-foreground/70 tracking-tight">Platform Mix</CardTitle>
                                </CardHeader>
                                <div className="h-48 w-full flex items-center justify-center relative">
                                    <div className="w-48 h-48">
                                        <DonutChart
                                            data={advancedStats.platformDist.length > 0 ? advancedStats.platformDist : [{ label: 'No Data', value: 1 }]}
                                            colors={advancedStats.platformDist.length > 0 ? ["#22d3ee", "#3b82f6", "#0f172a", "#94a3b8"] : ["#1e293b"]}
                                        />
                                    </div>
                                    <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none pt-2">
                                        <div className="p-1.5 rounded-lg bg-white/5 text-foreground/60 mb-1">
                                            <LayoutGrid className="h-4 w-4" />
                                        </div>
                                        <span className="text-[9px] text-muted-foreground/60 uppercase font-bold tracking-tight">Active Platforms</span>
                                        <span className="text-lg font-bold">{advancedStats.platformDist.length}</span>
                                    </div>
                                </div>
                                <div className="mt-8 flex flex-wrap justify-center gap-4 px-2 text-[10px] font-bold uppercase text-muted-foreground/60">
                                    {advancedStats.platformDist.map((p, i) => (
                                        <div key={p.label} className="flex items-center gap-2">
                                            <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: ["#22d3ee", "#3b82f6", "#0f172a", "#94a3b8"][i % 4] }} />
                                            <span className="capitalize">{p.label.replace('.com', '')}</span>
                                        </div>
                                    ))}
                                </div>
                            </Card>

                            <Card className="flex flex-col border-white/5 bg-card/50 rounded-[2rem] p-8 shadow-xl">
                                <CardHeader className="p-0 mb-10">
                                    <CardTitle className="text-[13px] font-semibold text-foreground/70 tracking-tight">Action Breakdown</CardTitle>
                                </CardHeader>
                                <div className="flex-1 flex flex-col justify-center space-y-8">
                                    {advancedStats.actionDist.length > 0 ? advancedStats.actionDist.map((a) => (
                                        <div key={a.label} className="space-y-3">
                                            <div className="flex justify-between text-[11px] font-semibold">
                                                <span className="text-foreground/70">{a.label}</span>
                                                <span className="text-foreground/90 font-bold">{a.value}%</span>
                                            </div>
                                            <div className="h-6 w-full bg-muted/20 rounded-lg overflow-hidden relative">
                                                <motion.div
                                                    initial={{ width: 0 }}
                                                    animate={{ width: `${a.value}%` }}
                                                    transition={{ duration: 1, ease: 'easeOut' }}
                                                    className={cn("h-full rounded-lg", a.color)}
                                                />
                                            </div>
                                        </div>
                                    )) : (
                                        <div className="flex-1 flex items-center justify-center text-xs text-muted-foreground/30 italic">
                                            No actions recorded yet
                                        </div>
                                    )}
                                </div>
                            </Card>

                            <Card className="flex flex-col border-white/5 bg-card/50 rounded-[2rem] overflow-hidden shadow-xl">
                                <CardHeader className="px-8 pt-8 pb-4">
                                    <div className="flex items-center justify-between">
                                        <CardTitle className="text-[13px] font-semibold text-foreground/70 tracking-tight">Activity Feed</CardTitle>
                                        <LayoutList className="h-4 w-4 text-muted-foreground/40" />
                                    </div>
                                </CardHeader>

                                <CardContent className="flex-1 p-0 overflow-y-auto">
                                    <div className="px-6 py-2">
                                        <div className="space-y-2">
                                            {filteredLogs.length > 0 ? filteredLogs.slice(0, 6).map((log, i) => (
                                                <motion.div
                                                    initial={{ opacity: 0, x: 20 }}
                                                    animate={{ opacity: 1, x: 0 }}
                                                    transition={{ delay: i * 0.1 }}
                                                    key={i}
                                                    className="flex items-center gap-4 p-3 rounded-2xl transition-all cursor-pointer hover:bg-white/5"
                                                    onClick={() => log.target_username && setSelectedTarget({
                                                        username: log.target_username,
                                                        name: log.target_name,
                                                        avatar_url: log.target_avatar_url,
                                                        platform: 'x.com'
                                                    })}
                                                >
                                                    <div className="relative">
                                                        <div className="h-10 w-10 rounded-full bg-gradient-to-br from-muted-foreground/20 to-muted/20 border border-border/10 flex items-center justify-center overflow-hidden">
                                                            {log.target_avatar_url ? (
                                                                <img src={log.target_avatar_url} className="h-full w-full object-cover" />
                                                            ) : (
                                                                <Users className="h-5 w-5 text-muted-foreground/40" />
                                                            )}
                                                        </div>
                                                        <div className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-background bg-emerald-400" />
                                                    </div>
                                                    <div className="flex-1 min-w-0">
                                                        <div className="flex items-center justify-between mb-0.5">
                                                            <span className="text-[13px] font-bold text-foreground/90 truncate">{log.target_name || log.target_username}</span>
                                                            <span className="text-[10px] text-muted-foreground/40 font-medium whitespace-nowrap ml-2">
                                                                {formatDistanceToNow(new Date(log.created_at), { addSuffix: false }).replace('about ', '')} ago
                                                            </span>
                                                        </div>
                                                        <p className="text-[11px] text-muted-foreground/60 font-medium truncate capitalize">
                                                            {typeof log.action_type === 'string' ? log.action_type : 'Interaction'}
                                                        </p>
                                                    </div>
                                                </motion.div>
                                            )) : (
                                                <div className="h-32 flex flex-col items-center justify-center text-center p-4">
                                                    <Activity className="h-8 w-8 text-muted-foreground/10 mb-2" />
                                                    <p className="text-xs text-muted-foreground/40 font-medium">No recent activity detected</p>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </CardContent>
                            </Card>
                        </div>
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
