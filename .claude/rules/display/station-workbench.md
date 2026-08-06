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
| **A — Unbox-family** | Unbox, Triage, Testing, **Pack**, **Labels**, **Shipping**, **Packer review** (Displays) | Full chrome: `StationContextBar` + two-row `CartonContextCard` above `StationWorkbench`. **Unbox + Triage (Arrival) + Pack + Labels + Shipping + Packer review** = `placement="flow"` + `reserveIdentityClearance={false}` + `bodyGap="none"` where ported. Testing may still use absolute overlay + `"stacked"` until ported. Wash SoT; registry terminal; `StationHeaderToolbar`. Pack stays **terminal-exempt** (Tier C dock). |
| **B — port targets** | Pickup (when focus entity exists) | Must match 720 column + compose `StationWorkbench`; terminal via registry **or** typed exempt/allowlist |
| **C — documented exceptions** | Support ticket (`SupportTicketIdentity`, non-carton), Support orders (`ShippedPanelEditorDock` footer), Pack (no sticky dock) | Explicit allowlist below + in config |
| **D — demote / remount** | Repair intake | Adopt `StationWorkbench` + `StationContextBar`, or drop from "Unbox-family" — not both |

### Hard Always

- Mount identity with `StationContextBar` + an entity-context adapter (two-row
  `CartonContextCard`) **above** `StationWorkbench` — never in
  `entityContext`/`toolbar`. **Unbox + Arrival (`TriagePanel`) + Pack
  (`PackOrderPanel`):** `placement="flow"` + `reserveIdentityClearance={false}`
  (hairline abuts centre work) + `bodyGap="none"`. Overlay hosts still pending
  (Testing): `reserveIdentityClearance="stacked"`.
- Identity **and** body share `STATION_WORKBENCH_*` (720 lock, start-aligned,
  **zero** body pad — flush to rail / Displays hairlines) from
  `workbench-layout.ts`. Identity **host** is full-bleed for layout only
  (`STATION_WORKBENCH_IDENTITY_COLUMN`); the white card face + chips share the
  same 720 lock (`STATION_WORKBENCH_COLUMN` + `mx-auto`) so Displays-closed
  panes show sunken gutters left · right of carton context and keep
  `justify-between` on the divider. Compose `StationPanelRoot` for the outer
  shell.
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

**Unbox has NO tab strip in the workbench body.** The centre is the carton:
`buildUnboxOverview` returns **PO lines + label preview** (`POUnboxingSection`
with `editLines` + `serialScan`, then `UnboxLabelPreview`). The `tabs` slot stays
deliberately empty. Guided `ProcedureDeck` / step dock continue on the
`unbox-work` lane (`../cycleforge-unbox`) — not on main dogfood (parked
2026-08-04). Every other display lives in the right-edge **Displays** push column
(`ReceivingDisplaysPushStack`): strip order **Ticket · Photos · Linkage ·
Classify · Units** + ⋯ for Listings / Support / Tracking / Timeline (Audit under
Timeline). Ticket nests Chat · Claim; Photos nests Browse · Move · Send; Linkage
nests Link (`CartonMatchHub`) · Zoho note. The strip has **no `rightSlot`**.
**Checklist is ring-only** — the scan-progress control (`UnboxScanProgressControl`)
is the sole entry; no strip cell. Optional procedure status, not a required twin
of a centre deck. Tab list SoT = `buildUnboxSideTabs`; which one is showing (and
whether the column is open at all) = `resolveUnboxSideTab` — `null` IS closed, so
there is no second open flag to drift.

**Linkage (Package Pairing + Zoho note) is a DISPLAY, not a centre surface**
(Pairing moved 2026-08-02; condensed with Zoho note 2026-08-05). Pairing once
rendered inline at the bottom of `POUnboxingSection` behind a `pairingOpen`
boolean. **A control on the right edge must not open a surface in the centre.**

It is a display and not a peer push column because it is reference-and-edit
work the operator *chooses* to look at, not an exception that interrupts them.
Ticket (Chat · Claim) and photo tools are Displays tabs (2026-08-05) — not
separate push columns. Linkage is likewise **not** a `RightRailHost` occupant.
Claim compose Subject/Body uses sheet-band faces (`DenseComposeFields` —
underline Subject + full-bleed sunken Body); the claim scroll body is `px-0`
with section hairlines — rows own `px-3` / `inset-field`, not nested bordered
input cards. **Macro CTAs** (Claim File, Prebox Print, Move / Send photos) pin
to the Displays column floor via `FlushTerminalFooter` — in-flow sibling,
`p-0` hairline, flush `Button` — never a padded card CTA hanging under a nested
list island. Per-row Micro actions stay on `IconButton size="md"`.

The tab's **selected-ness IS the open state** — `pairingOpen`, `togglePairing`
and the pencil are deleted, and a boolean beside `activeSideTab === 'linkage'`
would re-create the drift. Gate: a carton record (`row.receiving_id != null`).
Mounted with `chrome="bare"` inside `LinkageDisplayHost` (nested Link · Note).
The carton `# ----` chip routes via `openDisplays('linkage')` plus a
**`focusTab` prop** on the hub — the intent travels as DATA, never as a timed
event.

