# HANDOFF — Warehouse OS end-goal UX / UI

**Status: DRAFT, revised 2026-08-22.** The visual and interaction target for the whole app,
transcribed from two operator wireframes — a first freehand sketch and a refined mockup that
supersedes it on frame, rails and reveal behaviour. Where the two disagree, **the refined
mockup wins and the doc says so inline.** Where a question is still open, §9 keeps it open
rather than inventing an answer.

Paste everything below the line into a fresh Claude Code session pointed at this worktree.

---

You are defining and building the **end-goal UX/UI for the entire Cycle Forge Warehouse OS**
in `/home/michaelgarisek/Projects/cycleforge-app/.claude/worktrees/warehouse-os-refactor-8f2dc3`.

Read `docs/warehouse-os/` first — README, 01-repo-map, 02-target-architecture,
03-decisions, 04-roadmap, HANDOFF-phases-4-9. This document is the **visual layer** on top
of that architecture. The architecture says what the objects are; this says what they look
like and how they feel.

> **Open the prototype before reading further:**
> `docs/warehouse-os/prototype/warehouse-os.html` — a self-contained, no-build HTML shell
> you can click. **§10 is the iteration surface**: it lists what the prototype settles, the
> nine places it contradicts this document, and the exact details still to design. Change
> the prototype, look at it, then record the ruling here.

> **The numbered law catalog was wiped 2026-08-24.** This file is historical
> visual notes, not a live index. Do not add law numbers here.

## 0 · The feel

**The whole app is a HUD.** You are looking *into* the operation through a frame, the way a
helmet visor or an aircraft instrument panel frames the world behind it. The operator's
reference points, in their own words: **Arch Linux / Hyprland** — a tiling window manager
where the workspace is yours, windows snap, everything is keyboard-reachable, and chrome
gets out of the way until you ask for it.

**One radius token frames the whole thing.** The workspace is inset and carries a **visible
stroke on all four sides**, with its corner radius resolved from a **single token** — so the
operator changes the entire app's frame character in one edit. Everything outside that
frame — the rails, the beam — stays square and runs edge to edge.

**Radius is therefore semantic, not decorative: it appears in exactly one place, and that
place is the boundary between chrome and work.** A control that grows a radius is a bug.

> **Settled 2026-08-22 in the prototype.** `--r-sm / md / lg / xl / full` were **deleted**,
> not zeroed — the rule is enforced by absence, because a token that still exists is a token
> someone reaches for. Two radius tokens remain: `--r-none: 0` and `--r-hud: 4px`, and a
> blanket `*, *::before, *::after { border-radius: var(--r-none) }` means an element is
> square unless it literally names `--r-hud`. Exactly one does: the canvas frame.
> `--r-hud` dropped 16px → **4px** on the operator's "boxy, squared off, WMS" direction; it
> is still a one-line change in either direction (0 for a flush terminal read, 16 for the
> original visor read) and it still moves the whole application.

**Nothing may animate geometry.** This is a WMS and it has to be immediate. No transition
and no keyframe may touch `width`, `height`, `top/left/right/bottom`, margin, padding,
`transform`, or framer's `layout` / `layoutScroll`. Rails expand instantly, tool panels
appear instantly, banners appear instantly. The only animatable properties in the shell are
**colour and opacity**, capped at one 80ms token — they composite off the main thread and
never move a neighbour. A collapse that tweens its height still occupies the space for the
length of the tween, which is backwards for an interaction whose only purpose is to hand
space back; a row that springs into position delays the paint that tells a scanning operator
the scan landed.

> Note: the previous house identity ("Kinetic Ledger") mandated zero-radius flush-square
> ops chrome, and `header-shell.ts` carried an explicit ruling that a rounded content
> cutout had been *removed*. That constitution was deleted on 2026-08-21. The HUD inset is
> the deliberate reversal. Introduce it as a token in `header-shell.ts`, not as a class
> string sprinkled around.

**Start from an empty slate.** A new operator has nothing pinned — no tabs, no tools. They
build their own workspace. Never seed defaults.

## 1 · The frame

**Superseded 2026-08-22 by a refined mockup.** The earlier sketch's hover-revealed
rails are replaced by **persistent narrow icon rails**. That change resolves the
tablet/glove problem outright — see §6. The frame below is what the prototype builds
today; §10 records every ruling that got it there.

```
┌────────────────────────────────────────────────────────────────────────────┐
│ ▥ ⌕ ▣ │ GLOBAL CONTEXT — SESSION title (renameable) — carton context   │ ⋮ │
├───┬────────────────────────────────────────────────────────────────┬───────┤
│ ≡ │ ╭────────────────────────────────────────────────────────────╮ │   ⋮   │
│ ☑ │ │                                                            │ │   ≡   │
│   │ │                                                            │ │   ▣   │
│ P │ │                                                            │ │       │
│ A │ │                     THE  WORKSPACE                         │ │   T   │
│ G │ │                                                            │ │   O   │
│ E │ │              one stroke, one radius token                  │ │   O   │
│ S │ │                                                            │ │   L   │
│   │ │                                                            │ │   S   │
│ ▢ │ │                                                            │ │       │
│ ▢ │ ╰────────────────────────────────────────────────────────────╯ │       │
└───┴────────────────────────────────────────────────────────────────┴───────┘
  icon rail                   inset · framed                        icon rail
```

Four facts the mockup settles:

**1 · The rails are icon-width and always present.** Not 240px panels, not hidden
drawers — narrow persistent strips carrying icons and a **vertical text label**
(`PAGES` on the left, `TOOLS` on the right, set on the rotated axis). They are the
permanent edges of the HUD. Expanding one is a click; *reaching* one never is.

**2 · The workspace is drawn, not implied.** The centre carries a **visible stroke on
all four sides** with the shared corner radius. It is a frame you look through — the
one place radius appears in the entire application. The rails and header stay square
and run to the edge.

**3 · The top-left corner is a three-icon cluster**, in this order:

| | Icon | Job |
|---|---|---|
| 1 | **Scan** | The scan input. **The most top-left thing in the app.** |
| 2 | **Search** | Query — the other half of the input's mode matrix |
| 3 | **Context** | The carton / entity glyph — what the session is holding |

Scan is first because it is the most-used control on the floor and because a fixed
origin is what lets an operator reach it without looking.

