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
      indicator.style.cssText = 'position:fixed;z-index:999999;pointer-events:none;filter:drop-shadow(0 4px 12px rgba(0,0,0,0.4));animation:reavionFloat 3s ease-in-out infinite;transition:all 0.4s cubic-bezier(0.165, 0.84, 0.44, 1);';
      document.body.appendChild(indicator);
    }
    // Always update visual style to clear any cached purple versions
    indicator.innerHTML = '<svg width="32" height="32" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M6 4L14 26L17.5 16.5L27 13L6 4Z" fill="#000000" stroke="#ffffff" stroke-width="1.5"/></svg>';
    indicator.style.left = x + 'px';
    indicator.style.top = y + 'px';
     // Visual kick on movement
    indicator.style.transform = 'scale(1.1)';
    setTimeout(() => { if (indicator) indicator.style.transform = 'scale(1)'; }, 400);
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
    const isFast = multiplier < 1.0;
    // HUMAN BEHAVIOR: Add +/- 25% randomness + small base jitter, but scale down for FAST mode
    const randomFactor = isFast ? (0.9 + Math.random() * 0.2) : (0.75 + (Math.random() * 0.5)); 
    const jitter = Math.random() * (isFast ? 50 : 200);
    const adjustedMs = Math.round((ms * multiplier * randomFactor) + jitter);
    
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
          setTimeout(checking, 20); // Faster check interval
        }
      };
      checking();
    });
  }

  async function safeClick(el, label, options = {}) {
    const clickable = el.closest('button, a, [role="button"]') || el;
    log('Clicking ' + label, { tagName: clickable.tagName });
    
    const rectBefore = clickable.getBoundingClientRect();
    if (rectBefore.top < 100 || rectBefore.bottom > window.innerHeight - 100) {
      clickable.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' });
      await wait(options.scrollWait || 600);
    }

    const rect = clickable.getBoundingClientRect();
    const x = rect.left + rect.width / 2;
    const y = rect.top + rect.height / 2;
    if (typeof movePointer === 'function') movePointer(x, y);
    
    await wait(options.focusWait || 300);
    
    try {
      const common = { bubbles: true, cancelable: true, view: window };
      clickable.dispatchEvent(new MouseEvent('mousedown', common));
      clickable.dispatchEvent(new MouseEvent('mouseup', common));
      clickable.click();
    } catch (e) {
      log('Native click failed on ' + label, { error: e.toString() });
      throw e;
    }
    await wait(options.afterWait || 800);
  }

  function getRedditPostData(p, i) {
    // Shreddit Post (Modern Reddit)
    const title = p.getAttribute('post-title') || 
                  p.querySelector('[slot="title"]')?.innerText || 
                  p.querySelector('h3')?.innerText || 
                  '';
    const author = p.getAttribute('author') || p.querySelector('[slot="author"]')?.innerText || '';
    const url = p.getAttribute('content-href') || p.getAttribute('permalink') || '';
    const score = p.getAttribute('score') || '';
    const commentCount = p.getAttribute('comment-count') || '';
    
    // Check engagement
    let isUpvoted = false;
    let isDownvoted = false;
    
    // Shreddit buttons state
    if (p.shadowRoot) {
      const upBtn = p.shadowRoot.querySelector('button[upvote]');
      const downBtn = p.shadowRoot.querySelector('button[downvote]');
      isUpvoted = upBtn?.getAttribute('aria-pressed') === 'true';
      isDownvoted = downBtn?.getAttribute('aria-pressed') === 'true';
    } else {
       // Light DOM fallback
       const upBtn = p.querySelector('button[upvote], button[name="upvote"]');
       isUpvoted = upBtn?.getAttribute('aria-pressed') === 'true';
    }

    const isPromoted = p.hasAttribute('is-promoted') || p.querySelector('.promoted-tag') || p.innerText.includes('Promoted');

    return {
      index: i,
      title,
      author,
      url: url ? (url.startsWith('http') ? url : 'https://www.reddit.com' + url) : '',
      score,
      commentCount,
      isUpvoted,
      isDownvoted,
      isPromoted,
      isEngaged: isUpvoted || isDownvoted
    };
  }

  async function findTargetRobustly(index, type = 'post') {
     const selector = type === 'post' ? 'shreddit-post, .Post' : 'shreddit-comment, .Comment';
     const items = Array.from(document.querySelectorAll(selector)).filter(isVisible);
     const target = items[index]; // Don't fallback to items[0] automatically here, handle in tool
     if (!target) return null;
     if (!isVisible(target)) {
         target.scrollIntoView({ behavior: 'smooth', block: 'center' });
         await wait(800);
     }
     return target;
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
                
                // Robust waiting for posts
                const waitForPosts = async () => {
                  const start = Date.now();
                  while (Date.now() - start < 10000) {
                    if (window.__REAVION_STOP__) break;
                    const posts = document.querySelectorAll('shreddit-post, .Post');
                    if (posts.length > 0) return true;
                    await new Promise(r => setTimeout(r, 500));
                  }
                  return false;
                };

                await waitForPosts();
                
                // Scroll to load a few more
                window.scrollBy(0, 1200);
                await wait(1500);

                const posts = Array.from(document.querySelectorAll('shreddit-post, .Post')).slice(0, ${limit || 15});
                const data = posts.map((p, i) => getRedditPostData(p, i));

                return { 
                  success: true, 
                  postCount: data.length, 
                  foundPosts: data.length,
                  posts: data,
                  message: 'Scanned r/' + window.location.pathname.split('/')[2] + '. Found ' + data.length + ' posts.'
                };
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
                 try {
                     ${POINTER_HELPERS}
                     ${BASE_SCRIPT_HELPERS}
                     
                     const target = await findTargetRobustly(${rIndex}, '${rType}');
                     if (!target) return { success: false, error: 'Target ' + '${rType}' + ' not found at index ' + ${rIndex}, logs };

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
                        await safeClick(btn, desired + 'vote');
                        return { success: true, message: desired + 'voted', logs };
                     } 
                     
                     return { success: false, error: 'Vote buttons not found via selectors', logs };
                 } catch (e) {
                     return { success: false, error: e.toString() };
                 }
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
            try {
                ${POINTER_HELPERS}
                ${BASE_SCRIPT_HELPERS}

                // --- 1. Robust Context Detection & Transition ---
                let isPostPage = false;
                let overlay = null;
                
                const updateContext = () => {
                    isPostPage = window.location.href.includes('/comments/') || 
                                 !!document.querySelector('shreddit-comment-tree') ||
                                 !!document.querySelector('shreddit-post[full-post]');
                    overlay = document.querySelector('#overlayScrollContainer') || 
                              document.querySelector('shreddit-async-loader[slot="full-post-loader"]') ||
                              document.querySelector('shreddit-async-loader[slot="overlay-loader"]') ||
                              document.querySelector('faceplate-tracker[source="post_detail"]');
                    return isPostPage || !!overlay;
                };

                // Wait up to 4s for transition if we just arrived or are loading
                for (let i = 0; i < 20; i++) {
                    if (updateContext()) break;
                    await wait(200);
                }

                // --- 2. Auto-Navigation if in Feed ---
                if ('${rType}' === 'post' && !isPostPage && !overlay) {
                     const isFeedPage = window.location.pathname.includes('/new/') || 
                                       window.location.pathname.includes('/top/') || 
                                       window.location.pathname.includes('/hot/') ||
                                       window.location.pathname.endsWith('/r/') ||
                                       window.location.pathname === '/';
                     
                     if (isFeedPage) {
                         log('Currently on feed, searching for post at index ' + ${rIndex});
                         const targetPost = await findTargetRobustly(${rIndex}, 'post');
                         if (targetPost) {
                             log('Found target post, navigating to detail page...');
                             // Click the title or the post itself to open
                             const titleLink = targetPost.querySelector('a[slot="full-post-link"]') || 
                                               targetPost.querySelector('a[href*="/comments/"]') ||
                                               targetPost.querySelector('h3, [slot="title"]') ||
                                               targetPost;
                             
                             await safeClick(titleLink, 'Post Link');
                             
                             // Wait for detail view to appear
                             for (let i = 0; i < 30; i++) {
                                if (updateContext()) break;
                                await wait(250);
                             }
                         } else {
                             log('Post not found at index ' + ${rIndex} + ' in feed.');
                         }
                     }
                }

                const checkVisible = (el) => {
                    if (!el) return false;
                    const rect = el.getBoundingClientRect();
                    return rect.width > 0 && rect.height > 0;
                };

                if ('${rType}' === 'post') {
                    // Top-level comment interaction flow
                    
                    const findEditor = () => {
                        // Priority 1: Shadow DOM composers (Modern Reddit) - Use querySelectorPierce if available
                        let el = querySelectorPierce('shreddit-composer [role="textbox"]') ||
                                 querySelectorPierce('shreddit-composer [contenteditable="true"]') ||
                                 querySelectorPierce('comment-composer-host [role="textbox"]') ||
                                 querySelectorPierce('comment-composer-host [contenteditable="true"]') ||
                                 querySelectorPierce('.lexical-editor-container [contenteditable="true"]') ||
                                 querySelectorPierce('.rich-text-editor [contenteditable="true"]');

                        if (!el) {
                            const composers = document.querySelectorAll('shreddit-composer, comment-composer-host, [role="composer"]');
                            for (const composer of Array.from(composers)) {
                                if (composer.shadowRoot) {
                                    el = composer.shadowRoot.querySelector('div[contenteditable="true"]') || 
                                         composer.shadowRoot.querySelector('[role="textbox"]') ||
                                         composer.shadowRoot.querySelector('.lexical-editor-container [contenteditable="true"]') ||
                                         composer.shadowRoot.querySelector('.rich-text-editor') ||
                                         composer.shadowRoot.querySelector('#comment-composer');
                                }
                                if (!el) {
                                    el = composer.querySelector('div[contenteditable="true"]') || 
                                         composer.querySelector('[role="textbox"]');
                                }
                                if (el && checkVisible(el)) break;
                            }
                        }

                        // Priority 2: Faceplate textarea (Mobile/Lite)
                        if (!el) {
                            const faceplates = document.querySelectorAll('faceplate-textarea-input, faceplate-textarea-pwa');
                            for (const fp of Array.from(faceplates)) {
                               let elFp = null;
                               if (fp.shadowRoot) {
                                   elFp = fp.shadowRoot.querySelector('textarea, div[contenteditable="true"], [role="textbox"]');
                               }
                               if (!elFp) {
                                   elFp = fp.querySelector('textarea, div[contenteditable="true"], [role="textbox"]');
                               }
                               if (elFp && checkVisible(elFp)) {
                                   el = elFp;
                                   break;
                               }
                            }
                        }

                        // Priority 3: Global search for common roles
                        if (!el) {
                            el = document.querySelector('div[role="textbox"][contenteditable="true"]') ||
                                 document.querySelector('textarea[name="text"]') ||
                                 document.querySelector('.CommentForm textarea');
                        }
                        
                        return el;
                    };


                    let editor = findEditor();
                    
                    // If it's a closed composer, we might need to click it first
                    if (!editor || !checkVisible(editor)) {
                        const potential = document.querySelector('faceplate-textarea-input') || 
                                         document.querySelector('faceplate-textarea-pwa') ||
                                         document.querySelector('shreddit-composer') ||
                                         document.querySelector('#comment-composer-host');
                        
                        if (potential) {
                            log('Clicking composer host to expand', { tagName: potential.tagName });
                            try {
                                await safeClick(potential, 'Editor Host');
                                await wait(800);
                                editor = findEditor();
                            } catch (e) { log('Host click failed', e.toString()); }
                        }
                    }

                    // Retry lookups for a while (up to 8 seconds for slow loads)
                    if (!editor || !checkVisible(editor)) {
                         log('Editor not visible, waiting for discovery...');
                         for (let i = 0; i < 40; i++) {
                            if (window.__REAVION_STOP__) break;
                            editor = findEditor();
                            if (editor && checkVisible(editor)) break;
                            await new Promise(r => setTimeout(r, 200));
                        }
                    }
                    
                    if (!editor) {
                         return { 
                           success: false, 
                           error: 'Comment editor not found. If this is a restricted community or you are not logged in, please check the browser state. Detail logs: ' + JSON.stringify(logs) 
                         };
                    }

                    if (editor) {
                        log('Focusing and clicking editor', { tagName: editor.tagName });
                        editor.scrollIntoView({ behavior: 'smooth', block: 'center' });
                        await wait(500);

                        const r = editor.getBoundingClientRect();
                        const x = r.left + r.width/2;
                        const y = r.top + r.height/2;

                        if (typeof movePointer === 'function') movePointer(x, y);
                        
                        editor.focus({ preventScroll: true });
                        editor.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, clientX: x, clientY: y }));
                        editor.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, clientX: x, clientY: y }));
                        try { (editor as any).click(); } catch(e) {}
                        await wait(400);
                        
                        log('Clearing existing content if any...');
                        try {
                            const isDiv = editor.tagName === 'DIV' || editor.getAttribute('contenteditable') === 'true';
                            if (isDiv) {
                                editor.focus();
                                const selection = window.getSelection();
                                const range = document.createRange();
                                range.selectNodeContents(editor);
                                selection.removeAllRanges();
                                selection.addRange(range);
                                document.execCommand('delete', false, null);
                                // Absolute clear for Lexical/Shadow DOM
                                if (editor.textContent.length > 0) {
                                   editor.textContent = '';
                                   editor.innerHTML = '';
                                }
                            } else {
                                (editor as any).value = '';
                                editor.dispatchEvent(new Event('input', { bubbles: true }));
                            }
                        } catch (e) { log('Clear failed', e.toString()); }

                        log('Attempting to type text: ' + ${JSON.stringify(text)});
                        
                        const typeIntoEditor = (txt) => {
                             const isDiv = editor.tagName === 'DIV' || editor.getAttribute('contenteditable') === 'true';
                             if (isDiv) {
                                 editor.focus();
                                 document.execCommand('insertText', false, txt);
                                 // Verification
                                 if (editor.textContent.indexOf(txt) === -1) {
                                     log('insertText failed/partial, setting textContent as fallback');
                                     editor.textContent = txt;
                                     editor.dispatchEvent(new Event('input', { bubbles: true }));
                                 }
                             } else {
                                 (editor as any).value = txt;
                                 editor.dispatchEvent(new Event('input', { bubbles: true }));
                                 editor.dispatchEvent(new Event('change', { bubbles: true }));
                             }
                        };

                        typeIntoEditor(${JSON.stringify(text)});
                        await wait(600);
                        
                        // Second pass check
                        let finalVal = editor.tagName === 'DIV' ? editor.textContent : (editor as any).value;
                        if (!finalVal || finalVal.trim().length === 0) {
                            log('Editor value empty after typing, retrying...');
                            typeIntoEditor(${JSON.stringify(text)});
                            await wait(500);
                        }


                        await wait(600);
                        
                        // Submit button logic
                        const findSubmitBtn = () => {
                            // Try piercing through composer first
                            const composer = editor.closest('shreddit-composer') || 
                                             editor.closest('faceplate-textarea-input') || 
                                             editor.closest('comment-composer-host') ||
                                             document;

                            let btn = composer.querySelector('button[slot="submit-button"]') || 
                                      composer.querySelector('button[type="submit"]') ||
                                      composer.querySelector('button.send-button');
                            
                            // Deep pierce for shadow buttons
                            if (!btn) {
                                btn = querySelectorPierce('shreddit-composer [slot="submit-button"]') ||
                                      querySelectorPierce('shreddit-composer button[type="submit"]') ||
                                      querySelectorPierce('comment-composer-host [slot="submit-button"]') ||
                                      querySelectorPierce('comment-composer-host button[type="submit"]');
                            }

                            if (!btn) {
                                const allBtns = Array.from(document.querySelectorAll('button')).filter(checkVisible);
                                btn = allBtns.find(b => {
                                    const txt = (b.innerText || b.textContent || '').trim().toLowerCase();
                                    return (txt === 'comment' || txt === 'post' || txt === 'reply') && !txt.includes('sort');
                                });
                            }
                            return btn;
                        };


                        const submitBtn = findSubmitBtn();
                        if (submitBtn) {
                             await safeClick(submitBtn, 'Submit Comment');
                             return { success: true, message: 'Comment submitted successfully.', logs };
                        } else {
                             return { success: false, error: 'Submit button not found', logs };
                        }
                    }

                } else {
                    // Reply to a comment
                     const comments = Array.from(document.querySelectorAll('shreddit-comment, .Comment')).filter(checkVisible);
                     const target = comments[${rIndex}] || comments[0];
                     if (!target) return { success: false, error: 'Comment to reply to not found', logs };
                     
                      let replyBtn = target.querySelector('button[name="reply"]') || 
                                     target.querySelector('button[slot="reply"]') ||
                                     target.querySelector('[data-testid="reply-button"]');
                      
                      if (!replyBtn && target.shadowRoot) {
                         replyBtn = target.shadowRoot.querySelector('button[name="reply"]') || 
                                    target.shadowRoot.querySelector('button[slot="reply"]');
                      }
                      
                      if (!replyBtn) {
                         const actionRow = target.querySelector('shreddit-comment-action-row');
                         if (actionRow && actionRow.shadowRoot) {
                             replyBtn = actionRow.shadowRoot.querySelector('button[name="reply"]');
                         }
                      }

                      if (replyBtn) {
                         await safeClick(replyBtn, 'Reply Button');
                         await wait(1200); // Wait for async loader
                        
                        let editor = null;
                        const findReplyEditor = () => {
                              const area = target.parentElement || document;
                              let el = area.querySelector('shreddit-composer div[role="textbox"]') ||
                                      area.querySelector('shreddit-composer div[contenteditable="true"]') ||
                                      area.querySelector('shreddit-composer [role="textbox"]');
                              
                              if (!el) {
                                  el = querySelectorPierce('shreddit-composer [role="textbox"]') ||
                                       querySelectorPierce('shreddit-composer [contenteditable="true"]') ||
                                       querySelectorPierce('comment-composer-host [role="textbox"]') ||
                                       querySelectorPierce('comment-composer-host [contenteditable="true"]') ||
                                       querySelectorPierce('.lexical-editor-container [contenteditable="true"]');
                              }
                              return el;
                        };


                        for (let i = 0; i < 40; i++) {
                            if (window.__REAVION_STOP__) break;
                            editor = findReplyEditor();
                            // Fallback: look for sibling composer (old reddit/some views)
                            if (!editor && target.nextElementSibling && target.nextElementSibling.tagName === 'SHREDDIT-COMPOSER') {
                                const sibling = target.nextElementSibling;
                                editor = sibling.querySelector('div[contenteditable="true"]') ||
                                         sibling.querySelector('[role="textbox"]');
                                // Check sibling shadow
                                if (!editor && sibling.shadowRoot) {
                                     editor = sibling.shadowRoot.querySelector('div[contenteditable="true"]') ||
                                              sibling.shadowRoot.querySelector('[role="textbox"]');
                                }
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
                            editor.focus({ preventScroll: true });
                            editor.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, clientX: x, clientY: y }));
                            try { (editor as any).click(); } catch(e) {}
                            await wait(300);
                                                       log('Clearing reply editor...');
                            try {
                                const isDiv = editor.tagName === 'DIV' || editor.getAttribute('contenteditable') === 'true';
                                if (isDiv) {
                                    editor.focus();
                                    const selection = window.getSelection();
                                    const range = document.createRange();
                                    range.selectNodeContents(editor);
                                    selection.removeAllRanges();
                                    selection.addRange(range);
                                    document.execCommand('delete', false, null);
                                    if (editor.textContent.length > 0) {
                                        editor.textContent = '';
                                        editor.innerHTML = '';
                                    }
                                } else {
                                    (editor as any).value = '';
                                    editor.dispatchEvent(new Event('input', { bubbles: true }));
                                }
                            } catch (e) {}

                            log('Typing reply text: ' + ${JSON.stringify(text)});
                            const typeIntoReply = (txt) => {
                                 const isDiv = editor.tagName === 'DIV' || editor.getAttribute('contenteditable') === 'true';
                                 if (isDiv) {
                                     editor.focus();
                                     document.execCommand('insertText', false, txt);
                                     if (editor.textContent.indexOf(txt) === -1) {
                                         editor.textContent = txt;
                                         editor.dispatchEvent(new Event('input', { bubbles: true }));
                                     }
                                 } else {
                                     (editor as any).value = txt;
                                     editor.dispatchEvent(new Event('input', { bubbles: true }));
                                 }
                            };
                            
                            typeIntoReply(${JSON.stringify(text)});
                            await wait(500);

                            let rFinalVal = editor.tagName === 'DIV' ? editor.textContent : (editor as any).value;
                            if (!rFinalVal || rFinalVal.trim().length === 0) {
                                log('Reply editor value empty, retrying typing...');
                                typeIntoReply(${JSON.stringify(text)});
                            }


                            await wait(500);
                            
                            let submitBtn = null;
                            const composer = editor.closest('shreddit-composer') || 
                                             editor.closest('comment-composer-host') || 
                                             document;
                                             
                            submitBtn = composer.querySelector('button[slot="submit-button"]') ||
                                        composer.querySelector('button[type="submit"]');
                            
                            if (!submitBtn) {
                                submitBtn = querySelectorPierce('shreddit-composer [slot="submit-button"]') ||
                                            querySelectorPierce('shreddit-composer button[type="submit"]') ||
                                            querySelectorPierce('comment-composer-host [slot="submit-button"]') ||
                                            querySelectorPierce('comment-composer-host button[type="submit"]');
                            }

                            if (!submitBtn) {
                                const buttons = Array.from(document.querySelectorAll('button')).filter(checkVisible);
                                submitBtn = buttons.find(b => {
                                    const txt = (b.innerText || b.textContent || '').trim().toLowerCase();
                                    return (txt === 'reply' || txt === 'comment' || txt === 'post') && !txt.includes('sort');
                                });
                            }


                            if (submitBtn) {
                                await safeClick(submitBtn, 'Submit Reply');
                                return { success: true, message: 'Replied to comment', logs };
                            } else {
                                return { success: false, error: 'Reply submit button not found', logs };
                            }
                        } else {
                            return { success: false, error: 'Reply composer editor not found after waiting', logs };
                        }
                     } else {
                        return { success: false, error: 'Reply button not found', logs };
                     }
                }
            } catch (err) {
                return { success: false, error: err.toString(), stack: err.stack, logs };
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

  const scanPostsTool = new DynamicStructuredTool({
    name: 'reddit_scan_posts',
    description: 'Scan visible posts on the current Reddit page to get their titles, authors, and engagement status. Use this to identify targets without navigating.',
    schema: z.object({
      limit: z.number().nullable().default(10),
    }),
    func: async ({ limit }: { limit: number | null }) => {
      const contents = ctx.getContents();
      try {
        const result = await contents.executeJavaScript(`
          (async function() {
            ${BASE_SCRIPT_HELPERS}
            const posts = Array.from(document.querySelectorAll('shreddit-post, .Post')).slice(0, ${limit || 15});
            const data = posts.map((p, i) => getRedditPostData(p, i));
            
            return { 
              success: true, 
              count: data.length, 
              posts: data,
              message: 'Scanned ' + data.length + ' visible posts.'
            };
          })()
        `);
        return JSON.stringify(result);
      } catch (e) {
        return JSON.stringify({ success: false, error: String(e) });
      }
    }
  });

  return [searchTool, scoutCommunityTool, voteTool, commentTool, joinTool, scanPostsTool];
}
