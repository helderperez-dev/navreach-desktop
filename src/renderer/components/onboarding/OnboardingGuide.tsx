import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, ChevronRight, ChevronLeft, Zap, Target, Workflow, MessageSquare } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAppStore } from '@/stores/app.store';
import { useAuthStore } from '@/stores/auth.store';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';
import { CircularLoader } from '@/components/ui/CircularLoader';

interface Step {
    title: string;
    description: string;
    icon: React.ReactNode;
}

const steps: Step[] = [
    {
        title: "Welcome to Reavion",
        description: "Your AI-powered browser for growth and outreach.",
        icon: <Zap className="h-12 w-12 text-blue-400" />
    },
    {
        title: "AI Chat & Browser",
        description: "Describe the task. Reavion navigates the web and executes it for you step by step, in a real browser.",
        icon: <MessageSquare className="h-12 w-12 text-blue-400" />
    },
    {
        title: "Targets & Leads",
        description: "Save people that matter. Organize profiles into Target Lists and automate what happens next.",
        icon: <Target className="h-12 w-12 text-blue-400" />
    },
    {
        title: "Playbooks",
        description: "Run workflows on autopilot. Create repeatable automations and let Reavion handle them at scale.",
        icon: <Workflow className="h-12 w-12 text-blue-400" />
    }
];

