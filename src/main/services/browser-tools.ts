import { webContents, BrowserWindow } from 'electron';
import { z } from 'zod';
import * as cheerio from 'cheerio';
import { DynamicStructuredTool } from '@langchain/core/tools';
import { createSiteTools } from './site-tools';

// Send debug log to renderer
function sendDebugLog(type: 'info' | 'error' | 'warning', message: string, data?: any) {
  const windows = BrowserWindow.getAllWindows();
  if (windows.length > 0) {
    windows[0].webContents.send('debug:log', { type, message, data });
  }
}

const webviewContents = new Map<string, Electron.WebContents>();

// Navigation is now always allowed - like a regular browser
// These functions are kept for API compatibility but are no-ops
export function setNavigationBlocked(_blocked: boolean) {
  // No-op: Navigation is always allowed for fluid browsing
}

export function allowNavigation(_url?: string) {
  // No-op: Navigation is always allowed for fluid browsing
}

export function isNavigationBlocked(): boolean {
  return false; // Never blocked
}

// Recording State
const recordingTabs = new Set<string>();
const recordingInitiators = new Map<string, Electron.WebContents>();

const RECORDING_SCRIPT = `
(function() {
  if (window.__REAVION_RECORDER_ACTIVE__) return;
  window.__REAVION_RECORDER_ACTIVE__ = true;
  function generateSelector(element) {
    if (!element || element.nodeType !== 1) return '';
    
    // 1. High-priority attributes
    const testId = element.getAttribute('data-testid');
    if (testId) return '[data-testid="' + testId + '"]';
    
    if (element.id) return '#' + (window.CSS && CSS.escape ? CSS.escape(element.id) : element.id);
    
    const ariaLabel = element.getAttribute('aria-label');
    if (ariaLabel) return '[aria-label="' + ariaLabel + '"]';
    
    // 2. Element specific semantics
    const tagName = element.tagName.toLowerCase();
    if (tagName === 'input' || tagName === 'textarea' || tagName === 'button') {
        const placeholder = element.getAttribute('placeholder');
        if (placeholder) return tagName + '[placeholder="' + placeholder + '"]';
        
        const name = element.getAttribute('name');
        if (name) return tagName + '[name="' + name + '"]';
        
        const type = element.getAttribute('type');
        if (type && type !== 'text') return tagName + '[type="' + type + '"]';
    }

    const role = element.getAttribute('role');
    if (role) return '[role="' + role + '"]';

    // 3. Fallback path-based selector
    let path = [];
    let current = element;
    while (current && current.nodeType === 1) {
      let selector = current.tagName.toLowerCase();
      if (current.id) {
        selector += '#' + (window.CSS && CSS.escape ? CSS.escape(current.id) : current.id);
        path.unshift(selector);
        break; // Stop at ID
      } else {
        // Add class if unique among siblings (simplified)
        const className = Array.from(current.classList).filter(c => !c.startsWith('reavion-'))[0];
        if (className) selector += '.' + className;
        
        // Add position if needed? (Too brittle? For now just tags)
        path.unshift(selector);
      }
      current = current.parentElement;
      if (path.length > 5) break; 
    }
    return path.join(' > ');
  }

  function handleEvent(event) {
    const target = event.target;
    // skip our own overlay elements
    if (target.id && (target.id.startsWith('reavion-') || target.closest('#reavion-marks-container') || target.closest('#reavion-grid-overlay'))) return;

    const selector = generateSelector(target);
    const timestamp = Date.now();

    // Capture 'type' for input/change
    const isType = event.type === 'input' || event.type === 'change' || target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.getAttribute('contenteditable') === 'true';
    const actionType = isType ? 'type' : 'click';

    let value = target.value || '';
    if (target.getAttribute('contenteditable') === 'true' || target.tagName === 'DIV' || (typeof value === 'string' && value.startsWith('{"'))) {
        const textContent = target.innerText || target.textContent || '';
        if (textContent.trim()) {
            value = textContent.trim();
        }
    }

    const data = {
        type: actionType,
        subtype: event.type, // 'input', 'change', 'click'
        selector: selector,
        url: window.location.href,
        tagName: target.tagName,
        text: target.textContent ? target.textContent.slice(0, 100).trim() : '',
        value: value,
        timestamp: timestamp
    };
    
    // Log for main process
    console.log('REAVION_RECORDING:' + JSON.stringify(data));
  }

  document.addEventListener('click', handleEvent, true);
  document.addEventListener('input', handleEvent, true);
  document.addEventListener('change', handleEvent, true);
  
  // Navigation tracking
  window.addEventListener('popstate', () => {
    console.log('REAVION_RECORDING:' + JSON.stringify({ type: 'navigation', url: window.location.href, timestamp: Date.now() }));
  });
  
  console.log('Reavion Recorder Active');
})();
`;

export async function startRecording(tabId: string, initiator?: Electron.WebContents) {
  recordingTabs.add(tabId);
  if (initiator) {
    recordingInitiators.set(tabId, initiator);
  }
  const contents = getWebviewContents(tabId);
  if (contents) {
    try {
      await contents.executeJavaScript(RECORDING_SCRIPT);
    } catch (e) {
      console.error('Failed to inject recorder script:', e);
    }
  }
}

export function stopRecording(tabId: string) {
  recordingTabs.delete(tabId);
  recordingInitiators.delete(tabId);
  const contents = getWebviewContents(tabId);
  if (contents) {
    // We can't easily remove event listeners without storing refs in the page context.
    // For now, checking the Set in the main process is enough to stop forwarding events, 
    // even if the script continues running (it's lightweight).
    // Or we could inject a cleanup script if we stored the listener functions globally.
    contents.executeJavaScript('window.__REAVION_RECORDER_ACTIVE__ = false;').catch(() => { });
  }
}

const consoleLogs = new Map<string, string[]>();

