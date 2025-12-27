# NavReach (Reavion) - Project Analysis

## Executive Summary

**NavReach** (also known as **Reavion**) is an AI-powered browser automation desktop application built with Electron, React, and TypeScript. It features an embedded browser controlled by an AI agent with a modern, minimalist design inspired by Linear. The application enables autonomous web browsing, social media engagement, lead generation, and workflow automation through visual playbook editing.

---

## Project Overview

| Aspect | Details |
|--------|---------|
| **Name** | Reavion / NavReach |
| **Version** | 0.1.0 |
| **Type** | Desktop Application (Electron) |
| **License** | MIT |
| **Description** | AI-powered browser automation with embedded browser and chat interface |

---

## Technology Stack

### Core Framework
- **Electron** (v33.2.0) - Desktop application framework
- **Vite** (v5.4.10) - Build tool and dev server
- **electron-vite** (v2.3.0) - Electron-specific Vite configuration

### Frontend
- **React** (v18.3.1) - UI framework
- **TypeScript** (v5.6.3) - Type safety
- **React Router DOM** (v6.28.0) - Client-side routing

### Styling & UI
- **Tailwind CSS** (v3.4.14) - Utility-first CSS framework
- **Radix UI** - Accessible component primitives (avatar, dialog, dropdown, label, popover, scroll-area, select, separator, switch, tabs, tooltip)
- **Framer Motion** (v11.11.0) - Animations
- **Lucide React** (v0.460.0) - Icon library
- **class-variance-authority** (v0.7.0) - Component variants
- **tailwind-merge** (v2.5.4) - Merge Tailwind classes
- **Sonner** (v1.7.0) - Toast notifications

### State Management & Data
- **Zustand** (v5.0.1) - Lightweight state management
- **Electron Store** (v8.2.0) - Persistent storage
- **Dexie** (v4.0.8) - IndexedDB wrapper for chat history
- **Supabase** (v2.88.0) - Backend services (auth, database)

### AI & Agent Framework
- **LangChain** (v0.3.0) - AI agent framework
  - `@langchain/anthropic` (v0.3.0)
  - `@langchain/community` (v0.3.0)
  - `@langchain/core` (v0.3.0)
  - `@langchain/openai` (v0.3.0)
- **AI SDK** (Vercel) (v4.0.0) - Streaming AI responses
  - `@ai-sdk/anthropic` (v1.0.0)
  - `@ai-sdk/openai` (v1.0.0)
- **Zod** (v3.23.8) - Schema validation for tools

### MCP (Model Context Protocol)
- **@modelcontextprotocol/sdk** (v1.0.0) - MCP client implementation

### Workflow & Visualization
- **ReactFlow** (v11.11.4) - Visual workflow editor for playbooks
- **Dagre** (v0.8.5) - Graph layout algorithm

### Other Utilities
- **date-fns** (v4.1.0) - Date manipulation
- **react-markdown** (v9.0.1) - Markdown rendering
- **react-resizable-panels** (v2.1.4) - Resizable UI panels
- **react-syntax-highlighter** (v15.6.6) - Code syntax highlighting
- **uuid** (v10.0.0) - Unique ID generation
- **dotenv** (v17.2.3) - Environment variables

---

## Architecture

### Process Structure

