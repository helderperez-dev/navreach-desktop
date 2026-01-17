import { motion, AnimatePresence } from 'framer-motion';
import { Check, Zap, X, Star, Shield, Tag } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { useBillingStore } from '@/stores/billing.store';
import { toast } from 'sonner';
import { useState } from 'react';
import { Input } from '@/components/ui/input';

interface UpgradeModalProps {
    isOpen: boolean;
    onClose: () => void;
    title?: string;
    description?: string;
}

export function UpgradeModal({
    isOpen,
    onClose,
    title = "Level up to Pro",
    description = "You've hit a limit on your Free plan. Upgrade now to unlock unlimited potential."
}: UpgradeModalProps) {
    const { initiateSubscription, isLoading } = useBillingStore();
    const [promoCode, setPromoCode] = useState('');
    const [showPromo, setShowPromo] = useState(false);

    const handleUpgrade = async () => {
        try {
            await initiateSubscription(undefined, promoCode);
            // Close this modal now that the payment flow is ready
            onClose();
        } catch (error: any) {
            // Strip generic IPC error prefixes for cleaner toast display
            const cleanMessage = (error.message || "")
                .replace(/^Error: /, '')
                .replace(/^Error invoking remote method '.*': Error: /, '')
                .replace(/^StripeInvalidRequestError: /, '');

            toast.error(cleanMessage || "Failed to start checkout", {
                description: "Review your code or try again without one.",
                duration: 5000
            });
        }
    };

    const features = [
        { icon: <Zap className="h-4 w-4 text-blue-500" />, text: "Unlimited AI Actions", desc: "No daily caps on automation" },
        { icon: <Shield className="h-4 w-4 text-sky-500" />, text: "Unlimited Workspaces", desc: "Scale for multiple clients" },
        { icon: <Zap className="h-4 w-4 text-indigo-400" />, text: "Priority Execution", desc: "Faster agent processing" },
        { icon: <Star className="h-4 w-4 text-blue-400" />, text: "Advanced Playbooks", desc: "Access to premium templates" },
    ];

    return (
        <AnimatePresence>
            {isOpen && (
                <>
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 bg-background/80 backdrop-blur-sm z-[100]"
                        onClick={onClose}
                    />
                    <div className="fixed inset-0 flex items-center justify-center z-[101] p-4 pointer-events-none">
                        <motion.div
                            initial={{ opacity: 0, scale: 0.9, y: 40 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.95, y: 20 }}
                            transition={{
                                type: "spring",
                                damping: 25,
                                stiffness: 300,
                                mass: 0.8
                            }}
                            className="w-full max-w-lg pointer-events-auto"
                        >
                            <Card className="border-border/50 bg-card/95 shadow-2xl overflow-hidden backdrop-blur-md">
                                <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-blue-600 via-blue-400 to-sky-300" />

                                <button
                                    onClick={onClose}
                                    className="absolute top-4 right-4 p-1 rounded-full hover:bg-muted transition-colors z-10 focus:outline-none"
                                >
                                    <X className="h-4 w-4 text-muted-foreground" />
                                </button>

                                <div className="p-8 pb-0 text-center">
                                    <motion.div
                                        initial={{ scale: 0.5, opacity: 0 }}
                                        animate={{ scale: 1, opacity: 1 }}
                                        transition={{ delay: 0.2, type: "spring" }}
                                        className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-blue-500/10 mb-6 shadow-inner"
                                    >
                                        <Zap className="h-6 w-6 text-blue-500 fill-current" />
                                    </motion.div>
                                    <motion.h2
                                        initial={{ opacity: 0, y: 10 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        transition={{ delay: 0.3 }}
                                        className="text-2xl font-bold mb-2 tracking-tight"
                                    >
                                        {title}
                                    </motion.h2>
                                    <motion.p
                                        initial={{ opacity: 0, y: 10 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        transition={{ delay: 0.35 }}
                                        className="text-muted-foreground text-sm max-w-sm mx-auto"
                                    >
                                        {description}
                                    </motion.p>
                                </div>

                                <CardContent className="p-8 pt-6">
                                    <div className="grid gap-3 mb-8">
                                        {features.map((f, i) => (
                                            <motion.div
                                                key={i}
                                                initial={{ opacity: 0, x: -10 }}
                                                animate={{ opacity: 1, x: 0 }}
                                                transition={{ delay: 0.4 + (i * 0.1) }}
                                                className="flex items-start gap-4 p-3 rounded-xl hover:bg-muted/50 transition-colors group/item"
                                            >
                                                <div className="mt-0.5">{f.icon}</div>
                                                <div className="flex-1">
                                                    <div className="text-sm font-semibold">{f.text}</div>
                                                    <div className="text-xs text-muted-foreground mt-0.5">{f.desc}</div>
                                                </div>
                                                <Check className="h-4 w-4 text-blue-500/60 ml-auto mt-0.5 opacity-0 group-hover/item:opacity-100 transition-opacity" />
                                            </motion.div>
                                        ))}
                                    </div>

                                    {/* Discount Code Section */}
                                    <div className="mb-8 px-2">
                                        {!showPromo ? (
                                            <button
                                                onClick={() => setShowPromo(true)}
                                                className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1.5 transition-colors group"
                                            >
                                                <Tag className="h-3 w-3 group-hover:rotate-12 transition-transform text-muted-foreground/60" />
                                                Have a discount code?
                                            </button>
                                        ) : (
                                            <motion.div
                                                initial={{ opacity: 0, height: 0 }}
                                                animate={{ opacity: 1, height: 'auto' }}
                                                className="space-y-2"
                                            >
                                                <div className="flex items-center justify-between">
                                                    <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-widest">Discount Code</label>
                                                    <button onClick={() => { setShowPromo(false); setPromoCode(''); }} className="text-[10px] text-muted-foreground hover:text-destructive transition-colors">Discard</button>
                                                </div>
                                                <div className="relative">
                                                    <Tag className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground/50" />
                                                    <Input
                                                        value={promoCode}
                                                        onChange={(e) => setPromoCode(e.target.value.toUpperCase())}
                                                        placeholder="PROMO20"
                                                        className="pl-9 h-11 bg-muted/30 border-border/50 focus:border-blue-500/50 transition-all font-mono tracking-wider text-sm"
                                                    />
                                                </div>
                                            </motion.div>
                                        )}
                                    </div>

                                    <motion.div
                                        initial={{ opacity: 0, y: 20 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        transition={{ delay: 0.8 }}
                                        className="flex flex-col gap-3"
                                    >
                                        <Button
                                            onClick={handleUpgrade}
                                            disabled={isLoading}
                                            className="w-full h-12 text-base font-semibold bg-blue-600 hover:bg-blue-500 shadow-lg shadow-blue-500/20 transition-all active:scale-[0.98]"
                                        >
                                            {isLoading ? "Starting Checkout..." : "Upgrade Now - $49.99/mo"}
                                            {!isLoading && <Zap className="ml-2 h-4 w-4 fill-current" />}
                                        </Button>
                                        <p className="text-[10px] text-center text-muted-foreground">
                                            Cancel anytime. Premium support included.
                                        </p>
                                    </motion.div>
                                </CardContent>
                            </Card>
                        </motion.div>
                    </div>
                </>
            )}
        </AnimatePresence>
    );
}