export function registerWebviewContents(tabId: string, contents: Electron.WebContents) {
  webviewContents.set(tabId, contents);

  // MIMIC CHROME: Set a modern Chrome User-Agent
  // This ensures social networks see us as a regular browser, not Electron
  const chromeUA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36';
  contents.setUserAgent(chromeUA);

  // MIMIC CHROME: Mask Electron/Automation signals and Spoof Fingerprinting
  // We use a high-quality masking script to bypass advanced detection
  const maskSignalsScript = `
    (function() {
      // 1. Hide navigator.webdriver
      if (Object.getOwnPropertyDescriptor(navigator, 'webdriver')) {
        Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
      }
      
      // 2. Mock chrome object (essential for "Is Chrome" checks)
      window.chrome = {
        runtime: {},
        loadTimes: function() {},
        csi: function() {},
        app: {}
      };

      // 3. Ensure navigator properties match a real Chrome
      const chromeUA = '${chromeUA}';
      Object.defineProperty(navigator, 'userAgent', { get: () => chromeUA, configurable: true });
      Object.defineProperty(navigator, 'appVersion', { get: () => chromeUA.replace('Mozilla/', ''), configurable: true });
      Object.defineProperty(navigator, 'platform', { get: () => 'MacIntel', configurable: true });
      Object.defineProperty(navigator, 'vendor', { get: () => 'Google Inc.', configurable: true });
      Object.defineProperty(navigator, 'languages', { get: () => ['en-US', 'en'], configurable: true });
      
      // 4. Mock Plugins & Hardware (standard Chrome profiles)
      if (!navigator.plugins.length) {
        const mockPlugins = [
          { name: 'PDF Viewer', filename: 'internal-pdf-viewer', description: 'Portable Document Format' },
          { name: 'Chrome PDF Viewer', filename: 'mhjfbmdpjiiglhbhkeicmopidxocgoeb', description: '' },
          { name: 'Chromium PDF Viewer', filename: 'internal-pdf-viewer', description: '' }
        ];
        Object.defineProperty(navigator, 'plugins', { get: () => mockPlugins, configurable: true });
      }
      
      // Hardware Concurrency & Memory (standard high-end Mac)
      Object.defineProperty(navigator, 'hardwareConcurrency', { get: () => 8, configurable: true });
      if (navigator.deviceMemory === undefined) {
        Object.defineProperty(navigator, 'deviceMemory', { get: () => 8, configurable: true });
      }

      // 5. Spoof Screen & Dimensions (Avoid "Headless" signatures)
      Object.defineProperty(Screen.prototype, 'colorDepth', { get: () => 24, configurable: true });
      Object.defineProperty(Screen.prototype, 'pixelDepth', { get: () => 24, configurable: true });

      // 6. Hide common automation properties and Electron leaks
      try {
        delete window.process;
        delete window.electron;
        delete window.__REAVION_RECORDER_ACTIVE__;
      } catch(e) {}
      
      // Ensure specific global checks for Electron fail
      window.process = undefined;
      window.ipcRenderer = undefined;
    })();
  `;

  // MIMIC CHROME: Inject mask signals as early as possible on every load
  contents.on('dom-ready', () => {
    contents.executeJavaScript(maskSignalsScript).catch(() => { });
  });

  // Inject black and white border cursor styles and recorder script if needed
  contents.on('did-finish-load', () => {
    contents.insertCSS(`
      * {
        cursor: url("data:image/svg+xml,%3Csvg width='24' height='24' viewBox='0 0 24 24' fill='none' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M4.5 2L10.5 18.5L13.125 11.375L20.25 8.75L4.5 2Z' fill='black' stroke='white' stroke-width='1.5'/%3E%3C/svg%3E") 0 0, auto !important;
      }
      a, button, [role="button"], input[type="button"], input[type="submit"] {
        cursor: url("data:image/svg+xml,%3Csvg width='24' height='24' viewBox='0 0 24 24' fill='none' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M4.5 2L10.5 18.5L13.125 11.375L20.25 8.75L4.5 2Z' fill='black' stroke='white' stroke-width='1.5'/%3E%3C/svg%3E") 0 0, pointer !important;
      }
    `);

    if (recordingTabs.has(tabId)) {
      // Send navigation event to initiator
      const initiator = recordingInitiators.get(tabId);
      if (initiator && !initiator.isDestroyed()) {
        initiator.send('recorder:action', {
          type: 'navigation',
          url: contents.getURL(),
          timestamp: Date.now()
        });
      }
      contents.executeJavaScript(RECORDING_SCRIPT).catch(err => {
        console.error(`[Recorder] Failed to re-inject on ${tabId}:`, err);
      });
    }
  });

  // LinkedIn Redirect Protector: Blocks tracking syncs from hijacking the main frame
  contents.on('will-navigate', (event: any, url: string) => {
    if (url.includes('ns1p.net')) {
      event.preventDefault();
      sendDebugLog('info', 'Blocked will-navigate tracking redirect: ' + url);
    }
  });

  // Aggressive Network-level Block: Prevents any resources or redirects to tracking domains
  // This is the most robust way to block trick redirects that skip will-navigate
  contents.session.webRequest.onBeforeRequest(
    { urls: ['*://*.ns1p.net/*', '*://*.scorecardresearch.com/*'] },
    (details, callback) => {
      sendDebugLog('info', 'Network-level block for tracking domain: ' + details.url);
      callback({ cancel: true });
    }
  );

  // Initialize logs
  if (!consoleLogs.has(tabId)) {
    consoleLogs.set(tabId, []);
  }

  // Capture console logs
  contents.on('console-message', (event, level, message, line, sourceId) => {
    // Check for recording events
    if (message.startsWith('REAVION_RECORDING:')) {
      if (recordingTabs.has(tabId)) {
        try {
          const jsonStr = message.replace('REAVION_RECORDING:', '');
          const eventData = JSON.parse(jsonStr);
          // Send to the initiator of the recording
          const initiator = recordingInitiators.get(tabId);
          if (initiator && !initiator.isDestroyed()) {
            initiator.send('recorder:action', eventData);
          } else {
            // Fallback to all windows if initiator is lost
            const windows = BrowserWindow.getAllWindows();
            if (windows.length > 0) {
              windows[0].webContents.send('recorder:action', eventData);
            }
          }
        } catch (e) {
          console.error('Failed to parse recording event:', e);
        }
      }
      return; // Don't log internal recording messages to the generic console log
    }

    const logs = consoleLogs.get(tabId) || [];
    const logEntry = `[${level === 0 ? 'LOG' : level === 1 ? 'WARN' : level === 2 ? 'ERROR' : 'INFO'}] ${message}`; // Simplified for token efficiency
    logs.push(logEntry);
    if (logs.length > 50) logs.shift(); // Keep last 50 to save tokens
    consoleLogs.set(tabId, logs);
  });

  // Allow all navigation like a regular browser - no blocking
  // Just log for debugging purposes
  contents.on('will-navigate', (_event, url) => {
    console.log('Navigation to:', url);
    if (recordingTabs.has(tabId)) {
      const windows = BrowserWindow.getAllWindows();
      if (windows.length > 0) {
        windows[0].webContents.send('recorder:action', { type: 'navigation', url, timestamp: Date.now() });
      }
    }
  });
}

export function clearConsoleLogs(tabId: string) {
  consoleLogs.set(tabId, []);
}

export function unregisterWebviewContents(tabId: string) {
  webviewContents.delete(tabId);
}

export function getWebviewContents(tabId: string): Electron.WebContents | undefined {
  return webviewContents.get(tabId);
}

const TAB_ID = 'main-tab';

