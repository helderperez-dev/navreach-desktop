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

// Keep a simple cache to avoid redundant client creation and setSession calls
let cachedClient: any = null;
let cachedAccessToken: string | null = null;
let cachedRefreshToken: string | null = null;

export async function getScopedSupabase(accessToken?: string, refreshToken?: string) {
    if (!accessToken) return supabase;

    // If we already have a client with this exact access token, reuse it
    // This dramatically reduces redundant Auth calls if called in a loop
    if (cachedClient && cachedAccessToken === accessToken) {
        return cachedClient;
    }

    // Try to reuse the client with setSession if we have a refresh token
    if (refreshToken && cachedClient && cachedRefreshToken === refreshToken) {
        try {
            // Even if refreshToken matches, accessToken might be new (refreshed by renderer)
            const { error } = await cachedClient.auth.setSession({
                access_token: accessToken,
                refresh_token: refreshToken
            });

            if (!error) {
                cachedAccessToken = accessToken;
                return cachedClient;
            }
            console.warn('[Supabase Main] Failed to update session on cached client:', error.message);
        } catch (e) {
            console.error('[Supabase Main] Exception updating session on cached client:', e);
        }
    }

    // If we reach here, we either don't have a cached client or setSession failed
    // If we have a refresh token, try to set the full session on a new client
    if (refreshToken) {
        const client = createClient(supabaseUrl || '', supabaseAnonKey || '', {
            auth: {
                persistSession: false,
                autoRefreshToken: true,
                detectSessionInUrl: false
            }
        });

        try {
            const { error } = await client.auth.setSession({
                access_token: accessToken,
                refresh_token: refreshToken
            });

            if (!error) {
                cachedClient = client;
                cachedAccessToken = accessToken;
                cachedRefreshToken = refreshToken;
                return client;
            }
            console.warn('[Supabase Main] Failed to set scoped session with refresh token, falling back to stateless:', error.message);
        } catch (e) {
            console.error('[Supabase Main] Exception setting scoped session:', e);
        }
    }

    // Fallback: Create a client with explicit Authorization header
    // This works even without a valid refresh token (stateless mode)
    const statelessClient = createClient(supabaseUrl || '', supabaseAnonKey || '', {
        global: {
            headers: {
                Authorization: `Bearer ${accessToken}`
            }
        },
        auth: {
            persistSession: false,
            autoRefreshToken: false,
            detectSessionInUrl: false
        }
    });

    // Update cache with stateless client if we didn't manage to get a stateful one
    cachedClient = statelessClient;
    cachedAccessToken = accessToken;
    cachedRefreshToken = refreshToken || null;

    return statelessClient;
}
