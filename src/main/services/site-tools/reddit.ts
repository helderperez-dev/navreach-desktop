import { z } from 'zod';
import { DynamicStructuredTool } from '@langchain/core/tools';

import type { SiteToolContext } from './types';

const POINTER_HELPERS = `
  function ensurePointerStyles() {
    if (document.getElementById('reavion-pointer-styles')) return;
    const style = document.createElement('style');
    style.id = 'reavion-pointer-styles';
    style.textContent = ' @keyframes reavionFloat { 0%, 100% { transform: translateY(0px); } 50% { transform: translateY(-3px); } } ';
    document.head.appendChild(style);
  }

  function movePointer(x, y) {
    ensurePointerStyles();
    let indicator = document.getElementById('reavion-pointer');
    if (!indicator) {
      indicator = document.createElement('div');
      indicator.id = 'reavion-pointer';
      const uniqueId = 'glass-gradient-' + Date.now();
      indicator.innerHTML = '<svg width="32" height="32" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M6 4L14 26L17.5 16.5L27 13L6 4Z" fill="url(#' + uniqueId + ')" stroke="rgba(255,100,0,0.9)" stroke-width="1.5"/><defs><linearGradient id="' + uniqueId + '" x1="6" y1="4" x2="27" y2="26" gradientUnits="userSpaceOnUse"><stop offset="0%" stop-color="rgba(255, 69, 0, 0.95)"/><stop offset="50%" stop-color="rgba(255, 140, 0, 0.95)"/><stop offset="100%" stop-color="rgba(255, 100, 0, 0.95)"/></linearGradient></defs></svg>';
      indicator.style.cssText = 'position:fixed;z-index:999999;pointer-events:none;filter:drop-shadow(0 4px 12px rgba(0,0,0,0.4));animation:reavionFloat 3s ease-in-out infinite;transition:left 0.3s ease, top 0.3s ease;';
      document.body.appendChild(indicator);
    }
    indicator.style.left = x + 'px';
    indicator.style.top = y + 'px';
  }
`;

const BASE_SCRIPT_HELPERS = `
  const logs = [];
  function log(msg, data) {
    logs.push({ time: new Date().toISOString(), msg, data });
  }

  function isVisible(el) {
    if (!el) return false;
    const rect = el.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return false;
    const style = window.getComputedStyle(el);
    return style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0';
  }

  function wait(ms) {
    const multiplier = window.__REAVION_SPEED_MULTIPLIER__ || 1;
    const adjustedMs = Math.round(ms * multiplier);
    return new Promise((resolve, reject) => {
      const start = Date.now();
      const checking = () => {
        if (window.__REAVION_STOP__) {
          reject(new Error('Stopped by user'));
          return;
        }
        if (Date.now() - start >= adjustedMs) {
          resolve();
        } else {
          setTimeout(checking, 100);
        }
      };
      checking();
    });
  }

  async function safeClick(el, label) {
    const clickable = el.closest('button, a, [role="button"]') || el;
    log('Clicking ' + label, { tagName: clickable.tagName });
    clickable.scrollIntoView({ behavior: 'instant', block: 'center', inline: 'center' });
    await wait(400);
    const rect = clickable.getBoundingClientRect();
    const x = rect.left + rect.width / 2;
    const y = rect.top + rect.height / 2;
    if (typeof movePointer === 'function') movePointer(x, y);
    try { clickable.focus(); } catch (e) {}
    await wait(150);
    try {
      clickable.click();
    } catch (e) {
      log('Native click failed on ' + label, { error: e.toString() });
      throw e;
    }
    await wait(800);
  }
`;