export function OnboardingGuide() {
    const { showOnboarding, setShowOnboarding } = useAppStore();
    const { profile, fetchProfile } = useAuthStore();
    const [currentStep, setCurrentStep] = useState(0);
    const [isSaving, setIsSaving] = useState(false);

    useEffect(() => {
        if (profile && !profile.onboarding_completed) {
            const timer = setTimeout(() => setShowOnboarding(true), 1500);
            return () => clearTimeout(timer);
        }
    }, [profile, setShowOnboarding]);

    const handleComplete = async () => {
        if (!profile) {
            setShowOnboarding(false);
            return;
        }

        setIsSaving(true);
        try {
            const { error } = await supabase
                .from('profiles')
                .update({ onboarding_completed: true })
                .eq('id', profile.id);

            if (error) throw error;
            setShowOnboarding(false);
            await fetchProfile();
        } catch (error: any) {
            console.error('[Onboarding] Failed to save onboarding status:', error);
            toast.error('Failed to save progress. Please try again.');
        } finally {
            setIsSaving(false);
            setTimeout(() => setCurrentStep(0), 500);
        }
    };

    const handleNext = () => {
        if (currentStep < steps.length - 1) {
            setCurrentStep(prev => prev + 1);
        } else {
            handleComplete();
        }
    };

    const handleBack = () => {
        if (currentStep > 0) {
            setCurrentStep(prev => prev - 1);
        }
    };

    if (!showOnboarding) return null;

    const step = steps[currentStep];

    return (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm">
            <motion.div
                initial={{ opacity: 0, scale: 0.9, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                className="w-full max-w-lg h-[540px] bg-[#0A0C10] border border-blue-500/20 rounded-2xl shadow-[0_0_50px_-12px_rgba(59,130,246,0.5)] overflow-hidden relative flex flex-col"
            >
                {/* Space Horizon Shimmer Background */}
                <div className="absolute inset-0 pointer-events-none">
                    <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-blue-500/50 to-transparent" />
                    <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(59,130,246,0.1),transparent_70%)]" />
                </div>

                <button
                    onClick={handleComplete}
                    disabled={isSaving}
                    className="absolute top-4 right-4 p-1 rounded-full hover:bg-white/5 text-muted-foreground transition-colors disabled:opacity-50 z-10"
                >
                    <X className="h-5 w-5" />
                </button>

                <div className="p-8 flex flex-col items-center text-center flex-1">
                    <div className="flex-1 flex flex-col items-center justify-center w-full">
                        <AnimatePresence mode="wait">
                            <motion.div
                                key={currentStep}
                                initial={{ opacity: 0, scale: 0.8 }}
                                animate={{ opacity: 1, scale: 1 }}
                                exit={{ opacity: 0, scale: 0.8 }}
                                transition={{ duration: 0.3, ease: "easeOut" }}
                                className="mb-8 relative"
                            >
                                {/* Animated Glow/Shimmer Container */}
                                <motion.div
                                    animate={{
                                        boxShadow: ["0 0 20px rgba(59,130,246,0.2)", "0 0 40px rgba(59,130,246,0.4)", "0 0 20px rgba(59,130,246,0.2)"],
                                    }}
                                    transition={{ duration: 4, repeat: Infinity }}
                                    className="p-8 rounded-[2.5rem] bg-[#0F172A] border border-blue-500/10 relative overflow-hidden group"
                                >
                                    {/* Horizon Shimmer Effect */}
                                    <motion.div
                                        animate={{ x: [-150, 150] }}
                                        transition={{ duration: 3, repeat: Infinity, ease: "linear" }}
                                        className="absolute inset-0 bg-gradient-to-r from-transparent via-blue-400/10 to-transparent skew-x-12"
                                    />

                                    {/* Icon with Floating Animation */}
                                    <motion.div
                                        animate={{ y: [-2, 2, -2] }}
                                        transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
                                        className="relative z-10"
                                    >
                                        {step.icon}
                                    </motion.div>
                                </motion.div>

                                {/* Background "Horizon" Light */}
                                <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 w-24 h-4 bg-blue-500/20 blur-xl rounded-full" />
                            </motion.div>
                        </AnimatePresence>

                        <div className="min-h-[140px] flex flex-col items-center">
                            <AnimatePresence mode="wait">
                                <motion.div
                                    key={currentStep}
                                    initial={{ opacity: 0, x: 20 }}
                                    animate={{ opacity: 1, x: 0 }}
                                    exit={{ opacity: 0, x: -20 }}
                                    transition={{ duration: 0.3 }}
                                    className="space-y-4"
                                >
                                    <h2 className="text-2xl font-bold bg-gradient-to-b from-white to-white/70 bg-clip-text text-transparent">
                                        {step.title}
                                    </h2>
                                    <p className="text-blue-100/60 leading-relaxed max-w-[320px]">
                                        {step.description}
                                    </p>
                                </motion.div>
                            </AnimatePresence>
                        </div>
                    </div>

                    <div className="w-full mt-auto">
                        <div className="flex gap-1.5 justify-center mb-10">
                            {steps.map((_, i) => (
                                <div
                                    key={i}
                                    className={`h-1.5 rounded-full transition-all duration-500 ${i === currentStep ? 'w-8 bg-blue-500' : 'w-1.5 bg-blue-500/20'
                                        }`}
                                />
                            ))}
                        </div>

                        <div className={cn("flex items-center w-full", currentStep === 0 ? "justify-end" : "justify-between")}>
                            {currentStep > 0 && (
                                <Button
                                    variant="ghost"
                                    onClick={handleBack}
                                    disabled={isSaving}
                                    className="text-blue-100/40 hover:text-blue-100 hover:bg-white/5"
                                >
                                    <ChevronLeft className="mr-2 h-4 w-4" />
                                    Back
                                </Button>
                            )}

                            <Button
                                onClick={handleNext}
                                disabled={isSaving}
                                className="min-w-[120px] bg-blue-600 hover:bg-blue-500 shadow-[0_0_20px_rgba(37,99,235,0.3)] transition-all duration-300"
                            >
                                {currentStep === steps.length - 1 ? (
                                    isSaving ? <CircularLoader className="h-4 w-4 border-white/20 border-t-white" /> : 'Get Started'
                                ) : 'Next'}
                                {currentStep < steps.length - 1 && <ChevronRight className="ml-2 h-4 w-4" />}
                            </Button>
                        </div>
                    </div>
                </div>
            </motion.div>
        </div>
    );
}

// Helper function in case it's not imported or available globally
function cn(...classes: any[]) {
    return classes.filter(Boolean).join(' ');
}
