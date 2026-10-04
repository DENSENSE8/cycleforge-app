'use client';

/**
 * TicketProductCard — the "Product sent to customer" card a support thread
 * paints for one `[[product:…]]` token or one logged `support_ticket_items`
 * row. Shared desk + phone: each host decides where it opens (desk → the `sku`
 * detail-stack peek via `onOpen`; phone → `/m/products/<sku>` via `href`).
 *
 * The card names the product BY REFERENCE (task-principles P6): it carries the
 * catalog id and reads the live face (identity title, photo, SKU — resolved
 * server-side by `resolveSkuIdentityTitle`) at view time; it never re-derives a
 * title on the client.
 *
 * PHRASING CONTENT ONLY: `renderBlockMarkdown` mounts this inside a `<p>`, so
 * the root is a `<button>` / `<a>` and every inner box is a `<span>` (block /
 * flex classes) or an `<img>` — never a `<div>`.
 */

import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { ItemRecordThumb } from '@/design-system/components/item-record/ItemRecordThumb';
import { focusRing } from '@/design-system/tokens/focus-ring';
import { useSupportProductFace } from '@/hooks/useSupportTicketItems';
import { TICKET_ITEM_ROLE_LABEL, type TicketItemRole } from '@/lib/support/product-token';
import type { SupportProductFace } from '@/lib/support/ticket-items-shared';
import { cn } from '@/utils/_cn';

const CARD_CLASS = cn(
  'ds-raw-button my-1 flex w-full max-w-sm items-center gap-3 rounded-mode border border-border-soft bg-surface-card p-2 text-left transition-colors hover:bg-surface-hover',
  focusRing('control'),
);

export function TicketProductCard({
  skuCatalogId,
  role,
  qty,
  product,
  onOpen,
  href,
  className,
}: {
  skuCatalogId: number;
  role: TicketItemRole;
  qty: number;
  /** The live face when the host already has it (a log row); else read by id. */
  product?: SupportProductFace;
  /** Desk: open the product peek. Ignored when `href` is set. */
  onOpen?: (face: SupportProductFace) => void;
  /** Phone: the product page this card links to. */
  href?: (face: SupportProductFace) => string;
  className?: string;
}) {
  const faceQuery = useSupportProductFace(product ? null : skuCatalogId);
  const face = product ?? faceQuery.data ?? null;
  const loading = !product && faceQuery.isLoading;

  const body = (
    <>
      <ItemRecordThumb
        imageUrl={face?.imageUrl ?? null}
        className="h-10 min-h-10 w-10 self-center rounded-mode-control"
        iconClassName="size-4"
      />
      <span className="block min-w-0 flex-1">
        {loading ? (
          // Skeleton bars as spans: the shared Skeleton is a <div>, which is
          // not phrasing content and would break the surrounding <p>.
          <>
            <span aria-hidden className="block h-3 w-3/4 animate-pulse bg-surface-sunken" />
            <span aria-hidden className="mt-1.5 block h-2.5 w-1/3 animate-pulse bg-surface-sunken" />
          </>
        ) : (
          <>
            <span className="block truncate text-role-caption font-medium text-text-default">
              {face?.title || 'Product unavailable'}
            </span>
            <span className="block truncate font-mono text-role-micro text-text-muted">
              {face?.sku ?? `Catalog #${skuCatalogId}`}
            </span>
          </>
        )}
      </span>
      <span className="flex shrink-0 flex-col items-end gap-1">
        <Badge variant="secondary">{TICKET_ITEM_ROLE_LABEL[role]}</Badge>
        <span className="text-role-micro tabular-nums text-text-muted">× {qty}</span>
      </span>
    </>
  );

  const label = face
    ? `${TICKET_ITEM_ROLE_LABEL[role]} × ${qty} — ${face.title} (SKU ${face.sku})`
    : `${TICKET_ITEM_ROLE_LABEL[role]} × ${qty}`;

  if (href && face) {
    return (
      <Link
        href={href(face)}
        aria-label={label}
        data-testid="ticket-product-card"
        data-sku-catalog-id={skuCatalogId}
        className={cn(CARD_CLASS, className)}
      >
        {body}
      </Link>
    );
  }

  return (
    <button
      type="button"
      aria-label={label}
      data-testid="ticket-product-card"
      data-sku-catalog-id={skuCatalogId}
      disabled={!face || (!onOpen && !href)}
      onClick={face && onOpen ? () => onOpen(face) : undefined}
      className={cn(CARD_CLASS, 'disabled:cursor-default disabled:hover:bg-surface-card', className)}
    >
      {body}
    </button>
  );
}