export function createRedditTools(ctx: SiteToolContext): DynamicStructuredTool[] {
  const searchTool = new DynamicStructuredTool({
    name: 'reddit_search',
    description: 'On Reddit.com, search for posts, communities, or people.',
    schema: z.object({
      query: z.string().min(1).describe('Search query.'),
      sort: z.enum(['relevance', 'hot', 'top', 'new', 'comments']).nullable().default('relevance'),
      time: z.enum(['hour', 'day', 'week', 'month', 'year', 'all']).nullable().default('all'),
      type: z.enum(['posts', 'communities', 'people']).nullable().default('posts'),
    }),
    func: async ({ query, sort, time, type }: { query: string; sort?: string | null; time?: string | null; type?: string | null }) => {
      try {
        const contents = ctx.getContents();
        const params = new URLSearchParams();
        params.set('q', query);
        if (sort) params.set('sort', sort);
        if (time) params.set('t', time || 'all');
        if (type) params.set('type', type === 'posts' ? 'link' : type === 'communities' ? 'sr' : 'user');

        const url = `https://www.reddit.com/search/?${params.toString()}`;
        await contents.loadURL(url);
        return JSON.stringify({ success: true, url });
      } catch (error) {
        return JSON.stringify({ success: false, error: String(error) });
      }
    },
  });

  const scoutCommunityTool = new DynamicStructuredTool({
    name: 'reddit_scout_community',
    description: 'Scout a specific Subreddit for posts.',
    schema: z.object({
      subreddit: z.string().describe('Subreddit name (e.g. "AskReddit") or URL.'),
      sort: z.enum(['hot', 'new', 'top', 'rising']).nullable().default('hot'),
      limit: z.number().nullable().default(10),
    }),
    func: async ({ subreddit, sort, limit }: { subreddit: string; sort?: string | null; limit?: number | null }) => {
      try {
        const contents = ctx.getContents();
        let sub = subreddit.replace('r/', '').replace('/', '');
        if (subreddit.includes('reddit.com')) {
          const parts = subreddit.split('/r/');
          if (parts.length > 1) sub = parts[1].split('/')[0];
        }

        const sortUrl = sort ? `/${sort}` : '';
        const url = `https://www.reddit.com/r/${sub}${sortUrl}`;
        await contents.loadURL(url);

        const result = await contents.executeJavaScript(`
              (async function() {
                ${BASE_SCRIPT_HELPERS}
                // Scroll to load a few more
                window.scrollBy(0, 800);
                await wait(1000);

                const posts = Array.from(document.querySelectorAll('shreddit-post, .Post'));
                return { success: true, postCount: posts.length, foundPosts: posts.length };
              })()
            `);
        return JSON.stringify({ ...result, url });
      } catch (e) {
        return JSON.stringify({ success: false, error: String(e) });
      }
    }
  });

  const voteTool = new DynamicStructuredTool({
    name: 'reddit_vote',
    description: 'Upvote or downvote a Reddit post or comment.',
    schema: z.object({
      index: z.union([z.number(), z.string()]).nullable().default(0),
      action: z.enum(['up', 'down', 'clear']).nullable().default('up'),
      type: z.enum(['post', 'comment']).nullable().default('post'),
    }),
    func: async ({ index, action, type }: { index: number | string | null; action: string | null; type: string | null }) => {
      const contents = ctx.getContents();
      const rIndex = parseInt(String(index ?? 0), 10);
      const rAction = action || 'up';
      const rType = type || 'post';

      try {
        const result = await contents.executeJavaScript(`
               (async function() {
                 ${POINTER_HELPERS}
                 ${BASE_SCRIPT_HELPERS}
                 
                 let target = null;
                 if ('${rType}' === 'post') {
                    // Modern Reddit: <shreddit-post>
                    const posts = Array.from(document.querySelectorAll('shreddit-post, .Post')).filter(isVisible);
                    target = posts[${rIndex}] || posts[0];
                 } else {
                    const comments = Array.from(document.querySelectorAll('shreddit-comment, .Comment')).filter(isVisible);
                    target = comments[${rIndex}] || comments[0];
                 }

                 if (!target) return { success: false, error: 'Target not found' };

                 const desired = '${rAction}'; // 'up', 'down'
                 if (desired === 'clear') return { success: false, error: 'Clear vote not supported yet' };

                 // Selectors based on inspection
                 let btn = null;
                 
                 // 1. Try Shadow DOM (Standard for shreddit-post)
                 if (target.shadowRoot) {
                    if (desired === 'up') {
                        btn = target.shadowRoot.querySelector('button[upvote]');
                        if (!btn) btn = target.shadowRoot.querySelector('button[name="upvote"]');
                        // Fallback: search by icon name
                        if (!btn) btn = target.shadowRoot.querySelector('button[icon-name="upvote-outline"]');
                        if (!btn) btn = target.shadowRoot.querySelector('button[icon-name="upvote-fill"]');
                    } else {
                        btn = target.shadowRoot.querySelector('button[downvote]');
                        if (!btn) btn = target.shadowRoot.querySelector('button[name="downvote"]');
                         // Fallback: search by icon name
                        if (!btn) btn = target.shadowRoot.querySelector('button[icon-name="downvote-outline"]');
                        if (!btn) btn = target.shadowRoot.querySelector('button[icon-name="downvote-fill"]');
                    }
                 }
                 
                 // 2. Try Light DOM (Legacy or specific views)
                 if (!btn) {
                     if (desired === 'up') {
                        btn = target.querySelector('button[upvote], button[name="upvote"], button[data-click-id="upvote"]');
                     } else {
                        btn = target.querySelector('button[downvote], button[name="downvote"], button[data-click-id="downvote"]');
                     }
                 }

                 if (btn) {
                     // Check if already voted? (Optional, but user said 'vote', so we usually just click)
                     // Inspecting 'aria-pressed' could tell us state.
                     // const isPressed = btn.getAttribute('aria-pressed') === 'true';
                     
                    await safeClick(btn, desired + 'vote');
                    return { success: true, message: desired + 'voted' };
                 } 
                 
                 return { success: false, error: 'Vote buttons not found via selectors' };
               })()
             `);
        return JSON.stringify(result);
      } catch (e) {
        return JSON.stringify({ success: false, error: String(e) });
      }
    }
  });

  const commentTool = new DynamicStructuredTool({
    name: 'reddit_comment',
    description: 'Comment on a Reddit post or reply to a comment.',
    schema: z.object({
      text: z.string().min(1),
      index: z.union([z.number(), z.string()]).nullable().default(0),
      type: z.enum(['post', 'comment']).nullable().default('post'),
    }),
    func: async ({ text, index, type }) => {
      const contents = ctx.getContents();
      const rIndex = parseInt(String(index ?? 0), 10);
      const rType = type || 'post';

      try {
        const result = await contents.executeJavaScript(`
          (async function() {
            ${POINTER_HELPERS}
            ${BASE_SCRIPT_HELPERS}

            // Context Check: Ensure we are on a post page
            const isPostPage = window.location.href.includes('/comments/') || !!document.querySelector('shreddit-comment-tree');
            // Allow if replying to a comment (type != post) regardless, though usually needs post page too
            // But strict check for type='post'
            if ('${rType}' === 'post' && !isPostPage) {
                // Check for overlay (modal post)
                const overlay = document.querySelector('#overlayScrollContainer');
                if (!overlay) {
                     return { 
                        success: false, 
                        error: 'WRONG_CONTEXT: You are attempting to comment while on a feed/list page. Reddit requires you to be on the specific post page to comment. Please add a "Navigate" step to open the post first.' 
                     };
                }
            }

            const checkVisible = (el) => {
                return el && (el.offsetWidth > 0 || el.offsetHeight > 0 || el.getClientRects().length > 0);
            };

            if ('${rType}' === 'post') {
                // Top-level comment interaction flow
                
                const findEditor = () => {
                    // 1. Standard Shreddit elements or explicit role
                    let el = document.querySelector('shreddit-composer div[role="textbox"]') ||
                             document.querySelector('shreddit-composer div[contenteditable="true"]') || 
                             document.querySelector('shreddit-composer [role="textbox"]');
                    
                    // 2. Placeholder/Input variants
                    if (!el) {
                        const placeholder = document.querySelector('faceplate-textarea-input');
                        if (placeholder) {
                            el = placeholder.querySelector('textarea, div[contenteditable="true"], [role="textbox"]') || 
                                 (placeholder.shadowRoot ? placeholder.shadowRoot.querySelector('textarea, div[contenteditable="true"], [role="textbox"]') : null);
                        }
                    }

                    // 3. Simple textarea fallback
                    if (!el) el = document.querySelector('textarea[name="text"]');
                    
                    return el;
                };

                let editor = findEditor();
                
                // If it's a faceplate-textarea-pwa (seen in some mobile/lite views), click it
                if (!editor || !checkVisible(editor)) {
                    const potential = document.querySelector('faceplate-textarea-input, faceplate-textarea-pwa');
                    if (potential) {
                        log('Clicking potential editor host');
                        await safeClick(potential, 'Editor Host');
                        await wait(500);
                        editor = findEditor();
                    }
                }

                if (editor && checkVisible(editor) && editor.tagName !== 'FACEPLATE-TEXTAREA-INPUT') {
                    log('Found existing visible editor');
                } else {
                    const placeholder = document.querySelector('faceplate-textarea-input[placeholder="Share your thoughts"]') || 
                                        document.querySelector('faceplate-textarea-input');
                    if (placeholder) {
                        try {
                            log('Clicking comment placeholder');
                            const trigger = placeholder.shadowRoot ? (placeholder.shadowRoot.querySelector('textarea') || placeholder.shadowRoot.querySelector('div')) : null;
                            if (trigger) {
                                await safeClick(trigger, 'Comment Placeholder (Shadow)');
                            } else {
                                await safeClick(placeholder, 'Comment Placeholder (Host)');
                            }
                        } catch (err) {
                            log('Placeholder click error', err.toString());
                        }
                        
                        for (let i = 0; i < 30; i++) {
                            editor = findEditor();
                            if (editor && editor.tagName !== 'FACEPLATE-TEXTAREA-INPUT' && checkVisible(editor)) break;
                            await new Promise(r => setTimeout(r, 100));
                        }
                    }
                }
                
                if (!editor) {
                     return { success: false, error: 'Comment editor not found after attempting validation' };
                }

                if (editor) {
                    log('Focusing and clicking editor', { tagName: editor.tagName });
                    editor.scrollIntoView({ behavior: 'instant', block: 'center' });
                    await wait(200);

                    const r = editor.getBoundingClientRect();
                    const x = r.left + r.width/2;
                    const y = r.top + r.height/2;

                    if (typeof movePointer === 'function') movePointer(x, y);
                    
                    // Simulate full click sequence for framework listeners
                    editor.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, clientX: x, clientY: y }));
                    editor.focus();
                    editor.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, clientX: x, clientY: y }));
                    try { (editor as any).click(); } catch(e) {}
                    await wait(300);
                    
                    // Clear
                    try {
                        const isDiv = editor.tagName === 'DIV' || editor.getAttribute('contenteditable') === 'true';
                        if (isDiv) {
                            editor.innerHTML = ''; 
                            const selection = window.getSelection();
                            const range = document.createRange();
                            range.selectNodeContents(editor);
                            selection.removeAllRanges();
                            selection.addRange(range);
                            document.execCommand('delete', false, null);
                        } else {
                            (editor as any).value = '';
                        }
                    } catch (e) { log('Clear failed', e.toString()); }

                    log('Typing text into editor');
                    // Use beforeinput for rich editors that use it to update state
                    try {
                        editor.dispatchEvent(new InputEvent('beforeinput', { inputType: 'insertText', data: ${JSON.stringify(text)}, bubbles: true }));
                    } catch(e) {}
                    
                    document.execCommand('insertText', false, ${JSON.stringify(text)});
                    
                    const currentVal = editor.tagName === 'DIV' ? editor.textContent : (editor as any).value;
                    if (!currentVal || currentVal.length < 2) {
                        log('Fallback assignment');
                        if (editor.tagName === 'DIV') {
                            editor.textContent = ${JSON.stringify(text)};
                        } else {
                            (editor as any).value = ${JSON.stringify(text)};
                        }
                        editor.dispatchEvent(new Event('input', { bubbles: true }));
                        editor.dispatchEvent(new Event('change', { bubbles: true }));
                    }

                    await wait(500);
                    
                    // Submit button logic
                    const composer = editor.closest('shreddit-composer') || editor.closest('faceplate-textarea-input') || document;
                    let submitBtn = composer.querySelector('button[slot="submit-button"]') || 
                                    composer.querySelector('button[type="submit"]');
                    
                    if (!submitBtn) {
                        const buttons = Array.from(document.querySelectorAll('button')).filter(checkVisible);
                        submitBtn = buttons.find(b => {
                            const txt = (b.innerText || b.textContent || '').trim().toLowerCase();
                            return txt === 'comment' || txt === 'post';
                        });
                    }
                    
                    if (submitBtn) {
                         await safeClick(submitBtn, 'Submit Comment');
                         return { success: true, message: 'Comment submitted' };
                    } else {
                         return { success: false, error: 'Submit button not found' };
                    }
                }

            } else {
                // Reply to a comment
                 const comments = Array.from(document.querySelectorAll('shreddit-comment, .Comment')).filter(checkVisible);
                 const target = comments[${rIndex}] || comments[0];
                 if (!target) return { success: false, error: 'Comment to reply to not found' };
                 
                 let replyBtn = target.querySelector('button[slot="reply"]');
                 if (!replyBtn && target.shadowRoot) replyBtn = target.shadowRoot.querySelector('button[slot="reply"]');
                 
                 if (replyBtn) {
                    await safeClick(replyBtn, 'Reply Button');
                    
                    let editor = null;
                    const findReplyEditor = () => {
                         return target.querySelector('shreddit-composer div[role="textbox"]') ||
                                target.querySelector('shreddit-composer div[contenteditable="true"]') ||
                                target.querySelector('shreddit-composer [role="textbox"]') ||
                                (target.shadowRoot ? target.shadowRoot.querySelector('shreddit-composer div[role="textbox"]') : null);
                    };

                    for (let i = 0; i < 30; i++) {
                        editor = findReplyEditor();
                        if (!editor && target.nextElementSibling && target.nextElementSibling.tagName === 'SHREDDIT-COMPOSER') {
                            editor = target.nextElementSibling.querySelector('div[contenteditable="true"]') ||
                                     target.nextElementSibling.querySelector('[role="textbox"]');
                        }
                        if (editor && checkVisible(editor)) break;
                        await new Promise(r => setTimeout(r, 100));
                    }
                    
                    if (editor) {
                        log('Focusing and clicking reply editor');
                        editor.scrollIntoView({ behavior: 'instant', block: 'center' });
                        await wait(200);

                        const r = editor.getBoundingClientRect();
                        const x = r.left + r.width/2;
                        const y = r.top + r.height/2;

                        if (typeof movePointer === 'function') movePointer(x, y);
                        
                        editor.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, clientX: x, clientY: y }));
                        editor.focus();
                        editor.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, clientX: x, clientY: y }));
                        try { (editor as any).click(); } catch(e) {}
                        await wait(300);
                        
                        try {
                            const isDiv = editor.tagName === 'DIV' || editor.getAttribute('contenteditable') === 'true';
                            if (isDiv) {
                                editor.innerHTML = '';
                                const selection = window.getSelection();
                                const range = document.createRange();
                                range.selectNodeContents(editor);
                                selection.removeAllRanges();
                                selection.addRange(range);
                                document.execCommand('delete', false, null);
                            } else {
                                (editor as any).value = '';
                            }
                        } catch (e) {}

                        log('Typing reply text');
                        try {
                            editor.dispatchEvent(new InputEvent('beforeinput', { inputType: 'insertText', data: ${JSON.stringify(text)}, bubbles: true }));
                        } catch(e) {}
                        document.execCommand('insertText', false, ${JSON.stringify(text)});

                        const currentVal = editor.tagName === 'DIV' ? editor.textContent : (editor as any).value;
                        if (!currentVal || currentVal.length < 2) {
                            if (editor.tagName === 'DIV') {
                                editor.textContent = ${JSON.stringify(text)};
                            } else {
                                (editor as any).value = ${JSON.stringify(text)};
                            }
                            editor.dispatchEvent(new Event('input', { bubbles: true }));
                        }

                        await wait(500);
                        
                        const composer = editor.closest('shreddit-composer') || document;
                        let submitBtn = composer.querySelector('button[slot="submit-button"]') ||
                                        composer.querySelector('button[type="submit"]');
                        
                        if (!submitBtn) {
                            const buttons = Array.from(document.querySelectorAll('button')).filter(checkVisible);
                            submitBtn = buttons.find(b => {
                                const txt = (b.innerText || b.textContent || '').trim().toLowerCase();
                                return txt === 'reply' || txt === 'comment' || txt === 'post';
                            });
                        }

                        if (submitBtn) {
                            await safeClick(submitBtn, 'Submit Reply');
                            return { success: true, message: 'Replied to comment' };
                        } else {
                            return { success: false, error: 'Reply submit button not found' };
                        }
                    } else {
                        return { success: false, error: 'Reply composer editor not found after waiting' };
                    }
                 } else {
                    return { success: false, error: 'Reply button not found' };
                 }
            }
          })()
        `);
        return JSON.stringify(result);
      } catch (e) {
        return JSON.stringify({ success: false, error: String(e) });
      }
    }
  });

  const joinTool = new DynamicStructuredTool({
    name: 'reddit_join',
    description: 'Join or leave a subreddit.',
    schema: z.object({
      action: z.enum(['join', 'leave', 'toggle']).nullable().default('join'),
      subreddit: z.string().nullable().describe('Optional subreddit name. If not provided, acts on current page.'),
    }),
    func: async ({ action, subreddit }) => {
      const contents = ctx.getContents();
      if (subreddit) {
        const sub = subreddit.replace('r/', '').replace('/', '');
        await contents.loadURL(`https://www.reddit.com/r/${sub}`);
        await new Promise(r => setTimeout(r, 2000));
      }

      try {
        const result = await contents.executeJavaScript(`
               (async function() {
                 ${POINTER_HELPERS}
                 ${BASE_SCRIPT_HELPERS}
                 
                 // Look for Join button in header
                 const joinBtn = document.querySelector('shreddit-join-button') || document.querySelector('button[aria-label="Subscribe"]');
                 if (!joinBtn) return { success: false, error: 'Join button not found' };
                 
                 // Determine current state based on button text/state
                 // Shreddit button usually has 'subscribed' attribute or similar
                 // For now, simple toggle click as most join buttons are toggles
                 
                 await safeClick(joinBtn, 'Join/Leave Button');
                 return { success: true, message: 'Toggled join state' };
               })()
             `);
        return JSON.stringify(result);
      } catch (e) {
        return JSON.stringify({ success: false, error: String(e) });
      }
    }
  });

  return [searchTool, scoutCommunityTool, voteTool, commentTool, joinTool];
}