**4 · The header centre is one line, and the session title is editable in place:**
`GLOBAL CONTEXT — SESSION title, able to rename — carton context of scan type`.
One string, three segments, degrading gracefully as it narrows. **Renaming happens
here**, not in a settings pane — the operator names the work while doing it.

Everything else that used to live in the header is **broken up and pushed to an
edge**: navigation to the left rail, utilities to the right rail, the remainder into
the top-right `⋮`.

## 2 · Global header — the always-on row

**Simplified 2026-08-22.** The first sketch loaded six zones into the beam. The refined
mockup breaks that up: the beam keeps only the corner cluster, one context line, and an
overflow. Everything else moved to a rail.

| Zone | Contents |
|---|---|
| **Corner cluster** (far left) | **Scan** · **Search** · **Context** — three icons, in that order |
| **Context line** (centre) | `GLOBAL CONTEXT — SESSION title (renameable) — carton context of scan type` |
| **Overflow `⋮`** (far right) | Everything that used to be a fixed header icon |

What moved out, and where it went:

| Was in the header | Now |
|---|---|
| Scan-type / process stage | Folded into the **context line** — it is part of what the session *is* |
| Pairing (`TRK#` ↔ `Serial`) | A **tool**, right rail — it is an operation, not an identity |
| Timer / stopwatch | **Tools**, right rail, with an optional compact header face |
| Pins · Recents · page switcher | **Left rail** — navigation lives on the left |
| Search · goal · inbox · assistant | Corner cluster (search) and the `⋮` overflow |

The centre line is the whole point of the beam: **it is the only place in the application
that says what the operator is doing right now**, and it must never be wrong.

Four things this pins down that the architecture doc left loose:

1. **Scan type *is* the process stage.** `unbox / packing / ready-to-pack / QC` are not
   arbitrary session labels — they are positions in a pipeline. The header names where the
   operator is in that pipeline, and the type drives what displays and what validates.
2. **The scan bar has a 2×2 mode matrix**, not a 3-way switch: input can be **auto** (wedge
   scanner fires it) or **manual** (typed), and the query side can be **search** or
   **search-filter**. Model both axes; do not collapse them.
3. **Pairing is first-class, but it is a TOOL, not header chrome.** The first sketch put
   `TRK# ↔ Serial` in the beam; the refined mockup does not. Pairing is an *operation* the
   operator performs, and operations live in the right rail. The beam reports identity,
   never verbs. *(This supersedes the earlier reading.)*

4. **The session title is renamed in place, in the beam.** Not in a settings pane. The
   operator names the work while doing it — "Bin 4 recount" instead of "Unbox (3)". Design
   the inline edit: how it enters, how it commits, what an unnamed session shows.

**Still open from the first sketch:** *"Top Row Bar? Button to Display top Row?"* — whether
the beam itself is hideable. The refined mockup keeps it always present, which is the
answer this doc assumes. If you make it hideable, leave an affordance; a HUD whose only
permanent chrome can vanish with no way back is a trap.

## 3 · Left rail — PAGES

**A persistent narrow icon strip**, labelled `PAGES` on the vertical axis. Always present,
never hidden. Expanding it is a click; reaching it never is.

Top to bottom, as in the mockup:

| | Element | Job |
|---|---|---|
| 1 | **`≡` hamburger** | **How you add a page or a data table.** Opens a searchable index of everything launchable, grouped by category (sessions · tables · tools · admin). This is the "+" launcher from the first sketch, now given the hamburger's affordance |
| 2 | **Pinned pages** | Top of the rail, directly under the hamburger. The mockup shows a **checklist** icon — e.g. the daily check. These are the operator's own, chosen and ordered by them |
| 3 | **`PAGES` label** | Vertical text, naming the rail's job |
| 4 | **Open tabs** | Below the label — the active one carries a lit cell; the rest sit in the rail's ground tone |
| 5 | **Recents** | Below the tabs, visually separated |

**Pinned pages sit ABOVE open tabs, and that ordering is meaningful.** A pin is a
destination the operator always wants within reach; a tab is something currently open. The
daily checklist is the canonical pin — it is not "open", it is *always there*.

**Recents stay separate from tabs** (operator ruling). Same rail, distinct treatment.
See §3.1 — recents are per staff, per org, and banded by kind.

**The hamburger is the only way to add a page or table**, and it carries search. No
separate "+" control, no second index.

### 3.1 · Recents — per staff, per org. Never per session.

**Ruled 2026-08-22.** Two decisions, taken together because neither works alone.

#### The work queues leave the rail entirely

Today's "recent rails" do two jobs at once: they are the **work queue** (what is
in receiving right now) and the **history** (what *I* touched). Those are
different objects and they now go to different places.

**Every work-queue rail becomes a table tile** — triage-shaped DB rows in the
canvas, reachable from the launcher's Tables group. `ReceivingFeedRail`,
`TriageRecentRail`, `TestingRecentRail`, `PickupSidebarRail`, `LabelsRecentRail`,
`ProductLabelsRecentRail`, `PackRecentPacksRail`, `SupportTicketsRecentRail`. A
queue wants width, columns, sort, and virtualization; a 208px strip can give it
none of those, which is why the rail's peek card existed to smuggle back the
identity facts the row had no room for. In a tile the columns just fit.

What that deletes: `SidebarRailShell` + `useSidebarRail` + `RailRow` (~1,191 LOC
of shared shell) and six filter components — `UnboxRecentRailFilters`,
`ReceivingRecentRailFilters`, `StationHistoryRailFilters`,
`SupportRecentRailFilters`, `LabelPrintRailFilters`, `PickupRailFilters` — whose
facets become table column filters, where they belong. Along with the peek card,
the hover-preview hook, the collapsed-strip MRU publisher and the Upstash
snapshot cache, none of which a table tile needs.

> ⚠️ The **per-staff dismiss must survive the move.** `staff_rail_exclusions`
> (migration `2026-07-03k`) is a reversible per-operator hide. The pre-Phase-4
> version of that action hard-`DELETE`d the receiving line **for everyone**;
> the exclusion table is the fix. It moves to the table tile intact — same
> writers (`insertStaffRailExclusion` / `deleteStaffRailExclusion`), same
> server-derived `station`. Do not reimplement it as a client-side filter.

#### What is left in the rail is a history, and it is keyed to the person

One recents block. **Per staff, per org — not per page, not per station, and
not per session.**

