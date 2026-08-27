'use client';

import { useEffect, useState } from 'react';

/**
 * Client read for the **failure-mode taxonomy** — Testing's "why" vocabulary,
 * the sibling of `useReasonVocabulary`'s `reason_codes` reads.
 *
 * Two vocabularies exist on purpose and must not be merged: `reason_codes`
 * (flow-context scoped, per-decision, lands in an exception row) answers "why
 * did this GATE fire"; `failure_modes` answers "what is WRONG with this unit",
 * carries severity / repairability / a grade cap, and lands in
 * `unit_failure_tags` where it is reversible and feeds `recomputeUnitQuality`.
 * A failed QC step already auto-tags one server-side
 * (`/api/serial-units/[id]/checklist`); this hook is how an operator names one
 * by hand at the same grain.
 *
 * Session-cached like its sibling, and returns null until the first load
 * resolves so callers can render a settled empty state rather than a flash.
 */
export interface FailureModeRow {
  id: number;
  code: string;
  label: string;
  category: string | null;
  severity: 'critical' | 'major' | 'minor' | string;
  is_repairable: boolean | null;
}

let cache: Promise<FailureModeRow[]> | null = null;

async function loadFailureModes(): Promise<FailureModeRow[]> {
  const res = await fetch('/api/failure-modes?activeOnly=1', { cache: 'no-store' });
  if (!res.ok) throw new Error(`failure-modes ${res.status}`);
  const data = await res.json();
  if (!data?.success || !Array.isArray(data.modes)) return [];
  return (data.modes as FailureModeRow[]).map((m) => ({
    id: Number(m.id),
    code: String(m.code ?? ''),
    label: String(m.label ?? ''),
    category: m.category ?? null,
    severity: String(m.severity ?? 'minor'),
    is_repairable: m.is_repairable ?? null,
  }));
}

export function useFailureModes(): FailureModeRow[] | null {
  const [rows, setRows] = useState<FailureModeRow[] | null>(null);

  useEffect(() => {
    let alive = true;
    if (!cache) cache = loadFailureModes().catch(() => []);
    cache.then((r) => {
      if (alive) setRows(r);
    });
    return () => {
      alive = false;
    };
  }, []);

  return rows;
}

/** Severity → the house `TimelineTone` the chip picker paints from. */
export function failureModeTone(severity: string): 'danger' | 'warning' | 'muted' {
  if (severity === 'critical') return 'danger';
  if (severity === 'major') return 'warning';
  return 'muted';
}
