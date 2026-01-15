import { supabase } from '../lib/supabase';

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
}

export const systemSettingsService = new SystemSettingsService();
