'use client';

import type { ShippedOrder } from '@/types/orders';
import { ThreadPanel } from '@/components/threads/ThreadPanel';
import { SearchOrderTabFrame } from '@/components/dashboard/search/SearchOrderTabFrame';

export function SearchOrderConversationTab({ order }: { order: ShippedOrder }) {
  if (!order.id) {
    return (
      <SearchOrderTabFrame
        title="Conversation"
        empty={{ title: 'No conversation', body: 'Threads appear after the order is loaded.' }}
      />
    );
  }

  return (
    <SearchOrderTabFrame
      title="Conversation"
      description="Internal notes and linked support threads."
      className="min-h-0 [&>div:last-child]:flex [&>div:last-child]:min-h-0 [&>div:last-child]:flex-col [&>div:last-child]:overflow-hidden [&>div:last-child]:p-0"
    >
      <div className="flex min-h-[24rem] flex-1 flex-col">
        <ThreadPanel entityType="ORDER" entityId={Number(order.id)} />
      </div>
    </SearchOrderTabFrame>
  );
}
