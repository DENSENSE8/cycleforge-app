# HANDOFF — Warehouse OS UX/UI brief for an external model (no codebase access)

Self-contained. Paste everything below the line. The reader has **no access to the
repository**, so every value it needs is carried inline.

---

# Cycle Forge — Warehouse OS

## 0 · Your job

You are the design lead for a **paradigm-level UI rebuild** of a live warehouse operations
application. You have **no access to the codebase**. Everything you need is in this brief.

**Deliver a complete UX/UI specification** for the target application: layout system,
interaction model, visual language, component anatomy, states, motion, and density. Work in
**display language** — regions, planes, weights, rhythms, states — not in code. Where you
need to name a color, type size, or dimension, use the tokens given in §4; do not invent
hex values.

Structure your output as: **FROM → TO** per region (what exists now, what it becomes, and
the reason the change is required), then the component and interaction specs that follow
from it.

---

## 1 · The product and the people

**Cycle Forge** is multi-tenant SaaS for **reseller operations** — businesses that acquire
used and returned goods, test and grade them, and resell across marketplaces. The app runs
the physical warehouse: receiving cartons off a truck, unboxing them, testing units,
grading condition, packing, shipping, handling returns and warranty claims.

**Who is on the screen, and where:**

| User | Environment | What they do |
|---|---|---|
| **Floor operator** | Standing at a bench, barcode scanner in hand, often gloved, product in front of them | Scans, inspects, photographs, grades, packs. Screen is a reference, hands are on goods |
| **Desk operator** | Seated, mouse and keyboard, large monitor | Works queues, reconciles orders, handles exceptions and tickets |
| **Manager / owner** | Anywhere, including phone | Reads throughput, checks who did what, unblocks |

The floor operator is the primary user and the hardest constraint. **Their hands are busy
and their eyes leave the screen constantly.** Every design decision is judged against:
*can someone holding a scanner, wearing gloves, looking at a carton rather than the
monitor, still work this?*

**Scale of the application:** 142 page routes today, 969 API endpoints, 312 database
tables. This is not a small app. Roughly 24 destinations genuinely need to survive as
first-class; the rest collapse into sessions, tabs, and tools.

---

## 2 · The physical reality — constraints you cannot design around

These are measured facts about the deployment. They are not preferences.

1. **Barcode scanners are keyboard wedges.** A scan arrives as a burst of synthetic
   keystrokes ending in Enter — indistinguishable from very fast typing. It fires
   **wherever focus happens to be**. The scan path never reads or writes focus, so during
   scanning **there is effectively no cursor and no pointer.**

2. **Warehouse tablets receive the desktop layout, not a mobile one.** Tablets are
   deliberately excluded from the mobile route, and iPadOS identifies itself as macOS. On
   those devices `hover` does not exist and the pointer is coarse. **Any interaction whose
   only trigger is hover is unreachable on a warehouse tablet.**

3. **Gloves.** Touch targets on floor surfaces must be generous. Precision hover targets
   and small hit areas fail.

4. **Label printers run over direct USB/serial device grants.** Pairing requires a genuine
   user click — a panel opened by hotkey or by an assistant **cannot** trigger the pairing
   dialog, because the browser's user-activation does not survive a programmatic open.

5. **A desktop wrapper overlays a native view** at absolute pixel coordinates for embedded
   vendor pages. A native overlay cannot be clipped by CSS overflow and cannot be stacked
   under another panel. Any tiled layout must either reserve a region for it or re-issue
   its bounds on every layout change.

6. **Viewports actually in use: 1440×900 (tested) and 1600×1000 (desktop app).** Design for
   these, not for 2560.

7. **Sign-in is clock-in.** Authenticating opens a payroll time-punch row. A "session" in
   this product's UI language must never be confused with the auth session, because one of
   them is a payroll event.

---

## 3 · The identity shift

### FROM — "Kinetic Ledger"
The outgoing identity, in its own words: *data-first reseller ops — dense, state-colored,
scan-aware. Legible throughput over document calm. Ops density is exact flush + plane
depth, not floating column islands.* Concretely:

- **Zero radius everywhere.** Flush-square CTAs, tabs, chips, fields, cards. `rounded-full`
  survived only for status dots, avatars, and switch tracks. Soft radius was explicitly
  classified as debt.
- **Depth by surface steps**, not by floating cards on a canvas.
- **Chrome never invents a second story** — the UI reports facts and state, nothing more.
- **The route is the identity.** What page you are on defines what the chrome says.

