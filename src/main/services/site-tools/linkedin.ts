import { z } from 'zod';
import { DynamicStructuredTool } from '@langchain/core/tools';
import type { SiteToolContext } from './types';
import { createChatModel, store } from '../ai';
import { HumanMessage } from '@langchain/core/messages';

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
      // Use max z-index to ensure visibility, black/white styling
      indicator.style.cssText = 'position:fixed;z-index:2147483647;pointer-events:none;width:32px;height:32px;filter:drop-shadow(0 4px 12px rgba(0,0,0,0.4));animation:reavionFloat 3s ease-in-out infinite;transition:all 0.4s cubic-bezier(0.165, 0.84, 0.44, 1);display:block !important;opacity:1 !important;';
      document.documentElement.appendChild(indicator);
    }
    // Standard high-contrast pointer (black with white border)
    indicator.innerHTML = '<svg width="32" height="32" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M6 4L14 26L17.5 16.5L27 13L6 4Z" fill="#000000" stroke="#ffffff" stroke-width="1.5"/></svg>';
    indicator.style.left = x + 'px';
    indicator.style.top = y + 'px';
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
    const isFast = multiplier < 1.0;
    // HUMAN BEHAVIOR: Add +/- 40% randomness + small base jitter
    const randomFactor = isFast ? (0.8 + Math.random() * 0.4) : (0.7 + (Math.random() * 0.6)); 
    const jitter = Math.random() * (isFast ? 100 : 300);
    const adjustedMs = Math.round((ms * multiplier * randomFactor) + jitter);
    
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
    if(!el) throw new Error('Element not found: ' + label);
    
    const isInteractive = el.matches('button, [role="button"], [role="textbox"], [contenteditable="true"], input, textarea, a');
    let clickable = isInteractive ? el : (el.closest('button,[role="button"]') || el);
    
    if (clickable.classList.contains('comments-comment-box__placeholder') || clickable.classList.contains('comment-box-placeholder')) {
        const parent = clickable.parentElement;
        const realEditor = parent ? parent.querySelector('[contenteditable="true"], [role="textbox"]') : null;
        if (realEditor) clickable = realEditor;
    }

    log('Selecting ' + label, { tagName: clickable.tagName });
    
    const rectBefore = clickable.getBoundingClientRect();
    if (rectBefore.top < 100 || rectBefore.bottom > window.innerHeight - 100) {
        clickable.scrollIntoView({ behavior: 'smooth', block: 'center' });
        await wait(options.scrollWait || 500);
    }
    
    const rect = clickable.getBoundingClientRect();
    const x = rect.left + rect.width / 2 + (Math.random() - 0.5) * (rect.width * 0.2);
    const y = rect.top + rect.height / 2 + (Math.random() - 0.5) * (rect.height * 0.2);
    
    if (typeof movePointer === 'function') {
        movePointer(x, y);
        await wait(options.focusWait || (150 + Math.random() * 150));
    }
    
    try {
        const common = { bubbles: true, cancelable: true, composed: true, view: window, clientX: x, clientY: y };
        
        // Hover phase
        clickable.dispatchEvent(new MouseEvent('mouseenter', common));
        clickable.dispatchEvent(new MouseEvent('mouseover', common));
        clickable.dispatchEvent(new MouseEvent('mousemove', common));
        await wait(20);

        // Press phase
        clickable.dispatchEvent(new PointerEvent('pointerdown', { ...common, pointerType: 'mouse', button: 0, buttons: 1, isPrimary: true }));
        clickable.dispatchEvent(new MouseEvent('mousedown', { ...common, button: 0, buttons: 1 }));
        
        if (clickable.focus) clickable.focus({ preventScroll: true });

        // Simulate a real human hold
        await wait(40 + Math.random() * 60);
        
        // Release phase
        clickable.dispatchEvent(new PointerEvent('pointerup', { ...common, pointerType: 'mouse', button: 0, buttons: 0, isPrimary: true }));
        clickable.dispatchEvent(new MouseEvent('mouseup', { ...common, button: 0, buttons: 0 }));
        
        // Click and native action
        const clickEv = new MouseEvent('click', { ...common, button: 0, buttons: 0, detail: 1 });
        clickable.dispatchEvent(clickEv);
        
        // Always attempt fallback click() if available
        if (typeof clickable.click === 'function') {
           try { clickable.click(); } catch(e) {}
        }
    } catch (e) {
      log('Click failed', { error: e.toString() });
    }
    await wait(options.afterWait || 600);
  }

  function getLinkedInPostData(p, i) {
    const authorEl = p.querySelector('.update-components-actor__title, .feed-shared-actor__name, .app-aware-link');
    const author = authorEl?.innerText?.trim() || 'Unknown';
    
    const contentEl = p.querySelector('.feed-shared-update-v2__commentary, .update-components-text, .feed-shared-text');
    const content = contentEl?.innerText?.trim() || '';
    
    const findLikeBtn = () => {
        const specific = p.querySelector('.react-button__trigger, .social-actions-button.react-button__trigger');
        if (specific) return specific;
        const selectors = [
            'button[aria-label*="React Like"]',
            'button[aria-label*="Like"]', 
            'button[aria-label*="Gostei"]', 
            'button[aria-label*="Recomendar"]',
            'button[aria-label*="Unlike"]', 
            'button[aria-label*="remover"]'
        ];
        for (const sel of selectors) {
            const btn = p.querySelector(sel);
            if (btn) return btn;
        }
        return p.querySelector('.feed-shared-social-action-bar__action-button');
    };

    const likeBtn = findLikeBtn();
    const label = (likeBtn?.getAttribute('aria-label') || '').toLowerCase();
    const isLiked = likeBtn?.getAttribute('aria-pressed') === 'true' || 
                    label.includes('unlike') ||
                    label.includes('remover') ||
                    label.includes('quitar') ||
                    label.includes('cancelar');

    return {
        index: i,
        author,
        content: content.substring(0, 200) + (content.length > 200 ? '...' : ''),
        isLiked,
        isPromoted: p.innerText.includes('Promoted') || p.innerText.includes('Ad')
    };
  }

  async function humanType(el, text) {
    if (!el) return;
    
    if (typeof movePointer === 'function') {
        const r = el.getBoundingClientRect();
        movePointer(r.left + r.width / 2, r.top + r.height / 2);
        await wait(100);
    }
    
    el.focus({ preventScroll: true });
    
    try {
        document.execCommand('selectAll', false, null);
        document.execCommand('delete', false, null);
    } catch(e) {}
    await wait(200); 

    for (let i = 0; i < text.length; i++) {
        const char = text[i];
        const delay = 35 + Math.random() * 50;
        await new Promise(r => setTimeout(r, delay));
        
        const common = { bubbles: true, cancelable: true, composed: true, view: window };
        const keyInit = { ...common, key: char, charCode: char.charCodeAt(0), keyCode: char.charCodeAt(0) };
        
        el.dispatchEvent(new KeyboardEvent('keydown', keyInit));
        
        const beforeInputEvent = new InputEvent('beforeinput', {
          ...common,
          inputType: 'insertText',
          data: char
        });
        el.dispatchEvent(beforeInputEvent);
        
        if (!beforeInputEvent.defaultPrevented) {
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
        
        el.dispatchEvent(new InputEvent('input', { ...common, inputType: 'insertText', data: char }));
        el.dispatchEvent(new KeyboardEvent('keyup', keyInit));

        if (['.', ',', '!', '?'].includes(char)) await wait(150 + Math.random() * 150);
    }
    
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    
    // Nudge LinkedIn editor
    try {
        document.execCommand('insertText', false, ' ');
        el.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: ' ' }));
        await wait(50);
        document.execCommand('delete', false, null);
        el.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'deleteContentBackward' }));
    } catch(e) {}
    
    el.dispatchEvent(new Event('blur', { bubbles: true }));
    await wait(100);
    el.focus({ preventScroll: true });
    await wait(500);
  }
