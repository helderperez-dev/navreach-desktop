
import { useState } from 'react';
import { PlaybookListView } from './PlaybookListView';
import { PlaybookEditor } from './PlaybookEditor';

export function PlaybooksView() {
    const [view, setView] = useState<'list' | 'editor'>('list');
    const [selectedPlaybookId, setSelectedPlaybookId] = useState<string | null>(null);

    const handleCreate = () => {
        setSelectedPlaybookId(null);
        setView('editor');
    };

    const handleSelect = (id: string) => {
        setSelectedPlaybookId(id);
        setView('editor');
    };

    const handleBack = () => {
        setSelectedPlaybookId(null);
        setView('list');
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
