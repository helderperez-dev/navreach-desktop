import { z } from 'zod';
import { DynamicStructuredTool } from '@langchain/core/tools';

import type { SiteToolContext } from './types';

const POINTER_HELPERS = `
  window.__LAST_MOUSE_POS__ = window.__LAST_MOUSE_POS__ || { x: 0, y: 0 };

  window.cubicBezier = (t, p0, p1, p2, p3) => {
    const oneMinusT = 1 - t;
    return Math.pow(oneMinusT, 3) * p0 +
           3 * Math.pow(oneMinusT, 2) * t * p1 +
           3 * oneMinusT * Math.pow(t, 2) * p2 +
           Math.pow(t, 3) * p3;
  };

  window.generateControlPoints = (start, end) => {
    const dist = Math.sqrt(Math.pow(end.x - start.x, 2) + Math.pow(end.y - start.y, 2));
    const offsetScale = Math.min(dist * 0.5, 200); 
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    let px = -dy;
    let py = dx;
    if (Math.random() > 0.5) { px = dy; py = -dx; }
    const len = Math.sqrt(px*px + py*py) || 1;
    const normX = px / len;
    const normY = py / len;
    const cp1 = { x: start.x + dx * 0.33 + normX * (Math.random() * offsetScale), y: start.y + dy * 0.33 + normY * (Math.random() * offsetScale) };
    const cp2 = { x: start.x + dx * 0.66 + normX * (Math.random() * offsetScale), y: start.y + dy * 0.66 + normY * (Math.random() * offsetScale) };
    return { cp1, cp2 };
  };

  window.ensurePointer = () => {
    let host = document.getElementById('reavion-pointer-host');
    if (!host) {
      host = document.createElement('div');
      host.id = 'reavion-pointer-host';
      host.style.cssText = 'position:fixed;top:0;left:0;width:100vw;height:100vh;z-index:2147483647;pointer-events:none;';
      const shadow = host.attachShadow({ mode: 'open' });
      const style = document.createElement('style');
      style.textContent = \`
        @keyframes breathe { 0% { transform: scale(1); } 50% { transform: scale(1.1); } 100% { transform: scale(1); } }
        @keyframes ripple { 0% { transform: scale(0); opacity: 1; } 100% { transform: scale(3); opacity: 0; } }
        @keyframes hover-grow { 0% { transform: scale(1.1); } 50% { transform: scale(1.25); } 100% { transform: scale(1.1); } }
        .pointer {
          position: fixed;
          z-index: 2147483647;
          pointer-events: none;
          filter: drop-shadow(0 4px 12px rgba(0,0,0,0.4));
          transition: transform 0.2s cubic-bezier(0.175, 0.885, 0.32, 1.275);
          width: 32px; height: 32px;
          display: block !important;
          visibility: visible !important;
          opacity: 1 !important;
          will-change: top, left;
          animation: breathe 3s ease-in-out infinite;
        }
        .pointer.moving { animation: none; transform: scale(0.95); }
        .pointer.hovering { animation: hover-grow 0.6s ease-in-out infinite !important; filter: drop-shadow(0 4px 15px rgba(59, 130, 246, 0.6)); }
        .click-ripple {
          position: fixed;
          width: 40px; height: 40px;
          border: 3px solid #3b82f6;
          border-radius: 50%;
          pointer-events: none;
          z-index: 2147483646;
          animation: ripple 0.6s ease-out forwards;
        }
      \`;
      shadow.appendChild(style);
      document.documentElement.appendChild(host);
    }
    if (host.parentElement !== document.documentElement) document.documentElement.appendChild(host);
    
    const root = host.shadowRoot;
    let p = root.querySelector('.pointer');
    if (!p) {
      p = document.createElement('div');
      p.className = 'pointer';
      p.innerHTML = '<svg width="32" height="32" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M0 0L8 22L11.5 12.5L21 9L0 0Z" fill="#000000" stroke="#ffffff" stroke-width="2"/></svg>';
      root.appendChild(p);
      const initX = window.__LAST_MOUSE_POS__.x || 100;
      const initY = window.__LAST_MOUSE_POS__.y || 100;
      p.style.left = initX + 'px';
      p.style.top = initY + 'px';
      window.__LAST_MOUSE_POS__ = { x: initX, y: initY };
    }
    return root;
  };

  window.movePointer = (targetX, targetY) => {
    const root = window.ensurePointer();
    const p = root.querySelector('.pointer');
    p.classList.add('moving');

    const start = { ...window.__LAST_MOUSE_POS__ };
    const end = { x: targetX, y: targetY };
    
    const dist = Math.sqrt(Math.pow(end.x - start.x, 2) + Math.pow(end.y - start.y, 2));
    if (dist < 5) {
        p.style.left = end.x + 'px';
        p.style.top = end.y + 'px';
        window.__LAST_MOUSE_POS__ = end;
        p.classList.remove('moving');
        return Promise.resolve();
    }

    const { cp1, cp2 } = window.generateControlPoints(start, end);
    const multiplier = window.__REAVION_SPEED_MULTIPLIER__ || 1.0;
    const baseDuration = Math.min(Math.max(dist * 0.6, 250), 1000) * multiplier;
    const duration = baseDuration * (0.8 + Math.random() * 0.4);

    const startTime = performance.now();

    return new Promise(resolve => {
        const animate = (now) => {
            const elapsed = now - startTime;
            const progress = Math.min(elapsed / duration, 1);
            const ease = progress < 0.5 ? 2 * progress * progress : 1 - Math.pow(-2 * progress + 2, 2) / 2;

            const x = window.cubicBezier(ease, start.x, cp1.x, cp2.x, end.x);
            const y = window.cubicBezier(ease, start.y, cp1.y, cp2.y, end.y);

            p.style.left = x + 'px';
            p.style.top = y + 'px';

            try {
               const elAtPoint = document.elementFromPoint(x, y);
               const evt = new MouseEvent('mousemove', {
                   view: window,
                   bubbles: true,
                   cancelable: true,
                   clientX: x,
                   clientY: y,
                   screenX: x + window.screenX, 
                   screenY: y + window.screenY
               });
               if (elAtPoint && (elAtPoint.closest('button, a, [role="button"], input, textarea, select') || elAtPoint.onclick)) {
                   p.classList.add('hovering');
               } else {
                   p.classList.remove('hovering');
               }
               elAtPoint?.dispatchEvent(evt);
            } catch(e) {}

            if (progress < 1) {
                requestAnimationFrame(animate);
            } else {
                window.__LAST_MOUSE_POS__ = end;
                p.classList.remove('moving');
                p.classList.remove('hovering');
                resolve();
            }
        };
        requestAnimationFrame(animate);
    });
  };

  window.showVisualClick = (x, y) => {
    const root = window.ensurePointer();
    const r = document.createElement('div');
    r.className = 'click-ripple';
    r.style.left = (x - 20) + 'px';
    r.style.top = (y - 20) + 'px';
    root.appendChild(r);
    setTimeout(() => { if (r.parentNode) r.remove(); }, 600);
  };
`;