This identity was **deliberately retired.** It produced a disciplined, dense, honest
application — and a rigid one. Every surface was a page; every page owned its own chrome;
the operator could not arrange anything.

### TO — "Warehouse OS"
**The application becomes an operating system for the warehouse.**

The reference the operator gave, in their own words: **Arch Linux / Hyprland** — a tiling
window manager. The workspace belongs to the user. Windows snap. Everything is
keyboard-reachable. Chrome disappears until asked for. You start from **an empty slate**
and build the workspace you need.

**The whole app reads as a HUD** — you are looking *into* the operation through a frame,
the way a helmet visor or an instrument panel frames the world behind it. The center
workspace is **inset with a rounded corner radius resolved from a single token**, so the
entire frame character changes in one edit. Everything outside that inset — header, rails —
runs edge to edge.

> **This directly reverses the outgoing identity's central rule.** Zero-radius flush chrome
> was law; the HUD inset is the deliberate break. Radius now carries meaning: **the inset
> frames the workspace, and only the workspace.** Controls inside it stay square. The
> radius is a frame, never a decoration.

**The refined mockup (2026-08-22) settles the frame.** Four facts:

1. **The rails are icon-width and always present** — narrow persistent strips, ~40px, each
   carrying icons plus a **vertical text label**: `PAGES` on the left, `TOOLS` on the right.
   Not 240px panels, not hidden drawers. Expanding one is a click; reaching one never is.
   **This replaces any hover-reveal reading** — see the hover constraints in §2, which the
   persistent rail resolves outright.
2. **The workspace is drawn, not implied** — a **visible stroke on all four sides** with the
   shared corner radius. Radius appears in exactly one place in the entire application, and
   that place is the boundary between chrome and work. A control that grows a radius is a bug.
3. **The top-left corner is a three-icon cluster: Scan · Search · Context**, in that order.
   Scan is first because it is the most-used control on the floor, and because a fixed
   origin is what lets an operator reach it without looking.
4. **The beam centre is one line and the session title is renamed in place**:
   `GLOBAL CONTEXT — SESSION title (renameable) — carton context of scan type`. Renaming
   happens while working, not in a settings pane. Everything else that used to be header
   chrome is pushed to a rail or the top-right `⋮` overflow.

The two rails are **deliberately symmetrical** — same width, same hamburger, same vertical
label, same pin-above-label ordering. Left is *where you go*; right is *what you use*. An
operator who learns one has learned both. **The left hamburger is the only way to add a page
or a data table**, and it carries search.

**Four object types, fully detached from one another:**

| Object | What it is |
|---|---|
| **Session** | A unit of human work. Kind is **`scan`** or **`task`**. A scan session carries a scan type (Unbox, Packing, Ready-to-Pack, QC). **Exactly one scan session is armed at a time, application-wide.** |
| **Table** | A data grid instance. Not bound to a route. |
| **Tool** | A utility usable from anywhere: photo library, manuals, label printer, calculator, timer, stopwatch, process/undo. |
| **Tab** | A handle on an open session or table, in the window manager. |

None of these owns any other. A session is not a page. A tool is not a page. A table is not
a page.

---

## 4 · The design system you inherit

Use these. Do not invent parallel scales.

### Typography — three cuts, three jobs
| Cut | Face | Used for |
|---|---|---|
| **sans** | Inter | display · title · body · data · caption |
| **condensed** | IBM Plex Sans Condensed | eyebrow · micro — dense chrome where horizontal space is the binding constraint |
| **mono** | IBM Plex Mono | **identifiers only** — serial, tracking number, SKU, FNSKU, PO |

**Mono is semantic, not decorative.** A monospace string means *this is a machine
identifier you may need to compare character by character or scan.* Never set prose in mono;
never set an identifier in proportional type. Identifiers align in columns, so they take
tabular figures.

**Size scale (rem):** `0.5625` technical-label · `0.75` xs · `0.8125` data-value ·
`0.875` sm · `1` md · `1.125` lg · `1.25` xl · `1.5` · `1.875` · `2.25`

Note how low the scale sits. Two of the most-used sizes are **below 14px** — this is a
dense operations tool, not a document. There are named micro-roles: `role-eyebrow`,
`role-micro`, `role-caption`.

### Color — semantic tokens only, never raw hex
Token families, by role:

- **text** — `primary` · `secondary` · `muted` · `inverse` · `accent` · `success` ·
  `warning` · `danger` · `label` · `value` · `technical`
- **surface** — `background` · `containerLowest` · `containerLow` · `container` ·
  `containerHigh` · `containerHighest` · `dim`
- **background** — `canvas` · `surface` · `subtle` · `inverse` · plus status grounds
- **surfaceSubtle** — quiet status washes: `success` · `warning` · `danger` · `accent`
- **border** — `subtle` · `strong` · `accent` · plus status borders

Two rules carried forward: **depth comes from surface steps** (`containerLowest` →
`containerHighest`), never from drop shadows scattered on a canvas. And **status color is
state, never emphasis** — amber means a real warning about the work, not "look here."

Themes swap via a root attribute; every color must resolve in both light and dark.

### Radius — meaning, not taste
`none 0` · `sm 2px` · `md 6px` · `lg 8px` · `xl 12px` · `full 9999px`

Today essentially every semantic role resolves to **`rounded-none`** — chip, row, control,
field, card, canvas all flush. `full` is reserved for status dots and avatars.

**Your one addition: the HUD inset radius**, applied to the workspace frame only. Propose
its value. Everything inside the frame stays square.

### Elevation / stacking — 21 named bands
`base 0` · `raised 10` · `sticky 30` · **`header 40`** · `dropdown 50` · `fab 90` ·
`panel 100` · `panelPopover 120` · `panelOverlay 130` · `detailStack 160` · `modal 200` ·
`elevatedModal 300` · `banner 350` · `command 1000` · `takeover 1200` · `splash 2000` ·
`toast 2050` · `tooltip` (max)

A tiling canvas introduces a new problem this scale has never faced: **N sibling tiles that
must stack against each other without escaping their band.** Propose how tile-local
stacking works within `base`–`raised` without leaking into `panel`.

### Motion — role-based, not per-component
Existing roles: **`swap.scan`** (a scanned record replacing the previous one) ·
**`swap.focus`** · **`push.rail`** (a rail pushing the work surface, never floating over
it) · **`gesture.press`** · **`feedback.pulse`** · **`feedback.hitMarker`** (confirming a
scan landed).

Motion names *what kind of change happened*, not which component moved. Reduced-motion is
honored throughout. Add roles for tiling — split, snap, focus-change, tile-close — as
roles, not as one-off animations.

### Geometry — current hard numbers
| Element | Value |
|---|---|
| Header row height | **40px** |
| Nav spine width | **240px** (min 200, max 360) |
| Context rail width | **360px** (min 300) |
| Right rail width | **420px** default, **360px** min |
| Collapsed rail strip | **32px** |
| Minimum work surface | **784px** |
| Station work-surface floor | **720px** |
| Gutter between rails and work | **0** — planes meet flush |

**The zero gutter is a real identity statement**: surfaces butt directly against each other
and depth comes from tone, not from space. Floating islands with decorative outer margins
were explicitly banned. Decide deliberately whether the HUD inset changes this or whether
the inset is the *only* place spacing appears.

> ⚠️ **The geometry does not currently permit split-screen.** Two work surfaces at the
> 784px floor is **1,568px before any rail**; with the spine, **1,808px**. The real
> viewports are 1440×900 and 1600×1000. **You must resolve this.** Options: lower the
> floor (a statement about how narrow a work surface may be); introduce a smaller floor for
> tables than for scan benches (a table degrades gracefully, a scan bench does not); gate
> two-up to wide displays; or overlap rather than tile below a threshold. State your choice
> and its reasoning.

---

## 5 · FROM → TO, region by region

This is the core of the brief.

### 5.1 The frame

**FROM.** A fixed three-column desk: a 240px resident nav spine pushing from the left, a
360px route-owned context rail beside it, one page filling the center, and a right
inspector pushing from the right. Four surfaces negotiating one width against hard floors.
The operator arranges nothing. Every route decides its own chrome.

**TO.** A HUD:

