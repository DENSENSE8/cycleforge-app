/**
 * Scan-station idle↔overlay cohort — the SoT is the **full set**, not Pack/Unbox.
 *
 * Every floor scan station that mounts “browse stays under a focused overlay”
 * must be listed here. The tripwire
 * (`scan-station-overlay-cohort.test.ts`) asserts the same overlay contract
 * on **every** member. No station is golden; a fork is any member that drifts
 * from the cohort predicates, or a new scan station that never joins the list.
 *
 * Eval: station mouth/domain via `eval:station <id>` (tsx imports this module
 * so manifests cannot drift from the cohort registry). Display eval is
 * slot-table only — there is no `eval:cohort overlay`. design-mcp reads the
 * workspace paths for critique allowlisting of cohort-law styles.
 *
 * Add a station → append a row. Do not special-case Pack or Unbox.
 */

export type ScanStationOverlayMember = {
  /** Short id for assert messages / eval ledger. */
  id: string;
  /** Route the operator opens (docs / ledger). */
  route: string;
  /**
   * Repo-relative path to the workspace shell that owns idle hide + overlay
   * stack (not the panel body inside the overlay).
   */
  workspace: string;
  /** Exported React component name in `workspace` (for code-graph find_symbol). */
  exportName: string;
  /** Human label for LEDGERs. */
  label: string;
  /** Optional agent handoff doc (repo-relative). */
  handoff: string | null;
  /** Extra files for ds_critique beyond `workspace`. */
  critiqueExtra: readonly string[];
  /** Extra graph symbols beyond `exportName` (shell-adjacent). */
  graphSymbolsExtra: readonly string[];
  /** Station-local tripwire tests (cohort tripwire is always included). */
  tripwiresExtra: readonly string[];
};

/** Always-on tripwire for the overlay cohort itself. */
export const SCAN_STATION_OVERLAY_COHORT_TRIPWIRE =
  'src/lib/station/scan-station-overlay-cohort.test.ts' as const;

/**
 * Authoritative scan-station overlay cohort.
 *
 * Shrink only by deleting a station that no longer exists. Grow when a new
 * floor scan station ships the idle↔overlay shell.
 */
export const SCAN_STATION_OVERLAY_COHORT: readonly ScanStationOverlayMember[] = [
  {
    id: 'unbox',
    route: '/unbox',
    workspace: 'src/components/receiving/unbox/UnboxLineWorkspace.tsx',
    exportName: 'UnboxLineWorkspace',
    label: 'Unbox floor station',
    handoff: null,
    critiqueExtra: [],
    graphSymbolsExtra: ['useOverlaySwapHardCut'],
    tripwiresExtra: [],
  },
  {
    id: 'triage',
    route: '/triage',
    workspace: 'src/components/receiving/triage/TriageLineWorkspace.tsx',
    exportName: 'TriageLineWorkspace',
    label: 'Arrival / Triage floor station',
    handoff: null,
    critiqueExtra: [],
    graphSymbolsExtra: ['useOverlaySwapHardCut'],
    tripwiresExtra: [],
  },
  {
    id: 'pack',
    route: '/pack',
    workspace: 'src/components/packer/PackOrderWorkspace.tsx',
    exportName: 'PackOrderWorkspace',
    label: 'Pack floor station',
    handoff: null,
    critiqueExtra: [],
    graphSymbolsExtra: ['useOverlaySwapHardCut'],
    tripwiresExtra: [],
  },
  {
    id: 'testing',
    route: '/test',
    workspace: 'src/components/tech/TestingLineWorkspace.tsx',
    exportName: 'TestingLineWorkspace',
    label: 'Testing floor station',
    handoff: null,
    critiqueExtra: [],
    graphSymbolsExtra: [],
    tripwiresExtra: [],
  },
  {
    id: 'shipping',
    route: '/shipping',
    workspace: 'src/components/tech/TechRightPane.tsx',
    exportName: 'TechRightPane',
    label: 'Shipping scan station',
    handoff: null,
    critiqueExtra: [],
    graphSymbolsExtra: ['useOverlaySwapHardCut'],
    tripwiresExtra: [],
  },
  {
    id: 'scan-out',
    route: '/shipping/scan-out',
    workspace: 'src/components/outbound/workspaces/ScanOutWorkspace.tsx',
    exportName: 'ScanOutWorkspace',
    label: 'Scan-out floor station',
    handoff: 'docs/todo/scan-out-mobile-composer-HANDOFF.md',
    critiqueExtra: [
      'src/components/outbound/scan-out/ScanOutComposerDock.tsx',
      'src/components/composer/ComposerModeRow.tsx',
    ],
    graphSymbolsExtra: [
      'StationComposerHost',
      'ComposerModeRow',
      'ScanStationProgressRing',
      'useOverlaySwapHardCut',
    ],
    tripwiresExtra: [
      'src/components/outbound/scan-out/scan-out-commit.test.ts',
      'src/components/composer/composer-mode-row.test.tsx',
    ],
  },
] as const;

