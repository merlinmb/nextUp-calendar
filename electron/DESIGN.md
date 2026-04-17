# nextUp Electron Widget Design

This document captures the visual system of the Electron widget so it can be recreated in another project with minimal guesswork. The implementation source of truth is:

- `electron/renderer.html`
- `electron/renderer.css`
- `electron/app.css`
- `electron/main.js`

The widget is a frameless, always-on-top desktop surface that reuses the web app design tokens and adds a compact widget-specific layout.

## 1. Window Shell

Use these window-level constraints first. They define most of the widget's feel.

| Property | Value |
|---|---|
| Window size | `320px × 480px` |
| Window frame | `false` |
| Resizable | `false` |
| Always on top | `true` |
| Skip taskbar | `true` |
| Transparent window | `true` |
| Default position | bottom-right of primary display with `16px` margin |
| Outer corner radius | `10px` (`--r-lg`) |
| Outer shadow | `0 12px 40px rgba(0,0,0,0.8)` (`--shadow-lg`) |

The HTML root and `body` act as the visible card:

```css
html, body {
  width: 320px;
  height: 480px;
  overflow: hidden;
  background: var(--bg-surface);
  border-radius: var(--r-lg);
  box-shadow: var(--shadow-lg);
  user-select: none;
  -webkit-app-region: drag;
}
```

Important behavior:

- The whole shell is draggable by default.
- Interactive regions explicitly opt out with `-webkit-app-region: no-drag`.
- The visible card is not flush to the desktop because the transparent Electron window lets the rounded rectangle and shadow read as a floating widget.

## 2. Theme Mode

The Electron renderer ships with `data-theme="dark"` on the `<html>` element.

- The widget is effectively dark-first.
- `electron/app.css` also contains a light theme, but the renderer does not currently expose a theme switch.
- If you want an exact clone of the shipped widget, use the dark tokens below.

## 3. Typography

### Preferred font families

```css
--font-sans: 'Inter', system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
--font-mono: 'JetBrains Mono', 'SF Mono', 'Fira Code', ui-monospace, monospace;
```

### Font scale

| Token | Value |
|---|---|
| `--fs-xs` | `11px` |
| `--fs-sm` | `12px` |
| `--fs-base` | `13px` |
| `--fs-md` | `14px` |
| `--fs-lg` | `16px` |
| `--fs-xl` | `20px` |
| `--fs-2xl` | `28px` |

### Font weights

| Token | Value |
|---|---|
| `--fw-light` | `300` |
| `--fw-regular` | `400` |
| `--fw-medium` | `500` |
| `--fw-semi` | `600` |

### Line heights

| Token | Value |
|---|---|
| `--lh-tight` | `1.25` |
| `--lh-normal` | `1.5` |
| `--lh-loose` | `1.7` |

### Exact font loading note

The Electron widget declares Inter and JetBrains Mono in CSS, but `electron/renderer.html` does not import the Google Fonts stylesheet. That means:

- On a machine without those fonts installed, the widget falls back to system fonts.
- If you want a visually exact transfer, explicitly load the same families and weights used by the web app:

```html
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link
  href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600&family=JetBrains+Mono:wght@400;500&display=swap"
  rel="stylesheet"
/>
```

Usage in the widget:

- Sans: body copy, wordmark, labels, titles, buttons, date text.
- Mono: event times, token/server input fields, small technical text.

## 4. Spacing, Radius, Motion

### Spacing scale

| Token | Value |
|---|---|
| `--sp-1` | `4px` |
| `--sp-2` | `8px` |
| `--sp-3` | `12px` |
| `--sp-4` | `16px` |
| `--sp-5` | `20px` |
| `--sp-6` | `24px` |
| `--sp-8` | `32px` |
| `--sp-10` | `40px` |

### Radius scale

| Token | Value |
|---|---|
| `--r-sm` | `4px` |
| `--r-md` | `6px` |
| `--r-lg` | `10px` |
| `--r-xl` | `16px` |
| `--r-full` | `9999px` |

### Transitions

| Token | Value |
|---|---|
| `--t-fast` | `120ms ease` |
| `--t-mid` | `200ms ease` |
| `--t-slow` | `350ms cubic-bezier(0.4, 0, 0.2, 1)` |

The widget uses restrained motion only:

- Button hover and pressed states use quick color/background transitions.
- Save button hover uses `filter: brightness(1.15)` rather than a palette swap.
- No animated panel slide is implemented; the settings panel simply appears/disappears.

## 5. Color System

### Dark theme tokens used by the widget

