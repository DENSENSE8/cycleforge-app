'use client';

/** Hover card for Item-cell Bundle / Kit face (Shopify-like components list). */

import { cornerClass } from '@/design-system/tokens/radius';
import { cn } from '@/utils/_cn';
import type { KitFace } from '@/lib/orders/order-kit-composition';

type KitCompositionHoverCardProps = {
  face: KitFace;
};

export function KitCompositionHoverCard({ face }: KitCompositionHoverCardProps) {
  const heading = face.source === 'catalog_edge' ? 'Bundle components' : 'Kit contents';

  return (
    <div
      className={cn(
        'flex max-w-[18rem] flex-col gap-1.5 bg-surface-card p-2 text-left text-text-default shadow-sm',
        cornerClass('surface'),
      )}
      data-testid="kit-composition-hover-card"
    >
      <div className="text-role-micro font-semibold uppercase tracking-wide text-text-muted">
        {heading}
      </div>
      <ul className="flex max-h-48 flex-col gap-1.5 overflow-y-auto">
        {face.components.map((c) => (
          <li key={c.key} className="flex items-start gap-2">
            {c.thumbUrl ? (
              // eslint-disable-next-line @next/next/no-img-element -- catalog thumb
              <img
                src={c.thumbUrl}
                alt=""
                className={cn('size-8 shrink-0 object-cover', cornerClass('surface'))}
              />
            ) : (
              <span
                className={cn(
                  'flex size-8 shrink-0 items-center justify-center bg-surface-sunken text-role-micro text-text-muted',
                  cornerClass('surface'),
                )}
                aria-hidden
              >
                —
              </span>
            )}
            <div className="min-w-0 flex-1">
              {c.sku ? (
                <div className="truncate text-role-micro font-semibold text-text-muted">{c.sku}</div>
              ) : null}
              <div className="line-clamp-2 text-role-caption font-semibold leading-snug">{c.title}</div>
              <div className="text-role-micro text-text-muted">× {c.qty}</div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
