# 07 — Configurability: the operator's brief, fought

**Written 2026-08-23**, in response to the operator's dictated brief: build the app
"just like an operating system" — introspective, polymorphic, nav-by-search (⌘K),
everything keybind-configurable or name-searchable, grid snapping in the manner of
[Spacesuit](https://spacesuit.lightmode.io/) (researched for real in §2),
multiple layout modes (a grid, and a left/right scrolling navigation), Chrome-style sidebar tabs switchable to either side, both
rails hideable, drag-and-drop panels with per-staff adjustable spacing, a configure
button in the top right of the global header, and the whole thing completely
AI-configurable — ask the assistant for a grid, it brings up the applications and
asks follow-ups. One phrase is read charitably: *"what data mistyped was what I
need … polymorphic configured table"* is taken as **"what data-model types do I
need to make this polymorphic and configurable."** That question gets a full
answer in §8.

The brief was fought per [`HANDOFF-ux-fighting.md`](HANDOFF-ux-fighting.md):
premises first, code second, arithmetic where it settles anything.

---

## 0 · The scoreboard first

**Most of this brief is not a proposal. It is a description of code already in
this worktree.** Before any fight, the honest inventory:

| You asked for | Status | Where |
|---|---|---|
| OS shell — sessions, tabs, tools on a tiling canvas | **landed** (store + pure layer; shell wiring is the live seam) | [`../../src/lib/canvas/layout.ts`](../../src/lib/canvas/layout.ts) · [`store.ts`](../../src/lib/canvas/store.ts) |
| Nav by search, ⌘K, one master index of everything openable | **landed** | [`../../src/lib/nav/launch-index.ts`](../../src/lib/nav/launch-index.ts) — pages + sessions + tables + tools, one banded list, `searchNav` ranking |
| Add nav without touching any staffer's memory | **landed, by construction** | registries are data; prefs store only **ids into them** — see §7 |
| Everything keybind-configurable | **landed, bounded by the wedge** | [`../../src/lib/keybindings/`](../../src/lib/keybindings/) — `rebind.ts` calls scanner-typeability "the single most consequential question"; T20/T21 |
| Hide panels / maximum canvas | **landed** | rails collapse (R8); `maximizedGroupId` is already in the prefs schema — monocle exists |
| Drag panels, snap, per-staff persistence | **tree + solver landed; snap is the one new piece** (§2) | [`geometry.ts`](../../src/lib/canvas/geometry.ts) `paneCapPx` / `resolvePaneRow`; `prefs.workspace.canvas` |
| Per-staff spacing | **landed as the density scale** (§3) | U2 — `floorScale` 0.92 / 1.00 / 1.14, floors verified 721 / 784 / 894 |
| "Ask the AI to configure a grid for me" | **landed. Literally.** | [`../../src/lib/assistant/workspace-tools.ts`](../../src/lib/assistant/workspace-tools.ts) — `set_layout({layout:'grid'})` → `applyCanvasPreset('quad')`, one of **15 verbs** |
| Save / restore my configured workspace | **built, refusing honestly** — awaiting one prefs entry | `SavedWorkspaceLayout` + `WorkspaceLayoutStore` seam; verbs return `unsupported` until the store is wired (§9.1) |
| Multiple layout modes | **refused** — §1 | |
| A fixed snap grid ("align all the grids") | **refused as structural, accepted as magnetic** — §2 | |
| Per-pixel spacing sliders | **refused** — §3 | |
| Configure button in the beam's top right | **refused — it collides with three of your own laws** — §4 | |
| Rails switchable left/right | **deferred, with the trigger named** — §5 | |

The fights below are the refused rows. Everything conceded is conceded loudly.

---

## 1 · "Multiple modes" is the fork this repo already paid for once

**You asked** for modes: one grid, one left-and-right scrolling navigation.

**The premise error is a category error: those are not two modes, they are two
states of the one tree.** The canvas model is a binary split tree whose leaves
are *groups* holding N tabs ([`layout.ts`](../../src/lib/canvas/layout.ts),
law C1/C3, both `TYPE`-enforced):

- **Your "grid"** = a root with splits. `set_layout: columns | rows | grid`
  already names the shapes ([`presets.ts`](../../src/lib/canvas/presets.ts) —
  geometry only, per C6).
- **Your "left/right scrolling navigation"** = the degenerate tree: **one group,
  N tabs**. A group *is* a horizontal strip you walk left and right — that is
  Chrome's own model, and it is what C3 imported from VS Code's editor groups.
  Add `maximizedGroupId` (already in `prefs-schema.ts`) and you have monocle:
  one pane full-bleed, tab strip to move sideways.

A second *mode* would mean a second persistence shape, a second hotkey table, a
second drag semantic, and a second thing the AI verbs must address. This repo has
run that experiment: `unbox-compare-layout.ts` and `orders-compare-layout.ts`
were the same tiling model forked twice (~313 LOC, deleted 2026-08-21) because
each carried its own vocabulary. The delete note in
[`02-target-architecture.md`](02-target-architecture.md) ends *"Do not ship a
third."* A "scrolling mode" beside the tree would be the third.

**Verdict: zero modes.** The carousel you want is `single` + the group's tab
strip + `Mod+Alt` cycling ([`hotkeys.ts`](../../src/lib/canvas/hotkeys.ts)).
Same tree, same prefs document, same verbs. Nothing to build but the maximize
toggle's chrome. And your own reference product agrees from the other side:
Spacesuit's answer to many contexts is not a second mode — it is many *grids*
you switch between instantly, which here is §9.1's saved layouts.

---

## 2 · Spacesuit, researched for real — and what "in that way" decomposes into

**Correction, conceded loudly (X3's ethic applied to my own claim): Spacesuit
exists.** [spacesuit.lightmode.io](https://spacesuit.lightmode.io/) — the first
pass called it a dictation garble and guessed the FancyZones zone-manager class.
Wrong on both counts, and the miss has a cause worth recording: the product was
named **Nova** until April 2026 (renamed across
[v1.16.0–v1.18.0](https://spacesuit.lightmode.io/changelog.html)), so
WM-flavoured searches found nothing under a four-month-old name.

**What it actually is** (site + full changelog read, 2026-08-23): a local-first
desktop app — a *personal thinking canvas*. Multiple infinite pan/zoom **grids**
holding freeform **cards** ("place anything anywhere; no folders, no hierarchy")
— notes, files, live website snippets, and **AI Processors** with *dynamic
context injection*: cards wired into the AI's context by visible cables
(v1.4.0). Grids sit in a sidebar with folders and a minimap (v1.11.0) and link
to each other ("jump from grid to grid"); the **Powerbar** (v1.8.0) is Ctrl+K
search-and-command with a remappable shortcut; a grid can be **locked** —
hover menus and resize handles removed (v1.14.0); undo/redo with configurable
history (v1.7.0); themes; iCloud/Drive sync.

**Read that list again slowly — most of it is this plan, already:**

| Spacesuit | Warehouse OS | Status |
|---|---|---|
| Powerbar — Ctrl+K, search everything, run commands, remappable | launch index + ⌘K + keybinding overrides | **shipped** |
| Multiple grids per context, "switch between them instantly" | saved layouts — `SavedWorkspaceLayout` | type shipped; **the §9.1 prefs entry is the whole gap** |
| Grid links — jump grid to grid | `set_layout(layoutId)` — the jump is already a verb | shipped, refusing pending §9.1 |
| Lock a grid — no handles, no hover menus | the work canvas's *default posture*: arranging is the explicit act, not the resting state | §4, §9.5 |
| AI Processors + context injection cables | the workspace snapshot fed into assistant context | **§9.4 — the exact missing piece, now with a reference** |
| Themes · local-first + cloud sync | comfort tier (U1) · `staff_preferences` + identity-keyed mirror (D1/D4-law) | shipped/specced |
| "Grid cursor magnetism effect" — a Settings **toggle** (v1.4.0) | magnetic sash snap (below) | **the reference itself does alignment as magnetism, not structure** |

**The one thing that does not come across is the freeform card model — and that
is the real fight §2 was always about.** "Place anything anywhere" is the right
law for *thoughts* and the wrong law for *benches*. A card is a thought: it has
no minimum usable width, overlap is harmless, losing one under another costs a
memory jog, and the canvas is one person's private context. A tile is an
instrument: the session floor is 784px because below it a scan bench stops
being usable (D4), exactly one armed session owns the wedge (S1/S2), and a lead
walking six benches must read any screen with one map. Freeform placement plus
pan/zoom means the armed session can sit half off-viewport at 60% scale —
*"where does my scan land"* must be answerable with no action, and a pannable
work surface un-answers it. The feel is opposite by design too: Spacesuit
animates zoom, card spawns, and parallax (v1.4.1, v1.10.0) because the feel
**is** its product; M1 exists here because the *paint* is the product. So the
work canvas stays a floors-constrained tiling tree, and what Spacesuit
actually contributes lands **above** the canvas — the workspace layer and the
AI context model, per the table.

That leaves alignment. There are only two ways to get the "everything aligns"
property you are pointing at:

1. **Structural** — a matrix: panes live in shared columns, so alignment is
   guaranteed. This is the model **C1 already rejected**, and the rejection is
   now compiled: `children: readonly [CanvasNode, CanvasNode]`. A matrix has no
   unambiguous "which sash did I drag," and it couples columns across rows —
   dragging one edge moves it for every row. Note what that means: *"align all
   the grids together" is precisely the coupling C1 exists to prevent.* You are
   asking for the property by name that you ruled out by shape.
2. **Magnetic** — the tree stays, and the **sash drag snaps**: to simple
   fractions, and to the projected positions of parallel sashes elsewhere in the
   tree. Alignment *emerges* where it is legal and is never fought for where it
   is not. Release near a snap point and two subtrees share an edge; drag away
   and they don't. Nothing structural, nothing persisted beyond the ratios.

### The arithmetic that kills the fixed grid

A fixed overlay grid is a *fixed* set of lines. Run the shipped floors
(session 784 · table 520 · tool 360 — [`tile-floors.ts`](../../src/lib/canvas/tile-floors.ts),
still O1c-provisional) against the shipped viewports (canvas ≈ **1344** at 1440,
≈ **1504** at 1600 — the O1 numbers):

```
session | table, canvas 1344:
  legal sash range = [784, 1344−520] = [784, 824]      ← 40px of legal travel
  12-col lines in range: 7/12 = 784.0 exactly. ONE.
  the half (672) is illegal — 112px below the session floor

session | table, canvas 1504:
  legal range = [784, 984]
  12-col lines in range: 7/12 = 877. ONE again.
  the half (752) is illegal — 32px short

table | table, canvas 1344:
  legal range = [520, 824]
  12-col lines in range: 5/12 (560) · 1/2 (672) · 7/12 (784). THREE.
```

Two facts fall out. **First:** a session pane can sit at the half only when the
canvas is ≥ 1,568px — wider than both machines this app ships on. The most
iconic line on any fixed grid is illegal for the most important tile on every
shipped viewport. **Second:** the legal line set *changes with the contents of
the two sides* — one line for session|table, three for table|table. A fixed
overlay cannot know that; the floors can, and the function that answers it
already exists (`paneCapPx` — "the sash ceiling. One pane's question about the
others").

(A pleasing coincidence worth keeping: at 1440 the session floor **is** 7/12 of
the canvas — 1344/12 × 7 = 784. The grid you asked for agrees with the floor you
already shipped, at exactly one line.)

**Verdict:** snap, don't grid — which turns out to be Spacesuit's own posture:
its alignment ships as a cursor-magnetism *toggle*, not as structure. One pure
function beside the solver:

```
sashSnapCandidatesPx(framePx, floors, parallelSashPx[]) → px[]
  = { 1/2, 1/3, 2/3, 1/4, 3/4 of frame }  ∩  [minPx, maxPx from paneCapPx]
  ∪  parallel sibling sash positions within the legal range
```

magnetic within ±8px on drag, override by continuing to drag (a snap you cannot
escape is a constraint wearing a courtesy's name). Pure, DOM-free, testable
beside `geometry.ts`'s existing suite. And per **M1/M5**: the snap is applied to
the *committed* ratio on drop — nothing eases toward a snap point over time.

---

## 3 · Spacing is already yours — as a scale, not a slider

**You asked** for adjustable spacing so each staffer configures their own layout.

**Conceded — it shipped, as one bounded knob.** Law **U2**: density is ONE scale
(`compact / default / roomy`, `floorScale` 0.92 / 1.00 / 1.14), and the tile
floors consume the same number — verified in the prototype: the session floor
moves 721 → 784 → 894 with the scale. The settings tile (U5) already exposes it.

**What is refused is the slider.** Every floor in §2's arithmetic was *measured
at a density*. A free per-pixel gutter is an untested combinatorial space in
which each of those measurements is silently wrong for some staffer — and per
**U6**, an unbounded knob is somebody's future bug report ("the triage table
wraps on Dana's bench only"). Three steps × the floor math is a design; a px
field is a liability. This is also U1's tier line doing its job: *arrangement*
is unrestricted, *comfort* is bounded, *meaning* is locked.

One real gap, closed in §9: the prototype holds `density / radius / accent` in
memory only. `WorkspacePrefs` has no `comfort` entry yet, so the preference
does not follow the staffer. One schema key (D3 — no migration).

---

## 4 · The configure button collides with three of your own laws

**You asked** for a configure button in the top right of the global header.

**The top right of the global header is occupied — by your ruling.** **B20**
(operator ruling, 2026-08-22) put the **session chip** in the beam's right
corner, measured to the pixel (popover edge 1436 = chip edge 1436), as the right
bookend of **B19**'s carton–session pair. **B2** rules the beam *reports
identity, never verbs* — and "configure" is a verb. **B22** already removed a
control from that exact corner once (the tool-overflow `⋮`) on the argument that
the corner had gained a job and a second door to the same room is a fork.

A configure button in the beam would un-win all three fights at once.

**Where configuration already lives** — every one of these exists or is specced:

| Entry | What it opens | Law |
|---|---|---|
| **⌘K** | "edit layout", saved workspaces, every tool by name | W6, T19, R2 |
| **Settings tile** | density · radius · accent · keybindings, tiling *beside* the thing being adjusted so the change lands live in the next pane | U5 — your ruling: every window is a tile |
| **`Mod+Alt` chords** | split, presets, maximize, focus moves | [`hotkeys.ts`](../../src/lib/canvas/hotkeys.ts) — wedge-unreachable by construction |
| **The canvas itself** | sash drag, tab drag, the empty-pane launcher | C-section |

If a *visible* affordance is still wanted — and for day-one discoverability that
is a fair want — it belongs **on the canvas frame**, the thing being configured,
not in the beam. That is **T24**'s own principle: *the control belongs on the
thing it controls; a control managed three surfaces away is a preference, a
control on the thing is an affordance.* Concretely: the frame's corner (inside
`--r-hud`, outside every tile) carries the arrange control that opens
presets / save / even-out. The beam stays a readout.

**Verdict:** configure entry — yes, four of them. Beam furniture — no, and the
"no" is B2 + B20 + B22, which are yours.

---

## 5 · Rails: hide is shipped; mirroring waits for a left-handed bench

**Hide both panels** — conceded and largely shipped: rails collapse to 40px icon
strips (R8), each block owns its scrollport (R5), and full-canvas focus is the
maximize state, not a persisted "no rails" layout. (O5 — whether expanding one
rail auto-collapses the other — is still open and unaffected by this brief.)

**Switch tabs to the left or right** — this one is fought, on R3's ground. *"Left
is where you go, right is what you use"* is not a default; it is a **floor-wide
spatial vocabulary**, the same class of shared fact as U4's semantic colours: a
lead walking six benches reads every screen with one map. Per-staff mirroring
spends that legibility, and what it buys today is nothing anyone has asked for
out loud.

But the counter-case is real and gets named rather than buried: **handedness on
mounted touch tablets.** A left-handed operator on a portrait-mounted tablet
reaches across the work to hit a right-edge rail all shift. If that request
arrives from a bench, the answer is **one boolean that mirrors the pair** —
`comfort.mirrorRails` — never independent per-rail placement (both rails on one
side destroys R3 *and* the O5 width budget). Bounded per U6, off by default,
built when the trigger fires.

**Verdict: defer, trigger named.** Do not build it into the first cut of the
comfort schema; leave room for it.

---

## 6 · "Completely AI configurable" — conceded, shipped, and bounded

**You asked:** ask the AI to configure a grid; it brings up the applications,
asks how you want it configured, follows up.

**Conceded — and it is further along than the brief assumes.**
[`workspace-tools.ts`](../../src/lib/assistant/workspace-tools.ts) is the ONE
function every AI workspace action passes through: **15 verbs** (`open_tile`,
`close_tile`, `focus_tile`, `split_tile`, `set_layout`, `save_layout`,
`start_session`, `end_session`, `pin_tool`, `unpin_tool`, plus view verbs), each
validated against the registries so an invented tool name is a refusal, not an
empty pane; each success carrying its **inverse as data** for the undo stack;
every call producing one log record — the T13 posture, ready for the
`agent_mutations` ledger. "Configure a grid for me" is, today,
`set_layout({layout:'grid'})`.

The follow-up loop you describe is **T11/T15 already**: the assistant is the
launcher's natural-language face and the first screen. Asking "do you want the
orders table beside it?" is conversation, not architecture.

**Three AI-first commitments (rewritten 2026-09-26, approval-first model):**

1. **The AI authors the scan path; the compiled runtime executes it.** The AI
   writes grammars, routing and identification methods (approval-first,
   auto-approve eligible). `runWorkspaceTool` stays *synchronous by signature*
   so the compiled result answers a 50ms wedge burst — that is latency
   physics, not a limit on what the AI decides.
2. **The AI arranges and arms.** `open_tile`, `start_session` and `focus_tile`
   are all AI verbs. Arming a session is approval-first by default; the
   operator's auto-approve setting lets the AI arm directly, and every arm
   narrates the trade.
3. **"Completely" means completely.** The AI may arrange anything, adjust
   comfort, recolour semantic state and skip or reorder procedure steps —
   each as an approval-first proposal, each auto-approve eligible per
   automation. The assistant is a first-class operator of the config surface.

### What is actually missing for the brief's full loop

- **The saved-layout store.** `save_layout` / `set_layout(layoutId)` refuse with
  `unsupported` today — honestly, per their docblock — because
  `staff_preferences.prefs.workspace` has no entry to keep them in. §9.1.
- **The model's eyes.** Client verbs are fire-and-forget (SSE, acknowledged in
  the same tick): *the model never sees the outcome — the operator does.* Fine
  for verbs; fatal for "asks you follow-ups about your setup," which needs the
  model to know what is open. The fix is **not a client read verb** (its result
  could not travel up either). It is context: serialize the workspace snapshot —
  open tabs, canvas tree, armed session, pinned tools, viewport class, registry
  names — into the assistant's system context each turn (`buildSystemCore`).
  The persistence document **is** the introspection document; it already
  round-trips Zod. §9.4.
- **The session-lifecycle bridge** for `end_session` (currently refuses rather
  than half-ending — correct). Unblocked mid-writing: **O10 is now ruled**
  ([`06-work-order-migration-path.md`](06-work-order-migration-path.md) —
  `work_assignments` is the unit, `work_sessions` the titled wrapper), and the
  wrapper keeps `status` / `version` / `armed` / lease, so the bridge's target
  row survives the ruling intact.

---

## 7 · Why you never "change the layout each time" — the actual mechanism

The brief's core wish — add and change navigation without disturbing any
staffer's memory — is not a feature to build. **It is a property the data model
already has**, and naming it precisely is the answer to "how does this OS work
introspectively":

1. **Registries are the only truth about what exists.** Pages and sessions in
   `SURFACE_REGISTRY` + `buildCommandBarNavGroups`; tools in the tool registry;
   mountability arbitrated by `tile-registry` / `getTool` — the launch index is
   *"a new mount of existing code"* over all of them, and ⌘K, the rail "+", and
   the AI's verbs all read the same index. Add a tool: one registry entry. It is
   instantly searchable, pinnable, AI-openable — and **no staffer's prefs
   changed**, because nav was never written into them.
2. **Staff memory stores only ids into those registries.**
   [`prefs-schema.ts`](../../src/lib/workspace/prefs-schema.ts): tabs are
   `{kind, ref, params}`, pins are id arrays, keybindings are `bindingId →
   chord | null` (null = disabled, absent = default), the canvas tree names tab
   ids. Nothing positional about chrome, nothing copied out of a registry.
3. **Unknown ids degrade, never crash.** Pinned ids with no open tab are
   *dropped on hydrate* (the schema says so in its own comment);
   `parseCanvasLayout` is depth-bounded and total; a group whose tabs are gone
   renders the launcher (C4). Retire a tool and every workspace that referenced
   it heals to an empty pane — the operator is told, not broken.
4. **Absent = empty slate** (D3/D7). No seeded defaults means there is no
   default to migrate when the shell evolves.

That is the polymorphism you asked after, located: **in the documents, not the
chrome.** The shell can be reskinned wholesale and every staffer's workspace
survives, because a workspace was never a description of the shell.

---

## 8 · The data model — "what types do I need"

The answer is: **you need no new tables.** The core is four (ruled in
[`05-data-model.md`](05-data-model.md) §4); everything in this brief is either a
type that exists or a key in one JSONB document. The census:

| Concern | Type | Where | Status |
|---|---|---|---|
| The arrangement | `CanvasNode = CanvasGroup \| CanvasSplit` — binary, `ratio ∈ [0.1, 0.9]`, leaves are tab groups | `canvas/layout.ts` | **shipped**, `TYPE` |
| What is open | `WORKSPACE_TAB {id, kind: 'session'\|'table'\|'tool', ref, params}` (≤ `MAX_OPEN_TABS`) | `workspace/prefs-schema.ts` | **shipped** |
| Whose it is | `staff_preferences.prefs.workspace` — per (org, staff), RLS from birth, shallow merge → **send whole sub-maps** (D2) | `staff-preferences` | **shipped** |
| Presets | `CanvasPresetId = focus \| compare \| stack \| triptych \| quad` — geometry only, contents never (C6/W4) | `canvas/presets.ts` | **shipped** |
| Saved workspaces | `SavedWorkspaceLayout {id, name, sessionType \| null, root, maximizedGroupId, savedAt}` — id slugged so re-saving "Unbox morning" replaces it | `assistant/workspace-tools.ts` | **type shipped; prefs entry missing** |
| Keybind overrides | `Record<bindingId, chord \| null>` — null ≠ absent | `workspace/prefs-schema.ts` | **shipped** |
| Comfort | `{density, radiusPx 0–16, accent}` — U1's bounded middle tier | — | **missing entry** |
| Geometry authority | floors + `paneCapPx` / `resolvePaneRow` (yield ladder, water-fill, largest-remainder) | `canvas/geometry.ts`, `tile-floors.ts` | **shipped**, floors O1c-provisional |
| AI actions | `UiToolName` (15) · `WorkspaceToolOutcome` with `inverse` · one `WorkspaceToolLogRecord` per verb | `assistant/workspace-tools.ts` | **shipped** |
| What a session touched | `ops_events (entity_type, entity_id, session_id)` — polymorphism on the **event log**, never the parent (D11) | migrations | **shipped**, `DB` |

The two missing keys, both D3-cheap (schema entry, no migration, absent = empty):

```ts
// prefs.workspace — proposed additions
savedLayouts: z.array(SavedLayoutSchema).max(24).optional(),
comfort: z.object({
  density:  z.enum(['compact', 'default', 'roomy']).optional(),
  radiusPx: z.number().int().min(0).max(16).optional(),   // U3's clamp
  accent:   z.enum(ACCENTS).optional(),
  // room reserved, NOT built: mirrorRails (§5, waits for its trigger)
}).strict().optional(),
```

Two honesty notes. **First**, the shipped `SavedWorkspaceLayout` restores
*arrangement*: absent tabs heal to launcher panes (C4) and nothing arms (W3) —
it sits between W4's "preset" and "workspace," and that is the right first cut;
re-opening contents can layer on later without a schema change. **Second**, the
canvas-store docblock calls arrangement "a per-device viewport question" while
the prefs schema persists it per staffer. The schema is the ruling that stuck —
ratios scale across viewports and floors clamp on hydrate — but the two
docblocks should stop disagreeing; that is the owning lane's one-line fix.

---

## 9 · Exact scope — six items, zero new architecture

In order; each lands alone. Phase homes in brackets
([`04-roadmap.md`](04-roadmap.md)).

1. **`savedLayouts` prefs entry + wire `layoutStore` into
   `browserWorkspaceToolDeps`** [P3/P9]. Turns two honest `unsupported`
   refusals into save/restore for both fingers and the AI. Smallest change with
   the largest brief coverage — and it IS Spacesuit's headline feature
   ("create multiple grids for different contexts — switch between them
   instantly"), grid links included, since the jump is already the
   `set_layout(layoutId)` verb.
2. **`comfort` prefs entry** [P3] — density/radius/accent follow the staffer;
   the settings tile already edits them (U2/U3 verified).
3. **Sash snap** [P6] — `sashSnapCandidatesPx` beside `paneCapPx`: fractions ∩
   floor-legal range ∪ parallel sibling sashes; ±8px magnetism, escapable;
   committed on drop (M1/M5 clean). This is the whole "Spacesuit" ask, made
   legal by arithmetic.
4. **Workspace snapshot into assistant context** [P9] — the introspection feed;
   the follow-up loop stops being blind. Same serialized document the prefs
   already validate. Spacesuit X calls this *context injection* and draws the
   cables on screen; once the feed exists, a visible what-fed-the-assistant
   readout is worth stealing (T7's always-context-aware, made legible).
5. **Canvas-frame arrange control** [P6] — presets · save · even-out ·
   maximize, on the frame corner, inside `--r-hud`. The discoverable entry the
   beam button wanted to be, on the surface it governs (T24).
6. **`sessionLifecycle` bridge for `end_session`** [P2/P8] — lands against the
   work-order wrapper per the O10 ruling
   ([`06-work-order-migration-path.md`](06-work-order-migration-path.md)).

**Explicitly not built:** a second layout mode (§1) · a matrix canvas or fixed
overlay grid (§2) · per-pixel spacing (§3) · beam configure furniture (§4) ·
rail mirroring now (§5) · per-tile AI permissions (ruled, D3) · any re-seeding
of workspace defaults (D7).

---

## 10 · Law candidates — unnumbered until ruled

Per **X4** numbers are append-only and another session is editing this corpus
concurrently, so these carry no numbers until the operator rules; they then take
the next free C-slots.

| Candidate | Statement | Why | Status if adopted |
|---|---|---|---|
| **C — alignment** | **Alignment is magnetic, never structural.** Sashes snap to fractions and to parallel sashes; no matrix, no shared column objects. | "Align all the grids" as structure is the cross-subtree coupling C1 exists to prevent; as magnetism it is free and escapable. | `PROSE` → `PROTO` with §9.3 |
| **C — snap authority** | **Snap candidates are computed from the floors and the neighbours, never drawn from a fixed grid.** | §2's arithmetic: the legal line set depends on both panes' contents; a fixed overlay offers illegal positions — including the half, illegal for every session split on every shipped viewport. | `PROSE` → code with §9.3 |
| **C — modes** | **A layout "mode" is a state of the one tree** — preset, group tab-walk, maximize — **never a second model.** | The compare-fork was this repo's tuition on that lesson; §1. | `PROSE` |
| **D — previews** | **A preview renders the document, never mounts the surface.** A switcher or thumbnail draws from the serialized tree — schematic panes, tab titles, the session slot — and never mounts suspended tabs to paint live pixels. | Live previews re-create the exact memory residency D6's tab suspension exists to prevent (N workspaces × ~1MB feature graphs); the document is always affordable to draw. macOS can afford live thumbnails because the compositor already holds the bitmaps — a DOM app has to *mount* to paint, and that difference is the whole law. | `PROSE` → `PROTO` with §12 |

---

## 11 · Open flags this brief inherits

- **O1c / D4** — every number in §2 stands on floors whose own docblock says
  *"recommendation awaiting operator confirmation."* Rule D4 and §2's arithmetic
  becomes law-grade; until then it is provisional the same way the floors are.
- **O10 — ruled while this doc was being written**
  ([`06-work-order-migration-path.md`](06-work-order-migration-path.md), laws
  S10/S11/K12): `work_assignments` is the unit; the session is a titled
  wrapper; *the bench vocabulary stops being a schema fact*. §9.6 is unblocked.
  One knock-on for the owning lane: `LAYOUT_SESSION_TYPES` in
  `workspace-tools.ts` files saved layouts under the scan-type vocabulary —
  under S10 that filing key should follow `surface_key` (code) or the title
  (data), not a session *type* the schema no longer asserts.
- **O5** — one-rail-expanded auto-collapse: unchanged by this brief, still open.
- The canvas-store vs prefs-schema docblock disagreement (§8) — one line, owning
  lane's to fix.

---

## 12 · The workspace switcher — validated, with three corrections (2026-08-23)

**The ask.** A top-right button; pressing it zooms out Mission-Control-style;
a search bar at the top filters a list of all saved configurations; Tab cycles
the list; each step displays and expands the focused workspace below the list;
pick one to switch.

**Verdict: yes — this is W6 finished, not a new surface.** *"Workspaces live in
the launcher"* is already law (W6); search-filter-cycle is the launch index's
existing interaction; the data is §9.1's `savedLayouts`; the commit is the
shipped `set_layout(layoutId)` verb; and the two levels the ask names — *pick
which window* and *pick which desktop* — are two bands of the one index
(**Open now** → `focus_tile` · **Saved workspaces** → `set_layout` · presets),
which is the R2/T19 one-index philosophy doing what it was built for. About 80%
of this idea exists. Three parts change in translation, each for a reason
already on the books:

**1 · The zoom dies; the cut lives.** Mission Control's zoom is a geometry
tween — `transform` is on M1's banned list, and M5 bans scheduling it from JS.
But the deeper problem is what Apple's metaphor hides: macOS pays nothing for
live thumbnails because the compositor already holds every window's bitmap. A
DOM app has to **mount a surface to paint it** — and D6 ruled tabs *suspend*
(unmount, serialize, restore) precisely because resident feature graphs are
~1MB each. A "live" preview of N workspaces would re-create the exact memory
condition suspension exists to prevent. So the preview renders the **document,
not the surface**: a schematic drawn from the saved `CanvasNode` JSON — pane
rectangles from the ratios, tab titles where resolvable, kind marks, the W2
session slot marked *"armed session lands here."* Instant cut on cycle. It is
F-law native (1px strokes, square marks, no shadows — a blueprint, not a
screenshot), and for choosing a bench layout it is *more* legible than pixels:
shape and names are the decision; the live contents of a suspended table decide
nothing.

**2 · The preview sits beside the list, never expands inside it.** Expanding
the focused row pushes every row below it on each Tab press — the list squirms
under the very keys walking it, and the row you were about to reach moves as
you reach for it. That is the position-instability H3/R4 exist to prevent
(*"position stability is the feature"*; *"a centred block's y-position is a
function of how many items sit above and below it"*). Fixed two-region overlay
instead: search + list in one region, a **constant-size preview region**
beside or below it; cycling repaints the preview in place and no row ever
moves. (An instant in-list expansion would not violate M1's letter — nothing
*animates* — but it violates the reason M1 exists.)

**3 · Cycling is read-only; Enter commits.** The preview never applies, parks,
or arms — W3 verified that applying a workspace is navigation, and a
preview-on-cycle that live-applies would issue a canvas mutation (and
potentially a prefs PUT) per keypress while thrashing the real canvas behind
the overlay. The preview is a render of JSON; the commit is **one**
`hydrateCanvasLayout`; Escape means nothing happened; the inverse is the prior
root — undo for free, per the verbs' inverse-as-data pattern (C7 makes the
before-image a value you already hold).

**The button.** §4 already ruled the corner: the beam's top-right is B20's
session chip and B2 bans verbs in the beam. The switcher's button lands at the
**canvas frame's top-right corner** — the operator gets the top-right button,
one strip below the beam, on the thing it controls (T24) — plus ⌘K and a
`Mod+Alt` chord for the desk, and the frame button is what makes the switcher
reachable on kiosk/tablet, where there is no ⌘K to press.

**The search field.** Inherits I2's contract unchanged — a wedge burst lands in
the armed session even while the operator is mid-filter — and adds no new
hazard beyond the ⌘K field it extends. (I2 remains unbuilt; the T16 ordering is
untouched by this section.)

**Scope.** Rides §9.1 and Phase 4's launcher host; no new store, no new verbs:

1. `renderLayoutSchematic(root, resolveTitle) → SVG` — pure, tested beside
   `layout.ts`, per the §10 preview candidate.
2. A `switcher` face on the launcher overlay: bands **Open now** ·
   **Saved workspaces** · **Presets**; type-to-filter via `searchNav`; Tab and
   arrows cycle; Enter commits; Escape leaves.
3. The frame-corner button + `Mod+Alt` chord entry.

---

## Sources

- [Spacesuit](https://spacesuit.lightmode.io/) — the operator's reference product, site read 2026-08-23
- [Spacesuit changelog](https://spacesuit.lightmode.io/changelog.html) — every mechanic §2 cites, by version: Powerbar v1.8.0 · context injection + magnetism toggle v1.4.0 · grid folders + minimap v1.11.0 · lock-grid v1.14.0 · undo/redo v1.7.0 · zoom/parallax animation v1.4.1/v1.10.0 · Nova→Spacesuit rename v1.16.0–v1.18.0
- [Spacesuit releases — GitHub](https://github.com/lightmode-laboratories/spacesuit/releases/latest)
- Internal: [`LAWS.md`](LAWS.md) · [`02-target-architecture.md`](02-target-architecture.md) · [`03-decisions.md`](03-decisions.md) · [`05-data-model.md`](05-data-model.md) · [`06-work-order-migration-path.md`](06-work-order-migration-path.md) · the modules cited inline throughout.
