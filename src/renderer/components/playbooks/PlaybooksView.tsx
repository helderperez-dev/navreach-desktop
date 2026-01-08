import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { PlaybookListView } from './PlaybookListView';
import { PlaybookEditor } from './PlaybookEditor';
import { useAppStore } from '@/stores/app.store';
import { useChatStore } from '@/stores/chat.store';
import { useWorkspaceStore } from '@/stores/workspace.store';
import { Playbook } from '@/types/playbook';
import { playbookService } from '@/services/playbookService';
import { toast } from 'sonner';

export function PlaybooksView() {
    const [view, setView] = useState<'list' | 'editor'>('list');
    const [selectedPlaybookId, setSelectedPlaybookId] = useState<string | null>(null);
    const { setShowPlaybookBrowser } = useAppStore();

    const navigate = useNavigate();
    const [isLoading, setIsLoading] = useState(true);
    const [playbooks, setPlaybooks] = useState<Playbook[]>([]);
    const [importDialogOpen, setImportDialogOpen] = useState(false);
    const { currentWorkspace } = useWorkspaceStore();

    // Ensure browser is hidden when in list view
    useEffect(() => {
        if (view === 'list') {
            setShowPlaybookBrowser(false);
        }
    }, [view, setShowPlaybookBrowser]);

    useEffect(() => {
        loadPlaybooks();
    }, [currentWorkspace?.id]);

    async function loadPlaybooks() {
        if (!currentWorkspace?.id) return;
        setIsLoading(true);
        try {
            const data = await playbookService.getPlaybooks(currentWorkspace.id);
            setPlaybooks(data);
        } catch (error) {
            toast.error('Failed to load playbooks');
        } finally {
            setIsLoading(false);
        }
    }

    const handleCreate = () => {
        setSelectedPlaybookId(null);
        setView('editor');
    };

    const handleSelect = (id: string) => {
        setSelectedPlaybookId(id);
        setView('editor');
    };

    const handleBack = async () => {
        const { isStreaming, setIsStreaming } = useChatStore.getState();
        if (isStreaming) {
            console.log('[PlaybooksView] Leaving editor while playbook running. Stopping agent.');
            await window.api.ai.stop();
            setIsStreaming(false);
        }
        setSelectedPlaybookId(null);
        setView('list');
        setShowPlaybookBrowser(false);
        loadPlaybooks(); // Refresh list to reflect changes
    };

    const handleRefresh = () => {
        loadPlaybooks();
    };

    return (
        <div className="h-full w-full bg-background">
            {view === 'list' ? (
                <PlaybookListView
                    onCreate={handleCreate}
                    onSelect={handleSelect}
                    playbooks={playbooks}
                    loading={isLoading}
                    onRefresh={handleRefresh}
                />
            ) : (
                <PlaybookEditor playbookId={selectedPlaybookId} onBack={handleBack} />
            )}
        </div>
    );
}
