import { z } from 'zod';
import { DynamicStructuredTool } from '@langchain/core/tools';

import type { SiteToolContext } from './types';

const POINTER_HELPERS = `
  function ensurePointerStyles() {
    if (document.getElementById('navreach-pointer-styles')) return;
    const style = document.createElement('style');
    style.id = 'navreach-pointer-styles';
    style.textContent = ' @keyframes navreachFloat { 0%, 100% { transform: translateY(0px); } 50% { transform: translateY(-3px); } } ';
    document.head.appendChild(style);
  }

  function movePointer(x, y) {
    ensurePointerStyles();
    let indicator = document.getElementById('navreach-pointer');
    if (!indicator) {
      indicator = document.createElement('div');
      indicator.id = 'navreach-pointer';
      const uniqueId = 'glass-gradient-' + Date.now();
      indicator.innerHTML = '<svg width="32" height="32" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M6 4L14 26L17.5 16.5L27 13L6 4Z" fill="url(#' + uniqueId + ')" stroke="rgba(255,255,255,0.9)" stroke-width="1.5"/><defs><linearGradient id="' + uniqueId + '" x1="6" y1="4" x2="27" y2="26" gradientUnits="userSpaceOnUse"><stop offset="0%" stop-color="rgba(80, 80, 80, 0.95)"/><stop offset="50%" stop-color="rgba(40, 40, 40, 0.95)"/><stop offset="100%" stop-color="rgba(10, 10, 10, 0.95)"/></linearGradient></defs></svg>';
      indicator.style.cssText = 'position:fixed;z-index:999999;pointer-events:none;filter:drop-shadow(0 4px 12px rgba(0,0,0,0.4));animation:navreachFloat 3s ease-in-out infinite;transition:left 0.3s ease, top 0.3s ease;';
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
    return new Promise((resolve, reject) => {
      const start = Date.now();
      const checking = () => {
        if (window.__NAVREACH_STOP__) {
          reject(new Error('Stopped by user'));
          return;
        }
        if (Date.now() - start >= ms) {
          resolve();
        } else {
          setTimeout(checking, 100);
        }
      };
      checking();
    });
  }

  async function safeClick(el, label) {
    const clickable = el.closest('button,[role="button"]') || el;
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

  async function followAuthorOfTweet(tweet, desiredAction = 'follow') {
    log('Attempting followAuthorOfTweet', { desiredAction });
    const caret = tweet.querySelector('[data-testid="caret"]');
    if (!caret) {
      log('Caret not found in tweet');
      return { success: false, error: 'Caret menu not found' };
    }
    
    await safeClick(caret, 'Caret Menu');
    await wait(800);
    
    const menu = document.querySelector('[data-testid="Dropdown"]');
    if (!menu) {
      log('Dropdown menu not found');
      return { success: false, error: 'Dropdown menu not found' };
    }
    
    const items = Array.from(menu.querySelectorAll('[role="menuitem"]'));
    const followStrings = ['Follow @', 'Sigue a @', 'Siga @', 'Seguir @'];
    const unfollowStrings = ['Unfollow @', 'Dejar de seguir @', 'Deixar de seguir @'];
    
    const followItem = items.find(el => {
      const txt = el.innerText || '';
      return followStrings.some(s => txt.includes(s));
    });
    
    const unfollowItem = items.find(el => {
      const txt = el.innerText || '';
      return unfollowStrings.some(s => txt.includes(s));
    });
    
    if ((desiredAction === 'unfollow' || desiredAction === 'toggle') && unfollowItem) {
      await safeClick(unfollowItem, 'Unfollow Menu Item');
      await wait(400);
      const confirm = document.querySelector('[data-testid="confirmationSheetConfirm"]');
      if (confirm && isVisible(confirm)) await safeClick(confirm, 'Confirm Unfollow');
      return { success: true, message: 'Unfollowed' };
    }
    
    if ((desiredAction === 'follow' || desiredAction === 'toggle') && followItem) {
      await safeClick(followItem, 'Follow Menu Item');
      return { success: true, message: 'Followed' };
    }
    
    if (desiredAction === 'follow' && unfollowItem) return { success: true, already: true, message: 'Already followed' };
    if (desiredAction === 'unfollow' && followItem) return { success: true, already: true, message: 'Already unfollowed' };
    
    // Close menu if nothing found
    await safeClick(caret, 'Close Caret Menu');
    return { success: false, error: 'Follow/Unfollow item not found in menu' };
  }
`;

