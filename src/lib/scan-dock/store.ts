/**
 * Scan-dock policy store — which surface currently owns the global scan input.
 *
 * The problem this solves is a REMOUNT, not a layout. Every station bar today
 * lives inside its surface's sidebar panel, and those panels are swapped by
 * component identity: `TechSidebarPanel` renders `TestingSidebarPanel` or
 * `ShippingSidebarPanel` depending on the mode, so React unmounts one and
 * mounts the other. The scan input goes with it — value, focus, and the DOM
 * node itself. On the QC → Ready to Pack jump the command router performs, the
 * operator's cursor lands nowhere.
 *
 * `GlobalHeader` is mounted once in `ResponsiveLayout`, which lives in the ROOT
 * layout, and the App Router never remounts that across a client navigation. So
 * an input mounted THERE survives every jump. This store is what lets it: the
 * dock owns the input, and each surface publishes the POLICY that makes it
 * behave like that surface's bar.
 *
 * Same shape and same altitude as `station-scan-sink/store.ts` — a module
 * singleton with a subscriber set, not a React context. The publisher (a
 * sidebar panel deep in the page tree) and the consumer (the header, above it)
 * have no common ancestor below the root, so context would mean hoisting state
 * to the root anyway; this is that, without the provider.
 */

import type { ReactNode } from 'react';

export interface ScanDockPolicy {
  /**
   * Stable identity for the publishing surface + mode (e.g. `tech:testing`).
   *
   * The dock clears its VALUE when this changes but keeps FOCUS. That split is
   * the contract: focus continuity is the whole point of the dock, while
   * carrying a half-typed serial from Quality Control to Ready to Pack would
   * hand the next bench a value its resolver never saw scanned.
   */
  id: string;
  placeholder?: string;
  /** The surface's resolver — what its own bar's submit used to call. */
  onSubmit: (value: string) => void;
  /** Spinner in the bar's right rail while a lookup is in flight. */
  isResolving?: boolean;
  /** Staff id — resolves the themed bottom rule / submit trace. */
  staffId?: string | number | null;
  /**
   * The surface's own mode rail (Tracking · PO# · Serial · SKU …), rendered in
   * the bar's right slot. Carried as a node so a migrating surface loses
   * nothing: the rail is surface vocabulary, and folding every station's modes
   * into one dock-owned union would be the twin this design exists to avoid.
   */
  rightContent?: ReactNode;
}

const policies: ScanDockPolicy[] = [];
const listeners = new Set<() => void>();

function emit(): void {
  listeners.forEach((l) => l());
}

/**
 * Publish a policy and become the dock's owner. Returns an unregister that
 * falls back to the previous publisher — the same last-in-wins stack
 * `scan-hotkey/store.ts` uses for focus targets, so a transient overlay that
 * publishes does not permanently steal the bar when it closes.
 */
export function registerScanDockPolicy(policy: ScanDockPolicy): () => void {
  const existing = policies.findIndex((p) => p.id === policy.id);
  if (existing >= 0) policies.splice(existing, 1);
  policies.push(policy);
  emit();
  return () => {
    const at = policies.indexOf(policy);
    // Guard the replace-same-id case: a re-publish pushed a NEWER object under
    // this id, and the stale cleanup must not delete it.
    if (at >= 0) {
      policies.splice(at, 1);
      emit();
    }
  };
}

export function getActiveScanDockPolicy(): ScanDockPolicy | null {
  return policies.length ? policies[policies.length - 1] : null;
}

export function subscribeScanDock(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Test seam — node:test only. */
export function __resetScanDockForTests(): void {
  policies.length = 0;
  listeners.clear();
}
