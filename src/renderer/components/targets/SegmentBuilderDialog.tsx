import { useState, useEffect, useMemo } from 'react';
import {
    Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Plus, Trash2, SlidersHorizontal, Info, Search, Check, ChevronDown } from 'lucide-react';
import { FilterCondition, FilterOperator, CreateSegmentInput } from '@/types/segments';
import { useTargetsStore } from '@/stores/targets.store';
import { v4 as uuidv4 } from 'uuid';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

interface FieldSelectorProps {
    value: string;
    metadataKey?: string;
    options: any[];
    onSelect: (value: string) => void;
}

function FieldSelector({ value, metadataKey, options, onSelect }: FieldSelectorProps) {
    const [open, setOpen] = useState(false);
    const [search, setSearch] = useState('');

    const filteredOptions = useMemo(() => {
        if (!search) return options;
        const lowSearch = search.toLowerCase();
        return options.filter(opt => opt.label.toLowerCase().includes(lowSearch));
    }, [options, search]);

    const selectedOption = useMemo(() => {
        return options.find(opt => {
            if (opt.value === value) return true;
            if (opt.metadataKey && opt.metadataKey === metadataKey) return true;
            return false;
        });
    }, [options, value, metadataKey]);

    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <Button
                    variant="outline"
                    role="combobox"
                    aria-expanded={open}
                    className="w-full justify-between h-10 bg-background border-border/40 rounded-xl px-3 font-normal text-xs"
                >
                    <span className="">
                        {selectedOption ? selectedOption.label : "Select field..."}
                    </span>
                    <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50 transition-transform duration-200" style={{ transform: open ? 'rotate(180deg)' : 'none' }} />
                </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0 bg-popover border-border shadow-2xl overflow-hidden rounded-xl" align="start">
                <div className="flex flex-col h-[300px]">
                    <div className="flex items-center border-b border-border/10 px-3 h-11 shrink-0 bg-muted/20">
                        <Search className="mr-2 h-4 w-4 shrink-0 opacity-50" />
                        <input
                            className="flex h-10 w-full rounded-md bg-transparent py-3 text-xs outline-none placeholder:text-muted-foreground"
                            placeholder="Search available columns..."
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                        />
                    </div>
                    <ScrollArea className="flex-1">
                        <div className="p-1">
                            {filteredOptions.length === 0 ? (
                                <div className="py-6 text-center text-xs text-muted-foreground italic">
                                    No matching columns found
                                </div>
                            ) : (
                                filteredOptions.map((opt) => {
                                    const isSelected = opt.value === value || (opt.metadataKey && opt.metadataKey === metadataKey);
                                    return (
                                        <div
                                            key={opt.value}
                                            className={cn(
                                                "relative flex cursor-pointer select-none items-center rounded-lg px-2 py-2.5 text-xs outline-none hover:bg-accent/60 hover:text-accent-foreground transition-all mx-1 my-0.5",
                                                isSelected && "bg-accent/80 text-accent-foreground font-medium"
                                            )}
                                            onClick={() => {
                                                onSelect(opt.value);
                                                setOpen(false);
                                                setSearch('');
                                            }}
                                        >
                                            <Check
                                                className={cn(
                                                    "mr-2 h-3.5 w-3.5 shrink-0 transition-all",
                                                    isSelected ? "opacity-100 scale-100" : "opacity-0 scale-90"
                                                )}
                                            />
                                            <span className="truncate">{opt.label}</span>
                                            {opt.type === 'metadata' && (
                                                <span className="ml-auto text-[10px] opacity-40 uppercase tracking-tighter">Custom</span>
                                            )}
                                        </div>
                                    );
                                })
                            )}
                        </div>
                    </ScrollArea>
                </div>
            </PopoverContent>
        </Popover>
    );
}

interface ValueSelectorProps {
    value: string;
    field: string;
    metadataKey?: string;
    onChange: (value: string) => void;
    placeholder?: string;
}