export function createXComTools(ctx: SiteToolContext): DynamicStructuredTool[] {
  const searchTool = new DynamicStructuredTool({
    name: 'x_search',
    description: 'On X.com (Twitter), open the search results page for a given query.',
    schema: z.object({
      query: z.string().min(1).describe('Keywords or hashtags to search for.'),
      filter: z.enum(['top', 'latest', 'people', 'photos', 'videos']).nullable().describe('Result filter tab.').default(null),
    }),
    func: async ({ query, filter }: { query: string; filter?: string | null }) => {
      try {
        const contents = ctx.getContents();
        const filterMap: Record<string, string> = { top: 'top', latest: 'live', people: 'user', photos: 'image', videos: 'video' };
        const params = new URLSearchParams();
        params.set('q', query);
        params.set('src', 'typed_query');
        if (filter) params.set('f', filterMap[filter] || 'live');
        const url = `https://x.com/search?${params.toString()}`;
        await contents.loadURL(url);
        return JSON.stringify({ success: true, url });
      } catch (error) {
        return JSON.stringify({ success: false, error: String(error) });
      }
    },
  });

  const advancedSearchTool = new DynamicStructuredTool({
    name: 'x_advanced_search',
    description: 'On X.com (Twitter), perform a highly filtered search.',
    schema: z.object({
      allWords: z.string().nullable().default(null),
      exactPhrase: z.string().nullable().default(null),
      anyWords: z.string().nullable().default(null),
      noneWords: z.string().nullable().default(null),
      hashtags: z.string().nullable().default(null),
      fromAccount: z.string().nullable().default(null),
      toAccount: z.string().nullable().default(null),
      minLikes: z.number().nullable().default(null),
      since: z.string().nullable().default(null),
      until: z.string().nullable().default(null),
      filter: z.enum(['top', 'latest', 'people', 'photos', 'videos']).nullable().default(null),
    }),
    func: async (args: {
      allWords?: string | null;
      exactPhrase?: string | null;
      anyWords?: string | null;
      noneWords?: string | null;
      hashtags?: string | null;
      fromAccount?: string | null;
      toAccount?: string | null;
      minLikes?: number | null;
      since?: string | null;
      until?: string | null;
      filter?: string | null;
    }) => {
      try {
        const contents = ctx.getContents();
        const queryParts: string[] = [];
        if (args.allWords) queryParts.push(args.allWords.trim());
        if (args.exactPhrase) queryParts.push(`"${args.exactPhrase.trim()}"`);
        if (args.anyWords) {
          const p = args.anyWords.split(/[\\s,]+/).filter(Boolean);
          if (p.length) queryParts.push(`(${p.join(' OR ')})`);
        }
        if (args.noneWords) {
          args.noneWords.split(/[\\s,]+/).filter(Boolean).forEach(w => queryParts.push(`-${w}`));
        }
        if (args.hashtags) {
          args.hashtags.split(/[\\s,]+/).filter(Boolean).forEach(h => {
            const t = h.startsWith('#') ? h.slice(1) : h;
            queryParts.push(`#${t}`);
          });
        }
        if (args.fromAccount) queryParts.push(`from:${args.fromAccount.replace('@', '').trim()}`);
        if (args.toAccount) queryParts.push(`to:${args.toAccount.replace('@', '').trim()}`);
        if (args.minLikes && args.minLikes > 0) queryParts.push(`min_faves:${args.minLikes}`);
        if (args.since) queryParts.push(`since:${args.since}`);
        if (args.until) queryParts.push(`until:${args.until}`);

        const q = queryParts.join(' ');
        if (!q.trim()) return JSON.stringify({ success: false, error: 'No criteria' });

        const filterMap: any = { top: 'top', latest: 'live', people: 'user', photos: 'image', videos: 'video' };
        const params = new URLSearchParams();
        params.set('q', q);
        params.set('src', 'typed_query');
        if (args.filter) params.set('f', filterMap[args.filter] || 'live');
        const finalUrl = `https://x.com/search?${params.toString()}`;

        await contents.loadURL(finalUrl);
        return JSON.stringify({ success: true, url: finalUrl, query: q });
      } catch (e) {
        return JSON.stringify({ success: false, error: String(e) });
      }
    },
  });

  const likeTool = new DynamicStructuredTool({
    name: 'x_like',
    description: 'On X.com (Twitter), like/unlike a post.',
    schema: z.object({
      index: z.union([z.number(), z.string()]).nullable().describe('0-based index of the post.').default(0),
      action: z.enum(['like', 'unlike', 'toggle']).nullable().default('like'),
    }),
    func: async ({ index, action }: { index: number | string | null; action: 'like' | 'unlike' | 'toggle' | null }) => {
      const contents = ctx.getContents();
      const rIndex = parseInt(String(index ?? 0), 10);
      const rAction = action ?? 'like';
      try {
        const result = await contents.executeJavaScript(`
          (async function() {
            ${POINTER_HELPERS}
            ${BASE_SCRIPT_HELPERS}
            const host = window.location.hostname || '';
            if (!host.includes('x.com') && !host.includes('twitter.com')) return { success: false, error: 'Not on x.com' };

            const tweets = Array.from(document.querySelectorAll('[data-testid="tweet"]')).filter(isVisible);
            let target = null;
            if (tweets.length > 0) {
              target = tweets[${rIndex}] || tweets[tweets.length - 1];
            } else {
              target = document.body;
            }

            const likeBtns = Array.from(target.querySelectorAll('button[data-testid="like"], [data-testid="like"]')).filter(isVisible);
            const unlikeBtns = Array.from(target.querySelectorAll('button[data-testid="unlike"], [data-testid="unlike"]')).filter(isVisible);

            const desired = ${JSON.stringify(rAction)};
            
            let el = null;
            let act = desired;

            if (desired === 'like') {
              el = likeBtns[0];
              if (!el && unlikeBtns.length > 0) return { success: true, already: true, message: 'Already liked' };
            } else if (desired === 'unlike') {
              el = unlikeBtns[0];
              if (!el && likeBtns.length > 0) return { success: true, already: true, message: 'Already unliked' };
            } else {
              el = likeBtns[0] || unlikeBtns[0];
              act = likeBtns[0] ? 'like' : 'unlike';
            }

            if (!el) return { success: false, error: 'No buttons found' };
            await safeClick(el, act === 'unlike' ? 'Unlike' : 'Like');
            return { success: true, message: act + ' done' };
          })()
        `);
        return JSON.stringify(result);
      } catch (e) {
        return JSON.stringify({ success: false, error: String(e) });
      }
    }
  });

  const replyTool = new DynamicStructuredTool({
    name: 'x_reply',
    description: 'On X.com (Twitter), reply to a post.',
    schema: z.object({
      text: z.string().min(1),
      index: z.union([z.number(), z.string()]).nullable().describe('0-based index of the post.').default(0),
    }),
    func: async ({ text, index }: { text: string; index: number | string | null }) => {
      const contents = ctx.getContents();
      const rIndex = parseInt(String(index ?? 0), 10);
      try {
        const result = await contents.executeJavaScript(`
          (async function() {
            ${POINTER_HELPERS}
            ${BASE_SCRIPT_HELPERS}
            const host = window.location.hostname || '';
            if (!host.includes('x.com') && !host.includes('twitter.com')) return { success: false, error: 'Not on x.com' };

            const btns = Array.from(document.querySelectorAll('[data-testid="reply"]')).filter(isVisible);
            if (!btns.length) return { success: false, error: 'No reply buttons' };
            const btn = btns[${rIndex}] || btns[btns.length - 1];

            await safeClick(btn, 'Reply Button');
            await wait(1800);

            const modals = Array.from(document.querySelectorAll('[role="dialog"]')).filter(isVisible);
            const modal = modals.length ? modals[modals.length - 1] : null;
            const searchRoot = modal || document;

            let composer = searchRoot.querySelector('[data-testid="tweetTextarea_0"]') || 
                           searchRoot.querySelector('div[role="textbox"][contenteditable="true"]');
            
            if (!composer) return { success: false, error: 'No composer found after clicking reply' };
            
            await safeClick(composer, 'Composer');
            composer.focus();
            document.execCommand('selectAll', false, null); // Clear existing if any
            document.execCommand('insertText', false, ${JSON.stringify(text)});
            // Removed manual input event dispatch which caused duplication on some React inputs
            await wait(500);

            const send = searchRoot.querySelector('[data-testid="tweetButton"]');
            if (!send) return { success: false, error: 'No send button found' };
            await safeClick(send, 'Send Button');
            await wait(2000);
            return { success: true, message: 'Replied' };
          })()
        `);
        return JSON.stringify(result);
      } catch (e) {
        return JSON.stringify({ success: false, error: String(e) });
      }
    }
  });

  const postTool = new DynamicStructuredTool({
    name: 'x_post',
    description: 'On X.com (Twitter), create a new post.',
    schema: z.object({ text: z.string().min(1) }),
    func: async ({ text }: { text: string }) => {
      const contents = ctx.getContents();
      try {
        const result = await contents.executeJavaScript(`
          (async function() {
            ${POINTER_HELPERS}
            ${BASE_SCRIPT_HELPERS}
            const host = window.location.hostname || '';
            if (!host.includes('x.com') && !host.includes('twitter.com')) return { success: false, error: 'Not on x.com' };

            let composer = document.querySelector('[data-testid="tweetTextarea_0"]') || 
                           document.querySelector('div[role="textbox"][contenteditable="true"]');
            
            if (!composer) {
              const open = document.querySelector('[data-testid="SideNav_NewTweet_Button"]') || 
                           document.querySelector('[data-testid="AppTabBar_NewTweet_Button"]');
              if (open) {
                await safeClick(open, 'Open Composer');
                await wait(1500);
                composer = document.querySelector('[data-testid="tweetTextarea_0"]') || 
                           document.querySelector('div[role="textbox"][contenteditable="true"]');
              }
            }

            if (!composer) return { success: false, error: 'Could not find or open composer' };

            await safeClick(composer, 'Composer');
            composer.focus();
            document.execCommand('insertText', false, ${JSON.stringify(text)});
            composer.dispatchEvent(new Event('input', { bubbles: true }));
            await wait(500);

            const send = document.querySelector('[data-testid="tweetButton"]');
            if (!send) return { success: false, error: 'Post button missing' };
            await safeClick(send, 'Post Button');
            await wait(2000);
            return { success: true, message: 'Posted' };
          })()
        `);
        return JSON.stringify(result);
      } catch (e) {
        return JSON.stringify({ success: false, error: String(e) });
      }
    }
  });

  const followTool = new DynamicStructuredTool({
    name: 'x_follow',
    description: 'On X.com (Twitter), follow/unfollow a user. Targets search results or timeline tweets.',
    schema: z.object({
      index: z.union([z.number(), z.string()]).nullable().default(0),
      action: z.enum(['follow', 'unfollow', 'toggle']).nullable().default('follow'),
    }),
    func: async ({ index, action }: { index: number | string | null; action: 'follow' | 'unfollow' | 'toggle' | null }) => {
      const contents = ctx.getContents();
      const rIndex = parseInt(String(index ?? 0), 10);
      const rAction = action ?? 'follow';
      try {
        const result = await contents.executeJavaScript(`
          (async function() {
            try {
              ${POINTER_HELPERS}
              ${BASE_SCRIPT_HELPERS}
              
              const desired = ${JSON.stringify(rAction)};
              const idx = ${rIndex};

              // 1. Target UserCell (Search Results / People Tab / Sidebar)
              const cells = Array.from(document.querySelectorAll('[data-testid="UserCell"]')).filter(isVisible);
              if (cells.length > 0 && idx < cells.length) {
                const cell = cells[idx];
                const f = cell.querySelector('[data-testid$="-follow"], [data-testid$="-Follow"]');
                const u = cell.querySelector('[data-testid$="-unfollow"], [data-testid$="-Unfollow"]');
                if ((desired === 'unfollow' || desired === 'toggle') && u) {
                  await safeClick(u, 'Unfollow');
                  await wait(500);
                  const c = document.querySelector('[data-testid="confirmationSheetConfirm"]');
                  if (c) await safeClick(c, 'Confirm');
                  return { success: true, message: 'Unfollowed user cell' };
                }
                if ((desired === 'follow' || desired === 'toggle') && f) {
                  await safeClick(f, 'Follow');
                  return { success: true, message: 'Followed user cell' };
                }
                if (desired === 'unfollow' && !u) return { success: true, already: true, message: 'Already unfollowed' };
                if (desired === 'follow' && !f) return { success: true, already: true, message: 'Already followed' };
              }

              // 2. Target Profile Follow Button
              const profF = document.querySelector('[data-testid$="-follow"], [data-testid$="-Follow"]');
              const profU = document.querySelector('[data-testid$="-unfollow"], [data-testid$="-Unfollow"]');
              if (idx === 0 && (profF || profU)) {
                 if ((desired === 'unfollow' || desired === 'toggle') && profU) {
                    await safeClick(profU, 'Profile Unfollow');
                    await wait(500);
                    const c = document.querySelector('[data-testid="confirmationSheetConfirm"]');
                    if (c) await safeClick(c, 'Confirm');
                    return { success: true, message: 'Unfollowed profile' };
                 }
                 if ((desired === 'follow' || desired === 'toggle') && profF) {
                    await safeClick(profF, 'Profile Follow');
                    return { success: true, message: 'Followed profile' };
                 }
              }

              // 3. Fallback: Target via Caret Menu on Tweets (Timeline)
              const tweets = Array.from(document.querySelectorAll('[data-testid="tweet"]')).filter(isVisible);
              if (tweets.length > 0 && idx < tweets.length) {
                return await followAuthorOfTweet(tweets[idx], desired);
              }

              return { success: false, error: 'No follow target found at index ' + idx, logs };
            } catch(e) {
              return { success: false, error: e.toString(), logs };
            }
          })()
        `);
        return JSON.stringify(result);
      } catch (e) {
        return JSON.stringify({ success: false, error: String(e) });
      }
    }
  });

  const engageTool = new DynamicStructuredTool({
    name: 'x_engage',
    description: 'Perform multiple actions (like, follow, retweet, reply) on a tweet.',
    schema: z.object({
      targetIndex: z.union([z.number(), z.string()]).nullable().default(0),
      actions: z.string().describe('Comma separated: like,follow,retweet,reply'),
      replyText: z.string().nullable().default(null),
    }),
    func: async ({ targetIndex, actions, replyText }: { targetIndex: number | string | null; actions: string; replyText: string | null }) => {
      const contents = ctx.getContents();
      const rIndex = parseInt(String(targetIndex ?? 0), 10);
      try {
        const result = await contents.executeJavaScript(`
          (async function() {
            try {
              ${POINTER_HELPERS}
              ${BASE_SCRIPT_HELPERS}

              const actionsList = ${JSON.stringify(actions || '')}.split(',').map(a => a.trim().toLowerCase());
              const tweets = Array.from(document.querySelectorAll('[data-testid="tweet"]')).filter(isVisible);
              if (!tweets.length) return { success: false, error: 'No tweets visible to engage with.' };
              const tweet = tweets[${rIndex}] || tweets[0];
              
              const results = [];

              if (actionsList.includes('like')) {
                const b = tweet.querySelector('[data-testid="like"]');
                const u = tweet.querySelector('[data-testid="unlike"]');
                if (b && isVisible(b)) {
                   await safeClick(b, 'Like');
                   results.push('Liked');
                } else if (u && isVisible(u)) {
                   results.push('Already Liked');
                }
              }

              if (actionsList.includes('follow')) {
                const res = await followAuthorOfTweet(tweet, 'follow');
                results.push(res.success ? (res.already ? 'Already Followed' : 'Followed') : 'Follow Failed: ' + res.error);
              }

              if (actionsList.includes('retweet')) {
                const b = tweet.querySelector('[data-testid="retweet"]');
                if (b && isVisible(b)) {
                  await safeClick(b, 'Retweet Menu');
                  await wait(800);
                  const confirm = document.querySelector('[data-testid="retweetConfirm"]');
                  if (confirm && isVisible(confirm)) {
                    await safeClick(confirm, 'Retweet Action');
                    results.push('Retweeted');
                  } else {
                    // Try closing the menu if it opened but no confirm button
                    await safeClick(b, 'Close Retweet Menu');
                    results.push('Retweet Confirm Button Not Found');
                  }
                }
              }

              if (actionsList.includes('reply') && ${JSON.stringify(replyText || '')}) {
                const b = tweet.querySelector('[data-testid="reply"]');
                if (b && isVisible(b)) {
                  await safeClick(b, 'Reply');
                  await wait(2000);
                  const modals = Array.from(document.querySelectorAll('[role="dialog"]')).filter(isVisible);
                  const modal = modals.length ? modals[modals.length - 1] : null;
                  const searchRoot = modal || document;

                  const engagedTweetHandle = tweet.innerText.split('\\n')[1] || 'Unknown';

                  const comp = searchRoot.querySelector('[data-testid="tweetTextarea_0"]') || 
                               searchRoot.querySelector('div[role="textbox"][contenteditable="true"]');
                  if (comp) {
                    await safeClick(comp, 'Composer');
                    comp.focus();
                    document.execCommand('selectAll', false, null); // Clear existing if any
                    document.execCommand('insertText', false, ${JSON.stringify(replyText || '')});
                    // Removed manual input event dispatch
                    await wait(800);
                    const s = searchRoot.querySelector('[data-testid="tweetButton"]');
                    if (s) {
                      await safeClick(s, 'Send Reply');
                      results.push('Replied to ' + engagedTweetHandle);
                    } else {
                      results.push('Reply Send Button Not Found');
                    }
                  } else {
                    results.push('Reply Composer Not Found');
                  }
                }
              }

              return { success: true, actions_performed: results, logs };
            } catch(e) {
              return { success: false, error: e.toString(), logs };
            }
          })()
        `);
        return JSON.stringify(result);
      } catch (e) {
        return JSON.stringify({ success: false, error: String(e) });
      }
    }
  });

  const engagingTool = new DynamicStructuredTool({
    name: 'Engaging',
    description: 'Perform multiple actions (like, follow, retweet, reply) on a tweet. Alias: x_engage.',
    schema: engageTool.schema,
    func: engageTool.func,
  });

  return [searchTool, advancedSearchTool, likeTool, replyTool, postTool, followTool, engageTool, engagingTool];
}
