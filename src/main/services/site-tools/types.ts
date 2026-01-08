import type { WebContents } from 'electron';

export interface SiteToolContext {
  getContents: () => WebContents;
  getSpeed?: () => 'slow' | 'normal' | 'fast';
  workspaceId?: string;
}