```
┌─────────────────────────────────────────────────────────────────┐
│                        Electron Main Process                   │
│  ┌─────────────────────────────────────────────────────────┐  │
│  │  IPC Handlers                                          │  │
│  │  ├── browser.ts    (Browser control)                   │  │
│  │  ├── mcp.ts        (MCP server management)              │  │
│  │  ├── settings.ts   (Settings management)                 │  │
│  │  └── ai.ts        (AI agent orchestration)              │  │
│  └─────────────────────────────────────────────────────────┘  │
│  ┌─────────────────────────────────────────────────────────┐  │
│  │  Services                                             │  │
│  │  ├── ai.ts           (LangChain agent setup)            │  │
│  │  ├── browser-tools.ts (Browser automation tools)        │  │
│  │  ├── target-tools.ts (Target management tools)          │  │
│  │  ├── playbook-tools.ts (Playbook execution tools)      │  │
│  │  ├── integration-tools.ts (Integration tools)            │  │
│  │  ├── utility-tools.ts (Utility functions)               │  │
│  │  └── site-tools/      (Platform-specific tools)        │  │
│  │      ├── x-com.ts      (X/Twitter)                    │  │
│  │      ├── reddit.ts     (Reddit)                        │  │
│  │      ├── linkedin.ts   (LinkedIn)                      │  │
│  │      ├── instagram.ts  (Instagram)                     │  │
│  │      └── bluesky.ts    (Bluesky)                      │  │
│  └─────────────────────────────────────────────────────────┘  │
│  ┌─────────────────────────────────────────────────────────┐  │
│  │  Libraries                                            │  │
│  │  ├── supabase.ts    (Supabase client)                 │  │
│  │  └── store.ts       (Electron Store)                   │  │
│  └─────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
                              │
                              │ IPC (Inter-Process Communication)
                              │
┌─────────────────────────────────────────────────────────────────┐
│                    Electron Renderer Process                   │
│  ┌─────────────────────────────────────────────────────────┐  │
│  │  React Application                                     │  │
│  │  ├── App.tsx          (Root component)                │  │
│  │  ├── MainLayout.tsx    (Main layout wrapper)          │  │
│  │  ├── AuthScreen.tsx    (Authentication screen)          │  │
│  │  └── WelcomeScreen.tsx (Welcome/onboarding)           │  │
│  └─────────────────────────────────────────────────────────┘  │
│  ┌─────────────────────────────────────────────────────────┐  │
│  │  Components                                          │  │
│  │  ├── browser/        (Browser view components)          │  │
│  │  ├── chat/           (Chat interface components)        │  │
│  │  ├── layout/         (Layout components)               │  │
│  │  ├── playbooks/      (Playbook editor components)      │  │
│  │  ├── settings/       (Settings panels)                 │  │
│  │  ├── targets/        (Target management components)      │  │
│  │  ├── debug/          (Debug panel)                     │  │
│  │  └── ui/             (Base UI components)              │  │
│  └─────────────────────────────────────────────────────────┘  │
│  ┌─────────────────────────────────────────────────────────┐  │
│  │  State Management (Zustand)                          │  │
│  │  ├── app.store.ts      (UI state)                     │  │
│  │  ├── chat.store.ts     (Chat state)                   │  │
│  │  ├── browser.store.ts  (Browser state)                 │  │
│  │  ├── settings.store.ts (Settings cache)                │  │
│  │  ├── debug.store.ts   (Debug state)                   │  │
│  │  ├── targets.store.ts  (Target lists state)            │  │
│  │  └── auth.store.ts    (Authentication state)          │  │
│  └─────────────────────────────────────────────────────────┘  │
│  ┌─────────────────────────────────────────────────────────┐  │
│  │  Services                                            │  │
│  │  └── playbookService.ts (Playbook CRUD operations)      │  │
│  └─────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

### Directory Structure

```
navreach-desktop/
├── .agent/                    # Agent workflows (slash commands)
├── build/                     # Build assets (icons)
├── docs/                      # Documentation
│   ├── ARCHITECTURE.md        # Technical architecture
│   ├── DESIGN_SYSTEM.md       # Design system guide
│   └── RULES.md              # Development rules
├── src/
│   ├── main/                  # Electron main process
│   │   ├── index.ts           # Main entry point
│   │   ├── preload.ts         # Preload script (IPC bridge)
│   │   ├── ipc/              # IPC handlers
│   │   │   ├── browser.ts     # Browser control handlers
│   │   │   ├── mcp.ts         # MCP server management
│   │   │   └── settings.ts    # Settings handlers
│   │   ├── lib/              # Main process libraries
│   │   │   └── supabase.ts   # Supabase client
│   │   └── services/         # Business logic
│   │       ├── ai.ts          # AI agent orchestration
│   │       ├── browser-tools.ts
│   │       ├── target-tools.ts
│   │       ├── playbook-tools.ts
│   │       ├── integration-tools.ts
│   │       ├── utility-tools.ts
│   │       └── site-tools/    # Platform-specific tools
│   │           ├── index.ts
│   │           ├── x-com.ts
│   │           ├── reddit.ts
│   │           ├── linkedin.ts
│   │           ├── instagram.ts
│   │           ├── bluesky.ts
│   │           └── types.ts
│   ├── renderer/              # React application
│   │   ├── App.tsx           # Root component
│   │   ├── main.tsx          # React entry point
│   │   ├── index.html
│   │   ├── components/        # UI components
│   │   │   ├── browser/
│   │   │   ├── chat/
│   │   │   ├── layout/
│   │   │   ├── playbooks/
│   │   │   ├── settings/
│   │   │   ├── targets/
│   │   │   ├── debug/
│   │   │   └── ui/
│   │   ├── stores/           # Zustand stores
│   │   ├── services/         # Renderer services
│   │   ├── lib/              # Utilities
│   │   ├── styles/           # Global styles
│   │   └── types/           # Renderer types
│   └── shared/               # Shared code
│       └── types/            # Shared types
├── electron-builder.json      # Electron builder config
├── electron.vite.config.ts   # Vite config for Electron
├── package.json
├── tailwind.config.js
├── tsconfig.json
└── .env.example
```

---

## Key Features

### 1. Embedded Browser
- WebView-based browser with full navigation controls
- Tab management
- URL bar with navigation history
- Controlled by AI agent through IPC
- Visual feedback (click animations, element highlighting)

### 2. AI Agent Chat
- Model selection dropdown (OpenAI, Anthropic, OpenRouter, Custom)
- Streaming responses
- Conversation memory (persisted to IndexedDB)
- Tool execution visualization
- Collapsible panel
- Infinite mode for continuous execution
- Timer-based run limits

### 3. Browser Control Tools
| Tool | Description |
|------|-------------|
| `browser_navigate` | Navigate to URL |
| `browser_click` | Click element by CSS selector |
| `browser_type` | Type text into input |
| `browser_scroll` | Scroll page up/down |
| `browser_dom_snapshot` | Capture interactive elements |
| `browser_vision_snapshot` | Semantic page analysis |
| `browser_screenshot` | Capture visual screenshot |
| `browser_wait` | Wait for specified time |
| `browser_click_coordinates` | Click at x,y coordinates |
| `browser_highlight_elements` | Visually highlight elements |
| `browser_inspect_element` | Get detailed element info |
| `browser_get_accessibility_tree` | Get accessibility tree |
| `browser_mark_page` | Overlay numeric labels on elements |
| `browser_draw_grid` | Draw coordinate grid overlay |

### 4. Platform-Specific Tools
| Platform | Tools |
|----------|-------|
| **X (Twitter)** | `x_search`, `x_advanced_search`, `x_scout_topics`, `x_scout_community`, `x_like`, `x_reply`, `x_post`, `x_follow`, `x_engage` |
| **Reddit** | `reddit_search`, `reddit_scout_community`, `reddit_vote`, `reddit_comment`, `reddit_join` |
| **LinkedIn** | `linkedin_search`, `linkedin_connect`, `linkedin_message` |
| **Instagram** | `instagram_post`, `instagram_engage` |
| **Bluesky** | `bluesky_post`, `bluesky_reply` |

### 5. Playbook System
- Visual workflow editor using ReactFlow
- Node types: Start, End, Navigate, Loop, Condition, Wait, Humanize, Approval, Pause, API Call, MCP Call
- Drag-and-drop node palette
- Auto-layout with Dagre
- Copy/paste support
- Playbook execution by AI agent
- Stored in Supabase database

### 6. Target Management
- CSV import for target lists
- Target list CRUD operations
- Integration with playbooks for bulk operations
- Stored in Supabase database

### 7. Settings
- **MCP Servers**: Add/edit/remove MCP servers (stdio & SSE)
- **API Tools**: Configure external APIs as agent tools
- **Model Providers**: Manage AI provider credentials (OpenAI, Anthropic, OpenRouter, Custom)
- **General**: Theme, sidebar, chat panel preferences

### 8. Authentication
- Supabase-based authentication
- Google OAuth integration
- Session persistence
- Deep link handling for auth callbacks

---

## IPC Communication

| Channel | Direction | Purpose |
|---------|-----------|---------|
| `browser:navigate` | Renderer → Main | Navigate browser to URL |
| `browser:click` | Renderer → Main | Click element |
| `browser:type` | Renderer → Main | Type text |
| `browser:screenshot` | Renderer → Main | Capture screenshot |
| `browser:extract` | Renderer → Main | Extract content |
| `mcp:connect` | Renderer → Main | Connect MCP server |
| `mcp:disconnect` | Renderer → Main | Disconnect MCP server |
| `mcp:call-tool` | Renderer → Main | Call MCP tool |
| `settings:get` | Renderer → Main | Get setting |
| `settings:set` | Renderer → Main | Set setting |
| `settings:get-all` | Renderer → Main | Get all settings |
| `ai:chat` | Renderer → Main | Send chat message |
| `ai:chat-sync` | Renderer → Main | Sync chat request |
| `ai:suggest` | Renderer → Main | Get suggestions |
| `ai:stop` | Renderer → Main | Stop agent execution |
| `ai:stream-chunk` | Main → Renderer | Stream AI response |
| `debug:log` | Main → Renderer | Debug log messages |
| `window:minimize` | Renderer → Main | Minimize window |
| `window:maximize` | Renderer → Main | Maximize/restore window |
| `window:close` | Renderer → Main | Close window |
| `supabase:auth-callback` | Main → Renderer | Auth callback |

---

## State Management

### Zustand Stores

| Store | Purpose | Persisted |
|-------|---------|-----------|
| `appStore` | UI state (sidebar, theme, chat panel, active view) | Yes |
| `chatStore` | Chat messages, history, model selection, streaming state | Yes |
| `browserStore` | Browser state, tabs, current URL | No |
| `settingsStore` | Settings cache | No |
| `debugStore` | Debug state | No |
| `targetsStore` | Target lists state | No |
| `authStore` | Authentication state | No |

---

## Design System

### Color Palette (Dark Mode - Default)
```css
--background: #0A0A0B
--foreground: #FAFAFA
--card: #0F0F11
--primary: #7C3AED (Purple)
--border: #26262B
--muted: #1F1F23
```

### Typography
- Font: Inter (sans-serif), JetBrains Mono (monospace)
- Scale: xs (11px), sm (13px), base (14px), lg (16px), xl (18px), 2xl (24px)

### Spacing
- Base unit: 4px
- Scale: 0.5 (2px), 1 (4px), 2 (8px), 3 (12px), 4 (16px), 5 (20px), 6 (24px), 8 (32px), 10 (40px), 12 (48px)

### Border Radius
- sm: 4px, md: 6px, lg: 8px, xl: 12px, full: 9999px

### Layout
```
┌─────────────────────────────────────────────────────────┐
│ Window Controls (macOS style)                           │
├──────┬──────────────────────────────────┬───────────────┤
│      │                                  │               │
│  S   │                                  │    Chat       │
│  I   │         Main Content             │    Panel      │
│  D   │         (Browser/Settings)       │               │
│  E   │                                  │               │
│  B   │                                  │               │
│  A   │                                  │               │
│  R   │                                  │               │
│      │                                  │               │
└──────┴──────────────────────────────────┴───────────────┘
```

---

## Development Rules

### Code Style
- TypeScript strict mode
- Functional components with hooks
- Named exports over default exports
- Files under 300 lines
- One component per file

### Naming Conventions
- Files: kebab-case (utilities), PascalCase (components)
- Components: PascalCase
- Hooks: camelCase with `use` prefix
- Stores: camelCase with `.store.ts` suffix
- Types: PascalCase, interfaces preferred
- Constants: SCREAMING_SNAKE_CASE

### Import Order
1. React and React-related
2. Third-party libraries
3. Internal components
4. Hooks
5. Stores
6. Utils/lib
7. Types
8. Styles

### Git Commit Format
`type(scope): description`

Types: `feat`, `fix`, `refactor`, `style`, `docs`, `chore`

---

## Security Considerations

- Context isolation enabled
- Node integration disabled in renderer
- Preload script for safe IPC exposure
- API keys stored securely in Electron Store
- CSP headers configured
- Input validation on IPC handlers
- URL sanitization before navigation

---

## Build & Scripts

| Script | Description |
|--------|-------------|
| `npm run dev` | Start development server |
| `npm run build` | Build for production |
| `npm run preview` | Preview production build |
| `npm run build:win` | Build for Windows |
| `npm run build:mac` | Build for macOS |
| `npm run build:linux` | Build for Linux |
| `npm run lint` | Run ESLint |
| `npm run typecheck` | Run TypeScript type checking |

---

## External Dependencies

### Supabase
- Authentication (Google OAuth)
- Database (Playbooks, Target Lists)
- Real-time subscriptions

### AI Model Providers
- OpenAI (GPT models)
- Anthropic (Claude models)
- OpenRouter (Multi-provider access)
- Custom providers (via baseURL)

### MCP Servers
- stdio transport (local processes)
- SSE transport (remote servers)

---

## Known Features & Capabilities

1. **Autonomous Agent Execution**
   - Tool-based agent with LangChain
   - Streaming responses
   - Stop/resume capability
   - Infinite mode for continuous tasks
   - Timer-based run limits

2. **Visual Playbook Editor**
   - Drag-and-drop workflow creation
   - Node-based visual programming
   - Auto-layout
   - Copy/paste support
   - Playbook import/export

3. **Multi-Platform Social Engagement**
   - X/Twitter automation
   - Reddit engagement
   - LinkedIn outreach
   - Instagram posting
   - Bluesky interaction

4. **Target Management**
   - CSV import
   - Target list CRUD
   - Bulk operations via playbooks

5. **Debug Capabilities**
   - Debug panel with logs
   - Browser console log capture
   - Element inspection
   - Visual highlighting

---

## Potential Areas for Improvement

1. **Testing**
   - No visible test files in the project
   - Could benefit from unit tests (Vitest)
   - E2E tests (Playwright) mentioned in docs

2. **Error Handling**
   - Some error handling exists but could be more comprehensive
   - User-facing error messages could be improved

3. **Documentation**
   - Good architecture and design system docs
   - Could use more inline code documentation
   - API documentation for IPC handlers

4. **Performance**
   - Large AI service file (927 lines) - could be split
   - Browser tools file (1005 lines) - could be modularized

5. **Type Safety**
   - Some `any` types used (e.g., in PlaybookEditor)
   - Could benefit from stricter typing

---

## Conclusion

NavReach is a well-architected Electron application that combines modern web technologies with AI capabilities to create a powerful browser automation platform. The codebase follows good practices with clear separation of concerns, comprehensive state management, and a thoughtful design system. The playbook system provides a visual interface for creating complex automation workflows, while the AI agent enables autonomous execution of these workflows across multiple social platforms.
