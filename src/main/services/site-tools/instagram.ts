import { z } from 'zod';
import { DynamicStructuredTool } from '@langchain/core/tools';
import type { SiteToolContext } from './types';

const BASE_SCRIPT_HELPERS = `
  const logs = [];
  function log(msg, data) {
    logs.push({ time: new Date().toISOString(), msg, data });
  }

  function wait(ms) {
    const multiplier = window.__REAVION_SPEED_MULTIPLIER__ || 1;
    // HUMAN BEHAVIOR: Add +/- 25% randomness + small base jitter
    const randomFactor = 0.75 + (Math.random() * 0.5); 
    const jitter = Math.random() * 200;
    const adjustedMs = Math.round((ms * multiplier * randomFactor) + jitter);
    return new Promise((resolve) => setTimeout(resolve, adjustedMs));
  }
  
  async function safeClick(el, label) {
    if(!el) throw new Error('Element not found: ' + label);
    
    const rectBefore = el.getBoundingClientRect();
    if (rectBefore.top < 100 || rectBefore.bottom > window.innerHeight - 100) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      await wait(600);
    } else {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      await wait(300);
    }
    
    try {
         const common = { bubbles: true, cancelable: true, view: window };
         el.dispatchEvent(new MouseEvent('mousedown', common));
         el.dispatchEvent(new MouseEvent('mouseup', common));
         el.click();
    } catch (e) {
      log('Native click failed on ' + label, { error: e.toString() });
      throw e;
    }
    await wait(800);
  }
`;

export function createInstagramTools(ctx: SiteToolContext): DynamicStructuredTool[] {
  const postTool = new DynamicStructuredTool({
    name: 'instagram_post',
    description: 'Post media to Instagram. Note: This requires the user to be logged in and on the creation flow or standard web layout that allows posting.',
    schema: z.object({
      caption: z.string().describe('Caption for the post'),
      mediaUrl: z.string().nullable().describe('Local file path or URL to media (currently mainly text caption support implies manual media selection or advanced logic not fully implemented). For now, it stops after opening creation flow.').default(null)
    }),
    func: async ({ caption }) => {
      // Web posting is tricky on desktop without emulation, but let's try standard flow
      try {
        const contents = ctx.getContents();
        const result = await contents.executeJavaScript(`
          (async function() {
            ${BASE_SCRIPT_HELPERS}
            
            // 1. Find "New Post" button (Sidebar "Create")
            // Usually svg with specific path or aria-label "New post"
            const createBtn = document.querySelector('svg[aria-label="New post"]').closest('div[role="button"]') || 
                              Array.from(document.querySelectorAll('span')).find(s => s.innerText === 'Create')?.closest('div[role="button"]');
                              
            if (!createBtn) return { success: false, error: 'Create button not found' };
            
            await safeClick(createBtn, 'Create Button');
            
            // This is where it gets hard - usually opens a file system dialog which Electron can't easily automate without specific APIs
            // For now, we return a message that we opened the flow.
            
            return { success: true, message: 'Opened creation flow. Please select media manually. Agent will wait.' };
          })()
        `);
        return JSON.stringify(result);
      } catch (error) {
        return JSON.stringify({ success: false, error: String(error) });
      }
    },
  });

  const engageTool = new DynamicStructuredTool({
    name: 'instagram_engage',
    description: 'Like or comment on the currently visible post modal or feed item.',
    schema: z.object({
      action: z.enum(['like', 'comment']),
      commentText: z.string().nullable().default(null)
    }),
    func: async ({ action, commentText }) => {
      try {
        const contents = ctx.getContents();
        const result = await contents.executeJavaScript(`
                (async function() {
                  ${BASE_SCRIPT_HELPERS}
                  
                  // Priority: Active Modal -> Center of Screen -> First Post
                  const modal = document.querySelector('[role="dialog"]');
                  const targetRoot = modal || document;
                  
                  if (${JSON.stringify(action === 'like')}) {
                      // Look for heart icon
                      // aria-label="Like" or "Unlike"
                      const likeBtn = targetRoot.querySelector('svg[aria-label="Like"]')?.closest('div[role="button"]') ||
                                      targetRoot.querySelector('svg[aria-label="I like this"]')?.closest('button');
                      
                      const unlikeBtn = targetRoot.querySelector('svg[aria-label="Unlike"]')?.closest('div[role="button"]');
                      
                      if (unlikeBtn) return { success: true, message: 'Already liked' };
                      if (!likeBtn) return { success: false, error: 'Like button not found' };
                      
                      await safeClick(likeBtn, 'Like Button');
                      return { success: true, message: 'Liked' };
                  }
                  
                  if (${JSON.stringify(action === 'comment')}) {
                      const textarea = targetRoot.querySelector('textarea[aria-label="Add a comment…"]');
                      if (!textarea) return { success: false, error: 'Comment box not found' };
                      
                      await safeClick(textarea, 'Comment Box');
                      textarea.focus({ preventScroll: true });
                      document.execCommand('insertText', false, ${JSON.stringify(commentText || '')});
                      await wait(500);
                      
                      const postBtn = Array.from(targetRoot.querySelectorAll('div[role="button"]')).find(b => b.innerText === 'Post');
                      if (!postBtn) return { success: false, error: 'Post button not found' };
                      
                      await safeClick(postBtn, 'Post Button');
                      return { success: true, message: 'Commented' };
                  }
                })()
              `);
        return JSON.stringify(result);
      } catch (error) {
        return JSON.stringify({ success: false, error: String(error) });
      }
    }
  });

  return [postTool, engageTool];
}
