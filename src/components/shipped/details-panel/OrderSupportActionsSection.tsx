'use client';

/**
 * Order-body support actions — live on the searched/open order itself (not the
 * header chrome) so context is already in view when the operator acts.
 *
 * Linked tickets strip (when any) → `/support?ticket=…` for Timeline/Connections.
 * Report an issue → Support · Orders create-ticket form (order-anchored); demoted
 * when an open/pending ticket already exists on the loop.
 *
 * Callers already on Support may pass `onReportIssue` to open the modal in place;
 * otherwise we deep-link via {@link supportCreateTicketHref}.
 */

import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { TicketHelp } from '@/components/Icons';
import { Button } from '@/design-system/primitives';
import { LinkedTicketsPanel } from '@/components/linkage/LinkedTicketsPanel';
import { useAuth } from '@/contexts/AuthContext';
import { supportCreateTicketHref } from '@/components/sidebar/support/support-sidebar-shared';
import type { OrderLinkage } from '@/lib/order-linkage';
import type { ShippedOrder } from '@/lib/neon/orders-queries';

function isOpenishTicketStatus(status: string | null | undefined): boolean {
  const s = (status ?? '').toLowerCase();
  if (!s) return true;
  if (s.includes('solved') || s.includes('closed')) return false;
  return true;
}

export function OrderSupportActionsSection({
  shipped,
  onReportIssue,
}: {
  shipped: ShippedOrder;
  /** When set (Support Orders focus), open create in place instead of navigating. */
  onReportIssue?: () => void;
}) {
  const router = useRouter();
  const { has, isLoaded } = useAuth();
  const canCreateTicket = !isLoaded || has('integrations.zendesk');
  const orderNumber = String(shipped.order_id || '').trim();
  const orderPk = Number(shipped.id);

  const { data: linkage } = useQuery<OrderLinkage>({
    queryKey: ['order-linkage', orderNumber, '', ''],
    enabled: Boolean(orderNumber) && canCreateTicket,
    staleTime: 30_000,
    queryFn: async () => {
      const params = new URLSearchParams({ order: orderNumber });
      const res = await fetch(`/api/order-linkage?${params.toString()}`);
      if (!res.ok) throw new Error(`order-linkage ${res.status}`);
      const json = await res.json();
      return json.linkage as OrderLinkage;
    },
  });

  const openTicket = (linkage?.tickets ?? []).find((t) => isOpenishTicketStatus(t.status));
  const preferOpenTicket = openTicket != null;

  if (!canCreateTicket && !orderNumber) return null;

  return (
    <section aria-label="Support actions" className="space-y-2">
      <p className="text-role-eyebrow uppercase tracking-widest text-text-soft">
        Support
      </p>

      {orderNumber ? (
        <LinkedTicketsPanel
          order={orderNumber}
          dense
          ticketsOnly
          ticketNav="support"
        />
      ) : null}

      {canCreateTicket ? (
        <div className="flex flex-wrap gap-2">
          {preferOpenTicket && openTicket ? (
            <Button
              type="button"
              variant="secondary"
              size="sm"
              icon={<TicketHelp className="h-3.5 w-3.5" />}
              ariaLabel={`Open linked ticket ${openTicket.label}`}
              onClick={() => {
                const id =
                  openTicket.zendeskTicketId ??
                  Number(String(openTicket.label).replace(/\D/g, ''));
                if (Number.isFinite(id) && id > 0) {
                  router.push(`/support?ticket=${id}`);
                }
              }}
            >
              Open ticket {openTicket.label}
            </Button>
          ) : (
            <Button
              type="button"
              variant="secondary"
              size="sm"
              icon={<TicketHelp className="h-3.5 w-3.5" />}
              ariaLabel="Report an issue — create a support ticket for this order"
              onClick={() => {
                if (onReportIssue) {
                  onReportIssue();
                  return;
                }
                router.push(supportCreateTicketHref(orderPk));
              }}
            >
              Report an issue
            </Button>
          )}
        </div>
      ) : null}
    </section>
  );
}