Session is the wrong key and the reason is the value curve: a recent is worth
least at t+30s, when you still remember, and most at the start of the next
shift, when you do not. Sessions here do not expire — §8 rules them persistent —
they are **closed by operator action**. So a session-scoped history would delete
itself on the single action that means "I finished a batch", which is exactly
when an operator goes looking for what they just did.

Personal means per staff. That key already exists and already holds the rest of
the window manager:

```ts
// staff_preferences.prefs.workspace.recents — one entry in the existing
// WorkspacePrefs Zod contract, beside openTabs / pinnedTabs / focusedTabId /
// keybindings / pinnedTools / layout. NO MIGRATION.
type RecentKind = 'carton' | 'pack' | 'label' | 'pickup' | 'ticket' | 'search' | 'session';

interface RecentRef {
  kind: RecentKind;
  id: string;
  title: string;       // denormalized at write time — the rail renders with zero queries
  subtitle?: string;   // tracking, grade, bin: what you actually recognize it by
  at: number;
  sessionId?: string;  // MARKS the entry. Never scopes it.
}
```

`prefs-schema.ts` already states the principle, about `keybindings`: *"A PERSON
fact, not a device one: a staffer's remapped chord must follow them to the next
bench, which the localStorage mirror cannot do alone."* Recents are the same
fact. `useRecentPages`' `sidebar.recentModes` localStorage key is device-local
**and** keyed on `{pageId, childId}` — a page concept this refactor deletes —
so it is replaced outright, not migrated.

Four rules:

| | Rule | Why |
|---|---|---|
| 1 | **Keyed per staff + org.** `sessionId` rides on the entry and only tints it | The trail outlives the batch |
| 2 | **Capped per kind, never globally** | A 12-label print run can only evict labels. One global MRU lets a background batch destroy the whole trail |
| 3 | **Banded by kind, band order fixed; MRU inside a band** | Cartons sit at the same offset from the top whatever you did at another bench. `SidebarRecentRailBase` already killed its 50ms load stagger because *"these are the navigators an operator reaches into by muscle memory"* — a globally-reordering list breaks that far harder than a cascade did |
| 4 | **Two forgetting mechanisms.** Entity kinds keep the DB-backed dismiss; `search` and `session` are a local drop | There are genuinely two kinds of forgetting |

#### The marker — and why it has to exist

Banding buys position stability and costs you *"the newest thing is at the
top."* The **most-recent-selection marker** buys that back without moving a row:
a solid left-pointing caret on the trailing edge of exactly one entry, anywhere
in the list, plus an accent wash on that row.

Two edge devices, deliberately on **opposite** edges so one entry can carry both
with no ambiguity:

| Edge | Device | Means |
|---|---|---|
| Leading | 3px green stripe | touched by the **live session** — a mark, not a scope |
| Trailing | solid caret | the **single most recent selection**, anywhere in the rail |

Selecting a recent re-stamps it as newest: **the marker moves, the band does
not.** That is the trade made visible, and it is the behaviour to preserve when
this ports to React.

Collapsed at 40px the row is a 12px kind glyph left-aligned at 4px with the 9px
marker on the trailing edge — measured, because at 14px the two collided.
Expanded at 208px: condensed uppercase band labels, `title` over a mono
`subtitle`.

### The tab context menu — the personalization surface

Straight from the sketch, this is the verb list on a tab:

| Verb | Behavior |
|---|---|
| **Split** | Split this tab into the canvas as a new tile. **Splitting is a menu verb, not only a drag** — keyboard and menu reachable, per the Hyprland reference |
| **Rename** | Operator names the tab. A session named "Bin 4 recount" beats "Unbox (3)" |
| **Change icon** | Per-tab icon |
| **Change color** | Per-tab accent |
| **Delete** | Close and forget |

All four personalization facts (name, icon, color, position) persist **per staff, per org**
in `staff_preferences.prefs.workspace` — an open JSONB bag with a Zod contract and a
shallow-merge PUT that already exist, so **no migration**. Two hazards: the merge is
shallow (send whole sub-maps, never nested partials), and the existing localStorage mirror
key `cf.quickAccess` carries no staffId or orgId — do not repeat that.

> ⚠️ Per-staff icon colors reverse a prior ruling (`spine-section-accent.ts` said "No hue,
> anywhere in this module"; per-section hue was removed 2026-08-08 for one monochrome
> treatment). That constitution is deleted, so this is now a live product choice — but
> implement it through tokens, never `className` hue overrides.

## 4 · Center — the tiling canvas

- **Hyprland-style tiling.** Drag, drop, snap into columns, rows, splits. The sketch shows
  a two-column split with the right column split again into two rows — arbitrary nesting,
  not a fixed grid.
- **Hotkeys for window manipulation.** Split, focus, move, resize, close — all keyboard
  reachable. There is **no hotkey library installed** and 51 files hand-roll their own
  `window` keydown listeners with exactly one user-remappable key in the whole app. Build
  a real keybinding registry; do not add a 52nd listener.
- **Hover highlight.** A tile highlights on hover — as an **instant** colour and outline
  change, not an animation. The sketch's "Customize · Highlight · Animation" survives only
  as *colour* customization; the geometry is fixed. Four tile states, four distinct
  treatments, all drawn with `outline` (which does not participate in layout) or
  `background`, so none of them reflow:

  | State | Treatment |
  |---|---|
  | **hover** | 1px inset grey ring, no fill |
  | **focused** | 2px inset accent ring · accent-tinted header · 3px accent edge bar |
  | **dragging** | 2px dashed grey ring · 40% opacity |
  | **snap-target** | 2px dashed accent ring · accent wash |

  Focus and hover were visually identical in the first prototype pass. In a tiling manager
  they are different facts and one of them decides where the keystrokes go.
- **The inset radius token** frames the canvas.

**Open question from the sketch:** *"Top Row Bar? Button to Display"* also appears at the
canvas bottom — it may mean a per-tile title/action bar rather than the global header.
Ask before building; the sketch is genuinely ambiguous here.

> ⚠️ **Geometry does not fit today and the operator must choose.** Current floors:
> `MIN_WORK_SURFACE_PX = 784`, spine 240, right rail 420. Two tiles at 784 is **1,568px
> before any rail**; with the spine, 1,808px. **Playwright runs at 1440×900 and the
> Electron window opens at 1600×1000.** Recommendation on file: keep 784 as the *session*
> floor, add a smaller table-tile floor (~520 — a table degrades gracefully, a scan bench
> does not), gate session-beside-session to ≥1920. Confirm before hardcoding.

