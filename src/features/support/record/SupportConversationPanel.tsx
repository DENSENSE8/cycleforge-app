'use client';

/**
 * The open Support item's conversation — the record's whole body — read from
 * the LOCAL `/api/support/items/[id]` (zero provider reads). No facts band:
 * the title, the status verb (top-right) and, beside a split, the table say
 * what the item is. Top to bottom:
 *
 *   "Customer or internal?" (only while unclassified — the staffer must answer)
 *   a check-in's delivery facts (post-purchase check-ins only)
 *   the thread, each message with its state and its verbs
 *   Log customer message (a message received elsewhere; not on internal records)
 *   the live AI draft (customer conversations only)
 *   after a reply went out: the next step (its Resolve unfolds the status verb's flow)
 *   ─ the ONE composer (TicketComposer, Support-item mode) pinned at the foot
 */

import { useEffect, useRef, useState } from 'react';
import { TicketComposer } from '@/components/composer/TicketComposer';
import type { ThreadComposerBridge } from '@/components/threads/ThreadPanel';
import { SupportCheckInFacts } from './SupportCheckInFacts';
import { SupportDraftCard } from './SupportDraftCard';
import { SupportMessageList } from './SupportMessageList';
import { SupportNextStep } from './SupportNextStep';
import { SupportPurposeAck } from './SupportPurposeAck';
import { SupportLogCustomerMessage } from './SupportLogCustomerMessage';
import { supportComposerMode } from '@/lib/support/record/support-record-model';
import { useSupportItem } from '@/lib/support/record/use-support-item';
import { useSupportNextStepOpen } from '@/lib/support/record/next-step-store';

/** The conversation's reading column. */
const COLUMN = 'mx-auto flex w-full max-w-2xl flex-col';

export function SupportConversationPanel({
  supportItemId,
  nowMs,
  onResolve,
}: {
  supportItemId: number;
  nowMs: number;
  /** The after-reply Resolve choice: unfolds the status verb's guarded flow (top-right). */
  onResolve: () => void;
}) {
  const { data, isLoading, error } = useSupportItem(supportItemId);
  const [bridge, setBridge] = useState<ThreadComposerBridge | null>(null);
  // Owed by the write that answered the customer; keyed by item, so a refetch or remount never loses it.
  const nextStepOwed = useSupportNextStepOpen(supportItemId);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const messageCount = data?.messages.length ?? 0;

  // The newest message is at the foot, beside the composer: land there when the thread grows.
  useEffect(() => {
    const el = scrollRef.current;
    if (el && messageCount > 0) el.scrollTop = el.scrollHeight;
  }, [messageCount]);

  if (isLoading) {
    return (
      <div className={`${COLUMN} gap-2 px-4 pt-2`} aria-busy>
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="h-14 animate-pulse rounded-2xl bg-surface-sunken/70" />
        ))}
      </div>
    );
  }
  if (error || !data) {
    return (
      <p role="alert" className="px-4 pt-3 text-role-caption text-text-danger">
        {error?.message ?? 'This Support item could not be read.'}
      </p>
    );
  }

  const { item, messages, drafts } = data;
  const mode = supportComposerMode(item.purpose);
  const live = item.lifecycle !== 'resolved';

  return (
    <div className="flex min-h-0 flex-1 flex-col" data-testid="support-conversation" data-support-purpose={item.purpose}>
      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto px-4 pb-4 @lg:px-5">
        <div className={`${COLUMN} gap-3 pt-1`}>
          {mode === 'unclassified' ? <SupportPurposeAck item={item} /> : null}
          <SupportCheckInFacts item={item} />
          <SupportMessageList item={item} messages={messages} nowMs={nowMs} />
          {/* A message received elsewhere joins the thread here — on a resolved item it reopens it, like any customer message. */}
          {mode !== 'internal_record' ? <SupportLogCustomerMessage supportItemId={item.id} nowMs={nowMs} /> : null}
          {mode === 'customer' && live ? <SupportDraftCard supportItemId={item.id} draft={drafts[0] ?? null} bridge={bridge} /> : null}
          {/* Resolve keeps the step owed until it lands, so a cancelled resolve brings the choice back. */}
          {nextStepOwed && mode === 'customer' && live ? <SupportNextStep supportItemId={item.id} onResolve={onResolve} /> : null}
        </div>
      </div>
      <div className="shrink-0 px-4 pb-3 @lg:px-5">
        <div className={COLUMN}>
          <TicketComposer
            key={item.id}
            supportItem={{
              id: item.id,
              purpose: item.purpose,
              transport: item.transport,
              taskId: item.task?.id ?? null,
            }}
            onBridgeChange={setBridge}
          />
        </div>
      </div>
    </div>
  );
}
