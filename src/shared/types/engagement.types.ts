import { Tables } from './database.types';

export type EngagementLog = Tables<'engagement_logs'>;

export interface EngagementStats {
    total: number;
    byType: Record<string, number>;
    byPlatform: Record<string, number>;
}
