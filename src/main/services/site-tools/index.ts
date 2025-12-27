import type { DynamicStructuredTool } from '@langchain/core/tools';

import type { SiteToolContext } from './types';
import { createRedditTools } from './reddit';
import { createXComTools } from './x-com';
import { createLinkedInTools } from './linkedin';
import { createInstagramTools } from './instagram';
import { createBlueskyTools } from './bluesky';

export function createSiteTools(ctx: SiteToolContext): DynamicStructuredTool[] {
  return [
    ...createXComTools(ctx),
    ...createRedditTools(ctx),
    ...createLinkedInTools(ctx),
    ...createInstagramTools(ctx),
    ...createBlueskyTools(ctx),
  ];
}
