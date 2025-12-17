import { webContents, BrowserWindow } from 'electron';
import { z } from 'zod';
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

export function registerWebviewContents(tabId: string, contents: Electron.WebContents) {
  webviewContents.set(tabId, contents);

  // Allow all navigation like a regular browser - no blocking
  // Just log for debugging purposes
  contents.on('will-navigate', (_event, url) => {
    console.log('Navigation to:', url);
  });
}

export function unregisterWebviewContents(tabId: string) {
  webviewContents.delete(tabId);
}

export function getWebviewContents(tabId: string): Electron.WebContents | undefined {
  return webviewContents.get(tabId);
}

const TAB_ID = 'main-tab';

function getContents(): Electron.WebContents {
  const contents = webviewContents.get(TAB_ID);
  if (!contents) {
    throw new Error('Browser not ready. Please wait for the page to load.');
  }
  return contents;
}

export function createBrowserTools(): DynamicStructuredTool[] {
  const navigateTool = new DynamicStructuredTool({
    name: 'browser_navigate',
    description: 'Navigate the browser to a specific URL. Use this to open websites. WARNING: Before navigating after completing an action (reply, post, like, etc.), you MUST take a browser snapshot first to verify the action completed successfully.',
    schema: z.object({
      url: z.string().describe('The URL to navigate to. Must include protocol (http:// or https://)'),
    }),
    func: async ({ url }) => {
      try {
        const contents = getContents();
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
    description: 'Click on an element in the browser using a CSS selector. Use index to select which element when multiple match (0-based).',
    schema: z.object({
      selector: z.string().describe('CSS selector for the element to click (e.g., "button.submit", "#login-btn", "[data-testid=\\"like\\"]")'),
      index: z.number().nullable().optional().describe('0-based index of element to click when multiple elements match the selector. Default is 0 (first match).'),
    }),
    func: async ({ selector, index }) => {
      const targetIndex = index ?? 0;
      try {
        const contents = getContents();

        const result = await contents.executeJavaScript(`
          (async function() {
            const host = window.location.hostname || '';
            const xDomain = host.includes('x.com') || host.includes('twitter.com');
            let element = null;
            const selectorStr = '${selector.replace(/'/g, "\\'")}';
            const targetIndex = ${targetIndex};
            
            // Helper function to handle :contains() pseudo-selector (jQuery-style)
            function querySelectorWithContains(root, sel) {
              const containsMatch = sel.match(/^(.+?):contains\\("([^"]+)"\\)$/);
              if (containsMatch) {
                const baseSelector = containsMatch[1];
                const textToFind = containsMatch[2];
                const candidates = root.querySelectorAll(baseSelector);
                for (const el of candidates) {
                  if (el.textContent && el.textContent.includes(textToFind)) {
                    return el;
                  }
                }
                return null;
              }
              // Standard selector
              try {
                return root.querySelector(sel);
              } catch (e) {
                console.error('Invalid selector:', sel, e);
                return null;
              }
            }
            
            function querySelectorAllWithContains(root, sel) {
              const containsMatch = sel.match(/^(.+?):contains\\("([^"]+)"\\)$/);
              if (containsMatch) {
                const baseSelector = containsMatch[1];
                const textToFind = containsMatch[2];
                const candidates = root.querySelectorAll(baseSelector);
                return Array.from(candidates).filter(el => el.textContent && el.textContent.includes(textToFind));
              }
              try {
                return Array.from(root.querySelectorAll(sel));
              } catch (e) {
                console.error('Invalid selector:', sel, e);
                return [];
              }
            }
            
            // Priority 1: Check inside active modal/dialog/overlay first
            const visibleModals = Array.from(document.querySelectorAll('[role="dialog"], [data-testid="modal"], [aria-modal="true"], .modal, .dialog'))
              .filter(m => {
                const style = window.getComputedStyle(m);
                return m.offsetParent !== null && style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0';
              });

            if (visibleModals.length > 0) {
              const topModal = visibleModals[visibleModals.length - 1];
              const modalMatches = querySelectorAllWithContains(topModal, selectorStr).filter(el => el.offsetParent !== null);
              if (modalMatches.length > targetIndex) {
                element = modalMatches[targetIndex];
                console.log('Found element inside active modal at index', targetIndex, ':', element);
              }
            }
            
            // Priority 2: Global search if not found in modal
            if (!element) {
              const matches = querySelectorAllWithContains(document, selectorStr).filter(el => el.offsetParent !== null);
              if (matches.length > targetIndex) {
                element = matches[targetIndex];
              } else if (matches.length > 0) {
                // If index is out of bounds, use the last available element
                element = matches[matches.length - 1];
                console.warn('Index', targetIndex, 'out of bounds, using last element at index', matches.length - 1);
              }
            }
            
            if (!element) return { success: false, error: 'Element not found: ${selector}' + (targetIndex > 0 ? ' at index ' + targetIndex : '') };
            
            // Scroll element into view so user can see the interaction
            element.scrollIntoView({ behavior: 'instant', block: 'center', inline: 'center' });
            
            // Brief wait for scroll to settle
            await new Promise(resolve => setTimeout(resolve, 100));
            
            // Get element position after scroll
            const rect = element.getBoundingClientRect();
            const x = rect.left + rect.width / 2;
            const y = rect.top + rect.height / 2;
            
            // Check what's at the center point
            const topElement = document.elementFromPoint(x, y);
            
            // Valid click if: element contains topElement, topElement contains element, 
            // they're the same, OR topElement is an ancestor (like a link wrapper)
            const isValidClick = topElement && (
              element.contains(topElement) || 
              topElement.contains(element) || 
              element === topElement ||
              // Also valid if the covering element is a common wrapper and our target is inside it
              (topElement.querySelector && querySelectorWithContains(topElement, selectorStr) === element)
            );
            
            if (!isValidClick && topElement) {
              // Check if our TARGET element is inside a modal - if so, it's valid to click
              const targetInModal = element.closest('[role="dialog"], [data-testid="modal"], .modal, [aria-modal="true"]');
              if (targetInModal) {
                // Element is inside modal, proceed with click
                console.log('Element is inside modal, proceeding with click');
              } else {
                // Check if a modal is blocking us from clicking a background element
                const coveringModal = topElement.closest('[role="dialog"], [data-testid="modal"], .modal');
                if (coveringModal) {
                   return { 
                     success: false, 
                     error: 'Element is obscured by a modal/dialog. Try finding the element INSIDE the modal.' 
                   };
                }
              }
              
              // For other occlusions, try clicking anyway
              console.warn('Element may be obscured by:', topElement.tagName, '- attempting click anyway');
            }
            
            // Show click indicator (get rect after scroll)
            // const rect = element.getBoundingClientRect(); // Already got this
            // const x = rect.left + rect.width / 2;
            // const y = rect.top + rect.height / 2;
            
            // Add animation styles if not exists
            if (!document.getElementById('navreach-click-styles')) {
              const style = document.createElement('style');
              style.id = 'navreach-click-styles';
              style.textContent = \`
                @keyframes navreachClickPulse { 
                  0% { opacity: 1; transform: translate(-50%, -50%) scale(0.5); } 
                  50% { opacity: 1; transform: translate(-50%, -50%) scale(1); }
                  100% { opacity: 0; transform: translate(-50%, -50%) scale(1.2); } 
                }
                @keyframes navreachRipple {
                  0% { transform: translate(-50%, -50%) scale(0); opacity: 0.6; }
                  100% { transform: translate(-50%, -50%) scale(3); opacity: 0; }
                }
              \`;
              document.head.appendChild(style);
            }
            
            // Create ripple effect
            const ripple = document.createElement('div');
            ripple.style.cssText = 'position:fixed;z-index:999998;pointer-events:none;width:40px;height:40px;border-radius:50%;background:rgba(139,92,246,0.3);animation:navreachRipple 0.8s ease-out forwards;';
            ripple.style.left = x + 'px';
            ripple.style.top = y + 'px';
            document.body.appendChild(ripple);
            setTimeout(() => ripple.remove(), 800);
            
            // Remove any existing pointer indicator
            const existingPointer = document.getElementById('navreach-pointer');
            if (existingPointer) existingPointer.remove();
            
            // Create pointer indicator that stays visible
            const indicator = document.createElement('div');
            indicator.id = 'navreach-pointer';
            
            // Liquid Glass Arrow SVG
            indicator.innerHTML = \`
              <svg width="32" height="32" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
                <filter id="glass-glow" x="-50%" y="-50%" width="200%" height="200%">
                  <feGaussianBlur in="SourceGraphic" stdDeviation="2" result="blur"/>
                  <feColorMatrix in="blur" mode="matrix" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 18 -7" result="goo"/>
                  <feComposite in="SourceGraphic" in2="goo" operator="atop"/>
                </filter>
                <filter id="glass-shadow" x="-20%" y="-20%" width="140%" height="140%">
                  <feDropShadow dx="0" dy="4" stdDeviation="4" flood-color="#000000" flood-opacity="0.4"/>
                </filter>
                
                <!-- Main Body with Glass Gradient -->
                <path d="M6 4L14 26L17.5 16.5L27 13L6 4Z" fill="url(#glass-gradient)" filter="url(#glass-shadow)" stroke="rgba(255,255,255,0.9)" stroke-width="1.5"/>
                
                <!-- Glossy Highlight -->
                <path d="M8 7L13 20L15.5 14.5L21 12L8 7Z" fill="url(#gloss-gradient)" opacity="0.7"/>
                
                <defs>
                  <linearGradient id="glass-gradient" x1="6" y1="4" x2="27" y2="26" gradientUnits="userSpaceOnUse">
                    <stop offset="0%" stop-color="rgba(80, 80, 80, 0.95)"/>
                    <stop offset="50%" stop-color="rgba(40, 40, 40, 0.95)"/>
                    <stop offset="100%" stop-color="rgba(10, 10, 10, 0.95)"/>
                  </linearGradient>
                  <linearGradient id="gloss-gradient" x1="8" y1="7" x2="18" y2="18" gradientUnits="userSpaceOnUse">
                    <stop offset="0%" stop-color="rgba(255, 255, 255, 0.9)"/>
                    <stop offset="100%" stop-color="rgba(255, 255, 255, 0.1)"/>
                  </linearGradient>
                </defs>
              </svg>
            \`;
            
            // Add float animation for that "liquid" feel
            if (!document.getElementById('navreach-float-anim')) {
              const style = document.createElement('style');
              style.id = 'navreach-float-anim';
              style.textContent = \`
                @keyframes navreachFloat {
                  0%, 100% { transform: translateY(0px); }
                  50% { transform: translateY(-3px); }
                }
              \`;
              document.head.appendChild(style);
            }

            indicator.style.cssText = 'position:fixed;z-index:999999;pointer-events:none;transition:left 0.4s cubic-bezier(0.22, 1, 0.36, 1), top 0.4s cubic-bezier(0.22, 1, 0.36, 1);animation: navreachFloat 3s ease-in-out infinite;filter: drop-shadow(0 4px 12px rgba(139, 92, 246, 0.4));';
            indicator.style.left = x + 'px';
            indicator.style.top = y + 'px';
            document.body.appendChild(indicator);
            
            // Dispatch full sequence of events for maximum compatibility
            const eventOptions = { 
              bubbles: true, 
              cancelable: true, 
              view: window,
              clientX: x,
              clientY: y,
              screenX: x, // Approximate
              screenY: y, // Approximate
              buttons: 1, // Left click
              pointerId: 1,
              isPrimary: true
            };
            
            // 1. Move to element
            element.dispatchEvent(new MouseEvent('mousemove', eventOptions));
            element.dispatchEvent(new MouseEvent('mouseover', eventOptions));
            
            // 2. Pointer down sequence
            element.dispatchEvent(new PointerEvent('pointerdown', eventOptions));
            element.dispatchEvent(new MouseEvent('mousedown', eventOptions));
            
            // 3. Focus (if focusable)
            element.focus();
            
            // 4. Pointer up sequence
            element.dispatchEvent(new PointerEvent('pointerup', eventOptions));
            element.dispatchEvent(new MouseEvent('mouseup', eventOptions));
            
            // 5. Click
            element.dispatchEvent(new MouseEvent('click', eventOptions));
            
            // Also trigger native click (safe now that we block navigation at webview level)
            // This ensures buttons that rely on native activation behavior work
            if (!element.disabled) {
              element.click();
            } else {
              console.warn('Attempted to click disabled element:', selector);
            }
            
            // Wait for any UI updates (modal opening, etc.)
            await new Promise(resolve => setTimeout(resolve, 500));
            
            return { success: true, message: 'Clicked element: ${selector}', domainWarning: xDomain ? 'You are on X/Twitter. Prefer the dedicated x_like/x_reply/x_follow/x_post tools before generic clicks. Use browser_click/browser_click_coordinates only if the x_ tool you need has already failed.' : null };
          })()
        `);

        // Auto-capture snapshot after click to show agent the result
        await new Promise(resolve => setTimeout(resolve, 1000));
        const snapshot = await contents.executeJavaScript(`
          (function() {
            const elements = [];
            function isVisible(el) {
              const rect = el.getBoundingClientRect();
              if (rect.width === 0 || rect.height === 0) return false;
              const style = window.getComputedStyle(el);
              return style.display !== 'none' && style.visibility !== 'hidden';
            }
            
            document.querySelectorAll('[data-testid]').forEach((el) => {
              if (!isVisible(el)) return;
              const testId = el.getAttribute('data-testid');
              const ariaLabel = el.getAttribute('aria-label') || '';
              elements.push({ testId, label: ariaLabel.slice(0, 60), selector: '[data-testid="' + testId + '"]' });
            });
            
            const modals = document.querySelectorAll('[role="dialog"], [aria-modal="true"], [data-testid="sheetDialog"]');
            const hasModal = modals.length > 0;
            
            const grouped = {
              reply: elements.filter(e => e.testId === 'reply').length,
              like: elements.filter(e => e.testId === 'like').length,
              tweetButton: elements.filter(e => e.testId === 'tweetButton').length,
              tweetTextarea: elements.filter(e => e.testId?.includes('tweetTextarea')).length,
            };
            
            return { url: window.location.href, hasModal, counts: grouped, elements: elements.slice(0, 50) };
          })()
        `);

        // Format snapshot for agent
        let snapshotText = `\n\n--- PAGE STATE AFTER CLICK ---\nURL: ${snapshot.url}\nModal Open: ${snapshot.hasModal}\n`;
        snapshotText += `Elements: Reply(${snapshot.counts.reply}) Like(${snapshot.counts.like}) TweetButton(${snapshot.counts.tweetButton}) TextInput(${snapshot.counts.tweetTextarea})\n`;
        if (snapshot.hasModal) {
          snapshotText += `\nMODAL IS OPEN - Look for tweetTextarea_0 to type and tweetButton to submit\n`;
        }
        snapshotText += `\nKey elements:\n`;
        snapshot.elements.slice(0, 20).forEach((el: any, i: number) => {
          if (el.label || ['reply', 'like', 'tweetButton', 'tweetTextarea_0', 'tweetTextarea_0RichTextInputContainer'].includes(el.testId)) {
            snapshotText += `  [${i}] ${el.testId} - "${el.label}" -> ${el.selector}\n`;
          }
        });

        return JSON.stringify({
          success: result.success,
          message: result.message,
          pageState: snapshotText,
          domainWarning: result.domainWarning,
        });
      } catch (error) {
        return JSON.stringify({ success: false, error: String(error) });
      }
    },
  });

  const typeTool = new DynamicStructuredTool({
    name: 'browser_type',
    description: 'Type text into an input field in the browser. Will automatically click and focus the element first.',
    schema: z.object({
      selector: z.string().describe('CSS selector for the input element'),
      text: z.string().describe('The text to type into the input'),
    }),
    func: async ({ selector, text }) => {
      try {
        const contents = getContents();
        const result = await contents.executeJavaScript(`
          (async function() {
            let element = null;
            
            // Priority 1: Check inside active modal/dialog/overlay first (including X/Twitter compose)
            // Filter to only visible modals - include X's layers structure
            const visibleModals = Array.from(document.querySelectorAll('[role="dialog"], [data-testid="modal"], [aria-modal="true"], .modal, .dialog, [data-testid="sheetDialog"], #layers > div'))
              .filter(m => {
                const style = window.getComputedStyle(m);
                return m.offsetParent !== null && style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0';
              });

            if (visibleModals.length > 0) {
              const topModal = visibleModals[visibleModals.length - 1];
              const modalElement = topModal.querySelector('${selector.replace(/'/g, "\\'")}');
              if (modalElement && modalElement.offsetParent !== null) {
                element = modalElement;
                console.log('Found element in modal/overlay:', element);
              }
            }
            
            // Priority 2: Global search if not found in modal
            if (!element) {
              const matches = document.querySelectorAll('${selector.replace(/'/g, "\\'")}');
              for (const match of matches) {
                if (match.offsetParent !== null) {
                  element = match;
                  break;
                }
              }
            }
            
            if (!element) return { success: false, error: 'Element not found: ${selector}' };
            
            // Scroll into view first
            element.scrollIntoView({ behavior: 'instant', block: 'center', inline: 'center' });
            
            // Brief wait for scroll
            await new Promise(resolve => setTimeout(resolve, 100));
            
            // OCCLUSION CHECK: Verify the element is actually interactable
            const rect = element.getBoundingClientRect();
            const x = rect.left + rect.width / 2;
            const y = rect.top + rect.height / 2;
            
            const topElement = document.elementFromPoint(x, y);
            const isValidClick = topElement && (
              element.contains(topElement) || 
              topElement.contains(element) || 
              element === topElement
            );
            
            if (!isValidClick) {
              console.warn('Input obscured by:', topElement);
              const coveringModal = topElement.closest('[role="dialog"], [data-testid="modal"], .modal');
              if (coveringModal) {
                 return { success: false, error: 'Input is obscured by a modal/dialog. Try finding the element INSIDE the modal.' };
              }
              // Proceed anyway for inputs as they might be wrapped weirdly, but log warning
            }
            
            // Visual Indicator (Liquid Glass Arrow)
            if (!document.getElementById('staylert-click-styles')) {
              const style = document.createElement('style');
              style.id = 'staylert-click-styles';
              style.textContent = \`
                @keyframes staylertFloat { 0%, 100% { transform: translateY(0px); } 50% { transform: translateY(-3px); } }
                @keyframes staylertRipple { 0% { transform: translate(-50%, -50%) scale(0); opacity: 0.6; } 100% { transform: translate(-50%, -50%) scale(3); opacity: 0; } }
              \`;
              document.head.appendChild(style);
            }
            
            // Create pointer
            const indicator = document.createElement('div');
            indicator.id = 'staylert-pointer';
            indicator.innerHTML = \`
              <svg width="32" height="32" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
                <filter id="glass-glow-type" x="-50%" y="-50%" width="200%" height="200%">
                  <feGaussianBlur in="SourceGraphic" stdDeviation="2" result="blur"/>
                  <feColorMatrix in="blur" mode="matrix" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 18 -7" result="goo"/>
                  <feComposite in="SourceGraphic" in2="goo" operator="atop"/>
                </filter>
                <filter id="glass-shadow-type" x="-20%" y="-20%" width="140%" height="140%">
                  <feDropShadow dx="0" dy="4" stdDeviation="4" flood-color="#000000" flood-opacity="0.4"/>
                </filter>
                <path d="M6 4L14 26L17.5 16.5L27 13L6 4Z" fill="url(#glass-gradient-type)" filter="url(#glass-shadow-type)" stroke="rgba(255,255,255,0.9)" stroke-width="1.5"/>
                <path d="M8 7L13 20L15.5 14.5L21 12L8 7Z" fill="url(#gloss-gradient-type)" opacity="0.7"/>
                <defs>
                  <linearGradient id="glass-gradient-type" x1="6" y1="4" x2="27" y2="26" gradientUnits="userSpaceOnUse">
                    <stop offset="0%" stop-color="rgba(80, 80, 80, 0.95)"/><stop offset="100%" stop-color="rgba(10, 10, 10, 0.95)"/>
                  </linearGradient>
                  <linearGradient id="gloss-gradient-type" x1="8" y1="7" x2="18" y2="18" gradientUnits="userSpaceOnUse">
                    <stop offset="0%" stop-color="rgba(255, 255, 255, 0.9)"/><stop offset="100%" stop-color="rgba(255, 255, 255, 0.1)"/>
                  </linearGradient>
                </defs>
              </svg>
            \`;
            indicator.style.cssText = 'position:fixed;z-index:999999;pointer-events:none;transition:all 0.4s cubic-bezier(0.22, 1, 0.36, 1);animation: staylertFloat 3s ease-in-out infinite;filter: drop-shadow(0 4px 12px rgba(139, 92, 246, 0.4));';
            indicator.style.left = x + 'px';
            indicator.style.top = y + 'px';
            
            const existingPointer = document.getElementById('staylert-pointer');
            if (existingPointer) existingPointer.remove();
            document.body.appendChild(indicator);
            
            // Dispatch full mouse event sequence
            const eventOptions = { 
              bubbles: true, cancelable: true, view: window,
              clientX: x, clientY: y, screenX: x, screenY: y,
              buttons: 1, pointerId: 1, isPrimary: true
            };
            
            element.dispatchEvent(new MouseEvent('mousemove', eventOptions));
            element.dispatchEvent(new MouseEvent('mouseover', eventOptions));
            element.dispatchEvent(new PointerEvent('pointerdown', eventOptions));
            element.dispatchEvent(new MouseEvent('mousedown', eventOptions));
            
            // Focus
            element.focus();
            
            element.dispatchEvent(new PointerEvent('pointerup', eventOptions));
            element.dispatchEvent(new MouseEvent('mouseup', eventOptions));
            element.dispatchEvent(new MouseEvent('click', eventOptions));
            
            // Trigger native click if enabled
            if (!element.disabled) element.click();
            
            await new Promise(resolve => setTimeout(resolve, 150));
            
            // Find the actual contenteditable element for Draft.js
            let editableEl = element;
            
            // X/Twitter uses Draft.js - find the contenteditable div
            if (element.getAttribute('contenteditable') !== 'true') {
              // Look for contenteditable in element or ancestors
              const contentEditable = element.querySelector('[contenteditable="true"]') ||
                                      element.closest('[contenteditable="true"]');
              if (contentEditable) {
                editableEl = contentEditable;
              }
            }
            
            // Also check for Draft.js specific structure
            const draftEditor = element.closest('.DraftEditor-root') || element.querySelector('.DraftEditor-root');
            if (draftEditor) {
              const draftContent = draftEditor.querySelector('.public-DraftEditor-content[contenteditable="true"]');
              if (draftContent) {
                editableEl = draftContent;
              }
            }
            
            const isContentEditable = editableEl.getAttribute('contenteditable') === 'true' || 
                                      editableEl.getAttribute('role') === 'textbox';
            
            if (isContentEditable) {
              // CRITICAL: Must focus and wait for Draft.js to be ready
              editableEl.focus();
              await new Promise(resolve => setTimeout(resolve, 200));
              
              // Click in the center to ensure cursor is placed
              const rect = editableEl.getBoundingClientRect();
              const clickX = rect.left + rect.width / 2;
              const clickY = rect.top + rect.height / 2;
              
              editableEl.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, clientX: clickX, clientY: clickY }));
              editableEl.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, clientX: clickX, clientY: clickY }));
              editableEl.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: clickX, clientY: clickY }));
              
              await new Promise(resolve => setTimeout(resolve, 100));
              editableEl.focus();
              
              // For Draft.js, we need to simulate actual keyboard input
              const textToType = '${text.replace(/'/g, "\\'").replace(/\\/g, "\\\\")}';
              
              // Method 1: Use execCommand with selection
              const selection = window.getSelection();
              const range = document.createRange();
              range.selectNodeContents(editableEl);
              range.collapse(false); // Collapse to end
              selection.removeAllRanges();
              selection.addRange(range);
              
              let inserted = false;
              try {
                inserted = document.execCommand('insertText', false, textToType);
              } catch (e) {
                console.warn('execCommand failed:', e);
              }
              
              // Method 2: If execCommand didn't work, use DataTransfer (paste simulation)
              if (!inserted || !editableEl.textContent.includes(textToType.slice(0, 10))) {
                const dataTransfer = new DataTransfer();
                dataTransfer.setData('text/plain', textToType);
                
                const pasteEvent = new ClipboardEvent('paste', {
                  bubbles: true,
                  cancelable: true,
                  clipboardData: dataTransfer
                });
                editableEl.dispatchEvent(pasteEvent);
                
                await new Promise(resolve => setTimeout(resolve, 100));
              }
              
              // Method 3: Direct DOM manipulation as last resort
              if (!editableEl.textContent.includes(textToType.slice(0, 10))) {
                // Find or create the text node
                let textBlock = editableEl.querySelector('[data-block="true"]');
                if (!textBlock) {
                  textBlock = editableEl;
                }
                
                let textSpan = textBlock.querySelector('[data-text="true"]');
                if (textSpan) {
                  textSpan.textContent = textToType;
                } else {
                  // Create the structure Draft.js expects
                  const offsetSpan = textBlock.querySelector('[data-offset-key]');
                  if (offsetSpan) {
                    offsetSpan.innerHTML = '<span data-text="true">' + textToType + '</span>';
                  } else {
                    textBlock.innerHTML = '<span data-text="true">' + textToType + '</span>';
                  }
                }
                
                // Dispatch events to notify React/Draft.js
                editableEl.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: textToType }));
                editableEl.dispatchEvent(new Event('change', { bubbles: true }));
              }
              
              // Verify text was inserted
              await new Promise(resolve => setTimeout(resolve, 150));
              const finalText = editableEl.textContent || '';
              const hasText = finalText.includes(textToType.slice(0, 15));
              
              if (!hasText) {
                return { success: false, error: 'Failed to insert text into Draft.js editor. Current content: ' + finalText.slice(0, 50) };
              }
              
              return { success: true, message: 'Typed text into Draft.js editor', typed: textToType.slice(0, 30) };
            } else {
              // For regular input/textarea elements
              element.value = '${text.replace(/'/g, "\\'")}';
              element.dispatchEvent(new Event('input', { bubbles: true }));
              element.dispatchEvent(new Event('change', { bubbles: true }));
            }
            
            // Brief wait for UI to update
            await new Promise(resolve => setTimeout(resolve, 100));
            
            return { success: true, message: 'Typed "${text.replace(/"/g, '\\"').slice(0, 30)}..." into: ${selector}' };
          })()
        `);

        // Auto-capture snapshot after type to show submit button
        await new Promise(resolve => setTimeout(resolve, 500));
        const snapshot = await contents.executeJavaScript(`
          (function() {
            const elements = [];
            function isVisible(el) {
              const rect = el.getBoundingClientRect();
              if (rect.width === 0 || rect.height === 0) return false;
              const style = window.getComputedStyle(el);
              return style.display !== 'none' && style.visibility !== 'hidden';
            }
            
            document.querySelectorAll('[data-testid]').forEach((el) => {
              if (!isVisible(el)) return;
              const testId = el.getAttribute('data-testid');
              const ariaLabel = el.getAttribute('aria-label') || '';
              elements.push({ testId, label: ariaLabel.slice(0, 60), selector: '[data-testid="' + testId + '"]' });
            });
            
            const modals = document.querySelectorAll('[role="dialog"], [aria-modal="true"]');
            const hasModal = modals.length > 0;
            const hasTweetButton = elements.some(e => e.testId === 'tweetButton');
            
            return { url: window.location.href, hasModal, hasTweetButton, elements: elements.slice(0, 30) };
          })()
        `);

        // Format snapshot with clear next action
        let nextAction = `\n\n--- PAGE STATE AFTER TYPING ---\nModal Open: ${snapshot.hasModal}\n`;
        if (snapshot.hasTweetButton) {
          nextAction += `\n⚠️ NEXT ACTION REQUIRED: Click the submit button to post your reply!\n`;
          nextAction += `Command: browser_click selector='[data-testid="tweetButton"]'\n`;
        }

        return JSON.stringify({
          success: result.success,
          message: result.message,
          typed: result.typed,
          nextAction: nextAction
        });
      } catch (error) {
        return JSON.stringify({ success: false, error: String(error) });
      }
    },
  });

  const scrollTool = new DynamicStructuredTool({
    name: 'browser_scroll',
    description: 'Scroll the page up or down.',
    schema: z.object({
      direction: z.enum(['up', 'down']).describe('Direction to scroll'),
      amount: z.number().describe('Amount to scroll in pixels (e.g., 500)'),
    }),
    func: async ({ direction, amount }) => {
      try {
        const contents = getContents();
        const scrollAmount = direction === 'down' ? amount : -amount;
        await contents.executeJavaScript(`window.scrollBy(0, ${scrollAmount})`);
        return JSON.stringify({ success: true, message: `Scrolled ${direction} by ${amount}px` });
      } catch (error) {
        return JSON.stringify({ success: false, error: String(error) });
      }
    },
  });

  const getPageContentTool = new DynamicStructuredTool({
    name: 'browser_get_page_content',
    description: 'Get a quick summary of the current page with clickable elements. Returns page info and interactive elements you can click.',
    schema: z.object({}),
    func: async () => {
      try {
        const contents = getContents();
        const result = await contents.executeJavaScript(`
          (function() {
            // Get clickable elements quickly
            const clickable = [];
            
            // Buttons
            document.querySelectorAll('button:not([disabled])').forEach((el, i) => {
              if (i < 10) {
                const text = (el.innerText || el.getAttribute('aria-label') || '').trim().slice(0, 40);
                if (text) clickable.push({ type: 'button', text, selector: el.id ? '#' + el.id : 'button:contains("' + text.slice(0,15) + '")' });
              }
            });
            
            // Links
            document.querySelectorAll('a[href]').forEach((el, i) => {
              if (i < 15) {
                const text = (el.innerText || el.getAttribute('aria-label') || '').trim().slice(0, 40);
                if (text && text.length > 1) clickable.push({ type: 'link', text, href: el.href?.slice(0, 60) });
              }
            });
            
            // Like/action buttons (common patterns for X/Twitter)
            document.querySelectorAll('[data-testid="like"], [data-testid="unlike"], [data-testid*="like"], [data-testid*="heart"], [aria-label*="Like"], [aria-label*="like"]').forEach((el, i) => {
              if (i < 10) {
                const testId = el.getAttribute('data-testid');
                const label = el.getAttribute('aria-label') || testId || 'Like';
                const selector = testId ? '[data-testid="' + testId + '"]' : '[aria-label="' + label + '"]';
                clickable.push({ type: 'action', text: label.slice(0, 50), selector });
              }
            });
            
            // X/Twitter specific: Get tweet action buttons
            document.querySelectorAll('[data-testid="reply"], [data-testid="retweet"], [data-testid="like"], [data-testid="bookmark"]').forEach((el, i) => {
              if (i < 20) {
                const testId = el.getAttribute('data-testid');
                const label = el.getAttribute('aria-label') || testId;
                clickable.push({ type: 'tweet-action', text: label?.slice(0, 50) || testId, selector: '[data-testid="' + testId + '"]' });
              }
            });
            
            // Inputs
            const inputs = [];
            document.querySelectorAll('input:not([type="hidden"]), textarea').forEach((el, i) => {
              if (i < 5) {
                const name = el.placeholder || el.name || el.id || 'input';
                inputs.push({ name: name.slice(0, 30), selector: el.id ? '#' + el.id : '[placeholder="' + (el.placeholder || '') + '"]' });
              }
            });
            
            return {
              title: document.title,
              url: window.location.href,
              clickable: clickable.slice(0, 20),
              inputs: inputs
            };
          })()
        `);
        return JSON.stringify({ success: true, ...result });
      } catch (error) {
        return JSON.stringify({ success: false, error: String(error) });
      }
    },
  });

  const extractTool = new DynamicStructuredTool({
    name: 'browser_extract',
    description: 'Extract text content from a specific element using a CSS selector.',
    schema: z.object({
      selector: z.string().describe('CSS selector for the element to extract text from'),
    }),
    func: async ({ selector }) => {
      try {
        const contents = getContents();
        const result = await contents.executeJavaScript(`
          (function() {
            const element = document.querySelector('${selector.replace(/'/g, "\\'")}');
            if (!element) return { success: false, error: 'Element not found: ${selector}' };
            return { success: true, text: element.innerText, html: element.innerHTML.slice(0, 2000) };
          })()
        `);
        return JSON.stringify(result);
      } catch (error) {
        return JSON.stringify({ success: false, error: String(error) });
      }
    },
  });

  // Get visible text content of the page
  const getVisibleTextTool = new DynamicStructuredTool({
    name: 'browser_get_visible_text',
    description: 'Get the visible text content of the current page. Use this to read and understand what text is displayed on the page.',
    schema: z.object({}),
    func: async () => {
      try {
        const contents = getContents();
        const result = await contents.executeJavaScript(`
          (function() {
            return {
              title: document.title,
              url: window.location.href,
              text: document.body.innerText.slice(0, 8000)
            };
          })()
        `);
        return JSON.stringify({ success: true, ...result });
      } catch (error) {
        return JSON.stringify({ success: false, error: String(error) });
      }
    },
  });

  // Get all interactive elements with their selectors
  const getInteractiveElementsTool = new DynamicStructuredTool({
    name: 'browser_get_interactive_elements',
    description: 'Get all interactive elements (buttons, links, inputs) on the page with their selectors. Use this to find elements you can click or interact with.',
    schema: z.object({}),
    func: async () => {
      try {
        const contents = getContents();
        const result = await contents.executeJavaScript(`
          (function() {
            const elements = [];
            
            // X/Twitter specific: Like buttons (PRIORITY - these are what we need to click)
            document.querySelectorAll('[data-testid="like"], [data-testid="unlike"]').forEach((el, i) => {
              const testId = el.getAttribute('data-testid');
              const label = el.getAttribute('aria-label') || testId;
              const rect = el.getBoundingClientRect();
              if (rect.width > 0 && rect.height > 0) {
                elements.push({ 
                  type: 'like-button', 
                  label: label?.slice(0, 50), 
                  selector: '[data-testid="' + testId + '"]',
                  testId,
                  isLiked: testId === 'unlike'
                });
              }
            });
            
            // X/Twitter specific: Other tweet action buttons
            document.querySelectorAll('[data-testid="reply"], [data-testid="retweet"], [data-testid="bookmark"]').forEach((el, i) => {
              if (i < 20) {
                const testId = el.getAttribute('data-testid');
                const label = el.getAttribute('aria-label') || testId;
                const rect = el.getBoundingClientRect();
                if (rect.width > 0 && rect.height > 0) {
                  elements.push({ 
                    type: 'tweet-action', 
                    label: label?.slice(0, 50), 
                    selector: '[data-testid="' + testId + '"]',
                    testId 
                  });
                }
              }
            });
            
            // Other data-testid elements (limit to important ones)
            document.querySelectorAll('[data-testid]').forEach((el, i) => {
              if (i < 20) {
                const testId = el.getAttribute('data-testid');
                // Skip like/unlike/reply/retweet/bookmark as they're already added
                if (['like', 'unlike', 'reply', 'retweet', 'bookmark'].includes(testId)) return;
                const label = el.getAttribute('aria-label') || el.innerText?.slice(0, 30) || testId;
                const rect = el.getBoundingClientRect();
                if (rect.width > 0 && rect.height > 0) {
                  elements.push({ 
                    type: 'testid', 
                    label: label?.slice(0, 50), 
                    selector: '[data-testid="' + testId + '"]',
                    testId 
                  });
                }
              }
            });
            
            // Elements with aria-label
            document.querySelectorAll('[aria-label]').forEach((el, i) => {
              if (i < 30) {
                const label = el.getAttribute('aria-label');
                const rect = el.getBoundingClientRect();
                if (rect.width > 0 && rect.height > 0 && label) {
                  elements.push({ 
                    type: 'aria', 
                    label: label.slice(0, 50), 
                    selector: '[aria-label="' + label.replace(/"/g, '\\\\"') + '"]',
                    tag: el.tagName.toLowerCase()
                  });
                }
              }
            });
            
            // Buttons
            document.querySelectorAll('button').forEach((el, i) => {
              if (i < 20) {
                const text = (el.innerText || '').trim();
                const rect = el.getBoundingClientRect();
                if (rect.width > 0 && rect.height > 0 && text) {
                  elements.push({ 
                    type: 'button', 
                    label: text.slice(0, 50), 
                    selector: el.id ? '#' + el.id : 'button'
                  });
                }
              }
            });
            
            // Links
            document.querySelectorAll('a[href]').forEach((el, i) => {
              if (i < 20) {
                const text = (el.innerText || el.getAttribute('aria-label') || '').trim();
                const rect = el.getBoundingClientRect();
                if (rect.width > 0 && rect.height > 0 && text) {
                  elements.push({ 
                    type: 'link', 
                    label: text.slice(0, 50), 
                    href: el.href?.slice(0, 80)
                  });
                }
              }
            });
            
            // Inputs
            document.querySelectorAll('input:not([type="hidden"]), textarea').forEach((el, i) => {
              if (i < 10) {
                const name = el.placeholder || el.name || el.id || el.type;
                elements.push({ 
                  type: 'input', 
                  label: name?.slice(0, 50), 
                  selector: el.id ? '#' + el.id : '[name="' + (el.name || '') + '"]',
                  inputType: el.type
                });
              }
            });
            
            return {
              url: window.location.href,
              elementCount: elements.length,
              elements: elements.slice(0, 50)
            };
          })()
        `);
        return JSON.stringify({ success: true, ...result });
      } catch (error) {
        return JSON.stringify({ success: false, error: String(error) });
      }
    },
  });

  // Screenshot description (for future vision capability)
  const getPageStructureTool = new DynamicStructuredTool({
    name: 'browser_get_page_structure',
    description: 'Get the semantic structure of the page including headings, sections, and main content areas. Use this to understand the page layout.',
    schema: z.object({}),
    func: async () => {
      try {
        const contents = getContents();
        const result = await contents.executeJavaScript(`
          (function() {
            const structure = {
              headings: [],
              sections: [],
              mainContent: null
            };
            
            // Get headings
            document.querySelectorAll('h1, h2, h3').forEach((el, i) => {
              if (i < 15) {
                structure.headings.push({
                  level: el.tagName,
                  text: el.innerText?.slice(0, 100)
                });
              }
            });
            
            // Get main content
            const main = document.querySelector('main, [role="main"], #main, .main');
            if (main) {
              structure.mainContent = main.innerText?.slice(0, 2000);
            }
            
            // Get sections/articles
            document.querySelectorAll('article, section, [role="article"]').forEach((el, i) => {
              if (i < 10) {
                const heading = el.querySelector('h1, h2, h3, h4');
                structure.sections.push({
                  heading: heading?.innerText?.slice(0, 50),
                  preview: el.innerText?.slice(0, 200)
                });
              }
            });
            
            return {
              url: window.location.href,
              title: document.title,
              ...structure
            };
          })()
        `);
        return JSON.stringify({ success: true, ...result });
      } catch (error) {
        return JSON.stringify({ success: false, error: String(error) });
      }
    },
  });

  const goBackTool = new DynamicStructuredTool({
    name: 'browser_go_back',
    description: 'Go back to the previous page in browser history.',
    schema: z.object({}),
    func: async () => {
      try {
        const contents = getContents();
        if (contents.canGoBack()) {
          contents.goBack();
          return JSON.stringify({ success: true, message: 'Navigated back' });
        }
        return JSON.stringify({ success: false, error: 'Cannot go back - no previous page' });
      } catch (error) {
        return JSON.stringify({ success: false, error: String(error) });
      }
    },
  });

  const goForwardTool = new DynamicStructuredTool({
    name: 'browser_go_forward',
    description: 'Go forward to the next page in browser history.',
    schema: z.object({}),
    func: async () => {
      try {
        const contents = getContents();
        if (contents.canGoForward()) {
          contents.goForward();
          return JSON.stringify({ success: true, message: 'Navigated forward' });
        }
        return JSON.stringify({ success: false, error: 'Cannot go forward - no next page' });
      } catch (error) {
        return JSON.stringify({ success: false, error: String(error) });
      }
    },
  });

  const reloadTool = new DynamicStructuredTool({
    name: 'browser_reload',
    description: 'Reload the current page.',
    schema: z.object({}),
    func: async () => {
      try {
        const contents = getContents();
        contents.reload();
        return JSON.stringify({ success: true, message: 'Page reloaded' });
      } catch (error) {
        return JSON.stringify({ success: false, error: String(error) });
      }
    },
  });

  const waitTool = new DynamicStructuredTool({
    name: 'browser_wait',
    description: 'Wait for a specified amount of time. Use this when you need to wait for page content to load.',
    schema: z.object({
      milliseconds: z.number().describe('Time to wait in milliseconds (max 10000)'),
    }),
    func: async ({ milliseconds }) => {
      const waitTime = Math.min(milliseconds, 10000);
      await new Promise(resolve => setTimeout(resolve, waitTime));
      return JSON.stringify({ success: true, message: `Waited ${waitTime}ms` });
    },
  });

  const findElementsTool = new DynamicStructuredTool({
    name: 'browser_find_elements',
    description: 'Find interactive elements on the page (links, buttons, inputs) to help identify what can be clicked or interacted with.',
    schema: z.object({
      type: z.enum(['links', 'buttons', 'inputs', 'all']).describe('Type of elements to find: links, buttons, inputs, or all'),
    }),
    func: async ({ type }) => {
      try {
        const contents = getContents();
        const result = await contents.executeJavaScript(`
          (function() {
            const elements = { links: [], buttons: [], inputs: [] };
            
            if ('${type}' === 'links' || '${type}' === 'all') {
              document.querySelectorAll('a[href]').forEach((el, i) => {
                if (i < 20) elements.links.push({ text: el.innerText.slice(0, 50), href: el.href, selector: 'a[href="' + el.href + '"]' });
              });
            }
            
            if ('${type}' === 'buttons' || '${type}' === 'all') {
              document.querySelectorAll('button, input[type="submit"], input[type="button"]').forEach((el, i) => {
                if (i < 20) {
                  const text = el.innerText || el.value || '';
                  elements.buttons.push({ text: text.slice(0, 50), selector: el.id ? '#' + el.id : (el.className ? '.' + el.className.split(' ')[0] : 'button') });
                }
              });
            }
            
            if ('${type}' === 'inputs' || '${type}' === 'all') {
              document.querySelectorAll('input:not([type="hidden"]):not([type="submit"]):not([type="button"]), textarea, select').forEach((el, i) => {
                if (i < 20) {
                  const name = el.name || el.id || el.placeholder || '';
                  elements.inputs.push({ name: name.slice(0, 50), type: el.type || 'text', selector: el.id ? '#' + el.id : (el.name ? '[name="' + el.name + '"]' : 'input') });
                }
              });
            }
            
            return elements;
          })()
        `);
        return JSON.stringify({ success: true, elements: result });
      } catch (error) {
        return JSON.stringify({ success: false, error: String(error) });
      }
    },
  });

  // Simplified: Get clickable elements fast
  const getAccessibilityTreeTool = new DynamicStructuredTool({
    name: 'browser_get_accessibility_tree',
    description: 'Get a fast list of all clickable elements on the page with their selectors. Use this to find elements to interact with.',
    schema: z.object({}),
    func: async () => {
      try {
        const contents = getContents();
        const result = await contents.executeJavaScript(`
          (function() {
            const elements = [];
            
            // Get all clickable elements with aria-labels (most reliable for modern sites)
            document.querySelectorAll('[aria-label]').forEach((el, i) => {
              if (i < 30) {
                const rect = el.getBoundingClientRect();
                if (rect.width > 0 && rect.height > 0) {
                  elements.push({
                    label: el.getAttribute('aria-label').slice(0, 50),
                    selector: '[aria-label="' + el.getAttribute('aria-label').replace(/"/g, '\\\\"') + '"]',
                    tag: el.tagName.toLowerCase()
                  });
                }
              }
            });
            
            // Get buttons
            document.querySelectorAll('button').forEach((el, i) => {
              if (i < 15) {
                const text = (el.innerText || el.getAttribute('aria-label') || '').trim().slice(0, 40);
                const rect = el.getBoundingClientRect();
                if (text && rect.width > 0) {
                  elements.push({ label: text, selector: el.id ? '#' + el.id : '[aria-label="' + text + '"]', tag: 'button' });
                }
              }
            });
            
            // Get data-testid elements (common in React apps)
            document.querySelectorAll('[data-testid]').forEach((el, i) => {
              if (i < 20) {
                const testId = el.getAttribute('data-testid');
                const label = el.getAttribute('aria-label') || el.innerText?.slice(0, 30) || testId;
                elements.push({ label, selector: '[data-testid="' + testId + '"]', tag: el.tagName.toLowerCase() });
              }
            });
            
            return {
              url: window.location.href,
              title: document.title,
              elements: elements.slice(0, 40)
            };
          })()
        `);
        return JSON.stringify({ success: true, ...result });
      } catch (error) {
        return JSON.stringify({ success: false, error: String(error) });
      }
    },
  });

  // Click by coordinates (for elements that are hard to select)
  const clickAtCoordinatesTool = new DynamicStructuredTool({
    name: 'browser_click_coordinates',
    description: 'Click at specific x,y coordinates on the page. Use this as a fallback when selectors fail. Coordinates are relative to the top-left of the viewport.',
    schema: z.object({
      x: z.number().describe('X coordinate'),
      y: z.number().describe('Y coordinate'),
    }),
    func: async ({ x, y }) => {
      try {
        const contents = getContents();

        // Show visual indicator
        await contents.executeJavaScript(`
          (function() {
            const indicator = document.createElement('div');
            indicator.style.cssText = 'position:fixed;z-index:999999;pointer-events:none;width:20px;height:20px;background:rgba(255,0,0,0.5);border-radius:50%;transform:translate(-50%, -50%);left:${x}px;top:${y}px;box-shadow: 0 0 10px rgba(255,0,0,0.5);';
            document.body.appendChild(indicator);
            setTimeout(() => indicator.remove(), 1000);
          })()
        `);

        // Send input events directly to WebContents for reliable clicking
        contents.sendInputEvent({ type: 'mouseMove', x, y });
        contents.sendInputEvent({ type: 'mouseDown', x, y, button: 'left', clickCount: 1 });
        contents.sendInputEvent({ type: 'mouseUp', x, y, button: 'left', clickCount: 1 });

        // Auto-capture snapshot after click to verify result
        await new Promise(resolve => setTimeout(resolve, 1000));

        const currentUrl = contents.getURL();
        const xDomain = currentUrl.includes('x.com') || currentUrl.includes('twitter.com');
        return JSON.stringify({
          success: true,
          message: `Clicked at ${x},${y}`,
          nextAction: 'Action performed. Call browser_snapshot to verify result.',
          domainWarning: xDomain ? 'You are on X/Twitter. Use x_like/x_reply/x_follow/x_post before relying on browser_click_coordinates; only fall back here after the x_ tool has failed.' : null,
        });
      } catch (error) {
        return JSON.stringify({ success: false, error: String(error) });
      }
    },
  });

  const takeScreenshotTool = new DynamicStructuredTool({
    name: 'browser_take_screenshot',
    description: 'Take a screenshot of the current page. Returns the path to the saved image file.',
    schema: z.object({}),
    func: async () => {
      try {
        const contents = getContents();
        const image = await contents.capturePage();
        const buffer = image.toPNG();

        // Save to temp file
        const fs = require('fs');
        const path = require('path');
        const os = require('os');
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const filePath = path.join(os.tmpdir(), `staylert-screenshot-${timestamp}.png`);

        fs.writeFileSync(filePath, buffer);

        return JSON.stringify({
          success: true,
          message: `Screenshot saved to ${filePath}`,
          filePath: filePath
        });
      } catch (error) {
        return JSON.stringify({ success: false, error: String(error) });
      }
    },
  });

  // Hover over element
  const hoverTool = new DynamicStructuredTool({
    name: 'browser_hover',
    description: 'Hover over an element to trigger hover states, reveal dropdowns, or tooltips.',
    schema: z.object({
      selector: z.string().describe('CSS selector for the element to hover over'),
    }),
    func: async ({ selector }) => {
      try {
        const contents = getContents();
        const result = await contents.executeJavaScript(`
          (function() {
            const element = document.querySelector('${selector.replace(/'/g, "\\'")}');
            if (!element) return { success: false, error: 'Element not found: ${selector}' };
            
            const rect = element.getBoundingClientRect();
            const events = ['mouseenter', 'mouseover', 'mousemove'];
            
            events.forEach(type => {
              element.dispatchEvent(new MouseEvent(type, {
                bubbles: true,
                cancelable: true,
                view: window,
                clientX: rect.left + rect.width / 2,
                clientY: rect.top + rect.height / 2
              }));
            });
            
            return { success: true, message: 'Hovered over element: ${selector}' };
          })()
        `);
        return JSON.stringify(result);
      } catch (error) {
        return JSON.stringify({ success: false, error: String(error) });
      }
    },
  });

  // Snapshot tool - captures page elements in YAML format with multiple selector options
  const snapshotTool = new DynamicStructuredTool({
    name: 'browser_snapshot',
    description: 'Capture a YAML snapshot of all interactive elements on the page. Shows buttons, links, inputs with multiple selector options (data-testid, aria-label, CSS selector). Use this to understand what you can click/interact with.',
    schema: z.object({}),
    func: async () => {
      try {
        const contents = getContents();
        const result = await contents.executeJavaScript(`
          (function() {
            const snapshot = {
              url: window.location.href,
              title: document.title,
              elements: []
            };
            
            // Helper to check visibility
            function isElementVisible(element) {
                const style = window.getComputedStyle(element);
                const rect = element.getBoundingClientRect();
                
                // Allow elements that are in the document flow even if scrolled out
                // Just check they aren't strictly hidden by CSS or 0x0 size
                if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') return false;
                
                // Relaxed size check - sometimes valid elements have 0 height but visible children, 
                // checking width > 0 is usually safer.
                return rect.width > 0 && rect.height > 0;
            }

            // Interactive elements + headings + text
            const interactiveSelector = 
              'button, a, input, select, textarea, [role="button"], [role="link"], [role="checkbox"], [role="switch"], [role="menuitem"], [tabindex], h1, h2, h3, h4, h5, h6, [data-testid]';

            const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_ELEMENT, {
                acceptNode: (node) => {
                    if (!isElementVisible(node)) return NodeFilter.FILTER_REJECT;
                    
                    // Accept semantic/interactive nodes
                    if (node.matches(interactiveSelector)) return NodeFilter.FILTER_ACCEPT;
                    
                    // Accept purely text nodes if they have meaningful content
                    if (node.childNodes.length === 1 && node.childNodes[0].nodeType === Node.TEXT_NODE && node.innerText.trim().length > 0) {
                         return NodeFilter.FILTER_ACCEPT;
                    }
                    
                    return NodeFilter.FILTER_SKIP;
                }
            });

            let node;
            let index = 0;
            while (node = walker.nextNode()) {
                if (index > 1200) break; // Increased safety limit
                
                const testId = node.getAttribute('data-testid');
                const ariaLabel = node.getAttribute('aria-label') || '';
                const role = node.getAttribute('role') || node.tagName.toLowerCase();
                const text = (node.innerText || '').replace(/\\s+/g, ' ').trim();
                
                // Construct a compact representation
                snapshot.elements.push({
                    id: index++,
                    role: role,
                    name: (ariaLabel || text || testId || '').slice(0, 80),
                    testId: testId,
                    selector: testId ? \`[data-testid="\${testId}"]\` : null,
                    value: node.value,
                    checked: node.checked,
                    href: node.href
                });
            }
            
            return snapshot;
          })()
        `);
        return JSON.stringify({ success: true, snapshot: result });
      } catch (error) {
        return JSON.stringify({ success: false, error: String(error) });
      }
    },
  });

  return [
    navigateTool,
    clickTool,
    typeTool,
    scrollTool,
    snapshotTool,
    getPageContentTool,
    getVisibleTextTool,
    getInteractiveElementsTool,
    getPageStructureTool,
    extractTool,
    goBackTool,
    goForwardTool,
    reloadTool,
    waitTool,
    findElementsTool,
    getAccessibilityTreeTool,
    clickAtCoordinatesTool,
    takeScreenshotTool,
    hoverTool,
    ...createSiteTools({ getContents }),
  ];
}
