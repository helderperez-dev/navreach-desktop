
import { useEffect, useState, useRef } from 'react';
import { Plus, Search, MoreVertical, Play, Edit, Trash, X, Zap } from 'lucide-react';
import { format } from 'date-fns';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { playbookService } from '@/services/playbookService';
import { Playbook } from '@/types/playbook';
import { toast } from 'sonner';

interface PlaybookListViewProps {
    onCreate: () => void;
    onSelect: (id: string) => void;
}

export function PlaybookListView({ onCreate, onSelect }: PlaybookListViewProps) {
    const [playbooks, setPlaybooks] = useState<Playbook[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [isSearchExpanded, setIsSearchExpanded] = useState(false);
    const searchRef = useRef<HTMLInputElement>(null);

    const loadPlaybooks = async () => {
        try {
            setLoading(true);
            const data = await playbookService.getPlaybooks();
            setPlaybooks(data);
        } catch (error) {
            toast.error('Failed to load playbooks');
            console.error(error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadPlaybooks();
    }, []);

    const handleDelete = async (e: React.MouseEvent, id: string) => {
        e.stopPropagation();
        try {
            await playbookService.deletePlaybook(id);
            toast.success('Playbook deleted');
            loadPlaybooks();
        } catch (error) {
            toast.error('Failed to delete playbook');
        }
    };

    const handleExport = (e: React.MouseEvent, playbook: Playbook) => {
        e.stopPropagation();
        const exportData = {
            name: playbook.name,
            description: playbook.description,
            version: playbook.version,
            graph: playbook.graph,
            capabilities: playbook.capabilities,
            execution_defaults: playbook.execution_defaults
        };
        const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${playbook.name.toLowerCase().replace(/\s+/g, '_')}_v${playbook.version}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        toast.success('Playbook exported');
    }

    const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = async (event) => {
            try {
                const json = JSON.parse(event.target?.result as string);
                // Basic validation
                if (!json.graph || !json.capabilities) {
                    throw new Error('Invalid playbook format');
                }

                await playbookService.createPlaybook({
                    ...json,
                    name: `${json.name} (Imported)`,
                    visibility: 'private'
                });
                toast.success('Playbook imported');
                loadPlaybooks();
            } catch (error) {
                toast.error('Failed to import playbook');
                console.error(error);
            }
        };
        reader.readAsText(file);
        // Reset input
        e.target.value = '';
    }


    const filteredPlaybooks = playbooks.filter(p =>
        p.name.toLowerCase().includes(search.toLowerCase()) ||
        p.description?.toLowerCase().includes(search.toLowerCase())
    );

    return (
        <div className="flex flex-col h-full bg-background">
            {/* Header Section */}
            <div className="h-16 border-b border-border flex items-center justify-between px-6 bg-card/80 backdrop-blur-md sticky top-0 z-30">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center border border-primary/20">
                        <Play className="h-5 w-5 text-primary" />
                    </div>
                    <h1 className="text-lg font-semibold text-foreground tracking-tight">
                        Playbooks
                    </h1>
                </div>

                <div className="flex items-center gap-4">
                    <div className="flex items-center gap-1">
                        {/* Expanding Search Component */}
                        <div
                            className={cn(
                                "relative flex items-center transition-all duration-300 ease-in-out overflow-hidden h-9",
                                isSearchExpanded || search ? "w-64 bg-muted/40 rounded-xl border border-border/50" : "w-10"
                            )}
                        >
                            <Button
                                variant="ghost"
                                size="sm"
                                className={cn(
                                    "h-10 w-10 p-0 shrink-0 transition-colors rounded-xl focus-visible:ring-0 focus-visible:outline-none",
                                    (isSearchExpanded || search) ? "text-primary" : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                                )}
                                onClick={() => setIsSearchExpanded(!isSearchExpanded)}
                            >
                                <Search className="h-4 w-4" />
                            </Button>
                            <div className="relative flex-1 flex items-center min-w-0 pr-2">
                                <input
                                    ref={searchRef}
                                    placeholder="Search Playbooks..."
                                    className={cn(
                                        "bg-transparent border-none text-xs outline-none text-foreground placeholder:text-muted-foreground/50 transition-all duration-300 w-full focus:outline-none leading-none",
                                        isSearchExpanded || search ? "opacity-100 pl-1 pr-8" : "opacity-0 w-0 pointer-events-none"
                                    )}
                                    value={search}
                                    onChange={(e) => setSearch(e.target.value)}
                                    onFocus={() => setIsSearchExpanded(true)}
                                />
                                {search && (
                                    <button
                                        onClick={() => setSearch('')}
                                        className="absolute right-2 p-1 text-muted-foreground/30 hover:text-muted-foreground transition-colors"
                                    >
                                        <X className="h-3.5 w-3.5" />
                                    </button>
                                )}
                            </div>
                        </div>

                        <div className="relative">
                            <input
                                type="file"
                                id="import-playbook"
                                className="hidden"
                                accept=".json"
                                onChange={handleImport}
                            />
                            <Button
                                variant="ghost"
                                size="sm"
                                className="h-10 w-10 p-0 text-muted-foreground hover:text-foreground hover:bg-muted/50 rounded-xl transition-all"
                                onClick={() => document.getElementById('import-playbook')?.click()}
                                title="Import Playbook"
                            >
                                <Zap className="h-4 w-4" />
                            </Button>
                        </div>
                    </div>

                    <div className="w-[1px] h-4 bg-border mx-1" />

                    <Button
                        size="sm"
                        className="h-10 gap-2 bg-primary hover:bg-primary/90 text-primary-foreground rounded-xl px-5 transition-all active:scale-95 border border-border/50 font-semibold"
                        onClick={onCreate}
                    >
                        <Plus className="h-4 w-4" />
                        <span className="text-sm">New Playbook</span>
                    </Button>
                </div>
            </div>

            <div className="flex-1 overflow-auto p-6">
                {loading ? (
                    <div className="flex items-center justify-center h-full">
                        <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                    </div>
                ) : filteredPlaybooks.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-full text-center space-y-4">
                        <div className="p-4 rounded-full bg-muted">
                            <Play className="h-8 w-8 text-muted-foreground" />
                        </div>
                        <div>
                            <h3 className="text-lg font-medium">No playbooks found</h3>
                            <p className="text-sm text-muted-foreground max-w-sm mx-auto mt-1">
                                Get started by creating your first automation playbook or importing one.
                            </p>
                        </div>
                        <Button onClick={onCreate}>Create Playbook</Button>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {filteredPlaybooks.map((playbook) => (
                            <div
                                key={playbook.id}
                                className="group relative flex flex-col p-4 rounded-xl border border-border bg-card/60 backdrop-blur-sm hover:border-primary/50 hover:shadow-md hover:-translate-y-0.5 transition-all cursor-pointer"
                                onClick={() => onSelect(playbook.id)}
                            >
                                <div className="flex items-start justify-between mb-2">
                                    <div className="p-2 rounded-lg bg-primary/10 text-primary">
                                        <Play className="h-4 w-4" />
                                    </div>
                                    <DropdownMenu>
                                        <DropdownMenuTrigger asChild>
                                            <Button variant="ghost" size="icon" className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity">
                                                <MoreVertical className="h-4 w-4" />
                                            </Button>
                                        </DropdownMenuTrigger>
                                        <DropdownMenuContent align="end">
                                            <DropdownMenuItem onClick={(e) => handleExport(e, playbook)}>Export JSON</DropdownMenuItem>
                                            <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={(e) => handleDelete(e, playbook.id)}>
                                                <Trash className="h-4 w-4 mr-2" />
                                                Delete
                                            </DropdownMenuItem>
                                        </DropdownMenuContent>
                                    </DropdownMenu>
                                </div>

                                <h3 className="font-semibold truncate">{playbook.name}</h3>
                                <p className="text-sm text-muted-foreground line-clamp-2 mt-1 flex-1">
                                    {playbook.description || 'No description provided'}
                                </p>

                                <div className="flex items-center justify-between mt-4 text-xs text-muted-foreground border-t border-border/50 pt-3">
                                    <span>v{playbook.version}</span>
                                    <span>{format(new Date(playbook.updated_at), 'MMM d, yyyy')}</span>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
