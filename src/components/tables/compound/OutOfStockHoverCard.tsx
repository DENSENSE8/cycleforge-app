'use client';

/** Product card for the Item-track Out-of-stock triangle hover. */

import { cornerClass } from '@/design-system/tokens/radius';
import { elevationClass } from '@/design-system/tokens/shadows';
import { cn } from '@/utils/_cn';

export type OutOfStockHoverCardProps = {
  thumbUrl?: string | null;
  sku?: string | null;
  title: string;
  qtyShort: number;
  /** Kit-short paints the component; rollup lists multiple short SKUs. */
  kind?: 'listing' | 'kit_part' | 'rollup';
  rollupSkus?: readonly string[];
  pipelineLabel?: string | null;
};

export function OutOfStockHoverCard({
  thumbUrl,
  sku,
  title,
  qtyShort,
  kind = 'listing',
  rollupSkus,
  pipelineLabel,
}: OutOfStockHoverCardProps) {
  const qty = Number.isFinite(qtyShort) && qtyShort > 0 ? qtyShort : 1;
  const skuLine =
    kind === 'rollup' && rollupSkus && rollupSkus.length > 0
      ? rollupSkus.join(' · ')
      : String(sku || '').trim();

  return (
    <div
      className={cn(
        'flex max-w-[16rem] items-start gap-2 border border-border-soft bg-surface-card p-2 text-left text-text-default',
        cornerClass('surface'),
        elevationClass('overlay'),
      )}
      data-testid="oos-hover-card"
    >
      {thumbUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- catalog thumb URL; not a layout image
        <img
          src={thumbUrl}
          alt=""
          className={cn('size-10 shrink-0 object-cover', cornerClass('surface'))}
        />
      ) : (
        <span
          className={cn(
            'flex size-10 shrink-0 items-center justify-center bg-surface-sunken text-role-micro text-text-muted',
            cornerClass('surface'),
          )}
          aria-hidden
        >
          —
        </span>
      )}
      <div className="min-w-0 flex-1">
        {skuLine ? (
          <div className="truncate text-role-micro font-semibold text-text-muted">{skuLine}</div>
        ) : null}
        <div className="line-clamp-2 text-role-caption font-semibold leading-snug">{title}</div>
        <div className="mt-0.5 text-role-micro font-medium text-text-danger">
          {kind === 'rollup' ? `${qty} short` : `short ${qty}`}
        </div>
        {pipelineLabel ? (
          <div className="mt-0.5 text-role-micro font-medium text-text-muted">{pipelineLabel}</div>
        ) : null}
      </div>
    </div>
  );
}
