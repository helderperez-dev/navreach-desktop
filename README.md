# Reavion

Reavion is an AI-powered browser automation desktop application built with Electron, React, and TypeScript. It features an embedded browser controlled by an AI agent with a modern, minimalist design inspired by Linear.

## Features

- **Embedded Browser**: Full-featured browser with tab management, navigation controls, and webview support
- **AI Agent Chat**: Conversational Reavion Agent with model selection and conversation memory
- **Browser Control Tools**: AI can navigate, click, type, screenshot, and extract content from web pages
- **MCP Integration**: Model Context Protocol client for stdio and SSE servers
- **API Tools**: Configure external APIs as tools for the AI agent
- **Multi-Provider Support**: OpenAI, Anthropic, OpenRouter, and custom providers
- **Dark/Light Mode**: Linear-inspired design system with theme support
- **Collapsible UI**: Sidebar and chat panel can be collapsed for more screen space

## Tech Stack

- **Electron** - Desktop application framework
- **Vite** - Build tool and dev server
- **React 18** - UI framework
- **TypeScript** - Type safety
- **Tailwind CSS** - Utility-first styling
- **Radix UI** - Accessible component primitives
- **Framer Motion** - Animations
- **Zustand** - State management
- **LangChain** - AI agent framework
- **MCP SDK** - Model Context Protocol client

## Getting Started

### Prerequisites

- Node.js 18+ 
- npm or yarn

### Installation

```bash
# Clone the repository
git clone <repository-url>
cd reavion

# Install dependencies
npm install

# Start development server
npm run dev
```

### Build

```bash
# Build for production
npm run build

# Build for specific platform
npm run build:mac
npm run build:win
npm run build:linux
```

## Project Structure

```
reavion/
├── docs/                    # Documentation
│   ├── ARCHITECTURE.md      # Technical architecture
│   ├── DESIGN_SYSTEM.md     # Design system guide
│   └── RULES.md             # Development rules
├── src/
│   ├── main/                # Electron main process
│   │   ├── index.ts         # Main entry point
│   │   ├── preload.ts       # Preload script
│   │   └── ipc/             # IPC handlers
│   ├── renderer/            # React application
│   │   ├── components/      # UI components
│   │   ├── stores/          # Zustand stores
│   │   ├── hooks/           # Custom hooks
│   │   └── styles/          # Global styles
│   └── shared/              # Shared types
├── electron-builder.json    # Build configuration
├── electron.vite.config.ts  # Vite configuration
└── tailwind.config.js       # Tailwind configuration
```

## Configuration

### Model Providers

Add AI model providers in Settings > Model Providers:

1. Click "Add Provider"
2. Select provider type (OpenAI, Anthropic, OpenRouter, Custom)
3. Enter your API key
4. Enable the provider

### MCP Servers

Configure MCP servers in Settings > MCP Servers:

**stdio example:**
```json
{
  "name": "filesystem",
  "command": "npx",
  "args": ["-y", "@modelcontextprotocol/server-filesystem", "/path/to/dir"]
}
```

**SSE example:**
```json
{
  "name": "remote-server",
  "transport": {
    "type": "sse",
    "url": "https://example.com/mcp/sse"
  }
}
```

### API Tools

Add custom API endpoints as tools in Settings > API Tools:

1. Click "Add API Tool"
2. Configure name, method, endpoint URL
3. Use `{{variable}}` for dynamic parameters
4. Add body template for POST/PUT requests

## Development

### Scripts

- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm run lint` - Run ESLint
- `npm run typecheck` - Run TypeScript type checking

### Code Style

See [docs/RULES.md](docs/RULES.md) for development guidelines.

## License

MIT
