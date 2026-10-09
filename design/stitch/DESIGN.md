---
name: Focus State Assessment
colors:
  surface: '#faf8ff'
  surface-dim: '#d2d9f4'
  surface-bright: '#faf8ff'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#f2f3ff'
  surface-container: '#eaedff'
  surface-container-high: '#e2e7ff'
  surface-container-highest: '#dae2fd'
  on-surface: '#131b2e'
  on-surface-variant: '#444653'
  inverse-surface: '#283044'
  inverse-on-surface: '#eef0ff'
  outline: '#757684'
  outline-variant: '#c4c5d5'
  surface-tint: '#3755c3'
  primary: '#00288e'
  on-primary: '#ffffff'
  primary-container: '#1e40af'
  on-primary-container: '#a8b8ff'
  inverse-primary: '#b8c4ff'
  secondary: '#006a61'
  on-secondary: '#ffffff'
  secondary-container: '#86f2e4'
  on-secondary-container: '#006f66'
  tertiary: '#532a00'
  on-tertiary: '#ffffff'
  tertiary-container: '#743d00'
  on-tertiary-container: '#ffa85d'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#dde1ff'
  primary-fixed-dim: '#b8c4ff'
  on-primary-fixed: '#001453'
  on-primary-fixed-variant: '#173bab'
  secondary-fixed: '#89f5e7'
  secondary-fixed-dim: '#6bd8cb'
  on-secondary-fixed: '#00201d'
  on-secondary-fixed-variant: '#005049'
  tertiary-fixed: '#ffdcc3'
  tertiary-fixed-dim: '#ffb77d'
  on-tertiary-fixed: '#2f1500'
  on-tertiary-fixed-variant: '#6e3900'
  background: '#faf8ff'
  on-background: '#131b2e'
  surface-variant: '#dae2fd'
typography:
  headline-xl:
    fontFamily: Plus Jakarta Sans
    fontSize: 36px
    fontWeight: '700'
    lineHeight: 44px
    letterSpacing: -0.02em
  headline-xl-mobile:
    fontFamily: Plus Jakarta Sans
    fontSize: 28px
    fontWeight: '700'
    lineHeight: 36px
    letterSpacing: -0.02em
  headline-lg:
    fontFamily: Plus Jakarta Sans
    fontSize: 28px
    fontWeight: '600'
    lineHeight: 36px
    letterSpacing: -0.015em
  headline-lg-mobile:
    fontFamily: Plus Jakarta Sans
    fontSize: 24px
    fontWeight: '600'
    lineHeight: 32px
    letterSpacing: -0.015em
  headline-md:
    fontFamily: Plus Jakarta Sans
    fontSize: 22px
    fontWeight: '600'
    lineHeight: 30px
    letterSpacing: -0.01em
  headline-sm:
    fontFamily: Plus Jakarta Sans
    fontSize: 18px
    fontWeight: '600'
    lineHeight: 26px
    letterSpacing: -0.005em
  body-lg:
    fontFamily: Inter
    fontSize: 18px
    fontWeight: '400'
    lineHeight: 28px
  body-md:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
  body-sm:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 20px
  label-lg:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '600'
    lineHeight: 20px
    letterSpacing: 0.01em
  label-md:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: '500'
    lineHeight: 16px
    letterSpacing: 0.02em
  label-sm:
    fontFamily: Inter
    fontSize: 11px
    fontWeight: '600'
    lineHeight: 14px
    letterSpacing: 0.04em
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  gutter: 1.5rem
  gutter-mobile: 1rem
  margin: 2rem
  margin-mobile: 1rem
  space-xs: 0.25rem
  space-sm: 0.5rem
  space-md: 1rem
  space-lg: 1.5rem
  space-xl: 2.5rem
---

## Brand & Style

This design system is engineered for high-stakes certification, academic testing, and precision e-learning environments where cognitive clarity and psychological calm are paramount. The interface minimizes peripheral distraction, mitigates test-taking anxiety, and instills a sense of institutional authority and digital integrity.

