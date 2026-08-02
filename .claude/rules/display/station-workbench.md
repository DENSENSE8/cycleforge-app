# Station column shell — Unbox-family display anatomy

> **Not Layer A Workbench.** This file is the **Station region** right-pane
> anatomy (`@/components/station/workbench`). The pick+edit Workbench contract
> lives in [`workbench.md`](workbench.md). Prefer the prose name **Station column
> shell** so agents do not port this shell onto Support / Desk queues.

The **Station column shell** (module still exports `StationWorkbench`) is the
named SoT for right-pane unit work across Unbox, Testing, Triage, Shipping,
Packing, and Repair intake. It is the vertical anatomy Unbox pioneered — a
Station-region shell for I/O + persistence per layer, not the Workbench
fallthrough contract.

Import:

```ts
import {
  StationWorkbench,
  PairingTogglePill,
  ExternalLinkPill,
  buildSectionTabs,
  WorkspaceTimelineTab,
  STATION_WORKBENCH_COLUMN,
} from '@/components/station/workbench';
import {
  CartonContextCard,
  StationContextBar,
  StationMoreDetails,
  StationHeaderToolbar,
} from '@/components/station/entity-context';
```

Reference implementation: `LineEditPanel` (Unbox). Sibling adopters:
`TestingPanel`, `TriagePanel`, `ActiveOrderWorkspace` (Shipping host —
`ShippingScanWorkspace` is its `tabs` composer, `UpNextActionDock` its dock),
`PackOrderPanel`, `RepairIntakeForm`, `LocalPickupEditPanel`.

---

## Enforcement — tiers, hard rules, CI guards (HARD SoT)

This anatomy is now **mechanically enforced**, not soft. Ratchet/positive guards:
`src/components/station/workbench/station-workbench-chrome.guard.test.ts`
(config + baselines + allowlists: `station-workbench-chrome-config.ts`) and the
registry-sync test `src/lib/station-terminal/station-terminal.test.ts` (Guard G).
They run under `npm run verify`. **Baselines only shrink — never raise one to
land a port** ([verify.md](../verify.md)).

### Tier model

| Tier | Stations | Guard stance |
|---|---|---|
| **A — Unbox-family** | Unbox, Triage, Testing | Full chrome: `StationContextBar` + `density="bar"` above `StationWorkbench`; wash SoT; registry terminal; `StationHeaderToolbar` |
| **B — port targets** | Shipping (host + child), Pack, Pickup, Labels, Packer review | Must match 720 column + compose `StationWorkbench`; terminal via registry **or** typed exempt/allowlist |
| **C — documented exceptions** | Support ticket (`SupportTicketIdentity`, non-carton), Support orders (`ShippedPanelEditorDock` footer), Pack (no sticky dock) | Explicit allowlist below + in config |
| **D — demote / remount** | Repair intake | Adopt `StationWorkbench` + `StationContextBar`, or drop from "Unbox-family" — not both |

### Hard Always

- Mount identity with `StationContextBar` + an entity-context adapter at
  `density="bar"` **above** `StationWorkbench` — never in `entityContext`/`toolbar`.
- Identity **and** body share `STATION_WORKBENCH_*` (720px + `px-4 sm:px-6`) from
  `workbench-layout.ts`. Compose `StationPanelRoot` for the outer shell.
- Terminal CTA via `useStationTerminalAction` + `STATION_TERMINAL_REGISTRY`, **or**
  a `TERMINAL_HAND_VM_ALLOWLIST` entry with a port follow-up.
- Ambient wash via `StationAmbientWash` (or `StationPanelRoot`, which renders it).
- Tabs via `buildSectionTabs` + `SectionTabsSlider`; glass worksheets via
  `WorkspaceCard` `bodyDensity="nested"`; mid-canvas jumps via
  `StationRightEdgeAction` + `stationRightEdgeActionHostClass` (never in `moreDetails`).

### Hard Never

- `max-w-3xl` (768px) or a local `max-w-[720px]` literal for an Unbox-family
  column — import `STATION_WORKBENCH_*`. Genuine non-column use: same-line
  `ds-station-max-w-exempt`.
- Copy the 3-blob ambient wash outside `StationAmbientWash`.
- Hand-roll `relative flex h-full min-h-0 flex-col bg-surface-canvas` for a
  station panel root outside `StationPanelRoot`.
- Fork a second condensed carton/order identity header (the **only** sanctioned
  fork is `SupportTicketIdentity` — ticket ≠ carton).
- Reintroduce `StationWorkbenchShell` (deleted — used `max-w-3xl`).
- Use `STATION_WORKBENCH_HEADER_COLUMN` (`px-6 sm:px-8`) for family identity/body
  — Triage toolbar / legacy skeleton pad only; Unbox skeleton uses
  `identity-tabs` + `STATION_WORKBENCH_IDENTITY_COLUMN`.
- Raise a guard baseline to pass.

### Documented allowlists (Tier C / gaps)

