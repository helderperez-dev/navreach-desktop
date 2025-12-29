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
      indicator.innerHTML = '<svg width="32" height="32" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M6 4L14 26L17.5 16.5L27 13L6 4Z" fill="url(#' + uniqueId + ')" stroke="rgba(255,255,255,0.9)" stroke-width="1.5"/><defs><linearGradient id="' + uniqueId + '" x1="6" y1="4" x2="27" y2="26" gradientUnits="userSpaceOnUse"><stop offset="0%" stop-color="#8b5cf6"/><stop offset="50%" stop-color="#7c3aed"/><stop offset="100%" stop-color="#6d28d9"/></linearGradient></defs></svg>';
      indicator.style.cssText = 'position:fixed;z-index:999999;pointer-events:none;filter:drop-shadow(0 4px 12px rgba(0,0,0,0.4));animation:reavionFloat 3s ease-in-out infinite;transition:all 0.4s cubic-bezier(0.165, 0.84, 0.44, 1);';
      document.body.appendChild(indicator);
    }
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
          setTimeout(checking, 50); // Reduced check interval
        }
      };
      checking();
    });
  }

  async function safeClick(el, label, options = {}) {
    const clickable = el.closest('button,[role="button"]') || el;
    log('Clicking ' + label, { tagName: clickable.tagName });
    
    // Check if element is already largely in view to skip heavy scroll
    const rectBefore = clickable.getBoundingClientRect();
    if (rectBefore.top < 100 || rectBefore.bottom > window.innerHeight - 100) {
      clickable.scrollIntoView({ behavior: 'instant', block: 'center', inline: 'center' });
      await wait(options.scrollWait || 250);
    }
    
    const rect = clickable.getBoundingClientRect();
    const x = rect.left + rect.width / 2;
    const y = rect.top + rect.height / 2;
    if (typeof movePointer === 'function') movePointer(x, y);
    
    // try { clickable.focus(); } catch (e) {} // Removed to prevent stealing focus
    await wait(options.focusWait || 100);
    
    try {
      clickable.click();
    } catch (e) {
      log('Native click failed on ' + label, { error: e.toString() });
      throw e;
    }
    
    await wait(options.afterWait || 500);
  }

  function getTweetAuthor(tweet) {
    if (!tweet) return null;
    const authorLink = tweet.querySelector('a[href*="/status/"]')?.getAttribute('href')?.split('/')[1];
    const userNameNode = tweet.querySelector('[data-testid="User-Name"]');
    const rawText = userNameNode ? userNameNode.innerText : (authorLink || '');
    return (authorLink || rawText).toLowerCase().replace('@', '');
  }

  async function findTweetRobustly(index, expectedAuthor) {
    const getVisibleTweets = () => Array.from(document.querySelectorAll('[data-testid="tweet"]')).filter(isVisible);
    let tweets = getVisibleTweets();
    const cleanExp = expectedAuthor ? expectedAuthor.toLowerCase().replace('@', '') : null;

    if (cleanExp) {
      if (tweets[index] && getTweetAuthor(tweets[index]).includes(cleanExp)) return { tweet: tweets[index], index };
      const matchIndex = tweets.findIndex(t => getTweetAuthor(t).includes(cleanExp));
      if (matchIndex !== -1) return { tweet: tweets[matchIndex], index: matchIndex, recovered: true };
      
      window.scrollBy(0, 400);
      await wait(300);
      tweets = getVisibleTweets();
      const secondScanIndex = tweets.findIndex(t => getTweetAuthor(t).includes(cleanExp));
      if (secondScanIndex !== -1) return { tweet: tweets[secondScanIndex], index: secondScanIndex, recovered: true };
    }
    
    if (tweets[index]) return { tweet: tweets[index], index };
    return { tweet: tweets[0] || null, index: 0, error: tweets.length === 0 ? 'No tweets found' : null };
  }

  async function followAuthorOfTweet(tweet, desiredAction = 'follow') {
    log('Attempting followAuthorOfTweet', { desiredAction });
    const caret = tweet.querySelector('[data-testid="caret"]');
    if (!caret) {
      // Check if maybe there is a direct follow button (sometimes present in some layouts)
      const directFollow = tweet.querySelector('[data-testid$="-follow"]');
      if (directFollow && isVisible(directFollow)) {
        await safeClick(directFollow, 'Direct Follow');
        return { success: true, message: 'Followed (direct)' };
      }
      log('Caret not found in tweet');
      return { success: false, error: 'Caret menu not found' };
    }
    
    await safeClick(caret, 'Caret Menu', { afterWait: 600 });
    
    const menu = document.querySelector('[data-testid="Dropdown"]');
    if (!menu) {
      log('Dropdown menu not found');
      return { success: false, error: 'Dropdown menu not found' };
    }
    
    const items = Array.from(menu.querySelectorAll('[role="menuitem"]'));
    const followStrings = ['Follow @', 'Sigue a @', 'Siga @', 'Seguir @', 'Follow'];
    const unfollowStrings = ['Unfollow @', 'Dejar de seguir @', 'Deixar de seguir @', 'Unfollow'];
    
    const followItem = items.find(el => {
      const txt = el.innerText || '';
      return followStrings.some(s => txt.includes(s));
    });
    
    const unfollowItem = items.find(el => {
      const txt = el.innerText || '';
      return unfollowStrings.some(s => txt.includes(s));
    });
    
    if ((desiredAction === 'unfollow' || desiredAction === 'toggle') && unfollowItem) {
      await safeClick(unfollowItem, 'Unfollow Menu Item', { afterWait: 400 });
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
    await safeClick(caret, 'Close Caret Menu', { afterWait: 200 });
    return { success: false, error: 'Follow/Unfollow item not found in menu' };
  }
`;

const WAIT_FOR_RESULTS_SCRIPT = `
  (async function() {
    ${BASE_SCRIPT_HELPERS}
    return await new Promise((resolve) => {
      const start = Date.now();
      const check = () => {
        // Stop check
        if (window.__REAVION_STOP__) return resolve({ success: false, error: 'Stopped by user' });
        
        // Success case: Tweets or People (UserCell) found
        const tweets = document.querySelectorAll('[data-testid="tweet"]');
        const users = document.querySelectorAll('[data-testid="UserCell"]');
        if (tweets.length > 0 || users.length > 0) return resolve({ success: true, count: tweets.length + users.length });
        
        // Empty state case: "No results for" or graphic
        if (document.body.innerText.includes('No results for') || 
            document.querySelector('[data-testid="emptyState"]')) {
          return resolve({ success: true, count: 0, message: 'No results found' });
        }
        
        // Timeout (15s)
        if (Date.now() - start > 15000) return resolve({ success: false, error: 'Timeout waiting for search results' });
        
        setTimeout(check, 200);
      };
      check();
    });
  })()
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
        const filterMap: Record<string, string> = { latest: 'live', people: 'user', photos: 'image', videos: 'video' };
        const sanitizedQuery = query
          .replace(/<arg_key>.*?<\/arg_key>/gi, '')
          .replace(/<arg_value>|<\/arg_value>/gi, '')
          .replace(/\{\{.*?\}\}/g, '')
          .replace(/<\/?[^>]+(>|$)/g, '')
          .trim();

        if (!sanitizedQuery) return JSON.stringify({ success: false, error: 'No query provided' });

        const params = new URLSearchParams();
        params.set('q', sanitizedQuery);
        params.set('src', 'typed_query');
        // Only set 'f' if filter is provided and NOT 'top' (top is default)
        if (filter && filter !== 'top' && filterMap[filter]) {
          params.set('f', filterMap[filter]);
        }

        const url = `https://x.com/search?${params.toString()}`;
        const currentUrl = contents.getURL();

        // Skip reload if already on this search
        if (currentUrl.includes(url) || url.includes(currentUrl) && currentUrl.includes('q=')) {
          console.log(`[X Tool] Already on search page, skipping reload: ${url}`);
        } else {
          await contents.loadURL(url);
        }

        // Wait for results to actually load
        const result = await contents.executeJavaScript(WAIT_FOR_RESULTS_SCRIPT);
        return JSON.stringify({ ...result, url });
      } catch (error) {
        return JSON.stringify({ success: false, error: String(error) });
      }
    },
  });

  const advancedSearchTool = new DynamicStructuredTool({
    name: 'x_advanced_search',
    description: 'On X.com (Twitter), perform a highly filtered search.',
    schema: z.object({
      allWords: z.string().nullable().describe('All of these words.').default(null),
      exactPhrase: z.string().nullable().describe('This exact phrase.').default(null),
      anyWords: z.string().nullable().describe('Any of these words (OR).').default(null),
      noneWords: z.string().nullable().describe('None of these words.').default(null),
      hashtags: z.string().nullable().describe('These hashtags.').default(null),
      fromAccount: z.string().nullable().describe('From these accounts.').default(null),
      toAccount: z.string().nullable().describe('To these accounts.').default(null),
      minLikes: z.any().nullable().describe('Minimum likes (number).').default(null),
      minRetweets: z.any().nullable().describe('Minimum retweets (number).').default(null),
      minReplies: z.any().nullable().describe('Minimum replies (number).').default(null),
      since: z.string().nullable().describe('Start date (YYYY-MM-DD).').default(null),
      until: z.string().nullable().describe('End date (YYYY-MM-DD).').default(null),
      filter: z.enum(['top', 'latest', 'people', 'photos', 'videos']).nullable().describe('Search filter tab.').default(null),
      lang: z.string().nullable().describe('Language code (e.g. "en").').default(null),
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
      minRetweets?: number | null;
      minReplies?: number | null;
      since?: string | null;
      until?: string | null;
      filter?: string | null;
      lang?: string | null;
    }) => {
      try {
        const contents = ctx.getContents();
        const queryParts: string[] = [];
        const sanitize = (val: any): string => {
          if (!val) return '';
          // Remove AI hallucinations like <arg_key> or {{placeholder}}
          return String(val)
            .replace(/<arg_key>.*?<\/arg_key>/gi, '')
            .replace(/<arg_value>|<\/arg_value>/gi, '')
            .replace(/\{\{.*?\}\}/g, '')
            .replace(/<\/?[^>]+(>|$)/g, '') // Strip any other HTML tags
            .trim();
        };

        const safeInt = (val: any): number => {
          if (val === null || val === undefined) return 0;
          if (typeof val === 'number') return Math.floor(val);
          const sanitized = sanitize(val);
          const n = parseInt(sanitized, 10);
          return isNaN(n) ? 0 : n;
        };

        if (args.allWords) {
          const s = sanitize(args.allWords);
          if (s) queryParts.push(s);
        }
        if (args.exactPhrase) {
          const s = sanitize(args.exactPhrase);
          if (s) queryParts.push(`"${s}"`);
        }
        if (args.anyWords) {
          const s = sanitize(args.anyWords);
          const p = Array.from(new Set(s.split(/[\s,]+/).filter(Boolean)));
          if (p.length) queryParts.push(`(${p.join(' OR ')})`);
        }
        if (args.noneWords) {
          const s = sanitize(args.noneWords);
          Array.from(new Set(s.split(/[\s,]+/).filter(Boolean)))
            .forEach(w => queryParts.push(`-${w}`));
        }
        if (args.hashtags) {
          const s = sanitize(args.hashtags);
          const validTags = new Set<string>();
          s.split(/[\s,]+/).filter(Boolean).forEach(h => {
            const t = h.startsWith('#') ? h.slice(1) : h;
            validTags.add(`#${t}`);
          });
          validTags.forEach(tag => queryParts.push(tag));
        }
        if (args.fromAccount) {
          const s = sanitize(args.fromAccount).replace('@', '');
          if (s) queryParts.push(`from:${s}`);
        }
        if (args.toAccount) {
          const s = sanitize(args.toAccount).replace('@', '');
          if (s) queryParts.push(`to:${s}`);
        }

        const mL = safeInt(args.minLikes);
        const mRt = safeInt(args.minRetweets);
        const mRp = safeInt(args.minReplies);

        if (mL > 0) queryParts.push(`min_faves:${mL}`);
        if (mRt > 0) queryParts.push(`min_retweets:${mRt}`);
        if (mRp > 0) queryParts.push(`min_replies:${mRp}`);
        if (args.since) {
          const s = sanitize(args.since);
          if (s) queryParts.push(`since:${s}`);
        }
        if (args.until) {
          const s = sanitize(args.until);
          if (s) queryParts.push(`until:${s}`);
        }
        if (args.lang) {
          const s = sanitize(args.lang);
          if (s) queryParts.push(`lang:${s}`);
        }

        const q = queryParts.join(' ');
        if (!q.trim()) return JSON.stringify({ success: false, error: 'No criteria' });

        const filterMap: Record<string, string> = { latest: 'live', people: 'user', photos: 'image', videos: 'video' };

        let effectiveFilter = args.filter;

        const params = new URLSearchParams();
        params.set('q', q);
        params.set('src', 'typed_query');
        if (effectiveFilter && effectiveFilter !== 'top' && filterMap[effectiveFilter]) {
          params.set('f', filterMap[effectiveFilter]);
        }

        const finalUrl = `https://x.com/search?${params.toString()}`;
        const currentUrl = contents.getURL();

        // Skip reload if already on this search
        if (currentUrl.includes(`q=${encodeURIComponent(q)}`) || (currentUrl.includes('search?') && currentUrl.includes(params.get('q') || ''))) {
          console.log(`[X Tool] Already on advanced search page, skipping reload: ${q}`);
        } else {
          await contents.loadURL(finalUrl);
        }

        // Wait for results to actually load
        const result = await contents.executeJavaScript(WAIT_FOR_RESULTS_SCRIPT);
        return JSON.stringify({ ...result, url: finalUrl, query: q });
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
      skip_self: z.boolean().nullable().describe('Whether to skip replying to own posts. Default is true.'),
      skip_verified: z.boolean().nullable().describe('Whether to skip verified users. Default is false.'),
      skip_keywords: z.string().nullable().describe('Comma-separated keywords to skip. Default is empty string.'),
      expected_author: z.string().nullable().describe('Handle of the author (without @) to verify target. Highly recommended to prevent index mismatches.'),
    }),
    func: async ({ text, index, skip_self, skip_verified, skip_keywords, expected_author }: {
      text: string;
      index: number | string | null;
      skip_self: boolean | null;
      skip_verified: boolean | null;
      skip_keywords: string | null;
      expected_author: string | null;
    }) => {
      const contents = ctx.getContents();
      const finalSkipSelf = skip_self ?? true;
      const finalSkipVerified = skip_verified ?? false;
      const finalSkipKeywords = skip_keywords || '';
      const rIndex = parseInt(String(index ?? 0), 10);
      try {
        const result = await contents.executeJavaScript(`
          (async function() {
            ${POINTER_HELPERS}
            ${BASE_SCRIPT_HELPERS}
            const host = window.location.hostname || '';
            if (!host.includes('x.com') && !host.includes('twitter.com')) return { success: false, error: 'Not on x.com' };

            // Handle case where we are already on the compose page
            if (window.location.pathname.includes('/compose/post')) {
               // ... logic for compose page (skip verification as context is ambiguous)
               const composer = document.querySelector('[data-testid="tweetTextarea_0"]') || 
                                document.querySelector('div[role="textbox"][contenteditable="true"]');
               if (composer) {
                  await safeClick(composer, 'Composer');
                  composer.focus();
                  document.execCommand('selectAll', false, null);
                  document.execCommand('insertText', false, ${JSON.stringify(text)});
                  await wait(800);
                  const send = document.querySelector('[data-testid="tweetButton"]');
                  if (send) {
                      await safeClick(send, 'Send Button');
                      await wait(2000);
                      return { success: true, message: 'Replied (from compose page)' };
                  }
               }
            }

            // 1. Find Tweet Robustly
            const findResult = await findTweetRobustly(${rIndex}, ${JSON.stringify(expected_author)});
            if (!findResult.tweet) return { success: false, error: findResult.error || 'Tweet not found' };
            const tweetNode = findResult.tweet;
            const finalIndex = findResult.index;
            
            // 2. SKIP FILTERS
            const myHandleEl = document.querySelector('[data-testid="SideNav_AccountSwitcher_Button"] [data-testid^="AppTabBar_User"] span, [data-testid="SideNav_AccountSwitcher_Button"] div > div:nth-child(2) span');
            const myHandle = myHandleEl ? myHandleEl.innerText.toLowerCase().replace('@', '') : null;
            const authorHandle = getTweetAuthor(tweetNode);
            const authorName = tweetNode.querySelector('[data-testid="User-Name"]')?.innerText || '';
            const verifiedIcon = tweetNode.querySelector('[data-testid="icon-verified"], [aria-label*="Verified"]');
            
            if (${finalSkipSelf} && myHandle && authorHandle === myHandle) {
              return { success: true, skipped: true, reason: 'self', message: 'Skipped: Logged-in user internal post' };
            }
            if (${finalSkipVerified} && verifiedIcon) {
              return { success: true, skipped: true, reason: 'verified', message: 'Skipped: Verified profile' };
            }
            const keywords = ${JSON.stringify(finalSkipKeywords)}.split(',').map(k => k.trim().toLowerCase()).filter(Boolean);
            if (keywords.length > 0) {
              const tweetText = tweetNode.innerText.toLowerCase();
              if (keywords.some(k => tweetText.includes(k) || authorName.toLowerCase().includes(k))) {
                return { success: true, skipped: true, reason: 'keyword', message: 'Skipped: Keyword match' };
              }
            }

            // 3. Find Reply Button
            const btn = tweetNode.querySelector('[data-testid="reply"]');
            if (!btn) return { success: false, error: 'Reply button not found' };

            await safeClick(btn, 'Reply Button', { focusWait: 50, afterWait: 600 });
            
            const modalCheck = () => Array.from(document.querySelectorAll('[role="dialog"]')).filter(isVisible).pop();
            let modal = modalCheck();
            if (!modal) {
               await wait(400); // Small extra buffer for slow modals
               modal = modalCheck();
            }
            const root = modal || document;
            
            const composer = root.querySelector('[data-testid="tweetTextarea_0"]') || 
                             root.querySelector('div[role="textbox"][contenteditable="true"]');
            
            if (!composer) return { success: false, error: 'Reply composer not found after click' };

            await safeClick(composer, 'Composer', { focusWait: 50, afterWait: 200 });
            composer.focus();
            document.execCommand('selectAll', false, null);
            document.execCommand('insertText', false, ${JSON.stringify(text)});
            await wait(500);
            
            const send = root.querySelector('[data-testid="tweetButton"]');
            if (!send) return { success: false, error: 'Send button not found' };

            await safeClick(send, 'Send Reply');
            await wait(1500);

            // Post-action: Like
            const likeBtn = tweetNode.querySelector('[data-testid="like"]');
            if (likeBtn && isVisible(likeBtn)) {
              await safeClick(likeBtn, 'Post-reply Like', { afterWait: 200 });
            }

            return { 
              success: true, 
              message: 'Replied successfully', 
              recovered: !!findResult.recovered,
              finalIndex 
            };
     // Safety Check: Already Engaged?
                const unlikeBtn = tweetNode.querySelector('[data-testid="unlike"]');
                if (unlikeBtn) {
                     return { success: true, skipped: true, message: 'Skipped: Already liked (implies previous engagement)' };
                }
            }
            // --- END SKIP FILTERS ---

            // Scroll into view carefully
            btn.scrollIntoView({ block: 'center', inline: 'center' });
            await wait(500);

            try {
                await safeClick(btn, 'Reply Button');
            } catch (e) {
                // Force click if safeClick fails (obscured)
                btn.click();
            }
            
            await wait(1500); 

            // Check for redirect to compose/post
            if (window.location.pathname.includes('/compose/post')) {
                 const composer = document.querySelector('[data-testid="tweetTextarea_0"]') || 
                                  document.querySelector('div[role="textbox"][contenteditable="true"]');
                 if (!composer) return { success: false, error: 'Redirected to compose but no composer found' };
                 
                 await safeClick(composer, 'Composer');
                 composer.focus();
                 document.execCommand('selectAll', false, null);
                 document.execCommand('insertText', false, ${JSON.stringify(text)});
                 await wait(800);
                 
                 const send = document.querySelector('[data-testid="tweetButton"]');
                 if (!send) return { success: false, error: 'No send button found' };
                 await safeClick(send, 'Send Button');
                 await wait(2000);
                 return { success: true, message: 'Replied (after redirect)' };
            }

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
            await wait(800);

            const send = searchRoot.querySelector('[data-testid="tweetButton"]');
            if (!send) return { success: false, error: 'No send button found' };
            await safeClick(send, 'Send Button');
            await wait(2000);
            
            // Post-action: Like the tweet to mark it as engaged
            if (tweetNode) {
                const likeBtn = tweetNode.querySelector('[data-testid="like"]');
                if (likeBtn) {
                    try { likeBtn.click(); } catch(e) {}
                }
            }

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

  const scoutTool = new DynamicStructuredTool({
    name: 'x_scout_topics',
    description: 'Scout the current page or a specific niche for hashtags and accounts to find new growth opportunities.',
    schema: z.object({
      niche: z.string().nullable().describe('Optional niche to search for before scouting (e.g. "SaaS").').default(null),
      limit: z.number().nullable().describe('Max number of items to return. Default is 10.'),
    }),
    func: async ({ niche, limit }: { niche: string | null; limit: number | null }) => {
      const contents = ctx.getContents();
      const lim = limit ?? 10;
      try {
        if (niche) {
          const params = new URLSearchParams();
          params.set('q', niche);
          params.set('src', 'typed_query');
          params.set('f', 'live'); // Latest results are better for scouting trends
          await contents.loadURL(`https://x.com/search?${params.toString()}`);
          await contents.executeJavaScript(WAIT_FOR_RESULTS_SCRIPT);
        }

        const result = await contents.executeJavaScript(`
          (async function() {
            ${BASE_SCRIPT_HELPERS}
            try {
              // Scroll a few times to get more data
              for(let i=0; i<2; i++) {
                  window.scrollBy(0, 1000);
                  await wait(1000);
              }
              
              // Grab text from all visible tweets
              const tweets = Array.from(document.querySelectorAll('[data-testid="tweetText"]'));
              const text = tweets.map(t => t.innerText).join(' ');
              
              // Regex for hashtags and mentions
              const hashtagsList = (text.match(/#[\\w]+/g) || []).map(h => h.toLowerCase());
              const mentionsList = (text.match(/@[\\w]+/g) || []).map(m => m.toLowerCase());
              
              // Frequency count and sort
              const count = (arr) => {
                  const map = {};
                  arr.forEach(i => map[i] = (map[i] || 0) + 1);
                  return Object.entries(map).sort((a,b) => (b[1] as any) - (a[1] as any)).map(e => e[0]);
              };
              
              const scrapedHashtags = count(hashtagsList).slice(0, ${lim});
              const scrapedAccounts = count(mentionsList).slice(0, ${lim});

              return {
                  hashtags: scrapedHashtags,
                  accounts: scrapedAccounts,
                  topics: scrapedHashtags.join(' '), 
                  success: true,
                  message: (scrapedHashtags.length || scrapedAccounts.length) 
                            ? ('Scouted ' + scrapedHashtags.length + ' hashtags and ' + scrapedAccounts.length + ' accounts.')
                            : 'Scouting complete, but no trends found on the current page.'
              };
            } catch (err) {
              return { success: false, error: err.toString(), logs };
            }
          })()
        `);
        return JSON.stringify(result);
      } catch (e) {
        return JSON.stringify({ success: false, error: String(e) });
      }
    }
  });

  const communityScoutTool = new DynamicStructuredTool({
    name: 'x_scout_community',
    description: 'Scout a specific X Community by URL for new posts and targets. Alias: x_community.',
    schema: z.object({
      communityId: z.string().describe('The ID or URL-slug of the community'),
      filter: z.enum(['top', 'latest']).nullable().default('latest'),
    }),
    func: async ({ communityId, filter }: { communityId: string; filter?: string | null }) => {
      try {
        const contents = ctx.getContents();
        const cleanId = communityId.split('/').pop() || communityId;
        const url = `https://x.com/communities/${cleanId}`;
        await contents.loadURL(url);
        const result = await contents.executeJavaScript(`
          (async function() {
            ${BASE_SCRIPT_HELPERS}
            // Ensure we are on the right tab if needed
            const tabLabel = ${JSON.stringify(filter === 'top' ? 'Top' : 'Latest')};
            const tabs = Array.from(document.querySelectorAll('[role="tab"]'));
            const targetTab = tabs.find(t => t.innerText.includes(tabLabel));
            if (targetTab && targetTab.getAttribute('aria-selected') === 'false') {
              await safeClick(targetTab, tabLabel + ' Tab');
              await wait(1500);
            }
            // Scroll to load a few more
            window.scrollBy(0, 800);
            await wait(1000);

            const tweetCount = document.querySelectorAll('[data-testid="tweet"]').length;
            return { success: true, tweetCount };
          })()
        `);
        const data = result as { success: boolean; tweetCount: number };
        return JSON.stringify({
          success: true,
          url,
          tweetCount: data.tweetCount,
          message: `Community loaded. Found ${data.tweetCount} posts.`
        });
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
      skip_self: z.boolean().nullable().describe('Whether to skip engagement for own posts. Default is true.'),
      skip_verified: z.boolean().nullable().describe('Whether to skip verified users. Default is false.'),
      skip_keywords: z.string().nullable().describe('Comma-separated keywords to skip. Default is empty string.'),
      expected_author: z.string().nullable().describe('Handle of the author (without @) to verify target. Highly recommended.'),
    }),
    func: async ({ targetIndex, actions, replyText, skip_self, skip_verified, skip_keywords, expected_author }: {
      targetIndex: number | string | null;
      actions: string;
      replyText: string | null;
      skip_self: boolean | null;
      skip_verified: boolean | null;
      skip_keywords: string | null;
      expected_author: string | null;
    }) => {
      const contents = ctx.getContents();
      const finalSkipSelf = skip_self ?? true;
      const finalSkipVerified = skip_verified ?? false;
      const finalSkipKeywords = skip_keywords || '';
      const rIndex = parseInt(String(targetIndex ?? 0), 10);
      try {
        const result = await contents.executeJavaScript(`
          (async function() {
            try {
              ${POINTER_HELPERS}
              ${BASE_SCRIPT_HELPERS}

              // 1. Find Tweet Robustly
              const findResult = await findTweetRobustly(${rIndex}, ${JSON.stringify(expected_author)});
              if (!findResult.tweet) return { success: false, error: findResult.error || 'Tweet not found' };
              const tweet = findResult.tweet;
              const finalIndex = findResult.index;
              
              const actionsList = ${JSON.stringify(actions || '')}.split(',').map(a => a.trim().toLowerCase());
              const authorHandle = getTweetAuthor(tweet);
              const authorName = tweet.querySelector('[data-testid="User-Name"]')?.innerText || '';
              const verifiedIcon = tweet.querySelector('[data-testid="icon-verified"], [aria-label*="Verified"]');

              // 2. SKIP FILTERS
              const myHandleEl = document.querySelector('[data-testid^="SideNav_AccountSwitcher_Button"] [data-testid^="AppTabBar_User"] span, [data-testid="SideNav_AccountSwitcher_Button"] div > div:nth-child(2) span');
              const myHandle = myHandleEl ? myHandleEl.innerText.toLowerCase().replace('@', '') : null;

              if (${finalSkipSelf} && myHandle && authorHandle === myHandle) {
                return { success: true, skipped: true, reason: 'self', message: 'Skipped: Logged-in user internal post' };
              }
              if (${finalSkipVerified} && verifiedIcon) {
                return { success: true, skipped: true, reason: 'verified', message: 'Skipped: Verified profile' };
              }
              const keywords = ${JSON.stringify(finalSkipKeywords)}.split(',').map(k => k.trim().toLowerCase()).filter(Boolean);
              if (keywords.length > 0) {
                const tweetText = tweet.innerText.toLowerCase();
                if (keywords.some(k => tweetText.includes(k) || authorName.toLowerCase().includes(k))) {
                  return { success: true, skipped: true, reason: 'keyword', message: 'Skipped: Keyword match' };
                }
              }

              if (actionsList.some(a => ['like', 'reply', 'retweet'].includes(a)) && !actionsList.some(a => ['unlike', 'unretweet'].includes(a))) {
                const alreadyLiked = tweet.querySelector('[data-testid="unlike"]');
                if (alreadyLiked) {
                  return { success: true, skipped: true, message: 'Skipped: Already liked (implies previous engagement)' };
                }
              }

              const results = [];

              if (actionsList.includes('like')) {
                const b = tweet.querySelector('[data-testid="like"]');
                const u = tweet.querySelector('[data-testid="unlike"]');
                if (b && isVisible(b)) {
                  await safeClick(b, 'Like', { afterWait: 400 });
                  results.push('Liked');
                } else if (u && isVisible(u)) {
                  results.push('Already Liked');
                } else {
                  results.push('Like Button Not Found (Check visibility)');
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
                    await safeClick(b, 'Close Retweet Menu');
                    results.push('Retweet Confirm Button Not Found');
                  }
                }
              }

              if (actionsList.includes('reply') && ${JSON.stringify(replyText || '')}) {
                const b = tweet.querySelector('[data-testid="reply"]');
                if (b && isVisible(b)) {
                  await safeClick(b, 'Reply');
                  await wait(1000); // Reduced from 2000
                  const modals = Array.from(document.querySelectorAll('[role="dialog"]')).filter(isVisible);
                  const modal = modals.length ? modals[modals.length - 1] : null;
                  const searchRoot = modal || document;
                  const engagedTweetHandle = tweet.innerText.split('\\n')[1] || 'Unknown';
                  const comp = searchRoot.querySelector('[data-testid="tweetTextarea_0"]') ||
                               searchRoot.querySelector('div[role="textbox"][contenteditable="true"]');
                  if (comp) {
                    await safeClick(comp, 'Composer');
                    comp.focus();
                    document.execCommand('selectAll', false, null);
                    document.execCommand('insertText', false, ${JSON.stringify(replyText || '')});
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
            } catch (e) {
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

  const checkEngagementTool = new DynamicStructuredTool({
    name: 'x_check_engagement',
    description: 'Quickly check if a tweet is already liked or retweeted. Use this to skip crafting/humanizing replies if already engaged. Returns { engaged: boolean }.',
    schema: z.object({
      index: z.number().describe('0-based index of the tweet.'),
      expected_author: z.string().nullable().describe('Expected author handle.'),
    }),
    func: async ({ index, expected_author }) => {
      const contents = ctx.getContents();
      try {
        const result = await contents.executeJavaScript(`
          (async function() {
            ${BASE_SCRIPT_HELPERS}
            const findResult = await findTweetRobustly(${index}, ${JSON.stringify(expected_author)});
            if (!findResult.tweet) return { success: false, error: 'Tweet not found' };
            const tweet = findResult.tweet;
            const liked = !!tweet.querySelector('[data-testid="unlike"]');
            const retweeted = !!tweet.querySelector('[data-testid="unretweet"]');
            return { success: true, engaged: liked || retweeted, liked, retweeted };
          })()
        `);
        return JSON.stringify(result);
      } catch (e) {
        return JSON.stringify({ success: false, error: String(e) });
      }
    }
  });

  const scanPostsTool = new DynamicStructuredTool({
    name: 'x_scan_posts',
    description: 'Scan visible posts on X.com to get their metadata and engagement status (liked/retweeted) to filter out already-engaged posts. Returns list of posts with indices.',
    schema: z.object({
      limit: z.number().nullable().default(10),
    }),
    func: async ({ limit }: { limit: number | null }) => {
      const contents = ctx.getContents();
      try {
        const result = await contents.executeJavaScript(`
          (async function() {
            ${BASE_SCRIPT_HELPERS}
            // Use a broader selector and filter for better reliability
            const tweets = Array.from(document.querySelectorAll('[data-testid="tweet"]')).slice(0, ${limit || 15});
            
            const data = tweets.map((t, i) => {
               const author = getTweetAuthor(t);
               const textEl = t.querySelector('[data-testid="tweetText"]');
               const text = textEl ? textEl.innerText.replace(/\\n/g, ' ').slice(0, 120) : ''; // More context
               
               // Check engagement
               const isLiked = !!t.querySelector('[data-testid="unlike"]');
               const isRetweeted = !!t.querySelector('[data-testid="unretweet"]');
               const hasReplied = !!t.querySelector('[data-testid="reply"] [aria-label*="Replied"]'); // Some UI states show this
               
               // Special X detection
               const isPromoted = !!t.querySelector('[data-testid="placementTracking"]') || t.innerText.includes('Promoted');
               const analyticsValue = t.querySelector('[href*="/analytics"]')?.innerText || '0';
               
               const rect = t.getBoundingClientRect();
               const isVisibleNow = rect.top >= 0 && rect.bottom <= window.innerHeight;

               return { 
                 index: i, 
                 author, 
                 text, 
                 isLiked, 
                 isRetweeted, 
                 isPromoted,
                 isEngaged: isLiked || isRetweeted,
                 metrics: analyticsValue,
                 visible: isVisibleNow
               };
            });
            
            return { 
              success: true, 
              count: data.length, 
              posts: data,
              message: 'Scanned ' + data.length + ' posts. Suggesting those not yet engaged.'
            };
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

  return [searchTool, advancedSearchTool, likeTool, replyTool, postTool, followTool, scoutTool, communityScoutTool, engageTool, checkEngagementTool, scanPostsTool, engagingTool];
}