const BASE_SCRIPT_HELPERS = `
  ${POINTER_HELPERS}
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
  
  // HUMAN BEHAVIOR:
  // 1. Base Randomness: +/- 30%
  // 2. Hesitation: 10% chance to add extra 200-800ms
  // 3. Jitter: small noise
  
  const randomFactor = 0.7 + Math.random() * 0.6; // 0.7 to 1.3
  const hesitation = Math.random() < 0.1 ? (200 + Math.random() * 600) : 0;
  
  let adjustedMs = (ms * multiplier * randomFactor) + hesitation;
  if (isFast) adjustedMs = ms * multiplier; // Strict speed if fast mode is forced

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
        setTimeout(checking, 20); 
      }
    };
    checking();
  });
}

async function safeClick(el, label, options = {}) {
  const clickable = el.closest('button,[role="button"]') || el;
  log('Clicking ' + label, { tagName: clickable.tagName });

  const rectBefore = clickable.getBoundingClientRect();
  if (rectBefore.top < 100 || rectBefore.bottom > window.innerHeight - 100) {
    clickable.scrollIntoView({ behavior: 'auto', block: 'center', inline: 'center' }); 
    await wait(options.scrollWait || 400); 
  }

  const rect = clickable.getBoundingClientRect();
  const x = Math.round(rect.left + rect.width / 2);
  const y = Math.round(rect.top + rect.height / 2);
  
  if (typeof window.movePointer === 'function') await window.movePointer(x, y);

  await wait(options.focusWait || 100); // Small pause after arriving before clicking (human hesitation/verification)

  if (typeof window.showVisualClick === 'function') window.showVisualClick(x, y);

  try {
    if (options.native) {
      clickable.click();
    } else {
      // Dispatch realistic event chain with coordinates
      const common = { 
        bubbles: true, 
        cancelable: true, 
        view: window,
        clientX: x,
        clientY: y,
        screenX: x,
        screenY: y,
        buttons: 1,
        pointerId: 1,
        pointerType: 'mouse',
        isPrimary: true
      };

      clickable.dispatchEvent(new PointerEvent('pointerdown', common));
      clickable.dispatchEvent(new MouseEvent('mousedown', common));
      
      await wait(options.clickDelay || 50); // Human-like click duration
      
      clickable.dispatchEvent(new PointerEvent('pointerup', common));
      clickable.dispatchEvent(new MouseEvent('mouseup', common));
      clickable.click();
    }
  } catch (e) {
    log('Native click failed on ' + label, { error: e.toString() });
    throw e;
  }

  await wait(options.afterWait || 800); // Increased default wait
}

function getTweetAuthor(tweet) {
  if (!tweet) return null;
  // The author's handle is consistently found in the first link that doesn't contain /status/
  // or specifically within the User-Name testid.
  const userNameNode = tweet.querySelector('[data-testid="User-Name"]');
  if (userNameNode) {
    const handleEl = userNameNode.querySelector('div[dir="ltr"] span');
    if (handleEl && handleEl.innerText.startsWith('@')) {
      return handleEl.innerText.toLowerCase().replace('@', '');
    }
    // Fallback for User-Name
    const links = Array.from(userNameNode.querySelectorAll('a'));
    const handleLink = links.find(a => a.getAttribute('href')?.startsWith('/'));
    if (handleLink) return handleLink.getAttribute('href').replace('/', '').toLowerCase();
  }

  // Fallback: search for any link that looks like a username
  const allLinks = Array.from(tweet.querySelectorAll('a'));
  const authorLink = allLinks.find(a => {
    const href = a.getAttribute('href') || '';
    return href.startsWith('/') && !href.includes('/status/') && !href.includes('/home') && !['/explore', '/notifications', '/messages', '/search'].includes(href);
  });

  return authorLink ? authorLink.getAttribute('href').replace('/', '').toLowerCase() : null;
}

function getVerificationStatus(tweetNode) {
  if (!tweetNode) return null;
  const badge = tweetNode.querySelector('[data-testid="icon-verified"]');
  if (!badge) return null;

  const ariaLabel = (badge.getAttribute('aria-label') || badge.parentNode.getAttribute('aria-label') || '').toLowerCase();
  if (ariaLabel.includes('organization') || ariaLabel.includes('gold')) return 'gold';
  if (ariaLabel.includes('government') || ariaLabel.includes('grey')) return 'grey';

  // Fallback to color check if aria-label is generic "Verified account"
  const style = window.getComputedStyle(badge);
  const color = style.fill || style.color || '';

  // X Blue is typically rgb(29, 155, 240) or #1d9bf0
  if (color.includes('29, 155, 240') || color.includes('1d9bf0')) return 'blue';

  // Gold/Org often uses a gradient (url(#id)) or specific gold/yellow colors
  if (color.includes('url') || color.includes('244, 231, 42') || color.includes('gold')) return 'gold';

  return 'blue'; // Default custom
}

function getMyHandle() {
  // Method 1: Most stable - Profile link in sidebar
  const profileLink = document.querySelector('a[data-testid="AppTabBar_Profile_Link"]');
  if (profileLink) {
    const href = profileLink.getAttribute('href');
    if (href && href !== '/profile') return href.replace('/', '').toLowerCase();
  }

  // Method 2: Account Switcher Button
  const accountBtn = document.querySelector('[data-testid="SideNav_AccountSwitcher_Button"]');
  if (accountBtn) {
    const spans = Array.from(accountBtn.querySelectorAll('span'));
    const handleSpan = spans.find(s => s.innerText.startsWith('@'));
    if (handleSpan) return handleSpan.innerText.toLowerCase().replace('@', '');
  }

  // Method 3: Script-injected identity (if we ever add it)
  if (window.__REAVION_MY_HANDLE__) return window.__REAVION_MY_HANDLE__;

  return null;
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

  // 1. Try Direct Follow Button (often on "Who to follow" lists or specific layouts)
  const directFollow = tweet.querySelector('[data-testid$="-follow"]');
  if (directFollow && isVisible(directFollow)) {
    await safeClick(directFollow, 'Direct Follow');
    return { success: true, message: 'Followed (direct)' };
  }

  // 2. Try Caret Menu (Standard Timeline Approach)
  const caret = tweet.querySelector('[data-testid="caret"]');
  if (caret) {
    await safeClick(caret, 'Caret Menu', { afterWait: 600 });
    const menu = document.querySelector('[data-testid="Dropdown"]');
    
    if (menu) {
      const items = Array.from(menu.querySelectorAll('[role="menuitem"]'));
      const followStrings = ['Follow', 'Sigue a', 'Siga', 'Seguir'];
      const unfollowStrings = ['Unfollow', 'Dejar de seguir', 'Deixar de seguir'];
      
      const getText = (el) => (el.innerText || '').trim();
      
      const followItem = items.find(el => {
        const txt = getText(el);
        return followStrings.some(s => txt.includes(s));
      });
      const unfollowItem = items.find(el => {
        const txt = getText(el);
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

      // Close menu if nothing matches or we want to try fallback
      await safeClick(caret, 'Close Caret Menu', { afterWait: 300 });
    } else {
      log('Dropdown menu not found');
    }
  }

  // 3. Fallback: Hover Card Strategy (The "Classic" robust way)
  // If we couldn't find/click in menu, try hovering the avatar
  if (desiredAction === 'follow' || desiredAction === 'toggle') {
    log('Trying Hover Card fallback...');
    const avatar = tweet.querySelector('[data-testid="Tweet-User-Avatar"]');
    if (avatar) {
      // Move to avatar and hover
      const rect = avatar.getBoundingClientRect();
      const x = rect.left + rect.width / 2;
      const y = rect.top + rect.height / 2;
      
      if (typeof window.movePointer === 'function') await window.movePointer(x, y);
      avatar.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
      avatar.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
      
      // Wait for hover card
      await wait(1500); 
      
      const hoverCard = document.querySelector('[data-testid="hoverCard"]') || 
                        document.querySelector('#layers div[data-testid="UserCell"]')?.closest('[role="tooltip"]');
                        
      if (hoverCard) {
        // Find follow button in card. Note: It might be "Pending" or "Following"
        const cardFollow = hoverCard.querySelector('[data-testid$="-follow"]');
        const cardUnfollow = hoverCard.querySelector('[data-testid$="-unfollow"]');
        
        if (cardUnfollow) return { success: true, already: true, message: 'Already followed (verified via hover)' };
        
        if (cardFollow && isVisible(cardFollow)) {
           await safeClick(cardFollow, 'Hover Card Follow');
           // Move mouse away to close card
           if (typeof window.movePointer === 'function') await window.movePointer(0, 0);
           return { success: true, message: 'Followed via Hover Card' };
        }
      }
    }
  }

  return { success: false, error: 'Follow target not found (tried Direct, Caret, and Hover)' };
}

async function typeHumanLike(el, text) {
  if (!el) return;
  el.focus();
  
  const multiplier = window.__REAVION_SPEED_MULTIPLIER__ || 1.0;
  
  // Initial pause before starting to type
  await wait(200 + Math.random() * 300);

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    
    // 1. TYPO CHANCE (2% chance for a minor mistake)
    if (i > 3 && i < text.length - 2 && Math.random() < 0.02) {
       const keys = "qwertyuiopasdfghjklzxcvbnm";
       const typo = keys[Math.floor(Math.random() * keys.length)];
       document.execCommand('insertText', false, typo);
       await wait(80 + Math.random() * 120);
       document.execCommand('delete', false); // Backspace
       await wait(120 + Math.random() * 180);
    }

    document.execCommand('insertText', false, char);

    // 2. MICRO MOUSE MOVEMENTS (5% chance to move mouse slightly while typing)
    if (Math.random() < 0.05 && typeof window.movePointer === 'function' && window.__LAST_MOUSE_POS__) {
       const jitterX = window.__LAST_MOUSE_POS__.x + (Math.random() * 10 - 5);
       const jitterY = window.__LAST_MOUSE_POS__.y + (Math.random() * 10 - 5);
       // We don't await this to not block typing
       window.movePointer(jitterX, jitterY).catch(() => {});
    }

    // 3. KEYSTROKE DELAY
    // Base delay 40-120ms
    let delay = 40 + Math.random() * 80;
    
    // 4. PUNCTUATION/LOGICAL PAUSE
    if (['.', '!', '?', ',', ';'].includes(char)) {
       delay += 250 + Math.random() * 400;
    } else if (char === ' ') {
       delay += 30 + Math.random() * 60;
    }
    
    // 5. BIG HESITATION (1% chance to pause for 1-2 seconds)
    if (Math.random() < 0.01) {
       delay += 1000 + Math.random() * 1000;
    }

    await wait(delay * multiplier);
  }
  
  // Final verification events
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
}
`;

