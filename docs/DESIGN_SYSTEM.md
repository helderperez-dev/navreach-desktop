# NavReach - Design System

## Philosophy

Inspired by Linear's design system, NavReach follows these principles:
- **Minimalist**: Clean interfaces with purposeful whitespace
- **Functional**: Every element serves a purpose
- **Consistent**: Unified visual language across all screens
- **Accessible**: WCAG 2.1 AA compliant

## Color System

### Light Mode
```css
--background: 0 0% 100%;           /* #FFFFFF */
--foreground: 240 10% 3.9%;        /* #0A0A0B */
--card: 0 0% 100%;
--card-foreground: 240 10% 3.9%;
--popover: 0 0% 100%;
--popover-foreground: 240 10% 3.9%;
--primary: 262 83% 58%;            /* #7C3AED - Purple accent */
--primary-foreground: 0 0% 100%;
--secondary: 240 4.8% 95.9%;
--secondary-foreground: 240 5.9% 10%;
--muted: 240 4.8% 95.9%;
--muted-foreground: 240 3.8% 46.1%;
--accent: 240 4.8% 95.9%;
--accent-foreground: 240 5.9% 10%;
--destructive: 0 84.2% 60.2%;
--destructive-foreground: 0 0% 98%;
--border: 240 5.9% 90%;
--input: 240 5.9% 90%;
--ring: 262 83% 58%;
```

### Dark Mode
```css
--background: 240 10% 3.9%;        /* #0A0A0B */
--foreground: 0 0% 98%;            /* #FAFAFA */
--card: 240 10% 5.9%;              /* #0F0F11 */
--card-foreground: 0 0% 98%;
--popover: 240 10% 5.9%;
--popover-foreground: 0 0% 98%;
--primary: 262 83% 58%;            /* #7C3AED */
--primary-foreground: 0 0% 100%;
--secondary: 240 3.7% 15.9%;
--secondary-foreground: 0 0% 98%;
--muted: 240 3.7% 15.9%;
--muted-foreground: 240 5% 64.9%;
--accent: 240 3.7% 15.9%;
--accent-foreground: 0 0% 98%;
--destructive: 0 62.8% 30.6%;
--destructive-foreground: 0 0% 98%;
--border: 240 3.7% 15.9%;
--input: 240 3.7% 15.9%;
--ring: 262 83% 58%;
```

## Typography

### Font Stack
```css
--font-sans: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
--font-mono: 'JetBrains Mono', 'Fira Code', monospace;
```

### Scale
| Name | Size | Line Height | Weight | Usage |
|------|------|-------------|--------|-------|
| xs | 11px | 16px | 400 | Labels, captions |
| sm | 13px | 20px | 400 | Secondary text |
| base | 14px | 22px | 400 | Body text |
| lg | 16px | 24px | 500 | Subheadings |
| xl | 18px | 28px | 600 | Headings |
| 2xl | 24px | 32px | 600 | Page titles |

## Spacing

Using 4px base unit:
- `0.5`: 2px
- `1`: 4px
- `2`: 8px
- `3`: 12px
- `4`: 16px
- `5`: 20px
- `6`: 24px
- `8`: 32px
- `10`: 40px
- `12`: 48px

## Border Radius

```css
--radius-sm: 4px;
--radius-md: 6px;
--radius-lg: 8px;
--radius-xl: 12px;
--radius-full: 9999px;
```

## Shadows

### Light Mode
```css
--shadow-sm: 0 1px 2px 0 rgb(0 0 0 / 0.05);
--shadow-md: 0 4px 6px -1px rgb(0 0 0 / 0.1);
--shadow-lg: 0 10px 15px -3px rgb(0 0 0 / 0.1);
```

### Dark Mode
```css
--shadow-sm: 0 1px 2px 0 rgb(0 0 0 / 0.3);
--shadow-md: 0 4px 6px -1px rgb(0 0 0 / 0.4);
--shadow-lg: 0 10px 15px -3px rgb(0 0 0 / 0.5);
```

## Components

### Buttons

#### Variants
- **Primary**: Purple background, white text
- **Secondary**: Muted background, foreground text
- **Ghost**: Transparent, hover shows background
- **Destructive**: Red for dangerous actions
- **Outline**: Border only, transparent background

#### Sizes
- **sm**: h-8, px-3, text-xs
- **default**: h-9, px-4, text-sm
- **lg**: h-10, px-6, text-base
- **icon**: h-9, w-9

### Inputs

- Height: 36px (default)
- Border: 1px solid border color
- Border radius: 6px
- Focus: Ring with primary color
- Placeholder: Muted foreground

### Cards

- Background: card color
- Border: 1px solid border color
- Border radius: 8px
- Padding: 16px

### Sidebar

- Width expanded: 240px
- Width collapsed: 56px
- Background: Slightly darker than main
- Transition: 200ms ease

### Chat Panel

- Width: 400px
- Collapsible to 0px
- Resizable (min: 320px, max: 600px)

## Animations

### Transitions
```css
--transition-fast: 150ms ease;
--transition-base: 200ms ease;
--transition-slow: 300ms ease;
```

### Framer Motion Presets
```typescript
// Fade in
{ initial: { opacity: 0 }, animate: { opacity: 1 } }

// Slide in from right
{ initial: { x: 20, opacity: 0 }, animate: { x: 0, opacity: 1 } }

// Scale in
{ initial: { scale: 0.95, opacity: 0 }, animate: { scale: 1, opacity: 1 } }
```

## Icons

Using Lucide React with consistent sizing:
- **sm**: 14px
- **default**: 16px
- **lg**: 20px
- **xl**: 24px

Stroke width: 1.5px (default), 2px (bold)

## Layout

### Main Layout
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

### Sidebar Items
- Icon + Label when expanded
- Icon only when collapsed
- Tooltip on hover when collapsed
- Active state with background highlight

## Accessibility

- Focus visible outlines
- Keyboard navigation support
- ARIA labels on interactive elements
- Sufficient color contrast (4.5:1 minimum)
- Reduced motion support
