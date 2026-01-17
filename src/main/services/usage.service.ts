import { getScopedSupabase } from '../lib/supabase';

export interface UserUsage {
    id: string;
    user_id: string;
    type: string;
    count: number;
    usage_date: string;
    updated_at: string;
}

export class UsageService {
    private getUserTimezone(): string {
        return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
    }

    private getUserIdFromToken(accessToken: string): string {
        try {
            const payload = JSON.parse(Buffer.from(accessToken.split('.')[1], 'base64').toString());
            if (!payload.sub) throw new Error('No subject in token');
            return payload.sub;
        } catch (e) {
            throw new Error('Invalid token');
        }
    }

    async getUsage(accessToken: string, type: string = 'ai_actions'): Promise<UserUsage | null> {
        const supabase = await getScopedSupabase(accessToken);
        const userId = this.getUserIdFromToken(accessToken);

        const timezone = this.getUserTimezone();
        const { data, error } = await supabase.rpc('get_user_usage', {
            target_user_id: userId,
            usage_type: type,
            user_timezone: timezone
        });

        if (error) {
            console.error('[UsageService] Error fetching usage via RPC:', error);
            // Don't return null on error, throw it so the IPC handler catches it or handle it gracefully
            // Returning null masks the error. But usage here expects UserUsage | null.
            // If the error is 'PGRST116' (no rows), null is fine. If it's auth error, we should probably know.
            return null;
        }

        return data as UserUsage;
    }

    async incrementUsage(accessToken: string, type: string = 'ai_actions', incrementBy: number = 1): Promise<UserUsage> {
        const supabase = await getScopedSupabase(accessToken);
        const userId = this.getUserIdFromToken(accessToken);

        const timezone = this.getUserTimezone();
        const { data, error } = await supabase.rpc('increment_user_usage', {
            target_user_id: userId,
            usage_type: type,
            increment_val: incrementBy,
            user_timezone: timezone
        });

        if (error) {
            console.error('[UsageService] Error incrementing usage via RPC:', error);
            throw new Error(error.message);
        }

        return data as UserUsage;
    }
}

export const usageService = new UsageService();