**A timed dispatch cannot outrun a navigation.** `focusTab` is read on mount; a
`focusRequestId` bump re-selects the avenue when the host asks again. Same
handoff shape as `classifyExpand` → `TriageClassifySection`. Triage keeps the
window event (its hub mounts in the same commit).

**A display's URL vocabulary lives in ONE list.** `?display=` is round-tripped
via `canonicalizeUnboxSideTab` in `UNBOX_ROUTE_PARAMS` (legacy `pairing` /
`po-note` → `linkage`). Guards: `carton-match-hub.guard.test.ts` ·
`unbox-side-tabs.test.ts` · `unbox-right-edge-chrome.guard.test.ts` ·
`route-params.test.ts`.

### Procedure status views (main vs unbox-work)

| Where | Surface | Answers |
|---|---|---|
| **Centre (main)** | `POUnboxingSection` + `UnboxLabelPreview` | *what is in the box · grade · serial · label* |
| **Centre (unbox-work)** | `ProcedureDeck` — focus deck | *what do I do right now* |
| **Right edge** | `ProcedureChecklist` — the `checklist` display, **ring-only** | *where am I in the whole job* (optional on main) |

On **main**, the centre is PO lines + label; checklist/ring are optional procedure
status and must not require a centre `ProcedureDeck`. On **`unbox-work`**, deck +
checklist both read **`useUnboxProcedureSteps`** — one hook, one answer.

**Live is a requirement for the checklist when mounted.** The shared hook
subscribes to the carton's photo realtime channel, so the checklist reflects a
scan — including one taken on the PHONE — the moment it lands.

**On the unbox-work lane, clicking a checklist row moves the CENTRE's focus card.**
The focused step lives in `src/lib/receiving/procedure-focus-store.ts`
and not in either surface's `useState`. It is ephemeral and carton-keyed, never a URL param
(a Station's selection is ephemeral by contract).

**Never re-derive step order in a view.** `deriveProcedureSteps` is the
vocabulary SoT (hardcoding the steps breaks unfound, local pickup, returns and
multi-qty), and the POINTER is `resolveActiveStep`
(`src/lib/receiving/procedure-pointer.ts`), shared with the receipt read model.
The org-editable `checklist_templates` list and its `/api/checklists` CRUD were
deleted 2026-08-01 and **stay deleted** — a hand-ticked list is the one thing
that must not come back, because a box got ticked when someone remembered to tick
it rather than because the photo existed.

### The Procedure Focus Deck — parked on `unbox-work` (geometry law retained)

**Main Unbox does not mount this deck** (PO lines + label — see above). The law
below applies on the **`unbox-work`** lane (`../cycleforge-unbox`) and any future
derived-procedure bench that opts in.

**On that lane, this deck is the hero of the scan-station workbench.** Identity and items
are supporting chrome; Displays and the dock are secondary. Do not mount a
competing centre surface that splits visual weight with the deck.

**A flat list of fixed-height faces carrying EVERY step**, in vocabulary order.
Rigid flat foundation (amended 2026-08-04 — selection is outline-only; faces
never grow; stack / peek / layout-motion paths retired):

```text
Step face (40px, mt-3) — outline ring when selected
Step face …
Step face …
Evidence band under the list   ← ONE body; not inside the face
```

Anatomy: **icon left · label · quantity right**, on a **neutral card**
(`bg-surface-card`) — no per-step hue family. Selected face keeps the same
chrome at `h-10` with `ring-1 ring-inset ring-blue-400`. Evidence mounts in a
band under the `<ol>`, never inside the face.

**It was overbuilt into a space-aware Smart Stack** (capacity math, sticky,
top-compress, crown scrub, peeks, `layout="position"` advance). That path
produced ghosting, width dip, crushed mid-cards, and layout thrash. The flat
list is the foundation to build from.

- **Occlusion of a BODY is allowed; every RECORD stays a full face.**
  A step's **body** — its evidence — belongs to one band at a time under the
  list. Other bodies are not shown while another step is focused. (A body is
  *evidence*, not controls: since 2026-08-02 the step's action button lives in
  the dock.)
  Every step's **record** (label, state mark, summary) stays a
  40px readable face — no peek, no covered tuck, no expand-on-focus. Reachability
  is click + pager + checklist.
- **HIDING and RE-SORTING remain absolutely banned.** Every step is mounted from
  the first frame, in strict `deriveProcedureSteps` order. A deck is a
  **transform**, never a filter and never a sort; `resolveActiveStep` decides the
  focus, nothing decides membership.
- **Flat geometry.** Every step face = `PROCEDURE_STEP_FACE_HEIGHT` (`h-10` /
  40px) with `PROCEDURE_STACK_GAP_REM` (`mt-3`) gaps — including the selected
  row. Selection = `ring-1 ring-inset ring-blue-400` on the same face chrome.
  Evidence mounts in a band under the `<ol>` (`data-procedure-active-body`).
  No peek, no covered, no negative margins, no `availableRem`, no wheel arming,
  no host-scroll compress, no in-face expand.
- **No layout motion on step advance.** Evidence band uses
  `framerPresence.procedureFocusBody`. No `layout="position"`, no
  `runProcedureStackAdvance`, no `motionRole.procedure.advance` on this surface
  (role retained in catalog as deferred / unused). Travel is
  `scrollIntoView({ block: 'nearest' })` on the host port.
- **A station work surface is BOTTOM-PINNED and grows upward.** The geometry is
  `min-h-full flex flex-col justify-end` **on the host's scroll port**
  (`StationWorkbench bodyAlign="end"`), never on the column. Host `justify-end`
  keeps short content against the composer.
- **The deck is CONTENT, not a viewport.** It adds no `overflow-*`, no `flex-1`,
  no `h-full` — the host owns the port. Card gaps are per-item positive
  `margin-top` in rem — never `space-y-*`.
- **Snap belongs to the HOST port or nowhere.** Never nest `snap-y` /
  `overflow-y-auto` on the deck.

- **Exactly ONE scroll port.** No nested scroller inside a card. An operator
  with a scanner in one hand cannot be asked which of two scrollers they are in.
- The evidence band crossfades its **contents** on `activeKey`
  (`framerPresence.procedureFocusBody`).
- **No hue family.** Icons resolve from `steps/step-face.tsx`; surface / medallion /
  quantity ink are ONE neutral set for every step. State marks and the outline
  selection already say where you are. Never pick a hue at a call site.
- **Neutral card; outline on selection.** `border-border-soft bg-surface-card`
  on every row; selected face adds `ring-1 ring-inset ring-blue-400`. Evidence
  band is a plain bordered card under the list.
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
Displays = the pane progress ring / identity tracking·listing·classify faces;
Ticket = carton History / `?ticketView=1`; Claim = Make claim / Link ticket /
`?claimView=1` (+ optional `claimMode=link`). Support (overflow) still does not
mount the Linkage strip (link from entity chrome / console drawer). Packing is
terminal-registry-exempt (no sticky dock).

**Center stays the sunken ground when left + right push (ruled 2026-08-03).**
Context rail + Unbox column + optional push column sit as flush siblings on
`CONTEXT_PANEL_HOST` shared canvas — depth is plane contrast, not floating
islands. Inter-column gutters are **0**; workbench body pad is **empty**
(`STATION_WORKBENCH_BODY_PAD_X`) and the content column is **start-aligned**
(no `mx-auto` trough against the left rail). Identity white face shares
`STATION_WORKBENCH_COLUMN` (720 + `mx-auto`) with PO lines — never a
full-bleed white curtain across the sunken center. While Displays
is open the host is `[middle max-w-720 grow-0][Displays flex-1]` — middle on the
leading side (≤720 max, not a min); Displays fills to the pane right edge with
**no** painted max width / leading spacer. Content uses
`STATION_WORKBENCH_COLUMN` (`max-w-[720px] mx-auto`). Frame station
`centerFloorPx` is **0**. Displays drag min is
`STATION_DISPLAYS_MIN_WIDTH_PX` (**280**), below the desk inspector 360.
**Station Ticket (or Claim) and app AI share the product law “one right details
column”:** when header Sparkles opens the assistant occupant, station
ticket/detail chrome yields (park / close) — do not leave both full beside each
other. Station exclusivity (Ticket | Displays | Claim | tool) remains; app
`RightRailHost` exclusivity (detail | assistant) remains. Full law:
[`source-of-truth.md`](../source-of-truth.md) → **Frame column budget** ·
**Right-rail modality** · **Depth elevation**.

**The Unbox dock is carton-terminal.** `STATION_TERMINAL_REGISTRY.unbox` is
`hasSectionTabs: false` + `defaultKind: 'mode-default'`, so the bottom primary
is always Print · Receive and never changes with a Displays selection — a click
on the RIGHT re-labelling the button at the BOTTOM is cross-region
action-at-a-distance. A tab-scoped action (save the PO note, check all, prebox,
post a reply) is a **local control inside its own display**, not a dock kind and
not an imperative bridge.

**The dock's LEADING zone is the step's ACTION surface; its TRAILING terminal is
the carton's** (ruled 2026-08-02, and **shipped in the same change** — the
earlier write-up of this section described code that did not exist and was
demoted for a day). Two zones, two scopes, in one `OmnichannelComposerDock`:

