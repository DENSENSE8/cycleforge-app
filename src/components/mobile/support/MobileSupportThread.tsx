'use client';

/**
 * The Support item's thread on the phone record — read from the LOCAL bundle
 * (`useSupportItem`, `GET /api/support/items/[id]`), never a helpdesk. Every
 * message, oldest → newest, in full (no "show earlier", no clamp), each in the
 * house `ConversationMessageCard` (internal notes amber with their chip).
 * The meta line names who and which way (Customer · Reply), the message
 * number and the exact time — printed, never hover-only. Under each message
 * its state, the desk's words (`supportMessageChip`): an inbound message is
 * waiting for our reply, answered by a named reply (#id) or closed as needing
 * none (with the reason); an outbound reply shows its delivery (and the
 * failure, when it failed).
 *
 * Authors and bodies go through the Support contact face: a marketplace relay
 * address is never painted (`supportContactFace`, `scrubRelayAddresses`).
 * Read-only: the record's dock adds notes and logs customer messages.
 */

import { SupportChip } from '@/components/ui/SupportChip';
import { ConversationMessageCard } from '@/design-system/primitives/ConversationMessageCard';
import { scrubRelayAddresses, supportContactFace } from '@/lib/support/contact-face';
import type { SupportItemView, SupportMessageView } from '@/lib/support/conversation/model';
import { supportMessageChip } from '@/lib/support/record/support-record-model';
import { formatMonthDayTimePST } from '@/utils/date';

const DIRECTION_WORD: Readonly<Record<SupportMessageView['direction'], string | null>> = {
  inbound: 'Customer',
  outbound: 'Reply',
  // The card's own "Internal note" chip says it.
  internal: null,
};

function authorName(m: SupportMessageView, item: SupportItemView): string {
  if (m.direction !== 'inbound') return m.author.staff?.name ?? m.author.label ?? 'Staff';
  // A label that is itself a relay address is not a name — the face falls back to the requester.
  const face = supportContactFace({
    name: m.author.label ?? item.requester.name,
    email: item.requester.email,
    handle: item.requester.handle,
  });
  return face.label ?? 'Customer';
}

export function MobileSupportThread({ item, messages }: { item: SupportItemView; messages: readonly SupportMessageView[] }) {
  if (messages.length === 0) {
    return <p className="px-mode-page py-6 text-center text-role-caption text-text-muted">No messages yet.</p>;
  }
  return (
    <ol className="flex flex-col px-mode-page py-2" aria-label="Messages" data-testid="mobile-support-thread">
      {messages.map((m) => {
        const chip = supportMessageChip(m);
        const reason = m.replyDisposition === 'no_reply_required' ? m.disposition?.reason : null;
        const direction = DIRECTION_WORD[m.direction];
        return (
          <li key={m.id} data-direction={m.direction}>
            <ConversationMessageCard
              internal={m.direction === 'internal'}
              data-testid={`mobile-support-message-${m.id}`}
              // The author rides the meta line (wraps) rather than the card's author slot (truncates):
              // phone record text is never cut (owner 2026-10-03).
              metaTrailing={
                <span className="flex min-w-0 flex-wrap items-center gap-x-1 gap-y-0.5 text-text-muted">
                  <span className="break-words font-semibold text-text-default">{authorName(m, item)}</span>
                  {direction ? <span>· {direction}</span> : null}
                  <span className="tabular-nums">· #{m.id}</span>
                  <time className="tabular-nums" dateTime={m.occurredAt}>
                    · {formatMonthDayTimePST(m.occurredAt)}
                  </time>
                </span>
              }
              footer={
                chip || reason || m.deliveryError ? (
                  <span className="flex flex-wrap items-center gap-1.5">
                    {chip ? <SupportChip tone={chip.tone} label={chip.label} testId={`mobile-support-message-state-${m.id}`} /> : null}
                    {reason ? <span className="break-words text-role-caption text-text-muted">{scrubRelayAddresses(reason)}</span> : null}
                    {m.deliveryError ? (
                      <span className="break-words text-role-caption text-text-danger">{scrubRelayAddresses(m.deliveryError)}</span>
                    ) : null}
                  </span>
                ) : null
              }
            >
              <p className="whitespace-pre-wrap break-words">{scrubRelayAddresses(m.body.trim())}</p>
            </ConversationMessageCard>
          </li>
        );
      })}
    </ol>
  );
}
