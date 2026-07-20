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
```

Reference implementation: `LineEditPanel` (Unbox). Sibling adopters:
`TestingPanel`, `TriagePanel`, `ShippingScanWorkspace` / `UpNextActionDock`,
`PackOrderPanel`, `RepairIntakeForm`, `LocalPickupEditPanel`.

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

Unbox replaced the former Tracking tab with Timeline. Support (team notes /
activity) and Ticket (customer helpdesk) are sibling SectionTabsSlider tabs —
Ticket sits to the right of Support; neither mounts the Linkage strip (link from
entity chrome / console drawer). Packing is terminal-registry-exempt (no sticky dock).

---

## Vertical anatomy (top → bottom)

| Layer | Role | SoT |
|---|---|---|
| **1. Progress stepper** | Completeness checklist (Photos → Serial → Print), not a wizard lock | `LinearWorkflowStepper` + `deriveLinearStepStates` — lives in parent shell (`ReceivingLineWorkspace`), not inside `StationWorkbench` |
| **2. Utility toolbar** | Frozen icon bar: refresh, share, overflow, prev/next, details | `LineEditToolbar` + `WORKSPACE_MODES` |
| **3. Entity context** | One-row identity + inline actions (listing · PO# · tracking · claim · photos); bar density opens classify in a below-chrome strip so pills never fight the nowrap identity row | `CartonContextCard` via `@/components/station/entity-context` + station adapters |
| **4. Section tabs** | Icon-pill slider that owns bar + mounted panels; `rightSlot` for contextual controls | `SectionTabsSlider` + `buildSectionTabs` + `PairingTogglePill` / `ExternalLinkPill` |
| **5. Tab body** | Whole contextual display per tab (form state survives via mounted panels) | Station-specific content; bridges register dock state |
| **6. Feedback / footer** | Inline action feedback (scroll) + receive band (between body and dock) | `WorkspaceActionFeedbackSlot`, `ReceiveFeedbackRegion` |
| **7. Terminal dock** | Tab-aware primary CTA (mobile-style FloatingButton) | `STATION_TERMINAL_REGISTRY` → resolver → `useStationTerminalAction` → `StationTerminalDock` |

```
ReceivingLineWorkspace (stepper)
└── StationWorkbench
    ├── toolbar
    ├── scroll: entityContext → tabs → feedback
    ├── footer (optional sticky band)
    └── dock
```

Overlays (photo peek, modals) compose **around** `StationWorkbench`, not inside it.

---

## Introspective reuse (new station checklist)

1. Add one row to `WORKSPACE_MODES` only for receiving-family chrome; every docked adopter adds `STATION_TERMINAL_REGISTRY`
2. Thin adapter: controller → `CartonContextCard` props
3. Tab defs with visibility gates → `buildSectionTabs()`
4. Terminal resolver in `{station}/terminal/` — tab id → `TerminalActionVm`
5. Compose `StationWorkbench` — never hand-roll `relative flex h-full min-h-0 flex-col`

Adding a tab = one registry row + one content component + one resolver branch.
Shell, toolbar, entity header, slider chrome, and dock renderer stay untouched.

---

## What stays station-specific

| Concern | Local | Shared waist |
|---|---|---|
| Form state / handlers | Controllers (`useUnboxLineController`, …) | — |
| Tab content bodies | Domain cards | `WorkspaceCard`, `SectionTabsSlider` |
| Terminal VM assembly | `resolveUnboxTerminal`, … | Registry + `StationTerminalDock` |
| Step gate inputs | Photo count, serial, label printed | `deriveLinearStepStates` walk |
| Entity field wiring | Classify, linked order | `CartonContextCard` props |

---

## Related

- Station scan contract: [`station.md`](station.md)
- Workbench (master–detail) contract: [`workbench.md`](workbench.md)
- Code: `src/components/station/workbench/`
- Entity header barrel: `src/components/station/entity-context/`
- Terminal registry: `src/lib/station-terminal/`
