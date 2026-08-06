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
 * Displays-push tier status (scan-station Displays SoT —
 * `docs/todo/scan-station-displays-sot-PROMPT.md`). A Tier-A station's centre is
 * its LINES display (PO items / unfound); its reference tools — Pairing/Linkage ·
 * Classify · Staging · Ticket · Photos — live on the right-edge Displays push,
 * never a centre `SectionTabsSlider` strip. Arrival carve-out: Classify · Staging
 * stack under items in the centre; Displays = Pairing only.
 *
 *   - Unbox   (`LineEditPanel`)  — DONE (golden). `ReceivingDisplaysPushStack`.
 *   - Arrival (`TriagePanel`)    — DONE (carve-out 2026-08-06): centre = items
 *                                  (`POUnboxingSection`, Unbox-parity) + Classify
 *                                  + Staging stacked under items; Pairing only
 *                                  on `arrival-displays-push`. Guard:
 *                                  `receiving/triage/arrival-displays-push.guard.test.ts`.
   *   - Testing (`TestingPanel`)   — DONE (Phase E complete): centre = testing
   *                                  work (PO lines · UnboxLabelPreview);
   *                                  dock = carton item/label notes + Pass ·
   *                                  Print (never swapped for ticket reply);
   *                                  Ticket · SKU Pairing · Checklist · Manuals ·
   *                                  Timeline · carton Linkage on
   *                                  `testing-displays-push` (ticket composer
   *                                  inline in Ticket body). Flow identity +
   *                                  Open displays. Guard:
   *                                  `testing-flush-display.guard.test.ts`.
 *   - Pack    (`PackOrderPanel`) — DONE (2026-08-06): centre = checklist /
 *                                  UNIT peek; Ticket · Photos · Support ·
 *                                  Timeline on `pack-displays-push`. Guard:
 *                                  `packer/pack-displays-push.guard.test.ts`.
 *                                  Still terminal-exempt (no sticky dock).
 *   - Labels  (`LabelsOrderWorkspace`) — StationPanelRoot + flush centre tabs
 *                                  (Print · Documents · Timeline stay mid-canvas;
 *                                  not Displays push). Guard: phase-f Labels
 *                                  flush assert.
 *   - Shipping (`ActiveOrderWorkspace`) — DONE (Phase F): centre = Ship · Units;
 *                                  Timeline on `shipping-displays-push`.
 *   - Packer review (`PackerReviewMode`) — DONE (Phase F): centre = Note;
 *                                  Photos · Tracking · Timeline on
 *                                  `pack-review-displays-push`.
 *
 * These are the census members whose panels compose the shared Displays host; the
 * width / ambient-wash / panel-root / terminal ratchets below are orthogonal and
 * stay green through the port.
 */

/**
 * Station right-pane adopter directories (relative to `src/`). The column-width
 * (A) / panel-root (C) / terminal-path (E) census walks these. The SoT
 * primitives under `components/station/**` are deliberately excluded — they
 * *define* the fingerprints these guards ratchet elsewhere.
 *
 * `components/support/service-workspace` is **not** Station family — Support is
 * Workbench branch `service-workspace`
 * (`.claude/rules/display/workbench-service.md`). It stays in this census only
 * because `SupportTicketFocus` still mounts `StationTerminalDock`, so Guard E
 * must keep seeing it. Dropping the row on the directory rename (it was
 * `components/support/station`) would have silently retired that coverage —
 * which is the failure mode a rename is most likely to cause. Remove it when
 * the dock leaves, not before.
 */
