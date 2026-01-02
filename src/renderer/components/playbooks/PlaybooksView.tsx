import { useState, useEffect } from 'react';
import { PlaybookListView } from './PlaybookListView';
import { PlaybookEditor } from './PlaybookEditor';
import { useAppStore } from '@/stores/app.store';
import { useChatStore } from '@/stores/chat.store';

export function PlaybooksView() {
    const [view, setView] = useState<'list' | 'editor'>('list');
    const [selectedPlaybookId, setSelectedPlaybookId] = useState<string | null>(null);
    const { setShowPlaybookBrowser } = useAppStore();

    // Ensure browser is hidden when in list view
    useEffect(() => {
        if (view === 'list') {
            setShowPlaybookBrowser(false);
        }
    }, [view, setShowPlaybookBrowser]);

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
    };

    return (
        <div className="h-full w-full bg-background">
            {view === 'list' ? (
                <PlaybookListView onCreate={handleCreate} onSelect={handleSelect} />
            ) : (
                <PlaybookEditor playbookId={selectedPlaybookId} onBack={handleBack} />
            )}
        </div>
    );
}
