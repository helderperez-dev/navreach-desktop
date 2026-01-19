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

export async function getScopedSupabase(accessToken?: string, refreshToken?: string) {
    if (!accessToken) return supabase;

    // If we have a refresh token, try to set the full session
    if (refreshToken) {
        const client = createClient(supabaseUrl || '', supabaseAnonKey || '', {
            auth: {
                persistSession: false,
                autoRefreshToken: true,
                detectSessionInUrl: false
            }
        });

        try {
            await client.auth.setSession({
                access_token: accessToken,
                refresh_token: refreshToken
            });
            return client;
        } catch (e) {
            console.error('[Supabase Main] Failed to set scoped session:', e);
            // Fallback to header method below
        }
    }

    // Default/Fallback: Create a client without hardcoded headers first
    // This allows us to update the session later if needed (e.g. via ai:update-session)
    const client = createClient(supabaseUrl || '', supabaseAnonKey || '', {
        auth: {
            persistSession: false,
            autoRefreshToken: false,
            detectSessionInUrl: false
        }
    });

    if (accessToken) {
        try {
            // Attempt to set the session
            // If we have a refresh token, this was handled in the block above (lines 38-57)
            // So here we only have accessToken
            const { error } = await client.auth.setSession({
                access_token: accessToken,
                refresh_token: refreshToken || '' // Explicitly pass empty string if undefined to satisfy types if needed, or let it be.
            });

            if (error) {
                console.warn('[Supabase Main] setSession failed for simple client, falling back to global headers:', error.message);
                // If setSession fails, we fallback to creating a NEW client with hardcoded headers
                // This is the "old" behavior which is robust for static requests but doesn't support updates
                return createClient(supabaseUrl || '', supabaseAnonKey || '', {
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
            }
        } catch (e) {
            console.error('[Supabase Main] Exception setting session, using fallback:', e);
            return createClient(supabaseUrl || '', supabaseAnonKey || '', {
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
        }
    }

    return client;
}