- **`SupportTicketIdentity`** (`support/service-workspace/SupportTicketFocus.tsx`) — forked
  identity for a ticket entity; keeps the motion root, composes `StationAmbientWash`.
  **Support's entries here are a MIGRATION state, not a settled tier.** Ratified
  2026-08-01: `/support` is Workbench branch **`service-workspace`**
  ([`workbench-service.md`](workbench-service.md)), so its primary shell leaves
  this family entirely — `SupportTicketFocus` stops composing `StationWorkbench` /
  `StationContextBar`, and these rows retire rather than graduate. The reason
  `SupportTicketIdentity` needed a fork in the first place — *a ticket is not a
  carton* — was the early evidence for that ruling. **Do not port more
  Unbox-family chrome onto Support to "finish" the tier.**
- **Hand-built terminal VMs** (`TERMINAL_HAND_VM_ALLOWLIST`): `PackerReviewMode`,
  `SupportTicketFocus`, `LabelsOrderWorkspace` — registry slices are port follow-ups.
- **`StationWorkbench` adoption gaps** (`STATION_WORKBENCH_ADOPTION_EXEMPT`):
  `RepairIntakeForm` (remount). Shipping folded onto the SoT 2026-07-28.
- **Pack** — intentionally terminal-exempt (no sticky dock); **Support orders** —
  `ShippedPanelEditorDock` footer instead of `StationTerminalDock`.

Open ports (rules do **not** pretend these are done):
`docs/todo/station-workbench-port-FOLLOWUPS.md`.

---

## Shared Timeline tab

Unbox, Testing, Shipping, and Packing expose a **Timeline** section tab via
[`WorkspaceTimelineTab`](../../../src/components/station/workbench/WorkspaceTimelineTab.tsx):

1. **Spine switcher at top** — house [`SectionTabsSlider`](../../../src/design-system/components/SectionTabsSlider.tsx)
   (**Units** default · **Tracking**). Single-spine cases hide the bar.
2. **Units** — [`StationUnitJourneys`](../../../src/components/station/workbench/StationUnitJourneys.tsx)
   only (two-line anatomy; SerialChip last-8 · clock · actor; raw `PREV → NEXT` omitted).
3. **Tracking** — full [`CarrierTrackingSection`](../../../src/components/sidebar/receiving/incoming-details/CarrierTrackingSection.tsx)
   (`stationCompact`: hero + events). Not shown on the Units spine.

PO path uses Incoming details; order/shipping uses journey `dim=tracking|order`.
Serials: explicit list or carton fetch via `useCartonSerials`.

**Unbox has NO tab strip in the workbench body.** The centre is the carton, and
**the procedure IS the centre** (2026-08-01): `buildUnboxOverview` returns the
procedure **focus deck** (`UnboxProcedureDeck` → DS `ProcedureDeck`), and the
`tabs` slot stays deliberately empty. The label is a **step inside that deck**,
not a preview mounted beneath it (2026-08-02).
Every other display lives in the right-edge **Displays** push column
(`ReceivingDisplaysPushStack`): strip order **Classify (unfound) · Pairing |
Listings (matched) · Units · Zoho** (po-note label from
`providerCatalogLabel('zoho')` brand token) + ⋯ for Support / Tracking /
Timeline. The strip has **no `rightSlot`** — see Pairing below.
**Checklist is ring-only** — the pane
scan-progress control (`UnboxScanProgressControl`) is the sole entry; no strip
cell. Tab list SoT = `buildUnboxSideTabs`; which one is showing (and whether the
column is open at all) = `resolveUnboxSideTab` — `null` IS closed, so there is no second
open flag to drift.

**Package Pairing is a DISPLAY, not a centre surface** (moved 2026-08-02). It
rendered inline at the bottom of `POUnboxingSection` — the `contents` step body
— behind a `pairingOpen` boolean whose only toggle, the `PairingTogglePill`
pencil, sat in the Displays strip's `rightSlot`. **A control on the right edge
must not open a surface in the centre:** on any other step the click flipped a
boolean whose consumer was off-screen and the operator saw nothing happen, and
the stopgap that "fixed" it (moving the centre's focused step to `contents`)
was a patch over the placement, not the placement.

It is a display and not a fourth push column because it is reference-and-edit
work the operator *chooses* to look at, not an exception that interrupts them —
the SoT's own test (*a surface that should stay visible while the operator works
is a display the operator picks*). It is likewise **not** a `RightRailHost`
occupant: Unbox would be a second permanent consumer of an edge that renders
exactly one app-wide occupant.

The tab's **selected-ness IS the open state** — `pairingOpen`, `togglePairing`
and the pencil are deleted, and a boolean beside `activeSideTab === 'pairing'`
would re-create the drift the move removed. Gate: a carton record
(`row.receiving_id != null`); without one the hub can only teach. Mounted
**non-embedded** — in a display the column IS the card, so `collapsed` /
`showTopRule` have nothing left to fold under (those props survive for their
Triage / Testing callers). `POUnboxingSection` goes back to being the PO line
list and nothing else. The carton `# ----` chip routes here via
`openDisplays('pairing')`, then dispatches
`RECEIVING_OPEN_PAIRING_PO_EVENT` on the **next frame** — the hub subscribes on
mount, so a same-tick dispatch reaches nothing and the PO tab silently stays
unselected. Guards: `carton-match-hub.guard.test.ts` ·
`unbox-side-tabs.test.ts`.

