# DESIGN.md — ZEROBRAIN Superdash v2

> Machine-parseable design token specification.
> Single source of truth for all visual decisions. No duplicate values elsewhere.
> Format: YAML token blocks + minimal prose. Agents can extract tokens programmatically.
>
> **RFC:** RFC-048968 | **Owner:** UXIA | **Validators:** NIMBUS, DRAGON

---

## Tokens

### colors

```yaml
colors:
  # Backgrounds
  bg-deep: "#080b12"
  bg-mid: "#0c1018"

  # Glass morphism layers
  glass-1: "rgba(16, 22, 36, 0.72)"
  glass-2: "rgba(20, 28, 44, 0.58)"
  glass-3: "rgba(24, 34, 52, 0.45)"
  glass-border: "rgba(88, 166, 255, 0.12)"
  glass-highlight: "rgba(255, 255, 255, 0.04)"

  # Brand / accent
  accent: "#58a6ff"
  accent-glow: "rgba(88, 166, 255, 0.3)"
  accent-soft: "rgba(88, 166, 255, 0.08)"
  gold: "#e3b341"           # OPERATOR sacred color — do not use casually
  gold-soft: "rgba(227, 179, 65, 0.1)"

  # Semantic
  success: "#3fb950"
  warning: "#d29922"
  error: "#f85149"
  purple: "#d2a8ff"
  pink: "#f778ba"

  # Text hierarchy
  text-primary: "#e6edf3"   # Primary body text (alias: --text)
  text-secondary: "#8b949e" # Descriptions, metadata
  text-dim: "#6e7681"       # Timestamps, tertiary labels
  text-tertiary: "#484f58"  # Disabled, decorative

  # Status — node health
  status-healthy: "#3fb950"
  status-stale: "#d29922"
  status-offline: "#f85149"
  status-molting: "#d2a8ff"

  # Status — task states
  task-ready: "#58a6ff"
  task-in-progress: "#3fb950"
  task-review: "#d2a8ff"
  task-blocked: "#f85149"
  task-done: "#6e7681"
```

### typography

```yaml
typography:
  font-family-sans: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif"
  font-family-mono: "'JetBrains Mono', 'Cascadia Code', monospace"

  # Scale
  h1:
    size: "20px"
    weight: 700
    line-height: 1.3
  h2:
    size: "16px"
    weight: 600
    line-height: 1.4
  h3:
    size: "14px"
    weight: 600
    line-height: 1.4
  body-md:
    size: "14px"
    weight: 400
    line-height: 1.55
  body-sm:
    size: "12px"
    weight: 400
    line-height: 1.5
  label:
    size: "11px"
    weight: 500
    line-height: 1.3
    letter-spacing: "0.3px"
  mono:
    size: "13px"
    weight: 400
    line-height: 1.5

  # Weight scale (canonical)
  weight-regular: 400
  weight-medium: 500
  weight-semibold: 600
  weight-bold: 700
```

### spacing

```yaml
spacing:
  # 4px base scale
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "24px"
  2xl: "32px"
  3xl: "48px"
```

### radius

```yaml
radius:
  sm: "8px"
  md: "14px"
  lg: "20px"
  pill: "9999px"
```

### elevation

```yaml
elevation:
  shadow-glass: "0 8px 32px rgba(0, 0, 0, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.04)"
  shadow-elevated: "0 16px 48px rgba(0, 0, 0, 0.6), 0 4px 16px rgba(0, 0, 0, 0.3)"
  shadow-card: "0 4px 12px rgba(0, 0, 0, 0.3)"
  shadow-none: "none"

  # Z-index scale (prevents z-index wars)
  z-base: 0
  z-card: 10
  z-sticky: 100
  z-overlay: 200
  z-modal: 300
  z-toast: 400
  z-tooltip: 500
```

### animation

```yaml
animation:
  duration-fast: "100ms"
  duration-normal: "200ms"
  duration-slow: "350ms"
  duration-ambient: "20s"    # Background drift animations

  easing-default: "cubic-bezier(0.4, 0, 0.2, 1)"
  easing-bounce: "cubic-bezier(0.34, 1.56, 0.64, 1)"
  easing-linear: "linear"

  # Composite shorthand (most common)
  transition-default: "0.3s cubic-bezier(0.4, 0, 0.2, 1)"
  transition-fast: "0.15s ease"
```

### layout

```yaml
layout:
  # Breakpoints
  breakpoint-sm: "640px"
  breakpoint-md: "768px"
  breakpoint-lg: "1024px"
  breakpoint-xl: "1440px"

  # Container widths
  max-width-content: "1200px"
  max-width-panel: "600px"
  max-width-card: "360px"

  # Icon sizes
  icon-sm: "14px"
  icon-md: "18px"
  icon-lg: "24px"
```

### opacity

```yaml
opacity:
  disabled: 0.4
  loading: 0.6
  hover-overlay: 0.06
  active-overlay: 0.1
  dimmed: 0.7
```

### components

```yaml
components:
  card:
    background: "var(--glass-1)"
    border: "1px solid var(--glass-border)"
    radius: "var(--radius-md)"
    padding: "var(--spacing-lg)"
    shadow: "var(--shadow-glass)"

  button-primary:
    background: "var(--accent)"
    color: "#ffffff"
    radius: "var(--radius-sm)"
    padding: "8px 16px"
    font-weight: 500
    font-size: "13px"

  button-secondary:
    background: "rgba(255, 255, 255, 0.06)"
    color: "var(--text-secondary)"
    border: "1px solid var(--glass-border)"
    radius: "var(--radius-sm)"
    padding: "8px 16px"

  badge-status:
    padding: "3px 8px"
    radius: "var(--radius-pill)"
    font-size: "11px"
    font-weight: 500

  node-indicator:
    size: "10px"
    radius: "50%"
    glow-spread: "8px"

  tab-active:
    color: "var(--text-primary)"
    border-bottom: "2px solid var(--accent)"
    font-weight: 600

  tab-inactive:
    color: "var(--text-secondary)"
    border-bottom: "2px solid transparent"
    font-weight: 400
```

---

## Variable Alias Map

Canonical aliases to resolve current drift:

| Used in code | Canonical token | Value |
|---|---|---|
| `--text` | `text-primary` | `#e6edf3` |
| `--text-primary` | `text-primary` | `#e6edf3` |
| `--text-dim` | `text-dim` | `#6e7681` |
| `--text-secondary` | `text-secondary` | `#8b949e` |
| `--text-tertiary` | `text-tertiary` | `#484f58` |
| `--node-color` | Per-node dynamic | `var(--accent)` fallback |

---

## Enforcement

- This file is the SINGLE SOURCE for design values
- CSS files must reference `var(--token-name)` not raw hex/rgba
- Future: linter validates no raw color values in CSS/JS outside this spec
- Token changes require RFC or PM approval (visual consistency is a fleet asset)
