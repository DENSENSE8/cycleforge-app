'use client';

/**
 * Which rows — the run's per-row record, one tap from the result.
 *
 * "1 needs a fix" is a number an operator cannot act on. This is the answer to
 * the question it provokes, grouped by what to DO about each row: fixable
 * groups first, then what landed.
 *
 * ## Why a BottomSheet
 *
 * It is the house detail surface for a row on a phone (SURFACE_LAW §5: lists on
 * phone are cards plus this sheet) and it is legitimate desk chrome too, so one
 * component serves the run on both surfaces. It is deliberately NOT the
 * right-rail panel the deleted `OrderSyncDialog` used: that panel was a
 * desk-only occupant with a select-over-select header, and on a phone a rail is
 * not a surface.
 *
 * Grouping and tone come from {@link buildSyncRunDetail}, which is pure and
 * tested — this file only paints.
 */

import { BottomSheet } from '@/components/ui/BottomSheet';
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
    <BottomSheet
      open={open}
      onClose={onClose}
      title="What this run did"
      scrollBody
      maxWidth="34rem"
      fixedWidth
    >
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
    </BottomSheet>
  );
}