| Token | Value | Use |
|---|---|---|
| `--bg-base` | `#0b0c11` | global app background in shared system |
| `--bg-surface` | `#111318` | widget card, header, settings panel |
| `--bg-raised` | `#181a22` | inputs, cancel button |
| `--bg-hover` | `#1e202c` | row/button hover |
| `--bg-active` | `#232636` | gear active state |
| `--bg-overlay` | `rgba(0, 0, 0, 0.72)` | shared overlay token |
| `--border` | `rgba(255,255,255,0.07)` | subtle dividers |
| `--border-strong` | `rgba(255,255,255,0.12)` | inputs, scrollbar thumb |
| `--border-focus` | `rgba(99,120,255,0.6)` | focused fields |
| `--text-1` | `#e8eaf2` | primary text |
| `--text-2` | `#8b90aa` | secondary label text |
| `--text-3` | `#50546a` | tertiary text, icon idle state |
| `--text-inv` | `#0b0c11` | inverse text token |
| `--accent-blue` | `#5b8ef0` | save button, today accent |
| `--accent-teal` | `#3bbfbf` | success state |
| `--accent-today` | `#5b8ef0` | today label |
| `--accent-red` | `#e05858` | errors |
| `--ev-google-bg` | `hsla(220, 75%, 65%, 0.10)` | Google chip/block background |
| `--ev-google-bar` | `hsl(220, 75%, 62%)` | Google accent bar/text |
| `--ev-ms-bg` | `hsla(185, 60%, 52%, 0.10)` | Microsoft chip/block background |
| `--ev-ms-bar` | `hsl(185, 60%, 48%)` | Microsoft accent bar/text |

### Light theme tokens available but not used by default renderer

If you want parity with the shared web system, these are already defined in `app.css`:

| Token | Value |
|---|---|
| `--bg-base` | `#f5f5fb` |
| `--bg-surface` | `#ffffff` |
| `--bg-raised` | `#eeeef8` |
| `--bg-hover` | `#e8e8f5` |
| `--bg-active` | `#ddddf0` |
| `--border` | `rgba(0,0,0,0.08)` |
| `--border-strong` | `rgba(0,0,0,0.14)` |
| `--border-focus` | `rgba(56,87,255,0.5)` |
| `--text-1` | `#13141f` |
| `--text-2` | `#555778` |
| `--text-3` | `#9a9cb8` |
| `--accent-blue` | `#2557d6` |
| `--accent-teal` | `#0a8c8c` |
| `--accent-red` | `#c94040` |

## 6. Layout Anatomy

The widget has three stacked layers:

1. Header bar
2. Scrollable event body
3. Absolute-positioned settings panel overlay

There is also a large decorative clock behind the body content.

### Overall structure

```html
<body>
  <div id="bg-clock"></div>

  <div class="widget-header">
    <span class="widget-wordmark">nextUp</span>
    <button class="gear-btn">...</button>
  </div>

  <div class="widget-body">...</div>

  <div class="settings-panel" hidden>...</div>
</body>
```

### Measurements

| Region | Value |
|---|---|
| Total widget | `320 × 480` |
| Header height | `36px` |
| Body height | `calc(480px - 36px)` = `444px` |
| Settings panel inset | `36px 0 0 0` |

Z-order:

- Clock: `z-index: 0`
- Header and body: `z-index: 1`
- Settings panel: `z-index: 10`

## 7. Header Spec

The header is compact and deliberately understated.

| Property | Value |
|---|---|
| Height | `36px` |
| Horizontal padding | `16px` |
| Background | `var(--bg-surface)` |
| Bottom border | `1px solid var(--border)` |
| Layout | flex, centered vertically, space-between |

### Wordmark

| Property | Value |
|---|---|
| Text | `nextUp` |
| Size | `12px` (`--fs-sm`) |
| Weight | `600` |
| Letter spacing | `-0.02em` |
| Color | `var(--text-1)` |

### Gear button

| Property | Value |
|---|---|
| Size | `24px × 24px` |
| Radius | `4px` |
| Background | transparent |
| Idle color | `var(--text-3)` |
| Hover background | `var(--bg-hover)` |
| Hover color | `var(--text-1)` |
| Active background | `var(--bg-active)` |
| Icon size | `14px × 14px` SVG |

## 8. Background Clock

The large clock is a decorative layer that gives the widget its identity.

