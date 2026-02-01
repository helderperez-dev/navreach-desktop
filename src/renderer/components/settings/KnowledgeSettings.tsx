import { useState, useEffect } from 'react';
import { Pencil, Trash2, Check, X, BrainCircuit, Globe, Code, User, FileText, Target, Plus, Database, ChevronRight, Folder, MoreHorizontal } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { PlatformKnowledge, KnowledgeBase, KnowledgeContent } from '@shared/types';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger, SheetDescription, SheetFooter } from '@/components/ui/sheet';
import { SidePanel, SidePanelHeader, SidePanelTitle, SidePanelDescription, SidePanelFooter } from '@/components/ui/SidePanel';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { CircularLoader } from '@/components/ui/CircularLoader';
import { useAuthStore } from '@/stores/auth.store';

import { knowledgeService } from '@/services/knowledgeService';
import { useConfirmation } from '@/providers/ConfirmationProvider';


export function KnowledgeSettings() {
    const { confirm } = useConfirmation();
    const [activeTab, setActiveTab] = useState("dynamic");

    const [isLoading, setIsLoading] = useState(true);

    // Element Library State
    const [elements, setElements] = useState<PlatformKnowledge[]>([]);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [elementFormData, setElementFormData] = useState<Partial<PlatformKnowledge>>({
        domain: '',
        url: '',
        selector: '',
        instruction: '',
        is_active: true,
    });

    // Dynamic Knowledge Bases State
    const [kbs, setKbs] = useState<KnowledgeBase[]>([]);
    const [selectedKb, setSelectedKb] = useState<KnowledgeBase | null>(null);
    const [kbContent, setKbContent] = useState<KnowledgeContent[]>([]);
    const [isAddingKb, setIsAddingKb] = useState(false);
    const [newKbName, setNewKbName] = useState('');
    const [isEditingKb, setIsEditingKb] = useState(false); // New state for editing dialog
    const [editingKbId, setEditingKbId] = useState<string | null>(null); // New state for tracking KB being edited
    const [editKbName, setEditKbName] = useState(''); // New state for edited name

    const [isAddingContent, setIsAddingContent] = useState(false);
    const [newContent, setNewContent] = useState('');
    const [newContentTitle, setNewContentTitle] = useState('');

    const [isContentLoading, setIsContentLoading] = useState(false);

    // Content Editing State
    const [isEditingContent, setIsEditingContent] = useState(false);
    const [editingContentId, setEditingContentId] = useState<string | null>(null);
    const [editContentTitle, setEditContentTitle] = useState('');
    const [editContentText, setEditContentText] = useState('');

    const loadAllData = async () => {
        try {
            setIsLoading(true);
            const [knowledgeData, kbsData] = await Promise.all([
                knowledgeService.getPlatformKnowledge(),
                knowledgeService.getKnowledgeBases()
            ]);
            setElements(knowledgeData || []);
            setKbs(kbsData || []);
        } catch (error) {
            console.error('Failed to load knowledge:', error);
            toast.error('Failed to load knowledge base');
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        loadAllData();
    }, []);

    useEffect(() => {
        if (selectedKb) {
            loadKbContent(selectedKb.id);
        }
    }, [selectedKb]);

    const loadKbContent = async (kbId: string) => {
        try {
            setIsContentLoading(true);
            const data = await knowledgeService.getKBContent(kbId);
            setKbContent(data || []);
        } catch (error) {
            console.error(error);
            toast.error('Failed to load content');
        } finally {
            setIsContentLoading(false);
        }
    };

    // --- Element Library Handlers ---
    const handleEditElement = (item: PlatformKnowledge) => {
        setEditingId(item.id);
        setElementFormData(item);
    };

    const handleDeleteElement = async (id: string) => {
        const confirmed = await confirm({
            title: 'Delete Mapping',
            description: 'Are you sure you want to delete this element mapping?',
            confirmLabel: 'Delete',
            variant: 'destructive'
        });

        if (!confirmed) return;

        try {
            await knowledgeService.deletePlatformKnowledge(id);
            setElements(prev => prev.filter(item => item.id !== id));
            toast.success('Element deleted');
        } catch (error) {
            toast.error('Failed to delete element');
        }
    };


    const handleSaveElement = async () => {
        if (!elementFormData.domain || !elementFormData.selector) {
            toast.error('Domain and Selector are required');
            return;
        }
        try {
            if (editingId) {
                const data = await knowledgeService.updatePlatformKnowledge({ ...elementFormData, id: editingId, updated_at: new Date().toISOString() });
                setElements(prev => prev.map(item => item.id === editingId ? (data || item) : item));
                toast.success('Element updated');
            }
            setEditingId(null);
            setElementFormData({ domain: '', url: '', selector: '', instruction: '', is_active: true });
        } catch (error) {
            toast.error('Failed to save element');
        }
    };

    // --- Dynamic KB Handlers ---
    const handleCreateKb = async () => {
        if (!newKbName) return;
        try {
            const data = await knowledgeService.createKnowledgeBase(newKbName);
            setKbs(prev => [...prev, data]);
            setNewKbName('');
            setIsAddingKb(false);
            toast.success('Knowledge base created');
        } catch (error) {
            toast.error('Failed to create KB');
        }
    };

    const handleDeleteKb = async (id: string, e: React.MouseEvent) => {
        e.stopPropagation();

        const confirmed = await confirm({
            title: 'Delete Knowledge Base',
            description: 'Are you sure you want to delete this knowledge base and all its content? This action cannot be undone.',
            confirmLabel: 'Delete',
            variant: 'destructive'
        });

        if (!confirmed) return;

        try {
            await knowledgeService.deleteKnowledgeBase(id);
            setKbs(prev => prev.filter(k => k.id !== id));
            if (selectedKb?.id === id) setSelectedKb(null);
            toast.success('Knowledge base deleted');
        } catch (error) {
            toast.error('Failed to delete KB');
        }
    };


    const handleStartEditKb = (kb: KnowledgeBase, e: React.MouseEvent) => {
        e.stopPropagation();
        setEditingKbId(kb.id);
        setEditKbName(kb.name);
        setIsEditingKb(true);
    };

    const handleUpdateKb = async () => {
        if (!editingKbId || !editKbName) return;
        try {
            const data = await knowledgeService.updateKnowledgeBase(editingKbId, editKbName);
            setKbs(prev => prev.map(k => k.id === editingKbId ? data : k));
            if (selectedKb?.id === editingKbId) setSelectedKb(data);

            setIsEditingKb(false);
            setEditingKbId(null);
            setEditKbName('');
            toast.success('Knowledge base updated');
        } catch (error) {
            toast.error('Failed to update knowledge base');
        }
    };

    const handleAddContent = async () => {
        if (!selectedKb || !newContent) return;
        try {
            const data = await knowledgeService.addKBContent(selectedKb.id, newContent, newContentTitle);
            setKbContent(prev => [...prev, data]);
            setNewContent('');
            setNewContentTitle('');
            setIsAddingContent(false);
            toast.success('Content added');
        } catch (error) {
            toast.error('Failed to add content');
        }
    };

    const handleStartEditContent = (item: KnowledgeContent) => {
        setEditingContentId(item.id);
        setEditContentTitle(item.title || '');
        setEditContentText(item.content);
        setIsEditingContent(true);
    };

    const handleUpdateContent = async () => {
        if (!editingContentId || !editContentText) return;
        try {
            const data = await knowledgeService.updateKBContent(editingContentId, editContentText, editContentTitle);
            setKbContent(prev => prev.map(c => c.id === editingContentId ? data : c));
            setIsEditingContent(false);
            setEditingContentId(null);
            setEditContentTitle('');
            setEditContentText('');
            toast.success('Content updated');
        } catch (error) {
            toast.error('Failed to update content');
        }
    };

    const handleDeleteContent = async (id: string) => {
        const confirmed = await confirm({
            title: 'Delete Item',
            description: 'Are you sure you want to delete this knowledge item?',
            confirmLabel: 'Delete',
            variant: 'destructive'
        });

        if (!confirmed) return;

        try {
            await knowledgeService.deleteKBContent(id);
            setKbContent(prev => prev.filter(c => c.id !== id));
            toast.success('Content deleted');
        } catch (error) {
            toast.error('Failed to delete content');
        }
    };


    return (
        <div className="space-y-6 h-full flex flex-col">
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-xl font-semibold">Knowledge Base</h2>
                    <p className="text-sm text-muted-foreground mt-1">
                        Organize instructions and custom knowledge for your AI agent.
                    </p>
                </div>
            </div>

            {isLoading ? (
                <div className="flex-1 flex items-center justify-center">
                    <CircularLoader className="h-8 w-8 text-primary" />
                </div>
            ) : (
                <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col">
                    <TabsList className="grid w-full grid-cols-2 lg:w-[400px]">
                        <TabsTrigger value="dynamic" className="flex items-center gap-2">
                            <Database className="h-4 w-4" />
                            Knowledge Bases
                        </TabsTrigger>
                        <TabsTrigger value="elements" className="flex items-center gap-2">
                            <Target className="h-4 w-4" />
                            Element Library
                        </TabsTrigger>
                    </TabsList>

                    <TabsContent value="dynamic" className="mt-6 flex-1 flex flex-col gap-4 overflow-hidden">
                        {!selectedKb ? (
                            <div className="flex-1 space-y-4 overflow-y-auto">
                                <div className="flex justify-between items-center">
                                    <h3 className="text-sm font-medium text-muted-foreground">Custom Knowledge Bases</h3>
                                    <div className="flex gap-2">
                                        {/* Edit Dialog */}
                                        <Dialog open={isEditingKb} onOpenChange={setIsEditingKb}>
                                            <DialogContent>
                                                <DialogHeader><DialogTitle>Edit Knowledge Base</DialogTitle></DialogHeader>
                                                <div className="space-y-4 pt-2">
                                                    <Input placeholder="Name" value={editKbName} onChange={e => setEditKbName(e.target.value)} />
                                                    <Button className="w-full" onClick={handleUpdateKb}>Save Changes</Button>
                                                </div>
                                            </DialogContent>
                                        </Dialog>

                                        <Dialog open={isAddingKb} onOpenChange={setIsAddingKb}>
                                            <DialogTrigger asChild>
                                                <Button size="sm" variant="outline" className="gap-2">
                                                    <Plus className="h-4 w-4" /> New Base
                                                </Button>
                                            </DialogTrigger>
                                            <DialogContent>
                                                <DialogHeader><DialogTitle>Create Knowledge Base</DialogTitle></DialogHeader>
                                                <div className="space-y-4 pt-2">
                                                    <Input placeholder="Name (e.g., Company Identity)" value={newKbName} onChange={e => setNewKbName(e.target.value)} />
                                                    <Button className="w-full" onClick={handleCreateKb}>Create Base</Button>
                                                </div>
                                            </DialogContent>
                                        </Dialog>
                                    </div>
                                </div>
                                {kbs.length === 0 ? (
                                    <div className="flex-1 flex flex-col items-center justify-center p-12 border-2 border-dashed border-border/10 rounded-xl text-muted-foreground">
                                        <Database className="h-12 w-12 mb-4 opacity-20" />
                                        <p className="text-sm text-center">No knowledge bases yet. Create one to give your agent context about your company, persona, or specific strategies.</p>
                                    </div>
                                ) : (
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                        {kbs.map(kb => (
                                            <div
                                                key={kb.id}
                                                onClick={() => setSelectedKb(kb)}
                                                className="p-4 border border-border/10 rounded-xl bg-card hover:border-foreground/30 transition-all cursor-pointer group relative"
                                            >
                                                <div className="flex items-center gap-3">
                                                    <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center text-primary">
                                                        <Folder className="h-5 w-5" />
                                                    </div>
                                                    <div className="flex-1 min-w-0">
                                                        <h4 className="font-medium truncate">{kb.name}</h4>
                                                        <p className="text-xs text-muted-foreground">Dynamic Knowledge</p>
                                                    </div>
                                                    <div onClick={(e) => e.stopPropagation()} className="opacity-0 group-hover:opacity-100 transition-opacity">
                                                        <DropdownMenu>
                                                            <DropdownMenuTrigger asChild>
                                                                <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-foreground">
                                                                    <MoreHorizontal className="h-4 w-4" />
                                                                </Button>
                                                            </DropdownMenuTrigger>
                                                            <DropdownMenuContent align="end">
                                                                <DropdownMenuItem onClick={(e) => handleStartEditKb(kb, e)}>
                                                                    <Pencil className="h-3.5 w-3.5 mr-2" /> Edit
                                                                </DropdownMenuItem>
                                                                <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={(e) => handleDeleteKb(kb.id, e)}>
                                                                    <Trash2 className="h-3.5 w-3.5 mr-2" /> Delete
                                                                </DropdownMenuItem>
                                                            </DropdownMenuContent>
                                                        </DropdownMenu>
                                                    </div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        ) : (
                            <div className="flex-1 flex flex-col gap-4 overflow-hidden">
                                <div className="flex items-center gap-2">
                                    <Button variant="ghost" size="sm" onClick={() => setSelectedKb(null)} className="h-8 px-2">
                                        <ChevronRight className="h-4 w-4 rotate-180 mr-1" /> Back
                                    </Button>
                                    <div className="h-4 w-[1px] bg-border mx-2" />
                                    <h3 className="font-semibold text-lg">{selectedKb.name}</h3>

                                    {/* Edit Content SidePanel */}
                                    <SidePanel isOpen={isEditingContent} onClose={() => setIsEditingContent(false)} className="sm:max-w-xl w-full">
                                        <SidePanelHeader>
                                            <SidePanelTitle>Edit Knowledge Item</SidePanelTitle>
                                            <SidePanelDescription>Make changes to this knowledge item.</SidePanelDescription>
                                        </SidePanelHeader>
                                        <div className="flex-1 flex flex-col gap-4 overflow-hidden">
                                            <div className="space-y-1">
                                                <label className="text-xs font-medium text-muted-foreground ml-1">Title</label>
                                                <Input placeholder="Title" value={editContentTitle} onChange={e => setEditContentTitle(e.target.value)} />
                                            </div>
                                            <div className="space-y-1 flex-1 flex flex-col">
                                                <label className="text-xs font-medium text-muted-foreground ml-1">Content</label>
                                                <Textarea
                                                    placeholder="Content"
                                                    className="flex-1 resize-none font-mono text-sm leading-relaxed p-4"
                                                    value={editContentText}
                                                    onChange={e => setEditContentText(e.target.value)}
                                                />
                                            </div>
                                        </div>
                                        <SidePanelFooter>
                                            <Button className="w-full" onClick={handleUpdateContent}>Update Content</Button>
                                        </SidePanelFooter>
                                    </SidePanel>

                                    {/* Add Content Sheet */}
                                    {/* Add Content SidePanel */}
                                    <Button size="sm" className="ml-auto gap-2" onClick={() => setIsAddingContent(true)}>
                                        <Plus className="h-4 w-4" /> Add Item
                                    </Button>

                                    <SidePanel isOpen={isAddingContent} onClose={() => setIsAddingContent(false)} className="sm:max-w-xl w-full">
                                        <SidePanelHeader>
                                            <SidePanelTitle>Add Knowledge Item</SidePanelTitle>
                                            <SidePanelDescription>Add new information to {selectedKb.name}.</SidePanelDescription>
                                        </SidePanelHeader>
                                        <div className="flex-1 flex flex-col gap-4 overflow-hidden">
                                            <div className="space-y-1">
                                                <label className="text-xs font-medium text-muted-foreground ml-1">Title</label>
                                                <Input placeholder="Title (e.g., Company Vision)" value={newContentTitle} onChange={e => setNewContentTitle(e.target.value)} />
                                            </div>
                                            <div className="space-y-1 flex-1 flex flex-col">
                                                <label className="text-xs font-medium text-muted-foreground ml-1">Content</label>
                                                <Textarea
                                                    placeholder="Paste or type content here..."
                                                    className="flex-1 resize-none font-mono text-sm leading-relaxed p-4"
                                                    value={newContent}
                                                    onChange={e => setNewContent(e.target.value)}
                                                />
                                            </div>
                                        </div>
                                        <SidePanelFooter>
                                            <Button className="w-full" onClick={handleAddContent}>Save to {selectedKb.name}</Button>
                                        </SidePanelFooter>
                                    </SidePanel>
                                </div>
                                {isContentLoading ? (
                                    <div className="flex-1 flex items-center justify-center">
                                        <CircularLoader className="h-8 w-8 text-primary" />
                                    </div>
                                ) : (
                                    <div className="flex-1 overflow-y-auto space-y-3 pr-2 custom-scrollbar">
                                        {kbContent.map(item => (
                                            <div
                                                key={item.id}
                                                className="p-4 border border-border/10 rounded-lg bg-card/20 hover:bg-card/40 transition-colors cursor-pointer group"
                                                onClick={() => handleStartEditContent(item)}
                                            >
                                                <div className="flex justify-between items-center">
                                                    <div className="flex items-center gap-3">
                                                        <FileText className="h-4 w-4 text-primary/70" />
                                                        <h4 className="font-medium text-primary text-sm">{item.title || 'Untitled Knowledge'}</h4>
                                                    </div>
                                                    <div onClick={e => e.stopPropagation()}>
                                                        <DropdownMenu>
                                                            <DropdownMenuTrigger asChild>
                                                                <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-foreground opacity-0 group-hover:opacity-100 transition-opacity">
                                                                    <MoreHorizontal className="h-4 w-4" />
                                                                </Button>
                                                            </DropdownMenuTrigger>
                                                            <DropdownMenuContent align="end">
                                                                <DropdownMenuItem onClick={(e) => handleStartEditContent(item)}>
                                                                    <Pencil className="h-3.5 w-3.5 mr-2" /> Edit
                                                                </DropdownMenuItem>
                                                                <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={(e) => handleDeleteContent(item.id)}>
                                                                    <Trash2 className="h-3.5 w-3.5 mr-2" /> Delete
                                                                </DropdownMenuItem>
                                                            </DropdownMenuContent>
                                                        </DropdownMenu>
                                                    </div>
                                                </div>
                                                {/* Content is hidden, only shown on click/edit */}
                                            </div>
                                        ))}
                                        {kbContent.length === 0 && (
                                            <div className="text-center py-20 text-muted-foreground border-2 border-dashed border-border/10 rounded-xl">
                                                <p>This knowledge base is empty. Start adding information relevant to this category.</p>
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        )}
                    </TabsContent>

                    <TabsContent value="elements" className="mt-6 flex-1 overflow-y-auto pr-2 custom-scrollbar">
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="text-sm font-medium text-muted-foreground">Platform Specific Elements</h3>
                            {elements.length > 0 && <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full">{elements.length} mapped</span>}
                        </div>
                        {editingId && (
                            <div className="border border-border/10 rounded-lg p-5 space-y-4 bg-muted/20 mb-6 animate-in slide-in-from-top-2">
                                <div className="flex justify-between items-center mb-1">
                                    <span className="text-xs font-bold uppercase tracking-wider text-foreground">Editing Element Mapping</span>
                                    <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setEditingId(null)}><X className="h-4 w-4" /></Button>
                                </div>
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-1.5">
                                        <label className="text-xs font-medium text-muted-foreground ml-1">Domain</label>
                                        <Input value={elementFormData.domain || ''} onChange={e => setElementFormData(p => ({ ...p, domain: e.target.value }))} placeholder="e.g., linkedin.com" />
                                    </div>
                                    <div className="space-y-1.5">
                                        <label className="text-xs font-medium text-muted-foreground ml-1">Context URL (Optional)</label>
                                        <Input value={elementFormData.url || ''} onChange={e => setElementFormData(p => ({ ...p, url: e.target.value }))} placeholder="Specific page path" />
                                    </div>
                                </div>
                                <div className="space-y-1.5">
                                    <label className="text-xs font-medium text-muted-foreground ml-1">Action Type</label>
                                    <Input value={elementFormData.action || ''} onChange={e => setElementFormData(p => ({ ...p, action: e.target.value }))} placeholder="e.g., click, type, select" />
                                </div>
                                <div className="space-y-1.5">
                                    <label className="text-xs font-medium text-muted-foreground ml-1">CSS / ARIA Selector</label>
                                    <Input value={elementFormData.selector || ''} onChange={e => setElementFormData(p => ({ ...p, selector: e.target.value }))} placeholder="Selector captured by inspector" className="font-mono text-xs bg-black/20" />
                                </div>
                                <div className="space-y-1.5">
                                    <label className="text-xs font-medium text-muted-foreground ml-1">Special Instruction</label>
                                    <Textarea value={elementFormData.instruction || ''} onChange={e => setElementFormData(p => ({ ...p, instruction: e.target.value }))} placeholder="Tell the agent how to interact with this specific element..." rows={3} />
                                </div>
                                <div className="flex justify-end gap-3 pt-2">
                                    <Button variant="outline" size="sm" onClick={() => setEditingId(null)}>Discard</Button>
                                    <Button size="sm" onClick={handleSaveElement} className="gap-2">
                                        <Check className="h-4 w-4" /> Apply Changes
                                    </Button>
                                </div>
                            </div>
                        )}
                        <div className="space-y-4 pb-10">
                            {elements.length === 0 ? (
                                <div className="flex flex-col items-center justify-center p-12 border-2 border-dashed border-border/10 rounded-xl text-muted-foreground">
                                    <Code className="h-12 w-12 mb-4 opacity-20" />
                                    <p className="text-sm text-center">Use the Element Inspector in the browser to map complex UI elements and give the agent specific instructions on how to handle them.</p>
                                </div>
                            ) : (
                                elements.map(item => (
                                    <div key={item.id} className="p-4 border border-border/10 rounded-xl bg-card/20 hover:bg-card/40 transition-all group">
                                        <div className="flex items-start justify-between">
                                            <div className="space-y-1">
                                                <div className="flex items-center gap-2">
                                                    <Globe className="h-4 w-4 text-primary" />
                                                    <span className="font-bold text-sm">{item.domain}</span>
                                                    {item.url && <span className="text-[10px] bg-muted px-1.5 py-0.5 rounded text-muted-foreground">Path Match</span>}
                                                </div>
                                                <div className="text-[10px] font-mono bg-black/30 text-primary/80 px-2 py-1 rounded inline-block max-w-[400px] truncate">{item.selector}</div>
                                            </div>
                                            <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                                <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full" onClick={() => handleEditElement(item)}>
                                                    <Pencil className="h-4 w-4" />
                                                </Button>
                                                <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full text-destructive hover:bg-destructive/10" onClick={() => handleDeleteElement(item.id)}>
                                                    <Trash2 className="h-4 w-4" />
                                                </Button>
                                            </div>
                                        </div>
                                        {item.instruction && (
                                            <div className="mt-3 text-xs bg-muted/30 p-2.5 border-l-2 border-foreground/40 text-foreground/80 leading-relaxed italic">
                                                "{item.instruction}"
                                            </div>
                                        )}
                                    </div>
                                ))
                            )}
                        </div>
                    </TabsContent>
                </Tabs>
            )}
        </div>
    );
}
