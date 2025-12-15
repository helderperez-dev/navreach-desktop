import { useEffect } from 'react';
import { MainLayout } from '@/components/layout/MainLayout';
import { useAppStore } from '@/stores/app.store';
import { useSettingsStore } from '@/stores/settings.store';

export function App() {
  const { theme, setTheme } = useAppStore();
  const { loadSettings } = useSettingsStore();

  useEffect(() => {
    loadSettings();
    setTheme(theme);
  }, []);

  return <MainLayout />;
}
