/** Scan-dock policy store — which surface currently owns the global scan input. */

import type { ReactNode } from 'react';

interface ScanDockPolicy {
  /** Stable identity for the publishing surface + mode (e.g. */
  id: string;
  placeholder?: string;
  /** The surface's resolver — what its own bar's submit used to call. */
  onSubmit: (value: string) => void;
  /** Spinner in the bar's right rail while a lookup is in flight. */
  isResolving?: boolean;
  /** Staff id — resolves the themed bottom rule / submit trace. */
  staffId?: string | number | null;
  /** The surface's own mode rail (Tracking · PO# · Serial · SKU …), rendered in the bar's right slot. */
  rightContent?: ReactNode;
}

const policies: ScanDockPolicy[] = [];
const listeners = new Set<() => void>();

function emit(): void {
  listeners.forEach((l) => l());
}

/** Publish a policy and become the dock's owner. */
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
