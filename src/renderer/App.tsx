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

    if (!supabase) {
      console.error('[App] Supabase client not initialized');
      setSession(null);
      return;
    }

    // Initial session check
    supabase.auth.getSession().then(({ data: { session } }: any) => {
      setSession(session);
    }).catch((err: any) => {
      console.error('[App] Session check failed:', err);
      setSession(null);
    });

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event: any, session: any) => {
      setSession(session);
    });

    // Listen for deep link auth callbacks (Google login)
    const unsubscribeAuth = (window as any).api?.auth?.onAuthCallback((hash: string) => {
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

    // Handle menu actions
    const unsubscribeMenu = (window as any).api?.window?.onMenuAction((action: string) => {
      console.log('[App] Menu action:', action);
      switch (action) {
        case 'new-chat':
          // Reset chat or navigate to browser with fresh state
          useAppStore.getState().setHasStarted(false);
          useAppStore.getState().setActiveView('browser');
          break;
        case 'go-browser':
          useAppStore.getState().setActiveView('browser');
          break;
        case 'go-playbooks':
          useAppStore.getState().setActiveView('playbooks');
          break;
        case 'go-targets':
          useAppStore.getState().setActiveView('targets');
          break;
        case 'go-settings':
          useAppStore.getState().setActiveView('settings');
          break;
      }
    });

    return () => {
      subscription.unsubscribe();
      unsubscribeAuth?.();
      unsubscribeMenu?.();
    };
  }, []);

  if (isLoading) {
    return (
      <div className="h-screen w-screen flex items-center justify-center bg-background">
        <div className="w-8 h-8 border-2 border-primary/20 border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <>
      {session ? <MainLayout /> : <AuthScreen />}
      <Toaster position="bottom-right" theme={theme as 'light' | 'dark' | 'system'} />
    </>
  );
}
