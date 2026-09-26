/** Receiving scan — domain types for the resolution pipeline. */

import type { ReceivingLineRow } from '@/lib/receiving/receiving-line-row';
import type { ResolvedTestingScan, ResolvedVia } from '@/lib/testing/resolve-testing-scan';

/** How a scanned value is routed. */
export type ScanResolutionMode = 'tracking' | 'order' | 'ticket' | 'auto';

/** A classified scan ready to run through the ladder. */
export interface ScanInput {
  /** The trimmed scanned string (PO#, tracking#, serial, or internal handle). */
  value: string;
  /** The resolution mode (an armed mode wins; otherwise `auto`). */
  mode: ScanResolutionMode;
}

/**
 * What a scanned value resolved to, BEFORE any UI effect is applied. The hook's
 * apply layer switches on `kind`. Extend this union as each ladder rung moves
 * out of the hook.
 */
export type ScanResolution = InternalCodeResolution | CachedCartonResolution;

/**
 * Internal-handle rung — a serial / unit-id / carton-handle (R-/RCV-/H-/L-/U-…)
 * resolved straight to its receiving line(s), bypassing carrier-tracking intake.
 * Runs before Phase 0 so a printed receiving label scans back to its own carton.
 */
export interface InternalCodeResolution {
  kind: 'internal-code';
  rows: ReceivingLineRow[];
  /** The line to open: the single line, or the first OPEN line of a multi. */
  pick: ReceivingLineRow | null;
  /** Resolution channel — `'serial'` drives the "Found via serial number" toast. */
  via: ResolvedVia | null;
  receivingId?: number;
  poIds: string[];
}

/** Injected collaborators for {@link resolveInternalCode}. */
export interface InternalCodeDeps {
  /** True when the value looks like an internal handle — pure heuristic. */
  looksLikeCode: (value: string) => boolean;
  /** Resolve an internal handle to its receiving line(s) — I/O, injected. */
  resolveCode: (value: string) => Promise<ResolvedTestingScan | null>;
}

/**
 * Phase 0 — the scanned PO / tracking / ticket# is already a MATERIALIZED
 * carton (`receiving_id` set) sitting in a receiving-feed cache, so it opens
 * instantly with zero network. The resolver has already preferred an OPEN line.
 */
export interface CachedCartonResolution {
  kind: 'cached-carton';
  /** The carton row to open (already the preferred OPEN line of its carton). */
  row: ReceivingLineRow;
  receivingId: number;
  /** PO ids carried on the row, for the caller's `onResult` echo. */
  poIds: string[];
}

/** Injected collaborators for {@link resolveCachedCarton}. */
export interface CachedCartonDeps {
  /** Snapshot of every materialized receiving row currently in the feed caches. */
  readCachedRows: () => ReceivingLineRow[];
}

/** Local-first tracking rung output (Phase 1a). */
export type LocalTrackingResolution = LocalMatchedResolution | RetargetResolution;

export interface LocalMatchedResolution {
  kind: 'local-matched';
  /** Local rows of the carton (each carrying a `receiving_id`). */
  rows: ReceivingLineRow[];
  /** The line to open: the first OPEN line, else the first row. */
  pick: ReceivingLineRow;
  receivingId: number;
  poIds: string[];
}

export interface RetargetResolution {
  kind: 'retarget';
  /** Mode the lookup-po call should use instead (the order-mode local-adopt path). */
  mode: ScanResolutionMode;
  /** Value the lookup-po call should use instead (the resolved PO number). */
  value: string;
}

/** Injected collaborators for {@link resolveLocalTracking}. */
export interface LocalTrackingDeps {
  fetchLinesByTracking: (tracking: string) => Promise<ReceivingLineRow[]>;
}

/** Raw lookup-po JSON response — loosely typed; the apply layer reads it defensively. */
export type LookupPoData = Record<string, unknown>;

/** Where the scan was initiated — drives Unbox sidebar membership. */
export type ScanIntakeSurface = 'unbox' | 'triage';

/** Body for a `POST /api/receiving/lookup-po` call. */
export interface LookupPoRequest {
  trackingNumber: string;
  staffId: number;
  mode: ScanResolutionMode;
  /** Phase 1 resolves from LOCAL data only; omit/false to run the live Zoho lookup. */
  localOnly?: boolean;
  /** When `'unbox'`, stamps UNBOX_SCAN_OPENED so the carton lists in the Unbox rail. */
  intakeSurface?: ScanIntakeSurface;
}

/** Inputs for {@link resolveViaLookupPo}. */
export interface LookupPoInput {
  /** The (possibly re-targeted) value sent to lookup-po. */
  callValue: string;
  /** The (possibly re-targeted) mode sent to lookup-po. */
  callMode: ScanResolutionMode;
  /** The ORIGINAL scan mode — classifies a clean not-found vs an unfound carton. */
  originalMode: ScanResolutionMode;
  staffId: number;
  /** Unbox vs triage — forwarded to lookup-po for UNBOX_SCAN_OPENED stamping. */
  intakeSurface?: ScanIntakeSurface;
}

/** Injected collaborators for {@link resolveViaLookupPo}. */
export interface LookupPoDeps {
  /** POST /api/receiving/lookup-po and return the parsed JSON. */
  lookupPo: (body: LookupPoRequest) => Promise<LookupPoData>;
}

/** lookup-po rung output (local-DB only). */
export type LookupPoResolution =
  | { kind: 'matched'; data: LookupPoData }
  | { kind: 'unmatched'; data: LookupPoData }
  | { kind: 'not_found'; data: LookupPoData }
  | { kind: 'integration-error'; data: LookupPoData };
