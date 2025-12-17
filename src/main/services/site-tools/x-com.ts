import { z } from 'zod';
import { DynamicStructuredTool } from '@langchain/core/tools';

import type { SiteToolContext } from './types';

const POINTER_HELPERS = `
  function ensurePointerStyles() {
    if (document.getElementById('navreach-pointer-styles')) return;
    const style = document.createElement('style');
    style.id = 'navreach-pointer-styles';
    style.textContent = \`
      @keyframes navreachFloat {
        0%, 100% { transform: translateY(0px); }
        50% { transform: translateY(-3px); }
      }
    \`;
    document.head.appendChild(style);
  }

  function movePointer(x, y) {
    ensurePointerStyles();
    let indicator = document.getElementById('navreach-pointer');
    if (!indicator) {
      indicator = document.createElement('div');
      indicator.id = 'navreach-pointer';
      const uniqueId = 'glass-gradient-' + Date.now();
      indicator.innerHTML = \`
        <svg width="32" height="32" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M6 4L14 26L17.5 16.5L27 13L6 4Z" fill="url(#\${uniqueId})" stroke="rgba(255,255,255,0.9)" stroke-width="1.5"/>
          <defs>
            <linearGradient id="\${uniqueId}" x1="6" y1="4" x2="27" y2="26" gradientUnits="userSpaceOnUse">
              <stop offset="0%" stop-color="rgba(80, 80, 80, 0.95)"/>
              <stop offset="50%" stop-color="rgba(40, 40, 40, 0.95)"/>
              <stop offset="100%" stop-color="rgba(10, 10, 10, 0.95)"/>
            </linearGradient>
          </defs>
        </svg>
      \`;
      indicator.style.cssText = 'position:fixed;z-index:999999;pointer-events:none;filter:drop-shadow(0 4px 12px rgba(0,0,0,0.4));animation:navreachFloat 3s ease-in-out infinite;transition:left 0.3s ease, top 0.3s ease;';
      document.body.appendChild(indicator);
    }
    indicator.style.left = x + 'px';
    indicator.style.top = y + 'px';
  }
`;

