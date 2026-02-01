
import React, { createContext, useContext, useState, ReactNode, useCallback } from 'react';
import { ConfirmationDialog } from '@/components/ui/ConfirmationDialog';

interface ConfirmationOptions {
    title: string;
    description?: string;
    confirmLabel?: string;
    cancelLabel?: string;
    variant?: 'default' | 'destructive';
}

interface ConfirmationContextType {
    confirm: (options: ConfirmationOptions) => Promise<boolean>;
}

const ConfirmationContext = createContext<ConfirmationContextType | undefined>(undefined);

export function ConfirmationProvider({ children }: { children: ReactNode }) {
    const [open, setOpen] = useState(false);
    const [options, setOptions] = useState<ConfirmationOptions>({
        title: 'Confirm Action',
        description: 'Are you sure you want to proceed?',
    });
    const [resolveRef, setResolveRef] = useState<((value: boolean) => void) | null>(null);

    const confirm = useCallback((newOptions: ConfirmationOptions): Promise<boolean> => {
        setOptions(newOptions);
        setOpen(true);
        return new Promise((resolve) => {
            setResolveRef(() => resolve);
        });
    }, []);

    const handleConfirm = useCallback(() => {
        if (resolveRef) {
            resolveRef(true);
            setResolveRef(null);
        }
    }, [resolveRef]);

    const handleCancel = useCallback(() => {
        if (resolveRef) {
            resolveRef(false);
            setResolveRef(null);
        }
    }, [resolveRef]);

    const handleOpenChange = useCallback((isOpen: boolean) => {
        setOpen(isOpen);
        if (!isOpen && resolveRef) {
            resolveRef(false);
            setResolveRef(null);
        }
    }, [resolveRef]);

    return (
        <ConfirmationContext.Provider value={{ confirm }}>
            {children}
            <ConfirmationDialog
                open={open}
                onOpenChange={handleOpenChange}
                title={options.title}
                description={options.description}
                confirmLabel={options.confirmLabel}
                cancelLabel={options.cancelLabel}
                variant={options.variant}
                onConfirm={handleConfirm}
            />
        </ConfirmationContext.Provider>
    );
}

export function useConfirmation() {
    const context = useContext(ConfirmationContext);
    if (!context) {
        throw new Error('useConfirmation must be used within a ConfirmationProvider');
    }
    return context;
}
