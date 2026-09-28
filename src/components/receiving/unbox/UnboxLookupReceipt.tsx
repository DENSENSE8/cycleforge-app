'use client';

/** "Already unboxed" receipt — the read-only outcome of scanning a carton whose unbox work is finished. */

import { useRouter } from 'next/navigation';
import { Button, Panel } from '@/design-system/primitives';
import { PoChip, TrackingChip } from '@/components/ui/CopyChip';
import { PackageOpen, Search } from '@/components/Icons';
import { formatDateTimePST } from '@/utils/date';
import { getLast8 } from '@/lib/copy-chip-format';
import { globalSearchHref } from '@/lib/search/search-hit';
import {
  STATION_WORKBENCH_COLUMN,
  STATION_WORKBENCH_BODY_PAD_X,
} from '@/components/station/workbench';
import { cornerClass } from '@/design-system/tokens/radius';
import { cn } from '@/utils/_cn';
import type { UnboxLookupScanDetail } from '@/components/receiving/receiving-events';

interface UnboxLookupReceiptProps {
  receipt: UnboxLookupScanDetail;
  /** Fallback when the scan payload carried no name (older rungs / stub opens). */
  unboxedByName?: string | null;
  onOpenAnyway: () => void;
  onDismiss: () => void;
}

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    // `min-w-0` so a long value shrinks inside the flex row instead of pushing
    // its siblings out; `whitespace-nowrap` keeps each fact on a single line so
    // the row stays one band deep.
    <div className="min-w-0 space-y-1">
      <p className="text-role-micro text-text-soft">{label}</p>
      <div className="whitespace-nowrap text-role-caption font-semibold text-text-default">
        {children}
      </div>
    </div>
  );
}

export function UnboxLookupReceipt({
  receipt,
  unboxedByName,
  onOpenAnyway,
  onDismiss,
}: UnboxLookupReceiptProps) {
  const router = useRouter();

  const unboxedLabel = receipt.unboxedAt ? formatDateTimePST(receipt.unboxedAt) : 'Already unboxed';
  // Server-resolved name wins:
  const unboxedBy = receipt.unboxedByName ?? unboxedByName ?? null;
  const poNumber = receipt.poNumber ?? null;

  // Search the PO when the carton has one, else the tracking number:
  const detailsQuery = poNumber ?? receipt.trackingNumber;

  return (
    // The receipt replaces the workbench body, so it takes the workbench
    // COLUMN — `max-w-lg` made it a narrow floating dialog that did not line up
    // with the identity bookmark still visible above it.
    <div
      className={cn(
        'flex h-full w-full items-center justify-center py-6',
        STATION_WORKBENCH_BODY_PAD_X,
      )}
    >
      <Panel
        padding="lg"
        elevation="overlay"
        className={STATION_WORKBENCH_COLUMN}
        role="status"
        aria-live="polite"
      >
        <div className="space-y-4">
          <div className="flex items-start gap-3">
            <span
              className={cn(
                'mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center bg-surface-sunken text-text-muted',
                // Flush, like every other filled box on a station surface —
                // `rounded-full` survives only for status dots, avatars and
                // Switch tracks, and a soft square is neither.
                cornerClass('flush'),
              )}
              aria-hidden="true"
            >
              <PackageOpen className="h-5 w-5" />
            </span>
            <div className="min-w-0 space-y-1">
              <p className="text-role-eyebrow text-text-soft">
                Already unboxed
              </p>
              <p className="text-role-title text-text-default">
                This carton&rsquo;s unbox work is done.
              </p>
              <p className="text-role-caption text-text-muted">
                Nothing was recorded against your name — this scan was logged as a lookup.
              </p>
            </div>
          </div>

          {/* One band at the workbench column width — 720px fits all four facts
              across, so the 2×2 grid was spending a second row on nothing. */}
          <div className="flex items-center justify-between gap-4 border-t border-border-soft pt-4">
            {poNumber ? (
              <Fact label="Purchase order">
                {/* Last-4 preview like every other PoChip call site (and like
                    the TrackingChip beside it) — the full number still copies. */}
                <PoChip value={poNumber} display={getLast8(poNumber)} />
              </Fact>
            ) : null}
            <Fact label="Tracking">
              <TrackingChip value={receipt.trackingNumber} />
            </Fact>
            <Fact label="Unboxed">{unboxedLabel}</Fact>
            <Fact label="Unboxed by">{unboxedBy ?? '—'}</Fact>
          </div>

          <div className="space-y-2 border-t border-border-soft pt-4">
            <Button
              variant="primary"
              size="lg"
              className="w-full"
              icon={<Search />}
              onClick={() => router.push(globalSearchHref(detailsQuery))}
            >
              Open package details
            </Button>
            <p className="text-center text-role-micro text-text-soft">
              Searches {poNumber ? `PO ${poNumber}` : 'this tracking number'} across orders, units
              and cartons.
            </p>
          </div>

          <div className="flex items-center justify-end gap-2">
            <Button variant="ghost" onClick={onOpenAnyway}>
              Open anyway
            </Button>
            <Button variant="secondary" onClick={onDismiss}>
              Done
            </Button>
          </div>
        </div>
      </Panel>
    </div>
  );
}
