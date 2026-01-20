import { useState, useEffect } from 'react';
import { WifiOff, Wifi } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { CircularLoader } from './CircularLoader';

export function ConnectivityBanner() {
    const [isOnline, setIsOnline] = useState(navigator.onLine);
    const [showBackOnline, setShowBackOnline] = useState(false);

    useEffect(() => {
        const handleOnline = () => {
            setIsOnline(true);
            setShowBackOnline(true);
            // Hide the "Back online" message after 3 seconds
            const timer = setTimeout(() => setShowBackOnline(false), 3000);
            return () => clearTimeout(timer);
        };

        const handleOffline = () => {
            setIsOnline(false);
            setShowBackOnline(false);
        };

        window.addEventListener('online', handleOnline);
        window.addEventListener('offline', handleOffline);

        return () => {
            window.removeEventListener('online', handleOnline);
            window.removeEventListener('offline', handleOffline);
        };
    }, []);

    return (
        <AnimatePresence>
            {/* Offline Modal Overlay */}
            {!isOnline && (
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="fixed inset-0 z-[1000] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm"
                >
                    <motion.div
                        initial={{ scale: 0.9, opacity: 0, y: 20 }}
                        animate={{ scale: 1, opacity: 1, y: 0 }}
                        exit={{ scale: 0.9, opacity: 0, y: 20 }}
                        className="glass-panel w-full max-w-sm p-10 flex flex-col items-center text-center gap-8 rounded-[2.5rem]"
                    >
                        <div className="relative">
                            <motion.div
                                animate={{
                                    scale: [1, 1.2, 1],
                                    opacity: [0.5, 0.2, 0.5]
                                }}
                                transition={{
                                    duration: 2,
                                    repeat: Infinity,
                                    ease: "easeInOut"
                                }}
                                className="absolute inset-0 bg-destructive/20 rounded-full blur-xl"
                            />
                            <div className="relative bg-destructive/10 p-5 rounded-[2rem] border border-destructive/20">
                                <WifiOff className="h-12 w-12 text-destructive" />
                            </div>
                        </div>

                        <div className="space-y-3">
                            <h2 className="text-2xl font-bold tracking-tight">Connectivity Lost</h2>
                            <p className="text-sm text-muted-foreground leading-relaxed px-4">
                                Your internet connection was interrupted. We'll automatically reconnect once you're back online.
                            </p>
                        </div>

                        <div className="flex items-center gap-3 text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground/60 bg-muted/30 px-5 py-2.5 rounded-full border border-border/50">
                            <CircularLoader className="h-3.5 w-3.5 border-t-muted-foreground/40" />
                            Attempting to Reconnect
                        </div>
                    </motion.div>
                </motion.div>
            )}

            {/* Back Online Modal */}
            {showBackOnline && (
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="fixed inset-0 z-[1000] flex items-center justify-center p-4 pointer-events-none"
                >
                    <motion.div
                        initial={{ scale: 0.8, opacity: 0, y: 20 }}
                        animate={{ scale: 1, opacity: 1, y: 0 }}
                        exit={{ scale: 0.8, opacity: 0, y: 20 }}
                        className="glass-panel w-full max-w-sm p-10 flex flex-col items-center text-center gap-8 shadow-[0_0_50px_-12px_rgba(16,185,129,0.3)] border-emerald-500/20 rounded-[2.5rem]"
                    >
                        <div className="relative">
                            <motion.div
                                initial={{ scale: 0 }}
                                animate={{ scale: 1.5, opacity: 0 }}
                                transition={{ duration: 0.8 }}
                                className="absolute inset-0 bg-emerald-500 rounded-full blur-md"
                            />
                            <div className="relative bg-emerald-500/10 p-5 rounded-[2rem] border border-emerald-500/20">
                                <Wifi className="h-12 w-12 text-emerald-500" />
                            </div>
                        </div>

                        <div className="space-y-3">
                            <h2 className="text-2xl font-bold tracking-tight text-emerald-500">System Restored</h2>
                            <p className="text-sm text-muted-foreground px-4">
                                Your connection is stable. All systems are back online and ready.
                            </p>
                        </div>

                        <motion.div
                            initial={{ width: 0 }}
                            animate={{ width: "100%" }}
                            transition={{ duration: 3, ease: "linear" }}
                            className="h-1 bg-emerald-500/20 rounded-full overflow-hidden absolute bottom-0 left-0 right-0"
                        >
                            <div className="h-full bg-emerald-500" />
                        </motion.div>
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
    );
}