| Zone | Scope | Contract |
|---|---|---|
| **Leading** | the **active step** | that step's `UNBOX_STEP_DOCK_CONTROLS` entry + the pager + the note field. Swaps with `activeKey` on `motionRole.swap.scan`. |
| **Trailing** | the **carton** | Print · Receive. **Never re-labelled, never step-scoped, never hidden, never animated.** |

### A step CARD carries no action button. Ever.

**The card reads; the dock acts.** A step body renders the step's CONTENT — the
photos taken for that aspect, the label face, the line list, the grade on
record. Every control that *advances* the step — camera, `Link a photo`,
*Contents match*, *Face is right*, the grade chips — renders in the dock band.

Two reasons, and the second is the one that is easy to miss:

1. **The hand is already there.** The composer, the pager and the Print · Receive
   terminal are in that band. A control in a card asks the operator to leave the
   one place they never leave.
2. **A card SCROLLS; the dock does not.** The deck is content inside the
   station's scroll port, so a control in a card sits at whatever offset the deck
   is at — including underneath the dock itself, which is exactly how the label
   preview came to slide beneath the composer before it became a step. A control
   whose position depends on scroll offset is a control you have to look for.

**This does not re-open the cross-region ban above; it applies it.** That ban is
about the **Displays column on the right edge** reaching across the workbench to
rewrite the bottom button. The active step is set in the column **directly
above** this band — same region, adjacent, and it is the operator's current work.
What the ban protects is that *the commit* stays unambiguous, and it does:
Receive means the same thing on every step.

