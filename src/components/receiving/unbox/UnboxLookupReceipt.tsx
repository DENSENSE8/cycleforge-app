'use client';

/**
 * "Already unboxed" receipt — the read-only outcome of scanning a carton whose
 * unbox work is finished.
 *
 * Why a card and not a toast: the Station contract says an outcome is a big
 * card state the operator can read from three feet away with their hands full,
 * never a 4-second corner toast (`.claude/rules/display/station.md` §6).
 *
 * Why read-only: the scan did not claim the work server-side (no
 * `scanned_by` overwrite, no `UNBOX_SCAN_OPENED`), so the pane must not present
 * the work editor as if it had. The primary action is therefore **Open package
 * details** — a search jump, not an editor — because someone scanning a
 * finished box is asking "what happened to this?", not "let me change it".
 * "Open anyway" survives as the deliberate escape (degrade, don't block),
 * demoted to a quiet ghost so it is a second thought, not the default.
 *
 * Surface + depth come from the SoT: `Panel elevation="overlay"` resolves via
 * `elevationClass('overlay')`. This card floats ABOVE the editor it covers, so
 * it sits on the overlay plane — not the `raised` plane an in-flow card uses,
 * and never a hand-rolled `shadow-*`. Actions compose `Button`; identifiers
 * compose the `CopyChip` family. Nothing here re-types a shell.
 */

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
      <p className="text-role-micro uppercase tracking-widest text-text-soft">{label}</p>
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
  // Server-resolved name wins: it is read off the carton at classification
  // time, while the workspace-row fallback is often still hydrating when the
  // receipt paints — which is why sourcing it from the row alone left the fact
  // silently blank on the scan rungs.
  const unboxedBy = receipt.unboxedByName ?? unboxedByName ?? null;
  const poNumber = receipt.poNumber ?? null;

  // Search the PO when the carton has one, else the tracking number: an unfound
  // carton has no PO, and falling back keeps the primary action live rather
  // than rendering a dead button. Either query resolves through hybrid search
  // to the carton, its order and its units — the "what happened to this?"
  // answer — instead of dropping the operator back into an editor.
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
              className="mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-surface-sunken text-text-muted"
              aria-hidden="true"
            >
              <PackageOpen className="h-5 w-5" />
            </span>
            <div className="min-w-0 space-y-1">
              <p className="text-role-eyebrow uppercase tracking-widest text-text-soft">
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
