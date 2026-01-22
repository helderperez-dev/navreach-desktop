import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Globe, User, Building2, FileText, Link as LinkIcon, Mail, Plus, Trash2, Clock, ArrowUpRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { CircularLoader } from '@/components/ui/CircularLoader';
import { useTargetsStore } from '@/stores/targets.store';
import { TargetType, Target } from '@/types/targets';
import { cn } from '@/lib/utils';
import { Field } from '@/components/ui/field';
import { toast } from 'sonner';

interface TargetDetailsDrawerProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    target?: Target | null;
    onViewHistory?: (target: any) => void;
    noAnimation?: boolean;
}

const TARGET_TYPES: { value: TargetType, label: string, icon: any }[] = [
    { value: 'profile', label: 'Profile', icon: User },
    { value: 'company', label: 'Company', icon: Building2 },
    { value: 'post', label: 'Post', icon: FileText },
    { value: 'lead', label: 'Lead', icon: LinkIcon },
    { value: 'other', label: 'Other', icon: Globe },
];

export function TargetForm({ open, onOpenChange, target, onViewHistory, noAnimation = false }: TargetDetailsDrawerProps) {
    const { lists, selectedListId, lastSelectedListId, addTarget, updateTarget, deleteTarget, saveTargetAssignments } = useTargetsStore();
    const [isLoading, setIsLoading] = useState(false);
    const [formData, setFormData] = useState({
        name: '',
        url: '',
        email: '',
        type: 'profile' as TargetType,
        tags: '',
        list_ids: [] as string[],
    });
    const [metadataItems, setMetadataItems] = useState<{ key: string, value: string }[]>([]);
    const [stableTarget, setStableTarget] = useState<Target | null>(null);
    const [duplicateTarget, setDuplicateTarget] = useState<Target | null>(null);
    const [isCheckingDuplicate, setIsCheckingDuplicate] = useState(false);

    useEffect(() => {
        if (target) {
            setStableTarget(target);
            setFormData({
                name: target.name,
                url: target.url || '',
                email: target.email || '',
                type: target.type,
                tags: target.tags?.join(', ') || '',
                list_ids: (target as any).all_list_ids || (target.list_id ? [target.list_id] : []),
            });
            const metadata = { ...(target.metadata || {}) };

            // 1. Flatten legacy profile_details if it exists
            if (metadata.profile_details && typeof metadata.profile_details === 'object') {
                Object.entries(metadata.profile_details).forEach(([key, value]) => {
                    if (!(key in metadata)) {
                        metadata[key] = value;
                    }
                });
                delete metadata.profile_details;
            }

            // 2. Filter out internal keys that shouldn't be edited as raw text
            const internalKeys = ['avatar_url', 'profile_details'];
            const items = Object.entries(metadata)
                .filter(([key]) => !internalKeys.includes(key))
                .map(([key, value]) => ({
                    key,
                    value: typeof value === 'object' && value !== null ? JSON.stringify(value) : String(value)
                }));

            setMetadataItems(items);
        } else {
            setFormData({
                name: '',
                url: '',
                email: '',
                type: 'profile',
                tags: '',
                list_ids: selectedListId ? [selectedListId] : (lastSelectedListId ? [lastSelectedListId] : [])
            });
            setMetadataItems([]);
            // Don't clear stableTarget immediately to allow exit animation
        }
    }, [target, lists, selectedListId, lastSelectedListId]);

    // Check for duplicates when URL changes
    useEffect(() => {
        const check = async () => {
            const url = formData.url;
            if (!url || !useTargetsStore.getState().checkDuplicate) return;

            setIsCheckingDuplicate(true);
            try {
                const existing = await useTargetsStore.getState().checkDuplicate(url);
                // Only mark as duplicate if it's not the same target we are currently editing
                const activeId = target?.id || stableTarget?.id;
                const otherDuplicates = existing.filter(e => e.id !== activeId);

                if (otherDuplicates.length > 0) {
                    setDuplicateTarget(otherDuplicates[0]); // Keep one for list name reference if needed
                    // For the banner we might use the length
                    (otherDuplicates as any).count = otherDuplicates.length;
                } else {
                    setDuplicateTarget(null);
                }
            } catch (err) {
                console.error('Duplicate check failed:', err);
                setDuplicateTarget(null);
            } finally {
                setIsCheckingDuplicate(false);
            }
        };

        const timeout = setTimeout(check, 500);
        return () => clearTimeout(timeout);
    }, [formData.url, target?.id, stableTarget?.id]);

    const handleAddMetadata = () => {
        setMetadataItems([...metadataItems, { key: '', value: '' }]);
    };

    const handleRemoveMetadata = (index: number) => {
        setMetadataItems(metadataItems.filter((_, i) => i !== index));
    };

    const handleMetadataChange = (index: number, field: 'key' | 'value', value: string) => {
        const newItems = [...metadataItems];
        newItems[index][field] = value;
        setMetadataItems(newItems);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        const activeTarget = target || stableTarget;
        if (formData.list_ids.length === 0 && !activeTarget) return;

        setIsLoading(true);
        try {
            const originalMetadata = activeTarget?.metadata || {};
            const metadata = {
                ...originalMetadata,
                ...metadataItems.reduce((acc, item) => {
                    if (item.key.trim()) {
                        acc[item.key.trim()] = item.value;
                    }
                    return acc;
                }, {} as Record<string, any>)
            };

            const payload = {
                name: formData.name,
                url: formData.url,
                email: formData.email || null,
                type: formData.type,
                tags: formData.tags.split(',').map(t => t.trim()).filter(Boolean),
                metadata,
            };

            if (activeTarget?.id?.startsWith('virtual-') || !activeTarget) {
                await saveTargetAssignments(payload, formData.list_ids);
            } else {
                await saveTargetAssignments({ ...payload, id: activeTarget.id }, formData.list_ids);
            }
            onOpenChange(false);
        } catch (error: any) {
            console.error('Failed to save target assignments:', error);
            toast.error(`Failed to save: ${error.message}`);
        } finally {
            setIsLoading(false);
        }
    };

    const handleHistoryClick = () => {
        const activeTarget = target || stableTarget;
        if (activeTarget && onViewHistory) {
            onOpenChange(false);
            const platform = activeTarget.url.includes('x.com') || activeTarget.url.includes('twitter.com') ? 'x.com' : 'unknown';
            onViewHistory({
                username: (activeTarget.metadata as any)?.username || activeTarget.name,
                name: activeTarget.name,
                avatar_url: (activeTarget.metadata as any)?.avatar_url || null,
                platform: platform
            });
        }
    };

    const activeTarget = target || stableTarget;
    const avatarUrl = (activeTarget?.metadata as any)?.avatar_url;
    const username = (activeTarget?.metadata as any)?.username || activeTarget?.name;
    const platform = activeTarget?.url?.includes('x.com') || activeTarget?.url?.includes('twitter.com')
        ? 'x.com'
        : activeTarget?.url?.includes('linkedin')
            ? 'linkedin'
            : 'web';

    const openProfile = () => {
        if (activeTarget?.url) {
            window.open(activeTarget.url, '_blank');
        }
    };

    const content = (
        <div className="w-[480px] h-full flex flex-col">
            {/* Profile Header - shown when editing */}
            {activeTarget && !activeTarget.id?.startsWith('virtual-') ? (
                <div className="px-8 py-8 border-b border-border/5 bg-muted/5 relative">
                    <div className="absolute top-4 right-4 flex items-center gap-2">
                        {onViewHistory && (
                            <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 hover:bg-muted rounded-xl text-muted-foreground group/hist border border-border/10"
                                onClick={handleHistoryClick}
                                title="View History"
                            >
                                <Clock className="h-4 w-4 group-hover/hist:text-primary transition-colors" />
                            </Button>
                        )}
                        <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 rounded-xl hover:bg-muted"
                            onClick={() => onOpenChange(false)}
                        >
                            <X className="h-4 w-4 text-muted-foreground/40" />
                        </Button>
                    </div>
                    <div
                        className="flex items-center gap-5 cursor-pointer group/header w-fit"
                        onClick={openProfile}
                    >
                        <div className="relative">
                            {avatarUrl ? (
                                <img src={avatarUrl} className="h-16 w-16 rounded-full border border-border/20 shadow-xl object-cover transition-transform group-hover/header:scale-105" alt="" />
                            ) : (
                                <div className="h-16 w-16 rounded-full bg-muted/20 flex items-center justify-center border border-border/20 shadow-xl font-bold text-2xl text-muted-foreground transition-transform group-hover/header:scale-105">
                                    {(activeTarget.name && activeTarget.name[0]?.toUpperCase()) || 'U'}
                                </div>
                            )}
                            <div className="absolute -bottom-1 -right-1 h-5 w-5 rounded-lg bg-background border border-border/10 shadow-sm flex items-center justify-center">
                                <Globe className="h-2.5 w-2.5 text-muted-foreground/80" />
                            </div>
                        </div>
                        <div className="text-left flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                                <h2 className="text-xl font-semibold tracking-tight text-foreground group-hover/header:text-primary transition-colors truncate">
                                    {activeTarget.name || username}
                                </h2>
                                <ArrowUpRight className="h-3.5 w-3.5 text-muted-foreground/30 group-hover/header:opacity-100 transition-all transform group-hover/header:translate-x-0.5 group-hover/header:-translate-y-0.5" />
                            </div>
                            <div className="flex items-center gap-2 mt-1">
                                <span className="text-sm font-medium text-muted-foreground/70">@{username}</span>
                                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-secondary text-muted-foreground/80 border border-border/20 uppercase tracking-wider">
                                    {platform}
                                </span>
                            </div>
                        </div>
                    </div>
                </div>
            ) : (
                /* New/Virtual Target Header */
                <div className="flex items-center justify-between p-6 border-b border-white/5 bg-muted/5 relative">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-2xl bg-muted/40 flex items-center justify-center border border-border/10 shadow-sm">
                            <Plus className="h-5 w-5 text-foreground/70" />
                        </div>
                        <div className="flex flex-col">
                            <h2 className="text-lg font-bold tracking-tight text-foreground leading-none">
                                {target?.id?.startsWith('virtual-') ? "New Contact" : "Add Target"}
                            </h2>
                            <p className="text-[10px] font-bold text-muted-foreground/40 mt-1 uppercase tracking-widest">
                                {target?.id?.startsWith('virtual-') ? "Unsaved Discovery" : "Create New"}
                            </p>
                        </div>
                    </div>
                    <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 hover:bg-muted rounded-xl text-muted-foreground border border-border/10"
                        onClick={() => onOpenChange(false)}
                    >
                        <X className="h-4 w-4" />
                    </Button>
                </div>
            )}

            <form onSubmit={handleSubmit} className="flex-1 overflow-hidden flex flex-col">
                <div className="flex-1 overflow-y-auto p-6 space-y-8 scrollbar-thin scrollbar-thumb-muted-foreground/20">
                    {/* Type Selection */}
                    <div className="space-y-3">
                        <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider ml-1">Type</label>
                        <div className="grid grid-cols-5 gap-2">
                            {TARGET_TYPES.map((type) => (
                                <button
                                    key={type.value}
                                    type="button"
                                    onClick={() => setFormData(prev => ({ ...prev, type: type.value }))}
                                    className={cn(
                                        "flex flex-col items-center justify-center p-3 rounded-xl border transition-all gap-1.5",
                                        formData.type === type.value
                                            ? "bg-muted border-muted-foreground/30 text-foreground ring-1 ring-muted-foreground/10"
                                            : "bg-muted/30 border-transparent text-muted-foreground hover:bg-muted/50"
                                    )}
                                >
                                    <type.icon className="h-4 w-4" />
                                    <span className="text-[9px] font-medium">{type.label}</span>
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Basic Info */}
                    <div className="space-y-4">
                        <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider ml-1">Basic Information</label>

                        <Field label="Full Name">
                            <Input
                                required
                                placeholder="e.g. Helder Perez"
                                value={formData.name}
                                onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                            />
                        </Field>

                        <Field label="URL / Link">
                            <Input
                                required
                                type="url"
                                placeholder="https://x.com/helderbuilds"
                                value={formData.url}
                                onChange={(e) => setFormData(prev => ({ ...prev, url: e.target.value }))}
                            />
                        </Field>

                        <Field label="Email Address">
                            <Input
                                type="email"
                                placeholder="name@example.com"
                                value={formData.email}
                                onChange={(e) => setFormData(prev => ({ ...prev, email: e.target.value }))}
                            />
                        </Field>
                    </div>

                    <div className="space-y-4">
                        <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider ml-1">Organization</label>

                        {duplicateTarget && (
                            <div className="mx-1 p-3 rounded-xl bg-blue-500/10 border border-blue-500/20 flex flex-col gap-1 animate-in fade-in slide-in-from-top-2 duration-300">
                                <div className="flex items-center gap-2 text-blue-400">
                                    <ArrowUpRight className="h-3.5 w-3.5" />
                                    <span className="text-[10px] font-bold uppercase tracking-wider">Already in your system</span>
                                </div>
                                <p className="text-[11px] text-blue-100/70 leading-relaxed">
                                    {target?.id.startsWith('virtual-')
                                        ? `This contact is already in your database across ${(duplicateTarget as any).length} lists.`
                                        : `This contact is also saved in other lists.`}
                                </p>
                            </div>
                        )}

                        {target?.id.startsWith('virtual-') && (
                            <p className="text-[10px] text-muted-foreground/60 mb-2 font-medium bg-muted/30 px-2 py-1.5 rounded-lg border border-border/40 ml-1">
                                Assign this discovery to one or more lists to save it permanently.
                            </p>
                        )}

                        <Field label="Assign to Lists">
                            <div className="flex flex-wrap gap-2 max-h-40 overflow-y-auto p-1 scrollbar-thin scrollbar-thumb-muted-foreground/10">
                                {lists.map(list => (
                                    <button
                                        key={list.id}
                                        type="button"
                                        onClick={() => {
                                            setFormData(prev => ({
                                                ...prev,
                                                list_ids: prev.list_ids.includes(list.id)
                                                    ? prev.list_ids.filter((id: string) => id !== list.id)
                                                    : [...prev.list_ids, list.id]
                                            }));
                                        }}
                                        className={cn(
                                            "px-3 py-1.5 rounded-lg text-xs font-medium border transition-all flex items-center gap-2",
                                            formData.list_ids.includes(list.id)
                                                ? "bg-blue-500/10 border-blue-500/40 text-blue-100"
                                                : "bg-muted/30 border-transparent text-muted-foreground hover:bg-muted/50"
                                        )}
                                    >
                                        {list.name}
                                        {formData.list_ids.includes(list.id) && <X className="h-3 w-3 text-blue-400" />}
                                    </button>
                                ))}
                            </div>
                        </Field>

                        <Field label="Tags (separated by comma)">
                            <Input
                                placeholder="e.g. founder, tech, priority"
                                value={formData.tags}
                                onChange={(e) => setFormData(prev => ({ ...prev, tags: e.target.value }))}
                            />
                        </Field>
                    </div>

                    {/* Metadata Section */}
                    <div className="space-y-4">
                        <div className="flex items-center justify-between ml-1">
                            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Custom Attributes</label>
                            <button
                                type="button"
                                onClick={handleAddMetadata}
                                className="text-[10px] text-foreground/70 hover:text-foreground transition-colors flex items-center gap-1 bg-muted px-2 py-1 rounded-lg border border-border/50"
                            >
                                <Plus className="h-3 w-3" />
                                Add Attribute
                            </button>
                        </div>
                        <div className="space-y-3">
                            {metadataItems.map((item, index) => (
                                <div key={index} className="flex gap-2 group animate-in slide-in-from-right-2 duration-300">
                                    <Input
                                        className="h-10 rounded-lg text-xs"
                                        placeholder="Key"
                                        value={item.key}
                                        onChange={(e) => handleMetadataChange(index, 'key', e.target.value)}
                                    />
                                    <Input
                                        className="h-10 rounded-lg text-xs"
                                        placeholder="Value"
                                        value={item.value}
                                        onChange={(e) => handleMetadataChange(index, 'value', e.target.value)}
                                    />
                                    <button
                                        type="button"
                                        onClick={() => handleRemoveMetadata(index)}
                                        className="p-2 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-lg transition-all opacity-0 group-hover:opacity-100 flex-shrink-0"
                                    >
                                        <Trash2 className="h-3.5 w-3.5" />
                                    </button>
                                </div>
                            ))}
                            {metadataItems.length === 0 && (
                                <div className="bg-muted/30 border border-dashed border-border rounded-xl p-6 text-center">
                                    <p className="text-[10px] text-muted-foreground italic">No custom data points defined.</p>
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                {/* Footer Actions */}
                <div className="p-6 border-t border-border bg-muted/10">
                    <Button
                        type="submit"
                        className={cn(
                            "w-full h-12 font-semibold rounded-xl shadow-sm border transition-all active:scale-[0.98]",
                            isCheckingDuplicate
                                ? "bg-muted text-muted-foreground border-border/50 cursor-not-allowed"
                                : "bg-secondary hover:bg-secondary/80 text-secondary-foreground border-border/20"
                        )}
                        disabled={isLoading || formData.list_ids.length === 0 || isCheckingDuplicate}
                    >
                        {isLoading ? (
                            <CircularLoader className="h-4 w-4" />
                        ) : (
                            target?.id.startsWith('virtual-') ? "Save Contact" : (target || stableTarget ? "Save Changes" : "Create Target")
                        )}
                    </Button>
                </div>
            </form>
        </div>
    );

    if (noAnimation) return content;

    return (
        <AnimatePresence>
            {open && (
                <motion.div
                    initial={{ width: 0, opacity: 0 }}
                    animate={{ width: 480, opacity: 1 }}
                    exit={{ width: 0, opacity: 0 }}
                    transition={{ duration: 0.2, ease: 'easeInOut' }}
                    className="h-full border-l border-border/20 bg-background shadow-[0_0_50px_-12px_rgba(0,0,0,0.5)] flex flex-col overflow-hidden shrink-0 relative z-40"
                >
                    {content}
                </motion.div>
            )}
        </AnimatePresence>
    );
}