```
┌────────────────────────────────────────────────────────────────────────────┐
│  ⌕ scan/search │ scan type · process │ pairing │ context │ ⏱ │ session ⓘ  │ ← always visible
├──┬──────────────────────────────────────────────────────────────────┬──────┤
│ +│   ╭────────────────────────────────────────────────────────╮     │  +   │
│ ▤│   │                     │                                  │     │  ▤   │
│ ▤│   │                     │──────────────────────────────────│     │  ▤   │
│ ›│   │                     │                                  │     │  ▤   │
│ ⋯│   ╰────────────────────────────────────────────────────────╯     │  ▤   │
│ ✕│         inset radius — ONE token — the HUD cutout                 │  ▤   │
└──┴──────────────────────────────────────────────────────────────────┴──────┘
   left rail                   tiling canvas                        right rail
   (windows)                                                          (tools)
```

**Only the top row is visible 100% of the time.** Both rails reveal on demand. The canvas
is the application.

---

### 5.2 Global header — the always-on row

**FROM.** 40px tall, four declared zones, and the middle one **renders nothing on every
route in the application** — it was built and never connected. The left zone carries a
page-name chip that changes as you navigate. The right zone is hard-capped at five fixed
icons. The header learns what it is looking at **only from the URL**, resolved through a
1,600-line hand-written path matcher. **Route is identity.**

**TO.** The header is the **session's instrument panel**, and route stops being identity.

| Zone | Contents |
|---|---|
| **Scan / Search** (left) | One input. Mode matrix: **Auto Input ⇄ Manual Input** × **Search ⇄ Search Filter**. Collapsed to the bare field; **hover or focus reveals the mode controls and detail** |
| **Scan type · Process** | The pipeline position: `unbox → packing → ready-to-pack → QC`. A second line shows **task name / scan type** |
| **Pairing** | The live pairing operation: `TRK#` ↔ `Serial` |
| **Context** (middle) | The entity being worked — the carton, the unit, the order |
| **Micro-tools** | Timer · stopwatch readouts. **User-pinned**, replacing the fixed five |
| **Session ⓘ** (far right) | Session identity, opens detail |

Three consequences you must design for:

1. **Scan type *is* the process stage.** `unbox / packing / ready-to-pack / QC` are
   positions in a pipeline, not arbitrary labels. The header must communicate *where in the
   flow* the operator stands, and stage drives what displays and what validates. Design the
   stage indicator as a **progression**, not a dropdown.

2. **The input has two independent axes, not one mode list.** *Auto vs manual* is **who
   fires the input** — the wedge scanner, or the operator typing. *Search vs filter* is
   **what the query does** — find a record, or narrow the current view. Both axes are live
   simultaneously. Do not collapse them into a single three-way switch.
   Behavior: **found in the system → show the record and its status. Not found, and in
   input mode → create it under the active session's type.**

3. **A tool may have two faces.** Timer and stopwatch appear both as a right-rail panel
   *and* as a header readout. A tool therefore needs a **compact header face** in addition
   to its panel body. Specify both.

**Open question the operator raised and did not answer:** *should the top row itself be
hideable behind a button?* If you say yes, design the affordance that brings it back — a
HUD whose only permanent chrome can vanish irreversibly is a trap.

---

### 5.3 Left rail — the window manager

**FROM.** Two separate left columns with two separate widths and two separate persistence
keys. A 240px resident spine listing every page in the application, grouped into nine
sections. Beside it, a 360px rail owned by whatever route is loaded, selected by a
19-branch conditional over a path matcher. Neither models "a thing that is open." The
closest existing concept is a list of up to 30 pinned URLs.

**TO.** A window manager. Hidden by default, revealed on demand.

- **`+`** — the master launcher: a searchable index of everything launchable, grouped by
  category (sessions · tables · tools · admin).
- **Tab icons** — open sessions and tables. **Chrome-style: they shrink in width as they
  crowd**, never scroll away.
- **`› Recents`** — collapsible. **Recents are not tabs.** "Where have I been" is a
  history; "what is open" is a set of live objects with lifecycles. Same rail, separate
  meanings, and the visual language must keep them distinct.
- **Pinned necessities** at the bottom — settings, shipping, and similar, always present.
- **`⋯`** — per-tab context menu.

**The tab context menu is the personalization surface:**

| Verb | Meaning |
|---|---|
| **Split** | Split this tab into the canvas as a new tile. **Splitting is a menu verb, not only a drag** — keyboard and menu reachable |
| **Rename** | The operator names the tab. "Bin 4 recount" beats "Unbox (3)" |
| **Change icon** | Per-tab icon |
| **Change color** | Per-tab accent |
| **Delete** | Close and forget |

All four personalization facts persist per staff member, per organization.

