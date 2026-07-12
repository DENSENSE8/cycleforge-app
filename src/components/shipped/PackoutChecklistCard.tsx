'use client';

/**
 * PackoutChecklistCard — the read-only "pack checklist" proof, shown as a
 * COLLAPSED dropdown at the top of the order detail (rep "prove the packout"
 * view). Not the interactive scan-to-confirm packer checklist — this is a
 * glanceable record of what the order's pack checklist consists of (kit parts +
 * QC steps per line) plus the real packed-lines rollup.
 *
 * Reuses the existing `useOrderPackChecklist` read (endpoint
 * `/api/orders/[id]/pack-checklist`) — additive, no data-plane change. It is a
 * sub-resource: on loading/empty/error it renders nothing (degrade-not-fail), so
 * a missing checklist never breaks the order page.
 */

import { useState } from 'react';
import { ChevronDown, ChevronRight, ClipboardList, Check } from '@/components/Icons';
import { useOrderPackChecklist } from '@/hooks/useOrderPackChecklist';
import type { PackChecklistLineDto } from '@/lib/packing/order-pack-checklist';
import { SECTION_CARD_CLASS } from './SectionCard';
import { cn } from '@/utils/_cn';

interface PackoutChecklistCardProps {
  orderRowId: number | null;
  sku?: string | null;
  condition?: string | null;
  productTitle?: string | null;
}

function LineBlock({ line }: { line: PackChecklistLineDto }) {
  const hasItems = line.kitParts.length > 0 || line.qcFlags.length > 0;
  return (
    <div className="space-y-1.5">
      <p className="truncate text-caption font-bold text-text-default">
        {line.productTitle}
        {line.quantity > 1 ? <span className="text-text-faint"> ×{line.quantity}</span> : null}
      </p>
      {line.kitParts.length > 0 ? (
        <ul className="space-y-1 pl-0.5">
          {line.kitParts.map((part) => (
            <li key={`kit-${part.id}`} className="flex items-center gap-1.5 text-caption text-text-muted">
              <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-border-strong" />
              <span className="truncate">
                {part.name}
                {part.qty > 1 ? ` ×${part.qty}` : ''}
              </span>
              {part.critical ? (
                <span className="shrink-0 rounded bg-amber-50 px-1 py-0.5 text-eyebrow font-black uppercase tracking-widest text-amber-700 ring-1 ring-inset ring-amber-200">
                  Required
                </span>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
      {line.qcFlags.length > 0 ? (
        <ul className="space-y-1 pl-0.5">
          {line.qcFlags.map((qc) => (
            <li key={`qc-${qc.id}`} className="flex items-center gap-1.5 text-caption text-text-muted">
              <Check className="h-3 w-3 shrink-0 text-text-faint" />
              <span className="truncate">{qc.label}</span>
            </li>
          ))}
        </ul>
      ) : null}
      {!hasItems ? (
        <p className="text-caption font-medium text-text-faint">No checklist items for this line.</p>
      ) : null}
    </div>
  );
}

export function PackoutChecklistCard({
  orderRowId,
  sku,
  condition,
  productTitle,
}: PackoutChecklistCardProps) {
  const [open, setOpen] = useState(false);
  const { data, isLoading, isError } = useOrderPackChecklist({
    orderRowId,
    sku,
    condition,
    productTitle,
  });

  // Sub-resource: never break the order page on a missing/failed checklist.
  if (isLoading || isError || !data || data.lines.length === 0) return null;

  const { packedLines, total } = data.progress;
  const allPacked = total > 0 && packedLines >= total;

  return (
    <div className={cn(SECTION_CARD_CLASS, 'p-0 overflow-hidden')}>
      {/* ds-raw-button: native disclosure toggle for a collapsible section. */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center gap-2 px-5 py-3 text-left transition-colors hover:bg-surface-sunken"
      >
        {open ? (
          <ChevronDown className="h-3.5 w-3.5 shrink-0 text-text-faint" />
        ) : (
          <ChevronRight className="h-3.5 w-3.5 shrink-0 text-text-faint" />
        )}
        <ClipboardList className="h-3.5 w-3.5 shrink-0 text-text-muted" />
        <span className="text-eyebrow font-black uppercase tracking-widest text-text-muted">
          Pack checklist
        </span>
        <span
          className={cn(
            'ml-auto inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-eyebrow font-black uppercase tracking-widest ring-1 ring-inset',
            allPacked
              ? 'bg-emerald-50 text-emerald-700 ring-emerald-200'
              : 'bg-surface-sunken text-text-soft ring-border-soft',
          )}
        >
          {allPacked ? <Check className="h-3 w-3" /> : null}
          {packedLines}/{total} packed
        </span>
      </button>

      {open ? (
        <div className="space-y-4 border-t border-border-hairline px-5 py-4">
          {data.lines.map((line) => (
            <LineBlock key={`line-${line.orderRowId}-${line.sku ?? ''}`} line={line} />
          ))}
        </div>
      ) : null}
    </div>
  );
}