### The invariants

- **One note target.** The composer writes `receiving_line.notes` and only that.
  The placeholder may name the step; the column it writes may not. A step-scoped
  note store is forbidden.
- **A step control is a LOCAL control, not a dock KIND.** No step ids in
  `STATION_TERMINAL_REGISTRY`, and no imperative bridge from the deck into the
  dock — both read `useUnboxProcedureSteps`, so they cannot disagree.
- **Not every step has an action, and that absence is DECLARED.**
  `UNBOX_STEP_DOCK_CONTROLS` is `Partial` on purpose: `arrival_check` reads the
  door's evidence and must not offer a camera (a bench capture there would void
  the `require_one` receive gate), and `classify` / `serial` mount editors whose
  every control *is* the editing. Those three are listed in
  `UNBOX_STEPS_WITHOUT_DOCK_ACTION` **with a reason** — a step in neither map
  fails CI, so an empty dock band is always a decision and never a gap.
- **The leading zone crossfades on `activeKey` with `motionRole.swap.scan`** —
  the station-cadence preset with the `duration: 0` exit, never `swap.focus`. The
  trailing terminal sits outside that presence and never animates: it is the one
  thing on screen that must not move while a hand is going for it.
- **Every dock control hands focus back** (`receiving-focus-scan`, 60ms defer).
  A control that eats the wedge is the most expensive bug on this surface,
  because the failure is silent.

Code: `steps/dock/` (registry + controls) · `UnboxStepDock` (the band) ·
`buildUnboxStepDock` (slot composition, beside `buildUnboxOverview`).
Guard: `steps/dock/procedure-step-dock.guard.test.ts` — pins the either-or
membership, the shared carton-photo control, and that **no step body imports an
action primitive**.

---

## Vertical anatomy (top → bottom)