## 5 · Right rail — TOOLS

**A persistent narrow icon strip**, labelled `TOOLS` on the vertical axis — the mirror of
the left rail. When a tool opens it **pushes from the top right**; it never floats over the
work.

Top to bottom, as in the mockup:

| | Element | Job |
|---|---|---|
| 1 | **`⋮` overflow** | Tools not pinned |
| 2 | **`≡` hamburger** | Add / search tools — the mirror of the left rail's |
| 3 | **Pinned tools** | The mockup shows a **camera** (capture). Operator-chosen, operator-ordered |
| 4 | **`TOOLS` label** | Vertical text, naming the rail's job |

The two rails are **deliberately symmetrical**: same width, same hamburger affordance, same
vertical label, same pin-above-the-label ordering. Left is *where you go*, right is *what
you use*. An operator who learns one has learned both.

- **Timer · Stopwatch · Information** are tools, and they may also surface a compact readout
  in the beam — so a tool descriptor may declare **a rail body and a header face**.
- **Pairing (`TRK#` ↔ `Serial`) is a tool**, not header chrome.
- The active tool's icon is **highlighted** while its panel is open.
- Tools are **pinnable, keybindable, reorderable, and drag sources** — drag a photo from
  the Photo Library tool onto a ticket, a chat, or a session tile.

> ⚠️ **The blocker:** today a right-rail registration stores a *live React element owned by
> a mounted page*, so a tool structurally cannot open from a page that does not already
> mount it. It must become a **descriptor with a lazy factory**
> (`{ toolKey, title, icon, group, load: () => import(...), dragPayload?, keybinding? }`).
> Nothing in the tool palette works until that lands — see HANDOFF-phases-4-9 component 2.

## 6 · Reveal behavior — RESOLVED by the refined mockup

The first sketch said "Hover to Display" on both rails. **The refined mockup replaces that
with persistent narrow icon rails, and that is the right answer.** Recording why, because
the reasoning also governs every future edge affordance.

Hover-as-sole-trigger fails on this floor, four ways, and the code already says so:

1. **Warehouse tablets get the desktop layout.** Tablets are deliberately excluded from the
   mobile route, and iPadOS reports a macOS UA. On `(hover: none) and (pointer: coarse)` a
   hover-only rail is simply **unreachable**.
2. **No touch fallback exists to inherit** — the touch-primary flag has three references,
   all inside one provider; nothing branches on it.
