'use client';

/**
 * One product on the triage shelf — the counter's tile, ported (see
 * `triage-shelf-tokens.ts`): photo, two-line title, price (green) + SKU,
 * availability, an optional kind tag ("Repair service"), and the ×N pip once it
 * is on the cart. The whole tile adds one; tapping again adds another.
 *
 * `option` — the tile is a row of a find listbox (↑/↓ + Enter from the field):
 * the `<li>` is the option (`id` for `aria-activedescendant`), the button is out
 * of the tab order, and `active` paints the highlight. Without it the tile is a
 * plain grid cell with a focusable button.
 */

import { Package } from '@/components/Icons';
import { KeyboardKey } from '@/design-system/primitives';
import { focusRing } from '@/design-system/tokens/focus-ring';
import { cn } from '@/utils/_cn';
import {
  TRIAGE_SHELF_CAPTION,
  TRIAGE_SHELF_CARD,
  TRIAGE_SHELF_CARD_ACTIVE,
  TRIAGE_SHELF_CARD_IN_CART,
  TRIAGE_SHELF_CELL,
  TRIAGE_SHELF_COUNT_PIP,
  TRIAGE_SHELF_EAGER_TILES,
  TRIAGE_SHELF_IMAGE_WELL,
  TRIAGE_SHELF_META,
  TRIAGE_SHELF_PRICE,
  TRIAGE_SHELF_TAG,
  TRIAGE_SHELF_TITLE,
} from './triage-shelf-tokens';

export interface TriageShelfTileProps {
  title: string;
  imageUrl: string | null;
  /** Formatted price, or `null` when the shelf has none. */
  price: string | null;
  sku: string;
  /** "N in stock · bin" — already worded; omitted when empty. */
  availability?: string;
  /** Kind mark, e.g. "Repair service". */
  tag?: string | null;
  /** Units on the cart. */
  inCart: number;
  /** Position in the grid — the first rows load their photo eagerly. */
  index: number;
  onAdd: () => void;
  testId: string;
  /** Listbox row of a find list; see the file note. */
  option?: { id: string; active: boolean; onHover: () => void };
}

export function TriageShelfTile({ title, imageUrl, price, sku, availability, tag, inCart, index, onAdd, testId, option }: TriageShelfTileProps) {
  const eager = index < TRIAGE_SHELF_EAGER_TILES;
  return (
    <li
      id={option?.id}
      role={option ? 'option' : undefined}
      aria-selected={option ? option.active : undefined}
      onMouseEnter={option?.onHover}
      className={TRIAGE_SHELF_CELL}
    >
      {/* ds-raw-button: the shelf tile — photo + caption card, not a Button shape */}
      <button
        type="button"
        tabIndex={option ? -1 : undefined}
        onClick={onAdd}
        className={cn(
          TRIAGE_SHELF_CARD,
          inCart > 0 && TRIAGE_SHELF_CARD_IN_CART,
          option?.active && TRIAGE_SHELF_CARD_ACTIVE,
          focusRing('control', 'neutral'),
        )}
        aria-label={inCart > 0 ? `Add ${title}, ${inCart} in cart` : `Add ${title}`}
        data-testid={testId}
      >
        <div className={TRIAGE_SHELF_IMAGE_WELL}>
          {imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- catalog photos are remote, unsized thumbnails
            <img
              src={imageUrl}
              alt=""
              className="h-full w-full object-cover"
              loading={eager ? 'eager' : 'lazy'}
              fetchPriority={eager ? 'high' : undefined}
              decoding="async"
              width={400}
              height={400}
            />
          ) : (
            <span className="flex h-full w-full items-center justify-center text-mode-muted">
              <Package className="size-6" aria-hidden />
            </span>
          )}
          {inCart > 0 ? (
            <span className={TRIAGE_SHELF_COUNT_PIP} aria-hidden data-testid="triage-shelf-count">
              ×{inCart}
            </span>
          ) : null}
        </div>
        <div className={TRIAGE_SHELF_CAPTION}>
          <p className={TRIAGE_SHELF_TITLE}>{title}</p>
          <div className="flex items-end justify-between gap-1">
            <span className={price ? TRIAGE_SHELF_PRICE : cn(TRIAGE_SHELF_META, 'text-role-caption')}>{price ?? '—'}</span>
            {sku ? <span className={cn('max-w-[55%] truncate text-right', TRIAGE_SHELF_META)}>{sku}</span> : null}
          </div>
          {availability || tag || option?.active ? (
            <span className={cn('flex items-center justify-between gap-1', TRIAGE_SHELF_META)}>
              <span className="truncate">{availability}</span>
              {tag ? <span className={TRIAGE_SHELF_TAG}>{tag}</span> : null}
              {option?.active ? <KeyboardKey size="xs">↵</KeyboardKey> : null}
            </span>
          ) : null}
        </div>
      </button>
    </li>
  );
}
