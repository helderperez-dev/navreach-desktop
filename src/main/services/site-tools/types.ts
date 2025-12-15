import type { WebContents } from 'electron';

export interface SiteToolContext {
  getContents: () => WebContents;
}
