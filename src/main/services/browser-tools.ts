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
    contents.executeJavaScript('window.__REAVION_RECORDER_ACTIVE__ = false;').catch(() => { });
  }
}

export async function startInspector(tabId: string, initiator?: Electron.WebContents) {
  inspectorTabs.add(tabId);
  if (initiator) {
    inspectorInitiators.set(tabId, initiator);
  }
  const contents = getWebviewContents(tabId);
  if (contents) {
    try {
      await contents.executeJavaScript(INSPECTOR_SCRIPT);
    } catch (e) {
      console.error('Failed to inject inspector script:', e);
    }
  }
}

export function stopInspector(tabId: string) {
  inspectorTabs.delete(tabId);
  inspectorInitiators.delete(tabId);
  const contents = getWebviewContents(tabId);
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

    // Inject high-visibility CSS cursor (Black with white border)
    contents.insertCSS(`
      * {
        cursor: url("data:image/svg+xml,%3Csvg width='24' height='24' viewBox='0 0 24 24' fill='none' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M4.5 2L10.5 18.5L13.125 11.375L20.25 8.75L4.5 2Z' fill='%23000000' stroke='white' stroke-width='2' stroke-linejoin='round'/%3E%3C/svg%3E") 0 0, auto !important;
      }
      a, button, [role="button"], input, textarea, select {
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

export function getWebviewContents(tabId: string): Electron.WebContents | undefined {
  return webviewContents.get(tabId);
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
       // Simple timeout for generic tools
       setTimeout(resolve, adjustedMs);
    });
  };

  window.ensurePointer = () => {
    let host = document.getElementById('reavion-pointer-host');
    if (!host) {
      host = document.createElement('div');
      host.id = 'reavion-pointer-host';
      host.style.cssText = 'position:fixed;top:0;left:0;width:100vw;height:100vh;z-index:2147483647;pointer-events:none;';
      const shadow = host.attachShadow({ mode: 'open' });
      const style = document.createElement('style');
      style.textContent = 
        '.pointer { ' +
          'position: fixed; ' +
          'z-index: 2147483647; ' +
          'pointer-events: none; ' +
          'filter: drop-shadow(0 4px 12px rgba(0,0,0,0.4)); ' +
          'transition: transform 0.1s ease; ' +
          'width: 32px; height: 32px; ' +
          'display: block !important; ' +
          'visibility: visible !important; ' +
          'opacity: 1 !important; ' +
          'will-change: top, left; ' +
        '} ' +
        '.click-ripple { ' +
          'position: fixed; ' +
          'width: 30px; height: 30px; ' +
          'border: 2px solid #000; ' +
          'border-radius: 50%; ' +
          'pointer-events: none; ' +
          'z-index: 2147483646; ' +
          'transition: all 0.4s ease-out; ' +
          'opacity: 1; ' +
        '}';
      shadow.appendChild(style);
      document.documentElement.appendChild(host);
    }
    if (host.parentElement !== document.documentElement) document.documentElement.appendChild(host);
    return host.shadowRoot;
  };

  window.movePointer = (targetX, targetY) => {
    const root = window.ensurePointer();
    let p = root.querySelector('.pointer');
    if (!p) {
      p = document.createElement('div');
      p.className = 'pointer';
      p.innerHTML = '<svg width="32" height="32" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M0 0L8 22L11.5 12.5L21 9L0 0Z" fill="#000000" stroke="#ffffff" stroke-width="1.5"/></svg>';
      root.appendChild(p);
      p.style.left = (window.__LAST_MOUSE_POS__.x || 0) + 'px';
      p.style.top = (window.__LAST_MOUSE_POS__.y || 0) + 'px';
    }

    const start = { ...window.__LAST_MOUSE_POS__ };
    const end = { x: targetX, y: targetY };
    
    // Tiny distance check
    const dist = Math.sqrt(Math.pow(end.x - start.x, 2) + Math.pow(end.y - start.y, 2));
    if (dist < 10) {
        p.style.left = end.x + 'px';
        p.style.top = end.y + 'px';
        window.__LAST_MOUSE_POS__ = end;
        return Promise.resolve();
    }

    const { cp1, cp2 } = window.generateControlPoints(start, end);
    const multiplier = window.__REAVION_SPEED_MULTIPLIER__ || 1.0;
    const baseDuration = Math.min(Math.max(dist * 0.8, 300), 1200) * multiplier;
    const duration = baseDuration * (0.8 + Math.random() * 0.4);

    const startTime = performance.now();

    return new Promise(resolve => {
        const animate = (now) => {
            const elapsed = now - startTime;
            const progress = Math.min(elapsed / duration, 1);
            const ease = Math.sin((progress * Math.PI) / 2);

            const x = window.cubicBezier(ease, start.x, cp1.x, cp2.x, end.x);
            const y = window.cubicBezier(ease, start.y, cp1.y, cp2.y, end.y);

            p.style.left = x + 'px';
            p.style.top = y + 'px';

            try {
               const evt = new MouseEvent('mousemove', {
                   view: window,
                   bubbles: true,
                   cancelable: true,
                   clientX: x,
                   clientY: y,
                   screenX: x + window.screenX, 
                   screenY: y + window.screenY
               });
               document.elementFromPoint(x, y)?.dispatchEvent(evt);
            } catch(e) {}

            if (progress < 1) {
                requestAnimationFrame(animate);
            } else {
                window.__LAST_MOUSE_POS__ = end;
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
    r.style.left = (x - 15) + 'px';
    r.style.top = (y - 15) + 'px';
    root.appendChild(r);
    setTimeout(() => {
      r.style.transform = 'scale(2)';
      r.style.opacity = '0';
    }, 10);
    setTimeout(() => { if (r.parentNode) r.remove(); }, 400);
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
    clickable.scrollIntoView({ behavior: 'auto', block: 'center', inline: 'center' });
    await window.wait(400);
    
    const rect = clickable.getBoundingClientRect();
    const x = Math.round(rect.left + rect.width / 2);
    const y = Math.round(rect.top + rect.height / 2);
    
    await window.movePointer(x, y);
    await window.wait(100); 
    
    const finalRect = clickable.getBoundingClientRect();
    return { 
      x: Math.round(finalRect.left + finalRect.width / 2), 
      y: Math.round(finalRect.top + finalRect.height / 2), 
      element: clickable 
    };
  };

  window.querySelectorAllPierce = function(selector, root = document) {
    const results = [];
    const queue = [root];
    const visited = new Set();
    while (queue.length > 0) {
      const curr = queue.shift();
      if (!curr || visited.has(curr)) continue;
      visited.add(curr);
      try {
        const matches = curr.querySelectorAll(selector);
        for (let i = 0; i < matches.length; i++) {
          if (!results.includes(matches[i])) results.push(matches[i]);
        }
      } catch (e) {}
      const walker = document.createTreeWalker(curr, 1, function(n) { return n.shadowRoot ? 1 : 3; });
      let host;
      while (host = walker.nextNode()) if (host.shadowRoot) queue.push(host.shadowRoot);
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
    const queue = [document];
    const visited = new Set();
    
    // Breadth-first search to find candidates
    while (queue.length > 0) {
      const curr = queue.shift();
      if (!curr || visited.has(curr)) continue;
      visited.add(curr);
      
      const walker = document.createTreeWalker(curr, 1, null);
      let el;
      while (el = walker.nextNode()) {
        if (results.length > 100) break; // Limit candidate pool for specific search

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

        // Scoring Logic
        // 1. Exact matches (highest priority)
        if (attrs.aria === clean) score += 100;
        else if (attrs.placeholder === clean) score += 95;
        else if (attrs.itemprop === clean) score += 95; // Google specific
        else if (attrs.name === clean) score += 90;
        else if (attrs.testId === clean) score += 85;
        
        // 2. Starts with (high priority)
        else if (attrs.aria.startsWith(clean + ' ')) score += 60;
        else if (attrs.placeholder.startsWith(clean)) score += 55;
        else if (attrs.name.startsWith(clean)) score += 50;

        // 3. Contains (medium/low)
        else if (attrs.aria.includes(clean)) score += 30;
        else if (attrs.placeholder.includes(clean)) score += 25;
        else if (attrs.testId.includes(clean)) score += 20;
        else if (attrs.title.includes(clean)) score += 15;
        else if (attrs.alt.includes(clean)) score += 10;
        
        // 4. Role/Text fallbacks (lowest)
        // Only if we haven't found a strong attribute match
        if (score === 0) { 
             if (attrs.role === clean) score += 5;
             // Text match: risky, can match random content. Give it low score.
             // But if it's a button/link with exact text, bump it up.
             if (attrs.text === clean && (el.tagName === 'BUTTON' || el.tagName === 'A')) score += 40;
        }

        if (score > 0) {
           results.push({ el, score });
        }
      }
      
      const hosts = document.createTreeWalker(curr, 1, function(n) { return n.shadowRoot ? 1 : 3; });
      let h;
      while (h = hosts.nextNode()) queue.push(h.shadowRoot);
    }

    // Sort by score descending
    results.sort((a, b) => b.score - a.score);
    
    // Return the request index from the sorted list
    const match = results[index] || results[0];
    return match ? match.el : null;
  };

  window.findElementByText = (text, root = document) => {
    const clean = text.replace(/['"]/g, '').trim().toLowerCase();
    if (!clean) return null;
    const queue = [root];
    const visited = new Set();
    while (queue.length > 0) {
      const curr = queue.shift();
      if (!curr || visited.has(curr)) continue;
      visited.add(curr);
      const walker = document.createTreeWalker(curr, 4, null);
      let node;
      while (node = walker.nextNode()) {
        if (node.textContent.toLowerCase().includes(clean)) {
          const p = node.parentElement;
          if (p && p.offsetWidth > 0) return p;
        }
      }
      const hosts = document.createTreeWalker(curr, 1, function(n) { return n.shadowRoot ? 1 : 3; });
      let h;
      while (h = hosts.nextNode()) queue.push(h.shadowRoot);
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
    coreLogic + '\n' +
    '  } catch (err) {\n' +
    '    return { success: false, error: err.message || String(err), stack: err.stack };\n' +
    '  }\n' +
    '})()';
}

function getContents(): Electron.WebContents {
  const contents = webviewContents.get(TAB_ID);
  if (!contents || contents.isDestroyed()) {
    throw new Error('Browser not ready or has crashed. Please refresh or wait for the page to load.');
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
        if (contents.isDestroyed()) throw new Error('Browser crashed or closed');

        await ensureSpeedMultiplier(getSpeed);
        let targetUrl = url;
        if (!targetUrl.startsWith('http://') && !targetUrl.startsWith('https://')) {
          targetUrl = `https://${targetUrl}`;
        }

        sendDebugLog('info', `Navigating to: ${targetUrl}`);
        try {
          await contents.loadURL(targetUrl);
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

        if (contents.isDestroyed()) throw new Error('Browser closed after navigation');
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
      const contents = getContents();
      try {
        await ensureSpeedMultiplier(getSpeed);

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

        if (!scriptResult.success) {
          sendDebugLog('warning', `browser_click: Element search failed: ${scriptResult.error}`, { selector, index });
          return JSON.stringify(scriptResult);
        }

        const { x, y } = scriptResult;
        const roundedX = Math.round(x);
        const roundedY = Math.round(y);

        // Native click sequence
        contents.focus();
        contents.sendInputEvent({ type: 'mouseMove', x: roundedX, y: roundedY });
        await new Promise(r => setTimeout(r, 50));
        contents.sendInputEvent({ type: 'mouseDown', x: roundedX, y: roundedY, button: 'left', clickCount: 1 });
        await new Promise(r => setTimeout(r, 50));
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
      const contents = getContents();
      try {
        await ensureSpeedMultiplier(getSpeed);

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
        await new Promise(r => setTimeout(r, 100));

        // 2. Click to focus
        contents.sendInputEvent({ type: 'mouseDown', x, y, button: 'left', clickCount: 1 });
        await new Promise(r => setTimeout(r, 50));
        contents.sendInputEvent({ type: 'mouseUp', x, y, button: 'left', clickCount: 1 });
        await new Promise(r => setTimeout(r, 200));

        // 3. Clear existing text (Native Select All + Backspace)
        const isMac = process.platform === 'darwin';
        const modifier = isMac ? 'meta' : 'control';
        contents.sendInputEvent({ type: 'keyDown', keyCode: 'a', modifiers: [modifier] });
        await new Promise(r => setTimeout(r, 30));
        contents.sendInputEvent({ type: 'keyUp', keyCode: 'a', modifiers: [modifier] });
        await new Promise(r => setTimeout(r, 30));
        contents.sendInputEvent({ type: 'keyDown', keyCode: 'Backspace' });
        await new Promise(r => setTimeout(r, 30));
        contents.sendInputEvent({ type: 'keyUp', keyCode: 'Backspace' });
        await new Promise(r => setTimeout(r, 100));

        // 4. Native insert (Paste-like insertion)
        contents.insertText(text);

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
        const contents = getContents();
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
                
                // If it has visible children despite 0 size, we might want it, 
                // but usually the children will be caught anyway.
                if (rect.width === 0 && rect.height === 0) return false;
                
                if (${only_visible !== false}) {
                    const buffer = 200; // More focused buffer to avoid off-screen clutter
                    if (rect.bottom < -buffer || rect.top > vHeight + buffer || rect.right < -buffer || rect.left > vWidth + buffer) return false;
                }

                const style = window.getComputedStyle(el);
                if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') return false;
                
                if (el.getAttribute('aria-hidden') === 'true') return false;
                return true;
            }

            const selector = 'button, a, input, textarea, select, summary, [role], [data-testid], [tabindex]:not([tabindex="-1"]), [contenteditable], [onclick]';
            
            function collect(root) {
                const candidates = root.querySelectorAll(selector);
                candidates.forEach(node => {
                    const role = node.getAttribute('role');
                    const isActuallyInteractive = 
                        ['BUTTON', 'A', 'INPUT', 'TEXTAREA', 'SELECT', 'SUMMARY'].includes(node.tagName) ||
                        ['button', 'link', 'checkbox', 'menuitem', 'option', 'tab', 'switch', 'textbox', 'combobox', 'searchbox', 'listbox'].includes(role) ||
                        node.hasAttribute('onclick') ||
                        node.hasAttribute('contenteditable');

                    if (isActuallyInteractive && isVisible(node)) {
                        const i = elements.length;
                        const tag = node.tagName.toLowerCase();
                        const testId = node.getAttribute('data-testid');
                        
                        let ariaLabel = node.getAttribute('aria-label');
                        if (!ariaLabel && node.getAttribute('aria-labelledby')) {
                            const ids = node.getAttribute('aria-labelledby').split(' ');
                            ariaLabel = ids.map(id => document.getElementById(id)?.innerText).filter(Boolean).join(' ');
                        }

                        const title = node.getAttribute('title');
                        const placeholder = node.getAttribute('placeholder') || node.getAttribute('aria-placeholder');
                        const innerText = node.innerText?.trim();
                        const value = node.value?.trim();
                        const href = node.getAttribute('href');

                        let name = ariaLabel || testId || title || placeholder || innerText || '';
                        
                        if (!name && (tag === 'input' || tag === 'textarea' || tag === 'select') && node.id) {
                            const labelEl = document.querySelector('label[for="' + node.id + '"]');
                            if (labelEl) name = labelEl.innerText;
                        }

                        if (!name) {
                            // Deep icon search
                            const icon = node.querySelector('svg, i, img');
                            if (icon) {
                                name = icon.getAttribute('aria-label') || icon.getAttribute('title') || icon.getAttribute('alt') || icon.querySelector('title')?.innerText || '';
                            }
                        }

                        name = name.replace(/\\s+/g, ' ').trim().slice(0, 80);
                        let description = (innerText && name !== innerText) ? innerText.replace(/\\s+/g, ' ').trim().slice(0, 120) : undefined;
                        
                        // Filter out repetitive boilerplate
                        if (description && (description.length < 2 || description === name)) description = undefined;
                        
                        // Even if it has no name, we include it if it's a button/input/link as it's clearly interactive
                        const rect = node.getBoundingClientRect();
                        const state = [];
                        if (node.getAttribute('aria-expanded') === 'true') state.push('expanded');
                        if (node.getAttribute('aria-selected') === 'true' || node.classList.contains('active')) state.push('selected');
                        if (node.disabled) state.push('disabled');
                        if (node.checked) state.push('checked');

                        node.setAttribute('data-reavion-id', i.toString());

                        // Calculate the most robust selector
                        let suggested = '';
                        if (testId) suggested = '[data-testid="' + testId + '"]';
                        else if (ariaLabel && ariaLabel.length < 50) suggested = 'aria/' + ariaLabel;
                        else if (node.id && !node.id.match(/^ember\d+/i) && !node.id.match(/^[a-z0-9]{8,}$/)) suggested = '#' + node.id;
                        else if (name && name.length < 50 && (tag === 'button' || tag === 'a' || role === 'button' || role === 'link')) suggested = 'text/' + name;
                        else if (node.id) suggested = '#' + node.id; 
                        else if (tag === 'input' && node.getAttribute('name')) suggested = 'input[name="' + node.getAttribute('name') + '"]';
                        else if (tag === 'textarea' && node.getAttribute('name')) suggested = 'textarea[name="' + node.getAttribute('name') + '"]';
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
                            pos: { x: Math.round(rect.left + rect.width / 2), y: Math.round(rect.top + rect.height / 2) },
                            state: state.length > 0 ? state.join(', ') : undefined
                        });
                    }
                });

                // Traverse Shadow DOM
                const walker = document.createTreeWalker(root, 1, function(node) { return node.shadowRoot ? 1 : 3; });
                let host;
                while (host = walker.nextNode()) {
                    collect(host.shadowRoot);
                }
            }

            collect(document);

            return { 
                url: window.location.href, 
                title: document.title, 
                viewport: { width: vWidth, height: vHeight },
                elements: elements.slice(0, 1500) 
            };
          })()
        `);
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
        const logic = `
          window.movePointer(${x}, ${y});
          await window.wait(500); 
          window.showVisualClick(${x}, ${y});
          return { success: true };
        `;
        const result = await contents.executeJavaScript(buildTaskScript(logic));
        if (!result || !result.success) {
          return JSON.stringify({ success: false, error: result?.error || 'Script injection failed' });
        }
        contents.focus();
        const roundedX = Math.round(x);
        const roundedY = Math.round(y);

        contents.sendInputEvent({ type: 'mouseMove', x: roundedX, y: roundedY });
        await new Promise(r => setTimeout(r, 50));
        contents.sendInputEvent({ type: 'mouseDown', x: roundedX, y: roundedY, button: 'left', clickCount: 1 });
        await new Promise(r => setTimeout(r, 50));
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

            // 4. Extract Pagination
            function getPagination() {
                const navs = Array.from(document.querySelectorAll('nav, [role="navigation"], #navcnt, #foot, .pagination'));
                return navs.map(n => ({
                    role: n.getAttribute('role'),
                    id: n.id,
                    text: (n.innerText || '').replace(/\\s+/g, ' ').trim().slice(0, 200)
                })).filter(n => n.text.length > 0);
            }

            // 5. Extract Search Results (Generic)
            function getSearchResults() {
                const selectors = ['div.g', 'div.MjjYud', 'div[data-sokp]', 'div.result', 'article', '.search-result'];
                let bestResults = [];
                let maxCount = 0;

                for (const s of selectors) {
                    const found = document.querySelectorAll(s);
                    if (found.length > 0) {
                        const results = [];
                        found.forEach(el => {
                            const titleEl = el.querySelector('h3') || el.querySelector('h1, h2') || el.querySelector('a');
                            if (titleEl) {
                                const title = titleEl.innerText.replace(/\s+/g, ' ').trim();
                                if (title) {
                                    const snippet = el.innerText.replace(title, '').replace(/\s+/g, ' ').trim().slice(0, 300);
                                    results.push({ title, snippet });
                                }
                            }
                        });
                        
                        // Prioritize the selector that yields the most results
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
        const contents = getContents();
        await ensureSpeedMultiplier(getSpeed);
        const logic = `
          const selectorStr = ${JSON.stringify(selector)};
          const element = window.findAnyElement(selectorStr, ${index});
          if (!element) return { success: false, error: 'Element not found: ' + selectorStr };
          element.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' });
          await window.wait(200);
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
          const contents = getContents();
          const logic = `
            const selectorStr = ${JSON.stringify(selector)};
            const startTime = Date.now();
            while (Date.now() - startTime < ${timeout}) {
              if (window.findAnyElement(selectorStr)) return { success: true };
              await window.wait(300);
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
      workspaceId: options?.workspaceId
    }),
  ];
}
