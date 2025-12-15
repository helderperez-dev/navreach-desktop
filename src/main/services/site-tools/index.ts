import type { DynamicStructuredTool } from '@langchain/core/tools';

import type { SiteToolContext } from './types';
import { createXComTools } from './x-com';

export function createSiteTools(ctx: SiteToolContext): DynamicStructuredTool[] {
  return [
    ...createXComTools(ctx),
  ];
}
