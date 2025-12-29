
import { memo } from 'react';
import { Handle, Position, NodeProps } from 'reactflow';
import { NODE_DEFINITIONS } from '../nodeDefs';
import { cn } from '@/lib/utils';
import { PlaybookNodeType } from '@/types/playbook';

const BaseNode = ({ data, type, selected }: NodeProps) => {
    const def = NODE_DEFINITIONS[type as PlaybookNodeType];

    if (!def) return <div className="p-2 bg-destructive text-destructive-foreground text-xs rounded-lg">Unknown Node: {type}</div>;

    const Icon = def.icon;
    const isStart = type === 'start';
    const isEnd = type === 'end';
    const isControl = def.category === 'Control' && !isStart && !isEnd;

    return (
        <div className={cn(
            "min-w-[180px] max-w-[240px] rounded-xl border bg-card transition-all shadow-md group relative",
            selected ? "border-primary ring-2 ring-primary/20 brightness-110" : "border-border hover:border-primary/40",
            "flex flex-col py-3 px-4"
        )}>
            {/* --- All-Direction Bidirectional Ports --- */}
            {['top', 'bottom', 'left', 'right'].map((side) => {
                const pos = side === 'top' ? Position.Top : side === 'bottom' ? Position.Bottom : side === 'left' ? Position.Left : Position.Right;
                const isVertical = side === 'top' || side === 'bottom';

                // Only show Top/Bottom handles unless it's a specialized node that needs side ports
                // Loop and Condition handles are handled separately or by specialized logic
                // Hide handles for specific sides on Start/End
                if (isStart && (side === 'top' || side === 'left')) return null;
                if (isEnd && (side === 'bottom' || side === 'right')) return null;

                return (
                    <div key={side} className="absolute inset-0 pointer-events-none">
                        {/* Target Handle (Invisible Drop Zone - Receive Only) */}
                        <Handle
                            id={`${side}-target`}
                            type="target"
                            position={pos}
                            isConnectableStart={false} // Cannot start connection from here
                            className="!w-6 !h-6 !bg-transparent !border-none !shadow-none !opacity-0 !pointer-events-auto z-20"
                            style={{
                                [side]: '-12px', // Pushed further out
                                [isVertical ? 'left' : 'top']: '50%',
                                transform: isVertical ? 'translateX(-50%)' : 'translateY(-50%)'
                            }}
                        />
                        {/* Source Handle (Visible Dot - Start Only) */}
                        <Handle
                            id={`${side}-source`}
                            type="source"
                            position={pos}
                            className="!w-3 !h-3 !bg-muted-foreground/40 !border-2 !border-card transition-all opacity-40 group-hover:opacity-100 hover:!bg-primary hover:!scale-150 z-30 !pointer-events-auto shadow-sm"
                            style={{
                                [side]: '-1.5px',
                                [isVertical ? 'left' : 'top']: '50%',
                                transform: isVertical ? 'translateX(-50%)' : 'translateY(-50%)'
                            }}
                        />
                    </div>
                );
            })}

            {/* Node Content */}
            <div className="flex items-center gap-3">
                <div className={cn("p-2 rounded-lg shrink-0 shadow-inner", def.color)}>
                    <Icon className="w-4 h-4" />
                </div>
                <div className="flex-1 min-w-0">
                    <h3 className="text-sm font-bold tracking-tight truncate leading-tight">
                        {data.label || def.label}
                    </h3>
                    <p className="text-[10px] text-muted-foreground/60 uppercase font-black tracking-widest mt-0.5">
                        {def.category}
                    </p>
                </div>
            </div>

            {/* Config Snippet (Subtle) */}
            {data.config && Object.keys(data.config).length > 0 && (
                <div className="mt-3 pt-2 border-t border-border/40 space-y-1">
                    {Object.entries(data.config).slice(0, 1).map(([k, v]) => (
                        <div key={k} className="flex flex-col">
                            <span className="text-[9px] uppercase font-bold text-muted-foreground/60 truncate">{k.replace('_', ' ')}</span>
                            <span className="text-[10px] font-mono text-foreground/80 truncate">{String(v)}</span>
                        </div>
                    ))}
                </div>
            )}

            {/* Specialized: Condition Node (n8n style branch) */}
            {type === 'condition' && (
                <div className="absolute right-[-10px] top-0 bottom-0 flex flex-col justify-around py-4">
                    <div className="relative group/handle">
                        <Handle
                            id="true"
                            type="source"
                            position={Position.Right}
                            className="!static !w-3 !h-3 !bg-emerald-500 border-2 border-card shadow-sm hover:!scale-125 transition-transform"
                        />
                        <div className="absolute right-5 top-[-2px] text-[9px] font-black text-emerald-500 bg-emerald-500/10 px-1.5 py-0.5 rounded pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity uppercase">True</div>
                    </div>
                    <div className="relative group/handle">
                        <Handle
                            id="false"
                            type="source"
                            position={Position.Right}
                            className="!static !w-3 !h-3 !bg-red-500 border-2 border-card shadow-sm hover:!scale-125 transition-transform"
                        />
                        <div className="absolute right-5 top-[-2px] text-[9px] font-black text-red-500 bg-red-500/10 px-1.5 py-0.5 rounded pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity uppercase">False</div>
                    </div>
                </div>
            )}

            {/* Specialized: Loop Node */}
            {type === 'loop' && (
                <div className="absolute right-[-10px] top-0 bottom-0 flex flex-col justify-around py-4">
                    <div className="relative group/handle">
                        <Handle
                            id="item"
                            type="source"
                            position={Position.Right}
                            className="!static !w-3 !h-3 !bg-blue-500 border-2 border-card shadow-sm hover:!scale-125 transition-transform"
                        />
                        <div className="absolute right-5 top-[-2px] text-[9px] font-black text-blue-500 bg-blue-500/10 px-1.5 py-0.5 rounded pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity uppercase">Item</div>
                    </div>
                    <div className="relative group/handle">
                        <Handle
                            id="done"
                            type="source"
                            position={Position.Right}
                            className="!static !w-3 !h-3 !bg-slate-500 border-2 border-card shadow-sm hover:!scale-125 transition-transform"
                        />
                        <div className="absolute right-5 top-[-2px] text-[9px] font-black text-slate-500 bg-slate-500/10 px-1.5 py-0.5 rounded pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity uppercase">Done</div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default memo(BaseNode);
