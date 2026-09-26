# HANDOFF — the UX/UI overhaul: data takes the centre

**Paste everything below the rule into a fresh session pointed at this worktree
(`.claude/worktrees/warehouse-os-refactor-8f2dc3`, branch
`claude/warehouse-os-refactor-8f2dc3`).**

Written 2026-08-24, hours after [`00-endgame.md`](00-endgame.md) became the plan
of record. This brief is downstream of it and cites its decisions by number
(D1–D16). Where this brief contradicts an older HANDOFF, the endgame already
struck that line — check [`00-endgame-contradictions.md`](00-endgame-contradictions.md)
before re-litigating anything.

**Operator ruling 2026-09-26 — read this first.** CycleForge is AI-first. The
2026-08-23 AI-centre inversion ("the AI, pinned in the middle, always"; "the
conversation is the workspace" — [`HANDOFF-ai-centre.md`](HANDOFF-ai-centre.md))
is **reinstated as the front-door ruling**: the assistant composer stays fixed
in the centre. Where this brief says data takes the centre or the composer
docks to a corner, the reinstated inversion wins; tiles are what the
conversation summons beside it. AI writes follow **approval-first +
per-automation auto-approve**: every AI write lands as a proposal a named human
approves, unless the org has flipped that mutation kind to auto-approve, in
which case it applies immediately, logged `actor_kind = 'agent'` and revertable.

---

You are overhauling the UX/UI of the **entire Cycle Forge Warehouse OS shell,
live on `:3051`** — not the prototype, not an artifact, the running
application. The operator ruled it in words: *"instead of building it within
the artifact, you are building it inside of the Linux dev server 3051."*
Arguments settle in the running app, measured; the prototype directory is
retired as a build surface and survives only as an archaeology reference.

## What you are building — the D2 screen

The 2026-08-23 inversion ("the feed is the ground, always the AI, never yields
the centre") was overturned by the operator on 2026-08-24 (D2) — and that
overturn was itself **reversed by operator ruling 2026-09-26: the inversion is
reinstated** and the composer stays fixed in the centre. The D2 ruling below is
kept as history of what this brief was written against, in their words:

> *"B, the data takes the center. But you must be able to edit it very easily —
> just like Hyprland, you press the super key, hold and click, and move the
> windows around. And you can shrink the composer down, but it never is
> removed. It has just shrunken down… but that input is never removed."*

So the screen becomes:

1. **A tiling canvas of DATA is the ground.** Tiles function as pages — "swiping
   left and right in a book" — never full encapsulating pages, no navigation, no
   URLs as the model. `Canvas.tsx` was deleted on 2026-08-23; the canvas returns,
   but as a **new build against this ruling**, not a resurrection of the old file.
2. **The composer is permanent and unremovable** — the one field (One Field
   survives), a genuine model loop (D3, ≤3s/utterance). *(Operator ruling
   2026-09-26: it stays fixed in the centre — the corner dock below is
   superseded.)* It holds the centre by default and could **shrink to a corner
   dock** (bottom-left or bottom-right, operator-movable) when the operator
   wants data blown up.
3. **Show mode**: the presentation state — composer docked, one tile maximised,
   for showing staff. Slipped from v1 polish (D12) but the dock geometry you
   build must not preclude it.
4. **Hyprland grammar**: super(+click)+drag moves tiles; window-manipulation
   is direct, physical, instant. The prototype already did focus-follows-mouse
   citing `follow_mouse = 1` — that instinct is now law-adjacent.
5. **The chronology (blocks of time) survives as a summonable tile**, not the
   ground. `Well.tsx` / `AssistantFeed.tsx` hold working code — blocks, parking,
   S12's ⌘N, the collapse-all — that gets **re-homed into a tile**, not deleted.
   Where a parked block's Resume lives now is yours to rule and measure.

## The acceptance scenarios — all three must hold

**A · The order swap (the operator's own words, 2026-08-24):** mid-session,
an order number arrives (typed, scanned, or pasted — sources are stamped).
The order renders **front and centre as a tile**, immediately. Talk moves to a
customer claim — the claim takes the centre; the operator comments on it
**through the composer without switching tabs or anything**. The composer's
write-target follows the focused tile (Phase 7's `target`, alive in the
new model).

**B · The phone call (S12, re-staged on the canvas):** mid-repair, a customer
calls. ⌘N cuts a new session block — the repair block parks losslessly, one
keystroke, no dialog (S1/S2/S3 unweakened). The lookup lands as a tile with the
warranty verdict legible at phone-to-ear distance. The call ends in a queued
handoff work order with an urgency marker (D16), and ⌘N-or-resume returns the
repair block with elapsed intact.

**C · The capstone (D1, the reason v1 exists):** scan any QR — unit or bin —
and the spine answer renders instantly: where it is, where it came from, what's
been pulled from it. `GET /api/inventory/spine?scan=…` already returns the
whole answer shape; the overhaul gives it its tile. This surface outranks
every other in polish priority, because it is the day-90 demo (D13).

If a step in any scenario needs a page navigation, a modal, or a second text
input, the design is wrong at that step.

## Ground truth of the tree (measured 2026-08-24)

- `src/shell/` — 7,278 lines total; `shell.css` 2,417; `tokens.css` 236 lines
  carrying **138 custom properties**. The token system is real; extend it,
  never bypass it.
- The shell today: `ShellRoot` · beam (`GlobalHeader`, B-laws) · `Well.tsx` +
  `AssistantFeed.tsx` (the to-be-demoted centre; blocks-of-time verbs live in
  `useShell.ts` — `cutSession`, `parkArmedBlock`, `resumeBlock`) · rails
  (`RailSessions`, `RailTools`, `useRailPeek`) · `ToolPanel` · the
  omni-command composer (Lexical, `#` orders / `/` actions / bare = scan;
  `ec0b5d13`) · `FilesPanel` (N6) · context ring in `AssistantFeed.tsx`.
- **15 pages**, all chromeless (GS1 resolvers, auth) — T31, never touched.
- The spine is live: `POST /api/inventory/placements`, `POST
  /api/inventory/part-pulls`, `GET /api/inventory/spine?scan=…` — gated,
  D10-enforced three deep. A phone put-away surface (`/putaway` +
  `src/lib/scan/putaway-camera.ts`) is being built in a parallel lane — check
  whether it has landed before touching those paths, and style it with the
  same tokens if it has.
- The native app runs: Electron window on this machine attached to `:3051`
  (CDP debug on `:9223` when launched with `--remote-debugging-port`).
  **Desktop Electron at ~1918×2095 is the primary form factor (D4)** — an
  installed app for every role. Phone browser = put-away + photos + composer
  chat only. Kiosk iPad browser = front desk. Tune breakpoints to THOSE, not
  to generic web sizes. The Lighthouse program is dead as a gate (D4) — do not
  spend a minute on web-vitals theatre.

## The laws that bind you (LAWS.md, 172 numbered rows — read it first)

Unstruck and non-negotiable:

- **M1/M5 — nothing animates geometry.** No transition or keyframe on
  width/height/top/left/margin/padding/transform/inset. Colour and opacity
  only, ≤80ms. A canvas overhaul will tempt you hourly; the answer stays no.
  Tile moves are direct manipulation (pointer-driven), never tweened.
- **F1/F3 — one radius token, no drop shadows.** Depth is colour planes and
  1px strokes. The old "sunken well" treatment proved it works; reuse the
  grammar, not the layout.
- **One Field** — the composer is the only free-text input on the default
  screen. Tile-local filter fields are legal only inside a mounted queue
  surface (I6's carve-out).
- **I6** — nothing with a text input floats near the beam; instruments open as
  panels/tiles, never popovers.
- **I2/I3, T20/T21 — the wedge is sacred.** The scan path runs ahead of every
  keybinding; no bare-key or scanner-typeable chords; super-based chords are
  safe (only ⌘/Ctrl/⌥/super are out of a scanner's reach). Every new binding
  passes `wedgeReachability()`.
- **S1–S3, S12** — one armed session (per-staff amendment pending, D9), ⌘N
  cuts and parks losslessly, parking is a work event. The canvas must never
  make "where does my scan land" ambiguous — the armed tile is visually
  unmistakable at a glance from two metres.
- **B-laws** — the beam stays two bookends with deliberate emptiness between.
  The overhaul does not grow the beam.
- **T31** — resolver pages stay untouched public web.
- **X1** — pin any new invariant in a mounted DOM test, an ESLint rule, or a
  type. Never a regex over source text.

Struck and must NOT be re-implemented (see the appendix for the full list):
tables-only-in-the-right-panel (Fight 1's ruling — tables may now BE tiles) ·
"orchestration is the launcher, not a second input" (the composer is the
orchestration surface; ⌘K stays as the exact-match index) · offline-first
anything. *(The feed as permanent centre was on this list until operator ruling
2026-09-26 reinstated it — it is the front door again.)*

## Order of work — each phase shippable, verified live, alone

1. **The canvas returns.** A tile host on the D2 model: tiles opened by the
   composer/launcher/scan, super+drag to move, direct resize on hairline
   borders (extend `useHorizontalEdgeResize`'s pure math — it has unit tests;
   its canvas twin was deleted, rebuild against the new model). The feed
   becomes the **Chronology tile** — summonable, closable, never the ground.
   *Verify:* M1 audit 0/0 through open-move-close; the armed tile identifiable
   in a squint test; scenario B end-to-end.
2. **Composer states.** Centre (default) · corner dock (operator-moved,
   position persisted per staff in `staff_preferences.prefs.workspace`) ·
   the seam for show mode. Focus, ⌘K, and the wedge keep working in every
   state. *Verify:* wedge burst mid-drag lands in the armed session; the
   composer never unmounts (React tree identity stable across dock moves).
3. **The spine tile (scenario C).** Scan → `GET /api/inventory/spine` → the
   answer as the centre tile: unit card (serial · SKU · status · location ·
   provenance · pulls) and bin card (contents · recent pulls). The
   `legacyLocationClaim` renders visibly *unverified* — never confusable with
   the scan-created truth. This tile is the capstone demo; it gets the most
   design attention of anything in this brief.
4. **Data tiles for the roster's surfaces (D7):** orders/work-order queue
   (with the D14 unified AI-proposal rows), session handoff cards with urgency
   markers, the claims context. Wide tables get real tiles now — the 720/976px
   column-floor measurements still matter for MINIMUM tile widths
   (`--tile-min-table: 520px` was already ruled).
5. **Style pass over every surviving surface** — signin, invite, offline,
   `/putaway` when it lands, the resolvers' operator-facing states — one token
   vocabulary, one radius, strokes not shadows, dark and light.
6. **The audit.** M1 sweep, token-bypass sweep (no hardcoded colours where a
   token exists), hover-dependency sweep (`hover: none` hardware exists),
   touch-target sweep on phone/kiosk surfaces.

## How to work — the method is law here

- **Measure, then argue.** Every ruling lands with a number. The house
  snippets (geometry probe, M1 audit) are in
  [`HANDOFF-ux-fighting.md`](HANDOFF-ux-fighting.md) — run them against
  `:3051` via the browser pane, and against the native window via CDP on
  `:9223`. The browser pane stops compositing when hidden — verify
  numerically, not by screenshot.
- **Fight the premise first** — including this brief's. If a phase contradicts
  a measurement, bring the number and the law row; the operator overturns
  their own rulings when shown evidence, and expects you to force that.
- **Record rulings as numbered LAWS.md rows** with honest Status
  (`DB`/`TYPE`/`TOOLING`/`PROTO`→now`LIVE`/`PROSE`); strike-throughs explicit
  (X3), numbers append-only (X4). The [contradictions appendix](00-endgame-contradictions.md)
  lists 146 rows already owed amendment — amend the ones your phase touches,
  in the same change.
- **`npm run verify` before done.** Unit suites auto-discover; the canvas
  rebuild should finally green the known-red `src/lib/canvas/*.test.ts` files
  or replace them with mounted-DOM tests (X1).

## Hazards — same as ever, no exceptions

- **`:3050` and `:3051` are the operator's.** Attach, never restart. A broken
  server is a report. The Electron window is launched with
  `ELECTRON_START_URL=http://127.0.0.1:3051 npx electron . --remote-debugging-port=9223`
  — relaunching THAT is fine; the Next servers are not yours.
- Never create a branch; verify `git branch --show-current` says
  `claude/warehouse-os-refactor-8f2dc3`. Never `git add -A`, never stash,
  never commit unless asked.
- Never delete `/01/**`, `/414/**`, `/l/**`, `/p/**`, `/s/**`, `/q/**`.
- The AI may propose location moves like any other verb (operator ruling
  2026-09-26). The proposal lands for a named human to approve — approval-first
  — unless the org has flipped location moves to auto-approve; either way the
  write is logged `actor_kind = 'agent'` and revertable, and the scan-created
  placement stays the provenance of record.
- A parallel lane may be writing `/putaway` and `src/lib/scan/` — re-read
  before editing anything in those paths, and stay out of them if the lane is
  mid-flight.

## Fight this brief where it needs it

Two premises worth testing rather than swallowing:

1. **"The composer holds the centre by default."** The operator said data
   takes the centre, and also that the composer stays in the middle while
   tiles scroll around it. Those can coexist (centre column vs centre stage)
   or collide (a 680px composer column steals the exact space a table tile
   needs). Build both in the running app, measure the table tile's usable
   width at 1918px, and make the operator choose with the numbers on screen.
   **Ruled, operator 2026-09-26:** the composer stays fixed in the centre (the
   AI-centre inversion is reinstated); measure table tiles against that
   column, not the other way round.
2. **"Tiles scrolling left and right."** Horizontal strip vs true tiling grid
   is unruled. The Hyprland grammar implies a grid; "swiping like a book"
   implies a strip. Prototype the cheaper one first IN THE APP, time scenario
   A on both if the first feels wrong, and get a numbered ruling.

What is already ruled — the reinstated AI centre (operator ruling 2026-09-26),
One Field, M1, approval-first + per-automation auto-approve, the spine's
priority — is not reopened without new evidence (X3).
