import { useEffect } from 'react';
import { MainLayout } from '@/components/layout/MainLayout';
import { AuthScreen } from '@/components/layout/AuthScreen';
import { useAppStore } from '@/stores/app.store';
import { useSettingsStore } from '@/stores/settings.store';
import { useAuthStore } from '@/stores/auth.store';
import { supabase } from '@/lib/supabase';
import { Toaster } from 'sonner';

export function App() {
  const { theme, setTheme } = useAppStore();
  const { loadSettings } = useSettingsStore();
  const { session, setSession, isLoading } = useAuthStore();

  useEffect(() => {
    loadSettings();
    setTheme(theme);

    // Initial session check
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
    });

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });

    // Listen for deep link auth callbacks (Google login)
    const unsubscribeAuth = (window as any).api.auth.onAuthCallback((hash: string) => {
      const params = new URLSearchParams(hash);
      const accessToken = params.get('access_token');
      const refreshToken = params.get('refresh_token');

      if (accessToken && refreshToken) {
        supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken,
        });
      }
    });

    return () => {
      subscription.unsubscribe();
      unsubscribeAuth();
    };
  }, []);

  if (isLoading) {
    return (
      <div className="h-screen w-screen flex items-center justify-center bg-[#0A0A0B]">
        <div className="w-8 h-8 border-2 border-blue-500/20 border-t-blue-500 rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <>
      {session ? <MainLayout /> : <AuthScreen />}
      <Toaster position="bottom-right" theme="dark" />
    </>
  );
}
