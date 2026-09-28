'use client';

/**
 * An import list row's face — ONE layout for a Square invoice and an Ecwid
 * order on the desk and on the phone (`importRow` facts from
 * `src/lib/orders/intake/import-rows.ts`): #number · buyer, then the items
 * line; the status pill; the amount (green) over where it already lives in
 * CycleForge — or the face's hint (the desk's `Import ↵` on the active row).
 * The wrapper (a keyboard listbox option on the desk, a touch button on the
 * phone) is the face's own; this is only what the row says and where.
 */

import type { ReactNode } from 'react';
import type { ImportRowFacts, ImportRowTone } from '@/lib/orders/intake/import-rows';
import { cn } from '@/utils/_cn';

const STATUS_TONE: Readonly<Record<ImportRowTone, string>> = {
  success: 'bg-surface-success text-text-success',
  warning: 'bg-surface-warning text-text-warning',
  muted: 'bg-mode-well text-mode-muted',
};

export function TriageImportRowFace({ row, hint = null }: { row: ImportRowFacts; hint?: ReactNode }) {
  return (
    <span className="flex w-full min-w-0 items-center gap-3">
      <span className="min-w-0 flex-1">
        <span className="flex min-w-0 items-baseline gap-2">
          <span className="shrink-0 font-mono text-role-caption text-mode-ink">#{row.number}</span>
          <span className="truncate text-role-body font-medium text-mode-ink">{row.who}</span>
        </span>
        <span className="block truncate text-role-caption text-mode-muted">{row.what}</span>
      </span>
      {row.status ? (
        <span className={cn('shrink-0 rounded-mode-pill px-2 py-0.5 text-role-micro', STATUS_TONE[row.status.tone])}>{row.status.label}</span>
      ) : null}
      <span className="w-28 shrink-0 text-right">
        <span className="block text-role-body tabular-nums text-text-success">{row.amount}</span>
        <span className="block truncate text-role-micro text-mode-muted">
          {row.importedAs ? `In CycleForge · ${row.importedAs}` : hint}
        </span>
      </span>
    </span>
  );
}
