# NavReach - Architecture Documentation

## Overview

NavReach is an Electron-based desktop application featuring an embedded browser controlled by an AI agent. The application follows a modern, minimalist design system inspired by Linear.

## Tech Stack

### Core
- **Electron** - Desktop application framework
- **Vite** - Build tool and dev server
- **React 18** - UI framework
- **TypeScript** - Type safety

### Styling & UI
- **Tailwind CSS** - Utility-first CSS framework
- **Radix UI** - Headless accessible components
- **Framer Motion** - Animations
- **Lucide React** - Icon library
- **class-variance-authority (CVA)** - Component variants
- **tailwind-merge** - Merge Tailwind classes

### AI & Agent
- **LangChain.js** - AI agent framework
- **AI SDK (Vercel)** - Streaming AI responses
- **Zod** - Schema validation for tools

### State Management & Data
- **Zustand** - Lightweight state management
- **Electron Store** - Persistent storage
- **IndexedDB (Dexie)** - Chat history & memory

### MCP (Model Context Protocol)
- **@modelcontextprotocol/sdk** - MCP client implementation

## Project Structure

```
navreach/
├── docs/                          # Documentation
│   ├── ARCHITECTURE.md
│   ├── DESIGN_SYSTEM.md
│   └── RULES.md
├── src/
│   ├── main/                      # Electron main process
│   │   ├── index.ts               # Main entry point
│   │   ├── preload.ts             # Preload script
│   │   ├── ipc/                   # IPC handlers
│   │   │   ├── browser.ts         # Browser control handlers
│   │   │   ├── mcp.ts             # MCP server management
│   │   │   └── settings.ts        # Settings handlers
│   │   └── services/
│   │       ├── mcp-client.ts      # MCP client service
│   │       └── store.ts           # Electron store service
│   ├── renderer/                  # React application
│   │   ├── index.html
│   │   ├── main.tsx               # React entry point
│   │   ├── App.tsx                # Root component
│   │   ├── components/
│   │   │   ├── ui/                # Base UI components
│   │   │   │   ├── button.tsx
│   │   │   │   ├── input.tsx
│   │   │   │   ├── select.tsx
│   │   │   │   ├── dialog.tsx
│   │   │   │   ├── tooltip.tsx
│   │   │   │   └── ...
│   │   │   ├── layout/
│   │   │   │   ├── Sidebar.tsx
│   │   │   │   ├── MainLayout.tsx
│   │   │   │   └── ChatPanel.tsx
│   │   │   ├── browser/
│   │   │   │   ├── BrowserView.tsx
│   │   │   │   ├── BrowserToolbar.tsx
│   │   │   │   └── TabBar.tsx
│   │   │   ├── chat/
│   │   │   │   ├── ChatContainer.tsx
│   │   │   │   ├── ChatInput.tsx
│   │   │   │   ├── ChatMessage.tsx
│   │   │   │   ├── ModelSelector.tsx
│   │   │   │   └── ChatHistory.tsx
│   │   │   └── settings/
│   │   │       ├── SettingsLayout.tsx
│   │   │       ├── MCPSettings.tsx
│   │   │       ├── APIToolsSettings.tsx
│   │   │       └── ModelProvidersSettings.tsx
│   │   ├── hooks/
│   │   │   ├── useTheme.ts
│   │   │   ├── useChat.ts
│   │   │   ├── useBrowser.ts
│   │   │   └── useSettings.ts
│   │   ├── stores/
│   │   │   ├── app.store.ts
│   │   │   ├── chat.store.ts
│   │   │   ├── browser.store.ts
│   │   │   └── settings.store.ts
│   │   ├── lib/
│   │   │   ├── utils.ts           # Utility functions
│   │   │   ├── cn.ts              # Class name helper
│   │   │   └── constants.ts
│   │   ├── services/
│   │   │   ├── ai/
│   │   │   │   ├── agent.ts       # LangChain agent setup
│   │   │   │   ├── tools/         # Browser control tools
│   │   │   │   │   ├── navigate.ts
│   │   │   │   │   ├── click.ts
│   │   │   │   │   ├── type.ts
│   │   │   │   │   ├── screenshot.ts
│   │   │   │   │   └── extract.ts
│   │   │   │   ├── memory.ts      # Conversation memory
│   │   │   │   └── providers.ts   # Model provider configs
│   │   │   └── mcp/
│   │   │       └── client.ts      # MCP client wrapper
│   │   └── styles/
│   │       ├── globals.css        # Global styles & Tailwind
│   │       └── themes.css         # Theme variables
│   └── shared/                    # Shared types & constants
│       ├── types/
│       │   ├── chat.ts
│       │   ├── browser.ts
│       │   ├── settings.ts
│       │   └── mcp.ts
│       └── constants.ts
├── electron-builder.json          # Electron builder config
├── electron.vite.config.ts        # Vite config for Electron
├── package.json
├── tailwind.config.js
├── tsconfig.json
├── tsconfig.node.json
└── tsconfig.web.json
```

## Key Features

### 1. Embedded Browser
- WebView-based browser with full navigation controls
- Tab management
- URL bar with navigation history
- Controlled by AI agent through IPC

### 2. AI Agent Chat
- Model selection dropdown (OpenAI, OpenRouter, Anthropic, etc.)
- Streaming responses
- Conversation memory (persisted to IndexedDB)
- Tool execution visualization
- Collapsible panel

### 3. Browser Control Tools
- `navigate(url)` - Navigate to URL
- `click(selector)` - Click element
- `type(selector, text)` - Type text into element
- `screenshot()` - Capture screenshot
- `extract(selector)` - Extract text content
- `scroll(direction, amount)` - Scroll page
- `waitForElement(selector)` - Wait for element

### 4. Settings
- **MCP Servers**: Add/edit/remove MCP servers (stdio & SSE)
- **API Tools**: Configure external APIs as agent tools
- **Model Providers**: Manage AI provider credentials

## IPC Communication

```
Main Process <-> Renderer Process
├── browser:navigate
├── browser:click
├── browser:type
├── browser:screenshot
├── browser:extract
├── mcp:connect
├── mcp:disconnect
├── mcp:call-tool
├── settings:get
├── settings:set
└── settings:get-all
```

## State Management

Using Zustand for client-side state:
- `appStore` - UI state (sidebar, theme, chat panel)
- `chatStore` - Chat messages, history, model selection
- `browserStore` - Browser state, tabs, current URL
- `settingsStore` - Settings cache

## Security Considerations

- Context isolation enabled
- Node integration disabled in renderer
- Preload script for safe IPC exposure
- API keys stored securely in Electron Store
- CSP headers configured
