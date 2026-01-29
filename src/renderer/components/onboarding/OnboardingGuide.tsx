import React, { useState, useEffect } from 'react';
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
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/60 backdrop-blur-[12px]">
            <motion.div
                initial={{ opacity: 0, scale: 0.98, y: 10 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                className="w-full max-w-lg h-[540px] bg-white/[0.03] backdrop-blur-[32px] border border-white/10 rounded-3xl shadow-[0_20px_50px_rgba(0,0,0,0.5),inset_0_1px_1px_rgba(255,255,255,0.05)] overflow-hidden relative flex flex-col"
            >
                <button
                    onClick={handleComplete}
                    disabled={isSaving}
                    className="absolute top-5 right-5 w-9 h-9 flex items-center justify-center rounded-xl bg-white/[0.02] border border-white/0 hover:border-white/10 hover:bg-white/5 text-white/30 hover:text-white transition-all duration-300 disabled:opacity-50 z-20 group"
                    title="Dismiss"
                >
                    <X className="h-4 w-4 opacity-50 group-hover:opacity-100 transition-opacity" />
                </button>

                <div className="p-8 flex flex-col items-center text-center flex-1 z-10">
                    <div className="flex-1 flex flex-col items-center justify-center w-full">
                        <AnimatePresence mode="wait">
                            <motion.div
                                key={currentStep}
                                initial={{ opacity: 0, scale: 0.95 }}
                                animate={{ opacity: 1, scale: 1 }}
                                exit={{ opacity: 0, scale: 0.95 }}
                                transition={{ duration: 0.4, ease: [0.23, 1, 0.32, 1] }}
                                className="mb-10"
                            >
                                {/* Pure Liquid Glass Container for Icon */}
                                <div className="p-10 rounded-[2.5rem] bg-white/[0.02] border border-white/10 relative shadow-[inset_0_1px_1px_rgba(255,255,255,0.05)]">
                                    <div className="relative z-10">
                                        {React.cloneElement(step.icon as React.ReactElement, { className: "h-14 w-14 text-white/90 drop-shadow-[0_0_15px_rgba(255,255,255,0.2)]" })}
                                    </div>
                                </div>
                            </motion.div>
                        </AnimatePresence>

                        <div className="min-h-[160px] flex flex-col items-center">
                            <AnimatePresence mode="wait">
                                <motion.div
                                    key={currentStep}
                                    initial={{ opacity: 0, y: 10 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    exit={{ opacity: 0, y: -10 }}
                                    transition={{ duration: 0.4, ease: [0.23, 1, 0.32, 1] }}
                                    className="space-y-4"
                                >
                                    <h2 className="text-3xl font-medium tracking-tight bg-gradient-to-b from-white to-white/60 bg-clip-text text-transparent">
                                        {step.title}
                                    </h2>
                                    <p className="text-white/40 leading-relaxed max-w-[340px] text-[15px]">
                                        {step.description}
                                    </p>
                                </motion.div>
                            </AnimatePresence>
                        </div>
                    </div>

                    <div className="w-full mt-auto">
                        <div className="flex gap-2 justify-center mb-12">
                            {steps.map((_, i) => (
                                <motion.div
                                    key={i}
                                    initial={false}
                                    animate={{
                                        width: i === currentStep ? 24 : 6,
                                        backgroundColor: i === currentStep ? "rgba(255, 255, 255, 0.8)" : "rgba(255, 255, 255, 0.1)"
                                    }}
                                    className="h-1.5 rounded-full"
                                />
                            ))}
                        </div>

                        <div className={cn("flex items-center w-full", currentStep === 0 ? "justify-end" : "justify-between")}>
                            {currentStep > 0 && (
                                <Button
                                    variant="ghost"
                                    onClick={handleBack}
                                    disabled={isSaving}
                                    className="text-white/30 hover:text-white hover:bg-white/5 rounded-xl px-6"
                                >
                                    <ChevronLeft className="mr-2 h-4 w-4" />
                                    Back
                                </Button>
                            )}

                            <Button
                                onClick={handleNext}
                                disabled={isSaving}
                                className="min-w-[140px] h-11 bg-white/[0.08] hover:bg-white/[0.12] text-white border border-white/10 rounded-xl shadow-[0_10px_30px_rgba(0,0,0,0.3)] backdrop-blur-md transition-all duration-300"
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
