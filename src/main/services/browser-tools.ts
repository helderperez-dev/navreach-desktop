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

// Inspector State
const inspectorTabs = new Set<string>();
const inspectorInitiators = new Map<string, Electron.WebContents>();

const INSPECTOR_SCRIPT = `
(function() {
  if (window.__REAVION_INSPECTOR_ACTIVE__) return;
  window.__REAVION_INSPECTOR_ACTIVE__ = true;
  
  const overlay = document.createElement('div');
  overlay.id = 'reavion-inspector-overlay';
  overlay.style.cssText = 'position:fixed;pointer-events:none;border:2px solid #3b82f6;background:rgba(59,130,246,0.1);z-index:9999999;transition:all 0.1s ease;box-sizing:border-box;';
  
  const tooltip = document.createElement('div');
  tooltip.id = 'reavion-inspector-tooltip';
  tooltip.style.cssText = 'position:fixed;pointer-events:none;background:#0f172a;color:white;padding:6px 10px;border-radius:6px;font-size:12px;font-family:sans-serif;z-index:10000000;white-space:nowrap;display:none;box-shadow:0 4px 6px -1px rgba(0,0,0,0.1), 0 2px 4px -1px rgba(0,0,0,0.06);border:1px solid #1e293b;';

  function getRobustSelector(el) {
    if (el.getAttribute('data-testid')) return '[data-testid="' + el.getAttribute('data-testid') + '"]';
    
    const ariaLabel = el.getAttribute('aria-label');
    if (ariaLabel) return '[aria-label="' + ariaLabel + '"]';
    
    if (el.id && !el.id.match(/^ember\\d+/i) && !el.id.match(/^[a-z0-9]{8,}$/)) return '#' + el.id;
    if (el.tagName === 'INPUT' && el.getAttribute('name')) return 'input[name="' + el.getAttribute('name') + '"]';
    
    return el.tagName.toLowerCase();
  }

  function onMouseOver(e) {
    if (!window.__REAVION_INSPECTOR_ACTIVE__) return;
    const el = e.target;
    if (el.closest('#reavion-inspector-overlay') || el.closest('#reavion-inspector-tooltip')) return;

    const rect = el.getBoundingClientRect();
    overlay.style.top = rect.top + 'px';
    overlay.style.left = rect.left + 'px';
    overlay.style.width = rect.width + 'px';
    overlay.style.height = rect.height + 'px';
    
    // Tooltip
    tooltip.style.display = 'block';
    
    let label = el.tagName.toLowerCase();
    if(el.id) label += '#' + el.id;
    else if(el.className && typeof el.className === 'string' && el.className.length) label += '.' + el.className.split(' ')[0];
    
    const aria = el.getAttribute('aria-label');
    if(aria) label += ' [aria="' + aria + '"]';
    
    tooltip.textContent = label;
    
    let top = rect.top - 36;
    let left = rect.left;
    if (top < 0) top = rect.bottom + 8;
    
    if (left + tooltip.offsetWidth > window.innerWidth) {
        left = window.innerWidth - tooltip.offsetWidth - 8;
    }
    
    tooltip.style.top = top + 'px';
    tooltip.style.left = left + 'px';
    
    if(!overlay.parentNode) document.body.appendChild(overlay);
    if(!tooltip.parentNode) document.body.appendChild(tooltip);
  }

  function onClick(e) {
    if (!window.__REAVION_INSPECTOR_ACTIVE__) return;
    e.preventDefault();
    e.stopPropagation();
    
    const el = e.target;
    if (el.closest('#reavion-inspector-overlay') || el.closest('#reavion-inspector-tooltip')) return;
    
    const data = {
      tagName: el.tagName.toLowerCase(),
      selector: getRobustSelector(el),
      fullSelector: (function() { // Simple path
          const path = []; 
          let curr = el; 
          while(curr && curr.nodeType === 1 && path.length < 5) {
             let s = curr.tagName.toLowerCase();
             if(curr.id) { s += '#' + curr.id; path.unshift(s); break; }
             if(curr.getAttribute('data-testid')) { s += '[data-testid="' + curr.getAttribute('data-testid') + '"]'; }
             path.unshift(s);
             curr = curr.parentNode;
          }
          return path.join(' > ');
      })(),
      innerText: el.innerText ? el.innerText.slice(0, 200) : '',
      ariaLabel: (function() {
          let label = el.getAttribute('aria-label');
          if (!label && el.getAttribute('aria-labelledby')) {
              const ids = el.getAttribute('aria-labelledby').split(' ');
              label = ids.map(id => document.getElementById(id)?.innerText).filter(Boolean).join(' ');
          }
          if (!label) label = el.getAttribute('placeholder') || el.getAttribute('aria-placeholder');
          return label || '';
      })(),
      role: el.getAttribute('role') || el.tagName.toLowerCase(),
      url: window.location.href,
      hostname: window.location.hostname
    };
    
    console.log('REAVION_INSPECTOR:' + JSON.stringify(data));
  }

  function cleanUp() {
     if(overlay.parentNode) overlay.remove();
     if(tooltip.parentNode) tooltip.remove();
     document.removeEventListener('mouseover', onMouseOver, true);
     document.removeEventListener('click', onClick, true);
     window.__REAVION_INSPECTOR_ACTIVE__ = false;
  }
  
  // Attach safe cleanup
  window.disableReavionInspector = cleanUp;

  document.addEventListener('mouseover', onMouseOver, true);
  document.addEventListener('click', onClick, true);
})();
`;

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
  const contents = await getWebviewContents(tabId);
  if (contents) {
    try {
      await contents.executeJavaScript(RECORDING_SCRIPT);
    } catch (e) {
      console.error('Failed to inject recorder script:', e);
    }
  }
}

export async function stopRecording(tabId: string) {
  recordingTabs.delete(tabId);
  recordingInitiators.delete(tabId);
  const contents = await getWebviewContents(tabId);
  if (contents) {
    contents.executeJavaScript('window.__REAVION_RECORDER_ACTIVE__ = false;').catch(() => { });
  }
}

export async function startInspector(tabId: string, initiator?: Electron.WebContents) {
  inspectorTabs.add(tabId);
  if (initiator) {
    inspectorInitiators.set(tabId, initiator);
  }
  const contents = await getWebviewContents(tabId);
  if (contents) {
    try {
      await contents.executeJavaScript(INSPECTOR_SCRIPT);
    } catch (e) {
      console.error('Failed to inject inspector script:', e);
    }
  }
}

export async function stopInspector(tabId: string) {
  inspectorTabs.delete(tabId);
  inspectorInitiators.delete(tabId);
  const contents = await getWebviewContents(tabId);
  if (contents) {
    contents.executeJavaScript('if(window.disableReavionInspector) window.disableReavionInspector();').catch(() => { });
  }
}

const consoleLogs = new Map<string, string[]>();

