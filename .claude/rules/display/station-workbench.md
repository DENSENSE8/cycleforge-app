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
  — it is skeleton/stepper padding only.
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

Unbox replaced the former Tracking tab with Timeline. Unbox primary strip order:
**Unbox · Listings · Ticket · Units · Zoho** (po-note label from
`providerCatalogLabel('zoho')` brand token) + ⋯ for Checklist / Support /
Tracking / Timeline. Neither Support nor Ticket mounts the Linkage strip
(link from entity chrome / console drawer). Packing is terminal-registry-exempt
(no sticky dock).

---

## Vertical anatomy (top → bottom)

| Layer | Role | SoT |
|---|---|---|
| **1. Progress stepper** | Completeness checklist (Photos → Serial → Print), not a wizard lock | `LinearWorkflowStepper` + `deriveLinearStepStates` — lives in parent shell (`ReceivingLineWorkspace`), not inside `StationWorkbench` |
| **2. Station bookmark chrome** | Sticky identity bookmark + corner utilities flush under GlobalHeader | `StationContextBar` + `StationMoreDetails` + `CartonContextCard` `density="bar"` via `@/components/station/entity-context` |
| **2b. Mid-canvas edge jump** | Secondary surface jump (e.g. Triage → Open in Unbox) — not the terminal CTA | `StationRightEdgeAction` + `stationRightEdgeActionHostClass` on the panel `relative` root (~`top-1/4` right). Never nest under `moreDetails`; never use `SlicedActionDock` for this |
| **3. Section tabs** | Labeled section displays (`TabSwitch` strip + overflow menu) that own bar + mounted panels; `rightSlot` for contextual controls | `SectionTabsSlider` + `buildSectionTabs` + `PairingTogglePill` / `ExternalLinkPill` |
| **4. Tab body** | Whole contextual display per tab (form state survives via mounted panels) | Station-specific content; bridges register dock state |
| **5. Feedback / footer** | Inline action feedback (scroll) + receive band (between body and dock) | `WorkspaceActionFeedbackSlot`, `ReceiveFeedbackRegion` |
| **6. Terminal dock band** | Optional chat-style notes composer + tab-aware primary CTA | `STATION_TERMINAL_REGISTRY` → `StationTerminalDock` → `SlicedActionDock`. **Unbox overview = ONE shell**: `StationComposerDock` with the CTA in its `trailingAction` (`<StationTerminalDock embedded>`), blue Send suppressed. Full-width band elsewhere |

```
Parent shell
├── StationContextBar          ← identity (density=bar) + StationMoreDetails (embedded LineEditToolbar)
├── StationRightEdgeAction     ← optional mid-canvas jump (Triage Open in Unbox); panel-root absolute
└── StationWorkbench
    ├── scroll: tabs → feedback  (entityContext/toolbar unused for Unbox-family)
    ├── footer (optional sticky band)
    └── dock                   ← overview: StationComposerDock (notes) with the
                                 embedded Receive/Print split in trailingAction;
                                 other tabs: full-width StationTerminalDock
```

**Unbox overview dock — one elevated shell, never two cards.** The composer is
the only surface in the band; the receive split-CTA rides in its footer:

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

Unbox overview mounts carton notes in the **dock band** via `StationComposerDock`
(ChatGPT-style prompt chrome) with the Receive/Print split-CTA **inside** that
composer's footer (`trailingAction`) — not a mid-canvas nested notes card, and
not a second CTA row beneath it. Label preview stays in the scroll body. Other
Unbox tabs keep a full-width centered terminal.

---

## Introspective reuse (new station checklist)

1. Add one row to `WORKSPACE_MODES` only for receiving-family chrome; every docked adopter adds `STATION_TERMINAL_REGISTRY`
2. Thin adapter: controller → `CartonContextCard` props with `density="bar"`
3. Mount adapter in `StationContextBar` above `StationWorkbench`; utilities in `StationMoreDetails` + embedded `StationHeaderToolbar`
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

Unbox overview carton notes use **`StationComposerDock`** in the terminal dock
band (not nested-field chrome).

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
