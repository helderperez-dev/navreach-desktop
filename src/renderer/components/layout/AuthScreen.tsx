import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { LogIn, Mail, Github, Chrome, ArrowRight, Loader2, Minus, Square, X } from 'lucide-react';
import { useAuthStore } from '@/stores/auth.store';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import navreachLogo from '@assets/navreach-white-welcome.png';

export function AuthScreen() {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [mode, setMode] = useState<'login' | 'signup'>('login');

    const { signInWithGoogle } = useAuthStore();

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

    const handleMinimize = () => (window as any).api.window.minimize();
    const handleMaximize = () => (window as any).api.window.maximize();
    const handleClose = () => (window as any).api.window.close();
    const isMac = navigator.userAgent.includes('Mac');

    return (
        <div className="flex flex-col h-screen w-screen overflow-hidden bg-background">
            {/* Draggable Title Bar Area */}
            <div className="h-12 min-h-[48px] w-full flex items-center justify-end drag-region bg-transparent border-b border-transparent transition-colors hover:border-white/10 group">
                <div className="flex items-center px-4 gap-2 no-drag opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                    {!isMac && (
                        <>
                            <button
                                onClick={handleMinimize}
                                className="w-8 h-8 flex items-center justify-center rounded-md text-white/40 hover:text-white hover:bg-white/5 transition-all"
                            >
                                <Minus className="w-4 h-4" />
                            </button>
                            <button
                                onClick={handleMaximize}
                                className="w-8 h-8 flex items-center justify-center rounded-md text-white/40 hover:text-white hover:bg-white/5 transition-all"
                            >
                                <Square className="w-3 h-3" />
                            </button>
                            <button
                                onClick={handleClose}
                                className="w-8 h-8 flex items-center justify-center rounded-md text-white/40 hover:text-red-400 hover:bg-red-500/10 transition-all"
                            >
                                <X className="w-4 h-4" />
                            </button>
                        </>
                    )}
                </div>
            </div>

            <div className="flex-1 flex flex-col items-center justify-center relative text-white">
                {/* Background Orbs */}
                <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-blue-500/10 blur-[120px] rounded-full" />
                <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-purple-500/10 blur-[120px] rounded-full" />

                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="w-full max-w-md z-10 p-8"
                >
                    <div className="flex flex-col items-center mb-8">
                        <img src={navreachLogo} alt="Navreach" className="h-10 w-auto mb-10 select-none" draggable={false} />

                        <h1 className="text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-b from-white to-white/60">
                            {mode === 'login' ? 'Welcome Back' : 'Create Account'}
                        </h1>
                        <p className="text-white/40 mt-2 text-center">
                            {mode === 'login'
                                ? 'Enter your credentials to access your workspace'
                                : 'Join Navreach and start automating your browser'}
                        </p>
                    </div>

                    <div className="space-y-4">
                        <Button
                            variant="outline"
                            className="w-full h-12 bg-white/5 border-white/10 hover:bg-white/10 hover:border-white/20 text-white transition-all duration-300"
                            onClick={signInWithGoogle}
                        >
                            <Chrome className="mr-2 h-4 w-4" />
                            Continue with Google
                        </Button>

                        <div className="relative my-8">
                            <div className="absolute inset-0 flex items-center">
                                <span className="w-full border-t border-white/5"></span>
                            </div>
                            <div className="relative flex justify-center text-xs uppercase">
                                <span className="bg-[#0A0A0B] px-2 text-white/20 font-medium tracking-wider">Or continue with</span>
                            </div>
                        </div>

                        <form onSubmit={handleEmailAuth} className="space-y-4">
                            <div className="space-y-2">
                                <label className="text-xs font-semibold text-white/40 uppercase tracking-wider ml-1">Email Address</label>
                                <Input
                                    type="email"
                                    placeholder="name@example.com"
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    className="bg-white/5 border-white/10 text-white h-12 outline-none focus:border-white/20 hover:border-white/20 focus:bg-white/[0.07] focus-visible:ring-0 focus-visible:ring-offset-0 transition-[border-color,background-color] duration-300 ease-in-out"
                                    required
                                />
                            </div>
                            <div className="space-y-2">
                                <label className="text-xs font-semibold text-white/40 uppercase tracking-wider ml-1">Password</label>
                                <Input
                                    type="password"
                                    placeholder="••••••••"
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    className="bg-white/5 border-white/10 text-white h-12 outline-none focus:border-white/20 hover:border-white/20 focus:bg-white/[0.07] focus-visible:ring-0 focus-visible:ring-offset-0 transition-[border-color,background-color] duration-300 ease-in-out"
                                    required
                                />
                            </div>

                            <Button
                                type="submit"
                                disabled={isLoading}
                                className="w-full h-12 bg-blue-600 hover:bg-blue-500 text-white font-semibold transition-all duration-300"
                            >
                                {isLoading ? (
                                    <Loader2 className="animate-spin h-5 w-5" />
                                ) : (
                                    <>
                                        {mode === 'login' ? 'Sign In' : 'Sign Up'}
                                        <ArrowRight className="ml-2 h-4 w-4" />
                                    </>
                                )}
                            </Button>
                        </form>

                        <div className="mt-6 text-center">
                            <button
                                onClick={() => setMode(mode === 'login' ? 'signup' : 'login')}
                                className="text-white/40 hover:text-white transition-colors text-sm font-medium"
                            >
                                {mode === 'login'
                                    ? "Don't have an account? Sign up"
                                    : "Already have an account? Sign in"}
                            </button>
                        </div>
                    </div>
                </motion.div>
            </div>
        </div>
    );
}