/**
 * Predicates every cohort member’s workspace source must satisfy.
 *
 * These are the **shared overlay shell** laws. Motion cadence may be
 * `motionRole.swap.scan` (gun stations) or `motionRole.swap.focus` (e.g.
 * Testing pointer open) — both are station swaps; neither Pack nor Unbox
 * owns the role name.
 */
export const SCAN_STATION_OVERLAY_CONTRACT = {
  /** Idle browse stays mounted; hide with visibility (not unmount). */
  visibilityHide: /style=\{\{\s*visibility:\s*[^}]*(?:'hidden'|"hidden")/,
  /** Overlay must not receive pointer events through the idle layer. */
  pointerEventsNone: /pointer-events-none/,
  /** a11y: inert idle while overlay is up. */
  inert: /\binert=\{/,
  /** Overlay stacks on the panel token — never a raw z-index integer. */
  zIndexPanel: /zIndex\.panel/,
  /** Presence host for the focused entity. */
  animatePresence: /AnimatePresence/,
  /** Station swap role — `.scan` or `.focus`, never a desk settle preset. */
  motionSwap: /motionRole\.swap\.(?:scan|focus)/,
} as const;

/** Repo-relative workspace paths — design-mcp critique allowlist source. */
export function overlayCohortWorkspacePaths(): string[] {
  return SCAN_STATION_OVERLAY_COHORT.map((m) => m.workspace);
}

/** Eval manifest shape derived from one cohort member (no hand JSON). */
export type StationEvalManifest = {
  id: string;
  label: string;
  route: string;
  handoff: string | null;
  ledger: string;
  snapshotsDir: string;
  critiqueFiles: string[];
  graphSymbols: string[];
  tripwires: string[];
  workspace: string;
  exportName: string;
};

export function stationEvalManifest(member: ScanStationOverlayMember): StationEvalManifest {
  return {
    id: member.id,
    label: member.label,
    route: member.route,
    handoff: member.handoff,
    ledger: `docs/eval/stations/${member.id}/LEDGER.md`,
    snapshotsDir: `docs/eval/stations/${member.id}/snapshots`,
    critiqueFiles: [member.workspace, ...member.critiqueExtra],
    graphSymbols: [member.exportName, ...member.graphSymbolsExtra],
    tripwires: [SCAN_STATION_OVERLAY_COHORT_TRIPWIRE, ...member.tripwiresExtra],
    workspace: member.workspace,
    exportName: member.exportName,
  };
}

export function allStationEvalManifests(): StationEvalManifest[] {
  return SCAN_STATION_OVERLAY_COHORT.map(stationEvalManifest);
}

export const OVERLAY_COHORT_LEDGER = 'docs/eval/cohorts/overlay/LEDGER.md' as const;
export const OVERLAY_COHORT_SNAPSHOTS = 'docs/eval/cohorts/overlay/snapshots' as const;