const SCRIPT_HELPERS = `
  const wait = (ms) => {
    const multiplier = window.__REAVION_SPEED_MULTIPLIER__ || 1.0;
    const isFast = multiplier < 1.0;
    // HUMAN BEHAVIOR: Add +/- 25% randomness + small base jitter, but scale down for FAST mode
    const randomFactor = isFast ? (0.9 + Math.random() * 0.2) : (0.75 + (Math.random() * 0.5)); 
    const jitter = Math.random() * (isFast ? 30 : 100);
    const adjustedMs = Math.round((ms * multiplier * randomFactor) + jitter);
    return new Promise(resolve => setTimeout(resolve, adjustedMs));
  };

  /** Finds element traversing shadow roots recursively, handling multi-part selectors */
  const querySelectorPierce = (selector, root = document) => {
    const parts = selector.split(/[ >]+/).filter(Boolean);
    let currentRoots = [root];
    
    for (const part of parts) {
      let foundElement = null;
      let nextRoots = [];
      
      for (const r of currentRoots) {
        // 1. Try direct match in this root
        const match = r.querySelector(part);
        if (match) {
          foundElement = match;
          // Collect all shadow roots for next step if this part matched multiple things? 
          // For simplicity, we take the first match that works for the whole path.
          break; 
        }
        
        // 2. Look into all shadow roots at this level
        const all = r.querySelectorAll('*');
        for (const el of all) {
          if (el.shadowRoot) {
            const subMatch = el.shadowRoot.querySelector(part);
            if (subMatch) {
              foundElement = subMatch;
              break;
            }
            nextRoots.push(el.shadowRoot);
          }
        }
        if (foundElement) break;
      }
      
      if (!foundElement) {
        // If we didn't find the part yet, maybe it's deeper. 
        // We'll continue with the collected shadow roots.
        if (nextRoots.length > 0) {
          currentRoots = nextRoots;
          // We need a way to "retry" the same part on the next level...
          // This is getting complex. Let's use a simpler "deep-match" for the whole selector.
        } else {
          return null;
        }
      } else {
        // Found the part, now the next part must be found within this element or its shadow root
        currentRoots = [foundElement.shadowRoot || foundElement];
      }
    }
    
    // Final check - did we find something? 
    // The loop above is a bit flawed for complex paths. 
    // Let's use a battle-tested approach: search every shadow root for the FULL selector.
    const match = root.querySelector(selector);
    if (match) return match;
    
    const queue = [root];
    const visited = new Set();
    while (queue.length > 0) {
      const curr = queue.shift();
      if (!curr || visited.has(curr)) continue;
      visited.add(curr);
      
      const m = curr.querySelector(selector);
      if (m) return m;
      
      const children = curr.querySelectorAll('*');
      for (const el of children) {
        if (el.shadowRoot) queue.push(el.shadowRoot);
      }
    }
    return null;
  };

  /** Finds element by exact or partial text content */
  const findElementByText = (text, root = document) => {
    const clean = text.replace(/['"]/g, '').trim().toLowerCase();
    if (!clean) return null;
    
    const queue = [root];
    const visited = new Set();
    
    while (queue.length > 0) {
      const current = queue.shift();
      if (!current || visited.has(current)) continue;
      visited.add(current);
      
      // Use TreeWalker for efficient text node search
      const walker = document.createTreeWalker(current, NodeFilter.SHOW_TEXT, null, false);
      let node;
      while (node = walker.nextNode()) {
        if (node.textContent.toLowerCase().includes(clean)) {
          const parent = node.parentElement;
          if (parent && parent.offsetWidth > 0 && parent.offsetHeight > 0) {
            return parent;
          }
        }
      }
      
      // Check shadow roots
      const children = current.querySelectorAll('*');
      for (const el of children) {
        if (el.shadowRoot) {
          queue.push(el.shadowRoot);
        }
      }
    }
    return null;
  };

  /** Finds element by ARIA label, title, or placeholder */
  const querySelectorAria = (ariaLabel) => {
    const clean = ariaLabel.replace(/['"]/g, '').trim();
    // 1. Try attribute selectors
    const attrSelectors = [
      '[aria-label*="' + clean + '" i]',
      '[title*="' + clean + '" i]',
      '[placeholder*="' + clean + '" i]',
      '[alt*="' + clean + '" i]'
    ];
    for (const sel of attrSelectors) {
      const el = querySelectorPierce(sel);
      if (el) return el;
    }
    // 2. Fallback to text search if no attribute matches
    return findElementByText(clean);
  };

  /** Finds element by XPath */
  const querySelectorXPath = (xpath) => {
    try {
      // Handle both xpath/ and xpath// prefixes
      const clean = xpath.replace(/^xpath\/{1,2}/, '');
      const result = document.evaluate(clean, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null);
      return result.singleNodeValue;
    } catch (e) {
      return null;
    }
  };

  /** Master selector function for Chrome Recorder compatibility */
  const findAnyElement = (selector) => {
    if (!selector) return null;
    
    // Pierce prefix
    if (selector.startsWith('pierce/')) {
      return querySelectorPierce(selector.replace('pierce/', ''));
    }
    
    // ARIA prefix
    if (selector.startsWith('aria/')) {
      return querySelectorAria(selector.replace('aria/', ''));
    }
    
    // XPath prefix
    if (selector.startsWith('xpath/')) {
      return querySelectorXPath(selector);
    }
    
    // Text prefix
    if (selector.startsWith('text/')) {
      return findElementByText(selector.replace('text/', ''));
    }
    
    // Default: try regular Pierce search (covers CSS)
    return querySelectorPierce(selector);
  };
`;

function getContents(): Electron.WebContents {
  const contents = webviewContents.get(TAB_ID);
  if (!contents) {
    throw new Error('Browser not ready. Please wait for the page to load.');
  }
  return contents;
}

export async function resetBrowser(): Promise<void> {
  try {
    const contents = getContents();
    await contents.loadURL('about:blank');
    console.log('[Browser Tools] Resetting browser context to about:blank');
  } catch (e) {
    console.error('[Browser Tools] Failed to reset browser:', e);
  }
}

async function ensureSpeedMultiplier(getSpeed: () => 'slow' | 'normal' | 'fast'): Promise<void> {
  const speed = getSpeed();
  const multiplier = speed === 'slow' ? 1.5 : speed === 'fast' ? 0.2 : 1.0;
  try {
    const contents = getContents();
    await contents.executeJavaScript(`window.__REAVION_SPEED_MULTIPLIER__ = ${multiplier};`);
  } catch (e) {
    // Ignore if browser not ready
  }
}

