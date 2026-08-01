# Station Workbench — Unbox-family display anatomy

The **Station Workbench** is the named SoT for right-pane unit work across Unbox,
Testing, Triage, Shipping, Packing, and Repair intake. It is the vertical
anatomy Unbox pioneered — not a layout skin, but a **region contract** for
I/O + persistence per layer.

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

- **`SupportTicketIdentity`** (`support/station/SupportTicketFocus.tsx`) — forked
  identity for a ticket entity; keeps the motion root, composes `StationAmbientWash`.
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
   only (two-line anatomy; SerialChip last-4 · clock · actor; raw `PREV → NEXT` omitted).
3. **Tracking** — full [`CarrierTrackingSection`](../../../src/components/sidebar/receiving/incoming-details/CarrierTrackingSection.tsx)
   (`stationCompact`: hero + events). Not shown on the Units spine.

PO path uses Incoming details; order/shipping uses journey `dim=tracking|order`.
Serials: explicit list or carton fetch via `useCartonSerials`.

**Unbox has NO tab strip in the workbench body.** The centre is the carton —
PO lines → label preview (`buildUnboxOverview`) — and the `tabs` slot is
deliberately empty. The step procedure is not in the centre either: it **IS**
the `checklist` display (`UnboxProcedureChecklist`), so a read-only status
display never takes the work surface's seat. Every other
display moved to the right-edge
**Displays** push column (`ReceivingDisplaysPushStack`): strip order
**Classify (unfound) | Listings (matched) · Units · Zoho · Checklist** (po-note
label from `providerCatalogLabel('zoho')` brand token) + ⋯ for Support /
Tracking / Timeline, with the `PairingTogglePill` pencil in the strip's
`rightSlot`. Tab list SoT = `buildUnboxSideTabs`; which one is showing (and
whether the column is open at all) = `resolveUnboxSideTab` — `null` IS closed,
so there is no second open flag to drift.

**Checklist is PRIMARY, not ⋯.** It was overflow while it was a hand-ticked
reference list; it derives the station's step states now, which makes it the
orienting "where am I" display, and an orienting display behind a menu costs two
clicks on every carton. **There is exactly ONE checklist in Unbox** — the
org-editable `checklist_templates` list and its `/api/checklists` CRUD were
deleted 2026-08-01. Do not add a second checklist surface, and do not re-derive
step order in a view: `deriveProcedureSteps` is the vocabulary SoT (hardcoding
the five steps breaks unfound, local pickup, returns and multi-qty).

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

---

## Vertical anatomy (top → bottom)