> ⚠️ **Per-tab color reverses an explicit prior ruling.** Per-section hue was removed from
> the navigation in favor of a single monochrome treatment, on the grounds that hue as
> decoration made the rail noisier without making it more legible. You are re-introducing
> user-chosen color. **Design the constraint that keeps it from becoming confetti** — a
> restricted palette, hue only on a small identity mark rather than on the whole row, or
> color that only appears on the active tab. Say which, and why.

---

### 5.4 Center — the tiling canvas

**FROM.** One page fills the center. A single route's tree. Two forked "compare" prototypes
existed offering single / split / quad layouts on two specific surfaces, with hard-coded
pane slots — both now deleted.

**TO.** A tiling workspace, Hyprland-grammar.

- Drag, drop, and **snap** into columns, rows, and splits, **arbitrarily nested** — the
  operator's sketch shows a two-column split with the right column split again into rows.
- **Hotkeys for every window operation**: split, focus, move, resize, close, swap. Note
  that today there is **no keybinding system at all** — 51 separate places listen for keys
  independently and exactly one key in the entire application is user-remappable. You are
  specifying the first real keymap. Design its discoverability, not only its bindings.
- **Hover highlight on tiles, with a customizable highlight animation.**
- **The inset radius** frames the canvas.
- **The empty slate** — a brand-new operator has no tabs and no tools. This is the first
  screen every new staff member sees and it is currently unspecified. **Design it.** It
  must teach the model (sessions, tables, tools) without a tutorial.

---

### 5.5 Right rail — the tool palette

**FROM.** A single-occupant slot. Panels register, and a priority rule collapses them to
exactly one visible at a time; 42 of 43 registrations sit at the same priority and simply
steal the slot from whatever was there. Nothing about it is personalized. There is no
concept of "a tool" — a registration carries an opaque id and an opaque body, with no
title, icon, category, or state.

**TO.** A palette of tools available from anywhere.

- **Pushes from the top right — it never floats over the work.** (Explicit in the sketch.)
- **`+`** to add and search tools.
- **A stack of always-on tool slots** — "always on tools for all different needs."
- **A pinned panel** grouping Timer · Stopwatch · Information.
- The active tool's icon is **highlighted** while its panel is open — a cornered selection
  treatment, so the rail always shows which tool owns the panel.
- Tools are **pinnable, keybindable, reorderable, and drag sources** — drag a photo from
  the photo-library tool onto a support ticket, a chat, or a session tile.
- **Scanning can summon a tool.** Scanning a unit during Testing opens the matching manual.
  The tool arrives *because of what the operator did*, not because they navigated. Design
  what a summoned panel looks like arriving unrequested — it must not steal a scan.

---

### 5.6 Data tables

**FROM.** Grids bound to routes. Their state — sort, density, filters, column layout —
lives in the URL. Two views of the same table are impossible: column widths, visibility,
order, and density are all stored under one global key per table.

**TO.** Tables are **tabs**. Route-independent, openable beside a session, and **each
instance owns its own state** — two tabs of the same table hold different sorts and
filters. Design the tab-level affordances: what identifies an instance, how a saved view
reads, and how a table tile behaves when narrow.

---

### 5.7 Text entry — one composer

**FROM.** 51 separate places in the application render a free-text field. 24 of them are
dedicated composer components. There are **four competing design-system entry faces** plus
a page-local fifth. One of them declares in its own documentation that it is "one shell for
every 'type a message here' job" — and it is used in five places out of fifty-one. There
are **five different ways** to choose whether a note is internal or customer-visible.

**TO.** **One composer**, adapting by what it is attached to and what mode it is in.

Its modes must cover: a docked chat footer · a flush inline band · an in-cell grid editor
that commits on blur · an expandable field. Same face, different mode — never a different
component.

⚠️ **The internal-versus-public control's failure mode is emailing a customer a note meant
to be private.** Five forks of that control exist today. Design **one**, and design it so
the current state is unmistakable at a glance, mid-task, in peripheral vision.

---

### 5.8 Personalization

**FROM.** Up to 30 pinned URLs with positional keyboard shortcuts. Nothing else. Rail
widths are stored per device, not per person.

**TO.** Everything the operator arranges follows them: pinned tabs · pinned tools · tab
names, icons, colors · saved workspace layouts · keybindings · rail arrangement.

**Start from empty.** Absent preferences mean an empty workspace, not a default one.