export const STATION_FAMILY_ROOTS = [
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
export const MAX_W_3XL_ESCAPE = 'ds-station-max-w-exempt';
/**
 * Zero since the Shipping host fold (2026-07-28): `ActiveOrderWorkspace` now
 * composes `StationPanelRoot` + `StationContextBar` + `StationWorkbench`, and
 * the shipping dock track matches the 720 column. Shrink-only. Never raise —
 * migrate onto `STATION_WORKBENCH_*` from `workbench-layout.ts`.
 */
export const MAX_W_3XL_BASELINE = 0;

// ── Guard B — ambient wash single home ────────────────────────────────────────
/** 3-blob wash fingerprint. After extraction it lives only in StationAmbientWash. */
export const AMBIENT_WASH_FINGERPRINT = 'bg-blue-400/[0.08]';
/** Exactly 1 non-comment occurrence: `StationAmbientWash.tsx` (the SoT). */
export const AMBIENT_WASH_BASELINE = 1;

// ── Guard C — panel-root hand-roll ────────────────────────────────────────────
/** Exact panel-root className the SoT `StationPanelRoot` owns. */
export const PANEL_ROOT_FINGERPRINT = 'relative flex h-full min-h-0 flex-col bg-surface-sunken';
/**
 * Remaining station-family hand-rolls: none (Labels · Pack · Review compose
 * `StationPanelRoot`). Shrink-only — never raise.
 */
export const PANEL_ROOT_BASELINE = 0;

// ── Guard D — StationWorkbench adoption (positive assertion) ───────────────────
/**
 * Tier A/B right-pane panels that MUST compose `StationWorkbench` (or
 * `StationPanelRoot`). Paths relative to `src/`.
 */
export const STATION_WORKBENCH_REQUIRED = [
  'components/receiving/workspace/LineEditPanel.tsx',
  'components/receiving/triage/TriagePanel.tsx',
  'components/tech/TestingPanel.tsx',
  'components/tech/ActiveOrderWorkspace.tsx',
  'components/outbound/labels/LabelsOrderWorkspace.tsx',
  'features/review/packer/PackerReviewMode.tsx',
  'components/packer/PackOrderPanel.tsx',
  'components/support/orders/SupportOrdersFocusHost.tsx',
] as const;
/**
 * Documented adoption gaps (port follow-ups) — station chrome but not yet on
 * `StationWorkbench`. Not asserted; listed so the exemption is explicit.
 *   - components/repair/RepairIntakeForm.tsx             (see below)
 *
 * `ShippingScanWorkspace` left this list in the 2026-07-28 host fold: it is no
 * longer a panel root at all, just the `tabs` slot composer its host mounts.
 *
 * **`RepairIntakeForm`'s exemption now has an exit** (2026-08-02). It read
 * "until remount", which is a condition with no owner and no date — the
 * flag-lifecycle smell in another costume (`backend-patterns.md`: every flag
 * declares an owner and an ending). Restated as a fact instead: the form is an
 * INTAKE surface, so it is not a `StationWorkbench` gap at all — see
 * {@link NON_STATION_COLUMN_SURFACES}. It stays listed here only so the guard's
 * exemption keeps a home; the reason it is exempt is now written down.
 */
export const STATION_WORKBENCH_ADOPTION_EXEMPT = [
  'components/repair/RepairIntakeForm.tsx',
] as const;

/**
 * Surfaces that sit in the **Scan Stations** spine section but are deliberately
 * NOT Station column-shell members — declared, not drifting (2026-08-02).
 *
 * The handoff that produced this list asked for one thing: decide explicitly,
 * because "Pickup and Repair compose nothing" reads identically whether it is a
 * gap or a choice. Measured, both compose **zero** station chrome — no
 * `StationWorkbench`, no `StationContextBar`, no `CartonContextCard`. They never
 * joined the family, so they are not drifting from it.
 *
 *   - ~~`receiving/pickup/PickupWorkspace.tsx`~~ — **removed 2026-08-03.** Local
 *     Pickup grew a focus-locked Station scan loop (`PickupScanBand` + New
 *     Pickup CTA). Right pane remains Workbench ops-queue (`LedgerGrid`);
 *     Station column shell (`StationWorkbench` + context bar) lands when a
 *     focus pane / carton procedure opens — not required for scan+CTA alone.
 *   - `repair/RepairIntakeForm.tsx` — an intake FORM. Its job is creating a
 *     ticket that does not exist yet, so there is no active entity for an
 *     identity bookmark to name, and `SidebarIntakeFormShell`-family chrome is
 *     the correct grammar (`display/right-rail-inspector.md` → two chrome
 *     families).
 *
 * **The exit is a scan bar, not a refactor.** If a listed surface grows a
 * focus-locked scan loop over one transient entity, Q1 of `pickArchetype` fires
 * and it becomes a Station — at which point it composes `StationWorkbench` +
 * `StationContextBar` through a thin adapter like every sibling, and its entry
 * here is deleted. Until then, porting station chrome onto them would be the
 * "lobotomized work chrome" anti-pattern (`pattern-evolution.md` Always #5):
 * station panels with the station stripped out.
 *
 * **Asserted** (Guard H) — a declaration that nothing checks is the prose
 * retirement `pattern-evolution.md` Always #6 exists to ban, and this one is
 * checkable in both directions: the files must exist, and they must compose no
 * station chrome. Porting a bookmark onto a listed surface therefore fails CI
 * until the entry is deleted, which is the point — the deletion IS the decision.
 */
export const NON_STATION_COLUMN_SURFACES = [
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
  'components/support/service-workspace/SupportTicketFocus.tsx',
  'components/outbound/labels/LabelsOrderWorkspace.tsx',
] as const;

// ── Documented identity fork (rules-only, see station-workbench.md) ───────────
/**
 * Condensed-identity forks that do NOT compose `CartonContextCard`. Every
 * station identity composes the entity-context adapters — this list only ever
 * shrinks.
 *
 * **Emptied 2026-08-01.** Its one entry, `SupportTicketIdentity`, was allowlisted
 * because "ticket ≠ carton". That was the right observation and the wrong remedy:
 * a ticket is not a carton because `/support` is not a Station at all — it is
 * Workbench branch `service-workspace`
 * (`.claude/rules/display/workbench-service.md`). `SupportTicketFocus` now wears
 * a `PaneHeader`, so the component is no longer a fork of anything and simply
 * left this family. A future entry here should be read as the same smell: if a
 * surface needs non-carton identity, check whether it is a Station first.
 */
export const IDENTITY_FORK_ALLOWLIST = [] as const;

// ── Guard G — terminal modes without header chrome ────────────────────────────
/**
 * `TerminalWorkspaceMode`s that own a terminal dock but intentionally have NO
 * `WORKSPACE_MODES` row. Every terminal mode must be either in `WORKSPACE_MODES`
 * (Unbox-family nav + terminal slice) or here.
 */
export const TERMINAL_MODES_WITHOUT_HEADER_CHROME = ['shipping', 'repair', 'pickup'] as const;