export function registerWebviewContents(tabId: string, contents: Electron.WebContents) {
  // Prevent duplicate registration and listener accumulation
  if ((contents as any).__REAVION_REGISTERED__) {
    webviewContents.set(tabId, contents); // Ensure the map link is fresh
    return;
  }
  (contents as any).__REAVION_REGISTERED__ = true;

  webviewContents.set(tabId, contents);

  // Set background color to prevent white flashes
  if ((contents as any).setBackgroundColor) {
    (contents as any).setBackgroundColor('#0A0A0B');
  }

  // PREVENT OS FOCUS STEALING:
  // Intercept the webContents focus event. If the main window isn't currently
  // the active foreground window in the OS, we prevent the webview from
  // grabbing focus which would otherwise pull the whole Reavion window to the front.
  contents.on('focus', () => {
    const focusedWin = BrowserWindow.getFocusedWindow();
    const mainWin = BrowserWindow.getAllWindows()[0];
    if (mainWin && focusedWin !== mainWin) {
      // If Reavion isn't the active app, don't let the webview grab focus.
      // We blur the window to ensure it doesn't stay as the active responder.
      contents.executeJavaScript('window.blur()').catch(() => { });
    }
  });

  // MIMIC CHROME: Set a modern Chrome User-Agent
  // This ensures social networks see us as a regular browser, not Electron
  const chromeUA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
  contents.setUserAgent(chromeUA);

  // MIMIC CHROME: Mask Electron/Automation signals and Spoof Fingerprinting
  // We use a high-quality masking script to bypass advanced detection
  // This script is now injected into EVERY frame (including iframes) to handle challenges like Turnstile
  const maskSignalsScript = `
    (function() {
      // 1. Ensure navigator properties match a real Chrome
      const chromeUA = '${chromeUA}';
      
      const overrides = {
        webdriver: false,
        userAgent: chromeUA,
        appVersion: chromeUA.replace('Mozilla/', ''),
        platform: 'MacIntel',
        vendor: 'Google Inc.',
        languages: ['en-US', 'en'],
        deviceMemory: 8,
        hardwareConcurrency: 8
      };

      for (const [prop, value] of Object.entries(overrides)) {
        try {
          Object.defineProperty(navigator, prop, {
            get: () => value,
            configurable: true
          });
        } catch (e) {}
      }
      
      // 2. Mock chrome object (essential for "Is Chrome" checks)
      if (!window.chrome) {
        window.chrome = {
          runtime: {},
          loadTimes: function() {},
          csi: function() {},
          app: {}
        };
      } else {
        // Enhance existing chrome object if needed
        if (!window.chrome.runtime) window.chrome.runtime = {};
        if (!window.chrome.app) window.chrome.app = {};
      }

      // 3. Mock Plugins (standard Chrome profiles)
      if (!navigator.plugins.length) {
        const mockPlugins = [
          { name: 'PDF Viewer', filename: 'internal-pdf-viewer', description: 'Portable Document Format' },
          { name: 'Chrome PDF Viewer', filename: 'mhjfbmdpjiiglhbhkeicmopidxocgoeb', description: '' },
          { name: 'Chromium PDF Viewer', filename: 'internal-pdf-viewer', description: '' }
        ];
        Object.defineProperty(navigator, 'plugins', { get: () => mockPlugins, configurable: true });
      }
      
      // 4. Spoof Screen & Dimensions (Avoid "Headless" signatures)
      Object.defineProperty(Screen.prototype, 'colorDepth', { get: () => 24, configurable: true });
      Object.defineProperty(Screen.prototype, 'pixelDepth', { get: () => 24, configurable: true });

      // 5. Hide common automation properties and Electron leaks
      try {
        if (window.process) delete window.process;
        if (window.electron) delete window.electron;
        if (window.ipcRenderer) delete window.ipcRenderer;
        
        // Proxy protection
        const hiddenProps = ['process', 'electron', 'ipcRenderer', 'webdriver'];
        /* 
           Note: We avoid wrapping window in a Proxy as it breaks some frameworks.
           Instead we just delete the properties.
        */
      } catch(e) {}
      
      // 6. Advanced evasion for Google/ReCAPTCHA/Turnstile
      const removeCDC = () => {
        for (const prop in window) {
          if (prop.match(/^cdc_[a-z0-9]+$/)) {
            try { delete window[prop]; } catch(e) {}
          }
        }
      };
      removeCDC();
      
      // Spoof WebGL fingerprint consistently
      try {
          const getParameter = WebGLRenderingContext.prototype.getParameter;
          WebGLRenderingContext.prototype.getParameter = function(parameter) {
            if (parameter === 37445) return 'Intel Inc.';
            if (parameter === 37446) return 'Intel(R) Iris(TM) Plus Graphics';
            return getParameter.apply(this, arguments);
          };
      } catch(e) {}

      // 7. Prevent focus stealing
      // We override focus methods to prevent background pages from grabbing focus
      // but we allow it if we are explicitly performing an interaction.
      try {
        window.focus = function() {
          console.log('[Reavion] Blocked window.focus()');
        };
        
        const originalElementFocus = HTMLElement.prototype.focus;
        HTMLElement.prototype.focus = function() {
          if (window.__REAVION_INTERNAL_FOCUS__) {
            return originalElementFocus.apply(this, arguments);
          }
        };

        // Proactively blur anything that grabs focus without an internal automation flag
        // or if the document itself doesn't have OS-level focus.
        document.addEventListener('focusin', (e) => {
          if (!window.__REAVION_INTERNAL_FOCUS__ && !document.hasFocus()) {
            try { (e.target as any)?.blur(); } catch(err) {}
          }
        }, true);
      } catch (e) {}
    })();
  `;

  // MIMIC CHROME: Inject mask signals into every frame as soon as it loads
  // This is critical because Turnstile/ReCAPTCHA run in iframes
  contents.on('did-frame-finish-load', (_event, _isMainFrame, _frameProcessId, frameRoutingId) => {
    try {
      // executeJavaScript only works on the main frame by default via contents object,
      // so we must find the frame object to inject into sub-frames.
      const findFrame = (root: any, id: number): any => {
        if (root.routingId === id) return root;
        for (const child of root.frames) {
          const found = findFrame(child, id);
          if (found) return found;
        }
        return null;
      };

      const frame = findFrame(contents.mainFrame, frameRoutingId);
      if (frame) {
        frame.executeJavaScript(maskSignalsScript).catch(() => { });
      } else {
        contents.executeJavaScript(maskSignalsScript).catch(() => { });
      }
    } catch (e) {
      contents.executeJavaScript(maskSignalsScript).catch(() => { });
    }
  });

  contents.on('dom-ready', () => {
    // Re-inject on dom-ready just in case
    contents.executeJavaScript(maskSignalsScript).catch(() => { });

    // Inject high-visibility CSS cursor - LESS AGGRESSIVE
    contents.insertCSS(`
      html, body {
        cursor: url("data:image/svg+xml,%3Csvg width='24' height='24' viewBox='0 0 24 24' fill='none' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M4.5 2L10.5 18.5L13.125 11.375L20.25 8.75L4.5 2Z' fill='%23000000' stroke='white' stroke-width='2' stroke-linejoin='round'/%3E%3C/svg%3E") 0 0, auto;
      }
      a, button, [role="button"], input, textarea, select, .click-target {
        cursor: url("data:image/svg+xml,%3Csvg width='24' height='24' viewBox='0 0 24 24' fill='none' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M4.5 2L10.5 18.5L13.125 11.375L20.25 8.75L4.5 2Z' fill='%23000000' stroke='white' stroke-width='2' stroke-linejoin='round'/%3E%3C/svg%3E") 0 0, pointer !important;
      }
      #reavion-pointer-host { 
        all: initial; 
        position: fixed !important; 
        top: 0 !important; 
        left: 0 !important; 
        width: 100vw !important; 
        height: 100vh !important; 
        z-index: 2147483647 !important; 
        pointer-events: none !important; 
      }
    `).catch(() => { });
  });

  // Inject recorder and inspector scripts
  contents.on('did-finish-load', () => {
    // CRITICAL: Prevent focus stealing on page load
    // When a page finishes loading, it often tries to focus itself or an input element.
    // We proactively blur the window if Reavion isn't the active app.
    const focusedWin = BrowserWindow.getFocusedWindow();
    const mainWin = BrowserWindow.getAllWindows()[0];
    if (mainWin && focusedWin !== mainWin) {
      contents.executeJavaScript('window.blur(); document.activeElement?.blur();').catch(() => { });
    }

    // Send navigation event to initiator
    const initiator = recordingInitiators.get(tabId);
    if (initiator && !initiator.isDestroyed()) {
      initiator.send('recorder:action', {
        type: 'navigation',
        url: contents.getURL(),
        timestamp: Date.now()
      });
    }
    if (recordingTabs.has(tabId)) {
      contents.executeJavaScript(RECORDING_SCRIPT).catch(err => {
        console.error(`[Recorder] Failed to re-inject on ${tabId}:`, err);
      });
    }

    if (inspectorTabs.has(tabId)) {
      contents.executeJavaScript(INSPECTOR_SCRIPT).catch(err => {
        console.error(`[Inspector] Failed to re-inject on ${tabId}:`, err);
      });
    }
  });

  // Also prevent focus stealing on navigation start
  contents.on('did-start-navigation', () => {
    const focusedWin = BrowserWindow.getFocusedWindow();
    const mainWin = BrowserWindow.getAllWindows()[0];
    if (mainWin && focusedWin !== mainWin) {
      contents.executeJavaScript('window.blur();').catch(() => { });
    }
  });

  // Platform Redirect Protector: Blocks tracking syncs from hijacking the main frame
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

    // Check for inspector events
    if (message.startsWith('REAVION_INSPECTOR:')) {
      if (inspectorTabs.has(tabId)) {
        try {
          const jsonStr = message.replace('REAVION_INSPECTOR:', '');
          const eventData = JSON.parse(jsonStr);
          const initiator = inspectorInitiators.get(tabId);
          if (initiator && !initiator.isDestroyed()) {
            initiator.send('inspector:action', eventData);
          } else {
            const windows = BrowserWindow.getAllWindows();
            if (windows.length > 0) {
              windows[0].webContents.send('inspector:action', eventData);
            }
          }
        } catch (e) { console.error('Failed to parse inspector event:', e); }
      }
      return;
    }

    const logs = consoleLogs.get(tabId) || [];
    const logEntry = `[${level === 0 ? 'LOG' : level === 1 ? 'WARN' : level === 2 ? 'ERROR' : 'INFO'}] ${message}`; // Simplified for token efficiency
    logs.push(logEntry);
    if (logs.length > 50) logs.shift(); // Keep last 50 to save tokens
    consoleLogs.set(tabId, logs);

    if (level === 2) { // ERROR level
      // Silence noisy Electron security warnings about CSP in development/webviews
      if (message.includes('Insecure Content-Security-Policy') || message.includes('unsafe-eval')) {
        return;
      }
      sendDebugLog('error', `Browser Console Error [${tabId}]: ${message}`, { line, sourceId });
    }
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



const TAB_ID = 'main-tab';

const SCRIPT_HELPERS = `
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

  window.wait = (ms) => {
    const multiplier = window.__REAVION_SPEED_MULTIPLIER__ || 1;
    const isFast = multiplier < 1.0;
    
    // HUMAN BEHAVIOR: +/- 30% randomness + occasional hesitation
    const randomFactor = 0.7 + Math.random() * 0.6;
    const hesitation = Math.random() < 0.1 ? (200 + Math.random() * 600) : 0;
    
    let adjustedMs = (ms * multiplier * randomFactor) + hesitation;
    if (isFast) adjustedMs = ms * multiplier;

    return new Promise((resolve) => {
       setTimeout(resolve, adjustedMs);
    });
  };

  window.ensurePointer = () => {
    let host = document.getElementById('reavion-pointer-host');
    if (!host) {
      host = document.createElement('div');
      host.id = 'reavion-pointer-host';
      host.style.cssText = 'position:fixed;top:0;left:0;width:100vw;height:100vh;z-index:2147483647;pointer-events:none;';
      
      let root = host;
      try {
          if (host.attachShadow) {
              root = host.attachShadow({ mode: 'open' });
          }
      } catch(e) { /* Shadow DOM might be blocked */ }

      const style = document.createElement('style');
      style.textContent = 
        '@keyframes breathe { 0% { transform: scale(1); } 50% { transform: scale(1.1); } 100% { transform: scale(1); } } ' +
        '@keyframes ripple { 0% { transform: scale(0); opacity: 1; } 100% { transform: scale(3); opacity: 0; } } ' +
        '@keyframes hover-grow { 0% { transform: scale(1.1); } 50% { transform: scale(1.25); } 100% { transform: scale(1.1); } } ' +
        '.pointer { ' +
          'position: fixed; ' +
          'z-index: 2147483647; ' +
          'pointer-events: none; ' +
          'filter: drop-shadow(0 4px 12px rgba(0,0,0,0.4)); ' +
          'transition: transform 0.2s cubic-bezier(0.175, 0.885, 0.32, 1.275); ' +
          'width: 32px; height: 32px; ' +
          'display: block !important; ' +
          'visibility: visible !important; ' +
          'opacity: 1 !important; ' +
          'will-change: top, left; ' +
          'animation: breathe 3s ease-in-out infinite; ' +
        '} ' +
        '.pointer.moving { animation: none; transform: scale(0.95); } ' +
        '.pointer.hovering { animation: hover-grow 0.6s ease-in-out infinite !important; filter: drop-shadow(0 4px 15px rgba(59, 130, 246, 0.6)); } ' +
        '.click-ripple { ' +
          'position: fixed; ' +
          'width: 40px; height: 40px; ' +
          'border: 3px solid #3b82f6; ' +
          'border-radius: 50%; ' +
          'pointer-events: none; ' +
          'z-index: 2147483646; ' +
          'animation: ripple 0.6s ease-out forwards; ' +
        '}';
      root.appendChild(style);
      
      // Auto-create pointer if missing
      let p = document.createElement('div');
      p.className = 'pointer';
      p.innerHTML = '<svg width="32" height="32" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M0 0L8 22L11.5 12.5L21 9L0 0Z" fill="#000000" stroke="#ffffff" stroke-width="2"/></svg>';
      root.appendChild(p);

      document.documentElement.appendChild(host);
    }
    
    // Ensure it's in the DOM
    if (!host.parentElement && document.documentElement) {
        document.documentElement.appendChild(host);
    }
    
    return host.shadowRoot || host;
  };

  window.movePointer = (targetX, targetY) => {
    const root = window.ensurePointer();
    const p = root.querySelector('.pointer');
    if (!p) return Promise.resolve(); // Should not happen

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
            const ease = progress < 0.5 ? 2 * progress * progress : 1 - Math.pow(-2 * progress + 2, 2) / 2; // easeInOutQuad

            const x = window.cubicBezier(ease, start.x, cp1.x, cp2.x, end.x);
            const y = window.cubicBezier(ease, start.y, cp1.y, cp2.y, end.y);

            p.style.left = x + 'px';
            p.style.top = y + 'px';

            try {
                const elAtPoint = document.elementFromPoint(x, y);
                // Dispatch mousemove for hover effects
                if (elAtPoint) {
                    const evt = new MouseEvent('mousemove', {
                        view: window,
                        bubbles: true,
                        cancelable: true,
                        clientX: x,
                        clientY: y,
                        screenX: x + window.screenX, 
                        screenY: y + window.screenY
                    });
                    elAtPoint.dispatchEvent(evt);

                    if (elAtPoint.closest('button, a, [role="button"], input, textarea, select') || elAtPoint.onclick) {
                        p.classList.add('hovering');
                    } else {
                        p.classList.remove('hovering');
                    }
                }
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

  window.safeMoveToElement = async (selector, index = 0) => {
    const startTime = Date.now();
    let el = null;
    while (!el && Date.now() - startTime < 4000) {
      el = window.findAnyElement(selector, index);
      if (!el) await window.wait(200);
    }
    if (!el) throw new Error('Element not found: ' + selector);
    
    // For LinkedIn/Google compatibility: find the real clickable target
    const clickable = el.closest('button, [role="button"], a, input, textarea, select, [onclick]') || el;
    try {
        clickable.scrollIntoView({ behavior: 'auto', block: 'center', inline: 'center' });
    } catch(e) {
        // Fallback for older browsers or strict contexts
        clickable.scrollIntoView(true);
    }
    await window.wait(400);
    
    const rect = clickable.getBoundingClientRect();
    // Offset support for IFrames
    const ox = clickable.__REAVION_OX__ || 0;
    const oy = clickable.__REAVION_OY__ || 0;
    
    const x = Math.round(ox + rect.left + rect.width / 2);
    const y = Math.round(oy + rect.top + rect.height / 2);
    
    try {
        await window.movePointer(x, y);
        await window.wait(100);
    } catch (e) {
        // If pointer movement fails, ignore and proceed to click
    }
    
    const finalRect = clickable.getBoundingClientRect();
    return { 
      x: Math.round(ox + finalRect.left + finalRect.width / 2), 
      y: Math.round(oy + finalRect.top + finalRect.height / 2), 
      element: clickable 
    };
  };

  window.querySelectorAllPierce = function(selector, root = document) {
    const results = [];
    const queue = [{ root, ox: 0, oy: 0 }];
    const visited = new Set();
    while (queue.length > 0) {
      const { root: curr, ox, oy } = queue.shift();
      if (!curr || visited.has(curr)) continue;
      visited.add(curr);
      try {
        const matches = curr.querySelectorAll(selector);
        for (let i = 0; i < matches.length; i++) {
          const el = matches[i];
          if (!results.includes(el)) {
            // Attach temporary offsets for coordinate calculation if inside iframe
            el.__REAVION_OX__ = ox;
            el.__REAVION_OY__ = oy;
            results.push(el);
          }
        }
      } catch (e) {}
      
      // Pierce Shadow DOM and accessible IFrames
      const walker = document.createTreeWalker(curr, 1, function(n) { 
        try { return (n.shadowRoot || (n.tagName === 'IFRAME' && n.contentDocument)) ? 1 : 3; } catch(e) { return 3; }
      });
      let host;
      while (host = walker.nextNode()) {
        if (host.shadowRoot) queue.push({ root: host.shadowRoot, ox, oy });
        try { 
          if (host.tagName === 'IFRAME' && host.contentDocument) {
            const rect = host.getBoundingClientRect();
            queue.push({ root: host.contentDocument, ox: ox + rect.left, oy: oy + rect.top });
          }
        } catch(e) {}
      }
    }
    return results;
  };

  window.querySelectorPierce = (selector, root) => {
    const all = window.querySelectorAllPierce(selector, root);
    return all.length > 0 ? all[0] : null;
  };

  window.querySelectorAria = (ariaLabel, index = 0) => {
    if (!ariaLabel) return null;
    const clean = ariaLabel.replace(/['"]/g, '').trim().toLowerCase();
    const results = [];
    const queue = [{ root: document, ox: 0, oy: 0 }];
    const visited = new Set();
    
    while (queue.length > 0) {
      const { root: curr, ox, oy } = queue.shift();
      if (!curr || visited.has(curr)) continue;
      visited.add(curr);
      
      const walker = document.createTreeWalker(curr, 1, null);
      let el;
      while (el = walker.nextNode()) {
        if (results.length > 150) break;

        let score = 0;
        const attrs = {
            aria: (el.getAttribute('aria-label') || '').toLowerCase(),
            title: (el.getAttribute('title') || '').toLowerCase(),
            placeholder: (el.getAttribute('placeholder') || '').toLowerCase(),
            alt: (el.getAttribute('alt') || '').toLowerCase(),
            testId: (el.getAttribute('data-testid') || '').toLowerCase(),
            name: (el.getAttribute('name') || '').toLowerCase(),
            role: (el.getAttribute('role') || '').toLowerCase(),
            text: (el.innerText || '').slice(0, 50).toLowerCase().trim()
        };

        if (attrs.aria === clean) score += 100;
        else if (attrs.placeholder === clean) score += 95;
        else if (attrs.name === clean) score += 90;
        else if (attrs.testId === clean) score += 85;
        else if (attrs.aria.startsWith(clean + ' ')) score += 60;
        else if (attrs.placeholder.startsWith(clean)) score += 55;
        else if (attrs.aria.includes(clean)) score += 30;
        
        if (score === 0) { 
             if (attrs.role === clean) score += 5;
             if (attrs.text === clean && (el.tagName === 'BUTTON' || el.tagName === 'A')) score += 40;
        }

        if (score > 0) {
           el.__REAVION_OX__ = ox;
           el.__REAVION_OY__ = oy;
           results.push({ el, score });
        }
      }
      
      const hosts = document.createTreeWalker(curr, 1, function(n) { 
        try { return (n.shadowRoot || (n.tagName === 'IFRAME' && n.contentDocument)) ? 1 : 3; } catch(e) { return 3; }
      });
      let h;
      while (h = hosts.nextNode()) {
          if (h.shadowRoot) queue.push({ root: h.shadowRoot, ox, oy });
          try {
              if (h.tagName === 'IFRAME' && h.contentDocument) {
                  const rect = h.getBoundingClientRect();
                  queue.push({ root: h.contentDocument, ox: ox + rect.left, oy: oy + rect.top });
              }
          } catch(e) {}
      }
    }

    results.sort((a, b) => b.score - a.score);
    const match = results[index] || results[0];
    return match ? match.el : null;
  };

  window.findElementByText = (text, root = document) => {
    const clean = (text || '').toString().replace(/['"]/g, '').trim().toLowerCase();
    if (!clean) return null;
    const queue = [{ root: root, ox: 0, oy: 0 }];
    const visited = new Set();
    while (queue.length > 0) {
      const { root: curr, ox, oy } = queue.shift();
      if (!curr || visited.has(curr)) continue;
      visited.add(curr);
      
      const walker = document.createTreeWalker(curr, 4, null);
      let node;
      while (node = walker.nextNode()) {
        const txt = node.textContent.toLowerCase();
        if (txt.includes(clean)) {
          const p = node.parentElement;
          if (p && p.offsetWidth > 0 && p.offsetHeight > 0) {
              if (txt.trim() === clean || p.tagName === 'A' || p.tagName === 'BUTTON') {
                  p.__REAVION_OX__ = ox;
                  p.__REAVION_OY__ = oy;
                  return p;
              }
          }
        }
      }
      
      const hosts = document.createTreeWalker(curr, 1, function(n) { 
        try { return (n.shadowRoot || (n.tagName === 'IFRAME' && n.contentDocument)) ? 1 : 3; } catch(e) { return 3; }
      });
      let h;
      while (h = hosts.nextNode()) {
          if (h.shadowRoot) queue.push({ root: h.shadowRoot, ox, oy });
          try {
              if (h.tagName === 'IFRAME' && h.contentDocument) {
                  const rect = h.getBoundingClientRect();
                  queue.push({ root: h.contentDocument, ox: ox + rect.left, oy: oy + rect.top });
              }
          } catch(e) {}
      }
    }
    return null;
  };

  window.findAnyElement = (selector, index = 0) => {
    const s = (selector || '').toString().trim();
    if (s.startsWith('id/')) {
       const id = s.split('/')[1];
       const found = window.querySelectorAllPierce('[data-reavion-id="' + id + '"]');
       if (found[0]) return found[0];
    }
    if (/^\\d+$/.test(s)) {
      const found = window.querySelectorAllPierce('[data-reavion-id="' + s + '"]');
      if (found[0]) return found[0];
    }
    const cleanSel = s.replace(/^(pierce\\/|aria\\/|xpath\\/|text\\/|id\\/)/, '');
    if (s.startsWith('aria/')) return window.querySelectorAria(cleanSel, index);
    if (s.startsWith('text/')) return window.findElementByText(cleanSel);
    if (s.startsWith('xpath/')) { try { const res = document.evaluate(cleanSel, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null); return res.singleNodeValue; } catch (e) { return null; } }
    const attrMatch = s.match(/\\[(aria-label|placeholder|title|data-testid|name)=["'](.+?)["']\\]/i);
    if (attrMatch) {
       const found = window.querySelectorAria(attrMatch[2], index);
       if (found) return found;
    }
    try {
      const all = window.querySelectorAllPierce(cleanSel);
      if (all[index] || all[0]) return all[index] || all[0];
    } catch(e) {}
    if (!s.startsWith('.') && !s.startsWith('#') && !s.includes('[')) { const textFound = window.findElementByText(s); if (textFound) return textFound; }
    return null;
  };

  window.typeHumanly = async (text) => {
      const chars = text.split('');
      const activeElement = document.activeElement;
      
      for (const char of chars) {
          // Standard delay: 50ms - 150ms
          // Occasional hesitation: 300ms
          const isSpace = char === ' ';
          const isPunctuation = ['.', ',', '!', '?'].includes(char);
          
          const isTurbo = (window.__REAVION_SPEED_MULTIPLIER__ || 1) < 0.3;
          let delay = 30 + Math.random() * 80; // Fast typer base
          if (isSpace) delay += 30; // Pause slightly on spaces
          if (isPunctuation) delay += 100; // Pause more on punctuation
          
          if (!isTurbo && Math.random() < 0.05) delay += 200; // Occasional "thinking" pause
          
          await window.wait(delay * (window.__REAVION_SPEED_MULTIPLIER__ || 1));
          
          // Dispatch events to simulate real keystrokes
          const keyOptions = {
              key: char,
              code: 'Key' + char.toUpperCase(), // Simplified, not perfect but usually enough
              charCode: char.charCodeAt(0),
              keyCode: char.charCodeAt(0),
              which: char.charCodeAt(0),
              bubbles: true,
              cancelable: true,
              view: window
          };
          
          if (activeElement) {
              activeElement.dispatchEvent(new KeyboardEvent('keydown', keyOptions));
              activeElement.dispatchEvent(new KeyboardEvent('keypress', keyOptions));
              
              // Insert char (simulating value update if not handled by event)
              // NOTE: In Electron we rely on contents.insertText usually, but here we are inside the page context.
              // For input/textarea we can append value. For contentEditable we use execCommand or range.
              if (activeElement.tagName === 'INPUT' || activeElement.tagName === 'TEXTAREA') {
                  const start = activeElement.selectionStart;
                  const end = activeElement.selectionEnd;
                  const val = activeElement.value;
                  activeElement.value = val.substring(0, start) + char + val.substring(end);
                  activeElement.selectionStart = activeElement.selectionEnd = start + 1;
              } else if (activeElement.isContentEditable) {
                   document.execCommand('insertText', false, char);
              }
              
              activeElement.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: char }));
              activeElement.dispatchEvent(new KeyboardEvent('keyup', keyOptions));
          }
      }
      return true;
  };

  window.__REAVION_HELPERS_LOADED__ = true;
`;

/**
 * Builds a script for executeJavaScript that safely injects SCRIPT_HELPERS
 * without using eval() to satisfy strict CSP (Content Security Policy) rules.
 */
function buildTaskScript(coreLogic: string): string {
  return '(async function() {\n' +
    '  try {\n' +
    '    if (!window.__REAVION_HELPERS_LOADED__) {\n' +
    SCRIPT_HELPERS + '\n' +
    '    }\n' +
    '    if (typeof window.safeMoveToElement !== "function") {\n' +
    '      throw new Error("Browser automation helpers failed to initialize. The page may require a reload.");\n' +
    '    }\n' +
    coreLogic + '\n' +
    '  } catch (err) {\n' +
    '    return { success: false, error: err.message || String(err), stack: err.stack };\n' +
    '  }\n' +
    '})()';
}

/**
 * Internal helper for tools to get the active webview contents.
 * Throws an error if not found or destroyed after a short wait.
 */
async function getContents(): Promise<Electron.WebContents> {
  const contents = await getWebviewContents(TAB_ID);
  if (!contents) {
    throw new Error('Browser not ready or has crashed. Please refresh or wait for the page to load.');
  }
  return contents;
}

export async function getWebviewContents(tabId: string): Promise<Electron.WebContents | undefined> {
  // Wait up to 2 seconds for registration (e.g. during startup or workspace switch)
  for (let i = 0; i < 20; i++) {
    const contents = webviewContents.get(tabId);
    if (contents) {
      // Defensive check for isDestroyed being a function
      const isActuallyDestroyed = typeof contents.isDestroyed === 'function' ? contents.isDestroyed() : false;
      if (!isActuallyDestroyed) return contents;
    }
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  return undefined;
}

export async function resetBrowser(): Promise<void> {
  try {
    const contents = await getContents();
    await contents.loadURL('about:blank');
    console.log('[Browser Tools] Resetting browser context to about:blank');
  } catch (e) {
    console.error('[Browser Tools] Failed to reset browser:', e);
  }
}

async function ensureSpeedMultiplier(getSpeed: () => 'slow' | 'normal' | 'fast'): Promise<void> {
  const speed = getSpeed();
  const multiplier = speed === 'slow' ? 1.5 : speed === 'fast' ? 0.15 : 1.0;
  try {
    const contents = await getContents();
    await contents.executeJavaScript(`window.__REAVION_SPEED_MULTIPLIER__ = ${multiplier};`);
  } catch (e) {
    // Ignore if browser not ready
  }
}

export function createBrowserTools(options?: {
  getSpeed?: () => 'slow' | 'normal' | 'fast',
  workspaceId?: string,
  scrollWait?: number,
  getAccessToken?: () => string | undefined,
  currentModelSupportsVision?: boolean,
  visionCapability?: (query: string, screenshotBase64: string) => Promise<{ x: number, y: number } | null>
}): DynamicStructuredTool[] {
  const getSpeed = options?.getSpeed || (() => 'normal');

  const navigateTool = new DynamicStructuredTool({
    name: 'browser_navigate',
    description: 'Navigate the browser to a specific URL. Use this to open websites. WARNING: Before navigating after completing an action (reply, post, like, etc.), you MUST take a browser snapshot first to verify the action completed successfully.',
    schema: z.object({
      url: z.string().describe('The URL to navigate to. Must include protocol (http:// or https://)'),
    }),
    func: async ({ url }) => {
      try {
        const contents = await getContents();
        if (typeof contents.isDestroyed === 'function' && contents.isDestroyed()) throw new Error('Browser crashed or closed');

        await ensureSpeedMultiplier(getSpeed);
        let targetUrl = url;
        if (!targetUrl.startsWith('http://') && !targetUrl.startsWith('https://')) {
          targetUrl = `https://${targetUrl}`;
        }

        sendDebugLog('info', `Navigating to: ${targetUrl}`);

        // PREVENT FOCUS STEALING: Blur before navigation
        const focusedWin = BrowserWindow.getFocusedWindow();
        const mainWin = BrowserWindow.getAllWindows()[0];
        const shouldPreventFocus = mainWin && focusedWin !== mainWin;

        if (shouldPreventFocus) {
          await contents.executeJavaScript('window.blur();').catch(() => { });
        }

        try {
          await contents.loadURL(targetUrl);

          // PREVENT FOCUS STEALING: Blur after navigation starts
          if (shouldPreventFocus) {
            await contents.executeJavaScript('window.blur();').catch(() => { });
          }
        } catch (navError: any) {
          if (contents.isDestroyed()) throw new Error('Browser closed during navigation');
          // ERR_ABORTED (-3) can happen on redirects - check if page actually loaded
          if (navError.code === 'ERR_ABORTED' || navError.errno === -3) {
            await new Promise(resolve => setTimeout(resolve, 500));
            if (contents.isDestroyed()) return JSON.stringify({ success: false, error: 'Browser closed' });
            const currentUrl = contents.getURL();
            if (currentUrl && currentUrl !== 'about:blank') {
              return JSON.stringify({ success: true, url: currentUrl, message: `Navigated to ${currentUrl}` });
            }
          }
          throw navError;
        }

        if (typeof contents.isDestroyed === 'function' && contents.isDestroyed()) throw new Error('Browser closed after navigation');
        const finalUrl = contents.getURL();
        return JSON.stringify({ success: true, url: finalUrl, message: `Navigated to ${finalUrl}` });
      } catch (error) {
        sendDebugLog('error', `Navigation failed to ${url}`, { error: String(error) });
        return JSON.stringify({ success: false, error: String(error) });
      }
    },
  });

  const clickTool = new DynamicStructuredTool({
    name: 'browser_click',
    description: 'Click on an element in the browser using a CSS selector.',
    schema: z.object({
      selector: z.string().describe('CSS selector (e.g., "button.submit"), ARIA label (e.g., "aria/Login"), or numeric ID from previous snapshot.'),
      index: z.number().describe('0-based index of element to click when multiple elements match the selector. Use 0 for first.'),
    }),
    func: async ({ selector, index }) => {
      const contents = await getContents();
      try {
        await ensureSpeedMultiplier(getSpeed);
        const speed = getSpeed ? getSpeed() : 'normal';
        const multiplier = speed === 'slow' ? 1.5 : speed === 'fast' ? 0.15 : 1.0;
        const isTurbo = multiplier < 0.3;

        const coreLogic = `
          const result = await window.safeMoveToElement(${JSON.stringify(selector)}, ${index || 0});
          const el = result.element;
          
          if (typeof window.showVisualClick === 'function') window.showVisualClick(result.x, result.y);
          
          // Hybrid click: dispatch events manually + standard click
          const clickable = el.closest('button, [role="button"], a') || el;
          try {
            const common = { bubbles: true, cancelable: true, view: window };
            clickable.dispatchEvent(new MouseEvent('mousedown', common));
            await window.wait(50);
            clickable.dispatchEvent(new MouseEvent('mouseup', common));
            clickable.click();
          } catch(e) {}
          
          return { success: true, x: result.x, y: result.y };
        `;

        const script = buildTaskScript(coreLogic);

        const scriptResult = await contents.executeJavaScript(script).catch(err => {
          sendDebugLog('error', 'browser_click: Script execution failed', { error: String(err), script: script.slice(0, 500) + '...' });
          throw err;
        });

        let x = scriptResult.x;
        let y = scriptResult.y;

        if (!scriptResult.success) {
          let foundVisually = false;
          // Vision Fallback
          if (options?.visionCapability && options?.currentModelSupportsVision) {
            try {
              sendDebugLog('info', 'Selector failed. Attempting Vision Fallback...', { selector });
              // Use internal screenshot capture
              const image = await contents.capturePage();
              // Resize if too massive? Electron capturePage returns native size. 
              // Models usually handle up to 2048x2048 fine.
              const base64 = image.toDataURL();

              const coords = await options.visionCapability(selector, base64);
              if (coords) {
                x = coords.x;
                y = coords.y;
                foundVisually = true;
                sendDebugLog('info', 'Vision Match Found', coords);

                // Show visual feedback for the vision click
                try {
                  contents.executeJavaScript(`if (typeof window.showVisualClick === 'function') window.showVisualClick(${x}, ${y});`).catch(() => { });
                } catch (e) { }
              }
            } catch (visErr) {
              console.error('Vision fallback error', visErr);
            }
          }

          if (!foundVisually) {
            sendDebugLog('warning', `browser_click: Element search failed: ${scriptResult.error}`, { selector, index });
            return JSON.stringify(scriptResult);
          }
        }
        const roundedX = Math.round(x);
        const roundedY = Math.round(y);

        // Native click sequence
        // contents.focus(); // REMOVED: Prevent stealing OS focus during background automation
        contents.sendInputEvent({ type: 'mouseMove', x: roundedX, y: roundedY });
        await new Promise(r => setTimeout(r, isTurbo ? 10 : 50));
        contents.sendInputEvent({ type: 'mouseDown', x: roundedX, y: roundedY, button: 'left', clickCount: 1 });
        await new Promise(r => setTimeout(r, isTurbo ? 10 : 50));
        contents.sendInputEvent({ type: 'mouseUp', x: roundedX, y: roundedY, button: 'left', clickCount: 1 });

        return JSON.stringify({ success: true, message: `Clicked ${selector} at ${roundedX},${roundedY}` });
      } catch (error) {
        sendDebugLog('error', `browser_click: unexpected failure`, { error: String(error), stack: error instanceof Error ? error.stack : undefined });
        return JSON.stringify({
          success: false,
          error: 'Browser execution error: ' + String(error),
          details: 'The browser renderer failed to execute the click script.'
        });
      }
    },
  });

  const writeTool = new DynamicStructuredTool({
    name: 'browser_write',
    description: 'Write (type) text into an input field or contenteditable element. Preserves site state by using native events.',
    schema: z.object({
      selector: z.string().describe('CSS selector, ARIA label, or numeric ID for the input element'),
      text: z.string().describe('The direct text to insert. STRICTLY the input value only. NO narration or "I will type..." prefixes.'),
      index: z.number().optional().default(0).describe('0-based index if multiple elements match'),
      enter: z.boolean().optional().default(false).describe('Whether to press Enter after typing'),
    }),
    func: async ({ selector, text, index = 0, enter = false }) => {
      const contents = await getContents();
      try {
        await ensureSpeedMultiplier(getSpeed);
        const speed = getSpeed ? getSpeed() : 'normal';
        const multiplier = speed === 'slow' ? 1.5 : speed === 'fast' ? 0.15 : 1.0;
        const isTurbo = multiplier < 0.3;

        const coreLogic = `
          const result = await window.safeMoveToElement(${JSON.stringify(selector)}, ${index});
          if (typeof window.showVisualClick === 'function') window.showVisualClick(result.x, result.y);
          return { success: true, x: result.x, y: result.y };
        `;

        const script = buildTaskScript(coreLogic);

        const scriptResult = await contents.executeJavaScript(script).catch(err => {
          sendDebugLog('error', 'browser_write: Script execution failed', { error: String(err), script: script.slice(0, 500) + '...' });
          throw err;
        });

        if (!scriptResult.success) {
          sendDebugLog('warning', `browser_write: Element search failed: ${scriptResult.error}`, { selector, index });
          return JSON.stringify(scriptResult);
        }

        const { x, y } = scriptResult;

        // 1. Move to element
        contents.sendInputEvent({ type: 'mouseMove', x, y });
        await new Promise(r => setTimeout(r, isTurbo ? 20 : 100));

        // 2. Click to focus
        contents.sendInputEvent({ type: 'mouseDown', x, y, button: 'left', clickCount: 1 });
        await new Promise(r => setTimeout(r, isTurbo ? 10 : 50));
        contents.sendInputEvent({ type: 'mouseUp', x, y, button: 'left', clickCount: 1 });
        await new Promise(r => setTimeout(r, isTurbo ? 50 : 200));

        // 3. Clear existing text (Native Select All + Backspace)
        const isMac = process.platform === 'darwin';
        const modifier = isMac ? 'meta' : 'control';
        contents.sendInputEvent({ type: 'keyDown', keyCode: 'a', modifiers: [modifier] });
        await new Promise(r => setTimeout(r, isTurbo ? 10 : 30));
        contents.sendInputEvent({ type: 'keyUp', keyCode: 'a', modifiers: [modifier] });
        await new Promise(r => setTimeout(r, isTurbo ? 10 : 30));
        contents.sendInputEvent({ type: 'keyDown', keyCode: 'Backspace' });
        await new Promise(r => setTimeout(r, isTurbo ? 10 : 30));
        contents.sendInputEvent({ type: 'keyUp', keyCode: 'Backspace' });
        await new Promise(r => setTimeout(r, isTurbo ? 20 : 100));

        // 4. Human-like Typing
        try {
          // Escape backslashes in text for JSON stringify safety in script injection
          const safeText = JSON.stringify(text);
          await contents.executeJavaScript(`window.typeHumanly(${safeText})`);
        } catch (typeErr) {
          sendDebugLog('warning', 'TypeHumanly failed, falling back to insertText', { error: String(typeErr) });
          contents.insertText(text);
        }

        // 5. Ensure site registers the input (Crucial for React/Lexical editors)
        try {
          await contents.executeJavaScript(`
            (function() {
              const el = document.activeElement;
              if (el) {
                el.dispatchEvent(new Event('input', { bubbles: true }));
                el.dispatchEvent(new Event('change', { bubbles: true }));
              }
            })()
          `);
        } catch (jsError) {
          sendDebugLog('warning', 'browser_write: Post-write event dispatch failed', { error: String(jsError) });
        }

        // 6. Press Enter if requested
        if (enter) {
          await new Promise(r => setTimeout(r, 200));
          const submitModifier = process.platform === 'darwin' ? 'meta' : 'control';

          // Try standard Enter first (for regular inputs)
          contents.sendInputEvent({ type: 'keyDown', keyCode: 'Enter' });
          await new Promise(r => setTimeout(r, 30));
          contents.sendInputEvent({ type: 'keyUp', keyCode: 'Enter' });

          // Also try Cmd/Ctrl + Enter (common submit shortcut for multiline editors like LinkedIn/X)
          await new Promise(r => setTimeout(r, 100));
          contents.sendInputEvent({ type: 'keyDown', keyCode: 'Enter', modifiers: [submitModifier] });
          await new Promise(r => setTimeout(r, 30));
          contents.sendInputEvent({ type: 'keyUp', keyCode: 'Enter', modifiers: [submitModifier] });
        }

        return JSON.stringify({ success: true, message: `Successfully wrote into ${selector}${enter ? ' and pressed Enter' : ''}` });
      } catch (error) {
        sendDebugLog('error', `browser_write: unexpected failure`, { error: String(error), stack: error instanceof Error ? error.stack : undefined });
        return JSON.stringify({
          success: false,
          error: 'Browser write error: ' + String(error),
        });
      }
    },
  });

  const scrollTool = new DynamicStructuredTool({
    name: 'browser_scroll',
    description: 'Scroll the page up or down. Automatically detects scrollable areas if the main window is not scrollable (common in complex single-page applications).',
    schema: z.object({
      direction: z.enum(['up', 'down']).describe('Direction to scroll'),
      amount: z.number().describe('Amount to scroll in pixels (e.g., 500)'),
      behavior: z.enum(['auto', 'smooth']).optional().describe('Scroll behavior. Smooth is recommended for user feedback.'),
    }),
    func: async ({ direction, amount, behavior = 'smooth' }) => {
      try {
        await ensureSpeedMultiplier(getSpeed);
        const contents = await getContents();
        const scrollAmount = direction === 'down' ? amount : -amount;

        const result = await contents.executeJavaScript(`
          (async function() {
            try {
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
            } catch (err) {
              return {
                success: false,
                error: err.name + ': ' + (err.message || String(err)),
                details: 'Inner script failure during scroll operation.',
                stack: err.stack
              };
            }
          })()
        `);

        // Wait significantly for the animation to be visible
        const speed = getSpeed ? getSpeed() : 'normal';
        const isTurbo = speed === 'fast';
        const waitTime = behavior === 'smooth' ? (isTurbo ? 400 : 1200) : (isTurbo ? 100 : 400);
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
        const contents = await getContents();
        const result = await contents.executeJavaScript(`
          (function() {
            try {
              const elements = [];
              const vWidth = window.innerWidth;
              const vHeight = window.innerHeight;
              
              function isVisible(el) {
                  if (!el) return false;
                  try {
                    const rect = el.getBoundingClientRect();
                    if (rect.width === 0 && rect.height === 0) return false;
                    
                    if (${only_visible !== false}) {
                        const buffer = 200;
                        if (rect.bottom < -buffer || rect.top > vHeight + buffer || rect.right < -buffer || rect.left > vWidth + buffer) return false;
                    }
  
                    const style = window.getComputedStyle(el);
                    if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') return false;
                    
                    if (el.getAttribute('aria-hidden') === 'true') return false;
                    return true;
                  } catch (e) { return false; }
              }
  
              const selector = 'button, a, input, textarea, select, summary, [role], [data-testid], [tabindex]:not([tabindex="-1"]), [contenteditable], [onclick], iframe';
              
              function collect(root, ox = 0, oy = 0) {
                  const candidates = root.querySelectorAll(selector);
                  candidates.forEach(node => {
                      try {
                        const role = node.getAttribute('role');
                        const tag = node.tagName.toLowerCase();
                        const isIframe = tag === 'iframe';
                        
                        let isActuallyInteractive = 
                            ['BUTTON', 'A', 'INPUT', 'TEXTAREA', 'SELECT', 'SUMMARY'].includes(node.tagName) ||
                            ['button', 'link', 'checkbox', 'menuitem', 'option', 'tab', 'switch', 'textbox', 'combobox', 'searchbox', 'listbox'].includes(role) ||
                            node.hasAttribute('onclick') ||
                            node.hasAttribute('contenteditable');
    
                        const rect = node.getBoundingClientRect();
                        const testId = node.getAttribute('data-testid');
                        let ariaLabel = node.getAttribute('aria-label');
    
                        if (!ariaLabel && node.getAttribute('aria-labelledby')) {
                            try {
                              const ids = node.getAttribute('aria-labelledby').split(/\\s+/);
                              ariaLabel = ids.map(id => {
                                  if (!id) return null;
                                  const found = root.getElementById ? root.getElementById(id) : root.querySelector('[id="' + id.replace(/"/g, '\\\\"') + '"]');
                                  return found ? found.innerText : null;
                              }).filter(Boolean).join(' ');
                            } catch (e) {}
                        }
                        const title = node.getAttribute('title');
                        const placeholder = node.getAttribute('placeholder') || node.getAttribute('aria-placeholder');
                        const innerText = node.innerText?.trim();
                        const value = node.value?.trim();
                        const href = node.getAttribute('href');
    
                        let name = ariaLabel || testId || title || placeholder || innerText || '';
    
                        if (isIframe && (node.src?.includes('recaptcha') || node.name?.includes('recaptcha'))) {
                            isActuallyInteractive = true;
                            if (rect.width > 200 && rect.width < 400 && rect.height < 100) {
                                 node.__REAVION_CUSTOM_POS__ = { 
                                     x: Math.round(ox + rect.left + 28), 
                                     y: Math.round(oy + rect.top + 39) 
                                 };
                                 name = 'reCAPTCHA checkbox';
                            }
                        }
    
                        if (isActuallyInteractive && isVisible(node)) {
                            const i = elements.length;
                            
                            if (isIframe && !name) {
                                name = 'reCAPTCHA Challenge Container';
                            }
    
                            if (!name && (tag === 'input' || tag === 'textarea' || tag === 'select') && node.id) {
                                try {
                                  const labelEl = root.querySelector('label[for="' + node.id.replace(/"/g, '\\\\"') + '"]');
                                  if (labelEl) name = labelEl.innerText;
                                } catch (e) {}
                            }
    
                            if (!name) {
                                const icon = node.querySelector('svg, i, img');
                                if (icon) {
                                    name = icon.getAttribute('aria-label') || icon.getAttribute('title') || icon.getAttribute('alt') || icon.querySelector('title')?.innerText || '';
                                }
                            }
    
                            name = name.replace(/\\s+/g, ' ').trim().slice(0, 80);
                            let description = (innerText && name !== innerText) ? innerText.replace(/\\s+/g, ' ').trim().slice(0, 120) : undefined;
                            if (description && (description.length < 2 || description === name)) description = undefined;
                            
                            const state = [];
                            if (node.getAttribute('aria-expanded') === 'true') state.push('expanded');
                            const ariaSelected = node.getAttribute('aria-selected') === 'true';
                            const hasActiveClass = node.classList.contains('active') || node.classList.contains('selected');
                            
                            if (ariaSelected || hasActiveClass) state.push('selected');
                            if (node.disabled) state.push('disabled');
                            if (node.checked) state.push('checked');
    
                            node.setAttribute('data-reavion-id', i.toString());
    
                            let suggested = '';
                            if (testId) suggested = '[data-testid="' + testId + '"]';
                            else if (ariaLabel && ariaLabel.length < 50) suggested = 'aria/' + ariaLabel;
                            else if (node.id && !node.id.match(/^ember\\d+/i) && !node.id.match(/^[a-z0-9]{8,}$/)) suggested = '#' + node.id;
                            else if (name && name.length < 50 && (tag === 'button' || tag === 'a' || role === 'button' || role === 'link')) suggested = 'text/' + name;
                            else suggested = 'id/' + i; 
    
                            elements.push({
                                _ref: i,
                                suggestedSelector: suggested || undefined,
                                role: role || tag,
                                name: name || (tag === 'button' ? 'Unlabeled button' : tag === 'a' ? 'Unlabeled link' : undefined),
                                description: description,
                                ariaLabel: ariaLabel || undefined,
                                placeholder: placeholder || undefined,
                                testId: testId || undefined,
                                nodeId: node.id || undefined,
                                nameAttr: node.getAttribute('name') || undefined,
                                value: (tag === 'input' || tag === 'textarea') ? value : undefined,
                                href: (tag === 'a') ? href : undefined,
                                pos: node.__REAVION_CUSTOM_POS__ || { 
                                    x: Math.round(ox + rect.left + rect.width / 2), 
                                    y: Math.round(oy + rect.top + rect.height / 2) 
                                },
                                state: state.length > 0 ? state.join(', ') : undefined
                            });
                        }
                      } catch (nodeErr) {}
                  });
  
                  const walker = document.createTreeWalker(root, 1, function(node) { 
                      try { return (node.shadowRoot || (node.tagName === 'IFRAME' && node.contentDocument)) ? 1 : 3; } catch(e) { return 3; }
                  });
                  let host;
                  while (host = walker.nextNode()) {
                      if (host.shadowRoot) collect(host.shadowRoot, ox, oy);
                      try {
                          if (host.tagName === 'IFRAME' && host.contentDocument) {
                              const iRect = host.getBoundingClientRect();
                              collect(host.contentDocument, ox + iRect.left, oy + iRect.top);
                          }
                      } catch(e) {}
                  }
              }
  
              collect(document);
  
              return { 
                  url: window.location.href, 
                  title: document.title, 
                  viewport: { width: vWidth, height: vHeight },
                  elements: elements.slice(0, 1500) 
              };
            } catch (err) {
              return { error: err.message, stack: err.stack };
            }
          })()
        `);

        if (result && result.error) {
          sendDebugLog('error', 'browser_dom_snapshot: Inner script failure', { error: result.error, stack: result.stack });
          return JSON.stringify({ success: false, error: result.error });
        }

        return JSON.stringify({ success: true, snapshot: result });
      } catch (error) {
        sendDebugLog('error', 'browser_dom_snapshot: Tool failure', { error: String(error) });
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
        const contents = await getContents();
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
      const contents = await getContents();

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
        const contents = await getContents();
        const logic = `
          await window.movePointer(${x}, ${y});
          const speedFactor = window.__REAVION_SPEED_MULTIPLIER__ || 1.0;
          await window.wait(Math.max(50, 500 * speedFactor)); 
          window.showVisualClick(${x}, ${y});
          return { success: true };
        `;
        const result = await contents.executeJavaScript(buildTaskScript(logic));
        if (!result || !result.success) {
          return JSON.stringify({ success: false, error: result?.error || 'Script injection failed' });
        }
        // contents.focus(); // REMOVED: Prevent stealing OS focus during background automation
        const roundedX = Math.round(x);
        const roundedY = Math.round(y);

        const speed = getSpeed ? getSpeed() : 'normal';
        const isTurbo = speed === 'fast';

        contents.sendInputEvent({ type: 'mouseMove', x: roundedX, y: roundedY });
        await new Promise(r => setTimeout(r, isTurbo ? 10 : 50));
        contents.sendInputEvent({ type: 'mouseDown', x: roundedX, y: roundedY, button: 'left', clickCount: 1 });
        await new Promise(r => setTimeout(r, isTurbo ? 10 : 50));
        contents.sendInputEvent({ type: 'mouseUp', x: roundedX, y: roundedY, button: 'left', clickCount: 1 });
        return JSON.stringify({ success: true, message: `Clicked at ${roundedX},${roundedY}` });
      } catch (error) {
        sendDebugLog('error', 'browser_click_coordinates: Tool failure', { error: String(error) });
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
      const contents = await getContents();
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
                    .slice(0, 30);
                return sections;
            }

            // 2. Extract key visual headlines
            function getHeadlines() {
                return Array.from(document.querySelectorAll('h1, h2, h3, [role="heading"]'))
                    .filter(el => {
                        const rect = el.getBoundingClientRect();
                        const buffer = 200;
                        return rect.top >= -buffer && rect.top <= vHeight + buffer;
                    })
                    .map(h => h.innerText.replace(/\\s+/g, ' ').trim())
                    .filter(Boolean)
                    .slice(0, 50);
            }

            // 3. Extract text "story"
            const bodyText = document.body.innerText.split('\\n')
                .filter(line => line.trim().length > 30)
                .slice(0, 40)
                .join('\\n');

            // 4. Extract Pagination & Next Button
            function getPagination() {
                const navs = Array.from(document.querySelectorAll('nav, [role="navigation"], #navcnt, #foot, .pagination, #pnnext, [aria-label*="Next"], [aria-label*="Próx"]'));
                const paginationText = navs.map(n => (n.innerText || n.getAttribute('aria-label') || '').replace(/\s+/g, ' ').trim()).join(' | ');
                
                // Specifically look for a "Next" link/button
                const nextLink = document.querySelector('#pnnext, [aria-label*="Next page"], [aria-label="Next"], [aria-label*="Próxima"], a.pn, a#pnnext');
                let nextSelector = null;
                if (nextLink) {
                    nextSelector = nextLink.id ? '#' + nextLink.id : (nextLink.getAttribute('aria-label') ? 'aria/' + nextLink.getAttribute('aria-label') : 'text/Próxima');
                } else {
                    // Fallback to text search for "Próxima" or "Next"
                    const possibleNext = Array.from(document.querySelectorAll('a, span, button')).find(el => {
                        const t = (el.innerText || '').toLowerCase();
                        return t === 'próxima' || t === 'next' || t === 'próxima >' || t === 'next >';
                    });
                    if (possibleNext) nextSelector = 'text/' + possibleNext.innerText.trim();
                }

                return {
                    summary: paginationText.slice(0, 300),
                    hasMore: !!nextLink || paginationText.toLowerCase().includes('next') || paginationText.toLowerCase().includes('próx'),
                    nextSelectorHint: nextSelector
                };
            }

            // 5. Extract Search Results (Generic)
            function getSearchResults() {
                const selectors = ['div.g', 'div.MjjYud', 'div[data-sokp]', 'div.result', 'article', '.search-result', '.yuRUbf'];
                let bestResults = [];
                let maxCount = 0;

                for (const s of selectors) {
                    const found = document.querySelectorAll(s);
                    if (found.length > 0) {
                        const results = [];
                        found.forEach(el => {
                            const titleEl = el.querySelector('h3') || el.querySelector('h1, h2') || el.querySelector('a');
                            const linkEl = el.querySelector('a') || el;
                            if (titleEl) {
                                const title = titleEl.innerText.replace(/\s+/g, ' ').trim();
                                const url = linkEl.getAttribute('href') || '';
                                if (title && url && !url.startsWith('#')) {
                                    const snippet = el.innerText.replace(title, '').replace(/\s+/g, ' ').trim().slice(0, 300);
                                    results.push({ title, url, snippet });
                                }
                            }
                        });
                        
                        if (results.length > maxCount) {
                            maxCount = results.length;
                            bestResults = results;
                        }
                    }
                }
                return bestResults.slice(0, 25);
            }

            return {
                title: document.title,
                url: window.location.href,
                isSearchPage: window.location.href.includes('google.com/search') || window.location.href.includes('bing.com') || window.location.href.includes('search'),
                viewport: { width: vWidth, height: vHeight },
                semantics: getSemantics(),
                headlines: getHeadlines(),
                searchResults: getSearchResults(),
                pagination: getPagination(),
                storySummary: bodyText
            };
          })()
        `);
        return JSON.stringify({ success: true, ...result });
      } catch (e) {
        sendDebugLog('error', 'browser_extract: Unexpected failure', { error: String(e) });
        return JSON.stringify({ success: false, error: String(e) });
      }
    }
  });

  const moveTool = new DynamicStructuredTool({
    name: 'browser_move',
    description: 'Move the mouse pointer to an element. Useful for triggering hover effects or preparing for a click.',
    schema: z.object({
      selector: z.string().describe('CSS selector, ARIA label, or numeric ID'),
      index: z.number().optional().default(0).describe('0-based index if multiple elements match'),
    }),
    func: async ({ selector, index = 0 }) => {
      try {
        const contents = await getContents();
        await ensureSpeedMultiplier(getSpeed);
        const logic = `
          const selectorStr = ${JSON.stringify(selector)};
          const element = window.findAnyElement(selectorStr, ${index});
          if (!element) return { success: false, error: 'Element not found: ' + selectorStr };
          const isTurbo = (window.__REAVION_SPEED_MULTIPLIER__ || 1.0) < 0.3;
          element.scrollIntoView({ behavior: isTurbo ? 'auto' : 'smooth', block: 'center', inline: 'center' });
          await window.wait(isTurbo ? 50 : 200);
          const rect = element.getBoundingClientRect();
          const x = Math.round(rect.left + rect.width / 2);
          const y = Math.round(rect.top + rect.height / 2);
          
          await window.movePointer(x, y);
          
          return { success: true, x, y };
        `;
        const scriptResult = await contents.executeJavaScript(buildTaskScript(logic));

        if (scriptResult.success) {
          contents.sendInputEvent({ type: 'mouseMove', x: scriptResult.x, y: scriptResult.y });
        } else {
          sendDebugLog('warning', `browser_move: Element not found: ${selector}`, { index });
        }
        return JSON.stringify(scriptResult);
      } catch (error) {
        sendDebugLog('error', 'browser_move: Unexpected failure', { error: String(error) });
        return JSON.stringify({ success: false, error: String(error) });
      }
    }
  });

  return [
    navigateTool,
    clickTool,
    writeTool,
    scrollTool,
    snapshotTool,
    screenshotTool,
    waitTool,
    new DynamicStructuredTool({
      name: 'browser_wait_for_selector',
      description: 'Wait for a specific element (CSS selector or numeric ID) to appear in the browser. Useful for handling dynamic page loads.',
      schema: z.object({
        selector: z.string().describe('CSS selector or numeric ID to wait for'),
        timeout: z.number().optional().default(5000).describe('Max time to wait in ms')
      }),
      func: async ({ selector, timeout = 5000 }) => {
        try {
          const contents = await getContents();
          const logic = `
            const selectorStr = ${JSON.stringify(selector)};
            const startTime = Date.now();
            const speedFactor = window.__REAVION_SPEED_MULTIPLIER__ || 1.0;
            const checkInterval = Math.max(50, 300 * speedFactor);
            while (Date.now() - startTime < ${timeout}) {
              if (window.findAnyElement(selectorStr)) return { success: true };
              await window.wait(checkInterval);
            }
            return { success: false, error: 'Timeout waiting for ' + selectorStr };
          `;
          const result = await contents.executeJavaScript(buildTaskScript(logic));
          if (!result.success) sendDebugLog('warning', `browser_wait_for_selector: ${result.error}`, { selector, timeout });
          return JSON.stringify(result);
        } catch (error) {
          sendDebugLog('error', 'browser_wait_for_selector: Tool failure', { error: String(error) });
          return JSON.stringify({ success: false, error: String(error) });
        }
      }
    }),
    clickAtCoordinatesTool,
    getPageContentTool,
    moveTool,


    // --- MARK PAGE TOOL (MOVED & IMPROVED BELOW) ---

    // --- ADVANCED INTROSPECTION TOOLS ---


    ...createSiteTools({
      getContents,
      getSpeed: (options?.getSpeed || (() => 'normal')),
      workspaceId: options?.workspaceId,
      getAccessToken: options?.getAccessToken
    }),
  ];
}