export function createBrowserTools(options?: { getSpeed?: () => 'slow' | 'normal' | 'fast', workspaceId?: string, scrollWait?: number }): DynamicStructuredTool[] {
  const getSpeed = options?.getSpeed || (() => 'normal');

  const navigateTool = new DynamicStructuredTool({
    name: 'browser_navigate',
    description: 'Navigate the browser to a specific URL. Use this to open websites. WARNING: Before navigating after completing an action (reply, post, like, etc.), you MUST take a browser snapshot first to verify the action completed successfully.',
    schema: z.object({
      url: z.string().describe('The URL to navigate to. Must include protocol (http:// or https://)'),
    }),
    func: async ({ url }) => {
      try {
        const contents = getContents();
        await ensureSpeedMultiplier(getSpeed);
        let targetUrl = url;
        if (!targetUrl.startsWith('http://') && !targetUrl.startsWith('https://')) {
          targetUrl = `https://${targetUrl}`;
        }

        try {
          await contents.loadURL(targetUrl);
        } catch (navError: any) {
          // ERR_ABORTED (-3) can happen on redirects - check if page actually loaded
          if (navError.code === 'ERR_ABORTED' || navError.errno === -3) {
            await new Promise(resolve => setTimeout(resolve, 500));
            const currentUrl = contents.getURL();
            if (currentUrl && currentUrl !== 'about:blank') {
              return JSON.stringify({ success: true, url: currentUrl, message: `Navigated to ${currentUrl}` });
            }
          }
          throw navError;
        }

        const finalUrl = contents.getURL();
        return JSON.stringify({ success: true, url: finalUrl, message: `Navigated to ${finalUrl}` });
      } catch (error) {
        return JSON.stringify({ success: false, error: String(error) });
      }
    },
  });

  const clickTool = new DynamicStructuredTool({
    name: 'browser_click',
    description: 'Click on an element in the browser using a CSS selector.',
    schema: z.object({
      selector: z.string().describe('CSS selector for the element to click (e.g., "button.submit", "#login-btn", "[data-testid=\\"like\\"]"). Can also be a numeric ID from browser_mark_page.'),
      index: z.number().describe('0-based index of element to click when multiple elements match the selector. Use 0 for first.'),
    }),
    func: async ({ selector, index }) => {
      try {
        const contents = getContents();
        await ensureSpeedMultiplier(getSpeed);

        const result = await contents.executeJavaScript(`
          (async function() {
            ${SCRIPT_HELPERS}
            const selectorStr = ${JSON.stringify(selector)};
            const targetIndex = ${index || 0};
            
            let element = null;
            // Handle numeric IDs from browser_mark_page
            if (/^\\d+$/.test(selectorStr)) {
               element = document.querySelector('[data-reavion-id="' + selectorStr + '"]');
            } else {
               // Full piercing search
               const matches = [];
               // Look globally
               const allMatches = document.querySelectorAll(selectorStr);
               matches.push(...Array.from(allMatches));
               
               // If no light DOM matches, or to be thorough, we can use our pierce helper
               if (matches.length === 0) {
                  const pierced = findAnyElement(selectorStr);
                  if (pierced) matches.push(pierced);
               }

               if (matches.length > targetIndex) {
                 element = matches[targetIndex];
               } else if (matches.length > 0) {
                 element = matches[0];
               }
            }
            
            if (!element) return { success: false, error: 'Element not found: ' + selectorStr };
            
            // Human-like scroll
            element.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' });
            await wait(${options?.scrollWait || 500});
            
            const rect = element.getBoundingClientRect();
            const x = rect.left + rect.width / 2;
            const y = rect.top + rect.height / 2;
            
            // Visual feedback
            const ripple = document.createElement('div');
            ripple.style.cssText = 'position:fixed;z-index:999999;pointer-events:none;width:50px;height:50px;border-radius:50%;background:rgba(139,92,246,0.3);border:2px solid rgba(139,92,246,0.5);transform:translate(-50%,-50%);transition:all 0.5s ease-out;';
            ripple.style.left = x + 'px';
            ripple.style.top = y + 'px';
            document.body.appendChild(ripple);
            setTimeout(() => {
              ripple.style.transform = 'translate(-50%,-50%) scale(2)';
              ripple.style.opacity = '0';
              setTimeout(() => ripple.remove(), 500);
            }, 50);

            const common = { bubbles: true, cancelable: true, composed: true, view: window, clientX: x, clientY: y };
            
            // Sequence: PointerDown -> MouseDown -> Focus -> PointerUp -> MouseUp -> Click
            element.dispatchEvent(new PointerEvent('pointerdown', { ...common, pointerType: 'mouse', button: 0, buttons: 1, isPrimary: true }));
            element.dispatchEvent(new MouseEvent('mousedown', { ...common, button: 0, buttons: 1 }));
            
            if (element.focus) element.focus({ preventScroll: true });

            await wait(40);

            element.dispatchEvent(new PointerEvent('pointerup', { ...common, pointerType: 'mouse', button: 0, buttons: 0, isPrimary: true }));
            element.dispatchEvent(new MouseEvent('mouseup', { ...common, button: 0, buttons: 0 }));
            
            const clickEv = new MouseEvent('click', { ...common, button: 0, buttons: 0, detail: 1 });
            element.dispatchEvent(clickEv);
            
            // Always attempt fallback click() if available, regardless of defaultPrevented
            if (typeof element.click === 'function') {
                try { element.click(); } catch(e) {}
            }
            
            return { success: true, message: 'Clicked ' + selectorStr };
          })()
        `);

        return JSON.stringify(result);
      } catch (error) {
        return JSON.stringify({ success: false, error: String(error) });
      }
    },
  });

  const typeTool = new DynamicStructuredTool({
    name: 'browser_type',
    description: 'Type text into an input field.',
    schema: z.object({
      selector: z.string().describe('CSS selector for the input element'),
      text: z.string().describe('The text to type into the input'),
    }),
    func: async ({ selector, text }) => {
      try {
        const contents = getContents();
        await ensureSpeedMultiplier(getSpeed);
        const result = await contents.executeJavaScript(`
          (async function() {
            ${SCRIPT_HELPERS}
            const selectorStr = ${JSON.stringify(selector)};
            const typeText = ${JSON.stringify(text)};
            
            let element = findAnyElement(selectorStr);
            if (!element) return { success: false, error: 'Element not found: ' + selectorStr };
            
            element.scrollIntoView({ behavior: 'smooth', block: 'center' });
            await wait(200);
            
            // Activate editor
            const commonMouse = { bubbles: true, cancelable: true, view: window };
            element.dispatchEvent(new MouseEvent('mousedown', commonMouse));
            await wait(50);
            element.dispatchEvent(new MouseEvent('mouseup', commonMouse));
            element.click();
            element.focus({ preventScroll: true });
            await wait(200);
            
            const isEditable = element.isContentEditable || element.getAttribute('role') === 'textbox' || element.tagName === 'INPUT' || element.tagName === 'TEXTAREA';
            
            if (isEditable) {
                // Clear existing
                try {
                    document.execCommand('selectAll', false, null);
                    document.execCommand('delete', false, null);
                } catch(e) {}
                await wait(200);

                // Type character by character to trigger listeners
                for (let i = 0; i < typeText.length; i++) {
                    const char = typeText[i];
                    const common = { bubbles: true, cancelable: true, composed: true, view: window };
                    const keyInit = { ...common, key: char, charCode: char.charCodeAt(0), keyCode: char.charCodeAt(0) };
                    
                    element.dispatchEvent(new KeyboardEvent('keydown', keyInit));
                    
                    const beforeInput = new InputEvent('beforeinput', { ...common, inputType: 'insertText', data: char });
                    element.dispatchEvent(beforeInput);
                    
                    if (!beforeInput.defaultPrevented) {
                        try {
                            document.execCommand('insertText', false, char);
                        } catch(e) {
                             const selection = window.getSelection();
                             if (selection && selection.rangeCount) {
                                  const range = selection.getRangeAt(0);
                                  range.deleteContents();
                                  range.insertNode(document.createTextNode(char));
                                  range.collapse(false);
                             }
                        }
                    }
                    
                    element.dispatchEvent(new InputEvent('input', { ...common, inputType: 'insertText', data: char }));
                    element.dispatchEvent(new KeyboardEvent('keyup', keyInit));
                    
                    if (Math.random() > 0.8) await wait(10 + Math.random() * 20);
                }
                
                // Final commitment nudge for rich editors like Lexical/React
                try {
                    document.execCommand('insertText', false, ' ');
                    element.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: ' ' }));
                    await wait(20);
                    document.execCommand('delete', false, null);
                    element.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'deleteContentBackward' }));
                } catch(e) {}
            } else {
                element.value = typeText;
            }
            
            element.dispatchEvent(new Event('input', { bubbles: true }));
            element.dispatchEvent(new Event('change', { bubbles: true }));
            element.dispatchEvent(new Event('blur', { bubbles: true }));
            
            return { success: true, message: 'Typed into ' + selectorStr };
          })()
        `);
        return JSON.stringify(result);
      } catch (error) {
        return JSON.stringify({ success: false, error: String(error) });
      }
    },
  });

  const scrollTool = new DynamicStructuredTool({
    name: 'browser_scroll',
    description: 'Scroll the page up or down. Automatically detects scrollable areas if the main window is not scrollable (common in SPAs like X.com or Reddit).',
    schema: z.object({
      direction: z.enum(['up', 'down']).describe('Direction to scroll'),
      amount: z.number().describe('Amount to scroll in pixels (e.g., 500)'),
      behavior: z.enum(['auto', 'smooth']).optional().describe('Scroll behavior. Smooth is recommended for user feedback.'),
    }),
    func: async ({ direction, amount, behavior = 'smooth' }) => {
      try {
        const contents = getContents();
        const scrollAmount = direction === 'down' ? amount : -amount;

        const result = await contents.executeJavaScript(`
          (async function() {
            const amount = ${scrollAmount};
            const behavior = '${behavior}';
            
            // Try window and document root (Nuclear Option: one of these usually works)
            window.scrollBy({ top: amount, behavior });
            if (document.documentElement) document.documentElement.scrollBy({ top: amount, behavior });
            if (document.body) document.body.scrollBy({ top: amount, behavior });

            // Find scrollable containers (Common in complex SPAs like X.com)
            const elements = Array.from(document.querySelectorAll('div, section, main, [role="main"], article'));
            const containers = elements.filter(el => {
                const style = window.getComputedStyle(el);
                const overflow = style.overflowY || style.overflow || '';
                // Check if it's explicitly scrollable or has obvious scroll space
                const isScrollable = (overflow === 'auto' || overflow === 'scroll');
                const hasSpace = el.scrollHeight > el.clientHeight + 20;
                const isVisible = el.offsetWidth > 0 && el.offsetHeight > 0;
                return isVisible && hasSpace && (isScrollable || el.tagName === 'MAIN');
            });

            // Scroll the largest detected container as well
            if (containers.length > 0) {
                containers.sort((a, b) => (b.offsetWidth * b.offsetHeight) - (a.offsetWidth * a.offsetHeight));
                const best = containers[0];
                best.scrollBy({ top: amount, behavior });
                
                // If it's still not moving and behavior is auto, try manual offset
                if (behavior === 'auto') {
                  const prev = best.scrollTop;
                  setTimeout(() => {
                    if (best.scrollTop === prev) best.scrollTop += amount;
                  }, 50);
                }
            }
            
            return { success: true, message: 'Scroll command sent to all targets' };
          })()
        `);

        // Wait significantly for the animation to be visible
        const waitTime = behavior === 'smooth' ? 1200 : 400;
        await new Promise(resolve => setTimeout(resolve, waitTime));

        return JSON.stringify(result);
      } catch (error) {
        return JSON.stringify({ success: false, error: String(error) });
      }
    },
  });




  const snapshotTool = new DynamicStructuredTool({
    name: 'browser_dom_snapshot',
    description: 'Capture a concise snapshot of interactive elements currently visible in the viewport. Highly optimized for speed and token efficiency.',
    schema: z.object({
      only_visible: z.boolean().nullable().describe('Whether to only include elements currently in the viewport. Default true.').default(true)
    }),
    func: async ({ only_visible }) => {
      const isVisibleCheck = only_visible !== false; // Default true if null or undefined -> but zod default? 
      // Handle the logic inside:
      // If we pass 'true' to executeJS, it's baked in.

      try {
        const contents = getContents();
        const result = await contents.executeJavaScript(`
          (function() {
            const elements = [];
            const vWidth = window.innerWidth;
            const vHeight = window.innerHeight;
            
            function isVisible(el) {
                if (!el) return false;
                const rect = el.getBoundingClientRect();
                if (rect.width === 0 || rect.height === 0) return false;
                
                if (${only_visible !== false}) {
                    if (rect.bottom < 0 || rect.top > vHeight || rect.right < 0 || rect.left > vWidth) return false;
                }

                // Check visibility using a faster approach
                if (el.checkVisibility) {
                   if (!el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })) return false;
                } else {
                   const style = window.getComputedStyle(el);
                   if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') return false;
                }
                
                if (el.getAttribute('aria-hidden') === 'true') return false;
                return true;
            }

            const candidates = document.querySelectorAll('button, a, input, textarea, select, [role="button"], [role="link"], [role="checkbox"], [role="menuitem"], [data-testid], [tabindex]:not([tabindex="-1"])');
            
            candidates.forEach((node, i) => {
                if (isVisible(node)) {
                    const tag = node.tagName.toLowerCase();
                    const testId = node.getAttribute('data-testid');
                    const ariaLabel = node.getAttribute('aria-label');
                    const title = node.getAttribute('title');
                    const placeholder = node.getAttribute('placeholder');
                    const innerText = node.innerText?.trim();
                    const value = node.value?.trim();
                    const href = node.href;
                    const type = node.type;

                    // Prioritized Labeling (Heuristic inspired by Chrome MCP & accessibility best practices)
                    let name = ariaLabel || testId || title || placeholder || innerText || '';
                    
                    if (!name && (tag === 'input' || tag === 'textarea' || tag === 'select') && node.id) {
                        const labelEl = document.querySelector('label[for="' + node.id + '"]');
                        if (labelEl) name = labelEl.innerText;
                    }

                    if (!name && (tag === 'button' || tag === 'a')) {
                        const icon = node.querySelector('svg');
                        if (icon) {
                            name = icon.getAttribute('aria-label') || icon.querySelector('title')?.innerText || '';
                        }
                    }

                    name = name.replace(/\\s+/g, ' ').trim().slice(0, 60); // Truncate to 60 chars
                    
                    // Extra description if the text content adds more context than the label
                    let description = null;
                    if (innerText && name !== innerText) {
                        description = innerText.replace(/\\s+/g, ' ').trim().slice(0, 80); // Truncate to 80 chars
                    }
                    
                    if (name || tag === 'input' || testId || href) {
                        const rect = node.getBoundingClientRect();
                        const state = [];
                        if (node.getAttribute('aria-expanded') === 'true') state.push('expanded');
                        if (node.getAttribute('aria-selected') === 'true' || node.classList.contains('active')) state.push('selected');
                        if (node.disabled) state.push('disabled');
                        if (node.required) state.push('required');
                        if (node.checked) state.push('checked');

                        const elData = {
                            id: i,
                            role: node.getAttribute('role') || tag,
                            name: name,
                            // Remove description if identical to name to save tokens
                            description: (description && description !== name) ? description : undefined,
                            selector: testId ? '[data-testid="' + testId + '"]' : undefined,
                            type: type || undefined,
                            value: (tag === 'input' || tag === 'textarea') ? value : undefined,
                            href: (tag === 'a') ? href : undefined,
                            pos: { 
                                x: Math.round(rect.left + rect.width / 2), 
                                y: Math.round(rect.top + rect.height / 2) 
                            },
                            state: state.length > 0 ? state.join(', ') : undefined
                        };
                        // Clean undefineds
                        Object.keys(elData).forEach(key => elData[key] === undefined && delete elData[key]);
                        elements.push(elData);
                    }
                }
            });
            return { 
                url: window.location.href, 
                title: document.title, 
                viewport: { width: vWidth, height: vHeight },
                elements: elements.slice(0, 75) // Reduced from 150 to 75 for token efficiency 
            };
          })()
        `);
        return JSON.stringify({ success: true, snapshot: result });
      } catch (error) {
        return JSON.stringify({ success: false, error: String(error) });
      }
    },
  });

  const screenshotTool = new DynamicStructuredTool({
    name: 'browser_screenshot',
    description: 'Capture a visual screenshot of the current page. Returns a base64 string AND a file path. Use this to "see" the page.',
    schema: z.object({}),
    func: async () => {
      try {
        const contents = getContents();
        // Capture full page is tricky in Electron without resizing, captureVisiblePage is standard
        const image = await contents.capturePage();
        const base64 = image.toDataURL();

        // We could save it to a temp file if needed, but base64 is often enough for VLMs
        // For the agent to "see", returning base64 is direct.

        return JSON.stringify({
          success: true,
          message: 'Screenshot captured',
          data_url_prefix: 'data:image/png;base64,...', // Don't return full string in JSON to avoid huge logs if not needed immediately
          // The actual base64 might be too large for some context windows if we dump it all. 
          // But for a VLM tool, we might want to return it. 
          // Let's assume the agent environment can handle it or we save it to disk.
          // For now, let's return a truncated msg and maybe save to disk?
          // Actually, let's return the full thing but warn about size.
          image_data: base64
        });
      } catch (error) {
        return JSON.stringify({ success: false, error: String(error) });
      }
    }
  });

  const waitTool = new DynamicStructuredTool({
    name: 'browser_wait',
    description: 'Wait for a specified amount of time.',
    schema: z.object({
      milliseconds: z.number().describe('Time to wait in milliseconds'),
    }),
    func: async ({ milliseconds }) => {
      const speed = getSpeed();
      const speedMultiplier = speed === 'slow' ? 1.5 : speed === 'fast' ? 0.5 : 1.0;
      const adjustedDelay = Math.round(milliseconds * speedMultiplier);
      const startTime = Date.now();
      const endTime = startTime + adjustedDelay;
      const contents = getContents();

      while (Date.now() < endTime) {
        // Check for stop signal injected into the webview or global state
        const isStopped = await contents.executeJavaScript('window.__REAVION_STOP__').catch(() => false);
        if (isStopped) {
          console.log('[browser_wait] Stop signal detected via window flag. Aborting.');
          return JSON.stringify({ success: false, error: 'Stopped by user' });
        }

        const remaining = Math.ceil((endTime - Date.now()) / 1000);
        sendDebugLog('info', `Waiting... ${remaining}s remaining`);

        const waitChunk = Math.min(1000, endTime - Date.now());
        if (waitChunk <= 0) break;
        await new Promise(resolve => setTimeout(resolve, waitChunk));
      }

      return JSON.stringify({ success: true, message: `Waited ${adjustedDelay}ms (speed: ${speed})` });
    },
  });

  const clickAtCoordinatesTool = new DynamicStructuredTool({
    name: 'browser_click_coordinates',
    description: 'Click at specific x,y coordinates.',
    schema: z.object({
      x: z.number().describe('X coordinate'),
      y: z.number().describe('Y coordinate'),
    }),
    func: async ({ x, y }) => {
      try {
        const contents = getContents();
        contents.sendInputEvent({ type: 'mouseMove', x, y });
        contents.sendInputEvent({ type: 'mouseDown', x, y, button: 'left', clickCount: 1 });
        contents.sendInputEvent({ type: 'mouseUp', x, y, button: 'left', clickCount: 1 });
        return JSON.stringify({ success: true, message: `Clicked at ${x},${y}` });
      } catch (error) {
        return JSON.stringify({ success: false, error: String(error) });
      }
    },
  });

  // Re-adding essential tools with strict schemas
  const getPageContentTool = new DynamicStructuredTool({
    name: 'browser_extract',
    description: 'Advanced page analysis that extracts semantic structure, headlines, and a story summary. Use this to understand the page content and layout.',
    schema: z.object({
      focus: z.string().nullable().describe('Optional focus area or element to deeply analyze.').default(null)
    }),
    func: async ({ focus }) => {
      const contents = getContents();
      try {
        const result = await contents.executeJavaScript(`
          (async function() {
            const vHeight = window.innerHeight;
            const vWidth = window.innerWidth;
            
            // 1. Extract high-level semantics
            function getSemantics() {
                const sections = Array.from(document.querySelectorAll('main, section, header, footer, article, aside, nav, [role="main"], [role="navigation"]'))
                    .filter(el => el.checkVisibility ? el.checkVisibility() : true)
                    .map(el => ({
                        tag: el.tagName.toLowerCase(),
                        role: el.getAttribute('role'),
                        id: el.id,
                        testId: el.getAttribute('data-testid'),
                        text: (el.innerText || '').slice(0, 100).replace(/\\s+/g, ' ').trim()
                    }))
                    .slice(0, 10);
                return sections;
            }

            // 2. Extract key visual headlines
            function getHeadlines() {
                return Array.from(document.querySelectorAll('h1, h2, h3, [role="heading"]'))
                    .filter(el => {
                        const rect = el.getBoundingClientRect();
                        return rect.top >= 0 && rect.top <= vHeight;
                    })
                    .map(h => h.innerText.replace(/\\s+/g, ' ').trim())
                    .filter(Boolean)
                    .slice(0, 15);
            }

            // 3. Extract text "story"
            const bodyText = document.body.innerText.split('\\n')
                .filter(line => line.trim().length > 30)
                .slice(0, 15)
                .join('\\n');

            return {
                title: document.title,
                url: window.location.href,
                viewport: { width: vWidth, height: vHeight },
                semantics: getSemantics(),
                headlines: getHeadlines(),
                storySummary: bodyText
            };
          })()
        `);
        return JSON.stringify({ success: true, ...result });
      } catch (e) {
        return JSON.stringify({ success: false, error: String(e) });
      }
    }
  });

  const moveToElementTool = new DynamicStructuredTool({
    name: 'browser_move_to_element',
    description: 'Scroll smoothly to an element and move the pointer indicator to its position. Use this to orient the view and show what the agent is focusing on before taking action.',
    schema: z.object({
      selector: z.string().describe('CSS selector for the element to focus on'),
      index: z.number().nullable().describe('0-based index if multiple elements match'),
    }),
    func: async ({ selector, index = 0 }) => {
      try {
        const contents = getContents();
        const result = await contents.executeJavaScript(`
          (async function() {
            const selStr = '${selector.replace(/'/g, "\\'")}';
            const targetIndex = ${index};
            const matches = Array.from(document.querySelectorAll(selStr)).filter(el => {
              const style = window.getComputedStyle(el);
              return el.offsetParent !== null && style.display !== 'none' && style.visibility !== 'hidden';
            });

            const element = matches[targetIndex] || matches[0];
            if (!element) return { success: false, error: 'Element not found: ' + selStr };

            // Smooth scroll to Center
            element.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' });
            
            // Wait for scroll to start/finish
            await new Promise(resolve => setTimeout(resolve, 400));

            const rect = element.getBoundingClientRect();
            const x = rect.left + rect.width / 2;
            const y = rect.top + rect.height / 2;

            // Ensure Pointer Styles
            if (!document.getElementById('reavion-pointer-styles')) {
              const style = document.createElement('style');
              style.id = 'reavion-pointer-styles';
              style.textContent = '@keyframes reavionFloat { 0%, 100% { transform: translateY(0px); } 50% { transform: translateY(-3px); } }';
              document.head.appendChild(style);
            }

            // Move or Create Pointer
            let pointer = document.getElementById('reavion-pointer');
            if (!pointer) {
              pointer = document.createElement('div');
              pointer.id = 'reavion-pointer';
              pointer.style.cssText = 'position:fixed;z-index:999999;pointer-events:none;filter:drop-shadow(0 4px 12px rgba(0,0,0,0.4));animation:reavionFloat 3s ease-in-out infinite;transition:all 0.5s cubic-bezier(0.2, 0.8, 0.2, 1);';
              document.body.appendChild(pointer);
            }
            // Always update visual style to clear any cached purple versions
            pointer.innerHTML = \`
              <svg width="32" height="32" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M6 4L14 26L17.5 16.5L27 13L6 4Z" fill="black" stroke="white" stroke-width="2"/>
              </svg>
            \`;

            pointer.style.left = x + 'px';
            pointer.style.top = y + 'px';
            pointer.style.transform = 'scale(1.1)';
            setTimeout(() => { pointer.style.transform = 'scale(1)'; }, 500);

            // Brief Highlight
            const originalOutline = element.style.outline;
            element.style.outline = '2px dashed rgba(255, 255, 255, 0.8)';
            element.style.outlineOffset = '2px';
            setTimeout(() => { element.style.outline = originalOutline; }, 1000);

            return { success: true, message: 'Focused on ' + (element.innerText || selector).slice(0, 30) };
          })()
        `);
        return JSON.stringify(result);
      } catch (error) {
        return JSON.stringify({ success: false, error: String(error) });
      }
    }
  });

  return [
    navigateTool,
    clickTool,
    typeTool,
    scrollTool,
    snapshotTool,
    screenshotTool,
    waitTool,
    clickAtCoordinatesTool,
    getPageContentTool,
    moveToElementTool,


    // --- MARK PAGE TOOL (MOVED & IMPROVED BELOW) ---

    // --- ADVANCED INTROSPECTION TOOLS ---
    new DynamicStructuredTool({
      name: 'browser_highlight_elements',
      description: 'Visually highlight elements on the page matching a selector. Use this to verify your selectors or "see" what you found.',
      schema: z.object({
        selector: z.string().describe('CSS selector to highlight'),
        duration: z.number().nullable().describe('Duration in ms (default 2000)')
      }),
      func: async ({ selector, duration }) => {
        const finalDuration = duration || 2000;
        const contents = getContents();
        try {
          const count = await contents.executeJavaScript(`
                    (function() {
                        const els = document.querySelectorAll('${selector.replace(/'/g, "\\'")}');
                        if (els.length > 0) {
                            // Only scroll the first element to avoid jitter from multiple smooth scrolls
                            els[0].scrollIntoView({ behavior: 'instant', block: 'center', inline: 'nearest' });
                        }

          els.forEach((el, index) => {
            const originalOutline = el.style.outline;
            const originalTransition = el.style.transition;
            const originalBoxShadow = el.style.boxShadow;

            el.style.transition = 'outline 0.1s ease-out';
            el.style.outline = '3px solid #f43f5e';
            el.style.boxShadow = '0 0 15px rgba(244, 63, 94, 0.6)';

            setTimeout(() => {
              // Check if element still exists and is in the DOM
              if (el && document.body.contains(el)) {
                el.style.outline = originalOutline;
                el.style.transition = originalTransition;
                el.style.boxShadow = originalBoxShadow;
              }
            }, ${finalDuration});
          });
          return els.length;
        })()
      `);
          return JSON.stringify({ success: true, message: `Highlighted ${count} elements matching "${selector}"` });
        } catch (e) {
          return JSON.stringify({ success: false, error: String(e) });
        }
      }
    }),

    new DynamicStructuredTool({
      name: 'browser_get_console_logs',
      description: 'Get the recent console logs from the browser page. Useful for debugging errors.',
      schema: z.object({}),
      func: async () => {
        const logs = consoleLogs.get(TAB_ID) || [];
        return JSON.stringify({
          success: true,
          logs: logs.length > 0 ? logs : ['No logs captured yet']
        });
      }
    }),

    new DynamicStructuredTool({
      name: 'browser_inspect_element',
      description: 'Get detailed inspection info for an element (computed styles, attributes, visibility). Use this to debug why an element is not clickable or visible.',
      schema: z.object({
        selector: z.string().describe('CSS selector for the element to inspect'),
      }),
      func: async ({ selector }) => {
        const contents = getContents();
        try {
          const result = await contents.executeJavaScript(`
            (function() {
              const el = document.querySelector('${selector.replace(/'/g, "\\'")}');
              if (!el) return { success: false, error: 'Element not found' };
              
              const rect = el.getBoundingClientRect();
              const style = window.getComputedStyle(el);
              
              // Check visibility
              const isVisible = style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0' && rect.width > 0 && rect.height > 0;
              
              // Key attributes
              const attributes = {};
              for (const attr of el.attributes) {
                attributes[attr.name] = attr.value;
              }
              
              // Computed styles of interest
              const computed = {
                display: style.display,
                visibility: style.visibility,
                opacity: style.opacity,
                position: style.position,
                zIndex: style.zIndex,
                pointerEvents: style.pointerEvents,
                cursor: style.cursor,
                width: rect.width + 'px',
                height: rect.height + 'px',
                top: rect.top + 'px',
                left: rect.left + 'px'
              };
              
              // Check for overlapping elements at center
              const centerX = rect.left + rect.width / 2;
              const centerY = rect.top + rect.height / 2;
              const topEl = document.elementFromPoint(centerX, centerY);
              const isObscured = topEl && topEl !== el && !el.contains(topEl) && !topEl.contains(el);
              
              return {
                success: true,
                tagName: el.tagName,
                isVisible,
                isObscured,
                obscuringElement: isObscured ? (topEl.tagName + (topEl.id ? '#' + topEl.id : '') + (topEl.className ? '.' + topEl.className : '')) : null,
                text: (el.innerText || '').slice(0, 200),
                htmlSnippet: el.outerHTML.slice(0, 500),
                attributes,
                computedStyles: computed
              };
            })()
          `);
          return JSON.stringify(result);
        } catch (e) {
          return JSON.stringify({ success: false, error: String(e) });
        }
      }
    }),

    new DynamicStructuredTool({
      name: 'browser_get_accessibility_tree',
      description: 'Get a simplified accessibility tree of the page. Use this to understand the semantic structure (roles, names, states) like a screen reader.',
      schema: z.object({}),
      func: async () => {
        const contents = getContents();
        try {
          const tree = await contents.executeJavaScript(`
  (function () {
    function traverse(node, depth = 0) {
      if (depth > 50) return null; // Safety depth limit
      if (!node) return null;

      // Skip hidden nodes generally, unless they have aria-hidden="false" explicitly
      const style = node.nodeType === 1 ? window.getComputedStyle(node) : null;
      if (style && (style.display === 'none' || style.visibility === 'hidden')) return null;

      const role = node.getAttribute ? node.getAttribute('role') : null;
      const ariaLabel = node.getAttribute ? node.getAttribute('aria-label') : null;
      let name = ariaLabel || node.innerText || '';

      // Clean up name
      if (name && typeof name === 'string') name = name.replace(/\\s+/g, ' ').trim().slice(0, 50);

      const relevantRoles = ['button', 'link', 'textbox', 'checkbox', 'radio', 'combobox', 'listbox', 'menuitem', 'tab', 'heading', 'banner', 'main', 'navigation', 'dialog', 'alert'];
      const isInteractive = relevantRoles.includes(role) || (node.tagName === 'BUTTON') || (node.tagName === 'A' && node.href) || (node.tagName === 'INPUT');

      const children = [];
      for (const child of node.childNodes) {
        if (child.nodeType === 1) { // Element
          const childNode = traverse(child, depth + 1);
          if (childNode) children.push(childNode);
        }
      }

      // Only return node if it is interactive, has a role, or has interesting children
      if (isInteractive || role || children.length > 0) {
        return {
          role: role || node.tagName.toLowerCase(),
          name: name,
          children: children.length > 0 ? children : undefined
        };
      }

      return null;
    }

    // Start from body
    return traverse(document.body);
  })()
  `);
          return JSON.stringify({ success: true, tree: tree });
        } catch (e) {
          return JSON.stringify({ success: false, error: String(e) });
        }
      }
    }),

    new DynamicStructuredTool({
      name: 'browser_mark_page',
      description: 'Overlay numeric labels on all interactive elements. This provides you with exact numeric IDs (e.g., "7") to use in the "selector" field of browser_click or browser_type. Use this for 100% precision on complex sites.',
      schema: z.object({}),
      func: async () => {
        const contents = getContents();
        try {
          await ensureSpeedMultiplier(getSpeed);
          const count = await contents.executeJavaScript(`
  (function () {
    const containerId = 'reavion-marks-container';
    const attrName = 'data-reavion-id';
    
    // Cleanup existing
    const existing = document.getElementById(containerId);
    if (existing) existing.remove();
    document.querySelectorAll('[' + attrName + ']').forEach(el => el.removeAttribute(attrName));

    const container = document.createElement('div');
    container.id = containerId;
    container.style.cssText = 'position:fixed;inset:0;z-index:999999;pointer-events:none;';

    const candidates = document.querySelectorAll('button, a, input, textarea, select, [role="button"], [role="link"], [data-testid], [tabindex]:not([tabindex="-1"])');
    let count = 0;

    candidates.forEach((el, i) => {
      const rect = el.getBoundingClientRect();
      // Check if in viewport
      if (rect.width > 0 && rect.height > 0 && rect.top >= 0 && rect.top <= window.innerHeight && rect.left >= 0 && rect.left <= window.innerWidth) {
        el.setAttribute(attrName, i.toString());
        const label = document.createElement('div');
        label.innerText = i.toString();
        // Reavion Blue: #2563eb (hsl(221, 83%, 53%))
        label.style.cssText = 'position:fixed;background:rgba(37,99,235,0.7);color:white;padding:1px 3px;font-size:9px;font-family:sans-serif;border-radius:2px;z-index:1000000;pointer-events:none;font-weight:bold;backdrop-filter:blur(2px);box-shadow:0 1px 2px rgba(0,0,0,0.2);';
        label.style.left = Math.max(0, rect.left) + 'px';
        label.style.top = Math.max(0, rect.top) + 'px';
        container.appendChild(label);
        count++;
      }
    });

    document.body.appendChild(container);

    // Auto-remove after 60 seconds
    setTimeout(() => {
      const el = document.getElementById(containerId);
      if (el) el.remove();
    }, 60000);
    return count;
  })()
  `);
          return JSON.stringify({ success: true, message: `Labeled ${count} interactive elements. You can now use numeric IDs (e.g. "42") as the selector in browser_click or browser_type tools.` });
        } catch (e) {
          return JSON.stringify({ success: false, error: String(e) });
        }
      }
    }),

    new DynamicStructuredTool({
      name: 'browser_draw_grid',
      description: 'Draw a numbered coordinate grid overlay on the page. Use this to find precise coordinates for browser_click_coordinates.',
      schema: z.object({
        opacity: z.number().nullable().describe('Grid opacity (0.1 to 1.0, default 0.3)').default(null)
      }),
      func: async ({ opacity }) => {
        const finalOpacity = opacity ?? 0.3;
        const contents = getContents();
        try {
          await ensureSpeedMultiplier(getSpeed);
          await contents.executeJavaScript(`
            (function () {
              const existing = document.getElementById('reavion-grid-overlay');
              if (existing) {
                existing.remove();
                return;
              }

              const grid = document.createElement('div');
              grid.id = 'reavion-grid-overlay';
              grid.style.cssText = 'position:fixed;inset:0;z-index:999999;pointer-events:none;background:transparent;';

              const width = window.innerWidth;
              const height = window.innerHeight;
              const step = 100;

              let html = '';
              // Draw vertical lines
              for (let x = 0; x <= width; x += step) {
                html += \`<div style="position:absolute;left:\${x}px;top:0;bottom:0;width:1px;background:rgba(37,99,235,\${finalOpacity});"><span style="position:absolute;top:5px;left:2px;font-size:10px;color:#2563eb;">\${x}</span></div>\`;
              }
              // Draw horizontal lines
              for (let y = 0; y <= height; y += step) {
                html += \`<div style="position:absolute;top:\${y}px;left:0;right:0;height:1px;background:rgba(37,99,235,\${finalOpacity});"><span style="position:absolute;left:5px;top:2px;font-size:10px;color:#2563eb;">\${y}</span></div>\`;
              }
              
              grid.innerHTML = html;
              document.body.appendChild(grid);
              
              // Auto-remove after 30 seconds
              setTimeout(() => {
                 const el = document.getElementById('reavion-grid-overlay');
                 if (el) el.remove();
              }, 30000);
            })()
          `);
          return JSON.stringify({ success: true, message: 'Grid overlay drawn. Use coordinates to click.' });
        } catch (e) {
          return JSON.stringify({ success: false, error: String(e) });
        }
      }
    }),



    new DynamicStructuredTool({
      name: 'browser_scrape_html',
      description: 'Scrape the current page HTML using Cheerio. Use this for rigorous data extraction, analyzing the full DOM structure, or finding specific information that might be hidden or complex.',
      schema: z.object({
        selector: z.string().describe('CSS selector to target specific elements. Default is "body".').default('body'),
        attribute: z.string().optional().describe('Attribute to extract (e.g. "href", "src"). If omitted, extracts text content.')
      }),
      func: async ({ selector, attribute }) => {
        const contents = getContents();
        try {
          // Get full HTML
          const html = await contents.executeJavaScript('document.documentElement.outerHTML');
          const $ = cheerio.load(html);

          const results: string[] = [];
          const sel = selector || 'body';

          $(sel).each((_, el) => {
            if (attribute) {
              const val = $(el).attr(attribute);
              if (val) results.push(val.trim());
            } else {
              // Get text, collapse whitespace
              const text = $(el).text().replace(/\s+/g, ' ').trim();
              if (text) results.push(text);
            }
          });

          return JSON.stringify({
            success: true,
            count: results.length,
            results: results.slice(0, 50) // Limit results
          });
        } catch (e) {
          return JSON.stringify({ success: false, error: String(e) });
        }
      }
    }),

    new DynamicStructuredTool({
      name: 'browser_replay',
      description: 'Replay a sequence of browser actions recorded via Chrome DevTools Recorder (JSON format). Allows for complex automation flows with high precision.',
      schema: z.object({
        recording: z.string().describe('The JSON string of the recording artifact'),
        speed_multiplier: z.number().optional().describe('Speed up or slow down replay (default 1.0)'),
        enable_agent_decisions: z.boolean().optional().describe('Allow the agent to pause or branch if an element is missing'),
      }),
      func: async ({ recording, speed_multiplier = 1.0, enable_agent_decisions = false }) => {
        const contents = getContents();
        try {
          const data = JSON.parse(recording);
          const steps = data.steps || [];
          const logs: string[] = [];

          sendDebugLog('info', `Starting replay: ${data.title || 'Untitled'}`);

          for (const step of steps) {
            // Check for stop signal
            const isStopped = await contents.executeJavaScript('window.__REAVION_STOP__').catch(() => false);
            if (isStopped) return JSON.stringify({ success: false, error: 'Replay stopped by user' });

            const type = step.type;
            logs.push(`Executing ${type}...`);
            sendDebugLog('info', `Step: ${type}`, step);

            if (type === 'setViewport') {
              // We don't usually resize the webview directly here as it's governed by the UI,
              // but we can log intent.
            } else if (type === 'navigate') {
              try {
                await contents.loadURL(step.url);
                await new Promise(resolve => setTimeout(resolve, 2000));
              } catch (e) {
                logs.push(`Navigation failed to ${step.url}: ${String(e)}`);
              }
            } else if (type === 'click' || type === 'change' || type === 'keyDown' || type === 'keyUp') {
              // Convert Chrome Recorder selectors to something our engine understands
              // They provide an array of arrays: [["primary"], ["backup"]]
              const rawSelectors = step.selectors || [];
              const flatSelectors = rawSelectors.map((s: any) => Array.isArray(s) ? s[s.length - 1] : s);

              const result = await contents.executeJavaScript(`
                (async function() {
                  ${SCRIPT_HELPERS}
                  const selectors = ${JSON.stringify(flatSelectors)};
                  const type = "${type}";
                  const value = "${(step.value || '').replace(/"/g, '\\"')}";
                  const key = "${(step.key || '').replace(/"/g, '\\"')}";
                  
                  let element = null;
                  if (selectors && selectors.length > 0) {
                    for (const sel of selectors) {
                      element = findAnyElement(sel);
                      if (element) break;
                    }
                  }

                  // Default for key events if no element found
                  if (!element && (type === 'keyDown' || type === 'keyUp')) {
                    element = document.activeElement || document.body;
                  }

                  if (!element && type !== 'navigate') {
                    return { success: false, error: 'Element not found' + (selectors.length ? ': ' + selectors.join(', ') : '') };
                  }

                  if (element) {
                    if (element.scrollIntoView) {
                      element.scrollIntoView({ behavior: 'smooth', block: 'center' });
                      await wait(500);
                    }

                    const rect = element.getBoundingClientRect();
                    const x = rect.left + rect.width / 2;
                    const y = rect.top + rect.height / 2;

                    if (type === 'click') {
                      // Removed element.focus() for generic click
                      element.click();
                      element.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
                      element.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
                      element.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: x, clientY: y }));
                    } else if (type === 'change') {
                      element.focus({ preventScroll: true });
                      // Handle custom elements/editors like shreddit-composer
                      if (element.tagName.toLowerCase().includes('composer') || element.isContentEditable || element.tagName === 'DIV') {
                        element.textContent = value;
                        element.innerText = value;
                        // Trigger internal editor events
                        element.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: value }));
                      } else {
                        element.value = value;
                      }
                      element.dispatchEvent(new Event('input', { bubbles: true }));
                      element.dispatchEvent(new Event('change', { bubbles: true }));
                    } else if (type === 'keyDown' || type === 'keyUp') {
                      const opts = { key: key, code: key, bubbles: true };
                      element.dispatchEvent(new KeyboardEvent(type, opts));
                    }
                  }

                  await wait(400);
                  return { success: true };
                })()
              `);

              if (!result.success && !enable_agent_decisions) {
                return JSON.stringify({ success: false, error: result.error, logs });
              }
            }

            // Artificial delay between steps for realism
            await new Promise(resolve => setTimeout(resolve, 500 / speed_multiplier));
          }

          return JSON.stringify({ success: true, message: `Completed ${steps.length} steps of "${data.title}"`, logs });
        } catch (e) {
          return JSON.stringify({ success: false, error: String(e) });
        }
      }
    }),

    ...createSiteTools({
      getContents,
      getSpeed: (options?.getSpeed || (() => 'normal')),
      workspaceId: options?.workspaceId
    }),
  ];
}
