import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || (typeof process !== 'undefined' ? process.env.VITE_SUPABASE_URL : '');
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || (typeof process !== 'undefined' ? process.env.VITE_SUPABASE_ANON_KEY : '');

console.log('[Supabase Main] Initializing with:', {
    url: supabaseUrl ? 'Set' : 'Missing',
    key: supabaseAnonKey ? 'Set' : 'Missing'
});

if (!supabaseUrl || !supabaseAnonKey) {
    console.warn('Supabase credentials missing in main process environment variables. Check your .env file.');
}

export const supabase = createClient(supabaseUrl || '', supabaseAnonKey || '');

/**
 * Global store for current session tokens in the main process.
 * This allows background services to perform scoped operations.
 */
export const mainTokenStore = {
    accessToken: null as string | null,
    refreshToken: null as string | null,
    setTokens(accessToken: string, refreshToken: string) {
        this.accessToken = accessToken;
        this.refreshToken = refreshToken;
    },
    getTokens() {
        return { accessToken: this.accessToken, refreshToken: this.refreshToken };
    }
};

/**
 * Decode the user ID from a JWT access token.
 * This is useful when we need to explicitly pass user_id for RLS policies.
 */
export function getUserIdFromToken(accessToken: string): string | null {
    try {
        const parts = accessToken.split('.');
        if (parts.length !== 3) return null;

        const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString('utf-8'));
        return payload.sub || null;
    } catch (e) {
        console.error('[Supabase Main] Failed to decode user_id from token:', e);
        return null;
    }
}

// Keep a per-token cache to avoid redundant client creation and setSession calls
// Using a Map keyed by accessToken ensures that concurrent sessions/windows don't conflict
const clientCache = new Map<string, any>();

export async function getScopedSupabase(accessToken?: string, refreshToken?: string) {
    if (!accessToken) return supabase;

    // 1. Check if we have a cached client for EXACTLY this access token
    if (clientCache.has(accessToken)) {
        return clientCache.get(accessToken);
    }

    // 2. Determine if the token is likely expired (simple check)
    let isExpired = false;
    try {
        const payload = JSON.parse(Buffer.from(accessToken.split('.')[1], 'base64').toString());
        const now = Math.floor(Date.now() / 1000);
        if (payload.exp && payload.exp < now) {
            isExpired = true;
            console.log(`[Supabase Main] Detected likely expired access token (${payload.exp} < ${now}) during initialization`);
        }
    } catch (e) {
        // Ignore parsing errors
    }

    // 3. Create a unique memory storage for THIS client instance to avoid cross-window collisions
    const clientStorageMap = new Map<string, string>();
    const clientStorage = {
        getItem: (key: string) => clientStorageMap.get(key) || null,
        setItem: (key: string, value: string) => { clientStorageMap.set(key, value); },
        removeItem: (key: string) => { clientStorageMap.delete(key); },
    };

    // 4. Create a fresh client
    // We explicitly include the Authorization header as a fallback/primary for RLS stability,
    // while still maintaining the stateful auth for autoRefreshToken support.
    const client = createClient(supabaseUrl || '', supabaseAnonKey || '', {
        global: {
            headers: {
                Authorization: `Bearer ${accessToken}`
            }
        },
        auth: {
            persistSession: true, // Use storage to support auto-refresh mechanics
            autoRefreshToken: true,
            detectSessionInUrl: false,
            storage: clientStorage
        }
    });

    if (accessToken) {
        try {
            // 5. Set the session. If it's expired but we have a refresh token, setSession will try to refresh it immediately.
            const { error } = await client.auth.setSession({
                access_token: accessToken,
                refresh_token: refreshToken || ''
            });

            if (error) {
                // If it's just "Auth session missing!", it might be a race condition or expired token.
                // Since we set the Authorization header anyway, this is often non-fatal for RLS.
                if (error.message?.includes('Auth session missing')) {
                    console.debug('[Supabase Main] Session initialization warning (non-fatal):', error.message);
                } else {
                    console.warn('[Supabase Main] Error setting session on new scoped client:', error.message);
                }
            }
        } catch (e) {
            console.error('[Supabase Main] Exception setting session on scoped client:', e);
        }
    }

    // Cache the client so subsequent calls in the same turn/context are fast
    if (clientCache.size > 20) {
        const firstKey = clientCache.keys().next().value;
        if (firstKey) clientCache.delete(firstKey);
    }
    clientCache.set(accessToken, client);

    return client;
}