3. **The hover engine is tuned against it** — it opens at **0ms** ("the bench cannot afford
   hover-intent latency") on a one-at-a-time registry that *evicts* whatever is open. A 0ms
   screen-edge rail fires on any pointer transit and evicts the menu the operator is
   mid-interaction with.
4. **Scanning has no pointer at all** — the wedge listener never reads or writes focus.

A previous portaled slide-over rail was deleted for exactly this: *"on a bench it landed on
the rail the operator was working from."*

**The persistent icon rail solves all four** without giving up anything the sketch wanted.
The rails are already out of the way — they cost ~40px each, not 240 — the canvas still
dominates, and every affordance is reachable by touch, mouse and keyboard alike. Hover may
still *preview* a rail's expansion on mouse-primary desks; it must never be the only way in.

## 7 · What to build on — real modules, not from scratch

| Need | Use |
|---|---|
| Motion / highlight animation | `@/design-system/motion` + `motionRole.*` — the only legal import path; carries `useReducedMotion` |
| Color / spacing / type / elevation / z-index | `@/design-system/tokens` — no page-local hex |
| Radius | `cornerClass` in the tokens dir — add the HUD inset token here |
| Buttons / panels | `Button` / `Panel` in `src/design-system/primitives/` — semantic variants, not className overrides |
| Cross-tree state | Module singleton + `useSyncExternalStore` — 19 precedents; copy `src/lib/right-rail/store.ts`. **No state library is installed; do not add one** |
| Drag & drop | `@dnd-kit` is installed and used in 18 files |
| Command palette | `cmdk` |
| Virtualization | `@tanstack/react-virtual` |
| Per-staff persistence | `staff_preferences.prefs` — JSONB, Zod-gated, RLS from birth, no migration needed |
| Tiling / docking / resizable | **Nothing installed.** Generalize the *pure* `resolveRightRailFrame` (22 existing unit tests, zero React) into an N-pane solver, and add a vertical twin to `useHorizontalEdgeResize`'s pure drag math |
| Hotkeys | **Nothing installed.** Build the registry |

## 8 · Operator rulings — law, do not relitigate

- **Sessions are `kind: 'scan' | 'task'`.** A scan session carries a `scanType`. **Exactly
  one scan session armed app-wide at a time** — that is how scan ownership resolves, so
  there is no per-tile scan focus model and tiles never compete. Since `2026-08-22b` this
  is a DATABASE constraint (`ux_work_sessions_armed_scan`), not a convention. See §8.1 for
  the UI rule that sits on top of it — they are not the same rule.
- **Sessions and sign-ins are persistent.** No absolute timeout ends a mounted shell.
- **No per-tile permission architecture.** Dogfood tenant; API routes stay gated by
  `withAuth`.
- **Recents stay completely separate from the window manager.** Still true, and
  now sharper: recents are **per staff, per org**, banded by kind, and the work
  queues that used to share the word "recent" are table tiles. See §3.1.
- **Simplification is the deliverable.** Deleting code that does not fit is the goal.
- The old constitution was deleted 2026-08-21. **Do not reconstruct it; do not add guards.**
  Enforcement here is the compiler — required props with no default.

### 8.1 · One session tile. `armed` and `open` are different words.

**Ruled 2026-08-22.** `work_sessions` (migration `2026-08-22b`) already separates two
things it is easy to merge, and the separation is load-bearing:

| Concept | Rule | Enforced by |
|---|---|---|
| **Armed** scan sessions | exactly 1 per org, from any code path, forever | `ux_work_sessions_armed_scan` — a partial unique index over the tenant column alone |
| **Open** scan sessions (rows) | 1 live + N parked | `work_sessions_armed_chk`: armed implies `status='open'` |
| **Open** task sessions | N. The schema says so explicitly | nothing — task sessions do not own the wedge |
| **Scan-session TILES on the canvas** | **exactly 1** | *this rule* — new, UI-only |

The fourth row is the one that did not exist. The database can stop two sessions from being
*armed*; it cannot stop the shell from rendering two session tiles that look identical while
only one owns the wedge. **A tile the operator believes is armed but is not is a mis-scan
generator, and a mis-scan is physical inventory error.** So: one scan-session tile, and
opening another **parks** the one that is open rather than sitting beside it.

**Parking is lossless, which is why one-at-a-time costs nothing.** `work_sessions.state`
JSONB is documented as holding "draft buffers, tile geometry"; `parked` is a first-class
`status`; there is no `expires_at` (D8 — the table refuses to inherit
`station_scan_sessions`' 12-hour wall); and `claimed_by_staff_id` is separate from
`staff_id` precisely so *"a lead resumes someone else's parked session."* The interruption
case — rush order mid-unbox — is park, do the rush, resume. Nothing is lost, and the parked
session lands in the recents **Sessions** band, one click away.

A second live session would therefore buy **zero** capability and cost three things: the
mis-scan risk above, 1,568px of canvas floor before any rail (D4), and an ambiguous context
line — the beam is "the only place in the application that says what the operator is doing
right now, and it must never be wrong" (§2), which it cannot be if there are two answers.

#### Switching type ENDS and OPENS. It does not mutate `scan_type`.

Tempting, and wrong. `work_sessions_scan_type_chk` makes `scan_type` an IFF with
`kind='scan'`, and the column is real, queryable and historical. Mutating it in place:

- **rewrites history** — ops_events and the `client_event_id` idempotency anchor were minted
  under the old type;
- **orphans the draft buffer** — `state` JSONB belongs to the old type's surface;
- **breaks `version`** — it is monotonic per session and a client applies an event only at
  `version + 1`; a type swap means the semantics changed underneath a client that has no way
  to detect it;
- **makes the pipeline strip a lie** — `unbox → packing → ready → QC` renders as
  *progression*, and progression needs more than one row to be true. A session that simply
  becomes a different type has no history to show.

So a type switch is `status='ended'` on the old row and a new row that carries the carton
binding forward: one operator gesture, two rows, honest history. Cost: `state.tileGeometry`
copies forward. Worth it.

### 8.1.1 · Searching does not park. Scan and search are one field.

**Ruled 2026-08-22.** Two findings, and the second follows from the first.

#### Parking is a work event, not a lookup

`status IN ('open','parked','ended')` is real, and `work_sessions_armed_chk`
(`armed = false OR (kind='scan' AND status='open')`) makes it consequential: **a
parked session cannot hold the arm.** So "pause the session to check a search"
would, for the three seconds of a lookup:

- **drop the arm** — the wedge has no owner; a scan in that window goes nowhere,
  or into the search field;
- **churn `version`** — it is monotonic, "bumped by exactly one per accepted
  mutation", and clients apply events only at `version + 1`. Dozens of
  park/resume pairs a shift, all meaning nothing;
- **flicker the beam's state badge** armed→parked→armed all day, training the
  operator to ignore the one indicator that says where scans land;
- **free `ux_work_sessions_armed_scan`** — an unarmed window is a race for any
  other shell waiting to arm.

Park's real triggers: opening a different session (park-and-swap, §8.1),
explicit park, shift handoff (`claimed_by_staff_id` + the claim lease, which
exist for *"a lead resumes someone else's parked session"*). **Never** for a
search, a tool, a tile focus change, or a table.

#### The search button was an over-implementation — §1 already said so

§1's own table reads: *"**Search** | Query — the other half of the input's mode
matrix."* Search is a MODE of the scan input, not a sibling control. The
standalone button also made the redundancy worse, because it opened the launcher,
which has its own input — two search fields in one app.

It is deleted. **One persistent field, no button, nothing to switch before
typing**, because a wedge burst (10–30ms inter-keystroke, terminated) and human
typing are different input paths: the scanner lands in the armed session while
the operator is mid-search. There is nothing to pause and nothing to toggle.
Measured: typing a query leaves the session `armed` before and after, and the
corner cluster narrowed 538px → 507px.

A **button** would also have been the wrong shape twice over: it implies a
discrete action on the control §1 makes "the most top-left thing in the app" so
it is reachable without looking, and a toggle-before-typing is a modal input,
which is a mode-error generator.

#### What the 2×2 matrix is actually for

Both axes survive (§2: "do not collapse them"), with their real jobs named:

| Axis | Job |
|---|---|
| `auto` / `key` | **Does my typing count as a scan?** `key` is for hand-entering a damaged barcode *into the session*. This is the only genuine mode; scan-vs-search never was one |
| `find` / `flt` | What a query does — search the org, or filter the focused tile |

**Mode error is prevented by naming the destination, not by memory.** The
placeholder is that readout and always says where the field's contents go:
`SCAN · OR TYPE TO SEARCH` / `SCAN · TYPING COUNTS AS A SCAN` /
`SCAN · OR TYPE TO FILTER THIS TILE`.

### 8.1.2 · The procedure writes ops_events. That is the manager view.

**Ruled 2026-08-22**, and it answers the open question from §3.1: **yes, ticking a
procedure step writes an `ops_event`.** Which makes the procedure the session's
structure rather than a Library tool — and makes the manager's session replay a
query, not a new subsystem.

#### Almost all of this is already built

| | State |
|---|---|
| `ops_events` — polymorphic `(entity_type, entity_id)` + jsonb payload | ✅ `2026-06-30` |
| `session_id` FK + denormalized `session_type` | ✅ `2026-08-23b` |
| `recordOpsEvent` threads both | ✅ landed |
| Realtime transport, auth-scoped | ✅ **Ably** — `AuthenticatedAblyProvider`, plus 4 existing consumers |
| `work_sessions.version`, monotonic, +1 per accepted mutation | ✅ `2026-08-22b` |
| Manager reporting reads one spine | ❌ `journey.ts` is a **13-branch UNION** |
| Anything emits procedure-step events | ❌ the procedure does not exist yet |

The `2026-08-23b` header states the target outright: *"Reporting is 'done' when
it reads `ops_events` alone, and the union branch count is the progress bar."*
It is at 13. That number is the roadmap for this feature.

#### Do NOT build a websocket

**Ably is already the transport**, already authenticated per-user, already in
production on four surfaces. A second realtime path for this would be exactly the
fork this refactor exists to remove. (`ws` in `package.json` is not a second
transport — do not promote it into one.)

#### Do NOT stream every event to the manager

An unbox bench emits ops_events continuously. Streaming raw means a manager's page
runs a React render per event per operator, and the manager cannot read at that
rate anyway. **`work_sessions.version` is already the change-detection primitive** —
monotonic, bumped by exactly one per accepted mutation:

- **Live channel carries `{ sessionId, version, sessionType, stage, actor }`** —
  a heartbeat, a few dozen bytes, one message per real mutation.
- **The manager's list renders from heartbeats alone.** No event bodies.
- **Opening a session fetches its `ops_events` page** (`WHERE session_id = $1
  ORDER BY occurred_at`), and re-fetches only when `version` exceeds what it holds.

That is a live view for a fraction of the traffic, and it reuses an invariant
instead of inventing one.

#### "Why" is DEFERRED (operator call, 2026-08-22)

Free-text "why" is not being built now. *Who · what · when* are already columns
and are enough to ship. What follows is the shape it takes **when** it is built,
recorded so nobody reinvents it as a text box.

#### "Why" is structural. It is not a free-text prompt.

*Who · what · when* are mechanical and already columns. *Why* is the expensive
one, and prompting for it on every mutation guarantees a column full of `.`.

**Intent comes from position, not from typing.** An event emitted inside a
procedure step carries that step's id in its payload — the "why" is *"because
step 3 of the unbox procedure says to."* Free text is reserved for **deviation**:
skipping a required step, overriding a grade, adjusting a count after commit.
Prompt there, and only there, where the operator actually has something to say
and a reason to say it.

This is also what makes the replay readable: the manager sees the procedure as
the spine and the events hanging off each step, rather than a flat log they have
to reconstruct intent from.

#### One design risk, stated once

Live over-the-shoulder observation changes operator behaviour: staff who know
they are watched in real time batch their commits, avoid features that emit
events, and reconcile off-book afterwards. That degrades exactly the data the
manager opened the view to get. Two mitigations, either of which works —
**default the view to after-the-fact** and make live an explicit action, or
**make observation visible to the operator**. It is a data-quality decision, not
a policy one, and it is the operator's call.

#### The manager surface — per staff, two table tiles

Built in the prototype. It is **per staff**, not per session, because the
question a manager opens this to answer is *"what is Marisol doing"*, not
*"what happened to carton 8842"* — the carton question is the queue table's job.

**Tile 1 · Staff activity** — one row per staffer: live dot, session, type,
stage, **`ver`**, last event, events today. It renders from **heartbeats only**;
no event body crosses the wire to draw it. `ver` ticks live.

**Tile 2 · `{staff} — replay`** — that staffer's `ops_events` page, grouped by
**stage**, each event carrying time · CRUD verb · entity · detail. Verbs are
badge-coded (create / update / delete) because *what kind of change* is the
first thing scanned for.

Two properties worth keeping when this ports:

1. **A replay is a `table` tile, not a session tile.** So it never contends with
   the one-scan-session rule (§8.1) and a manager can hold several open at once
   — verified: three replays open, session tiles still exactly 1.
2. **Stage is the spine, and it is a placeholder for the step.** `ops_events.
   session_type` exists today, so stage grouping works now. When staff
   procedures land, STEP becomes a finer grouping inside each stage and the
   whole replay gets its "why" for free — no re-layout, one more nesting level.

Launcher → **Tables** → *Staff activity*.

### 8.2 · Rail anchoring — both edges, slack in the middle

**Ruled 2026-08-22.** The rail's two content blocks each anchor to a **screen edge**, and
the unused space sits between them:

```
┌─────┐ ← screen top edge — an infinite Fitts target, cannot be overshot
│  ≡  │  launcher            fixed
│  ▣  │  PINS                operator-chosen, near-fixed
│  ▣  │
│PAGES│  label
│ tab │  ← tabs grow DOWN from a fixed origin
│ tab │
│     │  ← SLACK. Nothing lives here, so nothing can be moved by it.
│RECNT│  ← recents anchored UP from a fixed origin, bounded, own scrollport
│ row │
│ row │
│ ⟳ ⚙ │  utility             fixed
└─────┘ ← screen bottom edge — the other infinite target
```

**Why not centre the blocks.** A vertically-centred block has no stable anchor: its
y-position is a function of how many items sit above *and* below it, so opening one tab
slides the whole thing. That is the same muscle-memory destruction the banded recents exist
to prevent (§3.1 rule 3), just in a different dimension — instead of rows reordering, the
block translates. Screen edges are the only targets you cannot overshoot; that is why menu
bars and taskbars are edge-anchored and why both of these are too.

The net effect is what centring was reaching for — content weighted toward the middle of a
900–1080px strip instead of stacked in the top corner — with none of the instability.
Measured: opening three tabs moved neither the first tab (y=166) nor the recents block
(bottom=825).

**Bonus: this is the real answer to rail overflow** (was open question 6). Two independent
scroll ports — a long tab list cannot starve recents and a long history cannot starve the
tabs. "The tab list scrolls" was half of it.

#### There are no "pinned recents"

A **pin** is chosen and permanent. A **recent** is observed and transient. Fusing them means
the pins block and the recents block both hold permanent items — two affordances for one
job, which is the exact fork §3 exists to remove (it is why the second `+` was deleted).
If an operator wants a carton permanently reachable, that is a **pin**, and it goes in the
pins block at the top. Recents have exactly one behaviour: observed, banded, capped,
forgettable.

## 9 · Open questions — answer with the operator, do not guess

**Resolved by the refined mockup (2026-08-22):**

| Was open | Answer |
|---|---|
| Does hover-reveal ship? | **No.** Persistent narrow icon rails. See §6 |
| How do you add a page or table? | The left rail's **hamburger**, which carries search. One index, no second "+" |
| Where do pinned pages live? | **Top-left rail, above the tabs** — the daily checklist is the canonical example |
| Is the header hideable? | Assumed **no** — the mockup keeps the beam always present |
| Where does pairing live? | A **tool**, right rail. Not header chrome |
| Where does the radius appear? | **The workspace stroke, and nowhere else.** Rails and beam stay square |

**Resolved in the prototype (2026-08-22), squared-off WMS pass:**

| Was open | Answer |
|---|---|
| What does a tile look like with no session? (2) | The empty slate: uppercase condensed heading, two entry actions, hotkey hints. Nothing seeded |
| Does a tool's header face consume a beam budget? (3) | **No header faces.** The beam is one 40px line and it reports identity only. A tool that wants a readout gets it in its own panel |
| How does per-tab colour stay legible? (4) | Colour is a **3px structural edge stripe**, never a fill or a dot. It reads the same collapsed or expanded and it cannot become confetti |
| What happens when the rails overflow? (6) | **Scroll, and only the tab list.** Pins, the label and recents keep their height; the tab list is the flex child that shrinks |

**Still open — these block design work:**

1. **Split-screen minimums (D4).** The prototype now uses the **real** floors — 784px for a
   session tile, 520px for a table tile — and lets the canvas scroll horizontally rather than
   crushing below them. That makes the problem visible instead of silent: at 1440px one
   session beside one table fits (784 + 520 = 1,304 in a 1,343px canvas) and **two sessions
   do not**. The recommendation on file stands — session floor 784, table floor 520, gate
   session-beside-session to ≥1920 — but the operator still has to confirm it.
5. **How do tiles stack against each other** without escaping their z-band?
7. **Where does a `HANDLE` scan land** — a carton is arguably a page (it opens a surface)
   *and* an item (it gets processed). A spatial grammar that cannot place every scan type
   has a hole, and the operator will find it.

## 10 · The prototype — the iteration surface

**`docs/warehouse-os/prototype/warehouse-os.html`** — a self-contained, no-build HTML
prototype of the shell. Open it in a browser. `warehouse-os.artifact.html` is a generated
twin for web preview; **edit only the first file** and regenerate the twin.

**This is where exact design details get decided from now on.** Argue with pixels, not
prose: change the prototype, look at it, keep or revert. The doc records the ruling; the
prototype is where the ruling is discovered.

### What it already gets right

| | |
|---|---|
| **Scan is the origin** | First zone, leftmost, with the icon inside the field |
| **The 2×2 mode matrix is real** | `auto \| key` × `find \| flt` — both axes, not a 3-way switch. See §8.1.1 for what each axis is actually for |
| **The pipeline reads as progression** | `unbox → packing → ready to pack → QC`, done / current / pending states |
| **One HUD radius token** | `--r-hud` on the canvas frame — now `4px`, and now the *only* radius in the file |
| **Rails are persistent icon strips** | 40px, uppercase vertical labels, click the label to expand to 208px — instantly |
| **The empty slate exists** | Previously unspecified — now a real screen with two entry actions and hotkey hints |
| **The scan-armed indicator exists** | Answers "the operator must know where the next scan lands" — now permanent, and inside the scan field |
| **Offline banner exists** | The connection-health signal finally has a home |
| **Tab context menu** | Split · Rename · Change icon · Change color · Close |
| **Session rename in place** | In the beam itself; the popover field stays in sync |

### Where it contradicted this document — all nine decided, 2026-08-22

The prototype and the spec disagreed in nine places. Each is now settled **in the
prototype**, on the operator's "boxy, squared off, WMS standards, no layout animation"
direction. The spec won wherever the two read differently, because the spec was the mockup.

| # | Was | Ruling |
|---|---|---|
| 1 | Beam had six zones (scan · pipeline · pairing · context · timers · session) | **Three zones.** Corner cluster (scan · search · context) · one context line · `⋮`. Pairing and both timers are now right-rail tools. The pipeline folded into the context line, because scan type *is* the process stage |
| 2 | `--r-md` / `--r-lg` on every control | **Radius exists once.** The control radius tokens are deleted; `*` is square; `--r-hud: 4px` on the canvas frame is the only one left |
| 3 | Tool panel floated (`position: absolute` + shadow) | **It pushes.** A flex sibling between canvas and right rail. Opening it takes exactly 280px from the canvas and covers nothing. Measured, not asserted |
| 4 | Each rail had both `≡` and `+` | **One control.** The hamburger *is* the add control and carries search. Rail expand/collapse moved onto the vertical label, which is a control the sketch already drew |
| 5 | No pinned-pages section | **Pins above tabs**, above the `PAGES` label. Daily check + Shift log ship as the example pins |
| 6 | Tile minimum 280px | **784 session / 520 table** — the application's real floors. The canvas scrolls below them. D4 stays open but the prototype no longer answers it by accident |
| 7 | Focus and hover identical | **Four states, four treatments** — see §4 |
| 8 | Scan-armed toast auto-hid after 4s | **Permanent, and welded to the scan field.** It is a cell inside the corner cluster, immediately right of the input. It never hides and it never moves; it changes colour and wording for armed / parked / ended / error |
| 9 | Rail labels lowercase | **Uppercase**, on every vertical label, via `text-transform` so the markup stays readable |

### What the squared-off pass also changed

Not contradictions — consequences of going square.

- **Borders carry all the structure.** With no radius and no elevation there is nothing else
  to separate one surface from the next, so **every drop shadow was deleted** and the stroke
  tokens were pitched up (`--border-subtle` #e5e7eb → #d4d4d8, `--border-strong` #d1d5db →
  #a1a1aa, plus a new `--border-hud` for the frame itself). Panels, menus, the launcher and
  the popover are now defined by a 1–2px stroke alone.
- **Every indicator mark is a square.** Status dots, pipeline marks, tile marks, the
  scan-armed mark. At 5–8px a square is more legible than a circle and it matches the frame.
- **Segmented controls replace pills.** The 2×2 scan matrix, the composer's internal/public
  toggle and the pipeline are all hairline-bordered segment strips with an inverted active
  cell. The matrix's two axes are split by a heavier rule so it cannot be misread as one
  four-way switch.
- **Tables are grids.** Column rules, zebra banding, a sticky uppercase condensed header, and
  tabular numerals globally — the job is reading one row across without losing it.
- **Colour got darker and less saturated** in light mode (`#2563eb` → `#1d4ed8`, `#16a34a` →
  `#15803d`) so a 1px stroke of it survives a warehouse monitor at an angle.
- **Focus rings exist**, which they did not before: one square inset 2px accent outline on
  `:focus-visible`, everywhere.
- **Scrollbars are square and 10px**, wide enough to hit with a glove.
- **Density went up**: 26px control height, 26px tile headers, 4–5px table cell padding.
- **`.tile-actions` no longer fade in on hover.** A hover-gated control is unreachable on the
  mounted tablets, which is the same argument that killed hover-reveal rails in §6.

### What the prototype now proves that it did not

- The **launcher has a keyboard path** — ↑/↓ across grouped results, Enter to run, and the
  selected row carries a 3px accent edge and a `↵` marker. `Ctrl+K` opens it as well as
  `Ctrl+N`.
- **Session rename happens in the beam.** Click the title, an input replaces it in place;
  Enter or blur commits, Escape reverts, an unnamed session reads *Unnamed session* in
  italic muted. The settings-pane field still works and stays in sync.
- **Session state is visible** — armed · parked · ended · error, in both the beam badge and
  the scan-armed cell, in matching colour.
- **All four tile states are reachable**: drag a tile header to see `dragging` and
  `snap-target` side by side with `focused` and `:hover`.
- **The offline banner has a trigger** (`Ctrl+Shift+O`, or the launcher's Admin group) so it
  can actually be looked at.
- **Pairing is a real tool panel**, which is what "pairing is not header chrome" means in
  practice.
- **Recents are per staff and banded** — fixed band order, MRU inside a band,
  per-kind caps. Click any recent: the marker moves, the row order does not.
  That is the banding/recency trade, observable rather than asserted.
- **The work queues are in the launcher's Tables group**, each labelled with the
  rail it replaces, rendering triage-shaped DB rows with carrier, tracking,
  grade, stage and age — the columns the rail had to hide behind a peek card.

### The two surfaces, and which is which

| | `warehouse-os.html` | The published Artifact |
|---|---|---|
| Role | **Source of truth.** The only file to edit | A published *view* of it |
| Lives in | git — diffable, reviewable, readable by any future session | claude.ai, private until shared |
| Good for | Making the change | Looking at it on the **actual floor tablet**, and marking it up |

The Artifact is not a replacement. The repo copy is what a future Claude Code session reads
when it is pointed at this worktree; drop it and the plan of record has a hole where its most
concrete artifact used to be. But `file://` cannot be opened on a warehouse tablet, and §6's
entire argument — that hover-only affordances are unreachable on `(hover: none) and
(pointer: coarse)` — has never actually been *tested* on one. A URL fixes that.

Two things the published copy also buys: **comment threads anchored to the page**, which is
"argue with pixels, not prose" made literal; and, because Google Fonts is the one external
host the Artifact CSP admits, the real faces.

Current URL: <https://claude.ai/code/artifact/80ba3fdf-28de-45ab-831f-12814af86124>

### How to regenerate and republish

```bash
node docs/warehouse-os/prototype/build-artifact-twin.mjs
```

`warehouse-os.html` is the only file to edit; republish the twin at the URL above to update
in place. The script makes four changes and only four:

1. strips the `<!doctype>` / `<html>` / `<head>` / `<body>` wrapper — the Artifact host
   supplies its own, so the page must start at `<title>`
2. carries the Google Fonts `<link>` tags through verbatim
3. roots the dark palette at `:root[data-theme="dark"]` and mirrors it into
   `@media (prefers-color-scheme: dark)` guarded by `:root:not([data-theme="light"])` — the
   viewer's default "system" setting stamps no attribute at all, so without the mirror a
   dark-mode viewer would be served the light palette
4. seeds the theme toggle from `prefers-color-scheme` and points it at `documentElement` —
   the local file stamps `<body data-theme="light">` and the twin cannot

### Typography was silently broken until 2026-08-22

The prototype named Inter, IBM Plex Sans Condensed and IBM Plex Mono in its font stacks and
**never loaded any of them**. Naming a face is not loading it. Every condensed technical
label — rail labels, badges, table headers, pipeline steps, tile type chips — was rendering
in a *non-condensed* fallback, and the mono column had lost its tabular metrics. The design
leans on those two faces to carry the WMS read, so this was not cosmetic.

Fixed with a Google Fonts `<link>` in the source, which the twin inherits. If you swap a
face, swap it in `warehouse-os.html` and check `document.fonts.check(...)` actually returns
true before believing the screenshot.

### Iteration checklist — the exact details still to design

Done in the squared-off pass:

- ~~Hover vs focus vs drag vs snap-target: four distinct tile states~~ — §4
- ~~The rails at overflow~~ — the tab list scrolls; pins, label and recents hold their height
- ~~The expanded rail: does it push the canvas or overlay it?~~ — **pushes**, at 208px, instantly
- ~~Session states in the beam~~ — open · armed · parked · ended · error
- ~~Keyboard focus rings on every interactive element~~ — one square inset accent ring
- ~~The launcher's keyboard path~~ — ↑/↓, Enter, grouped navigation, `Ctrl+K`

Still to design:

- What a tile looks like **below its minimum width**, and what it drops first. Today it does
  not degrade — the canvas scrolls instead, which is honest but is not an answer
- The composer in all four modes (docked · flush · in-cell · expandable) — only docked exists
- A **summoned tool arriving unrequested** — how it announces itself without stealing a scan
- The **rail at 208px on a tablet**: 208 + 40 + 784 = 1,032, so an expanded rail plus one
  session tile fits, but expanded-plus-expanded does not. Does the second rail auto-collapse?
- Light **and** dark checked side by side for every state above. Both palettes are in and
  both were eyeballed; neither has been walked state by state


## 11 · Hazards

- **Never delete `/01/**`, `/414/**`, `/l/**`, `/p/**`, `/s/**`, `/q/**`.** They look like
  dead numeric stubs. They are **live GS1 Digital Link and short-URL resolvers printed onto
  stickers already on boxes.** Deleting one bricks physical labels.
- **Never start, restart or kill a dev server.** The operator owns `:3050`. Attach only.
- **Never `git stash`**, never `git add -A` (concurrent sessions share this tree), never
  commit unless asked.
- **Migrations land before readers**, one `YYYY-MM-DD<letter>` slot per file. Write them;
  the operator applies them.
- **Nothing in CI will catch a mistake.** `npm run verify` is lint + typecheck + unit; zero
  structural guards; `next.config.ts` sets `typescript: { ignoreBuildErrors: true }` so the
  production build does not typecheck either.
- **59 surviving tests use `readFileSync` + regex against source paths** and cluster exactly
  where this refactor lands. Fix them in the same change — do not delete them.