| Layer | Role | SoT |
|---|---|---|
| **1. Progress stepper** | Completeness checklist (Photos → Serial → Print), not a wizard lock | `LinearWorkflowStepper` + `deriveLinearStepStates` — lives in parent shell (`ReceivingLineWorkspace`), not inside `StationWorkbench` |
| **2. Station identity chrome** | Coplanar flush band under GlobalHeader over the **sunken** work plane (no in-flow gray band, no raised bookmark). **Top padding SoT:** `STATION_IDENTITY_INSET_TOP` (`top-0`); `stationIdentityPanelClass` = `rounded-none` + hairline `border-b` + flat elevation + `bg-surface-card` on the **720 measure** (`STATION_WORKBENCH_COLUMN` — never full-bleed white); `stationIdentityPadClass` = horizontal only (zero `pt`/`pb`). **Never** stack host `py-*` under the absolute identity. Unbox push is **flush** (no outer `my-2` / host `pr-2`). | `StationContextBar` (`stationContextBarHostClass`) + `StationMoreDetails` + `CartonContextCard` (two-row); pair with `StationWorkbench` `reserveIdentityClearance="stacked"` + Unbox `bodyGap="none"`. Tokens: `station-identity-chrome.ts` + flush `CONTEXT_PANEL_COLUMN_CLASS` / `DETAIL_STACK_PUSH_COLUMN_CLASS`. Guard: `unbox-push-gutter.guard.test.ts`. **Unbox:** Displays strip is `density="icon"` SpaceX **`h-10` edge-to-edge topic plate** + right cluster **vertical ⋮** (no circular plates; no `rightSlot` pencil — Linkage is the `linkage` display). Scan progress (`UnboxScanProgressControl` / `ScanStationProgressRing`) is **dock-anchored under the terminal** (`UnboxDockHost` progress row) — same place open or closed; selected face when checklist is showing. Pane top-right (`stationMoreDetailsPaneHostClass`) carries **Displays `←|` open** (`UnboxDisplaysEdgeToggle` `pane-open`, exclusive when Displays closed) **left of** carton `↑ ↓`. Open handoff: shared `layoutId` morphs into column top-left `→|` (`column-close` / `unbox-push-close`) with `motionRole.push.rail` — never a second pane dismiss, never `detail:receiving`. The band above the strip is a **real row owned by `UnboxPushColumn`** (`UNBOX_PUSH_TOP_BAND`) carrying that landed dismiss at its top-LEFT. **Topic plate cancels host `px-4` with `-mx-4`** so Ticket · … · ⋮ sit column-edge flush. Nested verb strips (Chat·Claim etc.) also `-mx-4` and sit **`gap-0` flush under the plate** — Cybertruck stack, no vertical air between tab rows. Hover = Cursor-style overlap peek just above the ring (top-end, viewport-clamped) with Open in Displays footer (off while any push is open). Checklist is **ring-only** — not on the strip. Not `GoalRing`. Peer stations compose `ScanStationProgressControl` — never fork. Share / Audit / Copy / Info live on `/carton/[id]`; Move photos on the photo gallery |
| **2a. Context rail collapse** | Every left context-rail card may park via sash-top `HorizontalEdgeResizeHandle.onCollapse` (trailing outset hairline + chevron — dashboard included) **or** **display** `RailFilterCollapseButton` auto-seated by bottom `TechRailSearchBar` `variant="rail"` under `ContextPanelCollapseProvider` (age column / bottom-right; hosts may override `trailingAction`) **or** drag-past-min on the trailing resize edge; slim expand strip restores it — **whole-strip click / Enter / Space** (or footer chevron). Top-of-strip **mini scan cell** (`CollapseStripScanCell` — `h-10` Plus idle with staff-themed hover; focused = same bottom-up `ScanBandGlowHost` glow as the open band + visible caret, no placeholder; shares primary `StationScanBar` via `usePublishCollapseScan`). Mid-strip **MRU pins** (`CONTEXT_PANEL_COLLAPSE.mruPinCount` = 5) are the default for every `SidebarRecentRailBase` (shell publishes via `usePublishCollapsePins`) — status dots; **selected** pin uses open-rail `RailRow` ring (`bg-blue-50 ring-1 ring-inset ring-blue-400`); pin **click** selects (stay collapsed); pin **double-click** expands; when the open rail has more than five, a **`+N` overflow** control expands; pin **hover** always opens a `RailPopover` card — the feed's own `renderPopover` (Receiving · FBA) when it has one, else the shared **`RailPeekCard`** (title · status · **copyable `CopyChip` id facts** via `getCollapsePinFacts` · age · Open →). Never a text-only tooltip. Dashboard inbound recents thin-wires the same publish channel (not on the shell). Outset chrome hangs into **`CONTEXT_PANEL_HOST` shared ground**. Width-drawer + localStorage — not a page-local / in-row twin. LedgerDrill parent maps share the same filter-trailing grammar (`useLedgerDrillCollapse`). | `CONTEXT_PANEL_COLLAPSE` + `ContextPanelLayout` + `SidebarRecentRailBase` / `SidebarRailShell` + `TechRailSearchBar` + `RailFilterCollapseButton` + `LeftDockCollapseStrip` + `CollapseStripScanCell` + `CollapseStripMruPins`; Unbox/Triage roots use `appWorkCanvasLayoutClass` |
| **2b. Mid-canvas edge jump** | Secondary surface jump (e.g. Triage → Open in Unbox) — not the terminal CTA | `StationRightEdgeAction` + `stationRightEdgeActionHostClass` on the panel `relative` root (~`top-1/4` right). Never nest under `moreDetails`; never use `SlicedActionDock` for this |
| **3. Section tabs** | Labeled section displays (industrial `TabDisplay` underline strip + overflow menu) that own bar + mounted panels; `rightSlot` for contextual controls | `SectionTabsSlider` + `buildSectionTabs` + `PairingTogglePill` / `ExternalLinkPill`. **Unbox mounts this in the right-edge Displays push column, not here** — its workbench `tabs` slot is empty. Unbox Displays uses **`density="icon"`** as a SpaceX / Cybertruck **`h-10` edge-to-edge topic plate** (four-edge readable `border-border-default` frame — not near-invisible `border-hairline`; `-mx-4` cancels host `px-4`; cells `flex-1` + `divide-x divide-border-default`; SELECTED expands to icon + caption label with underline active; idle = icon-only tooltip + a11y name; trailing **⋮** is the right-edge peer on the same row — Unbox passes no `rightSlot`); `compact` only tightens horizontal padding, never shortens the face. Other call sites stay `inline` (also `TabDisplay` underline, not soft `TabSwitch`). **Nested verb switchers inside a Displays topic** (Photos Browse·Move·Send, Ticket Chat·Claim, Linkage Link·Note) use industrial **`TabDisplay` `appearance="underline"`**, also `-mx-4`, sitting **`gap-0` flush under the topic plate** (no vertical air between tab rows; body content may keep its own `pt-*`). Claim **New ticket · Link existing** is the child **`TabDisplay` `appearance="segment"`** under Chat·Claim — never a second inverse `PaneHeaderTabs` / soft pill. Guard: `tab-display-displays-hosts.guard.test.ts`. The `stacked` icon-over-label density it shipped with for one day is **deleted** — it fixed the width overflow but paid a bordered, shadowed, accent-filled two-row rail for it, and in a 360px push column the switcher outshouted the display it selects. A switcher is chrome. |
| **4. Tab body** | Whole contextual display per tab (form state survives via mounted panels) | Station-specific content. A tab-scoped action is a LOCAL control in its own body — never an imperative bridge feeding the dock (Unbox deleted all three) |
| **5. Feedback / footer** | Inline action feedback (scroll) + receive band. **Unbox:** receive band co-mounts in the absolute dock float stack **above** `UnboxDockHost` (not the in-flow `footer` — an absolute dock would cover it). Other stations may still use sticky `footer` between body and an in-flow dock. | `WorkspaceActionFeedbackSlot`, `ReceiveFeedbackRegion` |
| **6. Terminal dock band** | **Leading = the ACTIVE STEP's action control** (`UnboxStepDock` → `UNBOX_STEP_DOCK_CONTROLS`; a step card never carries a button) + pager + chat-style notes composer · **trailing = the carton's** primary CTA (**tab-aware only where the registry slice says so — Unbox is not**) | `STATION_TERMINAL_REGISTRY` → `StationTerminalDock` → `SlicedActionDock`. **Unbox = ONE floating shell on every carton**: `OmnichannelComposerDock` via `slicedActionDockWrapperClass({ docked: false })` (absolute over the canvas + `reserveScrollClearance`) with the CTA in its `trailingAction` (`<StationTerminalDock embedded>`), blue Send suppressed. **Unbox Displays / Ticket / Claim / tool** are flush right-edge push columns composing `UnboxPushColumn` (`DETAIL_STACK_PUSH_COLUMN_CLASS`; narrow overlay may use elevated aside). Ticket reopen is carton identity Reply / `?ticketView=1`. **Flush planes:** no outer push gutters — hairline against sunken center. Identity top = `STATION_IDENTITY_INSET_TOP` only. Support/Testing Ticket *tabs* (when present) still use `SupportTicketComposerDock` + `SupportChatComposer` `variant="station-dock"`. Full-width in-flow band elsewhere |

