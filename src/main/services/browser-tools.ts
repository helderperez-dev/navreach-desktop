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
    description: 'Click on an element in the browser using a CSS selector.',
    schema: z.object({
      selector: z.string().describe('CSS selector for the element to click (e.g., "button.submit", "#login-btn", "[data-testid=\\"like\\"]")'),
      index: z.number().describe('0-based index of element to click when multiple elements match the selector. Use 0 for first.'),
    }),
    func: async ({ selector, index }) => {
      const targetIndex = index;
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
            
            // Create pointer indicator
            const indicator = document.createElement('div');
            indicator.id = 'navreach-pointer';
            indicator.innerHTML = \`
              <svg width="32" height="32" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M6 4L14 26L17.5 16.5L27 13L6 4Z" fill="rgba(80, 80, 80, 0.95)" stroke="white" stroke-width="1.5"/>
              </svg>
            \`;
            
            if (!document.getElementById('navreach-float-anim')) {
              const style = document.createElement('style');
              style.id = 'navreach-float-anim';
              style.textContent = '@keyframes navreachFloat { 0%, 100% { transform: translateY(0px); } 50% { transform: translateY(-3px); } }';
              document.head.appendChild(style);
            }

            indicator.style.cssText = 'position:fixed;z-index:999999;pointer-events:none;transition:all 0.4s ease-out;animation: navreachFloat 3s ease-in-out infinite;';
            indicator.style.left = x + 'px';
            indicator.style.top = y + 'px';
            document.body.appendChild(indicator);
            
            const eventOptions = { bubbles: true, cancelable: true, view: window, clientX: x, clientY: y, buttons: 1 };
            element.dispatchEvent(new MouseEvent('mousemove', eventOptions));
            element.dispatchEvent(new MouseEvent('mouseover', eventOptions));
            element.dispatchEvent(new MouseEvent('mousedown', eventOptions));
            element.focus();
            element.dispatchEvent(new MouseEvent('mouseup', eventOptions));
            element.dispatchEvent(new MouseEvent('click', eventOptions));
            
            if (!element.disabled) element.click();
            
            await new Promise(resolve => setTimeout(resolve, 500));
            return { success: true, message: 'Clicked element: ${selector}' };
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
        const result = await contents.executeJavaScript(`
          (async function() {
            let element = document.querySelector('${selector.replace(/'/g, "\\'")}');
            if (!element) return { success: false, error: 'Element not found: ${selector}' };
            
            element.scrollIntoView({ behavior: 'instant', block: 'center' });
            element.focus();
            
            let editableEl = element;
            if (element.getAttribute('contenteditable') !== 'true') {
              const closest = element.closest('[contenteditable="true"]') || element.querySelector('[contenteditable="true"]');
              if (closest) editableEl = closest;
            }

            const textToType = '${text.replace(/'/g, "\\'")}';
            if (editableEl.getAttribute('contenteditable') === 'true' || editableEl.tagName === 'DIV') {
                document.execCommand('insertText', false, textToType);
            } else {
                editableEl.value = textToType;
                editableEl.dispatchEvent(new Event('input', { bubbles: true }));
                editableEl.dispatchEvent(new Event('change', { bubbles: true }));
            }
            
            return { success: true, message: 'Typed text' };
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

  const snapshotTool = new DynamicStructuredTool({
    name: 'browser_snapshot',
    description: 'Capture a YAML snapshot of interactive elements on the page.',
    schema: z.object({
      full_page: z.boolean().describe('Whether to snapshot the full page. Always pass true.')
    }),
    func: async () => {
      try {
        const contents = getContents();
        const result = await contents.executeJavaScript(`
          (function() {
            const elements = [];
            document.querySelectorAll('button, a, input, [role="button"], [data-testid]').forEach((node, i) => {
                const rect = node.getBoundingClientRect();
                if (rect.width > 0 && rect.height > 0) {
                    elements.push({
                        id: i,
                        role: node.getAttribute('role') || node.tagName.toLowerCase(),
                        name: (node.getAttribute('aria-label') || node.innerText || node.getAttribute('data-testid') || '').trim().slice(0, 50),
                        selector: node.getAttribute('data-testid') ? '[data-testid="' + node.getAttribute('data-testid') + '"]' : null
                    });
                }
            });
            return { url: window.location.href, elements: elements.slice(0, 100) };
          })()
        `);
        return JSON.stringify({ success: true, snapshot: result });
      } catch (error) {
        return JSON.stringify({ success: false, error: String(error) });
      }
    },
  });

  const waitTool = new DynamicStructuredTool({
    name: 'browser_wait',
    description: 'Wait for a specified amount of time.',
    schema: z.object({
      milliseconds: z.number().describe('Time to wait in milliseconds'),
    }),
    func: async ({ milliseconds }) => {
      await new Promise(resolve => setTimeout(resolve, milliseconds));
      return JSON.stringify({ success: true, message: `Waited ${milliseconds}ms` });
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
    name: 'browser_get_page_content',
    description: 'Get page info and clickable elements.',
    schema: z.object({
      include_elements: z.boolean().describe('Whether to include interactive elements. Always pass true.')
    }),
    func: async () => {
      const contents = getContents();
      const result = await contents.executeJavaScript(`({ title: document.title, url: window.location.href })`);
      return JSON.stringify({ success: true, ...result });
    }
  });

  return [
    navigateTool,
    clickTool,
    typeTool,
    scrollTool,
    snapshotTool,
    waitTool,
    clickAtCoordinatesTool,
    getPageContentTool,
    ...createSiteTools({ getContents }),
  ];
}
