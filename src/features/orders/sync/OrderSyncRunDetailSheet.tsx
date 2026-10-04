'use client';

/** Which rows — the run's per-row record, one tap from the result. */

import { Sheet, SheetBody, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { microBadge } from '@/design-system/tokens/typography/presets';
import type {
  SyncRunDetail,
  SyncRunDetailGroup,
  SyncRunDetailTone,
} from '@/lib/orders-sync/run-detail';

/** Group heading ink. Tones are the house functional text tokens, not palette. */
const TONE_INK: Record<SyncRunDetailTone, string> = {
  success: 'text-text-success',
  info: 'text-text-info',
  warning: 'text-text-warning',
};

function DetailGroup({ group }: { group: SyncRunDetailGroup }) {
  return (
    <section className="border-t border-border-hairline py-3 first:border-t-0" data-group={group.id}>
      <div className="flex items-baseline justify-between gap-2">
        <h3 className={`${microBadge} ${TONE_INK[group.tone]}`}>{group.label}</h3>
        <p className="shrink-0 text-role-micro font-mono tabular-nums text-text-muted">
          {group.rows.length}
        </p>
      </div>
      {group.hint ? (
        <p className="mt-1 text-role-micro leading-relaxed text-text-muted">{group.hint}</p>
      ) : null}

      {group.rows.length > 0 ? (
        <ul className="mt-2 flex flex-col gap-1.5">
          {group.rows.map((row) => (
            <li key={row.key} className="flex items-baseline gap-2">
              <span className="shrink-0 font-mono text-role-micro text-text-soft">
                {row.orderId || '—'}
              </span>
              <span className="min-w-0 flex-1 break-words text-role-caption text-text-default">
                {row.title || 'Untitled'}
              </span>
              <span className="shrink-0 text-role-micro text-text-faint">
                {row.platform || row.source}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}

export function OrderSyncRunDetailSheet({
  open,
  onClose,
  detail,
}: {
  open: boolean;
  onClose: () => void;
  detail: SyncRunDetail;
}) {
  return (
    <Sheet open={open} onOpenChange={(next) => { if (!next) onClose(); }}>
      <SheetContent side="bottom" aria-describedby={undefined} className="md:max-w-lg">
        <SheetHeader className="shrink-0 border-b border-mode-rule px-mode-page py-3 pr-12">
          <SheetTitle>What this run did</SheetTitle>
        </SheetHeader>
        <SheetBody>
          {detail.groups.length === 0 ? (
            <p className="text-role-caption text-text-muted">
              This run reported no per-row detail — nothing was inserted or updated.
            </p>
          ) : (
            <div className="flex flex-col">
              {detail.groups.map((group) => (
                <DetailGroup key={group.id} group={group} />
              ))}
            </div>
          )}
        </SheetBody>
      </SheetContent>
    </Sheet>
  );
}