`;

export function createLinkedInTools(ctx: SiteToolContext): DynamicStructuredTool[] {
    const searchTool = new DynamicStructuredTool({
        name: 'linkedin_search',
        description: 'Search LinkedIn for people, jobs, or posts.',
        schema: z.object({
            query: z.string().optional().describe('Search query (keywords)'),
            instruction: z.string().optional().describe('Natural language instruction for AI to generate keywords'),
            type: z.enum(['people', 'jobs', 'posts', 'companies', 'groups', 'events', 'courses', 'schools', 'services', 'all']).nullable().describe('Search type (default: all)').default('all'),
        }),
        func: async ({ query, instruction, type }: { query?: string; instruction?: string; type: string | null }) => {
            const finalType = type || 'all';
            let finalQuery = query || '';

            // Smart Generation
            if (instruction) {
                try {
                    const settings = store.get('ai') as any;
                    if (settings?.enabled && settings?.selectedModel) {
                        const modelConfig = settings.models.find((m: any) => m.id === settings.selectedModel);
                        const provider = settings.providers.find((p: any) => p.type === modelConfig?.provider);

                        if (modelConfig && provider) {
                            const model = createChatModel(provider, modelConfig, { streaming: false, safeMode: true });
                            const prompt = `You are a LinkedIn Search Expert.