```
Parent shell (Unbox = pane outer: Unbox column + optional flush push column)
├── StationContextBar          ← absolute-float identity at STATION_IDENTITY_INSET_TOP
│                                  (flush under GlobalHeader — never under host py-*)
├── StationMoreDetails         ← pane-anchored (same top + STATION_IDENTITY_INSET_RIGHT)
│                                  so Ticket push does not slide it left
├── StationRightEdgeAction     ← optional mid-canvas jump (Triage Open in Unbox); panel-root absolute
└── StationPanelRoot           ← bg-surface-sunken center plane
    └── StationWorkbench       ← transparent fill; reserveIdentityClearance + terminal clearance
        ├── scroll: children → feedback  (Unbox: `tabs` EMPTY — the carton overview
        │                                 is the whole body; entityContext/toolbar
        │                                 unused for Unbox-family)
        ├── footer (optional sticky band; Unbox leaves null —
        │            ReceiveFeedbackRegion rides in the dock float stack)
        └── dock                   ← Unbox / Support Ticket: OmnichannelComposerDock
                                     floating over the canvas (absolute; not an
                                     in-flow shelf) with embedded CTA in
                                     trailingAction; Unbox receive confirmation
                                     mounts above UnboxDockHost in this stack;
                                     tab-aware stations: full-width
                                     StationTerminalDock

Right edge (exactly one at a time, LineEditPanel wires the exclusion):
  Displays (`?display=<tab>`) ∪ `detail:receiving` ∪ AI
  — Displays strip (left → right): Ticket · Photos · Linkage · Classify · Units
    (⋯ Support · Tracking · Timeline; Audit folds under Timeline; checklist = ring-only)
  — Ticket nested: Chat · Claim (`?ticketAction=`; Claim keeps `?claimMode=`)
  — Photos nested: Browse · Move · Send (`?photoAction=`)
  — Linkage = Pairing hub + Zoho note (`?linkageAction=link|note`) — retired peer
    Ticket / Claim / tool push columns
  — compose UnboxPushColumn (flush DETAIL_STACK_PUSH_COLUMN_CLASS)
  (no parked expand strip — ticket reopen = carton Reply → `display=ticket`;
   Displays also opens from pane ←| edge toggle / progress ring;
   open ↔ close is one control via layoutId handoff onto column →|)
  AI (Sparkles) yields / is yielded — never dual full right with station push

Operator copy SoT (`UnboxDisplaysEdgeToggle`):
  Closed → pane top-right `←|` **Open displays**
  Open   → column top-left `→|` **Hide right panel** (names the REGION, not the tab)
  Carton `↑ ↓` beside the pane `←|` are the **carton cursor** (next/prev carton) —
  not Desk inspector prev/next. Never rename this edge to “Open inspector” /
  “details editor” — that conflates Station Displays with History Band 3 /
  LineEdit. Law: source-of-truth.md → Displays vs inspector.
```


**Unbox overview dock — one elevated shell, fixed height.** The band floats
over the scroll canvas (`slicedActionDockWrapperClass({ docked: false })` +
`reserveScrollClearance`). **`UnboxDockHost` owns the only raised Panel** — a
fixed `h-11` entry row. Modes swap the **leading** zone (`entry` | `notes`);
opening Notes must never grow the Panel or mount a second card. Notes mode
swaps the step CTA for `UnboxDockNotesEntry` (single-line `receiving_line.notes`);
the toggle is an icon-only `FileText` `IconButton`. The carton terminal is always
`StationTerminalDock embedded` in the entry row (both modes). Support/Testing
Ticket *tabs* keep their always-on raised `OmnichannelComposerDock` + embedded
Reply. Unbox Ticket (detail-stack float) keeps the composer **inside** the card
via `SupportTicketDetail` — never a second canvas-absolute dock fighting the rail:

```
entry (R2 default):
┌─────────────────────────────────────────────────────────┐
│ [step CTA]              [FileText]  [ ▾ | 🖨 Print · Receive ] │
└─────────────────────────────────────────────────────────┘

notes (same h-11 — leading swaps; no height change):
┌─────────────────────────────────────────────────────────┐
│ [Item note (not printed)…] [FileText] [ ▾ | 🖨 Print · Receive ] │
└─────────────────────────────────────────────────────────┘
```

- `SlicedActionDock` `embedded` renders **only** the pill track (`h-9`,
  `rounded-xl`, no band padding / safe-area / absolute float) — the host control
  owns placement. `slicedActionDockWrapperClass()` is the pure placement SoT.
- Dock notes: Enter saves then fires the carton primary when provided; blur
  still saves. Tall `OmnichannelComposerDock` / insert rail are not in this band
  (PO-note display owns sync / insert chrome).
