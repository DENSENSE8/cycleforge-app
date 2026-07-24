'use client';

/**
 * Order-body support actions — live on the searched/open order itself (not the
 * header chrome) so context is already in view when the operator acts.
 *
 * Report an issue → Support · Orders create-ticket form (order-anchored).
 * Callers already on Support may pass `onReportIssue` to open the modal in place;
 * otherwise we deep-link via {@link supportCreateTicketHref}.
 */

import { useRouter } from 'next/navigation';
import { TicketHelp } from '@/components/Icons';
import { Button } from '@/design-system/primitives';
import { useAuth } from '@/contexts/AuthContext';
import { supportCreateTicketHref } from '@/components/sidebar/support/support-sidebar-shared';
import type { ShippedOrder } from '@/lib/neon/orders-queries';

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
  if (!canCreateTicket) return null;

  const orderPk = Number(shipped.id);

  return (
    <section aria-label="Support actions" className="space-y-2">
      <p className="text-role-eyebrow font-bold uppercase tracking-widest text-text-soft">
        Support
      </p>
      <div className="flex flex-wrap gap-2">
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
      </div>
    </section>
  );
}
