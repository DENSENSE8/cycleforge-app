/** Config for the Station Workbench chrome ratchet guards (`station-workbench-chrome.guard.test.ts`). */

/** Displays-push tier status (scan-station Displays SoT — `docs/todo/scan-station-displays-sot-PROMPT.md`). */

/** Station right-pane adopter directories (relative to `src/`). */
const STATION_FAMILY_ROOTS = [
  'components/receiving',
  'components/tech',
  'components/packer',
  'components/outbound/labels',
  'components/repair',
  'components/work-orders',
  'components/support/service-workspace',
  'components/support/orders',
  'features/review',
] as const;

// ── Guard A — column width ratchet ────────────────────────────────────────────
/** Same-line (or line-above) marker for a genuine non-column `max-w-3xl` use. */
const MAX_W_3XL_ESCAPE = 'ds-station-max-w-exempt';
/** Zero since the Shipping host fold (2026-07-28): */
const MAX_W_3XL_BASELINE = 0;

// ── Guard B — ambient wash single home ────────────────────────────────────────
/** 3-blob wash fingerprint. After extraction it lives only in StationAmbientWash. */
const AMBIENT_WASH_FINGERPRINT = 'bg-blue-400/[0.08]';
/** Exactly 1 non-comment occurrence: `StationAmbientWash.tsx` (the SoT). */
const AMBIENT_WASH_BASELINE = 1;

// ── Guard C — panel-root hand-roll ────────────────────────────────────────────
/**
 * Exact panel-root className the SoT `StationPanelRoot` owns. The plane went
 * white on 2026-08-30 (operator ruling) — see `StationPanelRoot`'s docblock.
 */
const PANEL_ROOT_FINGERPRINT = 'relative flex h-full min-h-0 flex-col bg-surface-canvas';
/**
 * Remaining station-family hand-rolls: none (Labels · Pack · Review compose
 * `StationPanelRoot`). Shrink-only — never raise.
 */
const PANEL_ROOT_BASELINE = 0;

// ── Guard D — StationWorkbench adoption (positive assertion) ───────────────────
/**
 * Tier A/B right-pane panels that MUST compose `StationWorkbench` (or
 * `StationPanelRoot`). Paths relative to `src/`.
 */
const STATION_WORKBENCH_REQUIRED = [
  'components/receiving/workspace/LineEditPanel.tsx',
  'components/receiving/triage/TriagePanel.tsx',
  'components/tech/TestingPanel.tsx',
  'components/tech/ActiveOrderWorkspace.tsx',
  'features/review/packer/PackerReviewMode.tsx',
  'components/packer/PackOrderPanel.tsx',
  'components/support/orders/SupportOrdersFocusHost.tsx',
] as const;

/** Identity adapters that compose `CartonContextCard`. */
const STATION_CARTON_IDENTITY_ADAPTERS = [
  'components/receiving/workspace/line-edit/LineCartonContextSection.tsx',
  'components/tech/testing-panel/TestingCartonHeader.tsx',
  'components/tech/shipping/ShippingEntityContextHeader.tsx',
  'components/packer/PackOrderIdentity.tsx',
  'features/review/packer/ReviewOrderIdentity.tsx',
  'components/station/order/OrderStationIdentity.tsx',
] as const;
/** Documented adoption gaps (port follow-ups) — station chrome but not yet on `StationWorkbench`. */
const STATION_WORKBENCH_ADOPTION_EXEMPT = [
  'components/repair/RepairIntakeForm.tsx',
] as const;

/** Surfaces that sit in the **Scan Stations** spine section but are deliberately NOT Station column-shell members — declared, not drifting… */
const NON_STATION_COLUMN_SURFACES = [
  'components/repair/RepairIntakeForm.tsx',
] as const;

// ── Guard E — terminal path ───────────────────────────────────────────────────
/** Files that mount `<StationTerminalDock` with a HAND-BUILT `TerminalActionVm` (not `useStationTerminalAction` + `STATION_TERMINAL_REGISTRY`). */
const TERMINAL_HAND_VM_ALLOWLIST = [
  'features/review/packer/PackerReviewMode.tsx',
  'components/support/service-workspace/SupportTicketFocus.tsx',
] as const;

// ── Documented identity fork (rules-only, see station-workbench.md) ───────────
/** Condensed-identity forks that do NOT compose `CartonContextCard`. */
const IDENTITY_FORK_ALLOWLIST = [] as const;

// ── Guard G — terminal modes without header chrome ────────────────────────────
/**
 * `TerminalWorkspaceMode`s that own a terminal dock but intentionally have NO
 * `WORKSPACE_MODES` row. Every terminal mode must be either in `WORKSPACE_MODES`
 * (Unbox-family nav + terminal slice) or here.
 */
export const TERMINAL_MODES_WITHOUT_HEADER_CHROME = ['shipping', 'repair', 'pickup'] as const;

// ── Guard I — scan-station edge-to-edge middle measure (Unbox golden) ─────────
/**
 * Same-line (or line-above) marker for a genuine non-measure `max-w-[720px]` /
 * `mx-auto` use inside a scan-station panel (icon centering, empty-state glyph,
 * etc.). Never use this to keep a centered content column — that is debt.
 */
const STATION_EDGE_MEASURE_ESCAPE = 'ds-station-edge-measure-exempt';

/** Scan-station right panes watched by the edge-to-edge middle-measure ratchet (`station-edge-measure.guard.test.ts`). */
const SCAN_STATION_EDGE_MEASURE_PANELS = [
  'components/receiving/workspace/LineEditPanel.tsx',
  'components/receiving/triage/TriagePanel.tsx',
  'components/tech/TestingPanel.tsx',
  'components/tech/ActiveOrderWorkspace.tsx',
  'components/packer/PackOrderPanel.tsx',
  'features/review/packer/PackerReviewMode.tsx',
] as const;

/** Panels in {@link SCAN_STATION_EDGE_MEASURE_PANELS} that do **not** yet compose `STATION_WORKBENCH_COLUMN`. */
const SCAN_STATION_EDGE_MEASURE_MISSING_BASELINE = 4;

/** Remaining local `max-w-[720px]` hits in {@link SCAN_STATION_EDGE_MEASURE_PANELS} that are not yet migrated (e.g. */
const SCAN_STATION_LOCAL_720_MAX_BASELINE = 0;
