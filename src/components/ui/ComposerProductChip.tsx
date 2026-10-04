'use client';

/**
 * "Product sent to customer" picks waiting in the ticket composer's tray —
 * desk inset beside CC/photos, phone above the textarea (owner 2026-10-03).
 * A pick is a removable chip, never inline body text: the body carries the
 * token only at send time, and the logged row is the record (task-principles
 * P7). The title shown is the API's pre-resolved identity title (P6: the chip
 * names the product, it does not copy or rewrite it).
 */

import { Package, X } from '@/components/Icons';
import { IconButton } from '@/design-system/primitives';
import { cornerClass } from '@/design-system/tokens/radius';
import { chipLabel } from '@/design-system/tokens/typography/presets';
import type { ComposerProductPick } from '@/lib/composer/use-ticket-composer';
import { TICKET_ITEM_ROLE_LABEL } from '@/lib/support/product-token';
import { cn } from '@/utils/_cn';

export function ComposerProductChips({
  picks,
  onRemove,
  size = 'compact',
  className,
}: {
  picks: readonly ComposerProductPick[];
  onRemove: (clientEventId: string) => void;
  /** `compact` — the desk inset; `touch` — the phone dock (44px remove target). */
  size?: 'compact' | 'touch';
  className?: string;
}) {
  if (picks.length === 0) return null;
  return (
    <div data-testid="composer-product-chips" className={cn('flex flex-wrap gap-1.5', className)}>
      {picks.map((pick) => (
        <ComposerProductChip key={pick.clientEventId} pick={pick} onRemove={onRemove} size={size} />
      ))}
    </div>
  );
}

function ComposerProductChip({
  pick,
  onRemove,
  size,
}: {
  pick: ComposerProductPick;
  onRemove: (clientEventId: string) => void;
  size: 'compact' | 'touch';
}) {
  const touch = size === 'touch';
  const { product, role, qty } = pick;
  const roleLine = `${TICKET_ITEM_ROLE_LABEL[role]} × ${qty}`;
  const thumb = touch ? 'size-8' : 'size-5';
  return (
    <div
      data-testid="composer-product-chip"
      data-sku={product.sku}
      data-role={role}
      className={cn(
        'inline-flex min-w-0 max-w-full items-center gap-1.5 border border-border-soft bg-surface-card text-text-default',
        cornerClass('pill'),
        touch ? 'min-h-11 py-1 pl-1.5' : 'h-7 pl-1',
      )}
    >
      {product.imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- catalog photos are remote, unsized thumbnails
        <img
          src={product.imageUrl}
          alt=""
          className={cn('shrink-0 bg-surface-sunken object-cover', thumb, cornerClass('pill'))}
        />
      ) : (
        <span
          className={cn(
            'flex shrink-0 items-center justify-center bg-surface-sunken text-text-faint',
            thumb,
            cornerClass('pill'),
          )}
        >
          <Package className="size-3" aria-hidden />
        </span>
      )}
      <span className={cn('min-w-0', touch ? 'flex flex-col gap-0.5' : 'flex items-baseline gap-1')}>
        <span className={cn(chipLabel, 'min-w-0 break-words', !touch && 'max-w-40 truncate')} title={product.title}>
          {product.title}
        </span>
        <span className="shrink-0 text-role-micro text-text-muted">{roleLine}</span>
      </span>
      <IconButton
        onClick={() => onRemove(pick.clientEventId)}
        ariaLabel={`Remove ${product.title}`}
        icon={<X className="size-3" />}
        size={touch ? 'touch' : 'xs'}
        radius="pill"
        className="shrink-0"
        data-testid="composer-product-chip-remove"
      />
    </div>
  );
}