const WAIT_FOR_RESULTS_SCRIPT = `
  (async function () {
    ${BASE_SCRIPT_HELPERS}

    // Prevent focus stealing for NEW searches, but don't kick user out of their own typing
    try {
      window.focus = function () { console.log("Blocked window.focus to prevent app stealing OS focus"); };
    } catch (e) { /* ignore */ }

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
      query: z.string().describe('The search query.'),
      filter: z.preprocess(
        (val) => (typeof val === 'string' ? val.toLowerCase() : val),
        z.enum(['top', 'latest', 'people', 'photos', 'videos']).nullable().describe('Result filter tab.').default(null)
      ),
    }),
    func: async ({ query, filter }: { query: string; filter?: string | null }) => {
      try {
        const contents = ctx.getContents();
        const filterMap: Record<string, string> = { latest: 'live', people: 'user', photos: 'image', videos: 'video' };
        const sanitizeQuery = (val: string): string => {
          if (!val) return '';
          const str = String(val).trim();
          if (str.toLowerCase() === 'null' || str.toLowerCase() === 'undefined' || str.toLowerCase() === 'none') return '';
          return str
            .replace(/<arg_key>.*?<\/arg_key>/gi, '')
            .replace(/<arg_value>|<\/arg_value>/gi, '')
            .replace(/\{\{.*?\}\}/g, '')
            .replace(/<\/?[^>]+(>|$)/g, '')
            .trim();
        };

        const sanitizedQuery = sanitizeQuery(query);

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
        return JSON.stringify({ ...result, url, searchSummary: sanitizedQuery });
      } catch (error) {
        return JSON.stringify({ success: false, error: String(error) });
      }
    },
  });

  const advancedSearchTool = new DynamicStructuredTool({
    name: 'x_advanced_search',
    description: 'On X.com (Twitter), perform a highly filtered search with advanced operators.',
    schema: z.object({
      allWords: z.string().nullable().describe('The primary keywords/hashtags to search (e.g. "saas founder"). DO NOT include operators like "min_likes" or "filter" here; use the specific parameters below.').default(null),
      exactPhrase: z.string().nullable().describe('An exact phrase to match (e.g. "building in public").').default(null),
      anyWords: z.string().nullable().describe('Any of these words (OR logic).').default(null),
      noneWords: z.string().nullable().describe('Keywords to exclude.').default(null),
      hashtags: z.string().nullable().describe('Hashtags without the # symbol.').default(null),
      cashtags: z.string().nullable().describe('Financial symbols (comma separated, e.g. BTC, TSLA).').default(null),
      fromAccount: z.string().nullable().describe('From specific handles (without @).').default(null),
      toAccount: z.string().nullable().describe('Replies to specific handles.').default(null),
      mentionsAccount: z.string().nullable().describe('Mentioning these handles.').default(null),
      retweetsOf: z.string().nullable().describe('Showing retweets of these handles.').default(null),
      listId: z.string().nullable().describe('Filter results from users in this List ID.').default(null),
      isRetweet: z.boolean().nullable().describe('true: Only retweets. false: EXCLUDE retweets (High Signal).').default(null),
      isReply: z.boolean().nullable().describe('true: Only replies. false: EXCLUDE replies (Original Posts).').default(null),
      isQuote: z.boolean().nullable().describe('Show only quote tweets.').default(null),
      isVerified: z.boolean().nullable().describe('Verified accounts only.').default(null),
      hasLinks: z.boolean().nullable().describe('Has links.').default(null),
      hasImages: z.boolean().nullable().describe('Has images.').default(null),
      hasVideo: z.boolean().nullable().describe('Has video.').default(null),
      hasMedia: z.boolean().nullable().describe('Has any media.').default(null),
      urlContained: z.string().nullable().describe('URL to search for.').default(null),
      minLikes: z.any().nullable().describe('Minimum likes (e.g. 10). Leave null if user didnt ask.').default(null),
      minRetweets: z.any().nullable().describe('Minimum retweets.').default(null),
      minReplies: z.any().nullable().describe('Minimum replies.').default(null),
      since: z.string().nullable().describe('Start date (YYYY-MM-DD).').default(null),
      until: z.string().nullable().describe('End date (YYYY-MM-DD).').default(null),
      filter: z.preprocess(
        (val) => (typeof val === 'string' ? val.toLowerCase() : val),
        z.enum(['top', 'latest', 'people', 'photos', 'videos']).nullable().describe('Search tab (default: top). Use people for profiling.').default(null)
      ),
      lang: z.string().nullable().describe('Language code (e.g. "en").').default(null),
      place: z.string().nullable().describe('Geo-tagged to a location.').default(null),
      positiveSentiment: z.coerce.boolean().nullable().describe('Positive sentiment :)').default(null),
      negativeSentiment: z.coerce.boolean().nullable().describe('Negative sentiment :(').default(null),
      questionsOnly: z.coerce.boolean().nullable().describe('Questions only ?').default(null),
    }),
    func: async (args: {
      allWords?: string | null;
      exactPhrase?: string | null;
      anyWords?: string | null;
      noneWords?: string | null;
      hashtags?: string | null;
      cashtags?: string | null;
      fromAccount?: string | null;
      toAccount?: string | null;
      mentionsAccount?: string | null;
      retweetsOf?: string | null;
      listId?: string | null;
      isRetweet?: boolean | null;
      isReply?: boolean | null;
      isQuote?: boolean | null;
      isVerified?: boolean | null;
      hasLinks?: boolean | null;
      hasImages?: boolean | null;
      hasVideo?: boolean | null;
      hasMedia?: boolean | null;
      urlContained?: string | null;
      minLikes?: any;
      minRetweets?: any;
      minReplies?: any;
      since?: string | null;
      until?: string | null;
      filter?: string | null;
      lang?: string | null;
      place?: string | null;
      positiveSentiment?: boolean | null;
      negativeSentiment?: boolean | null;
      questionsOnly?: boolean | null;
    }) => {
      try {
        const contents = ctx.getContents();
        const queryParts: string[] = [];

        const sanitize = (val: any): string => {
          if (val === null || val === undefined) return '';
          const str = String(val).trim();
          if (str.toLowerCase() === 'null' || str.toLowerCase() === 'undefined' || str.toLowerCase() === 'none') return '';
          return str
            .replace(/<arg_key>.*?<\/arg_key>/gi, '')
            .replace(/<arg_value>|<\/arg_value>/gi, '')
            .replace(/<\/?[^>]+(>|$)/g, '')
            .trim();
        };

        const safeInt = (val: any): number => {
          if (val === null || val === undefined) return 0;
          if (typeof val === 'number') return Math.floor(val);
          const sanitized = sanitize(val);
          const n = parseInt(sanitized, 10);
          return isNaN(n) ? 0 : n;
        };

        const parseAsTags = (val: any) => {
          const s = sanitize(val);
          if (!s) return [];

          // Case 1: Comma-separated (Standard UI Mode)
          if (s.includes(',')) {
            return s.split(/,\s*/).filter(Boolean).map(t => t.trim());
          }

          // Case 2: No commas. Treat as a single item/phrase.
          // Remove wrapper quotes if present to avoid double-quoting later
          const trimmed = s.replace(/^"|"$/g, '').trim();
          return [trimmed];
        };

        const wrapPhrase = (s: string) => {
          // If it contains spaces and isn't already quoted, wrap it.
          if (s.includes(' ') && !s.startsWith('"')) return `"${s}"`;
          return s;
        };

        if (args.allWords) {
          const s = sanitize(args.allWords);
          if (s) queryParts.push(s); // X handles multiple words as AND naturally
        }
        if (args.exactPhrase) {
          // Remove pre-existing quotes to avoid double-quoting
          const s = sanitize(args.exactPhrase).replace(/^"|"$/g, '').trim();
          if (s) queryParts.push(`"${s}"`);
        }
        if (args.anyWords) {
          const p = parseAsTags(args.anyWords).map(wrapPhrase);
          if (p.length) queryParts.push(`(${Array.from(new Set(p)).join(' OR ')})`);
        }
        if (args.noneWords) {
          // Split by either comma or space to handle multiple negative keywords
          const none = sanitize(args.noneWords).split(/[\s,]+/).filter(Boolean);
          none.forEach(w => {
            queryParts.push(`-${wrapPhrase(w)}`);
          });
        }
        if (args.hashtags) {
          parseAsTags(args.hashtags).forEach(h => {
            const h2 = h.startsWith('#') ? h.slice(1) : h;
            const tag = `#${h2}`;
            queryParts.push(wrapPhrase(tag));
          });
        }
        if (args.cashtags) {
          parseAsTags(args.cashtags).forEach(c => {
            const c2 = c.startsWith('$') ? c.slice(1) : c;
            const tag = `$${c2}`;
            queryParts.push(wrapPhrase(tag));
          });
        }

        if (args.fromAccount) {
          parseAsTags(args.fromAccount).forEach(acc => {
            queryParts.push(`from:${acc.replace('@', '')}`);
          });
        }
        if (args.toAccount) {
          parseAsTags(args.toAccount).forEach(acc => {
            queryParts.push(`to:${acc.replace('@', '')}`);
          });
        }
        if (args.mentionsAccount) {
          parseAsTags(args.mentionsAccount).forEach(acc => {
            queryParts.push(`@${acc.replace('@', '')}`);
          });
        }
        if (args.retweetsOf) {
          parseAsTags(args.retweetsOf).forEach(acc => {
            queryParts.push(`retweets_of:${acc.replace('@', '')}`);
          });
        }
        if (args.listId) {
          const s = sanitize(args.listId);
          if (s) queryParts.push(`list:${s}`);
        }

        if (args.isRetweet === true) queryParts.push('filter:retweets');
        else if (args.isRetweet === false) queryParts.push('-filter:retweets');

        if (args.isReply === true) queryParts.push('filter:replies');
        else if (args.isReply === false) queryParts.push('-filter:replies');

        if (args.isQuote === true) queryParts.push('is:quote');
        if (args.isVerified === true) queryParts.push('is:verified');

        if (args.hasLinks === true) queryParts.push('has:links');
        if (args.hasImages === true) queryParts.push('has:images');
        if (args.hasVideo === true) queryParts.push('has:video_link');
        if (args.hasMedia === true) queryParts.push('has:media');

        if (args.urlContained) {
          const s = sanitize(args.urlContained);
          if (s) queryParts.push(`url:${s}`);
        }

        const mL = safeInt(args.minLikes);
        const mRt = safeInt(args.minRetweets);
        const mRp = safeInt(args.minReplies);

        if (mL > 0) queryParts.push(`min_likes:${mL}`);
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
        if (args.place) {
          const s = sanitize(args.place);
          if (s) queryParts.push(`place:"${s}"`);
        }

        if (args.positiveSentiment === true) queryParts.push(':)');
        if (args.negativeSentiment === true) queryParts.push(':(');
        if (args.questionsOnly === true) queryParts.push('?');

        const q = queryParts.join(' ');
        if (!q.trim()) return JSON.stringify({ success: false, error: 'No search criteria provided.' });

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

        const urlObj = new URL(currentUrl.startsWith('http') ? currentUrl : 'https://x.com');
        const currentQ = urlObj.searchParams.get('q') || '';
        const currentF = urlObj.searchParams.get('f') || 'top';
        const targetF = params.get('f') || 'top';

        if (currentQ === q && currentF === targetF && currentUrl.includes('/search')) {
          console.log(`[X Tool] Already on identical search, skipping reload: ${q}`);
        } else {
          console.log(`[X Tool] Loading search: ${q}`);
          await contents.loadURL(finalUrl);
        }

        const result = await contents.executeJavaScript(WAIT_FOR_RESULTS_SCRIPT);
        return JSON.stringify({ ...result, url: finalUrl, query: q, searchSummary: q });
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
      expected_author: z.string().nullable().describe('Handle of the author (without @) to verify target. Highly recommended.'),
    }),
    func: async ({ index, action, expected_author }: { index: number | string | null; action: 'like' | 'unlike' | 'toggle' | null; expected_author?: string | null }) => {
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

            // Use Robust Finder
            const findResult = await findTweetRobustly(${rIndex}, ${JSON.stringify(expected_author || null)});
            if (!findResult.tweet) return { success: false, error: findResult.error || 'Tweet not found' };
            const target = findResult.tweet;

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
      text: z.string().min(1).describe('The DIRECT content of the reply. STRICTLY the message logic only. NO "I will repl..." or narration.'),
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
                  // Soft focus
                  composer.focus({ preventScroll: true });
                  await typeHumanLike(composer, ${JSON.stringify(text)});
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
            const myHandle = getMyHandle();
            const authorHandle = getTweetAuthor(tweetNode);
            const authorName = tweetNode.querySelector('[data-testid="User-Name"]')?.innerText || '';
            const verifiedIcon = tweetNode.querySelector('[data-testid="icon-verified"], [aria-label*="Verified"]');
            const socialContext = tweetNode.querySelector('[data-testid="socialContext"]')?.innerText.toLowerCase() || '';
            const isMyRetweet = socialContext.includes('you retweeted') || socialContext.includes('tu retuiteaste');
            
            if (${finalSkipSelf} && (isMyRetweet || (myHandle && authorHandle === myHandle))) {
              return { success: true, skipped: true, reason: 'self', message: 'Skipped: Logged-in user post or retweet' + (myHandle ? ' (Handle: @' + myHandle + ')' : '') };
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
            
            // Check for Blocking Modals first (e.g., "Who can reply?")
            if (modal) {
               const modalText = (modal.innerText || '').toLowerCase();
               if (modalText.includes('who can reply') || modalText.includes('people the author mentioned') || modalText.includes('accounts mentioned')) {
                   const gotItBtn = Array.from(modal.querySelectorAll('[role="button"]')).find(b => {
                        const t = b.innerText.toLowerCase();
                        return t.includes('got it') || t.includes('ok') || t.includes('understand') || t.includes('entendido');
                   }) || modal.querySelector('[data-testid="app-bar-close"]');

                   if (gotItBtn) {
                       await safeClick(gotItBtn, 'Dismiss Restriction Modal');
                       await wait(500);
                   }
                   return { success: true, skipped: true, reason: 'restricted', message: 'Skipped: Reply restricted by author (Modal dismissed)' };
               }
            }

            const composer = root.querySelector('[data-testid="tweetTextarea_0"]') || 
                             root.querySelector('div[role="textbox"][contenteditable="true"]');
            
            if (!composer) return { success: false, error: 'Reply composer not found after click' };

            await safeClick(composer, 'Composer', { focusWait: 50, afterWait: 200 });
            // Soft focus - preventScroll helps avoid window jumping
            composer.focus({ preventScroll: true });
            await typeHumanLike(composer, ${JSON.stringify(text)});
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
    schema: z.object({ text: z.string().min(1).describe('The DIRECT content of the post. STRICTLY the message only. NO narration.') }),
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
            // Soft focus
            composer.focus({ preventScroll: true });
            await typeHumanLike(composer, ${JSON.stringify(text)});
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
      expected_author: z.string().nullable().describe('Handle of the author (without @) to verify target. Highly recommended for timeline followers.'),
    }),
    func: async ({ index, action, expected_author }: { index: number | string | null; action: 'follow' | 'unfollow' | 'toggle' | null; expected_author?: string | null }) => {
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
              // If expected_author provided, prioritize it
              const findResult = await findTweetRobustly(idx, ${JSON.stringify(expected_author || null)});
              if (findResult.tweet) {
                  return await followAuthorOfTweet(findResult.tweet, desired);
              }

              // Legacy fallback if no match found (mostly for compat, though findTweetRobustly handles default case)
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

  /* 
   * CONSOLIDATED SCOUT TOOL 
   * Modes: Niche, Community, Followers (Competitor)
   */
  const scoutTool = new DynamicStructuredTool({
    name: 'x_scout', // Renamed from x_scout_topics to generic x_scout
    description: 'Scout for targets, trends, and accounts across Niches, Communities, or Competitor Audiences.',
    schema: z.object({
      mode: z.enum(['niche', 'community', 'followers']).describe('Scout mode: "niche" (keywords), "community" (specific group), or "followers" (competitor audience).'),
      target: z.string().describe('The Niche keyword, Community ID/URL, or Username/Competitor Handle depending on the mode.'),
      limit: z.number().nullable().describe('Max number of items to return. Default is 10.'),
      filter: z.enum(['top', 'latest']).nullable().describe('Filter for Niche/Community modes.').default('latest'),
    }),
    func: async ({ mode, target, limit, filter }: { mode: 'niche' | 'community' | 'followers'; target: string; limit: number | null; filter?: string | null }) => {
      const contents = ctx.getContents();
      const lim = limit ?? 10;

      try {
        let url = '';
        const cleanTarget = target.trim();

        // 1. Navigation Strategy based on Mode
        if (mode === 'niche') {
          const params = new URLSearchParams();
          params.set('q', cleanTarget);
          params.set('src', 'typed_query');
          if (filter === 'latest') params.set('f', 'live');
          url = `https://x.com/search?${params.toString()}`;
        } else if (mode === 'community') {
          const cleanId = cleanTarget.split('/').pop() || cleanTarget;
          url = `https://x.com/communities/${cleanId}`;
        } else if (mode === 'followers') {
          // Target is a username, we want to see their followers (or verify if we want "following" later)
          // Defaulting to "Followers" as that's usually the "Competitor Audience" use case.
          const handle = cleanTarget.replace('@', '');
          url = `https://x.com/${handle}/followers`;
        }

        if (url) {
          await contents.loadURL(url);
          // Wait logic differs slightly by page type
          if (mode === 'niche') {
            await contents.executeJavaScript(WAIT_FOR_RESULTS_SCRIPT);
          } else {
            await contents.executeJavaScript(`
                    (async () => { 
                        await new Promise(r => setTimeout(r, 3000)); // Basic load wait
                    })()
                `);
          }
        }

        const result = await contents.executeJavaScript(`
          (async function() {
            ${BASE_SCRIPT_HELPERS}
            try {
              const mode = ${JSON.stringify(mode)};
              
              // Helper to scroll
              const leadsMap = new Map(); // key: handle, val: { handle, verified_type }
              
              const scrollAndCollect = async (targetCount) => {
                 let attempts = 0;
                 // Allow deep exploration: proportional to target but with a high floor and ceiling
                 const maxAttempts = Math.min(Math.max(40, targetCount * 2), 200); 
                 const selector = mode === 'followers' ? '[data-testid="UserCell"]' : 'article[data-testid="tweet"]';
                 
                 let lastSize = 0;
                 let noGrowthCount = 0;

                 while (leadsMap.size < targetCount && attempts < maxAttempts) {
                    const elements = Array.from(document.querySelectorAll(selector));
                    elements.forEach(el => {
                       let handle = '';
                       let verifiedType = null;

                       if (mode === 'followers') {
                          // Followers List (UserCells)
                          const link = el.querySelector('a')?.getAttribute('href');
                          if (link) {
                              handle = '@' + link.replace('/', '');
                              verifiedType = getVerificationStatus(el);
                          }
                       } else {
                          // Niche Feed (Tweets)
                          handle = getTweetAuthor(el); // Returns "handle" (no @)
                          if (handle) handle = '@' + handle;
                          verifiedType = getVerificationStatus(el);
                       }
                       
                       if (handle && handle !== '@Profile' && !leadsMap.has(handle)) {
                           leadsMap.set(handle, { handle, verified_type: verifiedType || 'none' });
                       }
                    });

                    // Break early if we are stuck (infinite scroll ended or blocked)
                    if (leadsMap.size === lastSize) {
                        noGrowthCount++;
                        if (noGrowthCount > 5) break; // accumulated 5 scrolls with no new data
                    } else {
                        noGrowthCount = 0;
                    }
                    lastSize = leadsMap.size;
                    
                    // Variable human-like scroll
                    const scrollDistance = 1200 + Math.floor(Math.random() * 800);
                    window.scrollBy(0, scrollDistance);
                    // Variable wait to allow network load (X can be slow to render new chunks)
                    await wait(1800 + Math.random() * 700); 
                    attempts++;
                 }
              };

              // --- MODE SPECIFIC LOGIC ---

              if (mode === 'followers') {
                  await scrollAndCollect(${lim});
                  const accounts = Array.from(leadsMap.values()).slice(0, ${lim});

                  return {
                     success: true,
                     accounts: accounts,
                     message: 'Scouted ' + accounts.length + ' accounts from competitor audience.'
                  };
              }

              // --- NICHE & COMMUNITY (Feed based) ---
              
              if (mode === 'community') {
                  const tabLabel = ${JSON.stringify(filter === 'top' ? 'Top' : 'Latest')};
                  const tabs = Array.from(document.querySelectorAll('[role="tab"]'));
                  const targetTab = tabs.find(t => t.innerText && t.innerText.includes(tabLabel));
                  const isAlreadySelected = (el) => {
                    if (el.getAttribute('aria-selected') === 'true') return true;
                    // Check for font weight and underline as fallback
                    const style = window.getComputedStyle(el);
                    const isBold = style.fontWeight === '700' || parseInt(style.fontWeight) >= 700;
                    const underline = el.querySelector('div[style*="background-color: rgb(29, 155, 240)"]');
                    return isBold && !!underline;
                  };

                  if (targetTab && !isAlreadySelected(targetTab)) {
                    await safeClick(targetTab, tabLabel + ' Tab');
                    await wait(2000);
                  }
              }

              await scrollAndCollect(${lim});
              
              // Also collect text for hashtags from visible tweets
              const articles = Array.from(document.querySelectorAll('article[data-testid="tweet"]'));
              const tweetsText = articles.map(a => a.innerText).join(' ');
              const hashtagsList = (tweetsText.match(/#[\\w]+/g) || []).map(h => h.toLowerCase());
              
              const count = (arr) => {
                  const map = {};
                  arr.forEach(i => map[i] = (map[i] || 0) + 1);
                  return Object.entries(map).sort((a,b) => b[1] - a[1]).map(e => e[0]);
              };
              
              const scrapedHashtags = count(hashtagsList).slice(0, ${lim});
              const scrapedAccounts = Array.from(leadsMap.values()).slice(0, ${lim});

              return {
                  hashtags: scrapedHashtags,
                  accounts: scrapedAccounts,
                  topics: scrapedHashtags.join(' '), 
                  success: true,
                  message: (scrapedHashtags.length || scrapedAccounts.length) 
                            ? ('Scouted ' + scrapedHashtags.length + ' hashtags and ' + scrapedAccounts.length + ' accounts.')
                            : 'Scouting complete, but no clear trends found.'
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

  const profileTool = new DynamicStructuredTool({
    name: 'x_profile',
    description: 'Get profile details for the logged-in user or a target account. Useful for qualification and identity verification.',
    schema: z.object({
      mode: z.enum(['me', 'target']).default('target').describe('Use "me" to get your own profile info, or "target" for someone else.'),
      username: z.string().optional().describe('Handle of the target user (required if mode is target)'),
      should_follow: z.boolean().default(false).describe('If true, will follow the user if not already followed.'),
    }),
    func: async ({ mode, username, should_follow }: { mode: 'me' | 'target'; username?: string; should_follow?: boolean }) => {
      const contents = ctx.getContents();
      const followRequested = should_follow ?? false;
      try {
        if (mode === 'me') {
          await contents.loadURL('https://x.com/profile');
          await new Promise(r => setTimeout(r, 3000));
        } else {
          const handle = (username || '').replace('@', '').trim();
          if (!handle) throw new Error('Username is required for target mode');
          await contents.loadURL(`https://x.com/${handle}`);
          await contents.executeJavaScript(WAIT_FOR_RESULTS_SCRIPT);
        }

        const result = await contents.executeJavaScript(`
                (async () => {
                    ${BASE_SCRIPT_HELPERS}
                    try {
                        const getTestIdText = (id) => {
                            const el = document.querySelector(\`[data-testid="\${id}"]\`);
                            return el ? el.innerText : '';
                        };

                        const handleEl = document.querySelector('[data-testid="UserName"] div[dir="ltr"] span');
                        const bioEl = document.querySelector('[data-testid="UserDescription"]');
                        const locationEl = document.querySelector('[data-testid="UserLocation"]');
                        const urlEl = document.querySelector('[data-testid="UserUrl"]');
                        const joinDateEl = document.querySelector('[data-testid="UserJoinDate"]');
                        
                        await wait(1500);

                        const followingCountEl = document.querySelector('a[href$="/following"] span span');
                        const followersCountEl = document.querySelector('a[href$="/followers"] span span') || 
                                               document.querySelector('a[href$="/verified_followers"] span span');
                        
                        const header = document.querySelector('main h2')?.parentElement;
                        const postsCountText = header?.querySelector('div[dir="auto"]')?.innerText || '';

                        const verifiedEl = document.querySelector('[data-testid="icon-verified"]');
                        
                        const parseCount = (str) => {
                            if (!str) return 0;
                            const s = str.toUpperCase().trim();
                            const match = s.match(/([0-9,.]+)\\s*([KMB])?/);
                            if (!match) return 0;
                            
                            const numStr = match[1].replace(/,/g, '');
                            const suffix = match[2];
                            const val = parseFloat(numStr);
                            if (isNaN(val)) return 0;
                            
                            let multiplier = 1;
                            if (suffix === 'K') multiplier = 1000;
                            else if (suffix === 'M') multiplier = 1000000;
                            else if (suffix === 'B') multiplier = 1000000000;
                            
                            return Math.floor(val * multiplier);
                        };

                        let follow_status = 'unknown';
                        if (${followRequested}) {
                           const followBtn = document.querySelector('[data-testid$="-follow"]') || 
                                           document.querySelector('[data-testid$="-Follow"]');
                           
                           if (followBtn) {
                              const text = (followBtn.textContent || '').toLowerCase();
                              if (text.includes('following') || text.includes('unfollow')) {
                                 follow_status = 'already_following';
                              } else {
                                 await safeClick(followBtn, 'Profile Follow Button');
                                 await wait(1000);
                                 follow_status = 'followed';
                              }
                           } else {
                              follow_status = 'button_not_found';
                           }
                        }

                        const stats = {
                            name: getTestIdText('UserName')?.split('\\n')[0] || '',
                            handle: handleEl ? (handleEl.textContent || '').trim() : '',
                            bio: bioEl ? (bioEl.textContent || '').trim() : '',
                            location: locationEl ? (locationEl.textContent || '').trim() : '',
                            website: urlEl ? (urlEl.textContent || '').trim() : '',
                            joined: joinDateEl ? (joinDateEl.textContent || '').trim() : '',
                            following: parseCount(followingCountEl?.innerText),
                            followers: parseCount(followersCountEl?.innerText),
                            posts_count: parseCount(postsCountText),
                            is_verified: !!verifiedEl,
                            follow_status,
                            success: true
                        };
                        
                        let msg = 'Profile scanned: ' + (stats.handle || 'unknown') + ' (' + stats.followers + ' followers)';
                        return { ...stats, message: msg };
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

  const engageTool = new DynamicStructuredTool({
    name: 'x_engage',
    description: 'Perform multiple actions (like, follow, retweet, reply) on a tweet or post.',
    schema: z.object({
      targetIndex: z.preprocess((val) => (val === null ? 0 : Number(val)), z.number().default(0)).describe('The 0-based index of the tweet in the visible feed.'),
      actions: z.string().describe('Comma-separated list of actions to take: like, follow, retweet, reply.'),
      replyText: z.string().optional().describe('Required if "reply" action is specified.'),
      expected_author: z.string().nullable().optional().describe('Handle of the author (without @) to verify target. Highly recommended.'),
    }),
    func: async ({ targetIndex, actions, replyText, expected_author }) => {
      const contents = ctx.getContents();
      try {
        const result = await contents.executeJavaScript(`
          (async function () {
            try {
                ${POINTER_HELPERS}
                ${BASE_SCRIPT_HELPERS}
                
                const index = ${targetIndex};
                const actionList = ${JSON.stringify(actions)}.split(',').map(a => a.trim().toLowerCase());
                const rText = ${JSON.stringify(replyText || '')};
                const expAuth = ${JSON.stringify(expected_author || null)};

                // 1. Find Tweet
                const findResult = await findTweetRobustly(index, expAuth);
                if (!findResult.tweet) return { success: false, error: findResult.error || 'Tweet not found at index ' + index };
                const tweet = findResult.tweet;
                const results = [];

                for (const action of actionList) {
                    if (action === 'like') {
                        const likeBtn = tweet.querySelector('[data-testid="like"]');
                        if (likeBtn && isVisible(likeBtn)) {
                            await safeClick(likeBtn, 'Like');
                            results.push('Liked');
                        } else if (tweet.querySelector('[data-testid="unlike"]')) {
                            results.push('Already Liked');
                        } else {
                            results.push('Like Button Missing');
                        }
                    } else if (action === 'follow') {
                        const res = await followAuthorOfTweet(tweet, 'follow');
                        results.push(res.success ? (res.message || 'Followed') : ('Follow Error: ' + res.error));
                    } else if (action === 'retweet') {
                        const rtBtn = tweet.querySelector('[data-testid="retweet"]');
                        if (rtBtn && isVisible(rtBtn)) {
                            await safeClick(rtBtn, 'Retweet Menu');
                            await wait(400);
                            const rtConfirm = document.querySelector('[data-testid="retweetConfirm"]');
                            if (rtConfirm && isVisible(rtConfirm)) {
                                await safeClick(rtConfirm, 'Confirm Retweet');
                                results.push('Retweeted');
                            } else {
                                results.push('Retweet Confirm Missing');
                            }
                        } else if (tweet.querySelector('[data-testid="unretweet"]')) {
                            results.push('Already Retweeted');
                        } else {
                            results.push('Retweet Button Missing');
                        }
                    } else if (action === 'reply') {
                        if (!rText) {
                            results.push('Reply Skipped (No Text)');
                            continue;
                        }
                        const replyBtn = tweet.querySelector('[data-testid="reply"]');
                        if (replyBtn && isVisible(replyBtn)) {
                            await safeClick(replyBtn, 'Reply');
                            await wait(1000);
                            
                            const modal = Array.from(document.querySelectorAll('[role="dialog"]')).filter(isVisible).pop() || document;
                            const composer = modal.querySelector('[data-testid="tweetTextarea_0"]') || 
                                             modal.querySelector('div[role="textbox"][contenteditable="true"]');
                            
                            if (composer) {
                                await safeClick(composer, 'Reply Composer');
                                composer.focus({ preventScroll: true });
                                await typeHumanLike(composer, rText);
                                await wait(500);
                                const send = modal.querySelector('[data-testid="tweetButton"]');
                                if (send) {
                                    await safeClick(send, 'Send Reply');
                                    results.push('Replied');
                                    await wait(1000);
                                } else {
                                    results.push('Reply Send Missing');
                                }
                            } else {
                                results.push('Reply Composer Missing');
                            }
                        } else {
                            results.push('Reply Button Missing');
                        }
                    }
                }

                return { 
                    success: true, 
                    message: results.join(', '),
                    recovered: findResult.recovered,
                    finalIndex: findResult.index 
                };
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

  const dmTool = new DynamicStructuredTool({
    name: 'x_dm',
    description: 'On X.com (Twitter), send a direct message (DM) to a user.',
    schema: z.object({
      username: z.string().describe('Target handle (without @).'),
      text: z.string().min(1).describe('Message content.'),
      pin: z.string().optional().describe('4-digit PIN for encrypted chats. If prompted for a passcode, you MUST provide this.'),
    }),
    func: async ({ username, text, pin }: { username: string; text: string; pin?: string }) => {
      const contents = ctx.getContents();
      const handle = (username || '').replace('@', '').trim();
      try {
        await contents.loadURL(`https://x.com/${handle}`);
        await contents.executeJavaScript(WAIT_FOR_RESULTS_SCRIPT);

        const result = await contents.executeJavaScript(`
          (async function() {
            try {
              ${POINTER_HELPERS}
              ${BASE_SCRIPT_HELPERS}
              
              const dmBtn = document.querySelector('[aria-label="Message"], [data-testid="sendDMFromProfile"]');
              if (!dmBtn) {
                  return { success: false, error: 'Message button not found on profile. User might have DMs closed or you are not following them.' };
              }

              await safeClick(dmBtn, 'DM Button');
              await wait(2000);

              // PIN handling logic
              const pinContainer = document.querySelector('[data-testid="pin-code-input-container"]');
              const isPinScreen = pinContainer || window.location.href.includes('/chat/pin/');
              
              if (isPinScreen) {
                  if (!${JSON.stringify(pin)}) {
                      return { 
                          success: false, 
                          error: 'PIN_REQUIRED', 
                          message: 'X is asking for your DM Passcode/PIN to decrypt this conversation. Please provide your 4-digit PIN in the "pin" parameter.' 
                      };
                  }
                  
                  const inputs = document.querySelectorAll('[data-testid="pin-code-input-container"] input');
                  const pinStr = ${JSON.stringify(pin)} || "";
                  
                  if (inputs.length >= 4) {
                      for (let i = 0; i < 4; i++) {
                          const input = inputs[i];
                          if (input) {
                              input.focus();
                              await wait(150 + Math.random() * 250);
                              document.execCommand('insertText', false, pinStr[i] || "");
                              await wait(100 + Math.random() * 150);
                          }
                      }
                      await wait(2500); // Wait for decryption/redirect
                  }
              }

              const dmComposer = document.querySelector('textarea[data-testid="dm-composer-textarea"], [data-testid="dm-composer-textarea"], [role="textbox"][data-testid="dm-composer-textarea"]');
              if (!dmComposer) {
                  return { success: false, error: 'DM Composer not found after PIN/Navigation. UI might be different or decryption failed.' };
              }

              await safeClick(dmComposer, 'DM Composer');
              dmComposer.focus({ preventScroll: true });
              await typeHumanLike(dmComposer, ${JSON.stringify(text)});
              await wait(800);

              const sendBtn = document.querySelector('[data-testid="dm-composer-send-button"]');
              if (sendBtn) {
                  await safeClick(sendBtn, 'Send DM');
                  await wait(1000);
                  return { success: true, message: 'DM Sent' };
              } else {
                  return { success: false, error: 'DM Send Button Not Found' };
              }
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

  const analyzeNotificationsTool = new DynamicStructuredTool({
    name: 'x_analyze_notifications',
    description: 'Go to the notifications page and extract the latest interactions (likes, follows, mentions, etc.).',
    schema: z.object({
      filter: z.enum(['all', 'verified', 'mentions']).default('all').describe('Which notification tab to analyze.'),
      limit: z.number().default(20).describe('Max number of notifications to extract.'),
    }),
    func: async ({ filter, limit }: { filter: 'all' | 'verified' | 'mentions'; limit: number }) => {
      const contents = ctx.getContents();
      try {
        const result = await contents.executeJavaScript(`
          (async function() {
            try {
              ${BASE_SCRIPT_HELPERS}
              
              // 1. Navigate to the correct tab if needed
              const tabUrls = {
                all: 'https://x.com/notifications',
                verified: 'https://x.com/notifications/priority',
                mentions: 'https://x.com/notifications/mentions'
              };
              
              const targetUrl = tabUrls['${filter}'];
              if (window.location.href !== targetUrl) {
                window.location.href = targetUrl;
                await wait(3000); // Wait for page load
              }

              // 2. Extract notifications
              const articles = Array.from(document.querySelectorAll('article')).slice(0, ${limit});
              const notifications = articles.map(article => {
                const testid = article.getAttribute('data-testid');
                const text = article.innerText;
                const links = Array.from(article.querySelectorAll('a')).map(a => ({
                  text: a.innerText,
                  href: a.href
                }));
                
                let type = 'unknown';
                if (testid === 'tweet') {
                  type = 'mention/reply';
                } else if (text.includes('followed you')) {
                  type = 'follow';
                } else if (text.includes('liked your post') || text.includes('liked your reply') || text.includes('liked 2 of your posts')) {
                  type = 'like';
                } else if (text.includes('reposted your post')) {
                  type = 'repost';
                } else if (text.includes('New post notifications')) {
                  type = 'new_post';
                }

                // Find the main tweet link if applicable
                let tweetUrl = null;
                if (testid === 'tweet') {
                  const timeLink = article.querySelector('time')?.parentElement;
                  if (timeLink && timeLink.tagName === 'A') {
                    tweetUrl = timeLink.href;
                  }
                } else {
                  const statusLink = links.find(l => l.href.includes('/status/'));
                  if (statusLink) tweetUrl = statusLink.href;
                }

                // Extract users involved
                const users = links.filter(l => 
                  l.href && 
                  !l.href.includes('/status/') && 
                  !l.href.includes('/notifications') && 
                  !l.href.includes('/settings') &&
                  l.text.trim().startsWith('@')
                ).map(l => ({
                  handle: l.text.trim(),
                  url: l.href
                }));

                const tweetTextEl = article.querySelector('[data-testid="tweetText"]');
                const tweetContent = tweetTextEl ? tweetTextEl.innerText : null;

                return {
                  type,
                  content: tweetContent,
                  fullText: text.substring(0, 300).replace(/\\s+/g, ' '),
                  users,
                  tweetUrl,
                  timestamp: article.querySelector('time')?.innerText || 'just now'
                };
              });

              return { success: true, count: notifications.length, notifications };
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

  const switchTabTool = new DynamicStructuredTool({
    name: 'x_switch_tab',
    description: 'Switch between timeline tabs or search result tabs on X.com (e.g., "For you", "Following" on Home; or "Latest", "People", "Media", "Lists" on Search).',
    schema: z.object({
      tab_name: z.string().describe('The label of the tab to switch to (e.g., "Following", "Latest", "People", "Media", "Lists").'),
    }),
    func: async ({ tab_name }: { tab_name: string }) => {
      const contents = ctx.getContents();
      try {
        const result = await contents.executeJavaScript(`
          (async function() {
            try {
              ${BASE_SCRIPT_HELPERS}
              
              // 1. Ensure we are on a page that supports tabs (Home or Search)
              const url = window.location.href;
              if (!url.includes('/search') && !url.includes('x.com/home') && url !== 'https://x.com/') {
                 window.location.href = 'https://x.com/home';
                 await wait(3500);
              }

              const findTabs = () => Array.from(document.querySelectorAll('[role="tab"]'));
              let tabs = findTabs();
              
              // Retry for tabs if they are loading
              if (tabs.length === 0) {
                 await wait(1500);
                 tabs = findTabs();
              }

              const targetName = ${JSON.stringify(tab_name.toLowerCase())};
              const targetTab = tabs.find(t => {
                const txt = (t.innerText || t.getAttribute('aria-label') || '').toLowerCase();
                return txt.includes(targetName);
              });
              
              if (!targetTab) {
                const availableTabs = tabs.map(t => (t.innerText || t.getAttribute('aria-label') || 'unnamed')).join(', ');
                return { success: false, error: 'Tab "' + ${JSON.stringify(tab_name)} + '" not found. Available tabs: ' + availableTabs };
              }

              const isAlreadySelected = (el) => {
                if (el.getAttribute('aria-selected') === 'true') return true;
                
                // Extra checks for X's dynamic DOM
                const style = window.getComputedStyle(el);
                const isBold = style.fontWeight === '700' || parseInt(style.fontWeight) >= 700;
                
                // The blue underline div that X uses for the active tab
                const underline = Array.from(el.querySelectorAll('div')).find(d => {
                  const s = window.getComputedStyle(d);
                  return (s.backgroundColor === 'rgb(29, 155, 240)' || s.backgroundColor === 'rgb(255, 122, 0)') && 
                         parseInt(s.height) >= 2;
                });
                
                return isBold && !!underline;
              };

              if (isAlreadySelected(targetTab)) {
                return { success: true, message: 'Already on tab "' + (targetTab.innerText || tab_name) + '"', already_on: true };
              }

              await safeClick(targetTab, 'Timeline/Search Tab');
              await wait(2000); // Wait for feed to update
              
              // Verify navigation
              const finalTabs = findTabs();
              const verifiedTab = finalTabs.find(t => {
                 const txt = (t.innerText || t.getAttribute('aria-label') || '').toLowerCase();
                 return txt.includes(targetName);
              });
              const isSelected = verifiedTab ? isAlreadySelected(verifiedTab) : false;

              return { 
                success: true, 
                message: 'Switched to tab "' + (targetTab.innerText || tab_name) + '"',
                verified: isSelected
              };
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
    description: 'Scan visible posts on X.com to get their metadata and engagement status. indices match x_engage targets. USE scroll_bottom=true if you have processed the current visible posts and need to load more.',
    schema: z.object({
      limit: z.number().nullable().default(10),
      scroll_bottom: z.boolean().nullable().describe('Whether to scroll down after scanning to load new posts. Set to true if you are looping or need new results.').default(false),
    }),
    func: async ({ limit, scroll_bottom }: { limit: number | null, scroll_bottom?: boolean }) => {
      const contents = ctx.getContents();
      try {
        const result = await contents.executeJavaScript(`
          (async function() {
            ${BASE_SCRIPT_HELPERS}
            
            // 1. Get VISIBLE tweets only, to match findTweetRobustly indexing logic
            // This is critical strictly for index alignment with x_engage
            const allTweets = Array.from(document.querySelectorAll('[data-testid="tweet"]'));
            const tweets = allTweets.filter(isVisible).slice(0, ${limit || 15});
            
            const data = tweets.map((t, i) => {
               const author = getTweetAuthor(t);
               const textEl = t.querySelector('[data-testid="tweetText"]');
               const text = textEl ? textEl.innerText.replace(/\\n/g, ' ').slice(0, 120) : ''; 
               
               // Check engagement
               const isLiked = !!t.querySelector('[data-testid="unlike"]');
               const isRetweeted = !!t.querySelector('[data-testid="unretweet"]');
               const isPromoted = !!t.querySelector('[data-testid="placementTracking"]') || t.innerText.includes('Promoted');
               const analyticsValue = t.querySelector('[href*="/analytics"]')?.innerText || '0';
               
               // Since we filtered by isVisible, these are by definition visible
               return { 
                 index: i, 
                 author, 
                 text, 
                 isLiked, 
                 isRetweeted, 
                 isPromoted,
                 isEngaged: isLiked || isRetweeted,
                 metrics: analyticsValue,
                 visible: true 
               };
            });

            // 2. Handle Scroll AFTER scanning (to avoid shifting indices during scan)
            let scrolled = false;
            if (${scroll_bottom}) {
               window.scrollBy({ top: 800, behavior: 'smooth' });
               scrolled = true;
               // We don't wait for the scroll to finish here, we just trigger it. 
               // The next tool call will see the new state.
            }
            
            return { 
              success: true, 
              count: data.length, 
              posts: data,
              scrolled,
              message: data.length > 0 
                ? ('Scanned ' + data.length + ' visible posts.' + (scrolled ? ' Scrolled down to load more.' : ''))
                : ('No posts found. Are you on a feed? (URL: ' + window.location.href + ')')
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
    description: 'Perform a sequence of actions (like, follow, retweet, reply) on a specific post. YOU MUST use this after scan_posts to engage with interesting content. Do not just scan without engaging.',
    schema: engageTool.schema,
    func: engageTool.func,
  });

  const recoverTool = new DynamicStructuredTool({
    name: 'x_recover',
    description: 'Check for and handle X.com error states (modals, toasts, "Something went wrong"). Use this if a previous tool failed or if you suspect the page is broken.',
    schema: z.object({
      force_reload: z.boolean().default(false).describe('Force a full page reload if no specific error UI is found.'),
    }),
    func: async ({ force_reload }) => {
      const contents = ctx.getContents();
      try {
        const result = await contents.executeJavaScript(`
          (async function() {
            ${BASE_SCRIPT_HELPERS}
            
            // 1. Check for "Something went wrong" Toast / Bar
            // Strategies: Toast with Refresh button, or generic error dialog
            const candidates = Array.from(document.querySelectorAll('[role="alert"], [data-testid="toast"], [role="status"]'));
            const errorBar = candidates.find(el => {
                if (!isVisible(el)) return false;
                const txt = el.innerText.toLowerCase();
                return (
                    txt.includes('something went wrong') || 
                    txt.includes('try again') ||
                    txt.includes("don't fret") ||
                    txt.includes('reload')
                );
            });

            if (errorBar) {
                // Try to find a button: Refresh, Retry, Reload
                const btns = Array.from(errorBar.querySelectorAll('button, [role="button"]'));
                const actionBtn = btns.find(b => {
                    const t = b.innerText.toLowerCase();
                    return t.includes('refresh') || t.includes('retry') || t.includes('reload') || t.includes('shot'); // "give it another shot"
                }) || btns[0]; // Fallback to first button if it's the only one (often "Refresh")

                if (actionBtn) {
                    await safeClick(actionBtn, 'Error Toast Action Button');
                    await wait(3000); // Wait for reload/action
                    return { success: true, recovered: true, action: 'clicked_toast_refresh', message: 'Clicked action button on error toast: ' + actionBtn.innerText };
                }
                
                // If no button, maybe close it?
                const closeBtn = errorBar.querySelector('[aria-label="Close"]');
                if (closeBtn) {
                    await safeClick(closeBtn, 'Error Toast Close Button');
                    return { success: true, recovered: true, action: 'closed_error_toast', message: 'Closed error toast' };
                }
            }

            // 2. Check for Full Page Error ("Retry")
            // Often has a big "Retry" button
            const retryBtns = Array.from(document.querySelectorAll('button')).filter(isVisible);
            const pageRetry = retryBtns.find(b => {
                const t = b.innerText.toLowerCase();
                return t === 'retry' || t === 'refresh';
            });
            
            // Confirm it's likely an error page by looking for text
            const bodyText = document.body.innerText.toLowerCase();
            const hasErrorText = bodyText.includes('something went wrong') || bodyText.includes('try reloading');

            if (pageRetry && hasErrorText) {
                 await safeClick(pageRetry, 'Full Page Retry Button');
                 await wait(3000);
                 return { success: true, recovered: true, action: 'clicked_page_retry', message: 'Clicked Retry on full page error' };
            }

            // 3. Dialogs blocking UI
            const blockedDialog = document.querySelector('[role="dialog"][aria-modal="true"]');
            if (blockedDialog && isVisible(blockedDialog) && blockedDialog.innerText.toLowerCase().includes('something went wrong')) {
                 // Try to find a way out
                 const close = blockedDialog.querySelector('[aria-label="Close"]');
                 if(close) {
                    await safeClick(close, 'Error Dialog Close');
                    return { success: true, recovered: true, action: 'closed_error_dialog', message: 'Closed error dialog' };
                 }
            }

            return { success: false, found: false };
          })()
        `);

        if (result.success && result.recovered) {
          return JSON.stringify(result);
        }

        if (force_reload) {
          await contents.reload();
          await new Promise(r => setTimeout(r, 4000));
          return JSON.stringify({ success: true, recovered: true, action: 'force_reload', message: 'Forced page reload' });
        }

        return JSON.stringify({ success: false, error: 'No recoverable error state found' });

      } catch (e) {
        return JSON.stringify({ success: false, error: String(e) });
      }
    }
  });

  return [searchTool, advancedSearchTool, likeTool, replyTool, postTool, followTool, scoutTool, profileTool, engageTool, dmTool, switchTabTool, analyzeNotificationsTool, checkEngagementTool, scanPostsTool, engagingTool, recoverTool];
}
