# Tier 3 — frame twins (the real blocker)

**135 page-local parts stand against one Unbox frame.** These are not dead — they are *alive and
duplicated*, which is worse. knip will never report a single one of them.

## The census

| Twin family | Count | The one SoT they should compose |
|---|---|---|
| `*Sidebar.tsx` / `*SidebarPanel.tsx` | **45** | `ContextPanelLayout` (`src/components/sidebar/ContextPanelLayout.tsx`) |
| `*Workspace.tsx` / `*WorkspaceView.tsx` | **54** | `UnboxWorkspaceView` / `WorkbenchSheetView` |
| `*DetailsPanel.tsx` / `*DetailPanel.tsx` | **16** | `RightRailHost` occupant (`src/components/right-rail/`) |
| `*WorkspaceHeader.tsx` | **14** | `UnboxWorkspaceHeader` / `WorkbenchChromeHeader` |
| `*ChromeActions.tsx` | **6** | `WorkbenchChromeHeader` action slot |

### The 14 workspace headers, verbatim

`UnboxWorkspaceHeader` (SoT) · `HistoryWorkspaceHeader` · `IncomingWorkspaceHeader` ·
`TriageWorkspaceHeader` · `OutboundWorkspaceHeader` · `PackWorkspaceHeader`* ·
`ShippingWorkspaceHeader` · `TestingWorkspaceHeader` · `RepairWorkspaceHeader`* ·
`FbaWorkspaceHeader` · `LabelsWorkspaceHeader` · `LabelsProductsWorkspaceHeader` ·
`LocationsWorkspaceHeader` · `PhotoLibraryWorkspaceHeader`

\* already knip-dead — see [`01`](01-tier1-provably-dead.md).

### The 6 chrome-action twins

`OutboundOrderChromeActions` · `ReceivingBoxChromeActions` · `IncomingChromeActions` ·
`SupportTicketChromeActions` · `RepairChromeActions`\* · `PickupChromeActions`\*

## Confirmed forks worth killing first

### 1. Two components both named `SidebarShell`

| Path | Lines | Importers |
|---|---|---|
| `src/components/layout/SidebarShell.tsx` | 128 | **22** |
| `src/components/sidebar/SidebarShell.tsx` | 49 | **1** (`DashboardSidebar.tsx`) |

Same name, two files, two directories, one letter of import path apart. Nothing prevents the next
agent from importing the wrong one, and nothing would fail if they did. **Rename or merge — this
is a live foot-gun, not a style issue.**

### 2. `InventoryInspectorRail` — a dead right-rail twin

`src/components/inventory/InventoryInspectorRail.tsx` (+ `useInventoryOpenParam`) is a
page-local inspector rail with **zero importers**. It is the exact fork the house law bans, and it
already rotted. Delete with tier 1; cite it when someone proposes the next one.

### 3. `ToShipRecentRail` — a deliberate rail fork

`src/components/outbound/orders/to-ship/ToShipRecentRail.tsx:7` documents itself as
*"Scoped to the desk body — not the global ContextPanelLayout rail (Pattern E)"*. This is the
single highest-value twin to collapse, because `/shipping/orders` is the first port target.
See [`05-toship-port-spec.md`](05-toship-port-spec.md).

## The law this violates

`AGENTS.md`: *"Compose from the named SoT first; grow it when wrong. Never fork a page-local twin.
Feature routes import the assembly, not its internals."*

`pattern-evolution.md` allows a **new sibling that composes the shared primitive** when the job
genuinely differs — that is growth, not a fork. So the audit question for each of the 135 is one
question, not a judgment call:

> **Does this twin compose the SoT underneath, or does it reimplement it?**

Reimplements → kill and mount the SoT. Composes → keep, and record why in its `@justification`
docblock (already a required tag for new feature assemblies, guarded by
`src/lib/governance/domain-job.guard.test.ts`).

## Why `jscpd` did not catch these

The clone gate filters station-vs-support clones rather than merging them, and these twins are
AST-*similar* but not identical — different prop names over the same structure. The gate is
working as configured; it was never the instrument for this. **Only the per-twin question above
resolves it.**
