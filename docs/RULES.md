# NavReach - Development Rules

## Code Style

### General
- Use TypeScript strict mode
- Prefer functional components with hooks
- Use named exports over default exports
- Keep files under 300 lines; split if larger
- One component per file

### Naming Conventions
- **Files**: kebab-case for utilities, PascalCase for components
- **Components**: PascalCase (e.g., `ChatMessage.tsx`)
- **Hooks**: camelCase with `use` prefix (e.g., `useChat.ts`)
- **Stores**: camelCase with `.store.ts` suffix
- **Types**: PascalCase, interfaces preferred over types
- **Constants**: SCREAMING_SNAKE_CASE

### Imports Order
1. React and React-related
2. Third-party libraries
3. Internal components
4. Hooks
5. Stores
6. Utils/lib
7. Types
8. Styles

### Component Structure
```typescript
// 1. Imports
import { useState } from 'react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import type { ComponentProps } from './types';

// 2. Types (if component-specific)
interface Props extends ComponentProps {
  variant?: 'default' | 'outline';
}

// 3. Component
export function ComponentName({ variant = 'default', ...props }: Props) {
  // Hooks first
  const [state, setState] = useState();
  
  // Derived values
  const computedValue = useMemo(() => {}, []);
  
  // Handlers
  const handleClick = () => {};
  
  // Render
  return (
    <div className={cn('base-classes', variant === 'outline' && 'outline-classes')}>
      {/* content */}
    </div>
  );
}
```

## Styling Rules

### Tailwind
- Use Tailwind utilities; avoid custom CSS
- Use `cn()` helper for conditional classes
- Follow mobile-first responsive design
- Use CSS variables for theme colors

### Class Order (Tailwind)
1. Layout (display, position, flex/grid)
2. Sizing (width, height)
3. Spacing (margin, padding)
4. Typography
5. Colors (background, text, border)
6. Effects (shadow, opacity)
7. Transitions/animations
8. States (hover, focus, active)

### Example
```tsx
<div className="flex items-center justify-between w-full h-12 px-4 text-sm text-foreground bg-card border-b border-border transition-colors hover:bg-accent">
```

## State Management

### Zustand Stores
- Keep stores focused and small
- Use selectors for derived state
- Persist only necessary data
- Use immer for complex updates

```typescript
// Good
const useAppStore = create<AppState>((set) => ({
  sidebarCollapsed: false,
  toggleSidebar: () => set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),
}));

// Usage with selector
const sidebarCollapsed = useAppStore((state) => state.sidebarCollapsed);
```

## IPC Communication

### Naming
- Use namespace:action format
- Examples: `browser:navigate`, `settings:get`, `mcp:connect`

### Handler Pattern
```typescript
// Main process
ipcMain.handle('browser:navigate', async (event, url: string) => {
  // Validate input
  if (!isValidUrl(url)) {
    throw new Error('Invalid URL');
  }
  // Execute action
  return await browserService.navigate(url);
});

// Renderer (via preload)
const result = await window.api.browser.navigate(url);
```

## Error Handling

- Always handle errors at boundaries
- Use toast notifications for user-facing errors
- Log errors with context
- Never expose internal errors to users

```typescript
try {
  await riskyOperation();
} catch (error) {
  console.error('[ServiceName] Operation failed:', error);
  toast.error('Something went wrong. Please try again.');
}
```

## AI Agent Rules

### Tool Definitions
- Use Zod for schema validation
- Provide clear descriptions
- Handle errors gracefully
- Return structured responses

```typescript
const navigateTool = tool({
  name: 'navigate',
  description: 'Navigate the browser to a specific URL',
  schema: z.object({
    url: z.string().url().describe('The URL to navigate to'),
  }),
  execute: async ({ url }) => {
    await window.api.browser.navigate(url);
    return { success: true, url };
  },
});
```

### Memory
- Store conversation history in IndexedDB
- Limit context window to recent messages
- Summarize old conversations
- Clear memory on user request

## Security

### Never
- Store API keys in code
- Expose Node.js APIs to renderer
- Trust user input without validation
- Log sensitive information

### Always
- Use context isolation
- Validate IPC inputs
- Sanitize URLs before navigation
- Use secure storage for credentials

## Testing

- Write tests for critical paths
- Test IPC handlers
- Test AI tools independently
- Use Playwright for E2E tests

## Performance

- Lazy load routes/components
- Virtualize long lists
- Debounce frequent operations
- Memoize expensive computations
- Use React.memo for pure components

## Git Commits

Format: `type(scope): description`

Types:
- `feat`: New feature
- `fix`: Bug fix
- `refactor`: Code refactoring
- `style`: Styling changes
- `docs`: Documentation
- `chore`: Maintenance

Examples:
- `feat(chat): add model selector dropdown`
- `fix(browser): handle navigation errors`
- `refactor(settings): extract MCP form component`
