# Reavion Design System - Neutral Dark Palette

This document defines the standard color palette and design tokens for Reavion. Follow these guidelines to ensure visual consistency across all components.

## Core Principles
1. **Neutral Grayscale**: No blue, purple, or warm tints in the dark mode. Use strictly saturation `0%` for all background and surface colors.
2. **Soft Borders**: High-contrast lines create visual noise. Layout borders should almost always use `border-border/10` (10% opacity) unless a distinct separation is absolutely necessary.
3. **Layered Surface Contrast**:
    - **Sidebar (Left)**: Slightly raised (`5%` lightness).
    - **Titlebar (Top)**: Same as background (`3.9%` lightness) to anchor the app.
    - **Main Background**: Deep neutral black (`3.9%` lightness).
    - **Interactive Cards**: Subtle elevation (`bg-muted/20` or darker variations).

## CSS Variables (Dark Mode)

Located in `src/renderer/styles/globals.css`:

```css
.dark {
  /* Layout & Backgrounds */
  --background: 0 0% 3.9%;     /* Main workspace background */
  --sidebar: 0 0% 5%;          /* Main navigation sidebar */
  --card: 0 0% 3.9%;           /* Generic surface background */
  
  /* Text & Content */
  --foreground: 0 0% 98%;      /* Primary text (almost white) */
  --muted-foreground: 0 0% 63.9%; /* Secondary/Hint text */
  
  /* Borders & Inputs */
  --border: 0 0% 12%;          /* Base border token */
  --input: 0 0% 12%;           /* Input fields */
  
  /* Interactive Elements */
  --primary: 0 0% 98%;         /* Primary actions */
  --secondary: 0 0% 14.9%;     /* Secondary buttons/hover states */
  --muted: 0 0% 14.9%;         /* Muted backgrounds */
  --accent: 0 0% 14.9%;        /* Highlighted elements */
}
```

## Border Usage Standards
To avoid the "prison bars" effect (crossing hard lines), always prefer low-opacity borders for UI scaffolding:

- **Layout Dividers**: `border-border/10`
- **Subtle Row Separators**: `border-border/5`
- **Card Outlines**: `border-border/10`
- **Active Focus**: `border-border/30` or `ring-1`

## Background Utility Standards
- **Settings Group Boxes**: `bg-muted/20` with `border-border/10`
- **Table Hover Rows**: `hover:bg-muted/10`
- **Sidebar Icons (Active)**: `bg-muted` with `text-foreground`
## Sidebar & Navigation Organization

### 1. Unified Workspace Selector
The Workspace Selector is positioned at the top of the Sidebar. 
- **Expanded**: Displays the workspace name, initial icon, and a chevron selector.
- **Collapsed**: Displays only the circular initial icon with a tooltip on hover.
- **Visual Style**: Uses `rounded-lg` for the icon and a background of `bg-background/50` for subtle depth.

### 2. Primary Navigation Flow
Navigation items are ordered by workflow logic:
- **Browser**: Discovery and initial research.
- **Playbooks**: Automation logic and workflow creation.
- **Targets**: CRM and data management.
- **Analytics**: Results and tracking.

### 3. Global Actions & Configuration
- **Settings**: Placed at the bottom of the sidebar, separated from the operational flow.
- **Queue/Tasks**: Positioned within the main flow but visually distinct, featuring a badge for pending actions.
- **Title Bar**: Kept minimal with the logo centered and user profile/status on the right.
