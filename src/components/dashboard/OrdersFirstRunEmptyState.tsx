'use client';

import { useRouter } from 'next/navigation';
import { Inbox, Link2 } from '@/components/Icons';
import { Button, EmptyState } from '@/design-system/primitives';

/**
 * First-run (zero-orders) teaching state for the order boards. Distinct from the
 * search "no matches" variant ({@link OrderSearchEmptyState}): this fires only
 * when the board is empty AND no filter/search is active — a brand-new org that
 * hasn't connected a channel yet. It teaches where orders come from and offers
 * the primary "Connect a sales channel" CTA, rather than reading as broken.
 */
export function OrdersFirstRunEmptyState({
  title = 'No orders yet',
  description = 'Orders flow in automatically once you connect a sales channel — or import them from a CSV. Connect a channel to get started.',
}: {
  title?: string;
  description?: string;
}) {
  const router = useRouter();
  return (
    <EmptyState
      icon={<Inbox className="h-6 w-6 text-text-faint" />}
      title={title}
      description={description}
      action={
        <Button
          type="button"
          variant="primary"
          size="sm"
          icon={<Link2 className="h-4 w-4" />}
          onClick={() => router.push('/apps')}
        >
          Connect a sales channel
        </Button>
      }
    />
  );
}
