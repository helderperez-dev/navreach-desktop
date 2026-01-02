import { ipcRenderer } from 'electron';

// Unique selector generation logic
function generateSelector(element: Element): string {
    // 1. Check for data-testid (most robust)
    const testId = element.getAttribute('data-testid');
    if (testId) return `[data-testid="${testId}"]`;

    // 2. Check for ID
    if (element.id) return `#${element.id}`;

    // 3. Accessibility / ARIA
    const ariaLabel = element.getAttribute('aria-label');
    if (ariaLabel) return `[aria-label="${ariaLabel}"]`;

    if (element.tagName.toLowerCase() === 'input') {
        const placeholder = element.getAttribute('placeholder');
        if (placeholder) return `input[placeholder="${placeholder}"]`;
        const name = element.getAttribute('name');
        if (name) return `input[name="${name}"]`;
    }

    if (element.tagName.toLowerCase() === 'button') {
        const text = element.textContent?.trim();
        if (text && text.length < 50) return `button:contains("${text}")`; // Note: custom handling needed in playback for :contains
    }

    // 4. Fallback: Hierarchical path
    let path = [];
    let current = element;
    while (current && current.nodeType === Node.ELEMENT_NODE) {
        let selector = current.tagName.toLowerCase();

        if (current.id) {
            selector += `#${current.id}`;
            path.unshift(selector);
            break; // ID is usually unique enough
        }

        // Add class if specific enough
        if (current.classList.length > 0) {
            // Filter out common utility classes if possible, but for now take first unique-ish looking one
            // or just all of them joined
            // selector += '.' + Array.from(current.classList).join('.');
        }

        // Nth-child if needed
        let sibling = current;
        let nth = 1;
        while (sibling.previousElementSibling) {
            sibling = sibling.previousElementSibling;
            if (sibling.tagName === current.tagName) nth++;
        }
        if (nth > 1) selector += `:nth-of-type(${nth})`;

        path.unshift(selector);
        current = current.parentElement as Element;
    }

    return path.join(' > ');
}

function handleEvent(event: Event) {
    if (!document.body.hasAttribute('data-reavion-recording')) return;

    const target = event.target as HTMLElement;
    const selector = generateSelector(target);
    const timestamp = Date.now();

    if (event.type === 'click') {
        ipcRenderer.send('recorder:action', {
            type: 'click',
            selector,
            timestamp,
            url: window.location.href,
            tagName: target.tagName,
            text: target.textContent?.slice(0, 50)
        });
    } else if (event.type === 'change' || event.type === 'input') {
        // Debounce input? handled in main or renderer
        // For 'change' it's usually fine. 'input' might be too frequent.
        // Let's stick to 'change' for now or handle 'blur' for final value.
        // Actually, for recording, 'change' is safer for final value.
        if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) {
            ipcRenderer.send('recorder:action', {
                type: 'type',
                selector,
                value: target.value,
                timestamp,
                url: window.location.href
            });
        }
    }
}

// Global listener placement
document.addEventListener('click', handleEvent, true); // Capture phase clearly
document.addEventListener('change', handleEvent, true);

// Navigation listener (approximate via load)
window.addEventListener('load', () => {
    if (document.body.hasAttribute('data-reavion-recording')) {
        ipcRenderer.send('recorder:action', {
            type: 'navigation',
            url: window.location.href,
            timestamp: Date.now()
        });
    }
});

console.log('Recorder preload initialized');
