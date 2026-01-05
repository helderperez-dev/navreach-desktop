import { z } from 'zod';
import { DynamicStructuredTool } from '@langchain/core/tools';
import type { SiteToolContext } from './types';

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
    return new Promise((resolve) => setTimeout(resolve, adjustedMs));
  }
  
  async function safeClick(el, label) {
    if(!el) throw new Error('Element not found: ' + label);
    
    const rectBefore = el.getBoundingClientRect();
    if (rectBefore.top < 100 || rectBefore.bottom > window.innerHeight - 100) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        await wait(600);
    } else {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        await wait(300);
    }
    
    try {
         const common = { bubbles: true, cancelable: true, view: window };
         el.dispatchEvent(new MouseEvent('mousedown', common));
         el.dispatchEvent(new MouseEvent('mouseup', common));
         el.click();
    } catch (e) {
      log('Native click failed on ' + label, { error: e.toString() });
      throw e;
    }
    await wait(800);
  }
`;

export function createLinkedInTools(ctx: SiteToolContext): DynamicStructuredTool[] {
    const searchTool = new DynamicStructuredTool({
        name: 'linkedin_search',
        description: 'Search LinkedIn for people, jobs, or posts.',
        schema: z.object({
            query: z.string().describe('Search query'),
            type: z.enum(['people', 'jobs', 'posts', 'companies', 'groups', 'events', 'courses', 'schools', 'services', 'all']).nullable().describe('Search type (default: all)').default('all'),
        }),
        func: async ({ query, type }) => {
            const finalType = type || 'all';
            try {
                const contents = ctx.getContents();
                const typeMap: Record<string, string> = {
                    people: 'people',
                    jobs: 'jobs',
                    posts: 'content',
                    companies: 'companies',
                    groups: 'groups',
                    schools: 'schools',
                    events: 'events',
                    courses: 'learning',
                    services: 'services',
                    all: 'all' // not a real filter, just search base
                };

                const params = new URLSearchParams();
                params.set('keywords', query);

                let baseUrl = 'https://www.linkedin.com/search/results/';
                if (finalType === 'all') {
                    baseUrl = 'https://www.linkedin.com/search/results/all/';
                } else {
                    baseUrl = `https://www.linkedin.com/search/results/${typeMap[finalType]}/`;
                }

                const url = `${baseUrl}?${params.toString()}`;
                await contents.loadURL(url);
                return JSON.stringify({ success: true, url });
            } catch (error) {
                return JSON.stringify({ success: false, error: String(error) });
            }
        },
    });

    const connectTool = new DynamicStructuredTool({
        name: 'linkedin_connect',
        description: 'Send a connection request to a user on their profile page.',
        schema: z.object({
            message: z.string().nullable().describe('Optional note to send with the connection request.').default(null),
        }),
        func: async ({ message }) => {
            try {
                const contents = ctx.getContents();
                const result = await contents.executeJavaScript(`
          (async function() {
            ${BASE_SCRIPT_HELPERS}
            
            // 1. Find Connect Button
            // It might be primary action, or under "More"
            let connectBtn = Array.from(document.querySelectorAll('button')).find(b => b.innerText.trim() === 'Connect');
            
            if (!connectBtn) {
                // Check "More" menu
                const moreBtn = Array.from(document.querySelectorAll('button')).find(b => b.innerText.trim() === 'More');
                if (moreBtn) {
                    await safeClick(moreBtn, 'More Button');
                    // Look in dropdown
                    const items = Array.from(document.querySelectorAll('[role="menuitem"]'));
                    const connectItem = items.find(i => i.innerText.trim() === 'Connect'); // or span inside
                    if (connectItem) {
                        await safeClick(connectItem, 'Connect in Menu');
                        connectBtn = true; // Mark as found/clicked
                    }
                }
            } else {
                await safeClick(connectBtn, 'Connect Button');
            }
            
            if (!connectBtn) return { success: false, error: 'Could not find Connect button' };

            // 2. Handle "Add a note" modal
            await wait(1000);
            const addNoteBtn = Array.from(document.querySelectorAll('button')).find(b => b.innerText.trim() === 'Add a note');
            const sendBtnWithoutNote = Array.from(document.querySelectorAll('button')).find(b => b.innerText.trim() === 'Send without a note' || b.innerText.trim() === 'Send');

            if (${JSON.stringify(!!message)} && addNoteBtn) {
                await safeClick(addNoteBtn, 'Add a note');
                const textarea = document.querySelector('textarea[name="message"]');
                if (textarea) {
                    textarea.value = ${JSON.stringify(message || '')};
                    textarea.dispatchEvent(new Event('input', { bubbles: true }));
                    await wait(500);
                    const finalSend = Array.from(document.querySelectorAll('button')).find(b => b.innerText.trim() === 'Send');
                    if (finalSend) await safeClick(finalSend, 'Send Note');
                    else return { success: false, error: 'Could not find Send button after note' };
                }
            } else if (sendBtnWithoutNote) {
                await safeClick(sendBtnWithoutNote, 'Send Connection');
            }
            
            return { success: true, message: 'Connection request sent' };
          })()
        `);
                return JSON.stringify(result);
            } catch (error) {
                return JSON.stringify({ success: false, error: String(error) });
            }
        },
    });

    const sendMessageTool = new DynamicStructuredTool({
        name: 'linkedin_message',
        description: 'Send a direct message to a connection from their profile.',
        schema: z.object({
            message: z.string().min(1).describe('The message content to send')
        }),
        func: async ({ message }) => {
            try {
                const contents = ctx.getContents();
                const result = await contents.executeJavaScript(`
                (async function() {
                  ${BASE_SCRIPT_HELPERS}
                  
                  // 1. Find Message Button
                  const msgBtn = Array.from(document.querySelectorAll('button, a')).find(b => b.innerText.trim() === 'Message');
                  if (!msgBtn) return { success: false, error: 'Message button not found. Are you connected?' };
                  
                  await safeClick(msgBtn, 'Message Button');
                  
                  // 2. Wait for chat overlay
                  await wait(1500);
                  const composer = document.querySelector('.msg-form__contenteditable[contenteditable="true"]');
                  if (!composer) return { success: false, error: 'Chat composer not found' };
                  
                  // 3. Type message
                  composer.focus({ preventScroll: true });
                  document.execCommand('insertText', false, ${JSON.stringify(message)});
                  await wait(500);
                  
                  // 4. Send
                  const sendBtn = document.querySelector('.msg-form__send-button');
                  if (!sendBtn) return { success: false, error: 'Send button not found' };
                  if (sendBtn.disabled) return { success: false, error: 'Send button is disabled (maybe message is empty?)' };
                  
                  await safeClick(sendBtn, 'Send Message');
                  return { success: true, message: 'Message sent' };
                })()
              `);
                return JSON.stringify(result);
            } catch (error) {
                return JSON.stringify({ success: false, error: String(error) });
            }
        }
    });

    return [searchTool, connectTool, sendMessageTool];
}
