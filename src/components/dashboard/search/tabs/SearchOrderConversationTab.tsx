'use client';

import type { ShippedOrder } from '@/types/orders';
import { Panel } from '@/design-system/primitives';
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

  // Chat needs a bounded height for its own message scroll + composer, so it
  // renders a fixed-height Panel inside the shell's lane (the lane scrolls; the
  // chat manages its own internal scroll).
  return (
    <div className="max-w-3xl">
      <Panel
        padding="none"
        className="flex h-[70vh] min-h-[28rem] flex-col overflow-hidden"
      >
        <div className="shrink-0 border-b border-border-hairline px-5 py-3">
          <h3 className="text-role-body font-bold text-text-default">Conversation</h3>
          <p className="mt-0.5 text-role-micro font-medium text-text-muted">
            Internal notes and linked support threads.
          </p>
        </div>
        <div className="flex min-h-0 flex-1 flex-col">
          <ThreadPanel entityType="ORDER" entityId={Number(order.id)} />
        </div>
      </Panel>
    </div>
  );
}