The aesthetic blends **Modern Corporate Precision** with **Minimalist Workspace Architecture**. Visual weight is biased toward crisp typography, clean content containment, and unambiguous hierarchy. Structural surfaces use ultra-subtle boundaries and calculated contrasts to eliminate eye strain during sustained screen exposure, while critical interactive states (e.g., active timers, flag statuses, validation checks) communicate with quiet, authoritative efficiency.

## Colors

The palette establishes an atmosphere of intellectual rigor and unwavering stability:

- **Primary (`#1E40AF` - Academic Royal Blue):** The primary brand anchor for core actions, primary buttons, focal navigation cues, and active test question indices. Supported by `#2563EB` and `#3B82F6` for dynamic hover, focus rings, and secondary interactions.
- **Secondary (`#0D9488` / `#059669` - Precision Emerald):** Reserved strictly for successful validations, confirmed question submissions, correct score outputs, and reassuring active/online connectivity states.
- **Tertiary (`#D97706` - Cautious Amber):** Deployed selectively for time-running-out states, "marked for review" flags, and proctoring advisories.
- **Neutral (`#0F172A` - Midnight Slate):** The primary typographic and grounding tone, supported by structural tiers:
  - Surface Background: `#F8FAFC` (Canvas tone, glare-reducing cool grey)
  - Card Surface: `#FFFFFF` (Crisp reading foreground)
  - Border & Dividers: `#E2E8F0` (Resting), `#CBD5E1` (Emphasized)
  - Muted Text: `#64748B` (Secondary data, metadata, proctor notes)

A strict semantic discipline applies: high-energy saturated hues are banned from large background fills to protect test-taker attention spans.

## Typography

The type system separates institutional wayfinding from intensive reading comprehension:

- **Display & Section Headers (`Plus Jakarta Sans`):** Delivers clean geometry with warm, humane terminal cuts. Utilized across exam titles, section headers, score summaries, and modal titles.
- **Body & Examination Text (`Inter`):** Selected for industry-standard legibility at dense lengths, uniform tabular spacing, and neutral glyph forms that prevent reading fatigue across multi-paragraph stem prompts and mathematical/code stems.
- **Numbers & Timers:** Numeric indicators on countdown timers, question palettes, and analytical grades utilize tabular figures (`font-variant-numeric: tabular-nums`) to prevent horizontal layout shift during dynamic status updates.

## Layout & Spacing

The layout is built upon an 8-point harmonic grid configured for sustained analytical focus:

- **Exam Room Master Layout:** Employs an asymmetrical split. The primary question canvas spans 70–75% of horizontal real estate (restricted to a 780px optimal reading measure), flanked by a docked 25–30% right-side control column hosting the question matrix, remaining time counter, and section drawer.
- **Breakpoints & Adaptability:**
  - *Desktop (1280px+):* Full multi-panel layout with static side palette and pinned persistent header.
  - *Tablet (768px – 1279px):* Grid adapts to a single central canvas; question palette collapses into an off-canvas drawer with indicator dots in a docked bottom bar.
  - *Mobile (< 768px):* Single-column vertical stream. Global timer pins to a minimal sticky top bar; question switcher transitions to a swipeable horizontal pagination rail.
- **Vertical Rhythm:** Generous spacing (`space-lg` to `space-xl`) isolates question blocks from action footers to avoid accidental navigation clicks during rapid answering.

## Elevation & Depth

Depth is treated as functional state signaling rather than decoration:

- **Flat Foundation:** The canvas (`#F8FAFC`) hosts pure white reading containers (`#FFFFFF`) framed with 1px border lines (`#E2E8F0`).
- **Surface Elevation Tiers:**
  - *Resting Cards / Answer Options:* 0px Y-offset, 1px perimeter stroke (`#E2E8F0`), no blur shadow.
  - *Active Option Hover / Card Floating:* `0 2px 4px -1px rgba(15, 23, 42, 0.04), 0 4px 6px -1px rgba(15, 23, 42, 0.06)`, stroke shifts to `#CBD5E1`.
  - *Active Focus / Selected Answer:* No drop shadow; replaced by an intentional 2px inner or outer structural border in `#1E40AF` with a 4px soft outer glow (`rgba(37, 99, 235, 0.15)`).
  - *Floating Proctor / Active Timer / Question Palette Drawer:* `0 10px 15px -3px rgba(15, 23, 42, 0.08), 0 4px 6px -4px rgba(15, 23, 42, 0.03)` with a solid `#E2E8F0` boundary line.
  - *Confirmation & Lockout Modals:* Scrim overlay at 60% opacity (`#0F172A` with 4px backdrop blur), supporting an elevated card layer (`0 20px 25px -5px rgba(15, 23, 42, 0.12)`).

## Shapes

The design system maintains geometric discipline with a controlled corner radius scheme:

- **Base Radius (8px / `0.5rem`):** Standard for answer option containers, input fields, test control buttons, and dropdowns. Communicates precision and technical reliability.
- **Secondary Radius (12px / `0.75rem`):** Applied to major surface cards, question containers, and dropzones to provide soft containment without appearing playful or juvenile.
- **Component Exceptions:**
  - Status badges, timer indicators, and round index buttons on the question grid utilize complete circular profiles (`rounded-full` / `9999px`) to distinguish categorical metadata and indices from editable response areas.

## Components

### Buttons
- **Primary:** Solid `#1E40AF` background, `#FFFFFF` text, 8px radius, height 44px (touch target), with 0.5px subtle inner highlight. Focus ring: 2px offset, `#2563EB`.
- **Secondary / Ghost:** Transparent background, 1px border `#CBD5E1`, text `#0F172A`. On hover: `#F1F5F9`.
- **Destructive / Flag:** Soft tertiary fill (`#FEF3C7`), text `#92400E`, 1px border `#FDE68A` for review toggling.

### Question Palette (Matrix Navigation)
- Compact, high-density grid of 36px circular or rounded-square tokens:
  - *Unvisited:* `#F8FAFC` background, `#64748B` text, 1px border `#E2E8F0`.
  - *Answered:* `#0D9488` background, `#FFFFFF` text, borderless.
  - *Flagged for Review:* `#F59E0B` background, `#FFFFFF` text.
  - *Current Active:* 2px high-contrast ring `#1E40AF`, background `#EFF6FF`, text `#1E40AF`.

### Answer Selection (Radio / Checkbox Tiles)
- Full-width selectable cards (minimum height 52px) replacing unadorned native inputs.
- Left-aligned indicator indicator (circle for single-choice, square for multi-select) with 8px radius surrounding container.
- *Selected State:* `#EFF6FF` background, `#1E40AF` border (1.5px), with sharp checkmark icon transition.

### Assessment Timer
- Monospace or tabular numerical presentation paired with a status dot.
- *Standard Time:* `#0F172A` text on `#F1F5F9` pill.
- *Warning State (< 5 minutes):* `#991B1B` text on `#FEE2E2` pill, accompanied by an alert icon and subtle pulse animation.

### Progress Bars
- Linear 6px track height with fully rounded caps (`#E2E8F0`).
- Foreground fill in `#1E40AF` or `#0D9488` with smooth transitions (`transition: width 300ms ease-out`).
- Always paired with a numeric label (e.g., "Question 24 of 60 • 40% Complete").

### Upload Dropzone (File Submissions)
- Min-height 180px, bounded by a 1.5px dashed border (`#94A3B8`) on `#F8FAFC`.
- Centered icon slot with `#2563EB` accent, supporting clear upload states: drag hover (`#EFF6FF` background, `#2563EB` border), uploading (inline progress bar), and completed file pill with file size and remove action.

### Single Sign-On (Google Authentication)
- Standardized institutional sign-in option adhering to official brand guidelines inside a 44px container: `#FFFFFF` fill, 1px stroke `#E2E8F0`, native Google G logo left-aligned, centered label text in `#0F172A` at medium weight.