| Property | Value |
|---|---|
| Position | absolute, starting below header |
| Top offset | `36px` |
| Width | `100%` |
| Alignment | right |
| Right padding | `8px` |
| Font size | `108px` |
| Weight | `700` |
| Letter spacing | `-0.04em` |
| Line height | `1` |
| Color | `var(--text-1)` |
| Opacity | `0.18` |
| Interaction | none |

Behavior:

- Displays 24-hour time in `HH:MM`.
- Updates every 5 seconds.
- It is intentionally low contrast and should never compete with event content.

## 9. Event List View

The widget shows exactly two day sections:

- Today
- Tomorrow

Each section can contain:

- A section header
- Optional all-day chips
- Zero or more timed event rows
- An empty-state line if there are no events

### Day section header

Container:

- Flex row
- Center aligned
- Gap: `8px`
- Padding: `12px 16px 8px`

Label:

| Property | Value |
|---|---|
| Size | `11px` |
| Weight | `600` |
| Letter spacing | `0.06em` |
| Transform | uppercase |
| Default color | `var(--text-3)` |
| Today color | `var(--accent-today)` |

Date text:

| Property | Value |
|---|---|
| Size | `11px` |
| Color | `#ffffff` |
| Font | sans |

### All-day chips

Strip:

- Padding: `0 16px 4px`
- Flex wrap enabled
- Gap: `4px`

Chip style inherited from shared app CSS:

| Property | Value |
|---|---|
| Display | inline-flex |
| Gap | `5px` |
| Font size | `11px` |
| Weight | `500` |
| Padding | `2px 8px` |
| Radius | pill (`9999px`) |
| Max width | `260px` |
| Overflow | ellipsis |

Source colors:

- Google chip: background `var(--ev-google-bg)`, text `var(--ev-google-bar)`
- Microsoft chip: background `var(--ev-ms-bg)`, text `var(--ev-ms-bar)`

### Timed event rows

Rows inherit the shared event component, then receive widget-specific spacing overrides.

Shared structural grid:

```css
display: grid;
grid-template-columns: 44px 4px 1fr;
gap: 0 12px;
border-radius: 6px;
```

Widget overrides:

```css
padding: 4px 16px;
gap: 8px;
min-height: 32px;
cursor: default;
margin: 0;
```

Effective reading of the row:

- Left: time column
- Middle: 3px vertical color bar
- Right: title and optional calendar name

Timed row details:

| Element | Styling |
|---|---|
| Row hover | `background: var(--bg-hover)` |
| Time | mono, `11px`, muted, right-aligned |
| Time min width | `36px` |
| Accent bar width | `3px` |
| Title size | `12px` in widget override |
| Title weight | `500` |
| Meta size | `11px` |
| Meta color | `var(--text-3)` |

Source accents:

- Google: bar `var(--ev-google-bar)`
- Microsoft: bar `var(--ev-ms-bar)`

### Empty day state

| Property | Value |
|---|---|
| Padding | `8px 16px` |
| Font size | `11px` |
| Color | `var(--text-3)` |
| Text | `No events` |

### Loading / initial failure state

| Property | Value |
|---|---|
| Layout | centered flex box |
| Height | full body height |
| Font size | `12px` |
| Color | `var(--text-3)` |
| Copy | `Loading…` or `Can't reach server` |

## 10. Settings Panel Spec

The settings panel is not a modal dialog. It is an in-place overlay that fully covers the body area below the header.

### Panel container

| Property | Value |
|---|---|
| Position | absolute |
| Inset | `36px 0 0 0` |
| Background | `var(--bg-surface)` |
| Padding | `20px 16px 16px` |
| Layout | vertical flex |
| Gap | `16px` |
| Hidden behavior | `[hidden] { display: none; }` |

### Title

| Property | Value |
|---|---|
| Text | `Settings` |
| Size | `14px` |
| Weight | `600` |
| Color | `var(--text-1)` |

### Field groups

Each field stack is:

- Vertical flex
- `gap: 4px`
- `position: relative` to support the token reveal button

Label style:

| Property | Value |
|---|---|
| Size | `11px` |
| Weight | `500` |
| Color | `var(--text-2)` |
| Letter spacing | `0.04em` |
| Transform | uppercase |

### Inputs

| Property | Value |
|---|---|
| Width | `100%` |
| Padding | `8px 12px` |
| Background | `var(--bg-raised)` |
| Border | `1px solid var(--border-strong)` |
| Radius | `6px` |
| Text color | `var(--text-1)` |
| Font size | `12px` |
| Default font | mono |
| Focus border | `var(--border-focus)` |
| Outline | none |

Special cases:

- Refresh input width: `80px`
- Refresh input font family: sans
- Token input right padding: `32px` to clear the reveal button

### Token reveal button

| Property | Value |
|---|---|
| Position | absolute |
| Right | `8px` |
| Bottom | `6px` |
| Font size | `13px` |
| Padding | `2px 4px` |
| Idle color | `var(--text-3)` |
| Hover color | `var(--text-1)` |
| Background | none |

The implementation uses Unicode emoji for the eye state rather than an SVG icon.

### Actions row

| Property | Value |
|---|---|
| Layout | flex |
| Gap | `8px` |
| Alignment | right |
| Vertical placement | pushed to bottom with `margin-top: auto` |

Shared button style:

| Property | Value |
|---|---|
| Padding | `8px 16px` |
| Radius | `6px` |
| Font size | `12px` |
| Weight | `500` |

Cancel button:

- Background: `var(--bg-raised)`
- Text: `var(--text-2)`
- Hover background: `var(--bg-hover)`
- Hover text: `var(--text-1)`

Save button:

- Background: `var(--accent-blue)`
- Text: `#fff`
- Hover: `filter: brightness(1.15)`

### Status message

| Property | Value |
|---|---|
| Font size | `11px` |
| Default color | `var(--text-3)` |
| Success color | `var(--accent-teal)` |
| Error color | `var(--accent-red)` |
| Min height | `16px` |
| Alignment | centered |

## 11. Scrollbar Treatment

The body area uses a minimal scrollbar so the surface still feels like a widget rather than a browser panel.

| Part | Value |
|---|---|
| Width | `4px` |
| Track | transparent |
| Thumb | `var(--border-strong)` |
| Thumb radius | `2px` |

## 12. Interaction Rules

These are important if you want the transfer to feel exact, not just look similar.

- Header remains draggable.
- Event body, chips, rows, settings controls, and gear button are non-draggable.
- Rows in the widget are informational only; they do not show pointer-like affordances beyond hover fill.
- The settings panel swaps with the body rather than animating over it.
- When the panel opens, the event body is hidden.
- The panel keeps the header visible at all times.

## 13. Transfer Checklist

To reproduce the Electron styling faithfully in another project:

1. Use a `320px × 480px` card with `10px` radius and the dark surface/shadow values above.
2. Keep the header at `36px` tall and the wordmark/gear proportions unchanged.
3. Reuse the exact token palette from `app.css`, especially `bg-surface`, `text-1`, `text-3`, `border`, and the Google/Microsoft accent pairs.
4. Load Inter and JetBrains Mono explicitly if you need pixel-close typography.
5. Preserve the oversized, low-opacity right-aligned clock layer.
6. Preserve the event row structure: mono time, narrow accent bar, compact title/meta stack.
7. Keep labels uppercase, small, and letter-spaced rather than increasing size for emphasis.
8. Use muted surfaces and border contrast; the design relies on restraint more than decoration.

## 14. Minimal CSS Token Bundle

If you only want the widget look and not the full app system, these are the minimum tokens to carry over:

```css
:root {
  --font-sans: 'Inter', system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  --font-mono: 'JetBrains Mono', 'SF Mono', 'Fira Code', ui-monospace, monospace;

  --fs-xs: 11px;
  --fs-sm: 12px;
  --fs-md: 14px;

  --fw-medium: 500;
  --fw-semi: 600;

  --sp-1: 4px;
  --sp-2: 8px;
  --sp-3: 12px;
  --sp-4: 16px;
  --sp-5: 20px;

  --r-sm: 4px;
  --r-md: 6px;
  --r-lg: 10px;
  --r-full: 9999px;

  --t-fast: 120ms ease;

  --bg-surface: #111318;
  --bg-raised: #181a22;
  --bg-hover: #1e202c;
  --bg-active: #232636;

  --border: rgba(255,255,255,0.07);
  --border-strong: rgba(255,255,255,0.12);
  --border-focus: rgba(99,120,255,0.6);

  --text-1: #e8eaf2;
  --text-2: #8b90aa;
  --text-3: #50546a;

  --accent-blue: #5b8ef0;
  --accent-teal: #3bbfbf;
  --accent-red: #e05858;

  --ev-google-bg: hsla(220, 75%, 65%, 0.10);
  --ev-google-bar: hsl(220, 75%, 62%);
  --ev-ms-bg: hsla(185, 60%, 52%, 0.10);
  --ev-ms-bar: hsl(185, 60%, 48%);

  --shadow-lg: 0 12px 40px rgba(0,0,0,0.8);
}
```