function ValueSelector({ value, field, metadataKey, onChange, placeholder }: ValueSelectorProps) {
    const [open, setOpen] = useState(false);
    const [suggestions, setSuggestions] = useState<string[]>([]);
    const [search, setSearch] = useState('');
    const { getFilterSuggestions } = useTargetsStore();
    const [isLoading, setIsLoading] = useState(false);

    useEffect(() => {
        if (open) {
            setIsLoading(true);
            getFilterSuggestions(field, metadataKey).then(vals => {
                setSuggestions(vals);
                setIsLoading(false);
            });
        }
    }, [open, field, metadataKey]);

    const filteredSuggestions = useMemo(() => {
        if (!search) return suggestions;
        return suggestions.filter(s => s.toLowerCase().includes(search.toLowerCase()));
    }, [suggestions, search]);

    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <div className="relative w-full">
                    <Input
                        placeholder={placeholder || "Enter criteria value..."}
                        value={value}
                        onChange={(e) => onChange(e.target.value)}
                        className="h-10 bg-background border-border/40 focus:bg-background transition-all rounded-xl text-xs pr-8"
                    />
                    <Button
                        variant="ghost"
                        size="icon"
                        className="absolute right-1 top-1/2 -translate-y-1/2 h-8 w-8 text-muted-foreground opacity-40 hover:opacity-100"
                        onClick={() => setOpen(!open)}
                    >
                        <ChevronDown className="h-4 w-4" />
                    </Button>
                </div>
            </PopoverTrigger>
            <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0 bg-popover border-border shadow-2xl overflow-hidden rounded-xl" align="start">
                <div className="flex flex-col h-[300px]">
                    <div className="flex items-center border-b border-border/10 px-3 h-11 shrink-0 bg-muted/20">
                        <Search className="mr-2 h-4 w-4 shrink-0 opacity-50" />
                        <input
                            className="flex h-10 w-full rounded-md bg-transparent py-3 text-xs outline-none placeholder:text-muted-foreground"
                            placeholder="Filter values..."
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                        />
                    </div>
                    <ScrollArea className="flex-1">
                        <div className="p-1">
                            {isLoading ? (
                                <div className="py-4 text-center text-xs text-muted-foreground animate-pulse">Loading suggestions...</div>
                            ) : filteredSuggestions.length === 0 ? (
                                <div className="py-4 text-center text-xs text-muted-foreground italic">No values found</div>
                            ) : (
                                filteredSuggestions.map((s) => (
                                    <div
                                        key={s}
                                        className={cn(
                                            "relative flex cursor-pointer select-none items-center rounded-lg px-2 py-2.5 text-xs outline-none hover:bg-accent/60 hover:text-accent-foreground transition-all mx-1 my-0.5",
                                            value === s && "bg-accent/80 text-accent-foreground font-medium"
                                        )}
                                        onClick={() => {
                                            onChange(s);
                                            setOpen(false);
                                            setSearch('');
                                        }}
                                    >
                                        <span className="truncate">{s}</span>
                                        {value === s && <Check className="ml-auto h-3 w-3" />}
                                    </div>
                                ))
                            )}
                        </div>
                    </ScrollArea>
                </div>
            </PopoverContent>
        </Popover>
    );
}

interface SegmentBuilderDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    segmentId?: string | null;
}

const STANDARD_FIELDS = [
    { label: 'Name', value: 'name', type: 'string', metadataKey: undefined },
    { label: 'Email', value: 'email', type: 'string', metadataKey: undefined },
    { label: 'URL', value: 'url', type: 'string', metadataKey: undefined },
    { label: 'Type', value: 'type', type: 'string', metadataKey: undefined },
    { label: 'Status', value: 'status', type: 'string', metadataKey: undefined },
    { label: 'Last Interaction', value: 'last_interaction_at', type: 'date', metadataKey: undefined },
    { label: 'Created At', value: 'created_at', type: 'date', metadataKey: undefined },
];

