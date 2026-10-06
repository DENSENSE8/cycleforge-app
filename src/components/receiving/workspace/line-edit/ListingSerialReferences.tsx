'use client';

/**
 * Under the unbox capture face: one reference row per listing serial still to
 * confirm — "Listing shows <serial>" + Confirm. Confirm adds that serial
 * through the line's own serial add path (the same call the scan field
 * makes), so the server matches it and stamps `confirmed_at`; the row leaves
 * once the line's `listing_serials` flip (`publishListingSerialConfirmed`).
 */

import { useState } from 'react';
import { Button } from '@/design-system/primitives/Button';
import { RECORD_ID_CLASS } from '@/design-system/tokens/record';
import type { ListingSerialRef } from '@/lib/receiving/receiving-line-row';
import { cn } from '@/utils/_cn';

export function ListingSerialReferences({
  serials,
  disabled = false,
  onConfirm,
}: {
  serials: ReadonlyArray<ListingSerialRef> | null | undefined;
  disabled?: boolean;
  /** The line's serial add — resolves once the add settled. */
  onConfirm: (serial: string) => void | Promise<void>;
}) {
  const [pendingId, setPendingId] = useState<number | null>(null);
  const open = (serials ?? []).filter((s) => s.confirmed_at == null);
  if (open.length === 0) return null;

  return (
    <ul aria-label="Listing serials to confirm" className="flex flex-col bg-surface-card" data-listing-serial-references>
      {open.map((s) => (
        <li key={s.id} className="flex min-h-mode-hit items-center gap-2 border-b border-mode-fact px-3 py-1 last:border-b-0">
          <span className="min-w-0 flex-1 truncate text-role-caption text-text-muted">
            Listing shows <span className={cn(RECORD_ID_CLASS, 'text-text-default')}>{s.serial}</span>
          </span>
          <Button
            type="button"
            size="sm"
            variant="secondary"
            loading={pendingId === s.id}
            disabled={disabled || (pendingId != null && pendingId !== s.id)}
            ariaLabel={`Confirm serial ${s.serial}`}
            onClick={async () => {
              setPendingId(s.id);
              try {
                await onConfirm(s.serial);
              } finally {
                setPendingId(null);
              }
            }}
          >
            Confirm
          </Button>
        </li>
      ))}
    </ul>
  );
}
