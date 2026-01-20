import type { WebContents } from 'electron';

export interface SiteToolContext {
  getContents: () => Promise<WebContents>;
  getSpeed?: () => 'slow' | 'normal' | 'fast';
  workspaceId?: string;
  getAccessToken?: () => string | undefined;
}
