'use client';

/**
 * SentToCustomerStrip — every product logged on a ticket as sent to the
 * customer (`support_ticket_items`), newest first, each with who / when and a
 * remove. Shared desk + phone: the desk mounts it in the ticket's right-rail
 * Connections display, the phone under the `/m/t/[ticketId]` top bar.
 *
 * The ticket is the system of record for what we did for the customer (P7):
 * this strip reads the structured rows, never the comment text. Removing a row
 * undoes the RECORD only — the email already went out — so it asks first.
 * Hidden when nothing has been logged.
 */

import { X } from '@/components/Icons';
import { TicketProductCard } from '@/components/ui/TicketProductCard';
import { requestConfirm } from '@/design-system/components/confirm';
import { IconButton } from '@/design-system/primitives/IconButton';
import { useDeleteSupportTicketItem, useSupportTicketItems } from '@/hooks/useSupportTicketItems';
import { TICKET_ITEM_ROLE_LABEL } from '@/lib/support/product-token';
import type { SupportProductFace, SupportTicketItem } from '@/lib/support/ticket-items-shared';
import { cn } from '@/utils/_cn';
import { timeAgo } from '@/utils/_date';

export function SentToCustomerStrip({
  ticketId,
  onOpenProduct,
  productHref,
  touch = false,
  className,
}: {
  /** Zendesk ticket number. */
  ticketId: number;
  /** Desk: open the product peek. */
  onOpenProduct?: (face: SupportProductFace) => void;
  /** Phone: the product page a row links to. */
  productHref?: (face: SupportProductFace) => string;
  /** Phone: 44px remove target. */
  touch?: boolean;
  className?: string;
}) {
  const { data: items = [] } = useSupportTicketItems(ticketId);
  const remove = useDeleteSupportTicketItem(ticketId);

  if (items.length === 0) return null;

  const onRemove = async (it: SupportTicketItem) => {
    const ok = await requestConfirm({
      title: 'Remove from the ticket record?',
      description: `${TICKET_ITEM_ROLE_LABEL[it.role]} × ${it.qty} — ${it.product.title} comes off this ticket's record. The email already sent is not changed.`,
      confirmLabel: 'Remove',
      tone: 'danger',
    });
    if (ok) remove.mutate(it.id);
  };

  return (
    <section
      data-testid="sent-to-customer-strip"
      aria-label="Sent to customer"
      className={cn('flex flex-col gap-1.5', className)}
    >
      <p className="text-role-eyebrow text-text-soft">
        Sent to customer · {items.length}
      </p>
      <ul className="flex flex-col gap-1.5">
        {items.map((it) => (
          <li key={it.id} className="flex items-center gap-1.5" data-testid="sent-to-customer-item">
            <div className="min-w-0 flex-1">
              <TicketProductCard
                skuCatalogId={it.product.skuCatalogId}
                role={it.role}
                qty={it.qty}
                product={it.product}
                onOpen={onOpenProduct}
                href={productHref}
                className="my-0 max-w-none"
              />
              <p className="mt-0.5 truncate text-role-micro text-text-muted">
                {[it.staffName, timeAgo(it.createdAt)].filter(Boolean).join(' · ')}
              </p>
            </div>
            <IconButton
              icon={<X className="size-4" />}
              ariaLabel={`Remove ${it.product.title} from the ticket record`}
              title="Remove from the ticket record"
              size={touch ? 'touch' : 'sm'}
              radius="control"
              disabled={remove.isPending && remove.variables === it.id}
              onClick={() => void onRemove(it)}
              data-testid="sent-to-customer-remove"
            />
          </li>
        ))}
      </ul>
    </section>
  );
}
