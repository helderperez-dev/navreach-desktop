import { getScopedSupabase } from '../lib/supabase';
import { Database } from '../../shared/types/database.types';

type EngagementLog = Database['public']['Tables']['engagement_logs']['Insert'];

export class EngagementService {
    private getUserIdFromToken(accessToken: string): string {
        try {
            const payload = JSON.parse(Buffer.from(accessToken.split('.')[1], 'base64').toString());
            if (!payload.sub) throw new Error('No subject in token');
            return payload.sub;
        } catch (e) {
            throw new Error('Invalid token');
        }
    }

    async logEngagement(accessToken: string, log: Omit<EngagementLog, 'user_id'>) {
        const supabase = await getScopedSupabase(accessToken);
        const userId = this.getUserIdFromToken(accessToken);

        const { data, error } = await supabase
            .from('engagement_logs')
            .insert({
                ...log,
                user_id: userId
            } as any)
            .select()
            .single();

        if (error) {
            console.error('[EngagementService] Error logging engagement:', error);
            throw error;
        }

        // Update last_interaction_at in targets table if exists
        // We match by target_username in metadata or try to match it in the URL
        try {
            await supabase
                .from('targets')
                .update({ last_interaction_at: new Date().toISOString() } as any)
                .or(`metadata->>username.eq.${log.target_username},url.ilike.%${log.target_username}%`);
        } catch (updateError) {
            console.warn('[EngagementService] Failed to update target interaction timestamp:', updateError);
        }

        console.log(`[EngagementService] Successfully logged ${log.action_type} for ${log.target_username} on ${log.platform}`);
        return data;
    }

    async getEngagementLogs(accessToken: string, options: { limit?: number; offset?: number; target_username?: string; searchQuery?: string } = {}) {
        const supabase = await getScopedSupabase(accessToken);
        const userId = this.getUserIdFromToken(accessToken);

        let query = supabase
            .from('engagement_logs')
            .select('*')
            .eq('user_id', userId)
            .order('created_at', { ascending: false })
            .limit(options.limit || 100);

        if (options.offset) {
            query = query.range(options.offset, options.offset + (options.limit || 100) - 1);
        }

        if (options.target_username) {
            query = query.eq('target_username', options.target_username);
        }

        if (options.searchQuery) {
            query = query.or(`target_username.ilike.%${options.searchQuery}%,target_name.ilike.%${options.searchQuery}%`);
        }

        const { data, error } = await query;

        if (error) {
            console.error('[EngagementService] Error fetching engagement logs:', error);
            throw error;
        }

        return data;
    }

    async getEngagementStats(accessToken: string) {
        const supabase = await getScopedSupabase(accessToken);
        const userId = this.getUserIdFromToken(accessToken);

        const { data, error } = await supabase
            .from('engagement_logs')
            .select('platform, action_type')
            .eq('user_id', userId);

        if (error) {
            console.error('[EngagementService] Error fetching engagement stats:', error);
            throw error;
        }

        const stats = {
            total: data.length,
            byType: {} as Record<string, number>,
            byPlatform: {} as Record<string, number>
        };

        data.forEach(log => {
            stats.byType[log.action_type] = (stats.byType[log.action_type] || 0) + 1;
            stats.byPlatform[log.platform] = (stats.byPlatform[log.platform] || 0) + 1;
        });

        return stats;
    }

    async exportToCSV(accessToken: string): Promise<string> {
        const logs = await this.getEngagementLogs(accessToken, { limit: 1000 });
        if (!logs || logs.length === 0) return '';

        const headers = ['Date', 'Platform', 'Action', 'Target Username', 'Target Name', 'Metadata'];
        const rows = logs.map(log => [
            new Date(log.created_at).toLocaleString(),
            log.platform,
            log.action_type,
            log.target_username,
            log.target_name || '',
            JSON.stringify(log.metadata || {})
        ]);

        const csvContent = [
            headers.join(','),
            ...rows.map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
        ].join('\n');

        return csvContent;
    }
}

export const engagementService = new EngagementService();
