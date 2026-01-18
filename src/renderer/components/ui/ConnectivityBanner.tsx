import { useState, useEffect } from 'react';
import { WifiOff, AlertCircle, X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

export function ConnectivityBanner() {
    const [isOnline, setIsOnline] = useState(navigator.onLine);
    const [isVisible, setIsVisible] = useState(true);

    useEffect(() => {
        const handleOnline = () => {
            setIsOnline(true);
            // Automatically hide after a few seconds when back online
            setTimeout(() => setIsVisible(false), 3000);
        };
        const handleOffline = () => {
            setIsOnline(false);
            setIsVisible(true);
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
            {!isOnline && isVisible && (
                <motion.div
                    initial={{ y: -50, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    exit={{ y: -50, opacity: 0 }}
                    className="fixed top-14 left-1/2 -translate-x-1/2 z-[100] w-full max-w-md px-4 pointer-events-none"
                >
                    <div className="bg-destructive text-destructive-foreground px-4 py-3 rounded-lg shadow-lg flex items-center justify-between gap-3 border border-destructive-foreground/10 pointer-events-auto">
                        <div className="flex items-center gap-3">
                            <WifiOff className="h-5 w-5" />
                            <div className="flex flex-col">
                                <span className="text-sm font-semibold">You're offline</span>
                                <span className="text-[11px] opacity-90">Some features may be unavailable.</span>
                            </div>
                        </div>
                        <button
                            onClick={() => setIsVisible(false)}
                            className="p-1 hover:bg-white/10 rounded-md transition-colors"
                        >
                            <X className="h-4 w-4" />
                        </button>
                    </div>
                </motion.div>
            )}
            {isOnline && !isVisible && (
                <motion.div
                    initial={{ y: -50, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    exit={{ y: -50, opacity: 0 }}
                    className="fixed top-14 left-1/2 -translate-x-1/2 z-[100] w-full max-w-md px-4 pointer-events-none"
                >
                    <div className="bg-emerald-500 text-white px-4 py-3 rounded-lg shadow-lg flex items-center gap-3 border border-white/10 pointer-events-auto">
                        <AlertCircle className="h-5 w-5" />
                        <span className="text-sm font-semibold">Back online!</span>
                    </div>
                </motion.div>
            )}
        </AnimatePresence>
    );
}