### The procedure has TWO views, and exactly ONE derivation (ruled 2026-08-02)

| Where | Surface | Answers |
|---|---|---|
| **Centre** | `ProcedureDeck` — bottom-pinned focus deck | *what do I do right now* |
| **Right edge** | `ProcedureChecklist` — the `checklist` display, **ring-only** | *where am I in the whole job* |

**The `checklist` display came back, and the "exactly ONE procedure surface" rule
is retired.** That rule was aimed at a real hazard and named the wrong thing: the
danger was never two VIEWS, it was two DERIVATIONS — a mirror that computes its
own answer and drifts. Both surfaces now read **`useUnboxProcedureSteps`**, one
hook, one answer, so they cannot disagree by construction. A bench needs both
questions answered at once, and answering them on opposite edges is cheaper than
making the operator swap displays to find out what is left on the box.

**Live is a requirement here, not polish.** The shared hook subscribes to the
carton's photo realtime channel, so the checklist reflects a scan — including one
taken on the PHONE — the moment it lands. A station display that lags the scan is
worse than none: the operator trusts it and re-shoots.

**Clicking a checklist row moves the CENTRE's focus card.** The map navigates the work.
That is why the focused step lives in `src/lib/receiving/procedure-focus-store.ts`
and not in either surface's `useState` — two local pointers would render two
answers on one screen. It is ephemeral and carton-keyed, never a URL param
(a Station's selection is ephemeral by contract).

**Never re-derive step order in a view.** `deriveProcedureSteps` is the
vocabulary SoT (hardcoding the steps breaks unfound, local pickup, returns and
multi-qty), and the POINTER is `resolveActiveStep`
(`src/lib/receiving/procedure-pointer.ts`), shared with the receipt read model.
The org-editable `checklist_templates` list and its `/api/checklists` CRUD were
deleted 2026-08-01 and **stay deleted** — a hand-ticked list is the one thing
that must not come back, because a box got ticked when someone remembered to tick
it rather than because the photo existed.

### The Procedure Focus Deck — geometry and motion (ruled 2026-08-02)

**A single-focus card deck carrying EVERY step**, in vocabulary order. The active
step owns the focus slot at the **bottom** against the composer that commits it,
completed steps read upward as a chat-style transcript, and the next step sits
*behind and below* the focus card as one watchOS-style peek that rises into focus
as the work advances. Anatomy: **big icon left · label · quantity right**, on a
**lightly tinted card** (the family's 50-level fill) with a coloured medallion.

**It was a flat column until 2026-08-02, and horizontal before that.** The rail
spent horizontal room to keep pending steps visible as faces; the flat column
spent vertical room on nine full-height cards the operator was not working on.
The deck spends neither. The properties that made every version safe are
unchanged and are what actually bind — see the invariants below.

- **Occlusion of a BODY is allowed. Occlusion of the RECORD is not.**
  This *re-scopes* the old three-count ban ("nothing is hidden, re-sorted, or
  occluded"), which named the wrong thing. What killed the first attempt
  (`UnboxCaptureStack`, deleted at `33a3eb609`) was that *"it hid pending steps
  and re-sorted completed ones so the current card could sit at the bottom"*, and
  what killed the refused **depth pile** was that it layered rows behind one
  another **occluding the completion times the record exists to show**. Neither
  of those is an axis, and neither is a z-index.
  - A step's **body** — its capture controls — belongs to one card at a time.
    Hiding the other eight bodies is the point of a focus surface and costs
    nothing: they are not actionable while another step is.
  - A step's **record** — label, state mark, summary, completion time — may never
    be occluded once it exists. That is why history is **full title rows in flow,
    never a pile**. A settled step's timestamp is evidence.
  - An **upcoming** step has no record yet, so a sliver peek costs nothing that
    exists. It must still be *reachable* — see the three pointer paths below.
- **HIDING and RE-SORTING remain absolutely banned.** Every step is mounted from
  the first frame, in strict `deriveProcedureSteps` order. A deck is a
  **transform**, never a filter and never a sort; `resolveActiveStep` decides the
  focus, nothing decides membership.
- **Exactly ONE queued card peeks.** It shipped as a three-layer pile for one
  revision and three translucent slivers at 60/45/30% did not read as depth —
  they read as one card that had failed to paint, with the labels of two queued
  steps double-imaged through each other. That is the *record* going illegible,
  which is the one thing the rule above forbids. One peek says everything the
  pile was for (*there is more after this, and it is shaped like a card*) for a
  third of the geometry. Not a knob: a second layer buys no information and costs
  the focus card its adjacency to the composer.
- **A covered card sits strictly BELOW the peek and takes no pointer events.**
  The first revision gave every queued card the peek's `z-20`; the covered ones
  are later siblings, so they painted *over* the peek and swallowed every click
  on its sliver. The deck's only forward affordance was pointer-dead and looked
  perfect in a screenshot. Nothing of a covered card is ever on screen, so it
  must never be able to take a click, and it renders as a `div` rather than a
  phantom `button` that still takes Tab.
- **Dimming is a FOCUS channel, never a state channel.** It says *where the
  operator is*, not *what is done*; state stays on the face's glyph + tone, so a
  colour-blind or low-vision operator loses nothing. The **history ladder is
  deliberately shallow** (`opacity-100` for the most recent completion, `80` for
  older) because a record faded to 40% is occluded by another name. A settled
  carton dims nothing at all — there is no "here" to be away from.
- **Height never animates, and there is exactly ONE height constant.**
  `PROCEDURE_STEP_FACE_HEIGHT` for a face; the active section is **exactly as
  tall as its body**. It carried a `min-h-[12rem]` floor for one day
  (2026-08-02) and on a step whose body is a single camera button that floor was
  literally an empty white box — see `ui-design-system.md` → *Never reserve
  height a body has not asked for*. Face → active is a plain reflow in one
  un-animated frame; **animating** it is what is banned, because a step advances
  9–24 times per carton, exactly the "reflows on its own" case the
  layout-animation ban exists to prevent.
- **A station work surface is BOTTOM-PINNED and grows upward.** The geometry is
  `min-h-full flex flex-col justify-end` **on the host's scroll port**
  (`StationWorkbench bodyAlign="end"`), never on the column — a percentage
  min-height only resolves against an ancestor with a definite height, and the
  port is the nearest one. `min-h-full`, not `h-full`: it makes the content at
  least a viewport tall so `justify-end` has something to push against while
  still allowing growth. The active step must sit **adjacent to the composer
  that commits it** — the eye path is product → down → the live card → the
  input. A work surface floating at the top of an empty canvas has put the
  operator's eye in the wrong place.

  Bottom-pinning is **not** the refused attempt #1. That failed by *hiding*
  pending steps and *re-sorting* completed ones. Pinning the stack's resting
  position while the full vocabulary stays mounted in order is a different
  thing, and the difference is the whole ruling.
- **The deck is CONTENT, not a viewport.** It adds no `overflow-*`, no `flex-1`,
  no `h-full` — the host owns the port (`ui-design-system.md` → *Scroll
  ownership*). It also must not be wrapped in `overflow-hidden` anywhere up the
  chain: the peek deliberately overhangs the focus card, and the clip would shear
  both it and the focus rings off inputs in an expanded body. Travel is
  `scrollIntoView({ behavior: 'smooth', block: 'nearest' })` on that port: no
  framer transition, no `layout`/`layoutId`, no scroll-linked timeline. Reduced
  motion is the browser's problem here and it gets it right — the smooth scroll
  becomes an instant jump, which is the correct reduced form.
- **The pile's pull-up is a per-item negative `margin-top`, never `space-y-*`.**
  Tailwind v4 compiles `space-y-N` to `margin-block-END` on every child except
  the last, so the gap belongs to the card ABOVE and a per-item `margin-top`
  cannot cancel it. The pile shipped 12px apart instead of tucked while both the
  computed `margin-top` and the class list read exactly as intended. Card gaps on
  this surface are explicit per item.
  The pull-up must also be expressed in **rem**, matching the face height: the
  root font-size moves with the Settings text-size control, and a px pull-up
  against a rem card drifts the peek at every size but one.
- **Snap belongs to the HOST port or nowhere.** An early revision put
  `snap-y snap-mandatory overflow-y-auto` on the column itself, nested in a
  `space-y-*` wrapper: `flex-1` had no basis, so the port never had a height and
  the snap never engaged. If snap comes back it goes on the workbench port
  behind an opt-in prop (never globally for every station). **A surface that
  scrolls correctly and does not snap is usable; one that neither scrolls nor
  snaps is not** — ship without snap rather than with a dead nested port.
- **Exactly ONE scroll port.** No nested scroller inside a card. An operator
  with a scanner in one hand cannot be asked which of two scrollers they are in.
- The focus card still crossfades its **contents** on `activeKey`
  (`framerPresence.stationCartonSwap` / `motionRole.swap.scan`, the
  station-cadence preset). Depth is `z-index` + `scale` + `opacity` in CSS,
  transitioned with `motion-safe:` — the `MotionConfig` floor covers framer only
  and cannot see a Tailwind `transition-*`. Every depth cue is a static resting
  value, so the deck reads correctly with the travel removed.
- **The hue is FUNCTIONAL** and resolves from `steps/step-face.tsx` — evidence
  (sky) · identity (violet) · judgement (amber) · traceability (emerald). Never a
  hue picked at a call site: two surfaces render these steps, and three meanings
  for one green is how a colour stops carrying information.
- **Lightly tinted card, coloured content — the fill stops at 50.** The family
  reads as the card's own background (a whole card is legible as a family at
  arm's length in a way a 4px edge is not, and on a deck where cards tuck behind
  one another the edge is the first thing occlusion eats). It stops at 50 because
  depth is `elevationClass('raised')` against the canvas ground plane and a
  shadow needs something to cast onto — if the tint ever flattens that, the fix
  is a **stronger canvas, never a heavier shadow** — and because a fully
  saturated card puts white-on-colour text at the bench's worst viewing angle,
  the one thing a warehouse monitor renders badly. The medallion steps up to
  100/300 so it stays a plate rather than matching the card it sits on.
- **Per-step durations stay refused.** There is no `step_started_at`; the gap
  between completions is not time-on-step, and timing an operator who can waive
  steps corrupts the evidence trail.
- **Nothing here takes focus — including a clicked control.** No `autoFocus`, no
  `tabIndex` on the deck; the focus card is scrolled into view, never
  `.focus()`ed. A pager chip or a card click *natively* focuses its button, and
  the next wedge scan would then type into it and its Enter would re-activate it
  — so **every pointer control on this surface dispatches `receiving-focus-scan`
  after it acts**. The wedge owns focus, and a surface that steals it drops scans
  silently; the failure mode is invisible, which is what makes it expensive.

**Three pointer paths, and the deck alone is not one of them.** Because only one
queued card peeks, everything past the next step is reached by:

1. the **peek** (click its sliver to promote it),
2. the **step pager** — pinned chrome directly above the composer, and
3. the right-edge **`checklist` display**, which is the deck's precondition (see
   the coupling below).

**The prev/next chips came back as pinned bottom chrome (2026-08-02, same day
they were cut).** They were cut because they rendered *after* the column, which
had no scroll port of its own, so they landed mid-document with nothing anchoring
them. They belong beside the input, in the dock band, where the operator's hand
already is — never as a trailer after the content. Two hard properties:

- They resolve from the **deck neighbours** (`prevStep` / `nextNeighbour` in
  vocabulary order), **never** from `nextStep`, which is the *skip* target: a
  pager wired to that walks the operator past every settled step they can still
  reopen, silently. Paging is positional; skipping is a decision, and a decision
  needs a waiver.
- **Honest absence at the ends** — no neighbour, no chip. Never a disabled
  control and never a wrap.

**A row added to the dock must be added to the scroll clearance.** The dock
floats over the canvas, so the body's bottom padding is the only thing keeping
content out from under it — and that padding is a constant tuned to the dock's
height (`STATION_TERMINAL_SCROLL_CLEARANCE`). The pager shipped overlapping the
peek by 4px until `reserveScrollClearance="pager"` landed
(`STATION_TERMINAL_PAGER_SCROLL_CLEARANCE`). A named variant, not a bumped shared
constant: the four stations without a pager must not pay 32px of dead canvas for
one that has one.

Guards: `procedure-step-body.guard.test.ts` (every step has a body + a dock
control) · `procedure-step-face.guard.test.ts` (every step has an icon + hue) ·
`procedure-divergence.guard.test.ts` (every step has a gate) ·
`receiving-lines-procedure-gates.guard.test.ts` (every gate column survives the
API normalizer — see below).

**A gate column must survive the WIRE, not just the schema.** `normalizeRow` in
`/api/receiving-lines` is a strict allowlist with no passthrough, so a column
added to the builders but not to the normalizer reaches the client as
`undefined` — indistinguishable from "not acknowledged". All three acknowledgement
stamps (`condition_graded_at`, `contents_confirmed_at`, `label_previewed_at`)
shipped exactly that way: routes wrote them, builders selected them, gates read
them, and the `condition`, `contents` and `label` steps could never go done.
Nothing threw; the pointer just parked forever. Every layer looked correct in
isolation, which is why this is a test and not a comment.

**Every Unbox right-edge surface is a station-scoped push column, never a
`RightRailHost` occupant.** Displays / Ticket (`ReceivingTicketStack`) / Claim
(`ReceivingClaimStack`) / tool (`ReceivingToolPushStack`) all compose the one
shared shell `UnboxPushColumn` (aside + leading resize grip + narrow-viewport
overlay + `DETAIL_STACK_ASIDE_SURFACE` + Escape) — do not hand-roll a fifth
copy. They are **mutually exclusive with each other and with receiving More
details** (`detail:receiving` float); Displays is lowest precedence, because an
exception surface or a just-launched tool outranks reference reading. Entries:
Displays = the parked expand strip / identity tracking·listing·classify faces;
Ticket = carton History / `?ticketView=1`; Claim = Make claim / Link ticket /
`?claimView=1` (+ optional `claimMode=link`). Support (overflow) still does not
mount the Linkage strip (link from entity chrome / console drawer). Packing is
terminal-registry-exempt (no sticky dock).

**The Unbox dock is carton-terminal.** `STATION_TERMINAL_REGISTRY.unbox` is
`hasSectionTabs: false` + `defaultKind: 'mode-default'`, so the bottom primary
is always Print · Receive and never changes with a Displays selection — a click
on the RIGHT re-labelling the button at the BOTTOM is cross-region
action-at-a-distance. A tab-scoped action (save the PO note, check all, prebox,
post a reply) is a **local control inside its own display**, not a dock kind and
not an imperative bridge.

**The dock's leading zone is NOT step-contextual — the composer is the whole
leading zone.** It writes `receiving_line.notes` and nothing else; there is no
per-step dock control, and no step-scoped note store.

A step-contextual leading zone was written up here as ruled on 2026-08-02 while
**none of it existed in the tree** — no `DockControl`, no dock slot on
`UnboxStepBodyContext`, no `activeKey` reader in the composer — and the section
also credited `procedure-step-body.guard.test.ts` with an assertion it does not
make. A rule describing code that is not there is worse than no rule: the next
agent composes against it and either gets a compile error or believes the
behaviour already ships. Demoted to a plan on 2026-08-02 (its reasoning is
preserved in
[`unbox-dock-step-context-photo-pairing-HANDOFF.md`](../../../docs/todo/unbox-dock-step-context-photo-pairing-HANDOFF.md)
§2) — **restore it here only in the change that builds it.**

A step's own controls are LOCAL controls in that step's body, which is the rule
directly above applied one altitude down. `CartonPhotoStepBody` is the reference:
the camera *and* the photo-pairing panel both live in the step card, and neither
reaches into the dock.

---

## Vertical anatomy (top → bottom)

| Layer | Role | SoT |
|---|---|---|
| **1. Progress stepper** | Completeness checklist (Photos → Serial → Print), not a wizard lock | `LinearWorkflowStepper` + `deriveLinearStepStates` — lives in parent shell (`ReceivingLineWorkspace`), not inside `StationWorkbench` |
| **2. Station bookmark chrome** | Absolute-float identity shell + corner utilities over the work canvas (no in-flow gray band). **Top padding SoT:** `STATION_BOOKMARK_CANVAS_INSET_TOP` (`top-2`) ↔ `CONTEXT_PANEL_OUTER_MARGIN` (`m-2`) — one 8px canvas gutter so identity + more-details + left rail share one top edge. **Never** stack host `py-*` under the absolute identity (Unbox push trailing = `TICKET_PUSH_HOST_PAD_CLASS` `pr-2` only; vertical = `CONTEXT_PANEL_OUTER_MARGIN_Y`). | `StationContextBar` (`stationContextBarHostClass`) + `StationMoreDetails` + `CartonContextCard` `density="bar"`; pair with `StationWorkbench` `reserveIdentityClearance`. Tokens: `station-bookmark.ts` + `context-panel-column.ts`. Guard: `unbox-push-gutter.guard.test.ts`. **Unbox:** Displays strip is `density="icon"`: flat icon row + right cluster **vertical ⋮** (no circular plates; no `rightSlot` pencil — Pairing is the `pairing` display). Scan progress (`UnboxScanProgressControl` / `ScanStationProgressRing`) is **always pane-anchored** (`stationMoreDetailsPaneHostClass`) — same top-right open or closed; selected face when checklist is showing; strip clears it with header `pt-9`. Hover = 2-row checklist peek (off while any push is open). Checklist is **ring-only** — not on the strip. Not `GoalRing`. Peer stations compose `ScanStationProgressControl` — never fork. Share / Audit / Copy / Info live on `/carton/[id]`; Move photos on the photo gallery |
| **2a. Context rail collapse** | Every left context-rail card may park via the trailing **resize-edge** control (`HorizontalEdgeResizeHandle` `onCollapse` — same hover as the resize pill); slim expand strip restores it. Outset chrome hangs into **`CONTEXT_PANEL_HOST` shared ground** (wash+canvas behind rail + workspace + outset gutter) — not a panel `z-raised` fight with an opaque Unbox sibling. Width-drawer + localStorage — not a page-local twin | `CONTEXT_PANEL_COLLAPSE` + `ContextPanelLayout` + `HorizontalEdgeResizeHandle`; Unbox/Triage roots use `appWorkCanvasLayoutClass` |
| **2b. Mid-canvas edge jump** | Secondary surface jump (e.g. Triage → Open in Unbox) — not the terminal CTA | `StationRightEdgeAction` + `stationRightEdgeActionHostClass` on the panel `relative` root (~`top-1/4` right). Never nest under `moreDetails`; never use `SlicedActionDock` for this |
| **3. Section tabs** | Labeled section displays (`TabSwitch` strip + overflow menu) that own bar + mounted panels; `rightSlot` for contextual controls | `SectionTabsSlider` + `buildSectionTabs` + `PairingTogglePill` / `ExternalLinkPill`. **Unbox mounts this in the right-edge Displays push column, not here** — its workbench `tabs` slot is empty. Unbox Displays uses **`density="icon"`** (flat icon row; the SELECTED cell expands to icon + label, idle cells carry the label as tooltip + accessible name, ⋯ is the right-aligned trailing peer — Unbox passes no `rightSlot`); other call sites stay `inline`. The `stacked` icon-over-label density it shipped with for one day is **deleted** — it fixed the width overflow but paid a bordered, shadowed, accent-filled two-row rail for it, and in a 360px push column the switcher outshouted the display it selects. A switcher is chrome. |
| **4. Tab body** | Whole contextual display per tab (form state survives via mounted panels) | Station-specific content. A tab-scoped action is a LOCAL control in its own body — never an imperative bridge feeding the dock (Unbox deleted all three) |
| **5. Feedback / footer** | Inline action feedback (scroll) + receive band (between body and dock) | `WorkspaceActionFeedbackSlot`, `ReceiveFeedbackRegion` |
| **6. Terminal dock band** | Optional chat-style notes composer + primary CTA (**tab-aware only where the registry slice says so — Unbox is not**) | `STATION_TERMINAL_REGISTRY` → `StationTerminalDock` → `SlicedActionDock`. **Unbox = ONE floating shell on every carton**: `OmnichannelComposerDock` via `slicedActionDockWrapperClass({ docked: false })` (absolute over the canvas + `reserveScrollClearance`) with the CTA in its `trailingAction` (`<StationTerminalDock embedded>`), blue Send suppressed. **Unbox Displays / Ticket / Claim / tool** are right-edge push columns composing `UnboxPushColumn` (not canvas docks / not RightRailHost floats). Leading-edge `onCollapse` hides them; Displays icon row right cluster = vertical ⋮; scan-progress ring always pane top-right (hover = 2-row peek, off while rail open). When a linked ticket is parked and no push owns the edge, the strip (`ReceivingPushExpandStrip`) carries only the ticket restore (`ReceivingTicketExpandControl`). **Canvas gutter:** `CONTEXT_PANEL_OUTER_MARGIN` / `STATION_BOOKMARK_CANVAS_INSET_TOP` / `CONTEXT_PANEL_OUTER_MARGIN_Y` (push vertical) + host `pr-2` (push trailing) — never host `py-*`. Support/Testing Ticket *tabs* (when present) still use `SupportTicketComposerDock` + `SupportChatComposer` `variant="station-dock"`. Full-width in-flow band elsewhere |

```
Parent shell (Unbox = pane outer: Unbox column + optional push column)
├── StationContextBar          ← absolute-float identity at STATION_BOOKMARK_CANVAS_INSET_TOP
│                                  (CONTEXT_PANEL_OUTER_MARGIN twin — never under host py-*)
├── StationMoreDetails         ← pane-anchored (same top + STATION_BOOKMARK_CANVAS_INSET_RIGHT)
│                                  so Ticket push does not slide it left
├── StationRightEdgeAction     ← optional mid-canvas jump (Triage Open in Unbox); panel-root absolute
└── StationWorkbench           ← reserveIdentityClearance (top) + terminal clearance (bottom)
    ├── scroll: children → feedback  (Unbox: `tabs` EMPTY — the carton overview
    │                                 is the whole body; entityContext/toolbar
    │                                 unused for Unbox-family)
    ├── footer (optional sticky band)
    └── dock                   ← Unbox / Support Ticket: OmnichannelComposerDock
                                 floating over the canvas (absolute; not an
                                 in-flow shelf) with embedded CTA in
                                 trailingAction; tab-aware stations: full-width
                                 StationTerminalDock

Right edge (exactly one at a time, LineEditPanel wires the exclusion):
  Claim ▸ Ticket ▸ tool ▸ Displays ▸ parked expand strip
  — all four columns compose UnboxPushColumn
    (vertical: CONTEXT_PANEL_OUTER_MARGIN_Y; trailing: host TICKET_PUSH_HOST_PAD_CLASS)
```

**Unbox overview dock — one elevated shell, never two cards.** The composer
floats over the scroll canvas (`slicedActionDockWrapperClass({ docked: false })`
+ `reserveScrollClearance`); it is the only surface in the band, and the primary
CTA rides in its footer. Support/Testing Ticket *tabs* compose the same pattern via
`SupportTicketComposerDock` (reply field + embedded Reply). Unbox Ticket (detail-stack
float) keeps the composer **inside** the card via `SupportTicketDetail` — never a
second canvas-absolute dock fighting the rail:

```
┌─────────────────────────────────────────────────────────┐
│ Notes for this carton…                                  │
│ [+] [Saved?]                    [sync]  [ ▾ | 🖨 Receive ] │
└─────────────────────────────────────────────────────────┘
```

- `SlicedActionDock` `embedded` renders **only** the pill track (`h-9`,
  `rounded-xl`, no band padding / safe-area / absolute float) — the host control
  owns placement. `slicedActionDockWrapperClass()` is the pure placement SoT.
- `OmnichannelComposerDock` `trailingAction` suppresses the blue Send; **Enter and
  blur still commit** the note (persistence is unchanged).
- The VM→dock mapping stays in `StationTerminalDock` (`embedded` prop) so the
  registry remains the single terminal path — never hand-thread `TerminalActionVm`
  fields into `SlicedActionDock` at a call site.
- `disabledReason` is the host's line above the composer in embedded mode.
- **Never** mount a second `StationTerminalDock` band under the overview composer.

`StationWorkbench` still accepts optional `toolbar` / `entityContext` for legacy
or non-identity chrome (e.g. Labels Queue/Print band, Triage recommendations
strip, Pickup product summary). Do **not** put `CartonContextCard` identity
there for Unbox-family stations — mount it in `StationContextBar` instead.

Overlays (photo peek, modals) compose **around** `StationWorkbench`, not inside it.

Unbox overview mounts carton notes as an **absolute float over the canvas** via
`OmnichannelComposerDock` + `slicedActionDockWrapperClass({ docked: false })`
(ChatGPT-style prompt chrome) with the Receive/Print split-CTA **inside** that
composer's footer (`trailingAction`) — not a mid-canvas nested notes card, not
an in-flow shelf/lip band, and not a second CTA row beneath it. Label preview
stays in the scroll body. Other Unbox tabs keep a full-width centered terminal.

---

## Introspective reuse (new station checklist)

1. Add one row to `WORKSPACE_MODES` only for receiving-family chrome; every docked adopter adds `STATION_TERMINAL_REGISTRY`
2. Thin adapter: controller → `CartonContextCard` props with `density="bar"`
3. Mount adapter in `StationContextBar` above `StationWorkbench`; Refresh (Testing: + Pair) in `StationMoreDetails` + embedded `StationHeaderToolbar` (Unbox: pane-anchor on the receiving pane host when Ticket can push). Lookup utilities → `/carton/[id]`
4. Tab defs with visibility gates → `buildSectionTabs()`
5. Terminal resolver in `{station}/terminal/` — tab id → `TerminalActionVm`
6. Compose `StationWorkbench` — never hand-roll `relative flex h-full min-h-0 flex-col`

Adding a tab = one registry row + one content component + one resolver branch.
Shell, bookmark chrome, slider chrome, and dock renderer stay untouched.

---

## What stays station-specific

| Concern | Local | Shared waist |
|---|---|---|
| Form state / handlers | Controllers (`useUnboxLineController`, …) | — |
| Tab content bodies | Domain cards | `WorkspaceCard`, `SectionTabsSlider` |
| Overview Notes + Label preview | Notes: dock `OmnichannelComposerDock` via `WorkspaceNotesCard`; label: `UnboxLabelPreview` in scroll | `OmnichannelComposerDock`; glass worksheets for label / other tabs via `WorkspaceCard` `bodyDensity="nested"` + `WORKSPACE_NESTED_FIELD*` |
| Content tabs (checklist / units / timeline / manuals) | Station tab bodies | Same `bodyDensity="nested"` — keep `space-y-*` on inner wrappers |
| Terminal VM assembly | `resolveUnboxTerminal`, … | Registry + `StationTerminalDock` |
| Step gate inputs | Photo count, serial, label printed | `deriveLinearStepStates` walk |
| Entity field wiring | Classify, linked order | `CartonContextCard` props |

---

## Glass nested worksheet recipe

Stacked overview cards (PO → Label) and non-overview content tabs share
one body pad via `WorkspaceCard` `variant="glass"` + `bodyDensity="nested"`
(`p-3`). Inner white fields compose:

| Token | Value | Role |
|---|---|---|
| `WORKSPACE_NESTED_FIELD` | `rounded-xl border … bg-surface-card` | White inset (concentric: glass `3xl` − `p-3` ≈ `xl`) |
| `WORKSPACE_NESTED_FIELD_PAD` | `inset-field` (`px-3 py-2`) | Default inset pad (Label, PO note, claim) |
| `WORKSPACE_NESTED_OVERLAY_CORNER` | `right-1.5 top-1.5` | Default overlay inset (Label Edit, claim insert rail) |

Unbox overview carton notes use **`OmnichannelComposerDock`** floating over the
terminal dock edge (absolute band via `slicedActionDockWrapperClass({ docked: false })`,
not nested-field chrome and not an in-flow shelf).

**Do not** force this recipe onto flush entity chrome (`CartonContextCard`
`px-0 py-0`), Shipping solid pairing cards, ShippedNotesComposer, or admin
`rounded-lg` regions.

## Related

- Station scan contract: [`station.md`](station.md)
- Workbench (master–detail) contract: [`workbench.md`](workbench.md)
- Code: `src/components/station/workbench/`
- Entity header + bookmark chrome barrel: `src/components/station/entity-context/`
- Terminal registry: `src/lib/station-terminal/`
- Nested field SoT: `src/design-system/components/WorkspaceCard.tsx`