const OPERATORS: Record<string, { label: string, value: FilterOperator }[]> = {
    string: [
        { label: 'Equals', value: 'equals' },
        { label: 'Contains', value: 'contains' },
        { label: 'Starts With', value: 'starts_with' },
        { label: 'Is Empty', value: 'is_empty' },
        { label: 'Is Not Empty', value: 'is_not_empty' }
    ],
    number: [
        { label: '=', value: 'equals' },
        { label: '>', value: 'gt' },
        { label: '<', value: 'lt' },
        { label: '>=', value: 'gte' },
        { label: '<=', value: 'lte' }
    ],
    date: [
        { label: 'Before', value: 'lt' },
        { label: 'After', value: 'gt' },
        { label: 'Is Empty', value: 'is_empty' },
        { label: 'Is Not Empty', value: 'is_not_empty' }
    ],
    metadata: [
        { label: 'Equals', value: 'equals' },
        { label: 'Contains', value: 'contains' },
        { label: '>', value: 'gt' },
        { label: '<', value: 'lt' },
        { label: 'Is Empty', value: 'is_empty' },
        { label: 'Is Not Empty', value: 'is_not_empty' }
    ]
};

export function SegmentBuilderDialog({ open, onOpenChange, segmentId }: SegmentBuilderDialogProps) {
    const { segments, addSegment, updateSegment, isLoading, allMetadataKeys } = useTargetsStore();
    const [name, setName] = useState('');
    const [description, setDescription] = useState('');
    const [filters, setFilters] = useState<FilterCondition[]>([]);
    const [match_type, setMatchType] = useState<'all' | 'any'>('all');

    const { getFilterSuggestions } = useTargetsStore();

    const dynamicFields = useMemo(() => {
        const customFields = allMetadataKeys.map(key => ({
            label: key.replace(/_/g, ' ').replace(/\b\w/g, (l: string) => l.toUpperCase()),
            value: `metadata:${key}`,
            type: 'metadata',
            metadataKey: key
        }));

        return [
            ...STANDARD_FIELDS,
            { label: 'RAW CUSTOM ATTRIBUTE', value: 'metadata_raw', type: 'metadata', metadataKey: undefined }, // Fallback
            ...customFields
        ];
    }, [allMetadataKeys]);

    useEffect(() => {
        if (open) {
            if (segmentId) {
                const segment = segments.find(s => s.id === segmentId);
                if (segment) {
                    setName(segment.name);
                    setDescription(segment.description || '');
                    setFilters(segment.filters);
                    setMatchType(segment.match_type || 'all');
                }
            } else {
                setName('');
                setDescription('');
                setMatchType('all');
                setFilters([{
                    id: uuidv4(),
                    field: 'name',
                    operator: 'contains',
                    value: '',
                    type: 'string'
                }]);
            }
        }
    }, [open, segmentId, segments]);

    const handleAddFilter = () => {
        setFilters([...filters, {
            id: uuidv4(),
            field: 'name',
            operator: 'contains',
            value: '',
            type: 'string'
        }]);
    };

    const handleRemoveFilter = (id: string) => {
        setFilters(filters.filter(f => f.id !== id));
    };

    const updateFilter = (id: string, updates: Partial<FilterCondition>) => {
        setFilters(filters.map(f => {
            if (f.id === id) {
                const updated = { ...f, ...updates };
                // Reset operator if field type changes
                // Handle field change mapping
                if (updates.field) {
                    const fieldDef = dynamicFields.find((fd: any) => fd.value === updates.field);
                    if (fieldDef) {
                        updated.type = fieldDef.type as any;
                        updated.field = fieldDef.value.startsWith('metadata:') ? 'metadata' : fieldDef.value;
                        if (fieldDef.metadataKey) {
                            updated.metadataKey = fieldDef.metadataKey;
                        } else if (fieldDef.value === 'metadata_raw') {
                            updated.field = 'metadata';
                            updated.metadataKey = '';
                        }

                        updated.operator = OPERATORS[fieldDef.type === 'metadata' ? 'metadata' : fieldDef.type][0].value;
                    }
                }
                return updated;
            }
            return f;
        }));
    };

    const handleSave = async () => {
        if (!name.trim()) {
            toast.error('Please enter a segment name');
            return;
        }

        if (filters.length === 0) {
            toast.error('Please add at least one filter');
            return;
        }

        const input: CreateSegmentInput = {
            name,
            description,
            filters,
            match_type
        };

        try {
            if (segmentId) {
                await updateSegment(segmentId, input);
            } else {
                await addSegment(input);
            }
            onOpenChange(false);
        } catch (error) {
            console.error('Failed to save segment:', error);
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[600px] h-[80vh] flex flex-col p-0 gap-0 bg-background border-border/50 shadow-2xl overflow-hidden rounded-2xl">
                <DialogHeader className="p-6 border-b border-border/10 bg-muted/20 backdrop-blur-md">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-secondary/30 flex items-center justify-center">
                            <SlidersHorizontal className="h-5 w-5 text-secondary-foreground" />
                        </div>
                        <div>
                            <DialogTitle className="text-xl font-semibold tracking-tight">
                                {segmentId ? 'Edit Segment' : 'Create Segment'}
                            </DialogTitle>
                            <p className="text-xs text-muted-foreground mt-0.5 font-medium">
                                Build a dynamic group of contacts based on rules
                            </p>
                        </div>
                    </div>
                </DialogHeader>

                <ScrollArea className="flex-1 px-6">
                    <div className="py-6 space-y-8">
                        {/* Basic Info */}
                        <div className="space-y-4">
                            <div className="grid gap-2">
                                <Label htmlFor="name" className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground ml-1">Segment Name</Label>
                                <Input
                                    id="name"
                                    placeholder="e.g., High-Value Leads"
                                    value={name}
                                    onChange={(e) => setName(e.target.value)}
                                    className="bg-muted/30 border-border/50 focus:bg-muted/50 transition-all rounded-xl h-11"
                                />
                            </div>
                            <div className="grid gap-2">
                                <Label htmlFor="description" className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground ml-1">Description (Optional)</Label>
                                <Input
                                    id="description"
                                    placeholder="Brief explanation of this segment..."
                                    value={description}
                                    onChange={(e) => setDescription(e.target.value)}
                                    className="bg-muted/30 border-border/50 focus:bg-muted/50 transition-all rounded-xl h-11"
                                />
                            </div>
                        </div>

                        {/* Match Type Toggle & Description */}
                        <div className="bg-muted/30 border border-border/50 rounded-2xl p-4 space-y-3">
                            <div className="flex items-center justify-between">
                                <div className="space-y-0.5">
                                    <h4 className="text-xs font-bold uppercase tracking-wider text-foreground">Matching Logic</h4>
                                    <p className="text-[10px] text-muted-foreground">How should these rules be combined?</p>
                                </div>
                                <div className="flex items-center gap-1 bg-background/50 p-1 rounded-xl border border-border/40">
                                    <Button
                                        variant={match_type === 'all' ? 'secondary' : 'ghost'}
                                        size="sm"
                                        onClick={() => setMatchType('all')}
                                        className={cn(
                                            "h-8 text-[10px] px-4 rounded-lg font-bold transition-all",
                                            match_type === 'all' && "shadow-sm"
                                        )}
                                    >
                                        AND
                                    </Button>
                                    <Button
                                        variant={match_type === 'any' ? 'secondary' : 'ghost'}
                                        size="sm"
                                        onClick={() => setMatchType('any')}
                                        className={cn(
                                            "h-8 text-[10px] px-4 rounded-lg font-bold transition-all",
                                            match_type === 'any' && "shadow-sm"
                                        )}
                                    >
                                        OR
                                    </Button>
                                </div>
                            </div>
                            <div className="p-3 bg-secondary/5 rounded-xl border border-secondary/10">
                                <p className="text-[11px] text-muted-foreground leading-relaxed italic">
                                    {match_type === 'all'
                                        ? "Targets must satisfy EVERY rule below to be included in this segment."
                                        : "Targets satisfying ANY of the rules below will be included in this segment."
                                    }
                                </p>
                            </div>
                        </div>

                        {/* Filters Section */}
                        <div className="space-y-6">
                            <div className="flex items-center justify-between">
                                <Label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground ml-1">Filter Rules</Label>
                                <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-secondary/20 text-secondary-foreground border border-secondary/20">
                                    {filters.length} {filters.length === 1 ? 'Rule' : 'Rules'}
                                </span>
                            </div>

                            <div className="space-y-3">
                                {filters.map((filter, index) => (
                                    <div
                                        key={filter.id}
                                        className="relative group bg-muted/20 border border-border/40 p-4 rounded-2xl space-y-4 transition-all hover:bg-muted/30 hover:border-border/60"
                                    >
                                        {index > 0 && (
                                            <div className="absolute -top-3 left-6 z-10">
                                                <span className="bg-background border border-border/60 px-2 py-0.5 rounded-lg text-[9px] font-black uppercase tracking-widest shadow-sm text-secondary-foreground">
                                                    {match_type === 'all' ? 'AND' : 'OR'}
                                                </span>
                                            </div>
                                        )}
                                        <div className="grid grid-cols-12 gap-3 items-start">
                                            {/* Searchable Field Selection */}
                                            <div className="col-span-4 space-y-1.5">
                                                <Label className="text-[9px] font-semibold text-muted-foreground uppercase tracking-wider ml-1">Field</Label>
                                                <FieldSelector
                                                    value={filter.field}
                                                    metadataKey={filter.metadataKey}
                                                    options={dynamicFields}
                                                    onSelect={(val) => updateFilter(filter.id, { field: val })}
                                                />
                                            </div>

                                            {/* Metadata Key (Show for raw, or allow editing for discovered) */}
                                            {(filter.field === 'metadata' && !dynamicFields.find((f: any) => f.metadataKey === filter.metadataKey)) && (
                                                <div className="col-span-4 space-y-1.5">
                                                    <Label className="text-[9px] font-semibold text-muted-foreground uppercase tracking-wider ml-1">Key Name</Label>
                                                    <Input
                                                        placeholder="e.g., job_title"
                                                        value={filter.metadataKey || ''}
                                                        onChange={(e) => updateFilter(filter.id, { metadataKey: e.target.value })}
                                                        className="h-10 bg-background border-border/40 focus:bg-background transition-all rounded-xl text-xs"
                                                    />
                                                </div>
                                            )}

                                            {/* Operator Selection */}
                                            <div className={cn("space-y-1.5", filter.field === 'metadata' ? "col-span-3" : "col-span-4")}>
                                                <Label className="text-[9px] font-semibold text-muted-foreground uppercase tracking-wider ml-1">Condition</Label>
                                                <Select
                                                    value={filter.operator}
                                                    onValueChange={(v) => updateFilter(filter.id, { operator: v as FilterOperator })}
                                                >
                                                    <SelectTrigger className="h-10 bg-background border-border/40 rounded-xl focus:ring-0">
                                                        <SelectValue />
                                                    </SelectTrigger>
                                                    <SelectContent>
                                                        {OPERATORS[filter.type === 'metadata' ? 'metadata' : filter.type]?.map(o => (
                                                            <SelectItem key={o.value} value={o.value} className="text-xs">{o.label}</SelectItem>
                                                        ))}
                                                    </SelectContent>
                                                </Select>
                                            </div>

                                            {/* Remove Button */}
                                            <div className="col-span-1 pt-6 flex justify-end">
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    onClick={() => handleRemoveFilter(filter.id)}
                                                    className="h-9 w-9 text-muted-foreground hover:text-red-400 hover:bg-red-400/10 rounded-xl transition-all"
                                                >
                                                    <Trash2 className="h-4 w-4" />
                                                </Button>
                                            </div>

                                            {/* Value Input (Conditional) */}
                                            {!['is_empty', 'is_not_empty'].includes(filter.operator) && (
                                                <div className="col-span-12 space-y-1.5 pt-1">
                                                    <Label className="text-[9px] font-semibold text-muted-foreground uppercase tracking-wider ml-1">Value</Label>
                                                    {filter.type === 'date' ? (
                                                        <Input
                                                            type="date"
                                                            value={filter.value || ''}
                                                            onChange={(e) => updateFilter(filter.id, { value: e.target.value })}
                                                            className="h-10 bg-background border-border/40 focus:bg-background transition-all rounded-xl text-xs"
                                                        />
                                                    ) : (
                                                        <ValueSelector
                                                            field={filter.field}
                                                            metadataKey={filter.metadataKey}
                                                            value={filter.value || ''}
                                                            onChange={(val) => updateFilter(filter.id, { value: val })}
                                                            placeholder="Enter criteria value or select..."
                                                        />
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                ))}

                                <Button
                                    variant="outline"
                                    onClick={handleAddFilter}
                                    className="w-full border-dashed border-border/50 hover:bg-muted/30 hover:border-border transition-all h-12 rounded-2xl text-xs font-medium gap-2 text-muted-foreground hover:text-foreground"
                                >
                                    <Plus className="h-4 w-4" />
                                    Add Another Rule
                                </Button>
                            </div>

                            {/* Query Summary Preview */}
                            {filters.length > 0 && (
                                <div className="mt-8 p-6 bg-muted/30 border border-border/40 rounded-3xl space-y-4">
                                    <div className="flex items-center gap-2 mb-1">
                                        <div className="w-6 h-6 rounded-lg bg-secondary/20 flex items-center justify-center">
                                            <Search className="h-3 w-3 text-secondary-foreground" />
                                        </div>
                                        <h4 className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Definition Preview</h4>
                                    </div>
                                    <div className="text-sm font-medium leading-relaxed">
                                        <span className="text-muted-foreground mr-1">Find contacts where</span>
                                        <span className="text-foreground font-bold underline decoration-secondary/40 decoration-2 underline-offset-4">
                                            {match_type === 'all' ? 'ALL' : 'ANY'}
                                        </span>
                                        <span className="text-muted-foreground ml-1">of these are true:</span>
                                    </div>
                                    <div className="flex flex-wrap gap-2">
                                        {filters.map((f, i) => {
                                            const fieldLabel = dynamicFields.find(df => df.value === (f.field === 'metadata' ? `metadata:${f.metadataKey}` : f.field))?.label || f.field;
                                            const opLabel = OPERATORS[f.type === 'metadata' ? 'metadata' : f.type]?.find(o => o.value === f.operator)?.label || f.operator;

                                            return (
                                                <div key={f.id} className="flex items-center">
                                                    {i > 0 && <span className="mx-2 text-[9px] font-black text-muted-foreground/30">{match_type === 'all' ? 'AND' : 'OR'}</span>}
                                                    <div className="px-3 py-1.5 bg-background border border-border/60 rounded-xl text-[11px] shadow-sm">
                                                        <span className="text-muted-foreground mr-1">{fieldLabel}</span>
                                                        <span className="text-secondary-foreground font-semibold mr-1">{opLabel}</span>
                                                        <span className="text-foreground font-bold">"{f.value || '...'}"</span>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </ScrollArea>

                <DialogFooter className="p-6 border-t border-border/10 bg-muted/10">
                    <Button
                        variant="ghost"
                        onClick={() => onOpenChange(false)}
                        className="rounded-xl h-11 px-6"
                    >
                        Cancel
                    </Button>
                    <Button
                        onClick={handleSave}
                        disabled={isLoading}
                        className="bg-secondary hover:bg-secondary/80 text-secondary-foreground rounded-xl h-11 px-8 font-semibold shadow-lg shadow-black/10 active:scale-95 transition-all"
                    >
                        {isLoading ? 'Saving...' : (segmentId ? 'Update Segment' : 'Save Segment')}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
