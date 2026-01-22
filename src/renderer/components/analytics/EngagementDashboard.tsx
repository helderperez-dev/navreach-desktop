import { useState, useEffect, useMemo, useRef } from 'react';
import { CircularLoader } from '@/components/ui/CircularLoader';
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
import { formatDistanceToNow, isWithinInterval, subDays, startOfDay, endOfDay, subHours, subMinutes, addMinutes, isSameDay, setHours, startOfHour, endOfHour, startOfWeek, addDays } from 'date-fns';
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
        const data = payload[0].payload;
        const total = payload[0].value;
        const counts = data.counts as Record<string, number>;

        return (
            <div className="bg-background/95 backdrop-blur-md border border-border/50 p-3 rounded-2xl shadow-2xl transition-all duration-300 min-w-[140px]">
                <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-2 border-b border-white/5 pb-2">{label}</p>
                <div className="space-y-2">
                    <p className="text-sm font-bold text-primary flex items-center justify-between">
                        <span>{total.toLocaleString()}</span>
                        <span className="text-[10px] text-muted-foreground font-normal lowercase ml-2">Total Events</span>
                    </p>
                    {counts && (
                        <div className="space-y-1.5 pt-1">
                            {Object.entries(counts).map(([type, count]) => {
                                if (count === 0) return null;
                                return (
                                    <div key={type} className="flex items-center justify-between text-[11px]">
                                        <span className="text-muted-foreground/60 capitalize">{type}s</span>
                                        <span className="font-bold text-foreground/80">{count.toLocaleString()}</span>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
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
        <div
            className="h-full w-full select-none outline-none focus:outline-none"
            tabIndex={-1}
            onMouseDown={(e) => e.preventDefault()}
            style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
        >
            <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={data} margin={{ top: 10, right: 10, left: -10, bottom: 20 }}>
                    <defs>
                        <linearGradient id="colorValue" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor={color} stopOpacity={0.4} />
                            <stop offset="95%" stopColor={color} stopOpacity={0} />
                        </linearGradient>
                    </defs>
                    <XAxis
                        dataKey="name"
                        axisLine={false}
                        tickLine={false}
                        tick={{ fill: 'rgba(255,255,255,0.2)', fontSize: 9, fontWeight: 500 }}
                        dy={10}
                    />
                    <YAxis
                        axisLine={false}
                        tickLine={false}
                        tick={{ fill: 'rgba(255,255,255,0.1)', fontSize: 8 }}
                        width={25}
                    />
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

const Heatmap = ({ data, logs, dateFilter, color = "#3b82f6" }: { data: number[]; logs: EngagementLog[]; dateFilter: string; color?: string }) => {
    const now = new Date();
    const isAggregate = dateFilter === '30d' || dateFilter === 'all';

    // Generate the 7 days to display
    const daysToDisplay = useMemo(() => {
        if (isAggregate) {
            const monday = startOfWeek(now, { weekStartsOn: 1 });
            return Array.from({ length: 7 }).map((_, i) => addDays(monday, i));
        } else {
            return Array.from({ length: 7 }).map((_, i) => subDays(now, 6 - i));
        }
    }, [now.toLocaleDateString(), isAggregate]);

    type HourData = {
        hour: number;
        count: number;
        intensity: number;
        counts: { like: number, reply: number, follow: number, post: number, dm: number }
    };
    type RowData = { label: string; date: number | null; isToday: boolean; hours: HourData[]; };

    const rowData = useMemo((): RowData[] => {
        return daysToDisplay.map((dayDate, dayIdx) => {
            const isToday = isSameDay(dayDate, now);

            const hours: HourData[] = Array.from({ length: 24 }).map((_, hour) => {
                const intensityIndex = dayIdx * 24 + hour;
                const intensity = data[intensityIndex] || 0;

                let periodLogs = [];
                if (isAggregate) {
                    const targetDay = dayDate.getDay();
                    periodLogs = logs.filter(l => {
                        const d = new Date(l.created_at);
                        return d.getDay() === targetDay && d.getHours() === hour;
                    });
                } else {
                    periodLogs = logs.filter(l => {
                        const d = new Date(l.created_at);
                        return isSameDay(d, dayDate) && d.getHours() === hour;
                    });
                }

                const counts = {
                    like: periodLogs.filter(l => l.action_type === 'like').length,
                    reply: periodLogs.filter(l => l.action_type === 'reply').length,
                    follow: periodLogs.filter(l => l.action_type === 'follow').length,
                    post: periodLogs.filter(l => l.action_type === 'post').length,
                    dm: periodLogs.filter(l => l.action_type === 'dm').length
                };

                return { hour, count: periodLogs.length, intensity, counts };
            });

            return {
                label: dayDate.toLocaleDateString(undefined, { weekday: 'short' }),
                date: isAggregate ? null : dayDate.getDate(),
                isToday,
                hours
            };
        });
    }, [daysToDisplay, logs, data, isAggregate]);

    return (
        <div className="flex flex-col h-full w-full group/heatmap">
            <div className="flex-1 space-y-1 mb-4">
                {rowData.map((row, dayIdx) => (
                    <div key={dayIdx} className={cn(
                        "grid grid-cols-[38px_1fr] gap-3 items-center p-0.5 rounded-lg transition-colors border border-transparent",
                        !isAggregate && row.isToday ? "bg-primary/5 border-primary/10" : ""
                    )}>
                        <div className="flex flex-col items-start justify-center leading-none pl-1">
                            <span className={cn(
                                "text-[9px] font-bold uppercase tracking-tighter",
                                !isAggregate && row.isToday ? "text-primary" : "text-muted-foreground/50"
                            )}>{row.label}</span>
                            {!isAggregate && row.date && (
                                <span className={cn(
                                    "text-[8px] font-medium",
                                    row.isToday ? "text-primary/60" : "text-muted-foreground/20"
                                )}>{row.date}</span>
                            )}
                        </div>
                        <div className="grid grid-cols-24 gap-1">
                            {row.hours.map((h) => {
                                const opacity = Math.max(0.06, h.intensity);
                                return (
                                    <div key={h.hour} className="relative group/cell">
                                        <div
                                            className="rounded-[2px] aspect-square transition-all hover:scale-125 hover:z-20 cursor-crosshair border border-white/0 hover:border-primary/50"
                                            style={{
                                                backgroundColor: color,
                                                opacity: opacity,
                                                boxShadow: opacity > 0.6 ? `0 0 12px ${color}` : 'none'
                                            }}
                                        />
                                        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 opacity-0 group-hover/cell:opacity-100 pointer-events-none transition-all z-50">
                                            <div className="bg-background/95 backdrop-blur-md border border-border/50 p-3 rounded-2xl shadow-2xl whitespace-nowrap min-w-[140px]">
                                                <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-2 border-b border-white/5 pb-2 text-center">
                                                    {isAggregate ? `Every ${row.label}` : `${row.label} ${row.date}`} at {h.hour === 0 ? '12 AM' : h.hour === 12 ? '12 PM' : h.hour > 12 ? `${h.hour - 12} PM` : `${h.hour} AM`}
                                                </p>
                                                <div className="space-y-2">
                                                    <p className="text-sm font-bold text-primary flex items-center justify-between">
                                                        <span>{h.count.toLocaleString()}</span>
                                                        <span className="text-[10px] text-muted-foreground font-normal lowercase ml-2">Total</span>
                                                    </p>
                                                    {h.counts && (
                                                        <div className="space-y-1 pt-1 opacity-90">
                                                            {Object.entries(h.counts).map(([type, count]) => {
                                                                if (count === 0) return null;
                                                                return (
                                                                    <div key={type} className="flex items-center justify-between text-[11px]">
                                                                        <span className="text-muted-foreground/60 capitalize">{type}s</span>
                                                                        <span className="font-bold text-foreground/80">{count.toLocaleString()}</span>
                                                                    </div>
                                                                );
                                                            })}
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                            <div className="w-2 h-2 bg-background border-r border-b border-border/50 rotate-45 mx-auto -mt-1" />
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                ))}
            </div>

            <div className="grid grid-cols-[38px_1fr] gap-3">
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
                        tick={{ fill: 'rgba(255,255,255,0.35)', fontSize: 9, fontWeight: 600 }}
                        interval={data.length > 20 ? 4 : 0}
                        dy={6}
                    />
                    <YAxis
                        axisLine={false}
                        tickLine={false}
                        tick={{ fill: 'rgba(255,255,255,0.15)', fontSize: 8 }}
                        width={25}
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
                                    <div className="bg-background/95 backdrop-blur-md border border-border/50 p-2.5 rounded-2xl shadow-2xl">
                                        <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-1">{payload[0].name}</p>
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
                        paddingAngle={3}
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
                                className="outline-none transition-all duration-300 hover:opacity-80 cursor-pointer"
                            />
                        ))}
                    </Pie>
                    <Pie
                        data={[{ value: 1 }]}
                        cx="50%"
                        cy="50%"
                        innerRadius={46}
                        outerRadius={48}
                        dataKey="value"
                        stroke="none"
                        fill="rgba(255,255,255,0.02)"
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
    className?: string;
    footer?: React.ReactNode;
    trendLabel?: string;
    breakdown?: Record<string, number>;
}

const InsightCard = ({ title, value, subtitle, icon, trend, trendUp, chartData, chartColor, className, footer, trendLabel, breakdown }: InsightCardProps) => (
    <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.4 }}
        className={cn("h-full group/card relative", className)}
    >
        <Card className="h-full border-white/5 bg-card/50 backdrop-blur-3xl shadow-xl rounded-[2rem] overflow-hidden cursor-default relative flex flex-col p-8 transition-colors group-hover/card:bg-card/70 group-hover/card:border-white/10">
            {breakdown && Object.keys(breakdown).length > 0 && (
                <div className="absolute top-4 right-8 opacity-0 group-hover/card:opacity-100 transition-all duration-300 translate-y-2 group-hover/card:translate-y-0 z-50">
                    <div className="bg-background/95 backdrop-blur-xl border border-border/50 p-3 rounded-2xl shadow-2xl min-w-[140px]">
                        <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-2 border-b border-white/5 pb-2 text-center">Breakdown</p>
                        <div className="space-y-1.5">
                            {Object.entries(breakdown).map(([type, count]) => {
                                if (count === 0) return null;
                                return (
                                    <div key={type} className="flex items-center justify-between text-[11px]">
                                        <span className="text-muted-foreground/60 capitalize">{type.replace(/_/g, ' ')}</span>
                                        <span className="font-bold text-foreground/80">{count.toLocaleString()}</span>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </div>
            )}
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
                        <div className="h-10 w-full font-bold">
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
                                {trendLabel && (
                                    <span className="text-muted-foreground/40 font-medium ml-1">
                                        {trendLabel}
                                    </span>
                                )}
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
                window.api.engagement.getLogs(accessToken, { limit: 20000 }),
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
    // Base Filtered Logs (for trends context)
    const baseFilteredLogs = useMemo(() => {
        return logs.filter(log => {
            if (platformFilter !== 'all' && log.platform !== platformFilter) return false;
            if (actionFilter !== 'all' && log.action_type !== actionFilter) return false;
            return true;
        });
    }, [logs, platformFilter, actionFilter]);

    // Current Filtered Logs (for lists and summary stats)
    const filteredLogs = useMemo(() => {
        return baseFilteredLogs.filter(log => {
            if (dateFilter !== 'all') {
                const logDate = new Date(log.created_at);
                const now = new Date();
                let start;
                if (dateFilter === 'today') start = startOfDay(now);
                else if (dateFilter === '7d') start = subDays(now, 7);
                else if (dateFilter === '30d') start = subDays(now, 30);

                if (start && !isWithinInterval(logDate, { start, end: now })) return false;
            }
            return true;
        });
    }, [baseFilteredLogs, dateFilter]);

    // Advanced Stats Calculation
    const advancedStats = useMemo(() => {
        if (filteredLogs.length === 0) return {
            uniqueTargets: 0,
            engagementScore: 0,
            totalActions: 0,
            activeResponses: 0,
            growthTrend: 0,
            replyTrend: 0,
            scoreTrend: 0,
            avgPerDay: 0,
            dailyActivity: [],
            dailyScore: [],
            dailyUnique: [],
            platformDist: [],
            actionDist: [],
            heatmapData: Array(168).fill(0),
            breakdowns: {
                score: {},
                unique: {},
                replies: {},
                total: {}
            }
        };

        const calcWeightedScore = (logList: EngagementLog[]) => logList.reduce((acc, log) => {
            if (log.action_type === 'reply') return acc + 3;
            if (log.action_type === 'follow') return acc + 2;
            if (log.action_type === 'like') return acc + 1;
            return acc + 1;
        }, 0);

        const now = new Date();

        // Summary metrics from CURRENT filtered set
        const uniqueTargets = new Set(filteredLogs.map(l => l.target_username)).size;
        const engagementScore = calcWeightedScore(filteredLogs);
        const totalActions = filteredLogs.length;
        const activeResponses = filteredLogs.filter(l => l.action_type === 'reply').length;

        // Breakdowns for Tooltips
        const breakdowns = {
            score: {
                replies: filteredLogs.filter(l => l.action_type === 'reply').length * 3,
                follows: filteredLogs.filter(l => l.action_type === 'follow').length * 2,
                likes: filteredLogs.filter(l => l.action_type === 'like').length * 1,
            },
            unique: {
                "x.com": new Set(filteredLogs.filter(l => l.platform === 'x.com').map(l => l.target_username)).size,
                "others": new Set(filteredLogs.filter(l => l.platform !== 'x.com').map(l => l.target_username)).size,
            },
            replies: {
                "X.com Replies": filteredLogs.filter(l => l.action_type === 'reply' && l.platform === 'x.com').length,
                "Other Replies": filteredLogs.filter(l => l.action_type === 'reply' && l.platform !== 'x.com').length,
            },
            total: {
                likes: filteredLogs.filter(l => l.action_type === 'like').length,
                replies: filteredLogs.filter(l => l.action_type === 'reply').length,
                follows: filteredLogs.filter(l => l.action_type === 'follow').length,
                posts: filteredLogs.filter(l => l.action_type === 'post').length,
                dms: filteredLogs.filter(l => l.action_type === 'dm').length,
            }
        };

        // Dynamic Growth Trends based on date filter
        let currentPeriodLogs: EngagementLog[] = [];
        let previousPeriodLogs: EngagementLog[] = [];

        if (dateFilter === 'today') {
            currentPeriodLogs = baseFilteredLogs.filter(l => isWithinInterval(new Date(l.created_at), { start: startOfDay(now), end: now }));
            previousPeriodLogs = baseFilteredLogs.filter(l => isWithinInterval(new Date(l.created_at), { start: startOfDay(subDays(now, 1)), end: endOfDay(subDays(now, 1)) }));
        } else if (dateFilter === '7d') {
            currentPeriodLogs = baseFilteredLogs.filter(l => isWithinInterval(new Date(l.created_at), { start: subDays(now, 7), end: now }));
            previousPeriodLogs = baseFilteredLogs.filter(l => isWithinInterval(new Date(l.created_at), { start: subDays(now, 14), end: subDays(now, 7) }));
        } else {
            // Default to 30d context for trends
            currentPeriodLogs = baseFilteredLogs.filter(l => isWithinInterval(new Date(l.created_at), { start: subDays(now, 30), end: now }));
            previousPeriodLogs = baseFilteredLogs.filter(l => isWithinInterval(new Date(l.created_at), { start: subDays(now, 60), end: subDays(now, 30) }));
        }

        const growthTrend = previousPeriodLogs.length === 0 ? 100 : Math.round(((currentPeriodLogs.length - previousPeriodLogs.length) / previousPeriodLogs.length) * 100);
        const currentScore = calcWeightedScore(currentPeriodLogs);
        const prevScore = calcWeightedScore(previousPeriodLogs);
        const scoreTrend = prevScore === 0 ? 100 : Math.round(((currentScore - prevScore) / prevScore) * 100);

        const currentReplies = currentPeriodLogs.filter(l => l.action_type === 'reply').length;
        const prevReplies = previousPeriodLogs.filter(l => l.action_type === 'reply').length;
        const replyTrend = prevReplies === 0 ? 100 : Math.round(((currentReplies - prevReplies) / prevReplies) * 100);

        // Global stats (always for current context)
        const firstLogDate = new Date(baseFilteredLogs[baseFilteredLogs.length - 1].created_at);
        const daysDiff = Math.max(1, Math.round((now.getTime() - firstLogDate.getTime()) / (1000 * 60 * 60 * 24)));
        const avgPerDay = Math.round((baseFilteredLogs.length / daysDiff) * 10) / 10;

        // Activity Chart Data - DYNAMIC based on dateFilter
        let dailyActivity;
        if (dateFilter === 'today') {
            dailyActivity = Array.from({ length: 24 }).map((_, i) => {
                const hourDate = setHours(startOfDay(now), i);
                const periodLogs = filteredLogs.filter(l => {
                    const logDate = new Date(l.created_at);
                    return isWithinInterval(logDate, { start: startOfHour(hourDate), end: endOfHour(hourDate) });
                });

                const counts = {
                    like: periodLogs.filter(l => l.action_type === 'like').length,
                    reply: periodLogs.filter(l => l.action_type === 'reply').length,
                    follow: periodLogs.filter(l => l.action_type === 'follow').length,
                    post: periodLogs.filter(l => l.action_type === 'post').length,
                    dm: periodLogs.filter(l => l.action_type === 'dm').length
                };

                return { name: `${i}:00`, value: periodLogs.length, counts };
            });
        } else {
            const daysToShow = dateFilter === '7d' ? 7 : 30;
            dailyActivity = Array.from({ length: daysToShow }).map((_, i) => {
                const dayDate = subDays(now, (daysToShow - 1) - i);
                const periodLogs = filteredLogs.filter(l => isSameDay(new Date(l.created_at), dayDate));

                const counts = {
                    like: periodLogs.filter(l => l.action_type === 'like').length,
                    reply: periodLogs.filter(l => l.action_type === 'reply').length,
                    follow: periodLogs.filter(l => l.action_type === 'follow').length,
                    post: periodLogs.filter(l => l.action_type === 'post').length,
                    dm: periodLogs.filter(l => l.action_type === 'dm').length
                };

                return {
                    name: dayDate.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
                    value: periodLogs.length,
                    counts
                };
            });
        }

        // Platform Distribution (current filtered context)
        const platformCounts: Record<string, number> = {};
        filteredLogs.forEach(l => { platformCounts[l.platform] = (platformCounts[l.platform] || 0) + 1; });
        const platformDist = Object.entries(platformCounts).map(([label, value]) => ({ label, value }));

        // Action Distribution (current filtered context)
        const actionCounts: Record<string, number> = {};
        filteredLogs.forEach(l => { actionCounts[l.action_type] = (actionCounts[l.action_type] || 0) + 1; });
        const actionDist = Object.entries(actionCounts).map(([type, count]) => ({
            type,
            label: type === 'reply' ? 'Replies' : type.charAt(0).toUpperCase() + type.slice(1) + 's',
            percentage: filteredLogs.length === 0 ? 0 : Math.round((count / filteredLogs.length) * 100),
            count,
            bgClass: type === 'like' ? 'bg-cyan-400 shadow-[0_0_12px_rgba(34,211,238,0.2)]' :
                type === 'reply' ? 'bg-sky-500 shadow-[0_0_12px_rgba(56,189,248,0.2)]' :
                    type === 'follow' ? 'bg-indigo-500 shadow-[0_0_12px_rgba(99,102,241,0.2)]' :
                        type === 'dm' ? 'bg-blue-600 shadow-[0_0_12px_rgba(37,99,235,0.2)]' :
                            'bg-slate-500 shadow-[0_0_12px_rgba(100,116,139,0.2)]'
        })).sort((a, b) => b.count - a.count);

        // Heatmap Matrix (Context-Aware: Rolling Window or Aggregate Pattern)
        const isAggregate = dateFilter === '30d' || dateFilter === 'all';
        const heatmapGrid = Array.from({ length: 7 * 24 }).fill(0) as number[];

        filteredLogs.forEach(log => {
            const logDate = new Date(log.created_at);
            const hour = logDate.getHours();

            if (isAggregate) {
                // Map to Day of Week (0-6, Mon-Sun)
                const dayIndex = (logDate.getDay() + 6) % 7;
                heatmapGrid[dayIndex * 24 + hour]++;
            } else {
                // Map to Rolling 7 Days (0=6 days ago, 6=Today)
                for (let i = 0; i < 7; i++) {
                    const targetDate = subDays(now, 6 - i);
                    if (isSameDay(logDate, targetDate)) {
                        heatmapGrid[i * 24 + hour]++;
                        break;
                    }
                }
            }
        });
        const maxHeat = Math.max(...heatmapGrid, 1);
        const heatmapData = heatmapGrid.map(v => v / maxHeat);

        return {
            uniqueTargets,
            engagementScore,
            totalActions,
            activeResponses,
            growthTrend,
            scoreTrend,
            replyTrend,
            avgPerDay,
            dailyActivity,
            platformDist,
            actionDist,
            heatmapData,
            breakdowns
        };
    }, [baseFilteredLogs, filteredLogs, dateFilter]);

    const getActionIcon = (type: string) => {
        switch (type) {
            case 'like': return <Heart className="h-4 w-4 text-cyan-400/60" />;
            case 'reply': return <MessageSquare className="h-4 w-4 text-sky-400/60" />;
            case 'follow': return <UserPlus className="h-4 w-4 text-indigo-400/60" />;
            case 'dm': return <Send className="h-4 w-4 text-blue-400/60" />;
            case 'post': return <BarChart2 className="h-4 w-4 text-slate-400/60" />;
            default: return <RefreshCw className="h-4 w-4 text-muted-foreground/40" />;
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
                    {isLoading ? (
                        <div className="flex h-full items-center justify-center min-h-[600px]">
                            <CircularLoader className="w-8 h-8 text-primary/50" />
                        </div>
                    ) : (
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
                                                        setPlatformFilter('all');
                                                        setActionFilter('all');
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
                                    trendLabel={dateFilter === 'today' ? 'vs yesterday' : dateFilter === '7d' ? 'vs last week' : dateFilter === '30d' ? 'vs last month' : 'prev. period'}
                                    breakdown={advancedStats.breakdowns.score}
                                />
                                <InsightCard
                                    title="Unique Outreach"
                                    value={advancedStats.uniqueTargets}
                                    icon={<Users className="h-4 w-4" />}
                                    trend={`${advancedStats.growthTrend > 0 ? '+' : ''}${advancedStats.growthTrend}%`}
                                    trendUp={advancedStats.growthTrend >= 0}
                                    trendLabel={dateFilter === 'today' ? 'vs yesterday' : dateFilter === '7d' ? 'vs last week' : dateFilter === '30d' ? 'vs last month' : 'prev. period'}
                                    breakdown={advancedStats.breakdowns.unique}
                                />
                                <InsightCard
                                    title="Active Response"
                                    value={advancedStats.activeResponses}
                                    icon={<MessageSquare className="h-4 w-4" />}
                                    trend={`${advancedStats.replyTrend > 0 ? '+' : ''}${advancedStats.replyTrend}%`}
                                    trendUp={advancedStats.replyTrend >= 0}
                                    trendLabel={dateFilter === 'today' ? 'vs yesterday' : dateFilter === '7d' ? 'vs last week' : dateFilter === '30d' ? 'vs last month' : 'prev. period'}
                                    breakdown={advancedStats.breakdowns.replies}
                                />
                                <InsightCard
                                    title="Total Actions"
                                    value={advancedStats.totalActions}
                                    icon={<Activity className="h-4 w-4" />}
                                    trend={`${advancedStats.growthTrend > 0 ? '+' : ''}${advancedStats.growthTrend}% ${dateFilter === 'today' ? 'today' : 'growth'}`}
                                    trendUp={advancedStats.growthTrend >= 0}
                                    trendLabel={dateFilter === 'today' ? 'vs yesterday' : dateFilter === '7d' ? 'vs last week' : dateFilter === '30d' ? 'vs last month' : 'prev. period'}
                                    breakdown={advancedStats.breakdowns.total}
                                />
                            </div>

                            {/* Detailed Trends Section */}
                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                                <Card className="border-white/5 bg-card/50 rounded-[2rem] p-8 relative overflow-hidden shadow-xl">
                                    <CardHeader className="p-0 mb-8 flex flex-row items-center justify-between">
                                        <CardTitle className="text-[13px] font-semibold text-foreground/70 tracking-tight flex items-center gap-2">
                                            Activity Volume
                                        </CardTitle>
                                        <span className="text-[10px] text-muted-foreground/40 font-bold uppercase tracking-widest">
                                            {dateFilter === 'today' ? 'Today' : dateFilter === '7d' ? 'Last 7 Days' : dateFilter === '30d' ? 'Last 30 Days' : 'All Activity'}
                                        </span>
                                    </CardHeader>
                                    <div className="h-48 w-full relative">
                                        <ActivityLineChart data={advancedStats.dailyActivity} color="#3b82f6" />
                                    </div>
                                </Card>

                                <Card className="border-white/5 bg-card/50 rounded-[2rem] p-8 shadow-xl">
                                    <CardHeader className="p-0 mb-8 flex flex-row items-center justify-between">
                                        <CardTitle className="text-[13px] font-semibold text-foreground/70 tracking-tight">
                                            Hourly Intensity
                                        </CardTitle>
                                        <div className="flex items-center gap-4 text-[10px] text-muted-foreground/60 font-medium">
                                            <div className="flex items-center gap-1.5">
                                                <span>Low Intensity</span>
                                                <div className="flex gap-1">
                                                    {[0.2, 0.4, 0.6, 0.8, 1].map((v) => (
                                                        <div
                                                            key={v}
                                                            className="w-2.5 h-2.5 rounded-sm"
                                                            style={{ backgroundColor: "#3b82f6", opacity: v }}
                                                        />
                                                    ))}
                                                </div>
                                                <span>High Intensity</span>
                                            </div>
                                        </div>
                                    </CardHeader>
                                    <div className="h-48 w-full">
                                        <Heatmap data={advancedStats.heatmapData as number[]} logs={filteredLogs} dateFilter={dateFilter} color="#3b82f6" />
                                    </div>
                                </Card>
                            </div>

                            {/* Distribution Section */}
                            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                                <Card className="flex flex-col border-white/5 bg-card/50 rounded-[2rem] p-6 shadow-xl">
                                    <CardHeader className="p-0 mb-4">
                                        <CardTitle className="text-[13px] font-semibold text-foreground/70 tracking-tight">Platform Mix</CardTitle>
                                    </CardHeader>
                                    <div className="flex-1 flex flex-col items-center justify-center">
                                        <div className="h-36 w-full relative">
                                            <DonutChart
                                                data={advancedStats.platformDist.length > 0 ? advancedStats.platformDist : [{ label: 'No Data', value: 1 }]}
                                                colors={advancedStats.platformDist.length > 0 ? ["#3b82f6", "#2dd4bf", "#6366f1", "#f43f5e"] : ["#1e293b"]}
                                            />
                                        </div>
                                        <div className="w-full mt-6 space-y-2">
                                            {advancedStats.platformDist.length > 0 ? advancedStats.platformDist.slice(0, 3).map((p, i) => {
                                                const total = advancedStats.platformDist.reduce((acc, d) => acc + d.value, 0);
                                                const percent = Math.round((p.value / total) * 100);
                                                return (
                                                    <div key={p.label} className="flex items-center justify-between p-2 rounded-xl hover:bg-white/5 transition-colors group/item">
                                                        <div className="flex items-center gap-3">
                                                            <div
                                                                className="w-2 h-2 rounded-full shadow-[0_0_8px_currentColor]"
                                                                style={{ color: ["#3b82f6", "#2dd4bf", "#6366f1", "#f43f5e"][i % 4] }}
                                                            />
                                                            <span className="text-[11px] font-bold text-foreground/70 uppercase tracking-tight group-hover/item:text-foreground transition-colors">
                                                                {p.label.replace('.com', '')}
                                                            </span>
                                                        </div>
                                                        <div className="flex flex-col items-end leading-none">
                                                            <span className="text-xs font-bold text-foreground">{percent}%</span>
                                                            <span className="text-[9px] text-muted-foreground/40 font-medium">{p.value} events</span>
                                                        </div>
                                                    </div>
                                                );
                                            }) : (
                                                <div className="text-[10px] text-muted-foreground/30 italic text-center py-4">
                                                    Awaiting multi-platform activity
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </Card>

                                <Card className="flex flex-col border-white/5 bg-card/50 rounded-[2rem] p-6 shadow-xl">
                                    <CardHeader className="p-0 mb-6">
                                        <CardTitle className="text-[13px] font-semibold text-foreground/70 tracking-tight">Action Breakdown</CardTitle>
                                    </CardHeader>
                                    <div className="flex-1 flex flex-col justify-center space-y-4">
                                        {advancedStats.actionDist.length > 0 ? advancedStats.actionDist.map((a) => (
                                            <div key={a.type} className="space-y-2.5 group/action">
                                                <div className="flex justify-between items-end px-0.5">
                                                    <div className="flex items-center gap-2.5">
                                                        <div className="p-1.5 rounded-lg bg-white/5 text-foreground/40 group-hover/action:text-foreground/70 transition-colors">
                                                            {getActionIcon(a.type)}
                                                        </div>
                                                        <div className="flex flex-col">
                                                            <span className="text-[11px] font-bold text-foreground/70 tracking-tight uppercase group-hover/action:text-foreground transition-colors">{a.label}</span>
                                                            <span className="text-[9px] text-muted-foreground/40 font-medium leading-none">{a.count.toLocaleString()} actions</span>
                                                        </div>
                                                    </div>
                                                    <span className="text-xs font-bold text-foreground tracking-tight">{a.percentage}%</span>
                                                </div>
                                                <div className="h-2 w-full bg-white/5 rounded-full overflow-hidden p-[1px]">
                                                    <motion.div
                                                        initial={{ width: 0 }}
                                                        animate={{ width: `${a.percentage}%` }}
                                                        transition={{ duration: 1, ease: [0.34, 1.56, 0.64, 1] }}
                                                        className={cn("h-full rounded-full transition-all duration-500", a.bgClass)}
                                                    />
                                                </div>
                                            </div>
                                        )) : (
                                            <div className="flex-1 flex items-center justify-center text-xs text-muted-foreground/30 italic py-10">
                                                No actions recorded for this period
                                            </div>
                                        )}
                                    </div>
                                </Card>

                                <Card className="flex flex-col border-white/5 bg-card/50 rounded-[2rem] overflow-hidden shadow-xl">
                                    <CardHeader className="px-6 pt-6 pb-2">
                                        <div className="flex items-center justify-between">
                                            <CardTitle className="text-[13px] font-semibold text-foreground/70 tracking-tight">Activity Feed</CardTitle>
                                            <LayoutList className="h-4 w-4 text-muted-foreground/40" />
                                        </div>
                                    </CardHeader>

                                    <CardContent className="flex-1 p-0 overflow-y-auto">
                                        <div className="px-5 py-1">
                                            <div className="space-y-1">
                                                {filteredLogs.length > 0 ? filteredLogs.slice(0, 5).map((log, i) => (
                                                    <motion.div
                                                        initial={{ opacity: 0, x: 20 }}
                                                        animate={{ opacity: 1, x: 0 }}
                                                        transition={{ delay: i * 0.1 }}
                                                        key={i}
                                                        className="flex items-center gap-4 p-2.5 rounded-2xl transition-all cursor-pointer hover:bg-white/5"
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
                    )}
                </ScrollArea>
                {/* Overlay Sidebar for History */}
                <AnimatePresence>
                    {selectedTarget && (
                        <>
                            <motion.div
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                exit={{ opacity: 0 }}
                                transition={{ duration: 0.2 }}
                                className="fixed inset-0 bg-black/40 backdrop-blur-[2px] z-50"
                                onClick={() => setSelectedTarget(null)}
                            />
                            <motion.div
                                initial={{ x: '100%' }}
                                animate={{ x: 0 }}
                                exit={{ x: '100%' }}
                                transition={{ type: 'spring', damping: 25, stiffness: 200 }}
                                className="fixed top-0 right-0 bottom-0 border-l border-border/20 bg-background shadow-2xl z-[60] flex flex-col overflow-hidden"
                                style={{ width: 480 }}
                            >
                                <TargetHistorySheet
                                    isOpen={!!selectedTarget}
                                    onClose={() => setSelectedTarget(null)}
                                    target={selectedTarget}
                                    noAnimation={true}
                                />
                            </motion.div>
                        </>
                    )}
                </AnimatePresence>

            </div>
        </div>
    );
};
