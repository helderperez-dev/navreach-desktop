import { useEffect } from 'react';
import { MainLayout } from '@/components/layout/MainLayout';
import { AuthScreen } from '@/components/layout/AuthScreen';
import { useAppStore } from '@/stores/app.store';
import { useSettingsStore } from '@/stores/settings.store';
import { useAuthStore } from '@/stores/auth.store';
import { useBillingStore } from '@/stores/billing.store';
import { useSubscriptionStore } from '@/stores/subscription.store';
import { useTargetsStore } from '@/stores/targets.store';
import { useChatStore } from '@/stores/chat.store';
import { useWorkspaceStore } from '@/stores/workspace.store';
import { useBrowserStore } from '@/stores/browser.store';
import { supabase } from '@/lib/supabase';
import { usePostHog } from 'posthog-js/react';
import { analytics } from '@/lib/posthog'; // Still keep for helper functions if needed elsewhere
import { Toaster } from 'sonner';

import { CircularLoader } from '@/components/ui/CircularLoader';

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
    const checkSession = async () => {
      try {
        console.log('[App] Checking initial session...');
        const { data: { session }, error } = await supabase.auth.getSession();
        if (error) throw error;

        if (session) {
          console.log('[App] Session found on startup:', session.user.email);
          setSession(session);
        } else {
          console.log('[App] No session found on startup');
          // We wait for onAuthStateChange to confirm before setting to null
          // to avoid flickering if it's just taking a moment to load from storage
        }
      } catch (err: any) {
        console.error('[App] Initial session check failed:', err);
        setSession(null);
      }
    };

    checkSession();

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event: string, session: any) => {
      console.log('[App] Auth state change event:', event, session?.user?.email || 'no-user');
      setSession(session);

      if (session?.user) {
        analytics.identify(session.user.id, session.user.email);
      }

      if (event === 'SIGNED_IN') {
        loadSettings();
      }

      if (event === 'SIGNED_OUT') {
        analytics.reset();
        useBillingStore.getState().reset();
        useSubscriptionStore.getState().reset();
        useTargetsStore.getState().reset();
        useChatStore.getState().reset();
        useWorkspaceStore.getState().reset();
        useBrowserStore.getState().resetBrowserState();
        useSettingsStore.getState().reset();
        useAppStore.getState().reset();
      }
    });

    // Listen for deep link auth callbacks (Google login)
    const unsubscribeAuth = (window as any).api?.auth?.onAuthCallback(async (hash: string) => {
      console.log('[App] Auth callback received from main process');
      const params = new URLSearchParams(hash);
      const accessToken = params.get('access_token');
      const refreshToken = params.get('refresh_token');

      if (accessToken && refreshToken) {
        const { error } = await supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken,
        });
        if (error) console.error('[App] Failed to set session from callback:', error);
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
        <CircularLoader className="w-6 h-6 border-primary/20 border-t-primary" />
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
