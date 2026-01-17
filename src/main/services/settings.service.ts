import { supabase, getScopedSupabase } from '../lib/supabase';

export interface SystemSettings {
    [key: string]: any;
}

export class SystemSettingsService {
    private settings: SystemSettings = {};
    private lastFetch: number = 0;
    private CACHE_TTL = 30000; // 30 seconds

    async getSettings(): Promise<SystemSettings> {
        const now = Date.now();
        if (now - this.lastFetch < this.CACHE_TTL && Object.keys(this.settings).length > 0) {
            return this.settings;
        }

        try {
            const { data, error } = await supabase
                .from('system_settings')
                .select('key, value');

            if (error) throw error;

            this.settings = (data || []).reduce((acc: any, curr: any) => {
                acc[curr.key] = curr.value;
                return acc;
            }, {});

            this.lastFetch = now;
            return this.settings;
        } catch (error) {
            console.error('[SystemSettingsService] Failed to fetch settings:', error);
            return this.settings; // Return cached if possible
        }
    }

    async getSetting(key: string, defaultValue?: any): Promise<any> {
        const settings = await this.getSettings();
        return settings[key] !== undefined ? settings[key] : defaultValue;
    }

    /**
     * Helper to get Stripe credentials
     */
    async getStripeConfig() {
        const settings = await this.getSettings();
        return {
            secretKey: settings['stripe_secret_key'] || process.env.STRIPE_SECRET_KEY,
            publishableKey: settings['stripe_publishable_key'] || process.env.VITE_STRIPE_PUBLISHABLE_KEY,
            proPriceId: settings['stripe_pro_price_id'] || process.env.VITE_STRIPE_PRO_PRICE_ID,
            credits100PriceId: settings['stripe_credits_100_price_id'] || process.env.VITE_STRIPE_CREDITS_100_PRICE_ID,
            credits500PriceId: settings['stripe_credits_500_price_id'] || process.env.VITE_STRIPE_CREDITS_500_PRICE_ID,
            credits1000PriceId: settings['stripe_credits_1000_price_id'] || process.env.VITE_STRIPE_CREDITS_1000_PRICE_ID,
        };
    }

    /**
     * Get dynamic tier limits merged with user overrides
     */
    async getTierLimits(accessToken?: string): Promise<Record<string, number>> {
        const settings = await this.getSettings();

        // Base Global Limits (with defaults)
        const limits: Record<string, number> = {
            ai_actions_limit: Number(settings['free_tier_ai_actions_limit'] || 10),
            workspace_limit: Number(settings['free_tier_workspace_limit'] || 1),
            target_list_limit: Number(settings['free_tier_target_list_limit'] || 3),
            target_limit: Number(settings['free_tier_target_limit'] || 50)
        };

        if (accessToken) {
            try {
                const scopedSupabase = await getScopedSupabase(accessToken);
                const { data: userSettings } = await scopedSupabase
                    .from('user_settings')
                    .select('ai_actions_limit, workspace_limit, target_list_limit, target_limit')
                    .maybeSingle();

                if (userSettings) {
                    if (userSettings.ai_actions_limit !== null && userSettings.ai_actions_limit !== undefined) limits.ai_actions_limit = userSettings.ai_actions_limit;
                    if (userSettings.workspace_limit !== null && userSettings.workspace_limit !== undefined) limits.workspace_limit = userSettings.workspace_limit;
                    if (userSettings.target_list_limit !== null && userSettings.target_list_limit !== undefined) limits.target_list_limit = userSettings.target_list_limit;
                    if (userSettings.target_limit !== null && userSettings.target_limit !== undefined) limits.target_limit = userSettings.target_limit;
                }
            } catch (error) {
                console.error('[SystemSettingsService] Failed to fetch user limits:', error);
            }
        }

        return limits;
    }
}

export const systemSettingsService = new SystemSettingsService();
