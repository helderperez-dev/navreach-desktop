
import * as Dialog from '@radix-ui/react-dialog';
import { Button } from './button';
import { AlertCircle, X } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ConfirmationDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    title: string;
    description?: string;
    confirmLabel?: string;
    cancelLabel?: string;
    onConfirm: () => void;
    variant?: 'default' | 'destructive';
}

export function ConfirmationDialog({
    open,
    onOpenChange,
    title,
    description,
    confirmLabel = 'Confirm',
    cancelLabel = 'Cancel',
    onConfirm,
    variant = 'default'
}: ConfirmationDialogProps) {
    return (
        <Dialog.Root open={open} onOpenChange={onOpenChange}>
            <Dialog.Portal>
                <Dialog.Overlay className="fixed inset-0 bg-background/60 backdrop-blur-[2px] data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 z-[100]" />
                <Dialog.Content className="fixed left-[50%] top-[50%] z-[101] grid w-full max-w-[400px] translate-x-[-50%] translate-y-[-50%] gap-6 border bg-popover/95 p-8 shadow-2xl duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[state=closed]:slide-out-to-left-1/2 data-[state=closed]:slide-out-to-top-[48%] data-[state=open]:slide-in-from-left-1/2 data-[state=open]:slide-in-from-top-[48%] rounded-[2rem] backdrop-blur-xl">

                    <div className="flex flex-col items-center text-center space-y-4">
                        <div className={cn(
                            "w-14 h-14 rounded-2xl flex items-center justify-center border",
                            variant === 'destructive'
                                ? "bg-red-500/10 border-red-500/20 text-red-500"
                                : "bg-primary/10 border-primary/20 text-primary"
                        )}>
                            <AlertCircle className="w-7 h-7" />
                        </div>

                        <div className="space-y-2">
                            <Dialog.Title className="text-xl font-bold tracking-tight text-foreground">
                                {title}
                            </Dialog.Title>
                            {description && (
                                <Dialog.Description className="text-sm text-muted-foreground leading-relaxed px-2">
                                    {description}
                                </Dialog.Description>
                            )}
                        </div>
                    </div>

                    <div className="flex flex-col sm:flex-row gap-3 mt-4">
                        <Dialog.Close asChild>
                            <Button
                                variant="ghost"
                                className="flex-1 h-12 rounded-2xl font-medium hover:bg-muted transition-colors order-2 sm:order-1"
                            >
                                {cancelLabel}
                            </Button>
                        </Dialog.Close>
                        <Button
                            variant={variant === 'destructive' ? 'destructive' : 'default'}
                            className={cn(
                                "flex-1 h-12 rounded-2xl font-bold shadow-lg order-1 sm:order-2",
                                variant === 'destructive'
                                    ? "bg-red-500 hover:bg-red-600 text-white shadow-red-500/20"
                                    : "bg-primary hover:bg-primary/90 shadow-primary/20"
                            )}
                            onClick={() => {
                                onConfirm();
                                onOpenChange(false);
                            }}
                        >
                            {confirmLabel}
                        </Button>
                    </div>

                    <Dialog.Close asChild>
                        <button className="absolute right-6 top-6 rounded-full p-2 opacity-40 transition-opacity hover:opacity-100 hover:bg-muted">
                            <X className="h-4 w-4" />
                            <span className="sr-only">Close</span>
                        </button>
                    </Dialog.Close>
                </Dialog.Content>
            </Dialog.Portal>
        </Dialog.Root>
    );
}