| Layer | Role | SoT |
|---|---|---|
| **1. Progress stepper** | Completeness checklist (Photos → Serial → Print), not a wizard lock | `LinearWorkflowStepper` + `deriveLinearStepStates` — lives in parent shell (`ReceivingLineWorkspace`), not inside `StationWorkbench` |
| **2. Station bookmark chrome** | Absolute-float identity shell + corner utilities over the work canvas (no in-flow gray band); top inset matches context-panel card gutter (`CONTEXT_PANEL_OUTER_MARGIN` → `top-2`) | `StationContextBar` (`stationContextBarHostClass`) + `StationMoreDetails` + `CartonContextCard` `density="bar"`; pair with `StationWorkbench` `reserveIdentityClearance`. **Unbox:** More details may mount on the **pane** outer host (same canvas top/right gutters + `z-raised`) beside Unbox + Ticket/Claim push — not inside the squeezed Unbox column — so Refresh stays at receiving-pane top-right when a push column opens. Share / Audit / Copy / Info live on `/carton/[id]`; Move photos on the photo gallery |
| **2a. Context rail collapse** | Every left context-rail card may park via the trailing **resize-edge** control (`HorizontalEdgeResizeHandle` `onCollapse` — same hover as the resize pill); slim expand strip restores it. Outset chrome hangs into **`CONTEXT_PANEL_HOST` shared ground** (wash+canvas behind rail + workspace + outset gutter) — not a panel `z-raised` fight with an opaque Unbox sibling. Width-drawer + localStorage — not a page-local twin | `CONTEXT_PANEL_COLLAPSE` + `ContextPanelLayout` + `HorizontalEdgeResizeHandle`; Unbox/Triage roots use `appWorkCanvasLayoutClass` |
| **2b. Mid-canvas edge jump** | Secondary surface jump (e.g. Triage → Open in Unbox) — not the terminal CTA | `StationRightEdgeAction` + `stationRightEdgeActionHostClass` on the panel `relative` root (~`top-1/4` right). Never nest under `moreDetails`; never use `SlicedActionDock` for this |
| **3. Section tabs** | Labeled section displays (`TabSwitch` strip + overflow menu) that own bar + mounted panels; `rightSlot` for contextual controls | `SectionTabsSlider` + `buildSectionTabs` + `PairingTogglePill` / `ExternalLinkPill`. **Unbox mounts this in the right-edge Displays push column, not here** — its workbench `tabs` slot is empty |
| **4. Tab body** | Whole contextual display per tab (form state survives via mounted panels) | Station-specific content. A tab-scoped action is a LOCAL control in its own body — never an imperative bridge feeding the dock (Unbox deleted all three) |
| **5. Feedback / footer** | Inline action feedback (scroll) + receive band (between body and dock) | `WorkspaceActionFeedbackSlot`, `ReceiveFeedbackRegion` |
| **6. Terminal dock band** | Optional chat-style notes composer + primary CTA (**tab-aware only where the registry slice says so — Unbox is not**) | `STATION_TERMINAL_REGISTRY` → `StationTerminalDock` → `SlicedActionDock`. **Unbox = ONE floating shell on every carton**: `StationComposerDock` via `slicedActionDockWrapperClass({ docked: false })` (absolute over the canvas + `reserveScrollClearance`) with the CTA in its `trailingAction` (`<StationTerminalDock embedded>`), blue Send suppressed. **Unbox Displays / Ticket / Claim / tool** are right-edge push columns composing `UnboxPushColumn` (not canvas docks / not RightRailHost floats). Leading-edge `onCollapse` hides them; when none is open the parked strip (`ReceivingPushExpandStrip`) carries Show displays + a linked-ticket restore (`ReceivingTicketExpandControl`). Canvas gutter matches bookmark / context-panel `m-2`. Support/Testing Ticket *tabs* (when present) still use `SupportTicketComposerDock` + `SupportChatComposer` `variant="station-dock"`. Full-width in-flow band elsewhere |

```
Parent shell (Unbox = pane outer: Unbox column + optional push column)
├── StationContextBar          ← absolute-float identity (Unbox column)
├── StationMoreDetails         ← pane-anchored (canvas top/right gutters + z-raised on pane host)
│                                  so Ticket push does not slide it left
├── StationRightEdgeAction     ← optional mid-canvas jump (Triage Open in Unbox); panel-root absolute
└── StationWorkbench           ← reserveIdentityClearance (top) + terminal clearance (bottom)
    ├── scroll: children → feedback  (Unbox: `tabs` EMPTY — the carton overview
    │                                 is the whole body; entityContext/toolbar
    │                                 unused for Unbox-family)
    ├── footer (optional sticky band)
    └── dock                   ← Unbox / Support Ticket: StationComposerDock
                                 floating over the canvas (absolute; not an
                                 in-flow shelf) with embedded CTA in
                                 trailingAction; tab-aware stations: full-width
                                 StationTerminalDock

Right edge (exactly one at a time, LineEditPanel wires the exclusion):
  Claim ▸ Ticket ▸ tool ▸ Displays ▸ parked expand strip
  — all four columns compose UnboxPushColumn
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
- `StationComposerDock` `trailingAction` suppresses the blue Send; **Enter and
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
`StationComposerDock` + `slicedActionDockWrapperClass({ docked: false })`
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
| Overview Notes + Label preview | Notes: dock `StationComposerDock` via `WorkspaceNotesCard`; label: `UnboxLabelPreview` in scroll | `StationComposerDock`; glass worksheets for label / other tabs via `WorkspaceCard` `bodyDensity="nested"` + `WORKSPACE_NESTED_FIELD*` |
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

Unbox overview carton notes use **`StationComposerDock`** floating over the
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
