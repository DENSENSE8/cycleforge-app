/** Typed contract for the receiving cross-pane event bus — the single source of truth for every `receiving-*` window CustomEvent name and… */

import type { ReceivingLineRow } from '@/lib/receiving/receiving-line-row';
import type { ReceivingPackageUpdatedDetail } from '@/components/station/receiving-lines-table-helpers';
import type { ReceivingSelectLineDetail } from '@/components/sidebar/receiving/receiving-sidebar-shared';
import type { ScanIntakeSurface } from '@/lib/receiving/scan/types';
import type {
  NavState,
  WorkspaceState,
} from '@/components/receiving/useReceivingWorkspacePane';

/**
 * Name → detail payload for every receiving cross-pane event. `undefined` marks
 * a bare signal event (no `detail`). Extend as more of the bus migrates onto the
 * typed path; the guard's baseline shrinks with each raw call site retired.
 */
export interface ReceivingEventDetail {
  /** Sidebar → pane: open the focused-line workspace for this carton/line. */
  'receiving-workspace-open': WorkspaceState;
  /** Close the focused workspace and converge both panes on empty. */
  'receiving-workspace-close': undefined;
  /** Pane header prev/next + "Line N of M" mirror. */
  'receiving-workspace-nav-state': NavState | null;
  /** Select a line (table/rail click or deep-link restore). */
  'receiving-select-line': ReceivingSelectLineDetail;
  /** Full deselect (mode switch, triage sub-view flip). */
  'receiving-clear-line': undefined;
  /** Optimistic line patch broadcast; listeners merge by `id`. */
  'receiving-line-updated': Partial<ReceivingLineRow> & { id: number };
  /** Carton-level patch broadcast; listeners merge by `receiving_id`. */
  'receiving-package-updated': ReceivingPackageUpdatedDetail;
  /** A single line was removed (e.g. last item pulled from a carton). */
  'receiving-line-deleted': { id?: number };
  /** A whole carton (receiving log) was removed; detail is the bare carton id. */
  'receiving-entry-deleted': number;
  /** A scan is in flight; drives the per-surface skeleton loader. */
  'receiving-scan-in-flight': {
    tracking: string;
    startedAt: number;
    surface?: ScanIntakeSurface;
  };
  /** The in-flight scan resolved; clear the skeleton loader. */
  'receiving-scan-resolved': undefined;
  /**
   * The scan resolved to a carton whose unbox work is already DONE, so it was
   * recorded as an inspection (`RECEIVING_LOOKUP_SCAN`) and claimed no work.
   * The Unbox pane shows a read-only receipt over the editor.
   */
  'receiving-lookup-scan': UnboxLookupScanDetail;
  /** Preview → real scan. */
  /** Hand focus back to the scan wedge after a procedure face/chip click. */
  'receiving-focus-scan': undefined;
  /** Arm the **sidebar ingestion** scan bar for the next carton (clear + focus). */
  'receiving-arm-next-scan': undefined;
  /** Procedure locus → **ingest** hand-back: */
  'receiving-submit-tracking': { tracking: string };
  /** Table row pulse after MRU / deep-link navigation. */
  'receiving-highlight-line': number;
  /** Workspace / triage / History chrome: step prev/next line in the open table. */
  'receiving-navigate-table': 'prev' | 'next';
  /**
   * Export the current Unbox History view as CSV. The Band-1 trailing button
   * triggers it; the table (which holds the rows in hand) formats + downloads —
   * never a second query. History surface only.
   */
  'receiving-export-history': undefined;
}

/** Payload of `receiving-lookup-scan`. */
export interface UnboxLookupScanDetail {
  receivingId: number;
  trackingNumber: string;
  unboxedAt: string | null;
  /** Who actually completed the unbox. */
  unboxedByName?: string | null;
  /** PO number — the receipt's "open details" jump searches on it. */
  poNumber?: string | null;
}

export type ReceivingEventName = keyof ReceivingEventDetail;

/** Event names whose payload is `undefined` — dispatched without a detail. */
type BareReceivingEvent = {
  [K in ReceivingEventName]: ReceivingEventDetail[K] extends undefined ? K : never;
}[ReceivingEventName];

/** Typed dispatch for a receiving event. */
export function emitReceiving<K extends BareReceivingEvent>(name: K): void;
export function emitReceiving<K extends Exclude<ReceivingEventName, BareReceivingEvent>>(
  name: K,
  detail: ReceivingEventDetail[K],
): void;
export function emitReceiving<K extends ReceivingEventName>(
  name: K,
  detail?: ReceivingEventDetail[K],
): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(
    detail === undefined
      ? new CustomEvent(name)
      : new CustomEvent(name, { detail }),
  );
}
