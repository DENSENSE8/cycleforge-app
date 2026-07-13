'use client';

import { ExternalLink } from '@/components/Icons';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import { IconButton } from '@/design-system/primitives';
import { WorkspaceCard, InlineNotice } from '@/design-system/components';
import { Button } from '@/design-system/primitives';
import { ClaimTicketReply } from '@/components/receiving/workspace/claim/components/ClaimTicketReply';
import { useClaimTicketReply } from '@/components/receiving/workspace/claim/hooks/useClaimTicketReply';
import type { FiledTicket } from '@/components/receiving/workspace/claim/claim-types';
import { TicketThreadCard } from '@/components/support/TicketThreadCard';

/**
 * Comment on the line's linked Zendesk ticket straight from the testing page —
 * reuses the shared {@link ClaimTicketReply} composer (internal note by default,
 * or a public reply that emails the customer) driven by {@link useClaimTicketReply},
 * which posts to the same receiving-scoped thread route the claim modal uses.
 *
 * Rendered only when the line has a Zendesk-native linked ticket; the linkage
 * itself is shown by the carton header's ticket chip.
 */
export function TestingTicketReplyCard({
  ticketId,
  ticketNumber,
  ticketUrl,
  failed,
  onFileClaim,
}: {
  /** Zendesk-native ticket id (providerTicketId) — the thread route's key. */
  ticketId: number | null;
  /** Display number, e.g. "#9395". */
  ticketNumber?: string;
  /** Deep link to the ticket in Zendesk, if known. */
  ticketUrl?: string | null;
  /** True if the line or any unit has a 'TESTING_FAILED' verdict. */
  failed?: boolean;
  /** Callback to open the file claim modal. */
  onFileClaim: () => void;
}) {
  const reply = useClaimTicketReply({ open: !!ticketId, ticketId: ticketId ?? 0 });
  const filedTicket: FiledTicket | undefined = ticketId && ticketNumber ? { id: ticketId, number: ticketNumber, url: ticketUrl ?? null } : undefined;

  if (!ticketId && !failed) {
    return null;
  }

  return (
    <WorkspaceCard
      label="Support ticket"
      bodyClassName="p-4"
      actions={
        ticketUrl ? (
          <HoverTooltip label="Open ticket in Zendesk" asChild>
            <IconButton
              icon={<ExternalLink className="h-4 w-4" />}
              ariaLabel="Open ticket in Zendesk"
              tone="accent"
              onClick={() => window.open(ticketUrl, '_blank', 'noopener,noreferrer')}
            />
          </HoverTooltip>
        ) : undefined
      }
    >
      {!ticketId ? (
        <div className="flex flex-col items-center justify-center space-y-3 py-6">
          <p className="text-sm text-text-muted text-center max-w-sm">
            This unit failed testing but has no support ticket attached.
          </p>
          <Button onClick={onFileClaim} variant="danger">
            File claim
          </Button>
        </div>
      ) : (
        <TicketThreadCard
          ticketId={ticketId}
          replyProps={filedTicket ? { reply, filedTicket } : undefined}
          className="border-none"
        />
      )}
    </WorkspaceCard>
  );
}
