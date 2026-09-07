# Design System Ideas — Warm Luxury Loop

Written 2026-09-06, last reconciled against the codebase 2026-09-06 (late). The
session surface (`/`) is the canvas: AI chat left, artifact view **or home
board** right, centered Grok/Codex-style landing. This file is the standing
backlog + **loop protocol** for making it feel softer, friendlier, premium —
"dedicated to serving your business," never a hardened WMS console.

**Direction in one sentence:** an assistant that feels like a trusted concierge —
editorial serif accents, soft motion, warm copy, everything personal.

**Standing laws (unchanged):** keyboard-first; artifacts carry data never
behavior; chat is prose; reduced-motion respected; ds_contract/stamp before UI
writes; every idea ships with its validation or it isn't done.

---

## Shipped

### The seed this loop grew from

- Time-aware greeting: serif italic, gradient shine phrase (blue → violet →
  gold), soft spring entrance via the house motion barrel, `useReducedMotion`
  respected. (`WelcomeGreeting` in `AgentSessionPanel.tsx`)
- Centered landing → split morph; session switcher with inline search; table
  interception (chat prose-only, tables live on the panel).

### 2026-09-06

- **#11 (half) — the phase line speaks.** The active-tool line said
  `get packing kpi`; it now says "Reading the packing KPIs…" from a 45-entry
  registry (`src/lib/assistant/tool-activity.ts`), rendered at caption size in
  `text-text-muted` with `aria-live="polite"` instead of a shouted eyebrow.
  `tool-activity.test.ts` fails if a new tool ships without copy — it has
  already caught drift twice. **Still open:** the artifact skeleton is
  shape-only for every kind (the shimmer half of #11).
- **★ The Home Board, phase 1.** The right pane now has ONE occupant
  (`session-panel-occupant.ts`: `'artifact' | 'board'`). ⌘B or the panel button
  opens a horizontal tile rail; each tile scrolls vertically; `e` expands a tile
  to own the pane; `Esc` collapses then closes. The chat pane takes its 360px
  minimum while the board is open and the operator's stored width returns on
  close — width is still the only thing that moves (M1 holds).
  Files: `session/board/{HomeBoardPanel,BoardTile,board-tiles}.tsx|ts`,
  `src/app/api/home-board/route.ts`.
- **The gap tile.** `get_roi_gaps` (`tools/roi-gap-tools.ts`) ranks six leak
  signals by units stuck, from deterministic SQL with verified column names.
  Live: 2,049 open order exceptions (193d), 1,637 received-never-listed units
  (141d), 91 dead-stock SKUs, 61 receiving exceptions, 27 units on hold. Each
  row seeds its own follow-up question into the composer, so a number becomes
  work in one keystroke. **No dollar figures, deliberately** — there is no
  trustworthy per-unit price in this schema, so a revenue ranking would be
  invented.
- **Board/agent parity is structural.** `/api/home-board` dispatches through
  `runAssistantTool` and contains no SQL by law, so a tile and a chat answer
  cannot drift. Pinned by the cohort.
- **In-chat OAuth handoff** (not previously in this backlog). A tool that needs
  an app the staffer has not connected returns `needs_connection` WITH a live
  Connect Link in the same result; the model raises `request_connection` and
  `session/ConnectAppPill.tsx` renders a pill in the transcript with one CTA.
  Popup → poll → flip to Connected → re-seed the original question. The chat
  surface never collects a credential and the model never builds an OAuth URL.
  Composio Platform brokers it (`lib/integrations/composio/*`, 4 registered
  tools, 2 new permissions).
- **Free local inference.** Ask now runs the full tool loop on a self-hosted
  OpenAI-wire endpoint (`qwen3:14b` on the local Ollama), above the mouth-only
  path. The Anthropic hard-coded preference is gone: `fallbackConfig` used to be
  gated on `!hasAnthropic`, so on any box with an Anthropic key a configured
  local model was never resolved. `ANTHROPIC_API_KEY` has been removed from
  `.env`.

### 2026-09-06 (late II) — the chat motion pass

- **★ #9 (the motion half) + #8 + #11's caret — the chat surface learned to
  move.** Three new roles (`chat.turn` / `chat.land` / `chat.stream`, roles
  11–13, canvas-only) over a new `springConcierge` token (stiffness 170 ·
  damping 22 · mass 1): transcript turns rise-and-settle instead of hard
  cutting (user bubble, prose, connect pill, CSV band), the landing
  deblur-rises (blur 6px → 0), and the greeting hello word-cascades via
  Motion+ `AnimateText` (one word / 45ms). Suggestion chips hover-lift 1px
  and dimple on press; the composer blooms a focus RING (a decorative layer,
  never a scaled container — a transform on the mouth would re-anchor its
  fixed popovers). Smooth autoscroll between turns, instant while streaming.
- **The paid Motion+ token is now load-bearing.** `design-system/motion/plus.ts`
  (sole Plus import site) exports `AnimateText`, `Typewriter`, `ScrambleText`
  beside `AnimateNumber`; the phase line swaps tool phrases through a
  character scramble (`ScrambleText`, 0.45s catalog duration) so tool changes
  read as one line of work continuing.
- **The streaming caret breathes.** `StreamingCaret` replaces raw
  `animate-pulse` carets on BOTH chats (session surface + AiChatConversation):
  an easeInOut opacity+scaleY loop on `motionRole.chat.stream`, steady
  half-opacity bar under reduced motion.
- **The Motion Lab.** ⌘⇧M or the corner Sparkles opens a replayable showcase
  of every preset above (8 cards, each with Replay; Esc closes; the header
  doubles as the reduced-motion parity check). Files:
  `session/motion-lab/{MotionLab,lab-demos}.tsx`. The "look at it" step of
  this protocol, promoted from screenshot ritual to a surface.
- Verified in-browser (1280 + 1600): word cascade splits, scramble cycles,
  typewriter replays, Esc/chord both work, reduced-motion collapses the
  split to plain text (0 `.split-word` spans under emulation). Roles 13/13,
  session cohort 22/22 green.

- **Cohort grew 17 → 22 assertions**, laws 11–13 (one pane occupant · board
  reads registered tools · in-chat connect handoff).

### 2026-09-06 (late III) — the prose display language

- **★ AI prose got a hierarchy vocabulary.** The ONE renderer
  (`MarkdownRenderer`) now speaks two faces: `prose` (assistant replies, real
  h2/h3 scale) and `bubble` (operator turns — headings demote to semibold
  `<p><strong>`, never a heading tag inside a chat bubble). Lists render a
  two-tier rhythm: parent items filled disc/decimal at caption size, nested
  items dash-marked (`list-['–']`, `marker:text-text-faint`) at micro size in
  muted body, `[&>p]:mb-0` keeps tight/loose wrapping from inflating. Depth
  is context-driven (set by the nested `ul`/`ol`) and capped — a third level
  renders as a flat child, never a new rhythm. Markers/colors are all
  classes; no raw hex. The five user-side call sites pass `variant="bubble"`
  (session panel, AiChat, dock, AskThread, plan agent).
- **Generation-side coercion, not prompt-hoping.** `prose-normalize.ts`
  (pure, no imports) clamps H1→H2, turns tab indents into 2-space steps,
  blanks lines around heading/list blocks, and demotes bullets past two
  levels — applied in `AssistantReply` BEFORE `extractGfmTables`, so artifact
  extraction and the renderer see the same coerced text. Idempotent by test.
  The model-side prompt contract was deliberately NOT added: reply prompts
  live in three places (`api/ai/chat/stream`, `api/assistant/chat`,
  `agent-loop.ts`) — no single SoT to widen.
- **Verified in-browser (real Chromium on :3050):** 20/20 checks — bubble
  face, prose reply face, live normalizer coercion (messy H1/tab/glued-list
  reply comes back clamped), computed styles (disc vs "–" markers, 10px
  micro under 12px caption, muted nested body, sunken mono chips), and
  Enter→full-hierarchy-bubble at **91.5ms** against a 500ms budget. Gates:
  unit 17/17, session cohort 23/23, motion roles 13/13, tsc clean, eslint
  clean, design critique clean (no token drift), e2e
  `chat-prose-hierarchy.spec.ts` green on desktop.

---

## Typography

1. **Editorial serif accent font.** Bring in a display serif via `next/font`
   (candidates: Fraunces — warm, slightly wonky; Newsreader — newsy-soft;
   Source Serif 4 — quiet luxury) for greetings, empty states, artifact titles.
   Body stays the house sans. Serif is the ACCENT voice, never body text.
   **⚠ There is a live defect here, and a law in the way.**
   `AgentSessionPanel.tsx:356,360` already uses `font-serif`, but
   `tailwind.config.mjs` defines only `sans / condensed / spine / mono` — so the
   greeting, the app's most visible line, currently renders in Tailwind's
   default stack (Georgia on most machines): an unregistered, unowned face.
   Meanwhile `src/lib/fonts.ts:26-27` is explicit — *"Do not add a second
   display / heading face on top of this"* — echoed by DESIGN.md's rejection of
   a second display face. **Two honest options, operator's call:** register one
   accent serif (a `next/font` call, a `--ds-font-serif` var, a
   `fontFamily.serif` key, and an amendment to that law scoping it to greetings
   and empty states), or delete `font-serif` from those two lines and get the
   warmth from italic + size in Inter. Leaving it as accidental Georgia is the
   only bad answer.
2. **Type scale for warmth.** Greeting 28–30px italic; artifact titles serif
   18px; chat body stays 14px sans. Contrast of voice, not size wars.
3. **Gradient shine discipline.** Exactly ONE gradient phrase per screen (the
   greeting today). Gradients everywhere = nowhere.

## Color & material

4. **Warm paper background.** Off-white warm tint for the start state
   (`#faf9f7` family) instead of pure white; panels keep house tokens.
5. **Seasonal accent rotation.** The gradient pair rotates (blue/violet/gold →
   teal/emerald/spring) from org settings — the app breathes with the year.
6. **Soft depth.** Shadows get warmer (brown-grey, not black) and smaller; the
   composer's raised chrome gets a 1px inner highlight top edge.
7. **Dark mode "evening" theme.** Same greeting, warm charcoal, gold accent —
   the house themes registry already tokenizes this.

## Motion (motion.dev / motion for React patterns)

8. **Spring physics everywhere interactive.** Chips lift `y:-1` on hover,
   composer focus ring blooms (scale 1.01), suggestion chips press with
   `whileTap` scale 0.98 — house barrel exposes `motion`; springs ~stiffness
   120–200, damping 18–25. Never tweened fades on interactive elements.
9. **Artifact entrance choreography.** Artifacts rise into the panel with
   opacity+y spring; the artifact stack slides; chart bars/donut sweep in on
   mount (stagger 30ms); timeline items cascade top-down. The DATA entrance is
   the delight moment — invest here most.
   **Verified state: this is still at ZERO.** `ArtifactViewPanel.tsx` and
   `artifacts/renderers.tsx` import nothing from `@/design-system/motion` — the
   answer, the whole point of the surface, arrives as a hard cut. Reuse
   `framerPresence.detailStackOverlay`, `StaggerReveal`
   (`STAGGER_REVEAL_STEP` 0.05) and `DenseRowReveal`; a new `motionRole` entry
   is required rather than inline variants (`roles.test.ts:214-237` flags raw
   preset use). Highest felt-value-per-hour item left in this file.
10. **Shared-element morph (layoutId).** The start greeting doesn't vanish on
    first send — the composer mouth `layoutId`s from center to left pane (the
    morph is already state-preserving; add the visual continuity).
11. **Shimmer, not spin.** ~~ActiveTool text~~ **done 2026-09-06** — the phase
    line now names the work in the operator's words. What remains is the
    artifact panel's face: `PendingArtifactSkeleton` paints six identical grey
    bars for every kind. Make it shape-match the ANNOUNCED kind (table →
    header + rows, chart → axis block, record → label/value pairs), and widen
    the client guard at `useAssistantChat.ts` (it forwards `ui_tool_start` only
    for `render_artifact`, though both loops announce every UI tool) so other
    tools can have a state too.
12. **Reduced-motion parity is mandatory** — every pattern here must collapse to
    opacity-only under `useReducedMotion`. Non-negotiable.

## Voice & copy

13. **Concierge micro-copy.** Empty states speak like a person: "Ask, and what
    you need shows up here." → family of lines ("Good question — pull up a
    chair."). Error copy apologizes once and offers the next step.
14. **Greeting rotation library.** Extend `GREETINGS` beyond time-of-day: by
    org name, by season, by first-scan-of-the-day ("First carton of the
    morning — it's already unpacking itself"). Copy lives in one module so
    the voice never forks.
15. **Number warmth.** "148 boxes — nice pace" vs "148". The artifacts may
    append one warm clause max; the data stays untouched.

## Personalization

16. **Per-staff cursor themes.** A `cursor` preference in `staff_preferences`
    (or org setting) applying a CSS cursor pack (pointer = house sparkle, a
    warm dot, a soft arrow, system). Electron persists it; web applies a
    `data-cursor` attribute on the root. Choose from a small curated set —
    never arbitrary uploads (pointer hijacking + taste).
17. **Greeting name.** "Good morning, Michael —" from the auth session
    display name; falls back gracefully.
18. **Density presets.** Cozy (current) / Roomy toggle per staff — artifact
    tables and chat spacing scale via one token.

## Delight (sparingly)

19. **Milestone moments.** `canvas-confetti` (already a dep) on rare, earned
    events: first scan of the day on the mobile companion, 100th artifact.
    Hard cap: one per session, never on error paths.
20. **Sound design (off by default).** A soft confirm tick on send, gentle
    chime on artifact arrival — per-staff opt-in, volume in settings.

---

## The loop protocol (how this backlog runs continuously)

1. **Pick three.** Each pass: choose the top three unfinished ideas (or new
   ones appended below with a date).
2. **One pass = design + build + validate together.** UI writes need the
   ds stamp; motion needs `useReducedMotion` parity; copy needs the voice test
   ("would a concierge say this?"); anything interactive needs a keyboard path.
3. **Critique gate.** Run `ds_critique` on touched files; keep the session
   cohort green (`node --import tsx --test src/lib/assistant/session-surface-cohort.test.ts`).
4. **Look at it.** Screenshot the start state and a data answer at 1280 and
   1600 widths; if it doesn't read softer than before, revert — softness is
   the feature.
5. **Close the loop.** Move shipped items to "Shipped" above with the date;
   add new ideas at the bottom with the date. Never delete ideas — strike
   through with a one-line reason (taste disputes get logged, not lost).

## Idea inbox (append below, dated)

- 2026-09-06 — Cursor personalization per staff (see #16) — requested by operator.
- 2026-09-06 — Warm paper background (see #4).
- 2026-09-06 — Serif accent font via next/font (see #1).
- 2026-09-06 — **Global header stripped to Find-only** (operator: "starting fresh") —
  add menu (+), goal chip, activity inbox, and phone button removed from
  `GlobalHeaderActions`; they return ONLY as faces of the home board below.
  Assistant door stays (floating circle + ⌘J). The removed components remain on
  disk until the home board decides which of them are board tiles.
- 2026-09-06 (late) — **`assistant-ink.ts`: semantic ink for streamed prose.**
  `MarkdownRenderer.tsx` paints every reply flat and hardcodes `text-blue-600`
  links; the user bubble hardcodes `bg-blue-50 / text-blue-900 / ring-blue-100`,
  errors `text-rose-700`, and `AiChatConversation.tsx:362` hand-rolls the
  streaming caret as `animate-pulse bg-blue-500`. Four raw hues outside the
  12-role ink layer, on the surface an operator stares at all day. One role map
  (entity · identifier · quantity · status · tool name · confidence) resolving
  to the existing tokens; delete the raw hues. Constrained by the One-Voice
  rule: `text-text-info` (#2563eb, Scan Blue) is ONLY a live/interactive fact.
- 2026-09-06 (late) — **The `done` payload is thrown away.** The SSE route emits
  `done {ok, turns, mode}` plus a `meta {provider}` frame and
  `useAssistantChat` reads neither, so provider, turn count and
  success-vs-failure never reach the UI. Cheapest honest trust signal available:
  the operator can see WHICH brain answered — which now matters, because it may
  be a free local model.
- 2026-09-06 (late) — **Local-model output quality is a design problem, not just
  a model problem.** Running on `qwen3:14b` the model left `artifact.title`
  empty (headerless table on the panel) and fired a spurious `navigate` before
  raising a connect pill. Either the contract needs a client-side fallback title
  (derive from the tool that produced it) or `render_artifact`'s schema should
  make `title` non-empty at the chokepoint. Do not fix this by widening the
  prompt and hoping.
- 2026-09-06 (late) — **Home Board phase 2: `watchers`.** Phase 1 tiles read
  live tools with no schema. Pinning, parent→child rollup (an EOD watcher that
  aggregates selected staff), and cadence need the table sketched in the pinned
  section below: `{ id, org, staffId, parentWatcherId?, savedViewId, cadence,
  lastRunAt, lastCount }`. Also needs `staff_preferences` DECLARED in
  `src/lib/drizzle/schema.ts` — it exists only as raw SQL
  (`2026-06-21_staff_preferences.sql`) today, so the pin-storage layer would
  start on schema-declaration drift.
- 2026-09-06 (late) — **Board tile row is a raw `<button>` by choice.**
  `ds_critique` flags it; it matches `ArtifactViewPanel`'s history list, and 20
  house `Button`s in a scrollport read as a toolbar. If the critique heuristic
  is ever tightened, this is the precedent to point at — or the moment to add a
  `LedgerRowButton` primitive so both surfaces stop hand-rolling it.

---

## ★ PINNED — The Home Board (operator, 2026-09-06)

> **STATUS 2026-09-06 (late): phase 1 is BUILT and verified in the browser.**
> What shipped: the one-occupant right pane (⌘B), the horizontal tile rail with
> per-tile vertical scroll, `e` expand / `Esc` collapse-then-close, five tiles
> reading live registered tools, the ROI gap tile, and row-click → composer
> seed. What did NOT ship: the `watchers` table, pinning, parent→child rollup,
> and cadence — deliberately, so the board earned its keep before asking for a
> migration. The sections below now describe **phase 2**; treat the layout and
> parity paragraphs as satisfied.

**The header stays empty because the landing becomes a BOARD.** After the
greeting answers one question, the start state grows a second plane: a pinned
home board of tiles — tasks, to-do lists, watchers — that each staff member
composes for themselves. The greeting is the concierge; the board is the desk.

### What it is

- **Pinned tiles as subscriptions/watchers, per staff.** Any list the business
  has (my day feed, daily checks, a ticket queue, a tracking-exception filter,
  an order lane) can be PINNED to a staff member's board as a live watcher:
  "watch this filter" = the tile re-runs the saved view on a cadence and shows
  the count/delta.
- **Parent → child watchers.** A staff member (or role) can be a CHILD of a
  parent watcher: e.g. an EOD report watcher that rolls up selected staff's
  end-of-day outputs into one parent tile ("EOD — from Tuan, Priya, Sam"),
  each child expandable to its own list. Watchers form a tree; the parent tile
  aggregates child counts and highlights children that changed.
- **The board layout: horizontal tiles, vertical lists.** Tiles scroll
  LEFT/RIGHT as a row (a rail of boards); each tile scrolls UP/DOWN through its
  own list. Expand a tile → it becomes the full board (the split view takes
  over, artifact-style). This is the warehouse-os window-manager grammar
  (sessions/tabs/tiles) ported into the assistant-first surface.
- **Everything a watcher serves, the agent also serves.** Any board tile is one
  question away ("what changed in my EOD watchers today?") — the board is the
  glanceable face; the agent is the interactive face. Same saved views, same
  data.

### Already in the codebase — port, don't rebuild

- **Window manager + tiles**: `docs/warehouse-os/02-target-architecture.md`
  (Session/Table/Tool/Tab object model, `staff_preferences.prefs.workspace`,
  left/right tile rail + per-tile scroll) — the worktree spec this ports.
- **Watchers**: `src/features/my-day/MyDayWatchRail.tsx` + `?watch=1` intake —
  the watch grammar exists for tickets/tracking; generalize to saved views.
- **Saved views**: `saved_views` table + Band 3 `WorkbenchViewsMenu` — a pinned
  watcher IS a saved view + cadence + owner.
- **Per-staff persistence**: `staff_preferences.prefs` JSON (pin storage,
  board layout, watcher tree).
- **Read tools**: `get_my_day`, `get_daily_checks`, `get_project_tasks`,
  `get_assignments` — each tile's data source is already an agent tool, so the
  agent and the board never diverge.

### Build sketch — remaining order

1. ~~`HomeBoard` component under `src/components/session/board/`: tile rail +
   per-tile scroll + expand.~~ **Done 2026-09-06.** Expansion is a hard swap,
   not a morph: `SessionSurface` forbids geometry animation on this split
   ("width is the ONLY thing that moves"), and an expanding tile is geometry.
2. `watchers` table: `{ id, org, staffId, parentWatcherId?, savedViewId,
   cadence, lastRunAt, lastCount }` — parent/child is self-referential. Declare
   `staff_preferences` in `src/lib/drizzle/schema.ts` in the same pass; it is
   raw-SQL-only today.
3. Pin flow: any artifact table gains "Pin to board" (keyboard `p`) → creates a
   watcher from the CURRENT filter/facet (reference, not payload — the same
   law as composer attachments).
4. EOD parent watcher: cadence `daily 18:00` rolls up children via one job;
   parent tile shows per-child deltas.
5. Agent parity: one read tool `get_home_board` returning the watcher tree,
   so "what's on my board?" and "what changed?" are answers, not screens.
   Phase 1 already proved the parity mechanism — `/api/home-board` dispatches
   through `runAssistantTool` and holds no SQL — so this is a tool, not a
   second data path.

### Validation (ships with the pattern or it isn't done)

Already pinned by the session cohort (laws 11–12, 2026-09-06):

- The right pane has ONE occupant; the board is a pane state, not a route; no
  geometry animation; ←/→ rail + two scroll axes with `stopPropagation`.
- The board plane inherits every artifact-plane ban (no `dangerouslySetInnerHTML`,
  no mutation imports, no `POST`).
- `/api/home-board` contains no SQL; a tool the caller cannot read degrades to
  one `denied` tile, never a 403 board; every gap query leads with
  `organization_id = $1`.

Still owed by phase 2:

- Cohort: pinning creates watcher rows only through an API route guarded by the
  saved-view permission; watcher tree depth ≤ 3.
- Unit: watcher tree rollup (parent counts = sum of children deltas); pin-from-
  artifact captures filter state; cadence idempotency (`client_event_id`).
- e2e keyboard-only: `p` pin from an artifact (the rail/expand keys are already
  browser-verified).
- Perf: a board with 12 tiles issues ≤ 3 queries (watchers are count
  projections, not full lists; full lists load on expand). Phase 1 is 5
  sequential tool calls — deliberately sequential, because six concurrent
  tenant-pool connections per board load is how a shared pool starves under a
  shift's worth of operators. Re-measure before parallelising.

---
