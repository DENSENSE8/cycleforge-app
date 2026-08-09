/**
 * Action-plane scan sink — routes a wedge payload to the active station
 * capture handler without React Context or a re-render on active changes.
 *
 * Same altitude as `scan-hotkey/` (focus reclaim) and `record-cursor/` (↑↓
 * ownership). Context is the wrong seam: the global wedge listener lives in
 * the app shell; the dock / serial / station-bar sinks live in station
 * subtrees. A module Map + active-id ref is the shared waist.
 *
 * Dual-path with {@link useWedgeScanner}: when focus is already in an
 * editable field the wedge listener stands down and the field owns keys.
 * This store covers the non-editable case (row focused, chrome focused,
 * middle selected) so a pull of the trigger still lands on the Action sink.
 */

export type ScanSinkHandler = (value: string) => void;

export interface ScanSinkRegistration {
  id: string;
  onScan: ScanSinkHandler;
  /** Optional focus reclaim (Insert / receiving-focus-scan parity). */
  focus?: () => void;
}

const sinks = new Map<string, ScanSinkRegistration>();
/** Registration order — last entry is the fallback when activeId is stale. */
let order: string[] = [];
/** Active sink — ref-style; never notifies React subscribers. */
let activeId: string | null = null;

function bumpOrder(id: string): void {
  order = order.filter((x) => x !== id);
  order.push(id);
}

/**
 * Register (or replace) a scan sink. Auto-activates the sink so a freshly
 * mounted dock / serial field owns the next wedge. Returns unregister.
 */
export function registerScanSink(sink: ScanSinkRegistration): () => void {
  if (!sink.id) return () => undefined;
  sinks.set(sink.id, sink);
  bumpOrder(sink.id);
  activeId = sink.id;
  return () => {
    const current = sinks.get(sink.id);
    // Only delete if this exact registration is still seated (StrictMode /
    // re-register race: a newer registration under the same id must survive).
    if (current !== sink) return;
    sinks.delete(sink.id);
    order = order.filter((x) => x !== sink.id);
    if (activeId === sink.id) {
      activeId = order[order.length - 1] ?? null;
    }
  };
}

/** Point the next wedge at a registered sink without re-rendering. */
export function setActiveSinkId(id: string | null): void {
  activeId = id;
}

export function getActiveSinkId(): string | null {
  return activeId;
}

/** Test / debug — clear every sink. Not for production call sites. */
export function __resetStationScanSinkForTests(): void {
  sinks.clear();
  order = [];
  activeId = null;
}

/**
 * Dispatch `value` to the active Action sink. Returns true when a handler
 * ran (caller should skip URL redirect / default wedge nav).
 */
export function dispatchScanToActiveSink(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) return false;

  let id = activeId;
  if (id != null && !sinks.has(id)) {
    id = order[order.length - 1] ?? null;
    activeId = id;
  }
  if (id == null) return false;

  const sink = sinks.get(id);
  if (!sink) return false;

  try {
    sink.onScan(trimmed);
    return true;
  } catch {
    /* handler errors must not break the global wedge listener */
    return false;
  }
}
