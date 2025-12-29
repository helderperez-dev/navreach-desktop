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

const consoleLogs = new Map<string, string[]>();

export function registerWebviewContents(tabId: string, contents: Electron.WebContents) {
  webviewContents.set(tabId, contents);

  // Initialize logs
  if (!consoleLogs.has(tabId)) {
    consoleLogs.set(tabId, []);
  }

  // Capture console logs
  contents.on('console-message', (event, level, message, line, sourceId) => {
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

function getContents(): Electron.WebContents {
  const contents = webviewContents.get(TAB_ID);
  if (!contents) {
    throw new Error('Browser not ready. Please wait for the page to load.');
  }
  return contents;
}

export function createBrowserTools(options?: { getSpeed?: () => 'slow' | 'normal' | 'fast' }): DynamicStructuredTool[] {
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
              if (!sel) return null;
              const selStr = String(sel).trim();
              
              // Handle numeric IDs from browser_mark_page
              if (/^\\d+$/.test(selStr)) {
                return root.querySelector('[data-reavion-id="' + selStr + '"]');
              }

              const containsMatch = selStr.match(/^(.+?):contains\\("([^"]+)"\\)$/);
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
                return root.querySelector(selStr);
              } catch (e) {
                console.error('Invalid selector:', selStr, e);
                return null;
              }
            }
            
            function querySelectorAllWithContains(root, sel) {
              if (!sel) return [];
              const selStr = String(sel).trim();

              // Handle numeric IDs from browser_mark_page
              if (/^\\d+$/.test(selStr)) {
                const el = root.querySelector('[data-reavion-id="' + selStr + '"]');
                return el ? [el] : [];
              }

              const containsMatch = selStr.match(/^(.+?):contains\\("([^"]+)"\\)$/);
              if (containsMatch) {
                const baseSelector = containsMatch[1];
                const textToFind = containsMatch[2];
                const candidates = root.querySelectorAll(baseSelector);
                return Array.from(candidates).filter(el => el.textContent && el.textContent.includes(textToFind));
              }
              try {
                return Array.from(root.querySelectorAll(selStr));
              } catch (e) {
                console.error('Invalid selector:', selStr, e);
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
            if (!document.getElementById('reavion-click-styles')) {
              const style = document.createElement('style');
              style.id = 'reavion-click-styles';
              style.textContent = \`
                @keyframes reavionClickPulse { 
                  0% { opacity: 1; transform: translate(-50%, -50%) scale(0.5); } 
                  50% { opacity: 1; transform: translate(-50%, -50%) scale(1); }
                  100% { opacity: 0; transform: translate(-50%, -50%) scale(1.2); } 
                }
                @keyframes reavionRipple {
                  0% { transform: translate(-50%, -50%) scale(0); opacity: 0.6; }
                  100% { transform: translate(-50%, -50%) scale(3); opacity: 0; }
                }
              \`;
              document.head.appendChild(style);
            }
            
            // Create ripple effect
            const ripple = document.createElement('div');
            ripple.style.cssText = 'position:fixed;z-index:999998;pointer-events:none;width:40px;height:40px;border-radius:50%;background:rgba(139,92,246,0.3);animation:reavionRipple 0.8s ease-out forwards;';
            ripple.style.left = x + 'px';
            ripple.style.top = y + 'px';
            document.body.appendChild(ripple);
            setTimeout(() => ripple.remove(), 800);
            
            // Remove any existing pointer indicator
            const existingPointer = document.getElementById('reavion-pointer');
            if (existingPointer) existingPointer.remove();
            
            // Create pointer indicator
            const indicator = document.createElement('div');
            indicator.id = 'reavion-pointer';
            indicator.innerHTML = \`
              <svg width="32" height="32" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M6 4L14 26L17.5 16.5L27 13L6 4Z" fill="rgba(80, 80, 80, 0.95)" stroke="white" stroke-width="1.5"/>
              </svg>
            \`;
            
            if (!document.getElementById('reavion-float-anim')) {
              const style = document.createElement('style');
              style.id = 'reavion-float-anim';
              style.textContent = '@keyframes reavionFloat { 0%, 100% { transform: translateY(0px); } 50% { transform: translateY(-3px); } }';
              document.head.appendChild(style);
            }

            indicator.style.cssText = 'position:fixed;z-index:999999;pointer-events:none;transition:all 0.4s ease-out;animation: reavionFloat 3s ease-in-out infinite;';
            indicator.style.left = x + 'px';
            indicator.style.top = y + 'px';
            document.body.appendChild(indicator);
            
            const eventOptions = { bubbles: true, cancelable: true, view: window, clientX: x, clientY: y, buttons: 1 };
            element.dispatchEvent(new MouseEvent('mousemove', eventOptions));
            element.dispatchEvent(new MouseEvent('mouseover', eventOptions));
            element.dispatchEvent(new MouseEvent('mousedown', eventOptions));
            // element.focus(); // Removed to prevent stealing focus in background
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
            const selStr = String('${selector.replace(/'/g, "\\'")}').trim();
            let element = null;

            if (/^\\d+$/.test(selStr)) {
               element = document.querySelector('[data-reavion-id="' + selStr + '"]');
            } else {
               element = document.querySelector(selStr);
            }

            if (!element) return { success: false, error: 'Element not found: ' + selStr };
            
            element.scrollIntoView({ behavior: 'instant', block: 'center' });
            element.scrollIntoView({ behavior: 'instant', block: 'center' });
            // contenteditable requires focus for execCommand to work on the right element
            
            let editableEl = element;
            if (element.getAttribute('contenteditable') !== 'true') {
              const closest = element.closest('[contenteditable="true"]') || element.querySelector('[contenteditable="true"]');
              if (closest) editableEl = closest;
            }

            const textToType = '${text.replace(/'/g, "\\'")}';
            if (editableEl.getAttribute('contenteditable') === 'true' || editableEl.tagName === 'DIV') {
                editableEl.focus(); // Focus required for execCommand
                document.execCommand('insertText', false, textToType);
            } else {
                // Do not focus standard inputs to avoid stealing window focus
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
    description: 'Scroll the page up or down. Automatically detects scrollable areas if the main window is not scrollable (common in SPAs like X.com or Reddit).',
    schema: z.object({
      direction: z.enum(['up', 'down']).describe('Direction to scroll'),
      amount: z.number().describe('Amount to scroll in pixels (e.g., 500)'),
    }),
    func: async ({ direction, amount }) => {
      try {
        const contents = getContents();
        const scrollAmount = direction === 'down' ? amount : -amount;

        const result = await contents.executeJavaScript(`
          (function() {
            const amount = ${scrollAmount};
            
            // Helper to get scroll definition
            function isScrollable(el) {
                const style = window.getComputedStyle(el);
                const isScrollable = (style.overflowY === 'auto' || style.overflowY === 'scroll');
                const hasScrollSpace = el.scrollHeight > el.clientHeight;
                return isScrollable && hasScrollSpace;
            }

            // 1. Try Window Scroll first
            const startY = window.scrollY;
            window.scrollBy(0, amount);
            const endY = window.scrollY;
            
            if (Math.abs(endY - startY) > 0) {
                return { success: true, message: 'Scrolled window by ' + amount + 'px' };
            }
            
            // 2. Window didn't scroll. Find the best scrollable container.
            // Heuristic: Largest visible scrollable element is usually the main feed.
            const allElements = document.querySelectorAll('*');
            let bestContainer = null;
            let maxArea = 0;
            
            for (const el of allElements) {
                if (isScrollable(el)) {
                    const rect = el.getBoundingClientRect();
                    // Must be visible
                    if (rect.width > 0 && rect.height > 0 && rect.top < window.innerHeight && rect.left < window.innerWidth) {
                        const area = rect.width * rect.height;
                        if (area > maxArea) {
                            maxArea = area;
                            bestContainer = el;
                        }
                    }
                }
            }
            
            if (bestContainer) {
                bestContainer.scrollBy({ top: amount, behavior: 'smooth' }); // Smooth for visual feedback
                return { success: true, message: 'Scrolled container ' + (bestContainer.className || bestContainer.tagName) + ' by ' + amount + 'px' };
            }
            
            // 3. Fallback: Try specific known containers for common sites if general heuristic fails
            // X.com usually uses [data-testid="primaryColumn"] or section
            // But usually the loop above catches it.
            
            return { success: false, error: 'No scrollable element found.' };
          })()
        `);

        // Wait a bit if we did smooth scrolling
        await new Promise(resolve => setTimeout(resolve, 500));

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

                        // X-specific engagement detection
                        if (window.location.hostname.includes('x.com')) {
                           if (testId === 'unlike') state.push('engaged', 'liked');
                           if (testId === 'unretweet') state.push('engaged', 'retweeted');
                        }

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

      while (Date.now() < endTime) {
        const remaining = Math.ceil((endTime - Date.now()) / 1000);

        // Send a debug log every second to show aliveness
        sendDebugLog('info', `Waiting... ${remaining}s remaining`);
        console.log(`[browser_wait] ${remaining}s remaining ${speed !== 'normal' ? `(${speed} x${speedMultiplier})` : ''}`);

        // Determine wait chunk (max 1 second)
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
              const uniqueId = 'mouse-' + Date.now();
              pointer.innerHTML = \`
                <svg width="32" height="32" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M6 4L14 26L17.5 16.5L27 13L6 4Z" fill="url(#\${uniqueId})" stroke="white" stroke-width="1.5"/>
                  <defs>
                    <linearGradient id="\${uniqueId}" x1="6" y1="4" x2="27" y2="26" gradientUnits="userSpaceOnUse">
                      <stop offset="0%" stop-color="#8b5cf6"/>
                      <stop offset="100%" stop-color="#7c3aed"/>
                    </linearGradient>
                  </defs>
                </svg>
              \`;
              pointer.style.cssText = 'position:fixed;z-index:999999;pointer-events:none;filter:drop-shadow(0 4px 12px rgba(0,0,0,0.4));animation:reavionFloat 3s ease-in-out infinite;transition:all 0.5s cubic-bezier(0.2, 0.8, 0.2, 1);';
              document.body.appendChild(pointer);
            }

            pointer.style.left = x + 'px';
            pointer.style.top = y + 'px';
            pointer.style.transform = 'scale(1.1)';
            setTimeout(() => { pointer.style.transform = 'scale(1)'; }, 500);

            // Brief Highlight
            const originalOutline = element.style.outline;
            element.style.outline = '2px dashed rgba(139, 92, 246, 0.5)';
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
      description: 'Overlay numeric labels on all interactive elements in the viewport. This gives you exact IDs to use for browser_click or browser_type. This is your most precise tool for complex UIs.',
      schema: z.object({}),
      func: async () => {
        const contents = getContents();
        try {
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
        label.style.cssText = 'position:fixed;background:rgba(139,92,246,0.95);color:white;padding:2px 4px;font-size:11px;font-family:sans-serif;border-radius:3px;z-index:1000000;pointer-events:none;font-weight:bold;box-shadow:0 2px 4px rgba(0,0,0,0.3);border:1px solid white;';
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
                html += \`<div style="position:absolute;left:\${x}px;top:0;bottom:0;width:1px;background:rgba(244,63,94,\${finalOpacity});"><span style="position:absolute;top:5px;left:2px;font-size:10px;color:#f43f5e;">\${x}</span></div>\`;
              }
              // Draw horizontal lines
              for (let y = 0; y <= height; y += step) {
                html += \`<div style="position:absolute;top:\${y}px;left:0;right:0;height:1px;background:rgba(244,63,94,\${finalOpacity});"><span style="position:absolute;left:5px;top:2px;font-size:10px;color:#f43f5e;">\${y}</span></div>\`;
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

    ...createSiteTools({ getContents }),
  ];
}
