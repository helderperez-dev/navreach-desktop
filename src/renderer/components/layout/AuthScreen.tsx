import { useState, useEffect } from 'react';
import { LogIn, Mail, Github, Chrome, ArrowRight, Minus, Square, X, Sun, Moon } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { CircularLoader } from '@/components/ui/CircularLoader';
import { useAuthStore } from '@/stores/auth.store';
import { useAppStore } from '@/stores/app.store';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import reavionLogo from '@assets/reavion-white-welcome.png';
import reavionLogoBlack from '@assets/reavion-black-welcome.png';

export function AuthScreen() {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [mode, setMode] = useState<'login' | 'signup'>('login');

    const { signInWithGoogle } = useAuthStore();
    const { theme, setTheme } = useAppStore();

    const handleEmailAuth = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsLoading(true);
        try {
            if (mode === 'login') {
                const { error } = await supabase.auth.signInWithPassword({ email, password });
                if (error) throw error;
            } else {
                const { error } = await supabase.auth.signUp({ email, password });
                if (error) throw error;
                toast.success('Check your email for the confirmation link');
            }
        } catch (error: any) {
            toast.error(error.message);
        } finally {
            setIsLoading(false);
        }
    };

    const [systemTheme, setSystemTheme] = useState<'light' | 'dark'>(
        window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
    );

    useEffect(() => {
        const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
        const handler = (e: MediaQueryListEvent) => setSystemTheme(e.matches ? 'dark' : 'light');
        mediaQuery.addEventListener('change', handler);
        return () => mediaQuery.removeEventListener('change', handler);
    }, []);

    const isActualDark = theme === 'dark' || (theme === 'system' && systemTheme === 'dark');

    const toggleTheme = () => {
        setTheme(isActualDark ? 'light' : 'dark');
    };

    const ThemeIcon = isActualDark ? Moon : Sun;

    const handleMinimize = () => (window as any).api.window.minimize();
    const handleMaximize = () => (window as any).api.window.maximize();
    const handleClose = () => (window as any).api.window.close();
    const isMac = navigator.userAgent.includes('Mac');

    return (
        <div className="flex flex-col h-screen w-screen overflow-hidden bg-white dark:bg-black transition-colors duration-700 relative">
            {/* Simple High Definition Gradient Background */}
            <div className="absolute inset-0 bg-gradient-to-b from-neutral-50 to-white dark:from-neutral-900/50 dark:to-black pointer-events-none transition-colors duration-700" />



            {/* Draggable Title Bar Area */}
            <div className="h-12 min-h-[48px] w-full flex items-center justify-end drag-region bg-transparent z-20 transition-colors group">
                <div className="flex items-center px-4 gap-2 no-drag">
                    <button
                        onClick={toggleTheme}
                        className="w-10 h-10 flex items-center justify-center rounded-xl text-black/20 hover:text-black hover:bg-black/5 dark:text-white/20 dark:hover:text-white dark:hover:bg-white/5 transition-all mr-1"
                        title={`Theme: ${theme}`}
                    >
                        <ThemeIcon className="w-4 h-4" />
                    </button>
                    {!isMac && (
                        <div className="flex items-center gap-1 opacity-40 group-hover:opacity-100 transition-opacity duration-300">
                            <button
                                onClick={handleMinimize}
                                className="w-8 h-8 flex items-center justify-center rounded-md text-black/60 hover:text-black hover:bg-black/5 dark:text-white/60 dark:hover:text-white dark:hover:bg-white/5 transition-all"
                            >
                                <Minus className="w-4 h-4" />
                            </button>
                            <button
                                onClick={handleMaximize}
                                className="w-8 h-8 flex items-center justify-center rounded-md text-black/60 hover:text-black dark:text-white/60 dark:hover:text-white hover:bg-black/5 dark:hover:bg-white/5 transition-all"
                            >
                                <Square className="w-3 h-3" />
                            </button>
                            <button
                                onClick={handleClose}
                                className="w-8 h-8 flex items-center justify-center rounded-md text-black/60 hover:text-red-500 dark:text-white/60 dark:hover:text-red-400 hover:bg-red-500/10 transition-all"
                            >
                                <X className="w-4 h-4" />
                            </button>
                        </div>
                    )}
                </div>
            </div>

            <div className="flex-1 flex flex-col items-center justify-center relative">
                <div
                    className="w-full max-w-md z-10 p-10 bg-white/40 dark:bg-black/40 backdrop-blur-2xl border border-black/[0.05] dark:border-white/10 rounded-[2.5rem]  border-t-black/[0.08] dark:border-t-white/10 mx-4 relative overflow-hidden"
                >
                    {/* Subtle Internal Edge Glow */}
                    <div className="absolute inset-0 rounded-[2.5rem] border border-black/[0.01] dark:border-white/[0.02] pointer-events-none" />

                    <div className="flex flex-col items-center mb-10">
                        <img
                            src={isActualDark ? reavionLogo : reavionLogoBlack}
                            alt="Reavion"
                            className="h-8 w-auto mb-12 select-none"
                            draggable={false}
                        />

                        <h1 className="text-3xl font-medium tracking-tight bg-clip-text text-transparent bg-gradient-to-b from-black to-black/60 dark:from-white dark:to-white/50">
                            {mode === 'login' ? 'Welcome Back' : 'Create Account'}
                        </h1>
                        <p className="text-black/40 dark:text-white/40 mt-3 text-center text-[15px] leading-relaxed max-w-[280px]">
                            {mode === 'login'
                                ? 'Enter your credentials to access your workspace'
                                : 'Join Reavion and start automating your browser'}
                        </p>
                    </div>

                    <div className="space-y-5">
                        <Button
                            variant="outline"
                            className="w-full h-12 bg-black/[0.02] dark:bg-white/[0.05] border-black/5 dark:border-white/10 hover:bg-black/[0.05] dark:hover:bg-white/[0.08] text-black/70 dark:text-white rounded-2xl transition-all duration-300"
                            onClick={signInWithGoogle}
                        >
                            <Chrome className="mr-3 h-4 w-4 opacity-70" />
                            <span className="font-medium font-sans">Continue with Google</span>
                        </Button>

                        <div className="relative my-10">
                            <div className="absolute inset-0 flex items-center">
                                <span className="w-full border-t border-black/[0.05] dark:border-white/[0.05]"></span>
                            </div>
                            <div className="relative flex justify-center text-[10px] uppercase tracking-[0.2em]">
                                <span className="bg-[#f9f9f9] dark:bg-[#080808] transition-colors duration-500 px-4 text-black/20 dark:text-white/20 font-bold">Or use email</span>
                            </div>
                        </div>

                        <form onSubmit={handleEmailAuth} className="space-y-6">
                            <div className="space-y-2">
                                <label className="text-[10px] font-bold text-black/30 dark:text-white/30 uppercase tracking-[0.15em] ml-1">Email</label>
                                <Input
                                    type="email"
                                    placeholder="name@example.com"
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    className="bg-black/[0.02] dark:bg-white/[0.03] border-black/5 dark:border-white/5 text-black dark:text-white h-12 rounded-2xl outline-none focus:border-black/10 dark:focus:border-white/20 hover:border-black/5 dark:hover:border-white/10 focus:bg-black/[0.04] dark:focus:bg-white/[0.05] transition-all duration-300 placeholder:text-black/20 dark:placeholder:text-white/10"
                                    required
                                />
                            </div>
                            <div className="space-y-2">
                                <label className="text-[10px] font-bold text-black/30 dark:text-white/30 uppercase tracking-[0.15em] ml-1">Password</label>
                                <Input
                                    type="password"
                                    placeholder="••••••••"
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    className="bg-black/[0.02] dark:bg-white/[0.03] border-black/5 dark:border-white/5 text-black dark:text-white h-12 rounded-2xl outline-none focus:border-black/10 dark:focus:border-white/20 hover:border-black/5 dark:hover:border-white/10 focus:bg-black/[0.04] dark:focus:bg-white/[0.05] transition-all duration-300 placeholder:text-black/20 dark:placeholder:text-white/10"
                                    required
                                />
                            </div>

                            <Button
                                type="submit"
                                disabled={isLoading}
                                className="w-full h-12 bg-black dark:bg-white text-white dark:text-black hover:bg-neutral-800 dark:hover:bg-neutral-200 rounded-2xl font-semibold shadow-2xl transition-all duration-300 active:scale-[0.98] bg-gradient-to-br from-neutral-900 to-black dark:from-white dark:to-white/90"
                            >
                                {isLoading ? (
                                    <CircularLoader className="h-5 w-5 border-white/20 border-t-white dark:border-black/20 dark:border-t-black" />
                                ) : (
                                    <>
                                        {mode === 'login' ? 'Sign In' : 'Sign Up'}
                                        <ArrowRight className="ml-3 h-4 w-4" />
                                    </>
                                )}
                            </Button>
                        </form>

                        <div className="mt-8 text-center">
                            <button
                                type="button"
                                onClick={() => setMode(mode === 'login' ? 'signup' : 'login')}
                                className="text-black/30 dark:text-white/30 hover:text-black dark:hover:text-white transition-all text-sm font-medium tracking-tight"
                            >
                                {mode === 'login'
                                    ? "Don't have an account? Sign up"
                                    : "Already have an account? Sign in"}
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>

    );
}
