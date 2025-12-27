import { z } from 'zod';
import { DynamicStructuredTool } from '@langchain/core/tools';
import type { SiteToolContext } from './types';

const BASE_SCRIPT_HELPERS = `
  const logs = [];
  function log(msg, data) {
    logs.push({ time: new Date().toISOString(), msg, data });
  }

  function wait(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
  
  async function safeClick(el, label) {
    if(!el) throw new Error('Element not found: ' + label);
    el.scrollIntoView({ behavior: 'instant', block: 'center' });
    await wait(500);
    el.click();
    await wait(1000);
  }
`;

export function createBlueskyTools(ctx: SiteToolContext): DynamicStructuredTool[] {
  const postTool = new DynamicStructuredTool({
    name: 'bluesky_post',
    description: 'Create a post on Bluesky.',
    schema: z.object({
      text: z.string().describe('Post content'),
    }),
    func: async ({ text }) => {
      try {
        const contents = ctx.getContents();
        const result = await contents.executeJavaScript(`
          (async function() {
            ${BASE_SCRIPT_HELPERS}
            
            // 1. Find "New Post" button
            // Usually a floating action button or sidebar button
            const newPostBtn = document.querySelector('[aria-label="New Post"]');
            if (newPostBtn) await safeClick(newPostBtn, 'New Post Button');
            // Or if currently capable of typing (already open)
            
            await wait(1000);
            
            // 2. Find Composer
            const composer = document.querySelector('[contenteditable="true"][aria-label="Write your post"]');
            if (!composer) return { success: false, error: 'Composer not found' };
            
            composer.focus();
            document.execCommand('insertText', false, ${JSON.stringify(text)});
            await wait(500);
            
            // 3. Send
            const sendBtn = document.querySelector('[aria-label="Publish post"]'); // Need to verify specific aria-label
            // Fallback: look for button with text "Post"
            const fallbackSend = Array.from(document.querySelectorAll('div[role="button"]')).find(b => b.innerText === 'Post');
            
            const btn = sendBtn || fallbackSend;
            if (!btn) return { success: false, error: 'Post button not found' };
            
            await safeClick(btn, 'Post Button');
            return { success: true, message: 'Posted on Bluesky' };
          })()
        `);
        return JSON.stringify(result);
      } catch (error) {
        return JSON.stringify({ success: false, error: String(error) });
      }
    },
  });

  const replyTool = new DynamicStructuredTool({
    name: 'bluesky_reply',
    description: 'Reply to the currently focused or specified post on Bluesky.',
    schema: z.object({
      text: z.string().describe('Reply text content'),
      index: z.number().nullable().describe('Index of the post to reply to (null for first available)').default(null)
    }),
    func: async ({ text, index }) => {
      const finalIndex = index ?? 0;
      try {
        const contents = ctx.getContents();
        const result = await contents.executeJavaScript(`
                (async function() {
                  ${BASE_SCRIPT_HELPERS}
                  
                  // 1. Find Reply Button on target post
                  const posts = Array.from(document.querySelectorAll('[data-testid^="post-"]')); // approximate selector
                  // Bluesky selectors are tricky, often use data-testid
                  
                  // Let's rely on aria-label "Reply"
                  const replyBtns = Array.from(document.querySelectorAll('[aria-label="Reply"]'));
                  if (!replyBtns.length) return { success: false, error: 'No reply buttons found' };
                  
                  const targetBtn = replyBtns[${finalIndex}] || replyBtns[0];
                  await safeClick(targetBtn, 'Reply Button');
                  
                  await wait(1000);
                  
                  // 2. Composer
                  const composer = document.querySelector('[contenteditable="true"]');
                  if (!composer) return { success: false, error: 'Composer not found' };
                  
                  composer.focus();
                  document.execCommand('insertText', false, ${JSON.stringify(text)});
                  await wait(500);
                  
                  // 3. Post
                   const sendBtn = document.querySelector('[aria-label="Publish post"]') || 
                                   Array.from(document.querySelectorAll('div[role="button"]')).find(b => b.innerText === 'Post' || b.innerText === 'Reply');
                   
                   if (!sendBtn) return { success: false, error: 'Send button not found' };
                   await safeClick(sendBtn, 'Send Reply');
                   
                   return { success: true, message: 'Replied' };
                })()
              `);
        return JSON.stringify(result);
      } catch (error) {
        return JSON.stringify({ success: false, error: String(error) });
      }
    }
  });

  return [postTool, replyTool];
}
