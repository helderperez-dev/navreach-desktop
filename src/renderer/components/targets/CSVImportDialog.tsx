import { useState, useRef, useEffect } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { X, Upload, FileText, AlertCircle, CheckCircle2, ChevronRight, LayoutGrid, Tag, Link as LinkIcon, Mail, User, Building2, FileText as FileIcon, Globe, Settings2, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useTargetsStore } from '@/stores/targets.store';
import { CreateTargetInput, TargetType } from '@/types/targets';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

interface CSVImportDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
}

type Step = 'upload' | 'mapping' | 'preview';

interface MappingSelection {
    column: string; // The CSV header name or '__none__' for constant
    constantValue: string;
}

const TARGET_FIELDS = [
    { key: 'name', label: 'Full Name', icon: User, required: true },
    { key: 'url', label: 'URL / Link', icon: LinkIcon, required: true },
    { key: 'email', label: 'Email Address', icon: Mail, required: false },
    { key: 'type', label: 'Target Type', icon: Building2, required: false },
    { key: 'tags', label: 'Tags', icon: Tag, required: false },
];

const SELECT_STYLES = "w-full bg-muted border border-border rounded-xl px-3 h-10 text-xs text-foreground outline-none focus:border-primary/50 hover:border-border/80 focus:bg-muted/80 transition-[border-color,background-color] duration-300 ease-in-out appearance-none cursor-pointer";
const INPUT_STYLES = "h-10 bg-muted border-border text-xs rounded-xl outline-none focus:border-primary/50 hover:border-border/80 focus:bg-muted/80 focus-visible:ring-0 focus-visible:ring-offset-0 transition-[border-color,background-color] duration-300 ease-in-out";

