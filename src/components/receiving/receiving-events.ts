/**
 * Typed contract for the receiving cross-pane event bus — the single source of
 * truth for every `receiving-*` window CustomEvent name and its payload.
 *
 * Why this exists: the receiving surface coordinates its sidebar, right pane,
 * and workspace through ~110 hand-wired `window.dispatchEvent(new CustomEvent(
 * 'receiving-…'))` / `addEventListener('receiving-…')` call sites. Untyped and
 * one-shot, that bus silently drops events when a listener mounts late (the
 * Suspense mount-order race behind the Unbox refresh-stickiness bug) and hides
 * every producer/consumer edge behind a string literal.
 *
 * The migration target (see `AGENTS.md` → URL-as-SoT + this cluster's docs):
 *   - durable selection lives in the URL, not events;
 *   - volatile cross-pane state flows through the TanStack Query cache;
 *   - the residual fire-and-forget notifications route through THIS registry so
 *     they are typed, greppable, and counted.
 *
 * Dispatch with `emitReceiving(name, detail)`. Subscribe with
 * `useReceivingEvents({ [name]: (detail) => … })` (`@/hooks/useReceivingEvents`).
 * A ratchet guard (`receiving-events.guard.test.ts`) bans raw
 * `new CustomEvent('receiving-…')` / `addEventListener('receiving-…')` outside
 * the sanctioned bus modules and only lets the count shrink.
 *
 * Add a new receiving event by adding its name + payload type here first.
 */

import type { ReceivingLineRow } from '@/components/station/receiving-line-row';
import type { ReceivingPackageUpdatedDetail } from '@/components/station/receiving-lines-table-helpers';
import type { ReceivingSelectLineDetail } from '@/components/sidebar/receiving/receiving-sidebar-shared';
import type { PhotoAspect } from '@/lib/photos/photo-aspects';
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
  /**
   * Preview → real scan. The read-only lock's **Scan it** asks the sidebar to
   * re-run the value it previewed, for real. The pane cannot do it itself: the
   * scan is an INGEST act and belongs to the bar that owns the value, and
   * routing it back keeps one submit path rather than a second writer.
   */
  /** Hand focus back to the scan wedge after a procedure face/chip click. */
  'receiving-focus-scan': undefined;
  /**
   * Arm the **sidebar ingestion** scan bar for the next carton (clear + focus).
   * Distinct from `receiving-focus-scan` (dock-first wedge while a carton is
   * open). Preferred producer today is the ⌘. owner in `scan-hotkey/store`
   * (StationScanBar clears itself via `armNext`); this name is reserved for
   * typed producers that need the same semantics without a mounted bar stack.
   */
  'receiving-arm-next-scan': undefined;
  /**
   * Procedure locus → **ingest** hand-back: a payload the open-carton dock
   * scanned but does not own (i.e. not a shelf) is a tracking, so it goes to
   * the sidebar bar's own submit rather than being swallowed.
   *
   * This is the one direction that is legal. The reverse — the sidebar bar
   * placing cartons — is not: ingest and procedure are two loci, and the
   * sidebar's job is "which carton", never "which shelf".
   */
  'receiving-submit-tracking': { tracking: string };
  /** Table row pulse after MRU / deep-link navigation. */
  'receiving-highlight-line': number;
  /** Workspace / triage / History chrome: step prev/next line in the open table. */
  'receiving-navigate-table': 'prev' | 'next';
  /**
   * Dock / PO-line strip Link → LineEditPanel: open the Photos Displays leaf on
   * its `link` drill. LineEditPanel owns `openDisplays`; the emitter does not.
   * Pass `lineId` (PO item) and/or `cartonAspect` (Shipping label · The box ·
   * Packing material) to default the leaf's "Link to" combobox — at least one.
   */
  'receiving-open-photo-link': {
    lineId?: number;
    cartonAspect?: PhotoAspect;
  };
  /**
   * Unbox History left-click — open the carton triage slide-over
   * (`detail:history` / HistoryCartonTriagePanel).
   */
  'receiving-open-history-triage': {
    receivingId: number;
    receivingLineId?: number | null;
    poNumber?: string | null;
    title?: string | null;
    tracking?: string | null;
    status?: string | null;
  };
  /** Close the History triage slide-over. */
  'receiving-close-history-triage': undefined;
  /**
   * Export the current Unbox History view as CSV. The Band-1 trailing button
   * triggers it; the table (which holds the rows in hand) formats + downloads —
   * never a second query. History surface only.
   */
  'receiving-export-history': undefined;
  /**
   * Line Received / SHORT / OVER / DAMAGED / WRONG_ITEM — mouth reaction on
   * WeldedFeedbackPanel. Not carton GR. Not a toast.
   */
  'receiving-line-osd': {
    headline: string;
    tone: 'success' | 'warning';
  };
}

/** Payload of `receiving-lookup-scan`. */
export interface UnboxLookupScanDetail {
  receivingId: number;
  trackingNumber: string;
  unboxedAt: string | null;
  /**
   * Who actually completed the unbox. Server-resolved rather than read off the
   * workspace row: the receipt renders the instant the scan resolves, which on
   * the stub-open rungs is before the row carries `unboxed_by_name`, so
   * sourcing it from the row left the fact silently blank.
   */
  unboxedByName?: string | null;
  /** PO number — the receipt's "open details" jump searches on it. */
  poNumber?: string | null;
}

export type ReceivingEventName = keyof ReceivingEventDetail;

/** Event names whose payload is `undefined` — dispatched without a detail. */
type BareReceivingEvent = {
  [K in ReceivingEventName]: ReceivingEventDetail[K] extends undefined ? K : never;
}[ReceivingEventName];

/**
 * Typed dispatch for a receiving event. Bare (payload-less) events take no
 * second argument; all others require their typed detail.
 *
 *   emitReceiving('receiving-clear-line');
 *   emitReceiving('receiving-line-deleted', { id: 42 });
 */
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
