
import posthog from 'posthog-js';

const POSTHOG_KEY = import.meta.env.VITE_POSTHOG_API_KEY;
const POSTHOG_HOST = import.meta.env.VITE_POSTHOG_HOST || 'https://app.posthog.com';

if (POSTHOG_KEY) {
    try {
        posthog.init(POSTHOG_KEY, {
            api_host: POSTHOG_HOST,
            person_profiles: 'identified_only',
            capture_pageview: true,
            persistence: 'localStorage',
            autocapture: true,
            session_recording: {
                maskAllInputs: false, // Set to true for production if you have sensitive data
                maskTextSelector: '.sensitive',
            },
            bootstrap: {
                distinctID: 'anonymous-desktop-user',
            }
        });

        // Register super properties to be included with all events
        posthog.register({
            platform: 'desktop',
            app_name: 'Reavion Desktop',
            $lib: 'desktop',
            $lib_version: '0.1.6',
            $host: 'reavion-desktop',
            $screen_name: 'Launcher',
            $os: 'macos',
        });
    } catch (e) {
        console.error('[PostHog] Failed to initialize:', e);
    }
}

export const analytics = {
    identify: (userId: string, email?: string) => {
        if (!POSTHOG_KEY) return;
        posthog.identify(userId, {
            email,
            $email: email,
            platform: 'desktop',
            $os: 'macos',
        });
        // Sync with Main Process
        (window as any).api?.analytics?.identify(userId, email);
    },
    track: (event: string, properties?: Record<string, any>) => {
        if (!POSTHOG_KEY) return;
        posthog.capture(event, {
            ...properties,
            platform: 'desktop',
            $screen_name: window.location.pathname,
        });
    },
    group: (type: string, key: string, properties?: Record<string, any>) => {
        if (!POSTHOG_KEY) return;
        posthog.group(type, key, properties);
        // Sync with Main Process
        (window as any).api?.analytics?.group?.(type, key, properties);
    },
    setPersonProperties: (properties: Record<string, any>) => {
        if (!POSTHOG_KEY) return;
        posthog.setPersonProperties(properties);
    },
    getFeatureFlag: (key: string) => {
        return posthog.getFeatureFlag(key);
    },
    onFeatureFlags: (callback: (flags: string[], variants: Record<string, any>) => void) => {
        posthog.onFeatureFlags(callback);
    },
    reset: () => {
        if (!POSTHOG_KEY) return;
        posthog.reset();
        // We can also identify as anonymous in Main if we want, or just leave it
        (window as any).api?.analytics?.identify('anonymous-desktop-user');
    },
};

export default posthog;