export function CSVImportDialog({ open, onOpenChange }: CSVImportDialogProps) {
    const { selectedListId, bulkAddTargets } = useTargetsStore();
    const [step, setStep] = useState<Step>('upload');
    const [file, setFile] = useState<File | null>(null);
    const [headers, setHeaders] = useState<string[]>([]);
    const [csvRows, setCsvRows] = useState<any[]>([]);
    const [mapping, setMapping] = useState<Record<string, MappingSelection>>({
        name: { column: '', constantValue: '' },
        url: { column: '', constantValue: '' },
        email: { column: '', constantValue: '' },
        type: { column: '', constantValue: 'profile' },
        tags: { column: '', constantValue: '' },
    });
    const [metadataMappings, setMetadataMappings] = useState<{ key: string, column: string, constantValue: string }[]>([]);

    const [isParsing, setIsParsing] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (!open) {
            setStep('upload');
            setFile(null);
            setHeaders([]);
            setCsvRows([]);
            setMapping({
                name: { column: '', constantValue: '' },
                url: { column: '', constantValue: '' },
                email: { column: '', constantValue: '' },
                type: { column: '', constantValue: 'profile' },
                tags: { column: '', constantValue: '' },
            });
            setMetadataMappings([]);
            setError(null);
        }
    }, [open]);

    const parseCsv = (text: string) => {
        const lines = text.split(/\r?\n/).filter(line => line.trim());
        if (lines.length === 0) return { headers: [], rows: [] };

        // Basic CSV parsing (handles quotes)
        const parseLine = (line: string) => {
            const result = [];
            let current = '';
            let inQuotes = false;
            for (let i = 0; i < line.length; i++) {
                const char = line[i];
                if (char === '"') {
                    inQuotes = !inQuotes;
                } else if (char === ',' && !inQuotes) {
                    result.push(current.trim());
                    current = '';
                } else {
                    current += char;
                }
            }
            result.push(current.trim());
            return result;
        };

        const headers = parseLine(lines[0]);
        const rows = lines.slice(1).map(line => {
            const values = parseLine(line);
            const row: any = {};
            headers.forEach((header, i) => {
                row[header] = values[i];
            });
            return row;
        });

        return { headers, rows };
    };

    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const selectedFile = e.target.files?.[0];
        if (selectedFile) {
            if (!selectedFile.name.endsWith('.csv')) {
                setError('Please select a valid CSV file');
                return;
            }

            try {
                const text = await selectedFile.text();
                const { headers, rows } = parseCsv(text);

                if (headers.length === 0) {
                    setError('The CSV file is empty or invalid.');
                    return;
                }

                setFile(selectedFile);
                setHeaders(headers);
                setCsvRows(rows);

                // Initial auto-mapping attempt
                const newMapping = { ...mapping };
                headers.forEach(h => {
                    const lowH = h.toLowerCase();
                    if (lowH.includes('name') || lowH === 'title' || lowH === 'fullName') newMapping.name.column = h;
                    if (lowH.includes('url') || lowH === 'link' || lowH === 'website' || lowH === 'profile') newMapping.url.column = h;
                    if (lowH.includes('email') || lowH === 'mail') newMapping.email.column = h;
                    if (lowH === 'type' || lowH === 'category') newMapping.type.column = h;
                    if (lowH === 'tags' || lowH === 'labels') newMapping.tags.column = h;
                });

                setMapping(newMapping);
                setStep('mapping');
                setError(null);
            } catch (err) {
                setError('Failed to read file');
            }
        }
    };

    const handleAddMetadataMapping = () => {
        setMetadataMappings([...metadataMappings, { key: '', column: '', constantValue: '' }]);
    };

    const handleRemoveMetadataMapping = (index: number) => {
        setMetadataMappings(metadataMappings.filter((_, i) => i !== index));
    };

    const handleMetadataMappingChange = (index: number, field: string, value: string) => {
        const newMappings = [...metadataMappings];
        (newMappings[index] as any)[field] = value;
        setMetadataMappings(newMappings);
    };

    const handleImport = async () => {
        if (!selectedListId || csvRows.length === 0) return;

        // Validation
        if (!mapping.name.column && !mapping.name.constantValue) {
            setError('Name mapping or constant value is required');
            return;
        }
        if (!mapping.url.column && !mapping.url.constantValue) {
            setError('URL mapping or constant value is required');
            return;
        }

        setIsParsing(true);
        try {
            const targets: CreateTargetInput[] = csvRows.map(row => {
                const getValue = (field: string) => {
                    const m = mapping[field];
                    return m.column && m.column !== '__constant__' ? row[m.column] : m.constantValue;
                };

                const tagsValue = getValue('tags') || '';
                const tags = typeof tagsValue === 'string'
                    ? tagsValue.split(',').map(t => t.trim()).filter(Boolean)
                    : [];

                const metadata: Record<string, any> = {};
                metadataMappings.forEach(m => {
                    if (m.key.trim()) {
                        metadata[m.key.trim()] = (m.column && m.column !== '__constant__' && m.column !== '') ? row[m.column] : m.constantValue;
                    }
                });

                return {
                    list_id: selectedListId,
                    name: getValue('name') || 'Unknown',
                    url: getValue('url') || '',
                    email: getValue('email') || null,
                    type: (getValue('type') as TargetType) || 'profile',
                    tags: tags,
                    metadata: metadata
                };
            }).filter(t => t.url);

            if (targets.length === 0) {
                throw new Error('No valid targets with URLs found in CSV');
            }

            await bulkAddTargets(targets);
            onOpenChange(false);
        } catch (err: any) {
            setError(err.message || 'Import failed');
        } finally {
            setIsParsing(false);
        }
    };

    return (
        <Dialog.Root open={open} onOpenChange={onOpenChange}>
            <Dialog.Portal>
                <Dialog.Overlay className="fixed inset-0 bg-black/40 backdrop-blur-[2px] z-50 animate-in fade-in duration-200" />
                <Dialog.Content className="fixed left-[50%] top-[50%] translate-x-[-50%] translate-y-[-50%] w-full max-w-3xl bg-popover border border-border pb-8 rounded-3xl shadow-2xl z-50 animate-in zoom-in-95 duration-200 flex flex-col max-h-[90vh]">
                    <div className="flex items-center justify-between p-8 border-b border-border">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-xl bg-muted flex items-center justify-center border border-border/50">
                                <Upload className="h-5 w-5 text-muted-foreground/70" />
                            </div>
                            <div>
                                <Dialog.Title className="text-xl font-semibold text-foreground">
                                    Import Targets
                                </Dialog.Title>
                                <p className="text-xs text-muted-foreground mt-0.5">Step {step === 'upload' ? '1' : '2'}: {step === 'upload' ? 'Upload CSV' : 'Map Columns'}</p>
                            </div>
                        </div>
                        <Dialog.Close asChild>
                            <Button variant="ghost" size="icon" className="h-10 w-10 hover:bg-muted rounded-full">
                                <X className="h-5 w-5 text-muted-foreground" />
                            </Button>
                        </Dialog.Close>
                    </div>

                    <div className="flex-1 overflow-y-auto p-8 scrollbar-thin scrollbar-thumb-muted-foreground/20 space-y-10">
                        {step === 'upload' && (
                            <div className="space-y-6">
                                <div
                                    onClick={() => fileInputRef.current?.click()}
                                    className="h-64 border-2 border-dashed border-border rounded-3xl flex flex-col items-center justify-center gap-4 cursor-pointer hover:bg-muted/50 hover:border-primary/20 transition-all group"
                                >
                                    <div className="w-16 h-16 rounded-2xl bg-muted flex items-center justify-center group-hover:scale-110 transition-transform">
                                        <FileIcon className="h-8 w-8 text-muted-foreground/30" />
                                    </div>
                                    <div className="text-center">
                                        <p className="text-sm font-medium text-foreground/80">Click to upload your CSV file</p>
                                        <p className="text-xs text-muted-foreground mt-2 max-w-[250px] mx-auto leading-relaxed">
                                            We'll help you map your columns to the right fields in the next step.
                                        </p>
                                    </div>
                                    <input
                                        type="file"
                                        ref={fileInputRef}
                                        className="hidden"
                                        accept=".csv"
                                        onChange={handleFileChange}
                                    />
                                </div>
                            </div>
                        )}

                        {step === 'mapping' && (
                            <div className="space-y-8 animate-in fade-in slide-in-from-bottom-2 duration-400">
                                <div className="bg-muted/30 border border-border/50 rounded-2xl p-4 flex gap-4">
                                    <Settings2 className="h-5 w-5 text-muted-foreground/70 flex-shrink-0 mt-0.5" />
                                    <div className="space-y-1">
                                        <p className="text-sm font-medium text-foreground">Field Mapping</p>
                                        <p className="text-xs text-muted-foreground/60">Select which CSV columns correspond to our required fields.</p>
                                    </div>
                                </div>

                                <div className="space-y-6">
                                    {TARGET_FIELDS.map((field) => (
                                        <div key={field.key} className="grid grid-cols-12 gap-4 items-center group">
                                            <div className="col-span-4 flex items-center gap-3">
                                                <div className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center group-hover:bg-muted/80 transition-colors">
                                                    <field.icon className="h-4 w-4 text-muted-foreground group-hover:text-foreground transition-colors" />
                                                </div>
                                                <div>
                                                    <p className="text-xs font-semibold text-foreground/60 uppercase tracking-wider">{field.label}</p>
                                                    {field.required && <span className="text-[9px] text-muted-foreground/40 uppercase font-bold">Required</span>}
                                                </div>
                                            </div>

                                            <div className="col-span-4">
                                                <select
                                                    className={SELECT_STYLES}
                                                    value={mapping[field.key].column}
                                                    onChange={(e) => setMapping(prev => ({
                                                        ...prev,
                                                        [field.key]: { ...prev[field.key], column: e.target.value }
                                                    }))}
                                                >
                                                    <option value="">-- No Column --</option>
                                                    {headers.map(h => (
                                                        <option key={h} value={h}>{h}</option>
                                                    ))}
                                                    <option value="__constant__">Use Fixed Value...</option>
                                                </select>
                                            </div>

                                            <div className="col-span-4">
                                                {(mapping[field.key].column === '__constant__' || !mapping[field.key].column) ? (
                                                    <Input
                                                        placeholder={field.key === 'type' ? 'profile' : 'Placeholder value...'}
                                                        className={cn(INPUT_STYLES, "px-3")}
                                                        value={mapping[field.key].constantValue}
                                                        onChange={(e) => setMapping(prev => ({
                                                            ...prev,
                                                            [field.key]: { ...prev[field.key], constantValue: e.target.value }
                                                        }))}
                                                    />
                                                ) : (
                                                    <div className="px-3 h-10 rounded-xl bg-muted/30 border border-border flex items-center text-[10px] text-muted-foreground italic truncate">
                                                        Sample: {csvRows[0]?.[mapping[field.key].column] || 'Empty'}
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    ))}
                                </div>

                                {/* Metadata Section */}
                                <div className="pt-6 border-t border-border space-y-6">
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-3">
                                            <div className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center">
                                                <LayoutGrid className="h-4 w-4 text-muted-foreground" />
                                            </div>
                                            <div>
                                                <p className="text-xs font-bold text-foreground/40 uppercase tracking-widest">Custom Attributes (Metadata)</p>
                                                <p className="text-[10px] text-muted-foreground">Map extra CSV columns to lead data points</p>
                                            </div>
                                        </div>
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            onClick={handleAddMetadataMapping}
                                            className="h-8 gap-2 border-border bg-muted text-muted-foreground hover:bg-muted/80 text-xs"
                                        >
                                            <Plus className="h-3 w-3" />
                                            Add Attribute
                                        </Button>
                                    </div>

                                    <div className="space-y-3">
                                        {metadataMappings.map((m, index) => (
                                            <div key={index} className="grid grid-cols-12 gap-3 group animate-in slide-in-from-right-2 duration-300 items-start">
                                                <div className="col-span-3">
                                                    <Input
                                                        placeholder="Key (e.g. Phone)"
                                                        className={cn(INPUT_STYLES, "h-9 px-3")}
                                                        value={m.key}
                                                        onChange={(e) => handleMetadataMappingChange(index, 'key', e.target.value)}
                                                    />
                                                </div>
                                                <div className="col-span-3">
                                                    <select
                                                        className={cn(SELECT_STYLES, "h-9 px-2")}
                                                        value={m.column}
                                                        onChange={(e) => handleMetadataMappingChange(index, 'column', e.target.value)}
                                                    >
                                                        <option value="">-- No Column --</option>
                                                        {headers.map(h => (
                                                            <option key={h} value={h}>{h}</option>
                                                        ))}
                                                        <option value="__constant__">Fixed Value...</option>
                                                    </select>
                                                </div>
                                                <div className="col-span-5">
                                                    {(m.column === '__constant__' || !m.column) ? (
                                                        <Input
                                                            placeholder="Placeholder..."
                                                            className={cn(INPUT_STYLES, "h-9 px-3")}
                                                            value={m.constantValue}
                                                            onChange={(e) => handleMetadataMappingChange(index, 'constantValue', e.target.value)}
                                                        />
                                                    ) : (
                                                        <div className="px-3 h-9 rounded-lg bg-muted border border-border flex items-center text-[10px] text-muted-foreground italic truncate">
                                                            Sample: {csvRows[0]?.[m.column] || 'Empty'}
                                                        </div>
                                                    )}
                                                </div>
                                                <div className="col-span-1 flex justify-end">
                                                    <button
                                                        onClick={() => handleRemoveMetadataMapping(index)}
                                                        className="p-2 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-lg transition-all"
                                                    >
                                                        <Trash2 className="h-4 w-4" />
                                                    </button>
                                                </div>
                                            </div>
                                        ))}

                                        {metadataMappings.length === 0 && (
                                            <div className="bg-muted border border-dashed border-border rounded-2xl p-6 text-center">
                                                <p className="text-xs text-muted-foreground italic">No custom attributes mapped yet.</p>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        )}

                        {error && (
                            <div className="mt-6 flex items-start gap-3 p-4 bg-destructive/10 border border-destructive/20 rounded-2xl text-destructive text-xs animate-in shake-x duration-500">
                                <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
                                <div>
                                    <p className="font-semibold">Import Error</p>
                                    <p className="mt-1 opacity-80">{error}</p>
                                </div>
                            </div>
                        )}
                    </div>

                    <div className="px-8 pt-4">
                        {step === 'mapping' && (
                            <div className="flex gap-3">
                                <Button
                                    variant="ghost"
                                    className="flex-1 h-12 text-muted-foreground hover:bg-muted rounded-2xl"
                                    onClick={() => setStep('upload')}
                                >
                                    Back
                                </Button>
                                <Button
                                    className="flex-[2] h-12 bg-primary hover:bg-primary/90 text-primary-foreground font-semibold rounded-2xl shadow-xl shadow-primary/20"
                                    disabled={isParsing || !mapping.name.column && !mapping.name.constantValue || !mapping.url.column && !mapping.url.constantValue}
                                    onClick={handleImport}
                                >
                                    {isParsing ? "Importing Targets..." : `Import ${csvRows.length} Targets`}
                                </Button>
                            </div>
                        )}
                    </div>
                </Dialog.Content>
            </Dialog.Portal>
        </Dialog.Root>
    );
}
