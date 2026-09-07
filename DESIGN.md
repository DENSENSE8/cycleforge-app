---
name: Cycle Forge
description: Kinetic Ledger desk — the slot data table as the visual system
colors:
  slate-ink: "#0f172a"
  slate-secondary: "#475569"
  slate-soft: "#64748b"
  slate-faint: "#94a3b8"
  canvas: "#eef2f7"
  card: "#ffffff"
  sunken: "#f1f5f9"
  hover-wash: "#f8fafc"
  strong: "#e2e8f0"
  hairline: "#f1f5f9"
  border-soft: "#cbd5e1"
  scan-blue: "#2563eb"
  navy-accent: "#1a3a6b"
  gilt: "#9d6b30"
  success: "#16a34a"
  warning: "#ea580c"
  danger: "#dc2626"
  inverse: "#f8fafc"
typography:
  display:
    fontFamily: "Inter, system-ui, sans-serif"
    fontSize: "calc(1.5rem * var(--cf-density, 1))"
    fontWeight: 600
    lineHeight: 1.2
    letterSpacing: "-0.02em"
  headline:
    fontFamily: "Inter, system-ui, sans-serif"
    fontSize: "calc(1.125rem * var(--cf-density, 1))"
    fontWeight: 600
    lineHeight: 1.3
    letterSpacing: "-0.01em"
  title:
    fontFamily: "Inter, system-ui, sans-serif"
    fontSize: "calc(0.75rem * var(--cf-density, 1))"
    fontWeight: 500
    lineHeight: 1.35
    letterSpacing: "0.01em"
  body:
    fontFamily: "Inter, system-ui, sans-serif"
    fontSize: "calc(0.875rem * var(--cf-density, 1))"
    fontWeight: 400
    lineHeight: 1.45
    letterSpacing: "normal"
  label:
    fontFamily: "'IBM Plex Sans Condensed', Inter, sans-serif"
    fontSize: "calc(0.625rem * var(--cf-density, 1))"
    fontWeight: 400
    lineHeight: 1.2
    letterSpacing: "0.04em"
  mono:
    fontFamily: "'IBM Plex Mono', ui-monospace, monospace"
    fontSize: "calc(0.75rem * var(--cf-density, 1))"
    fontWeight: 600
    lineHeight: 1
    letterSpacing: "0.01em"
rounded:
  flush: "0px"
  chip: "4px"
  control: "8px"
  field: "12px"
  card-floor: "12px"
spacing:
  hairline: "1px"
  1: "0.25rem"
  2: "0.5rem"
  3: "0.75rem"
  4: "1rem"
  chrome-row: "28px"
  desk-stage: "1152px"
components:
  desk-card:
    backgroundColor: "{colors.card}"
    rounded: "{rounded.card-floor}"
  table-header:
    backgroundColor: "{colors.card}"
    textColor: "{colors.slate-ink}"
    typography: "{typography.label}"
    height: "{spacing.chrome-row}"
  table-cell:
    backgroundColor: "{colors.card}"
    textColor: "{colors.slate-ink}"
    typography: "{typography.title}"
  compound-title:
    textColor: "{colors.slate-ink}"
    typography: "{typography.title}"
  compound-title-hover:
    textColor: "{colors.scan-blue}"
  toolbar-search:
    backgroundColor: "{colors.card}"
    textColor: "{colors.slate-ink}"
    rounded: "{rounded.control}"
    height: "{spacing.chrome-row}"
  chrome-button:
    backgroundColor: "transparent"
    textColor: "{colors.slate-secondary}"
    rounded: "{rounded.flush}"
    height: "{spacing.chrome-row}"
  chrome-button-hover:
    backgroundColor: "{colors.hover-wash}"
    textColor: "{colors.slate-ink}"
---

# Design System: Cycle Forge

## Overview

**Creative North Star: "Kinetic Ledger"**

Cycle Forge desks are a workbench spreadsheet sitting on cool slate canvas — not a document, not a scan bench. The slot data table (To-ship / Orders and every `PRODUCT_TABLES` peer) is the identity lock: one white card, caption-dense rows, hairline bottom rules, black sentence-case headers that sort on click. Chrome is quiet; facts carry the story.

Personality is ops density with Linear chrome discipline. Hierarchy comes from ink contrast and tracking, never from weight 700 or a second display face. The table is coplanar with its toolbar and status bar; depth is the card on the canvas, not nested islands inside the grid.

Confirmed visual rejections: document whitespace as the product shape; a second rounded table shell inside the desk card; grey headers that read as disabled; CSS-uppercase column labels; standing keycaps on buttons; a filter strip of hunt tiles.

