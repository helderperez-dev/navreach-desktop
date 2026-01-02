import { useEffect, useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { X, Globe, User, Building2, FileText, Link as LinkIcon, Mail, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useTargetsStore } from '@/stores/targets.store';
import { TargetType, Target } from '@/types/targets';
import { cn } from '@/lib/utils';
import { Field } from '@/components/ui/field';

interface TargetDetailsDrawerProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    target?: Target | null;
}

const TARGET_TYPES: { value: TargetType, label: string, icon: any }[] = [
    { value: 'profile', label: 'Profile', icon: User },
    { value: 'company', label: 'Company', icon: Building2 },
    { value: 'post', label: 'Post', icon: FileText },
    { value: 'lead', label: 'Lead', icon: LinkIcon },
    { value: 'other', label: 'Other', icon: Globe },
];



export function TargetForm({ open, onOpenChange, target }: TargetDetailsDrawerProps) {
    const { selectedListId, addTarget, updateTarget } = useTargetsStore();
    const [isLoading, setIsLoading] = useState(false);
    const [formData, setFormData] = useState({
        name: '',
        url: '',
        email: '',
        type: 'profile' as TargetType,
        tags: '',
    });
    const [metadataItems, setMetadataItems] = useState<{ key: string, value: string }[]>([]);

    useEffect(() => {
        if (target) {
            setFormData({
                name: target.name,
                url: target.url,
                email: target.email || '',
                type: target.type,
                tags: target.tags?.join(', ') || '',
            });
            const metadata = target.metadata || {};
            setMetadataItems(Object.entries(metadata).map(([key, value]) => ({ key, value: String(value) })));
        } else {
            setFormData({ name: '', url: '', email: '', type: 'profile', tags: '' });
            setMetadataItems([]);
        }
    }, [target, open]);

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
        if (!selectedListId && !target) return;

        setIsLoading(true);
        try {
            const metadata = metadataItems.reduce((acc, item) => {
                if (item.key.trim()) {
                    acc[item.key.trim()] = item.value;
                }
                return acc;
            }, {} as Record<string, any>);

            const payload = {
                name: formData.name,
                url: formData.url,
                email: formData.email || null,
                type: formData.type,
                tags: formData.tags.split(',').map(t => t.trim()).filter(Boolean),
                metadata,
            };

            if (target) {
                await updateTarget(target.id, payload);
            } else {
                await addTarget({
                    ...payload,
                    list_id: selectedListId!,
                });
            }
            onOpenChange(false);
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <Dialog.Root open={open} onOpenChange={onOpenChange}>
            <Dialog.Portal>
                {/* Overlay with subtle blur */}
                <Dialog.Overlay className="fixed inset-0 bg-black/40 backdrop-blur-[2px] z-50 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=open]:fade-in-0 data-[state=closed]:fade-out-0 duration-300" />

                {/* Content - Positioned on the right side */}
                <Dialog.Content className="fixed right-0 top-0 h-full w-full max-w-[450px] bg-popover border-l border-border shadow-2xl z-50 flex flex-col data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=open]:slide-in-from-right data-[state=closed]:slide-out-to-right duration-300">
                    <div className="flex items-center justify-between p-6 border-b border-white/5">
                        <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center border border-border/50">
                                {target ? <Building2 className="h-4 w-4 text-foreground/70" /> : <Plus className="h-4 w-4 text-foreground/70" />}
                            </div>
                            <Dialog.Title className="text-lg font-semibold text-foreground">
                                {target ? "Target Details" : "Add Target"}
                            </Dialog.Title>
                        </div>
                        <Dialog.Close asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8 hover:bg-muted rounded-full text-muted-foreground">
                                <X className="h-4 w-4" />
                            </Button>
                        </Dialog.Close>
                    </div>

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
                                className="w-full h-12 bg-secondary hover:bg-secondary/80 text-secondary-foreground font-semibold rounded-xl shadow-sm border border-border/20 transition-all active:scale-[0.98]"
                                disabled={isLoading}
                            >
                                {isLoading ? (target ? "Saving..." : "Creating...") : (target ? "Save Changes" : "Create Target")}
                            </Button>
                        </div>
                    </form>
                </Dialog.Content>
            </Dialog.Portal>
        </Dialog.Root>
    );
}