- The VM→dock mapping stays in `StationTerminalDock` (`embedded` prop) so the
  registry remains the single terminal path — never hand-thread `TerminalActionVm`
  fields into `SlicedActionDock` at a call site.
- `disabledReason` is the host's line above the dock band.
- **Never** mount a second `StationTerminalDock` band under the overview dock.
- **Never** stack a raised composer under the host Panel or change dock height
  for notes (guard: `unbox-dock-one-shell.guard.test.ts`).

`StationWorkbench` still accepts optional `toolbar` / `entityContext` for legacy
or non-identity chrome (e.g. Labels Queue/Print band, Triage recommendations
strip, Pickup product summary). Do **not** put `CartonContextCard` identity
there for Unbox-family stations — mount it in `StationContextBar` instead.

Overlays (photo peek, modals) compose **around** `StationWorkbench`, not inside it.

Unbox overview mounts the dock as an **absolute float over the canvas** via
`UnboxDockHost` + `slicedActionDockWrapperClass({ docked: false })` with the
Receive/Print split-CTA **inside** that shell — not a mid-canvas nested notes
card, not an in-flow shelf/lip band, and not a second CTA row beneath it. Label
preview stays in the scroll body. Other Unbox tabs keep a full-width centered
terminal.

---

## Introspective reuse (new station checklist)

1. Add one row to `WORKSPACE_MODES` only for receiving-family chrome; every docked adopter adds `STATION_TERMINAL_REGISTRY`
2. Thin adapter: controller → `CartonContextCard` props (omit optional claim/photos/classify/lifecycle/PO$)
3. Mount adapter in `StationContextBar` above `StationWorkbench`; Refresh (Testing: + Pair) in `StationMoreDetails` + embedded `StationHeaderToolbar` (Unbox: pane-anchor on the receiving pane host when Ticket can push). Lookup utilities → `/carton/[id]`
4. Tab defs with visibility gates → `buildSectionTabs()`
5. Terminal resolver in `{station}/terminal/` — tab id → `TerminalActionVm`
6. Compose `StationWorkbench` — never hand-roll `relative flex h-full min-h-0 flex-col`

Adding a tab = one registry row + one content component + one resolver branch.
Shell, bookmark chrome, slider chrome, and dock renderer stay untouched.

---

## Cross-station procedure port checklist (Tier A)

What a Tier-A bench must adopt to claim the instrument-panel procedure pattern. Identity:
[`instrument-panel.md`](instrument-panel.md). **Chrome guards can pass while the UX diverges** —
this list is the part the guards do not cover.

| # | Requirement | Status |
|---|---|---|
| 1 | A **single derivation hook** returning `ProcedureStepRow[]` + `activeKey` | **Must** — no bench may compute steps twice |
| 2 | Step order from a `deriveProcedureSteps`-shaped vocabulary SoT | **Must** — pinned by `src/lib/stations/procedure-divergence.guard.test.ts` |
| 3 | Active-step pointer via `resolveActiveStep` | **Must** — shared with the read model |
| 4 | Centre **focus deck** (`ProcedureDeck`) | **Must on `unbox-work` / derived-procedure benches**; **main Unbox exempt** (PO lines + label — see Unbox centre above) |
| 5 | **Realtime subscription** on the evidence channel | **Must** — P6; a lagging checklist is worse than none |
| 6 | Edge **checklist display** + **ring** as its only entry | **Must** — ring-only; no strip cell |
| 7 | Terminal action via `STATION_TERMINAL_REGISTRY` | **Must**, or a `TERMINAL_HAND_VM_ALLOWLIST` entry with a port follow-up |
| 8 | Ephemeral, entity-keyed focus store | **Must** — never a URL param |

**Unbox is the reference implementation of all eight.** Testing and Triage are the port targets;
port a bench in one change rather than adopting rows piecemeal, because rows 1 and 6 are only
coherent together — a checklist reading a second derivation is the exact failure the two-view model
exists to prevent.

**Tier B (Shipping, Pickup, Labels, Packer review) does not inherit this.** Those benches keep
the 720 column and `StationWorkbench`; whether they get a progress instrument at all is open (their
work is not a derived per-entity procedure, so the ring may have nothing honest to draw). **Pack**
is Tier A for Displays grammar but stays **ring-exempt** with its terminal-exempt dock (no sticky
procedure progress). Do not
port the ring to a Tier-B bench just for visual parity — a ring that always reads 0% or 100% is
chrome inventing a second story.

**Tier C (Support ticket, Support orders, Pack terminal) is exempt by documented exception** — do
not force Unbox chrome onto them.

### Porting gotcha — the export surface

`ProcedureDeckProps` and `ProcedureCardFace` are currently **module-private**, and
`ProcedureStepState` is not in the `procedure/` barrel. A porting bench must supply a `face()`
mapper whose return type it cannot yet import. **Export those in the same change that first consumes
them** — exporting ahead of a consumer adds a new knip finding and fails `npm run verify`.

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

Stacked overview cards and non-overview content tabs share one body pad via
`WorkspaceCard` `variant="glass"` + `bodyDensity="nested"` (`p-3`). Label inside
the procedure focus deck uses `WorkspaceLabelPreviewCard` `chrome="procedure"`
(bare face — Smart Stack evidence card owns the frame); Testing / non-deck hosts
keep `chrome="worksheet"` (default glass + nested). Inner white fields compose:

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

