
import { PostHog } from 'posthog-node';
import { app, IpcMain } from 'electron';
import * as os from 'os';

let client: PostHog | null = null;

export function initAnalytics() {
    const apiKey = process.env.VITE_POSTHOG_API_KEY;
    const host = process.env.VITE_POSTHOG_HOST || 'https://app.posthog.com';

    if (!apiKey) {
        console.warn('[Analytics] No PostHog API Key found');
        return;
    }

    client = new PostHog(apiKey, {
        host: host,
        flushAt: 1, // Flush immediately for desktop apps as they might close
        flushInterval: 1000,
    });

    console.log('[Analytics] Initialized PostHog in Main Process', { host: host });
}

export function trackEvent(event: string, properties: Record<string, any> = {}) {
    if (!client) return;

    // We need a distinctId. Since Main process might not know the user ID initially,
    // we can use a machine identifier or pass it in. 
    // For generic app events, we can use a machine ID.
    const machineId = getMachineId(); // Simple placeholder or actual implementation

    const systemInfo = {
        $os_name: process.platform,
        $os_version: os.release(),
        $device_type: 'desktop',
        cpu_model: os.cpus()[0]?.model,
        cpu_count: os.cpus().length,
        total_memory_gb: Math.round(os.totalmem() / (1024 * 1024 * 1024)),
        free_memory_gb: Math.round(os.freemem() / (1024 * 1024 * 1024)),
    };

    client.capture({
        distinctId: machineId,
        event,
        properties: {
            $lib: 'desktop',
            $platform: 'desktop',
            $app_version: app.getVersion(),
            $host: 'reavion-desktop-main',
            $screen_name: 'Main App',
            platform: 'desktop',
            ...systemInfo,
            ...properties,
        },
    });
}

export function identifyUser(userId: string, email?: string) {
    if (!client) return;
    const machineId = getMachineId();

    // Alias the machine ID to the user ID so previous events are linked
    client.alias({
        distinctId: userId,
        alias: machineId,
    });

    // Capture system info once on identify
    const systemInfo = {
        cpu_model: os.cpus()[0]?.model,
        total_memory_gb: Math.round(os.totalmem() / (1024 * 1024 * 1024)),
        os_platform: process.platform,
        os_release: os.release(),
    };

    client.identify({
        distinctId: userId,
        properties: {
            email,
            $email: email,
            $platform: 'desktop',
            $app_version: app.getVersion(),
            platform: 'desktop',
            ...systemInfo,
        },
    });
}

export function groupUser(type: string, key: string, properties: Record<string, any> = {}) {
    if (!client) return;
    client.groupIdentify({
        groupType: type,
        groupKey: key,
        properties: {
            platform: 'desktop',
            ...properties,
        },
    });
}

function getMachineId(): string {
    return `desktop-${process.platform}-${process.arch}`;
}

export async function shutdownAnalytics() {
    if (client) {
        // PostHog-node uses .shutdown() which returns a promise or handles it.
        (client as any).shutdown();
    }
}

export const analytics = {
    init: initAnalytics,
    track: trackEvent,
    identify: identifyUser,
    group: groupUser,
    shutdown: shutdownAnalytics,
};

export function setupAnalyticsHandlers(ipcMain: IpcMain) {
    ipcMain.handle('analytics:identify', (_event, { userId, email }: { userId: string, email?: string }) => {
        identifyUser(userId, email);
    });

    ipcMain.handle('analytics:group', (_event, { type, key, properties }: { type: string, key: string, properties?: any }) => {
        groupUser(type, key, properties);
    });
}