**One distinction you must design around: machine facts versus person facts.** Printer
pairing, panel widths, and the silent-print toggle belong to the *workstation* and must not
follow a person to another bench. Tabs, tools, layouts, and keybindings belong to the
*person*. The UI must make it obvious which kind of setting the operator is changing.

---

## 6 · The operator's wireframe, transcribed

Hand-drawn, and the source of §5. Verbatim annotations:

- **Top row, left→right:** `Search / Scan` with `Auto Input | Manual Input` and
  `Search Filter | Search` · `Scan type · Page Process — unbox · packing · Ready to pack ·
  QC` · `Pairing TRK# Serial` · `Global Header / Carton context` · `Timer / Stopwatch
  context Display` · `Session ⓘ`
- **Second line:** `Search` (left) · `↳ Task Name / Scan type` (center)
- **Left rail:** `+` · `icon` · `icon` · `› Recents` · `⋯` → menu `Split · Rename · change
  icon · change color · Delete` · `✕`
- **Center:** a perspective box split into two columns, the right column split into two
  rows · `Hover High light` · `Arch Linux hyprland` · `Customize · High light · Animation`
- **Below center:** `Top Row Bar? Button to Display` · `Button to Display top Row?`
- **Right rail:** `+` · panel `Timer / Stop watch / information` · `Hover to Display · Push
  from the top Right` · a column of tool slots · `Always on tools for all different Needs`

---

## 7 · Interaction laws

1. **Rails push; they never float over the work.** Depth is planes, not floating cards.
2. **Hover cannot be the only trigger.** Warehouse tablets get this layout and have no
   hover. The existing hover engine also opens at **0ms** — deliberately, because "the
   bench cannot afford hover-intent latency" — and opening one surface *evicts* whatever
   else is open. A zero-delay screen-edge reveal would fire on any pointer transit and
   evict the menu the operator is mid-interaction with. A previous edge-reveal rail was
   removed for exactly this: on a bench it landed on top of the rail the operator was
   working from.
   **Recommended: click-toggle plus hotkey as the primary reveal, hover as an opt-in for
   mouse-primary desks.** This preserves everything the sketch asks for — rails out of the
   way, maximum canvas, instant access — and changes only the trigger. If you disagree,
   argue it against the tablet fact.
3. **A scan must never be stolen.** Exactly one scan session is armed application-wide.
   Nothing that appears on screen — a summoned tool, an arriving panel, a toast — may take
   the scan. Design the armed-state indicator: the operator must know, without looking
   away from the carton, where their next scan will land.
4. **Chrome reports facts.** State color means state. Chrome never invents a second story.
5. **Everything reachable by keyboard.** This is a tiling window manager.
6. **Reduced motion is honored** — every role degrades.

---

## 8 · Open questions — answer them explicitly in your spec

1. Should the top row be hideable? If so, how does it come back?
2. Is the sketch's second "Top Row Bar?" a **per-tile title bar**, or the same global
   question restated? It appears twice and is genuinely ambiguous.
3. Split-screen minimums — resolve the geometry conflict in §4.
4. Does a tool's header face consume a header budget? The row is 40px and finite.
5. Does hover-reveal ship at all, or opt-in only?
6. What does the **empty slate** look like — the first screen a new operator ever sees?
7. How does per-tab color stay legible rather than becoming confetti?
8. How do tiles stack against each other without escaping their z-band?

---

## 9 · What to produce

1. **FROM → TO** for every region in §5, in display language, with the reasoning.
2. **Layout system** — the frame, the inset, rail reveal states, tiling grammar, the
   responsive story down to 1440×900.
3. **Component anatomy** for: the universal scan/search input in all four mode
   combinations · the header context block · a tab (default, active, renamed, colored,
   crowded) · the tab context menu · a tool icon (idle, active, pinned, summoned) · a tile
   (idle, hovered, focused, dragging, snapping) · the one composer in all four modes · the
   empty slate.
4. **States** — loading, empty, error, offline, scan-armed, scan-landed, session-active,
   session-parked. Offline matters: this warehouse loses connectivity.
5. **Motion spec** as roles, extending the existing role vocabulary.
6. **Density spec** — this application runs at floor density. Justify every pixel of
   padding you add.
7. **Answers to §8**, stated as decisions with reasoning.

**Constraints:** semantic tokens only, no invented hex · both themes · mono for identifiers
only · no interaction that requires hover as its sole trigger · no floating overlay covering
the work surface · nothing that can steal a scan.
