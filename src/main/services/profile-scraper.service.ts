import { BrowserWindow } from 'electron';
import { getScopedSupabase, mainTokenStore } from '../lib/supabase';

export class ProfileScraperService {
    private static instance: ProfileScraperService;
    private scraperWindow: BrowserWindow | null = null;

    private constructor() { }

    static getInstance(): ProfileScraperService {
        if (!ProfileScraperService.instance) {
            ProfileScraperService.instance = new ProfileScraperService();
        }
        return ProfileScraperService.instance;
    }

    private async getScraperWindow(): Promise<BrowserWindow> {
        if (this.scraperWindow && !this.scraperWindow.isDestroyed()) {
            return this.scraperWindow;
        }

        this.scraperWindow = new BrowserWindow({
            show: false, // Headless
            webPreferences: {
                offscreen: false, // Use false to have a real window for better compatibility with some sites, but hidden
                partition: 'persist:main', // Shares session with main browser (logged in state)
            }
        });

        return this.scraperWindow;
    }

    async analyzeProfile(url: string, targetId: string) {
        const { accessToken, refreshToken } = mainTokenStore.getTokens();
        if (!accessToken) throw new Error('No active session for background scraping');

        const client = await getScopedSupabase(accessToken, refreshToken || undefined);
        const window = await this.getScraperWindow();
        console.log(`[ProfileScraper] Analyzing profile: ${url}`);

        try {
            // Promise that resolves when loadURL completes
            const loadPromise = window.loadURL(url);

            // Promise that rejects after timeout
            const timeoutPromise = new Promise((_, reject) =>
                setTimeout(() => reject(new Error('Page load timed out')), 30000)
            );

            await Promise.race([loadPromise, timeoutPromise]);
        } catch (err: any) {
            console.error(`[ProfileScraper] loadURL for ${url} ended with:`, err.message);
            // We continue anyway as the page might have loaded partially
        }

        // Wait for content to load (shorter after loadURL)
        await new Promise(resolve => setTimeout(resolve, 3000));

        // Extract basic profile info
        const profileData = await window.webContents.executeJavaScript(`
      (function() {
        const isX = window.location.hostname.includes('x.com') || window.location.hostname.includes('twitter.com');
        
        if (isX) {
          const name = document.querySelector('[data-testid="UserName"] span')?.innerText || '';
          const handle = window.location.pathname.split('/')[1];
          const bio = document.querySelector('[data-testid="UserDescription"]')?.innerText || '';
          const location = document.querySelector('[data-testid="UserLocation"]')?.innerText || '';
          const website = document.querySelector('[data-testid="UserUrl"]')?.innerText || '';
          const stats = Array.from(document.querySelectorAll('a[href$="/verified_followers"], a[href$="/following"]'));
          const followers = stats.find(a => a.href.includes('verified_followers'))?.innerText || '0';
          const following = stats.find(a => a.href.includes('following'))?.innerText || '0';
          const avatarUrl = document.querySelector('div[data-testid="UserAvatar-Container-unknown"] img')?.src ||
                            document.querySelector('div[data-testid="UserAvatar"] img')?.src ||
                            document.querySelector('a[href$="/photo"] img')?.src || 
                            '';
          
          return {
            name,
            handle,
            bio,
            location,
            website,
            followers,
            following,
            avatarUrl,
            platform: 'x'
          };
        }
        
        return { error: 'Unsupported platform' };
      })()
    `);

        if (profileData.error) {
            throw new Error(profileData.error);
        }

        // Update target in DB
        const { data: existingTarget } = await client
            .from('targets')
            .select('name, metadata')
            .eq('id', targetId)
            .single();

        const mergedMetadata = {
            ...(existingTarget?.metadata || {}),
            avatar_url: profileData.avatarUrl || existingTarget?.metadata?.avatar_url,
            headline: profileData.bio,
            location: profileData.location,
            website: profileData.website,
            followers: profileData.followers,
            following: profileData.following,
            username: profileData.handle,
            platform: 'x.com',
            last_analyzed_at: new Date().toISOString()
        };

        // Remove the problematic object field if it exists and other temporary data
        const cleanupFields = ['profile_details', 'avatarUrl', 'bio', 'handle'];
        cleanupFields.forEach(field => {
            if (field in mergedMetadata) {
                delete (mergedMetadata as any)[field];
            }
        });

        const { error: updateError } = await client
            .from('targets')
            .update({
                name: existingTarget?.name || profileData.name,
                metadata: mergedMetadata,
            })
            .eq('id', targetId);

        if (updateError) throw updateError;

        return profileData;
    }
}

export const profileScraperService = ProfileScraperService.getInstance();
