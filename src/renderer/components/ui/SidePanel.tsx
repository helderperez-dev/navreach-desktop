
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';

interface SidePanelProps {
    isOpen: boolean;
    onClose: () => void;
    children: React.ReactNode;
    className?: string; // for width etc.
    side?: 'right' | 'left';
    title?: string;
    description?: string;
}

export function SidePanel({ isOpen, onClose, children, className, side = 'right', title, description }: SidePanelProps) {
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        setMounted(true);
        return () => setMounted(false);
    }, []);

    // Prevent body scroll when open
    useEffect(() => {
        if (isOpen) {
            document.body.style.overflow = 'hidden';
        } else {
            document.body.style.overflow = '';
        }
        return () => {
            document.body.style.overflow = '';
        };
    }, [isOpen]);

    if (!mounted) return null;

    return createPortal(
        <AnimatePresence>
            {isOpen && (
                <>
                    {/* Backdrop */}
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        className="fixed inset-0 bg-black/40 backdrop-blur-[2px] z-[100]"
                        onClick={onClose}
                    />
                    {/* Panel */}
                    <motion.div
                        initial={{ x: side === 'right' ? '100%' : '-100%' }}
                        animate={{ x: 0 }}
                        exit={{ x: side === 'right' ? '100%' : '-100%' }}
                        transition={{ type: 'spring', damping: 25, stiffness: 200 }}
                        className={cn(
                            "fixed top-0 bottom-0 bg-background shadow-2xl z-[101] flex flex-col overflow-hidden border-l border-border/20 p-6 gap-4",
                            side === 'right' ? "right-0" : "left-0",
                            className
                        )}
                    >
                        {/* Close Button */}
                        <button
                            onClick={onClose}
                            className="absolute right-4 top-4 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none data-[state=open]:bg-secondary"
                        >
                            <X className="h-4 w-4" />
                            <span className="sr-only">Close</span>
                        </button>

                        {(title || description) && (
                            <div className="flex flex-col space-y-2 text-center sm:text-left">
                                {title && <h2 className="text-lg font-semibold text-foreground">{title}</h2>}
                                {description && <p className="text-sm text-muted-foreground">{description}</p>}
                            </div>
                        )}

                        {children}
                    </motion.div>
                </>
            )}
        </AnimatePresence>,
        document.body
    );
}

// Subcomponents for structure consistency if needed, 
// strictly mimicking SheetHeader/Footer to minimize refactor friction
export function SidePanelHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
    return (
        <div
            className={cn("flex flex-col space-y-2 text-center sm:text-left", className)}
            {...props}
        />
    )
}

export function SidePanelFooter({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
    return (
        <div
            className={cn("flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2", className)}
            {...props}
        />
    )
}

export function SidePanelTitle({ className, ...props }: React.HTMLAttributes<HTMLHeadingElement>) {
    return (
        <h2
            className={cn("text-lg font-semibold text-foreground", className)}
            {...props}
        />
    )
}

export function SidePanelDescription({ className, ...props }: React.HTMLAttributes<HTMLParagraphElement>) {
    return (
        <p
            className={cn("text-sm text-muted-foreground", className)}
            {...props}
        />
    )
}