Translate the following natural language instruction into an OPTIMAL Boolean search query (using AND, OR, NOT, parentheses).
Do NOT include "site:linkedin.com" or any URL parts. Just the keywords/boolean operators.
Keep it concise.
INSTRUCTION: "${instruction}"
SEARCH QUERY:`;

                            const response = await model.invoke([new HumanMessage(prompt)]);
                            finalQuery = typeof response.content === 'string' ? response.content.trim().replace(/^["']|["']$/g, '') : finalQuery;
                        }
                    }
                } catch (error) {
                    console.error('Failed to generate search query from instruction:', error);
                    if (!finalQuery) finalQuery = instruction; // Fallback
                }
            }

            if (!finalQuery) {
                return JSON.stringify({ success: false, error: 'No query or instruction provided.' });
            }

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
                    all: 'all'
                };

                const params = new URLSearchParams();
                params.set('keywords', finalQuery);

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

    const advancedSearchTool = new DynamicStructuredTool({
        name: 'linkedin_advanced_search',
        description: 'Perform an advanced LinkedIn search with filters (People search focused).',
        schema: z.object({
            keywords: z.string().describe('Search keywords'),
            network: z.array(z.enum(['1', '2', '3+'])).optional().describe('Connection levels'),
            location: z.string().optional().describe('Location name (adds to keywords if not a URN)'),
            title: z.string().optional().describe('Filter by job title'),
            company: z.string().optional().describe('Filter by company name'),
        }),
        func: async ({ keywords, network, location, title, company }) => {
            try {
                const contents = ctx.getContents();
                const params = new URLSearchParams();

                let query = keywords;
                if (title) query += ` title:("${title}")`;
                if (company) query += ` company:("${company}")`;
                if (location && !location.match(/^\d+$/)) query += ` location:("${location}")`;

                params.set('keywords', query);
                params.set('origin', 'FACETED_SEARCH');

                if (network && network.length > 0) {
                    const netMap: Record<string, string> = { '1': 'F', '2': 'S', '3+': 'O' };
                    const nets = network.map(n => netMap[n]);
                    params.set('network', JSON.stringify(nets));
                }

                // If location is a URN (digits only), use geoUrn
                if (location && location.match(/^\d+$/)) {
                    params.set('geoUrn', JSON.stringify([location]));
                }

                const url = `https://www.linkedin.com/search/results/people/?${params.toString()}`;
                await contents.loadURL(url);
                return JSON.stringify({ success: true, url });
            } catch (error) {
                return JSON.stringify({ success: false, error: String(error) });
            }
        }
    });

    const scanPostsTool = new DynamicStructuredTool({
        name: 'linkedin_scan_posts',
        description: 'Extract visible posts from the LinkedIn feed or search results.',
        schema: z.object({
            limit: z.number().nullable().default(10).describe('Max posts to extract'),
        }),
        func: async ({ limit }: { limit: number | null }) => {
            try {
                const contents = ctx.getContents();
                const result = await contents.executeJavaScript(`
                    (async function() {
                        ${BASE_SCRIPT_HELPERS}
                        
                        const postSelectors = [
                            '.feed-shared-update-v2',
                            '[data-urn^="urn:li:activity:"]',
                            '.search-content__result',
                            '.feed-shared-card'
                        ];
                        
                        let posts = [];
                        for(const sel of postSelectors) {
                            const found = Array.from(document.querySelectorAll(sel)).filter(isVisible);
                            if(found.length > posts.length) posts = found;
                        }
                        
                        const data = posts.slice(0, ${limit || 10}).map((p, i) => getLinkedInPostData(p, i));
                        return { success: true, count: data.length, posts: data };
                    })()
                `);
                return JSON.stringify(result);
            } catch (error) {
                return JSON.stringify({ success: false, error: String(error) });
            }
        }
    });

    const likeTool = new DynamicStructuredTool({
        name: 'linkedin_like',
        description: 'Like or unlike a LinkedIn post by its index.',
        schema: z.object({
            index: z.number().describe('0-based index of the post in feed'),
            action: z.enum(['like', 'unlike']).default('like'),
        }),
        func: async ({ index, action }: { index: number; action: string }) => {
            try {
                const contents = ctx.getContents();
                const result = await contents.executeJavaScript(`
                    (async function() {
                        const targetAction = ${JSON.stringify(action)};
                        ${POINTER_HELPERS}
                        ${BASE_SCRIPT_HELPERS}
                        
                        const postSelectors = [
                            '.feed-shared-update-v2', 
                            '[data-urn^="urn:li:activity:"]', 
                            '.search-content__result',
                            'li.reusable-search__result-container'
                        ];
                        let posts = [];
                        for(const sel of postSelectors) {
                            const found = Array.from(document.querySelectorAll(sel)).filter(isVisible);
                            if(found.length > posts.length) posts = found;
                        }
                        
                        const target = posts[${index}];
                        if(!target) return { success: false, error: 'Post not found at index ' + ${index} };
                        
                        target.scrollIntoView({ block: 'center', inline: 'center' });
                        await wait(500);

                        // Find like button with localization support
                        const findLikeBtn = () => {
                            // 1. Try highly specific classes first
                            const specific = target.querySelector('.react-button__trigger, .social-actions-button.react-button__trigger');
                            if (specific) return specific;

                            // 2. Try common aria-labels (EN, PT, ES)
                            const selectors = [
                                'button[aria-label*="React Like"]', // Exact match for user's screenshot
                                'button[aria-label*="Like"]', 
                                'button[aria-label*="Gostei"]', 
                                'button[aria-label*="Recomendar"]',
                                'button[aria-label*="Unlike"]', 
                                'button[aria-label*="remover"]'
                            ];
                            
                            for (const sel of selectors) {
                                const btn = target.querySelector(sel);
                                if (btn) return btn;
                            }
                            
                            // 3. Fallback to generic action bar buttons
                            return target.querySelector('.feed-shared-social-action-bar__action-button');
                        };

                        const likeBtn = findLikeBtn();
                        if (!likeBtn) return { success: false, error: 'Like button not found' };
                        
                        const label = (likeBtn.getAttribute('aria-label') || '').toLowerCase();
                        const isLiked = likeBtn.getAttribute('aria-pressed') === 'true' || 
                                        label.includes('unlike') ||
                                        label.includes('remover') ||
                                        label.includes('quitar') ||
                                        label.includes('cancelar');

                        if (targetAction === 'like' && isLiked) return { success: true, message: 'Already liked' };
                        if (targetAction === 'unlike' && !isLiked) return { success: true, message: 'Already not liked' };
                        
                        await safeClick(likeBtn, targetAction === 'like' ? 'Like' : 'Unlike');
                        return { success: true, message: 'Post ' + targetAction + 'd' };
                    })()
                `);
                return JSON.stringify(result);
            } catch (error) {
                return JSON.stringify({ success: false, error: String(error) });
            }
        }
    });

    const commentTool = new DynamicStructuredTool({
        name: 'linkedin_comment',
        description: 'Comment on a LinkedIn post by its index.',
        schema: z.object({
            index: z.number().describe('Index of the post to comment on'),
            text: z.string().describe('The comment text'),
        }),
        func: async ({ index, text }: { index: number; text: string }) => {
            try {
                const contents = ctx.getContents();
                const result = await contents.executeJavaScript(`
                    (async function() {
                        ${POINTER_HELPERS}
                        ${BASE_SCRIPT_HELPERS}
                        
                        const postSelectors = [
                            '.feed-shared-update-v2', 
                            '[data-urn^="urn:li:activity:"]', 
                            '.search-content__result',
                            'li.reusable-search__result-container'
                        ];
                        let posts = [];
                        for(const sel of postSelectors) {
                            const found = Array.from(document.querySelectorAll(sel)).filter(isVisible);
                            if(found.length > posts.length) posts = found;
                        }
                        
                        const target = posts[${index}];
                        if(!target) return { success: false, error: 'Post not found at index ' + ${index} };
                        
                        // 0. Idempotency Check: Already commented with this text?
                        const checkExisting = () => {
                            const comments = Array.from(target.querySelectorAll('article.comments-comment-entity, .comments-comment-item'));
                            return comments.some(c => {
                                const text = (c.querySelector('.update-components-text, .comments-comment-item__main-content')?.innerText || '').trim();
                                return text === ${JSON.stringify(text)}.trim();
                            });
                        };
                        
                        if (checkExisting()) {
                            return { success: true, message: 'Already commented with this text' };
                        }

                        const findEditor = () => {
                            return target.querySelector('.ql-editor[contenteditable="true"], .editor-content[contenteditable="true"], [role="textbox"][contenteditable="true"], .comments-comment-box__editor-container [contenteditable="true"]');
                        };

                        // 1. Ensure comment box is open
                        let editor = findEditor();
                        if (!editor) {
                            log('Editor not found, attempting to trigger comment box');
                            const commentBtn = Array.from(target.querySelectorAll('button')).find(b => {
                                const t = b.innerText.toLowerCase();
                                return t.includes('comment') || t.includes('comentar');
                            });
                            const placeholder = target.querySelector('.comments-comment-box__placeholder, .comment-box-placeholder');
                            
                            const trigger = placeholder || commentBtn;
                            if (!trigger) return { success: false, error: 'Could not find a way to open the comment box' };
                            
                            await safeClick(trigger, 'Comment Trigger');
                            await wait(1200);
                            editor = findEditor();
                        }

                        if (!editor) return { success: false, error: 'Comment editor still not found after click' };
                        
                        // 2. Focus and Insert
                        log('Typing comment text...');
                        await humanType(editor, ${JSON.stringify(text)});
                        
                        // MUST fire events for the "Post" button to enable
                        const events = ['input', 'change', 'keyup'];
                        for (const ev of events) {
                            editor.dispatchEvent(new Event(ev, { bubbles: true }));
                        }
                        editor.blur();
                        editor.focus();
                        await wait(800);
                        
                        // 3. Click Post Button (localized)
                        const findSubmit = () => {
                            const form = editor.closest('form') || target;
                            const buttons = Array.from(form.querySelectorAll('button'));
                            
                            // Try common labels (EN, PT, ES)
                            const labels = ['post', 'comment', 'comentar', 'publicar', 'enviar'];
                            let btn = buttons.find(b => {
                                const t = (b.innerText || b.textContent || '').trim().toLowerCase();
                                return labels.some(l => t === l || t.startsWith(l));
                            });
                            
                            if (!btn) {
                                btn = buttons.find(b => {
                                    const a = (b.getAttribute('aria-label') || '').toLowerCase();
                                    return labels.some(l => a.includes(l));
                                });
                            }
                            
                            if (!btn) {
                                btn = buttons.find(b => b.classList.contains('artdeco-button--primary'));
                                if (!btn && buttons.length > 0) btn = buttons[buttons.length - 1];
                            }
                            
                            return btn;
                        };
                        
                        const submitBtn = findSubmit();
                        if(!submitBtn) return { success: false, error: 'Post button not found' };
                        
                        log('Clicking Post button...');
                        if (submitBtn.disabled) {
                            log('Button is disabled, forcing enable');
                            submitBtn.disabled = false;
                            submitBtn.removeAttribute('disabled');
                        }
                        
                        await safeClick(submitBtn, 'Post Button');
                        return { success: true, message: 'Comment posted' };
                    })()
                `);
                return JSON.stringify(result);
            } catch (error) {
                return JSON.stringify({ success: false, error: String(error) });
            }
        }
    });

    const connectTool = new DynamicStructuredTool({
        name: 'linkedin_connect',
        description: 'Send a connection request to a LinkedIn user from their profile.',
        schema: z.object({
            message: z.string().nullable().describe('Optional message for the connection request').default(null),
        }),
        func: async ({ message }: { message: string | null }) => {
            try {
                const contents = ctx.getContents();
                const result = await contents.executeJavaScript(`
          (async function() {
            ${POINTER_HELPERS}
            ${BASE_SCRIPT_HELPERS}
            
            const findBtn = (txts) => {
                return Array.from(document.querySelectorAll('button')).find(b => {
                    const t = b.innerText.trim();
                    const a = (b.getAttribute('aria-label') || '').toLowerCase();
                    return txts.some(x => t === x || t.includes(x) || a.includes(x.toLowerCase()));
                });
            };

            // 1. Idempotency Check: Already connected, pending, or following?
            const alreadySent = findBtn(['Message', 'Mensagem', 'Pending', 'Pendente', 'Aguardando', 'Following', 'Seguindo']);
            if (alreadySent) {
                return { success: true, message: 'Already connected, pending, or following' };
            }

            let connectBtn = findBtn(['Connect', 'Conectar']);
            
            if (!connectBtn) {
                const moreBtn = findBtn(['More', 'Mais']) || document.querySelector('button[aria-label*="More"], button[aria-label*="Mais"]');
                if (moreBtn) {
                    await safeClick(moreBtn, 'More Button');
                    await wait(500);
                    const items = Array.from(document.querySelectorAll('[role="menuitem"], .artdeco-dropdown__item'));
                    
                    // Check for idempotency in the menu
                    const menuSent = items.find(i => {
                        const t = i.innerText.trim();
                        return ['Message', 'Mensagem', 'Pending', 'Pendente', 'Following', 'Seguindo'].some(x => t.includes(x));
                    });
                    if (menuSent) return { success: true, message: 'Already connected or pending (detected in menu)' };

                    const connectItem = items.find(i => {
                        const t = i.innerText.trim();
                        return t === 'Connect' || t === 'Conectar';
                    });
                    if (connectItem) {
                        await safeClick(connectItem, 'Connect in Menu');
                        connectBtn = true;
                    }
                }
            } else {
                await safeClick(connectBtn, 'Connect Button');
            }
            
            if (!connectBtn) return { success: false, error: 'Could not find Connect button' };

            await wait(1000);
            
            // Handle the popup
            const addNoteBtn = findBtn(['Add a note', 'Adicionar nota', 'Enviar com nota']);
            const sendBtnWithoutNote = findBtn(['Send without a note', 'Enviar sem nota', 'Send', 'Enviar']);

            if (${JSON.stringify(!!message)} && addNoteBtn) {
                await safeClick(addNoteBtn, 'Add a note');
                await wait(500);
                const textarea = document.querySelector('textarea[name="message"], #custom-message');
                if (textarea) {
                    await humanType(textarea, ${JSON.stringify(message || '')});
                    await wait(500);
                    const finalSend = findBtn(['Send', 'Enviar']);
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
        func: async ({ message }: { message: string }) => {
            try {
                const contents = ctx.getContents();
                const result = await contents.executeJavaScript(`
                (async function() {
                  ${POINTER_HELPERS}
                  ${BASE_SCRIPT_HELPERS}
                  
                  const msgBtn = Array.from(document.querySelectorAll('button, a')).find(b => b.innerText.trim() === 'Message' || b.ariaLabel?.includes('Message'));
                  if (!msgBtn) return { success: false, error: 'Message button not found. Are you connected?' };
                  
                  await safeClick(msgBtn, 'Message Button');
                  
                  await wait(1500);
                  const composer = document.querySelector('.msg-form__contenteditable[contenteditable="true"], .msg-form__textarea');
                  if (!composer) return { success: false, error: 'Chat composer not found' };
                  log('Focusing and typing message...');
                  await humanType(composer, ${JSON.stringify(message)});
                  
                  // Trigger events to enable Send button
                  const evs = ['input', 'change', 'keyup'];
                  for (const ev of evs) {
                      composer.dispatchEvent(new Event(ev, { bubbles: true }));
                  }
                  composer.blur();
                  composer.focus();
                  await wait(800);
                  
                  const findSend = () => {
                      const msgForm = composer.closest('.msg-form') || document;
                      const buttons = Array.from(msgForm.querySelectorAll('button'));
                      const labels = ['send', 'enviar', 'publicar'];
                      return buttons.find(b => {
                          const t = (b.innerText || b.textContent || '').trim().toLowerCase();
                          const a = (b.getAttribute('aria-label') || '').toLowerCase();
                          return labels.some(l => t === l || a.includes(l)) || b.classList.contains('msg-form__send-button');
                      });
                  };

                  const sendBtn = findSend();
                  if (!sendBtn) return { success: false, error: 'Send button not found' };
                  
                  if (sendBtn.disabled) {
                      sendBtn.disabled = false;
                      sendBtn.removeAttribute('disabled');
                  }
                  
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

    const followTool = new DynamicStructuredTool({
        name: 'linkedin_follow',
        description: 'Follow a user from their profile page.',
        schema: z.object({}),
        func: async () => {
            try {
                const contents = ctx.getContents();
                const result = await contents.executeJavaScript(`
                (async function() {
                  ${POINTER_HELPERS}
                  ${BASE_SCRIPT_HELPERS}
                  
                  const findBtn = (txts) => {
                      return Array.from(document.querySelectorAll('button')).find(b => {
                          const t = b.innerText.trim();
                          return txts.some(x => t === x || t.includes(x));
                      });
                  };

                  // Check for "Already following" states
                  const followingBtn = findBtn(['Following', 'Seguindo', 'Pending', 'Pendente']);
                  if (followingBtn) {
                      return { success: true, message: 'Already following or request pending' };
                  }

                  let followBtn = findBtn(['Follow', 'Seguir']);
                  
                  if (!followBtn) {
                      const moreBtn = findBtn(['More', 'Mais']) || document.querySelector('button[aria-label*="More"], button[aria-label*="Mais"]');
                      if (moreBtn) {
                          await safeClick(moreBtn, 'More Button');
                          await wait(500);
                          const items = Array.from(document.querySelectorAll('[role="menuitem"], .artdeco-dropdown__item'));
                          
                          // Check for "already following" in the menu too
                          const followingItem = items.find(i => {
                              const t = i.innerText.trim();
                              return t === 'Following' || t === 'Seguindo' || t === 'Unfollow' || t === 'Parar de seguir';
                          });
                          if (followingItem) return { success: true, message: 'Already following (detected in menu)' };

                          const followItem = items.find(i => {
                              const t = i.innerText.trim();
                              return t === 'Follow' || t === 'Seguir';
                          });
                          if (followItem) {
                              await safeClick(followItem, 'Follow in Menu');
                              followBtn = true;
                          }
                      }
                  } else {
                      await safeClick(followBtn, 'Follow Button');
                  }
                  
                  if (!followBtn) return { success: false, error: 'Could not find Follow button' };

                  return { success: true, message: 'Followed user' };
                })()
              `);
                return JSON.stringify(result);
            } catch (error) {
                return JSON.stringify({ success: false, error: String(error) });
            }
        }
    });

    const extractPeopleTool = new DynamicStructuredTool({
        name: 'linkedin_extract_people',
        description: 'Extract people results from a LinkedIn search results page.',
        schema: z.object({
            limit: z.number().optional().describe('Maximum number of people to extract (max 10 per page)').default(10),
        }),
        func: async ({ limit }) => {
            try {
                const contents = ctx.getContents();
                const result = await contents.executeJavaScript(`
                    (async function() {
                        const results = [];
                        const items = document.querySelectorAll('.reusable-search__result-container, .entity-result');
                        
                        for (let i = 0; i < Math.min(items.length, ${limit || 10}); i++) {
                            const item = items[i];
                            const titleEl = item.querySelector('.entity-result__title-text a');
                            const name = titleEl ? titleEl.innerText.split('\\n')[0].trim() : '';
                            const url = titleEl ? titleEl.href : '';
                            
                            // Remove tracking params from URL
                            const cleanUrl = url.split('?')[0];

                            const headline = item.querySelector('.entity-result__primary-subtitle')?.innerText.trim() || '';
                            const location = item.querySelector('.entity-result__secondary-subtitle')?.innerText.trim() || '';
                            const summary = item.querySelector('.entity-result__summary')?.innerText.trim() || '';

                            if (name && cleanUrl) {
                                results.push({ name, url: cleanUrl, headline, location, summary });
                            }
                        }
                        return results;
                    })()
                `);
                return JSON.stringify({ success: true, people: result });
            } catch (error) {
                return JSON.stringify({ success: false, error: String(error) });
            }
        }
    });

    return [searchTool, advancedSearchTool, scanPostsTool, likeTool, commentTool, connectTool, sendMessageTool, followTool, extractPeopleTool];
}