**Key Characteristics:**

- One white sheet inside a desk card; the grid bleeds to the card edges.
- Bottom hairlines only — no vertical column cage.
- Caption-dense cells (12px) with condensed 10px headers in black ink.
- Interactive facts turn scan-blue and underline; idle facts stay slate ink.
- Toolbar splits “what am I looking at” (left) from “how is it drawn” (right).

## Colors

Cool slate neutrals with a single interactive blue. Functional greens / oranges / reds are state, not decoration.

### Primary
- **Scan Blue** (`{colors.scan-blue}`): title hover, live listing chip, info fills, click-to-sort affordance. The only voice for “this fact is live.”

### Secondary
- **Navy Accent** (`{colors.navy-accent}`): quieter accent family on surfaces that are not a table link. Do not compete with Scan Blue on the same cell.
- **Gilt** (`{colors.gilt}`): editorial standout ink — the ONE warm word inside quiet prose (Home's greeting verb, `text-text-gilt`). Cream on dark schemes, caramel-bronze on light so it still clears 4.5:1 on card white. Never a status tone, never a fill, never more than one word in a sentence.

### Neutral
- **Slate Ink** (`{colors.slate-ink}`): default text and column headers.
- **Slate Secondary** (`{colors.slate-secondary}`): idle chrome labels.
- **Slate Soft / Faint** (`{colors.slate-soft}`, `{colors.slate-faint}`): supporting chrome; never a DATA header.
- **Cool Canvas** (`{colors.canvas}`): page ground (~6% below card white so raised depth can read).
- **Card White** (`{colors.card}`): table plane, frozen header, toolbar, status bar — one fill.
- **Hover Wash** (`{colors.hover-wash}`): row and chrome hover.
- **Sunken / Strong** (`{colors.sunken}`, `{colors.strong}`): recessed tracks, skeletons — not the frozen header.
- **Hairline / Soft Border** (`{colors.hairline}`, `{colors.border-soft}`): sheet rules.

**The One-Voice Rule.** Scan Blue is for live facts and interactive ink. It is not a fill for the sheet, the header band, or idle chrome.

**The Header-Ink Rule.** A painted DATA header uses Slate Ink, same as the values under it. Grey headers read as disabled.

## Typography

**Display Font:** Inter (system-ui, sans-serif)
**Body Font:** Inter
**Label Font:** IBM Plex Sans Condensed (bound to micro / eyebrow roles)
**Mono Font:** IBM Plex Mono (IDs, qty, money, tracking)

**Character:** One sans for reading, condensed only where 10–11px chrome must fit a column, mono only for strings an operator retypes. Weights stop at 600.

### Hierarchy
- **Display** (600, 24px × density, 1.2): rare page-scale type — not a table face.
- **Headline** (600, 18px × density, 1.3): desk page title (`text-role-title`).
- **Title** (500, 12px × density, 1.35): ledger cell / compound title (`text-role-caption`). The table’s reading size.
- **Body** (400, 14px × density, 1.45): surrounding desk copy, not grid facts.
- **Label** (400, 10px × density, 0.04em, condensed): column headers in sentence case as authored. Override the role’s default 600 so headers do not shout.
- **Mono** (600, 12px, tabular): CopyChips, SKUs, serials, line qty.

**The Sentence-Case Header Rule.** Column labels render in the case the catalog authored. Eyebrows, field labels, and section labels may uppercase; DATA headers may not.

**The Weight-Cap Rule.** 700+ is not loaded. Hierarchy is ink + tracking, not extra bold.

## Layout

The desk stage is a centered 1152px ceiling (`max-w-6xl`) with 16px gutters on the page and a 16px floor under the card so the sheet sits on the canvas instead of welding to the viewport. Fullscreen collapses those gutters on purpose.

Inside the card: toolbar (28px chrome row) → grid → status bar. The DataTable is `rounded-none` and flex-fills; do not wrap it in a second radius, border, or shadow. Search, filter, sort, views, and date sit on the left (`gap-2`, `pl-2`); columns / zoom / fullscreen sit `ml-auto` on the right. Filter is always mounted beside Search — idle chrome when a family has no facets.

Rows use airtable discipline: 1px bottom rules through header and body. Horizontal scroll is allowed when columns exceed the stage; the page itself does not become a full-bleed spreadsheet.

Density scales type and spacing together (`--cf-density`, compact = 0.92). Weight and tracking do not scale.

**The One-Plane Rule.** Toolbar, frozen header, body, and status bar share Card White. Hierarchy is hairline rules, not a sunken header fill.

## Elevation & Depth

Hybrid: the desk card is a soft object on Cool Canvas; the grid inside is flat. Frozen headers stay Card White — never `surface-strong` (in light that fill equals a border token and erases the header grid). Framed admin tables may take raised lift + 12px clip; the pointer desk does not.

### Shadow Vocabulary
- **Flat** (`box-shadow: none`): the slot grid. Borders carry hierarchy.
- **Raised** (`box-shadow: var(--ds-elev-raised)`): in-flow cards on canvas. Ambient + key + cast; the zero-offset ambient layer is load-bearing so a tall sheet still reads depth at the top edge.
- **Overlay** (`box-shadow: var(--ds-elev-overlay)`): menus, popovers, filter panel.

**The Flat-Grid Rule.** Do not raise individual rows or cells. Lift the card, or lift a popover — never the sheet.

## Shapes

Desk card: square top (welds to the tab row), 12px bottom corners (`rounded-b-xl`), `overflow-hidden`, no outer ring. Grid cells and ops CTAs are flush (`0px`). Toolbar search and menus use 8px (`rounded-lg`). Chips are 4px. Pills are reserved for avatars, status dots, and switches.

Sheet plane (Receiving / Unbox browse) is hairline top/bottom only — no side border, no raised island — when the grid abuts a context rail.

**The No-Box-in-Box Rule.** Only the desk card carries radius on a pointer desk. The table inside stays edge-to-edge.

## Components

### Buttons
- **Shape:** flush square on ops chrome (`0px`); they belong to the bar they sit in.
- **Ghost (toolbar default):** muted ink, transparent fill; hover washes `{colors.hover-wash}` and restores Slate Ink. Color transition only — nothing that moves a neighbour.
- **Primary:** Scan Blue fill is a page-level commit, not a grid-cell control.

### Chips
- **IDs:** 12px mono semibold tabular, no tracking tighten. Ink is painted by the caller (info / warning / empty).
- **Word labels:** same metrics, Inter instead of mono. Catalog casing (`eBay` keeps the e).
- **Listing chip:** ExternalLink glyph only — never the word “Listing”, never the host path as the face. Live = Scan Blue; missing = Slate Faint in the same box.

### Cards / Containers
- **Desk card:** Card White, 12px floor corners, no perimeter stroke. Internal table has zero inset.
- **Framed table (admin / hand-compose):** 12px all corners + raised lift + clip. Different recipe from the desk.

### Inputs / Fields
- **Toolbar search:** 8px corners, 28px row, underline hidden, fills the host. Neutral tone.
- **Ship-by / due in a cell:** compact date field — one click commits one day. No presets, no Apply, no year chrome, no native `type="date"`.
- **Filter:** icon control beside search, always mounted. Never a refinement bar or hunt-tile strip.

### Navigation
- Desk tabs sit on page ground above the card (36px row). Selection is the tab’s own underline, not a page-wide hairline. Card welds to the tab row — no detach gap.

### Slot data table (signature)
The engine surface for every product table. Compound title: Slate Ink idle; Scan Blue + underline on hover/focus. Line qty is the first subtitle under the title (bare number, 2ch). Every painted DATA header is click-to-sort; chrome-only exceptions are select, actions, `_fill`, and `thumb` (Image photo gutter). The toolbar sort menu lists the same facts as the headers. Stage-assign cells open the staff combobox; stamped steps stay read-only. Status bar owns the table-foot `?` (letters paint on buttons — no standing keycaps, no cheat sheet from that mark).

## Do's and Don'ts

### Do:
- **Do** keep every labeled DATA header click-to-sort, and list those same facts in the toolbar sort menu.
- **Do** mount the filter control beside Search even when a family has no facets.
- **Do** paint column headers in sentence case with Slate Ink at 10px condensed.
- **Do** use caption (12px) for grid facts and Plex Mono for identifiers.
- **Do** let the grid bleed to the desk card; put radius only on that card’s floor.

### Don't:
- **Don't** wrap DataTable in a second rounded / bordered / shadowed shell.
- **Don't** grey out DATA headers, CSS-uppercase them, or set `sortable: false` on a labeled fact.
- **Don't** draw a vertical column cage or a sunken frozen-header fill.
- **Don't** put FilterRefinementBar, hunt tiles, or a funnel inside SearchField.
- **Don't** use native date inputs or the range-filter picker inside a cell.
- **Don't** invent a second display face, load weight 700, or leave keycaps standing on buttons.