## Multi-section scroll host — floor ownership (Section Host)

**Ruled 2026-08-04** — `docs/todo/station-multi-section-scroll-host-RULING.md` (research:
`station-multi-section-scroll-host-GEMINI-RESEARCH-BRIEFING.md` +
`station-multi-section-scroll-host-MOTION-FINDINGS.md`). Extends **Scroll ownership**
(`ui-design-system.md`) and the Procedure Focus Deck law above with the host that will sit
**above** the deck once Items reference gains its own immersive triage mode. Industry name: an
**exclusive-disclosure panel system** — the VS Code Panel / Secondary Side Bar and the
Shopify POS cart-vs-grid shell are the closest named precedent: click a chrome header, it claims
the shared floor above a persistent bottom action plane, siblings collapse to chrome — never two
competing immersive scrollports, never a modal takeover.

- **Exactly one floor owner.** Named sections (`items`, `procedure`, …) each carry a **chrome**
  face (collapsed) and a **body** (floor). One `activeId` state value decides which section is
  immersive — same shape as Radix `Accordion.Root type="single"` (one value, one setter,
  `isOpen = activeId === id`), **not** its `height: auto` mechanism (below).
- **Default owner is `procedure`, never a split resting state.** The deck stays the hero at rest
  (prominence law, above) — WMS/POS directed-workflow precedent (Manhattan, Toast) keeps the
  active task dominant at rest; a permanently split view dilutes the one thing a focus-locked
  wedge operator should be looking at. Items immersive is a **transient, operator-invoked mode**,
  not a second resting state — compatible with "deck is the hero" the same way opening Displays
  is: it is a mode the operator chose, not a standing demotion (Square POS line-item overlay is
  the same shape — the checkout plane stays pinned underneath).
- **Mechanism: bare `layout` + `LayoutGroup`, never `layoutId`.** Each section is a flex/grid item
  whose size changes via a class/style swap (`flex-grow` or `grid-template-rows`), carrying
  Motion's `layout` (or `layout="position"`) prop; both sections wrap in one `LayoutGroup` so a
  re-render in one is visible to the other in the same frame (`react-layout-animations` docs —
  "Group layout animations"). **A shared-element (`layoutId`) full-screen modal/overlay is
  refused** — that is Motion's own closest canonical example (`app-store`) and it is the wrong
  grammar: a scrim takeover conflicts with the non-modal, always-visible-siblings requirement here.
  `AnimatePresence mode="popLayout"` does not apply either — sections never unmount (procedure
  steps stay evidence-derived and mounted; see Non-negotiable invariants).
- **Motion: reuse `motionRole.push.rail` (`motionBezier.layout`, 0.24s tween), do not mint a new
  duration.** This job — a panel that makes room for itself, tween not spring, because a sibling
  measures against the resulting size — is exactly `push.rail`'s stated job
  (`motion-crossfade.md`). Do **not** reach for a spring (overshoots the value the collapsing
  sibling's chrome height must land on) and do **not** share `procedure.advance`'s 0.55s (that is
  step-pointer content settle inside the Procedure section, a different job one layer down).
  Reduced motion: instant reflow, opacity-only fade (~0.1s) on the newly-immersive content.
- **Clearance stays a named fixed rem** (`STATION_TERMINAL_PAGER_SCROLL_CLEARANCE` = `10rem`,
  unchanged) — **never** a per-frame `ResizeObserver` on dock height; that thrashes layout and
  makes the stick point jump when the notes composer opens. When notes expand the dock band, swap
  to a second, larger named token — let the CSS transition, don't measure.
- **Collapsed chrome carries a minimum height of `56px` (`3.5rem`)**, not a bare 40px strip. A
  chrome row immediately above the dock is a Fitts's-Law hazard — too short and a "return to
  work" tap risks the dock's own CTA instead. Precedent: Spotify Now Playing bar, iOS Mail's
  bottom-anchored structural headers, both hold this floor. Give the collapsed face a clear
  state change (or a "back to Procedure" chevron) so a misclick reads as recoverable, not silent.
- **The wedge keeps focus. Full stop.** A section-expand control is a click target, never a focus
  target — do not `.focus()` into the newly-immersive section on expand. The scan bar's
  `useRegisterScanTarget` binding must survive every expand/collapse; the same "hand focus back"
  rule the Smart Stack's own controls already follow (`instrument-panel.md` — "Let the wedge own
  focus"). Keyboard: the chrome trigger itself is a normal Tab/Enter-reachable control (WCAG
  2.1.1) — that's the full a11y surface; it must not additionally steal or trap focus once
  activated.
- **Mobile ports the same definite-height contract, not a new one.** `min-h-0`/`flex-1` on
  `100dvh` is the same recipe Material bottom-sheets and iOS web full-screen routes already use;
  do not special-case the CSS contract for phone, only the chrome (full-screen route per section
  vs in-column chrome collapse is a layout *choice* the contract supports either way).

## Related

- Station scan contract: [`station.md`](station.md)
- Workbench (master–detail) contract: [`workbench.md`](workbench.md)
- Code: `src/components/station/workbench/`
- Entity header + bookmark chrome barrel: `src/components/station/entity-context/`
- Terminal registry: `src/lib/station-terminal/`
- Nested field SoT: `src/design-system/components/WorkspaceCard.tsx`
