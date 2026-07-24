/**
 * Config for the Station Workbench chrome ratchet guards
 * (`station-workbench-chrome.guard.test.ts`).
 *
 * The Unbox right-pane (`LineEditPanel`) is the golden **Station Workbench**.
 * Sibling stations (Triage / Testing / Shipping / Pack / Pickup / Labels /
 * Support / Review / Repair) must compose the same chrome SoT — never invent a
 * second layout language. These census/positive guards fail CI when a station
 * panel drifts (wrong column width, copied ambient wash, hand-rolled terminal
 * dock, or a right-pane that skips `StationWorkbench`).
 *
 * Ratchet discipline (root `AGENTS.md`): baselines only **shrink**. Never raise
 * a count to make a port pass — migrate onto the SoT or mark a genuine one-off
 * with the documented same-line escape marker.
 *
 * Full rule: `.claude/rules/display/station-workbench.md`.
 */

/**
 * Station right-pane adopter directories (relative to `src/`). The column-width
 * (A) / panel-root (C) / terminal-path (E) census walks these. The SoT
 * primitives under `components/station/**` are deliberately excluded — they
 * *define* the fingerprints these guards ratchet elsewhere.
 */
export const STATION_FAMILY_ROOTS = [
  'components/receiving',
  'components/tech',
  'components/packer',
  'components/outbound/labels',
  'components/repair',
  'components/work-orders',
  'components/support/station',
  'components/support/orders',
  'features/review',
] as const;

// ── Guard A — column width ratchet ────────────────────────────────────────────
/** Same-line (or line-above) marker for a genuine non-column `max-w-3xl` use. */
export const MAX_W_3XL_ESCAPE = 'ds-station-max-w-exempt';
/**
 * Current `max-w-3xl` offenders in station-family dirs, all documented Shipping
 * port follow-ups (`docs/todo/station-workbench-port-FOLLOWUPS.md`):
 *   - components/tech/ActiveOrderWorkspace.tsx      (Shipping host body)
 *   - components/tech/shipping/terminal/shipping-terminal.tsx (dock maxWidth)
 * Shrink-only. Never raise. Migrate onto `STATION_WORKBENCH_*` from
 * `workbench-layout.ts`.
 */
export const MAX_W_3XL_BASELINE = 2;

// ── Guard B — ambient wash single home ────────────────────────────────────────
/** 3-blob wash fingerprint. After extraction it lives only in StationAmbientWash. */
export const AMBIENT_WASH_FINGERPRINT = 'bg-blue-400/[0.08]';
/** Exactly 1 non-comment occurrence: `StationAmbientWash.tsx` (the SoT). */
export const AMBIENT_WASH_BASELINE = 1;

// ── Guard C — panel-root hand-roll ────────────────────────────────────────────
/** Exact panel-root className the SoT `StationPanelRoot` owns. */
export const PANEL_ROOT_FINGERPRINT = 'relative flex h-full min-h-0 flex-col bg-surface-canvas"';
/**
 * Remaining station-family hand-rolls: `outbound/labels/LabelsOrderWorkspace.tsx`
 * (Tier B port follow-up). Shrink-only — migrate onto `StationPanelRoot`.
 */
export const PANEL_ROOT_BASELINE = 1;

// ── Guard D — StationWorkbench adoption (positive assertion) ───────────────────
/**
 * Tier A/B right-pane panels that MUST compose `StationWorkbench` (or
 * `StationPanelRoot`). Paths relative to `src/`.
 */
export const STATION_WORKBENCH_REQUIRED = [
  'components/receiving/workspace/LineEditPanel.tsx',
  'components/receiving/triage/TriagePanel.tsx',
  'components/tech/TestingPanel.tsx',
  'components/outbound/labels/LabelsOrderWorkspace.tsx',
  'features/review/packer/PackerReviewMode.tsx',
  'components/packer/PackOrderPanel.tsx',
  'components/support/orders/SupportOrdersWorkspace.tsx',
] as const;
/**
 * Documented adoption gaps (port follow-ups) — station chrome but not yet on
 * `StationWorkbench`. Not asserted; listed so the exemption is explicit.
 *   - components/tech/shipping/ShippingScanWorkspace.tsx (until host fold)
 *   - components/tech/ActiveOrderWorkspace.tsx           (Shipping host)
 *   - components/repair/RepairIntakeForm.tsx             (until remount)
 */
export const STATION_WORKBENCH_ADOPTION_EXEMPT = [
  'components/tech/shipping/ShippingScanWorkspace.tsx',
  'components/tech/ActiveOrderWorkspace.tsx',
  'components/repair/RepairIntakeForm.tsx',
] as const;

// ── Guard E — terminal path ───────────────────────────────────────────────────
/**
 * Files that mount `<StationTerminalDock` with a HAND-BUILT `TerminalActionVm`
 * (not `useStationTerminalAction` + `STATION_TERMINAL_REGISTRY`). Each is a
 * documented registry gap (Labels / Support ticket / Packer review). Paths
 * relative to `src/`. New docks must go through the registry — do not extend
 * this list without a port follow-up entry.
 */
export const TERMINAL_HAND_VM_ALLOWLIST = [
  'features/review/packer/PackerReviewMode.tsx',
  'components/support/station/SupportTicketFocus.tsx',
  'components/outbound/labels/LabelsOrderWorkspace.tsx',
] as const;

// ── Documented identity fork (rules-only, see station-workbench.md) ───────────
/**
 * The single sanctioned condensed-identity fork that does NOT compose
 * `CartonContextCard` (ticket ≠ carton). Never add a second — new station
 * identity composes the entity-context adapters.
 */
export const IDENTITY_FORK_ALLOWLIST = ['SupportTicketIdentity'] as const;

// ── Guard G — terminal modes without header chrome ────────────────────────────
/**
 * `TerminalWorkspaceMode`s that own a terminal dock but intentionally have NO
 * `WORKSPACE_MODES` header-toolbar chrome row. Every terminal mode must be
 * either in `WORKSPACE_MODES` (Unbox-family header chrome) or here.
 */
export const TERMINAL_MODES_WITHOUT_HEADER_CHROME = ['shipping', 'repair', 'pickup'] as const;