export function createXComTools(ctx: SiteToolContext): DynamicStructuredTool[] {
  const searchTool = new DynamicStructuredTool({
    name: 'x_search',
    description:
      'On X.com (Twitter), open the search results page for a given query. Supports filters like Top, Latest, People, Photos, or Videos. WARNING: This tool performs navigation - ensure you have taken a snapshot of the current page state before using this if you just completed an action (reply, post, like, etc.).',
    schema: z.object({
      query: z
        .string()
        .min(1, 'Search query is required.')
        .describe('Keywords or hashtags to search for. URL encoding handled automatically.'),
      filter: z
        .enum(['top', 'latest', 'people', 'photos', 'videos'])
        .nullable()
        .optional()
        .describe('Result filter tab to open. Defaults to latest.'),
      src: z
        .string()
        .nullable()
        .optional()
        .describe('Custom `src` query parameter if needed. Defaults to recent_search_click.'),
    }),
    func: async ({ query, filter, src }) => {
      try {
        const contents = ctx.getContents();
        const filterMap: Record<string, string> = {
          top: 'top',
          latest: 'live',
          people: 'user',
          photos: 'image',
          videos: 'video',
        };
        const params = new URLSearchParams();
        params.set('q', query);
        params.set('src', src ?? 'recent_search_click');
        const resolvedFilter = filter ?? 'latest';
        params.set('f', filterMap[resolvedFilter]);
        const url = `https://x.com/search?${params.toString()}`;

        await contents.loadURL(url);

        return JSON.stringify({ success: true, url });
      } catch (error) {
        return JSON.stringify({ success: false, error: String(error) });
      }
    },
  });

  const likeTool = new DynamicStructuredTool({
    name: 'x_like',
    description: 'On X.com (Twitter), like/unlike a post using robust click simulation. Use index when multiple buttons match (0-based).',
    schema: z.object({
      index: z.number().nullable().optional().describe('0-based index of the like/unlike button to click among visible posts. Default 0.'),
      action: z.enum(['like', 'unlike', 'toggle']).nullable().optional().describe('Action to perform. Default is like.'),
    }),
    func: async ({ index, action }) => {
      const resolvedIndex = index ?? 0;
      const resolvedAction = action ?? 'like';
      try {
        const contents = ctx.getContents();

        const result = await contents.executeJavaScript(`
          (async function() {
            ${POINTER_HELPERS}
            const host = window.location.hostname || '';
            if (!host.includes('x.com') && !host.includes('twitter.com')) {
              return { success: false, error: 'Not on x.com/twitter.com', url: window.location.href };
            }

            // Guard: never attempt a reply while in the new-post composer.
            // If the agent ends up on /compose/post, it must navigate back to timeline/search and retry.
            if ((window.location.href || '').includes('/compose/post')) {
              try {
                const fallbackUrl = document.referrer && document.referrer.includes('x.com') ? document.referrer : 'https://x.com/home';
                window.location.href = fallbackUrl;
                await new Promise(r => setTimeout(r, 800));
              } catch (_) {}
              return {
                success: false,
                error: 'Currently on /compose/post (new post composer). Cannot reply from here. Returned to timeline. Retry x_reply from a visible tweet.'
              };
            }

            function isVisible(el) {
              if (!el) return false;
              const rect = el.getBoundingClientRect();
              if (rect.width === 0 || rect.height === 0) return false;
              const style = window.getComputedStyle(el);
              return style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0';
            }

            function pick(list, idx) {
              if (list.length === 0) return null;
              if (idx >= 0 && idx < list.length) return list[idx];
              return list[list.length - 1];
            }

            const likeCandidates = Array.from(document.querySelectorAll('button[data-testid="like"], [data-testid="like"]')).filter(isVisible);
            const unlikeCandidates = Array.from(document.querySelectorAll('button[data-testid="unlike"], [data-testid="unlike"]')).filter(isVisible);

            const desired = ${JSON.stringify(resolvedAction)};
            const idx = ${resolvedIndex};

            let element = null;
            let effectiveAction = desired;

            if (desired === 'like') {
              element = pick(likeCandidates, idx);
              if (!element && unlikeCandidates.length > 0) {
                return { success: true, message: 'Already liked', already: true };
              }
            } else if (desired === 'unlike') {
              element = pick(unlikeCandidates, idx);
              if (!element && likeCandidates.length > 0) {
                return { success: true, message: 'Already unliked', already: true };
              }
            } else {
              element = pick(likeCandidates, idx);
              if (!element) {
                element = pick(unlikeCandidates, idx);
                if (element) effectiveAction = 'unlike';
              } else {
                effectiveAction = 'like';
              }
            }

            if (!element) {
              return { success: false, error: 'No like/unlike buttons found' };
            }

            const clickable = element.closest('button,[role="button"]') || element;

            clickable.scrollIntoView({ behavior: 'instant', block: 'center', inline: 'center' });
            await new Promise(r => setTimeout(r, 100));

            const rect = clickable.getBoundingClientRect();
            const x = rect.left + rect.width / 2;
            const y = rect.top + rect.height / 2;
            movePointer(x, y);

            const eventOptions = {
              bubbles: true,
              cancelable: true,
              view: window,
              clientX: x,
              clientY: y,
              screenX: x,
              screenY: y,
              buttons: 1,
              pointerId: 1,
              isPrimary: true
            };

            try { clickable.dispatchEvent(new MouseEvent('mousemove', eventOptions)); } catch (_) {}
            try { clickable.dispatchEvent(new MouseEvent('mouseover', eventOptions)); } catch (_) {}
            try { clickable.dispatchEvent(new PointerEvent('pointerdown', eventOptions)); } catch (_) {}
            try { clickable.dispatchEvent(new MouseEvent('mousedown', eventOptions)); } catch (_) {}

            try { clickable.focus(); } catch (_) {}

            try { clickable.dispatchEvent(new PointerEvent('pointerup', eventOptions)); } catch (_) {}
            try { clickable.dispatchEvent(new MouseEvent('mouseup', eventOptions)); } catch (_) {}
            try { clickable.dispatchEvent(new MouseEvent('click', eventOptions)); } catch (_) {}
            try { clickable.click(); } catch (_) {}

            await new Promise(r => setTimeout(r, 300));

            return {
              success: true,
              message: effectiveAction === 'unlike' ? 'Unliked post' : 'Liked post',
              index: idx
            };
          })()
        `);

        return JSON.stringify(result);
      } catch (error) {
        return JSON.stringify({ success: false, error: String(error) });
      }
    },
  });

  const replyTool = new DynamicStructuredTool({
    name: 'x_reply',
    description: 'On X.com (Twitter), reply to a visible post. Find a tweet you want to reply to, then use this tool with the reply text and the index of the reply button (0-based from top).',
    schema: z.object({
      text: z
        .string()
        .min(1, 'Reply text is required.')
        .describe('The text to post in the reply. Plain text only, newlines allowed.'),
      index: z
        .number()
        .nullable()
        .optional()
        .describe('0-based index of the reply button to target among visible tweets. Default 0 (first reply button).'),
    }),
    func: async ({ text, index }) => {
      const resolvedIndex = index ?? 0;
      try {
        const contents = ctx.getContents();

        // First check if we're on the correct page
        const pageCheck = await contents.executeJavaScript(`
          (function() {
            const host = window.location.hostname || '';
            if (!host.includes('x.com') && !host.includes('twitter.com')) {
              return { valid: false, error: 'Not on x.com/twitter.com', url: window.location.href };
            }
            return { valid: true };
          })()
        `);

        if (!pageCheck.valid) {
          return JSON.stringify(pageCheck);
        }

        // Execute JavaScript using executeJavaScript
        const result = await contents.executeJavaScript(`
          (async function() {
            const logs = [];
            function log(msg, data) {
              logs.push({ time: new Date().toISOString(), msg, data });
            }

            try {
              ${POINTER_HELPERS}
              const replyText = ${JSON.stringify(text)};
              const targetIndex = ${resolvedIndex};

              log('Starting x_reply', { index: targetIndex });

              // Helpers
              function isVisible(el) {
                if (!el) return false;
                const rect = el.getBoundingClientRect();
                if (rect.width === 0 || rect.height === 0) return false;
                const style = window.getComputedStyle(el);
                return style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0';
              }

              function wait(ms) {
                return new Promise(resolve => setTimeout(resolve, ms));
              }

              async function simulateClick(el, label) {
                const clickable = el.closest('button,[role="button"]') || el;
                
                log('Interacting with element (Direct DOM)', { label, tagName: clickable.tagName, testId: clickable.getAttribute('data-testid') });

                // Scroll to center to be safe, but we won't rely on coordinates
                clickable.scrollIntoView({ behavior: 'instant', block: 'center', inline: 'center' });
                await wait(500);

                // Highlight for user visibility (optional debug visual)
                const rect = clickable.getBoundingClientRect();
                const x = rect.left + rect.width / 2;
                const y = rect.top + rect.height / 2;
                log('Element visual position', { x, y });
                if (typeof movePointer === 'function') movePointer(x, y);

                // DIRECT DOM INTERACTION
                // We avoid dispatching MouseEvents by coordinates because they are physically hitting the Sidebar.
                // React/Web apps generally respond well to native .click() on button elements.
                
                try {
                  clickable.focus();
                  log('Focused element');
                } catch (e) {
                  log('Focus failed', { error: e.toString() });
                }

                await wait(200);

                try {
                  log('Executing native .click()');
                  clickable.click();
                } catch (e) {
                  log('Click failed', { error: e.toString() });
                  throw e;
                }
                
                await wait(1000);
                return clickable;
              }

              function insertDraftText(target, text) {
                // Clear first
                if (target.textContent.length > 0) {
                   try { document.execCommand('selectAll', false, null); document.execCommand('delete', false, null); } catch(e) {}
                   target.textContent = '';
                }

                let inserted = false;
                try {
                  target.focus();
                  inserted = document.execCommand('insertText', false, text);
                } catch (e) {}

                if (!inserted) {
                  target.textContent = text;
                }

                try {
                  target.dispatchEvent(new InputEvent('input', { bubbles: true, cancelable: true, data: text }));
                  target.dispatchEvent(new Event('change', { bubbles: true }));
                } catch (e) {}
              }

              // Get reply buttons
              const replyButtons = Array.from(document.querySelectorAll('[data-testid="reply"]')).filter(isVisible);

              if (replyButtons.length === 0) {
                return { success: false, error: 'No reply buttons found (data-testid="reply")', logs };
              }

              if (targetIndex >= replyButtons.length) {
                return { success: false, error: 'Reply index ' + targetIndex + ' out of range. Only ' + replyButtons.length + ' visible.', logs };
              }

              const targetButton = replyButtons[targetIndex];
              log('Target button found', { index: targetIndex, buttonHTML: targetButton.outerHTML.substring(0, 50) });

              // 1. Context check
              const tweetContainer = targetButton.closest('[data-testid="tweet"]');
              let repliedToContext = { author: 'unknown', text: 'unknown' };
              if (tweetContainer) {
                const authorEl = tweetContainer.querySelector('[data-testid="User-Name"]');
                const textEl = tweetContainer.querySelector('[data-testid="tweetText"]');
                if (authorEl) repliedToContext.author = authorEl.innerText.split('\\n')[0] || 'unknown';
                if (textEl) repliedToContext.text = textEl.innerText.substring(0, 50) + '...';
              }

              // 2. Click Reply
              log('Attempting to click reply button');
              await simulateClick(targetButton, 'Reply Button');
              await wait(2000);

              // 3. Find Composer
              function findComposer() {
                const selectors = [
                  '[data-testid="tweetTextarea_0"]',
                  '[data-testid="tweetTextarea_1"]',
                  'div[role="textbox"][contenteditable="true"]'
                ];

                // Dialog priority
                const dialog = document.querySelector('[role="dialog"]');
                if (dialog && isVisible(dialog)) {
                   for (const sel of selectors) {
                     const els = dialog.querySelectorAll(sel);
                     for (const el of els) if (isVisible(el)) return el;
                   }
                }

                // Global fallback
                for (const sel of selectors) {
                  const els = document.querySelectorAll(sel);
                  for (const el of els) if (isVisible(el)) return el;
                }
                return null;
              }

              let composer = null;
              for (let i = 0; i < 15; i++) {
                await wait(400);
                composer = findComposer();
                if (composer) break;
              }

              if (!composer) {
                log('Composer Not Found', { url: window.location.href });
                return { success: false, error: 'Reply composer did not appear.', logs };
              }
              
              log('Composer Found', { composerClass: composer.className });

              // 4. Typing
              await simulateClick(composer, 'Composer Text Area');
              composer.focus();
              await wait(500);

              insertDraftText(composer, replyText);
              await wait(800);

              // Validate/Trigger
              try {
                composer.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true }));
                await wait(50);
                composer.dispatchEvent(new KeyboardEvent('keyup', { key: ' ', bubbles: true }));
              } catch(e) {}
              
              const currentContent = (composer.innerText || composer.textContent || '').trim();
              if (currentContent.length < 1 && replyText.length > 0) {
                  // Retry once
                  insertDraftText(composer, replyText);
                  await wait(800);
              }

              // 5. Send
              let sendButton = null;
              // Look in dialog first
              const dialog = document.querySelector('[role="dialog"]');
              if (dialog) {
                 sendButton = dialog.querySelector('[data-testid="tweetButton"]');
              }
              if (!sendButton) {
                 const btns = Array.from(document.querySelectorAll('[data-testid="tweetButton"], [data-testid="tweetButtonInline"]')).filter(isVisible);
                 sendButton = btns[btns.length - 1];
              }

              if (!sendButton) {
                return { success: false, error: 'Reply/Send button not found', logs };
              }

              if (sendButton.disabled || sendButton.getAttribute('aria-disabled') === 'true') {
                 return { success: false, error: 'Send button is disabled', debug: { content: composer.innerText }, logs };
              }
              
              log('Clicking Send Button');
              await simulateClick(sendButton, 'Send Button');
              await wait(3000);

              // Check if modal still open
              const stillOpen = document.querySelector('[role="dialog"] [data-testid="tweetTextarea_0"]');
              if (stillOpen && isVisible(stillOpen)) {
                return { success: false, error: 'Modal still open after clicking send', logs };
              }

              return { success: true, message: 'Replied successfully', context: repliedToContext, logs };

            } catch (err) {
              return { success: false, error: err.toString(), stack: err.stack, logs };
            }
          })()
        `);

        return JSON.stringify(result);
      } catch (error) {
        return JSON.stringify({ success: false, error: `Tool execution failed: ${error}` });
      }
    },
  });

  const postTool = new DynamicStructuredTool({
    name: 'x_post',
    description: 'On X.com (Twitter), create a BRAND NEW standalone post using the new-post composer (typically /compose/post) and click **Post**. Do NOT use this for replying to someone\'s tweet. If the user intent is to reply/comment/respond to an existing post, you MUST use x_reply instead.',
    schema: z.object({
      text: z
        .string()
        .min(1, 'Post text is required.')
        .describe('Full text of the post to publish. Include hashtags/mentions as needed.'),
    }),
    func: async ({ text }) => {
      try {
        const contents = ctx.getContents();
        const result = await contents.executeJavaScript(`
          (async function() {
            const host = window.location.hostname || '';
            if (!host.includes('x.com') && !host.includes('twitter.com')) {
              return { success: false, error: 'Not on x.com/twitter.com', url: window.location.href };
            }

            const postText = ${JSON.stringify(text)};

            function isVisible(el) {
              if (!el) return false;
              const rect = el.getBoundingClientRect();
              if (rect.width === 0 || rect.height === 0) return false;
              const style = window.getComputedStyle(el);
              return style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0';
            }

            async function simulateClick(el) {
              const clickable = el.closest('button,[role="button"]') || el;
              clickable.scrollIntoView({ behavior: 'instant', block: 'center', inline: 'center' });
              await new Promise(r => setTimeout(r, 120));
              const rect = clickable.getBoundingClientRect();
              const x = rect.left + rect.width / 2;
              const y = rect.top + rect.height / 2;
              const options = {
                bubbles: true,
                cancelable: true,
                view: window,
                clientX: x,
                clientY: y,
                screenX: x,
                screenY: y,
                buttons: 1,
                pointerId: 1,
                isPrimary: true
              };
              try { clickable.dispatchEvent(new MouseEvent('mousemove', options)); } catch (_) {}
              try { clickable.dispatchEvent(new MouseEvent('mouseover', options)); } catch (_) {}
              try { clickable.dispatchEvent(new PointerEvent('pointerdown', options)); } catch (_) {}
              try { clickable.dispatchEvent(new MouseEvent('mousedown', options)); } catch (_) {}
              try { clickable.focus(); } catch (_) {}
              try { clickable.dispatchEvent(new PointerEvent('pointerup', options)); } catch (_) {}
              try { clickable.dispatchEvent(new MouseEvent('mouseup', options)); } catch (_) {}
              try { clickable.dispatchEvent(new MouseEvent('click', options)); } catch (_) {}
              try { clickable.click(); } catch (_) {}
              await new Promise(r => setTimeout(r, 150));
              return clickable;
            }

            function insertDraftText(target, text) {
              let inserted = false;
              try {
                const selection = window.getSelection();
                if (selection) {
                  selection.removeAllRanges();
                  const range = document.createRange();
                  range.selectNodeContents(target);
                  selection.addRange(range);
                  inserted = document.execCommand && document.execCommand('insertText', false, text);
                  if (!inserted) {
                    inserted = document.execCommand && document.execCommand('selectAll', false, undefined);
                    inserted = document.execCommand && document.execCommand('insertText', false, text);
                  }
                }
              } catch (_) {
                inserted = false;
              }

              if (!inserted) {
                target.textContent = '';
                target.appendChild(document.createTextNode(text));
              }

              try {
                target.dispatchEvent(new InputEvent('input', { bubbles: true, cancelable: true, data: text }));
              } catch (_) {
                const evt = document.createEvent('Event');
                evt.initEvent('input', true, true);
                target.dispatchEvent(evt);
              }
            }

            function findComposer() {
              const selectors = [
                '[data-testid="tweetTextarea_0"] div[contenteditable="true"]',
                '[data-testid="tweetTextarea_1"] div[contenteditable="true"]',
                '[data-testid="tweetTextarea_0"][contenteditable="true"]',
                '[data-testid="tweetTextarea_1"][contenteditable="true"]',
                'div[role="textbox"][contenteditable="true"]'
              ];
              for (const sel of selectors) {
                const el = document.querySelector(sel);
                if (el && isVisible(el)) return el;
              }
              return null;
            }

            let composer = findComposer();

            if (!composer) {
              const openButtons = Array.from(document.querySelectorAll('[data-testid="SideNav_NewTweet_Button"], [data-testid="AppTabBar_NewTweet_Button"], [data-testid="AppTabBar_Compose_Button"]')).filter(isVisible);
              if (openButtons.length > 0) {
                await simulateClick(openButtons[0]);
                await new Promise(r => setTimeout(r, 200));
                composer = findComposer();
              }
            }

            if (!composer) {
              return { success: false, error: 'Composer not found. Open the composer manually and try again.' };
            }

            await simulateClick(composer);
            composer.focus();

            insertDraftText(composer, postText);

            try {
              composer.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true }));
              composer.dispatchEvent(new KeyboardEvent('keyup', { key: ' ', bubbles: true }));
            } catch (_) {}

            await new Promise(r => setTimeout(r, 200));

            const sendButton =
              document.querySelector('[data-testid="tweetButton"], [data-testid="tweetButtonInline"]') ||
              Array.from(document.querySelectorAll('[role="button"] span'))
                .find(el => el.textContent && el.textContent.trim().toLowerCase() === 'post')
                ?.closest('button,[role="button"]');

            if (!sendButton) {
              return { success: false, error: 'Post button not found' };
            }

            await simulateClick(sendButton);

            await new Promise(r => setTimeout(r, 1200));

            return { 
              success: true, 
              message: 'Post submitted successfully. IMPORTANT: Take a browser snapshot before navigating to verify the post was published.',
              warning: 'DO NOT navigate yet - take a snapshot first to confirm the post is visible'
            };
          })()
        `);

        return JSON.stringify(result);
      } catch (error) {
        return JSON.stringify({ success: false, error: String(error) });
      }
    },
  });

  const followTool = new DynamicStructuredTool({
    name: 'x_follow',
    description: 'On X.com (Twitter), follow or unfollow visible users via their follow buttons.',
    schema: z.object({
      index: z
        .number()
        .nullable()
        .optional()
        .describe('0-based index of the follow/unfollow button to target among visible users. Default 0.'),
      action: z
        .enum(['follow', 'unfollow', 'toggle'])
        .nullable()
        .optional()
        .describe('Desired action. Defaults to follow.'),
    }),
    func: async ({ index, action }) => {
      const resolvedIndex = index ?? 0;
      const resolvedAction = action ?? 'follow';
      try {
        const contents = ctx.getContents();
        const result = await contents.executeJavaScript(`
          (async function() {
            const host = window.location.hostname || '';
            if (!host.includes('x.com') && !host.includes('twitter.com')) {
              return { success: false, error: 'Not on x.com/twitter.com', url: window.location.href };
            }

            function isVisible(el) {
              if (!el) return false;
              const rect = el.getBoundingClientRect();
              if (rect.width === 0 || rect.height === 0) return false;
              const style = window.getComputedStyle(el);
              return style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0';
            }

            function pick(list, idx) {
              if (list.length === 0) return null;
              if (idx >= 0 && idx < list.length) return list[idx];
              return list[list.length - 1];
            }

            async function simulateClick(el) {
              const clickable = el.closest('button,[role="button"]') || el;
              clickable.scrollIntoView({ behavior: 'instant', block: 'center', inline: 'center' });
              await new Promise(r => setTimeout(r, 120));
              const rect = clickable.getBoundingClientRect();
              const x = rect.left + rect.width / 2;
              const y = rect.top + rect.height / 2;
              const options = {
                bubbles: true,
                cancelable: true,
                view: window,
                clientX: x,
                clientY: y,
                screenX: x,
                screenY: y,
                buttons: 1,
                pointerId: 1,
                isPrimary: true
              };
              try { clickable.dispatchEvent(new MouseEvent('mousemove', options)); } catch (_) {}
              try { clickable.dispatchEvent(new MouseEvent('mouseover', options)); } catch (_) {}
              try { clickable.dispatchEvent(new PointerEvent('pointerdown', options)); } catch (_) {}
              try { clickable.dispatchEvent(new MouseEvent('mousedown', options)); } catch (_) {}
              try { clickable.focus(); } catch (_) {}
              try { clickable.dispatchEvent(new PointerEvent('pointerup', options)); } catch (_) {}
              try { clickable.dispatchEvent(new MouseEvent('mouseup', options)); } catch (_) {}
              try { clickable.dispatchEvent(new MouseEvent('click', options)); } catch (_) {}
              try { clickable.click(); } catch (_) {}
              await new Promise(r => setTimeout(r, 200));
              return clickable;
            }

            const idx = ${resolvedIndex};
            const desired = ${JSON.stringify(resolvedAction)};

            const followButtons = Array.from(
              document.querySelectorAll('[data-testid$="-follow"], [data-testid$="-Follow"], [data-testid="follow"]')
            ).filter(isVisible);
            const unfollowButtons = Array.from(
              document.querySelectorAll('[data-testid$="-unfollow"], [data-testid$="-Unfollow"], [data-testid="unfollow"]')
            ).filter(isVisible);

            let button = null;
            let effectiveAction = desired;

            if (desired === 'follow') {
              button = pick(followButtons, idx);
              if (!button && unfollowButtons.length > 0) {
                return { success: true, message: 'Already following', already: true };
              }
            } else if (desired === 'unfollow') {
              button = pick(unfollowButtons, idx);
              if (!button && followButtons.length > 0) {
                return { success: true, message: 'Already not following', already: true };
              }
            } else {
              button = pick(followButtons, idx);
              if (!button) {
                button = pick(unfollowButtons, idx);
                if (button) effectiveAction = 'unfollow';
              } else {
                effectiveAction = 'follow';
              }
            }

            if (!button) {
              return { success: false, error: 'No follow/unfollow buttons found' };
            }

            await simulateClick(button);

            if (effectiveAction === 'unfollow') {
              await new Promise(r => setTimeout(r, 150));
              const confirm = document.querySelector('[data-testid="confirmationSheetConfirm"]');
              if (confirm && isVisible(confirm)) {
                await simulateClick(confirm);
              }
            }

            return {
              success: true,
              message: effectiveAction === 'unfollow' ? 'Unfollowed user' : 'Followed user',
              index: idx
            };
          })()
        `);

        return JSON.stringify(result);
      } catch (error) {
        return JSON.stringify({ success: false, error: String(error) });
      }
    },
  });

  return [searchTool, likeTool, replyTool, postTool, followTool];
}
