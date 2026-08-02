'use client';

import { Copy, MessageSquare, Send, Ticket } from '@/components/Icons';
import type { TerminalActionVm } from '@/lib/station-terminal';
import type { ThreadComposerBridge } from '@/components/threads/ThreadPanel';
import { toast } from '@/lib/toast';

const dockBase = {
  maxWidth: 'max-w-[45rem]' as const,
  fullWidth: true,
  docked: false as const,
  tone: 'accent' as const,
};

/**
 * Support · Tickets terminal — tab-aware SlicedActionDock (Unbox pattern).
 * Ticket / Conversations own submit via composer bridges; Timeline copies tracking.
 */
export function resolveSupportTerminal(input: {
  tabId: string;
  ticketBridge: ThreadComposerBridge | null;
  conversationBridge?: ThreadComposerBridge | null;
  /** Primary tracking from linkage — Timeline dock copy target. */
  tracking?: string | null;
}): TerminalActionVm | null {
  switch (input.tabId) {
    case 'ticket':
      return resolveTicketTerminal(input.ticketBridge);
    case 'conversations':
      return resolveConversationTerminal(input.conversationBridge ?? null);
    case 'timeline':
      return resolveTimelineTerminal(input.tracking ?? null);
    default:
      return null;
  }
}

function resolveTicketTerminal(bridge: ThreadComposerBridge | null): TerminalActionVm {
  const hasDraft = bridge?.hasDraft ?? false;
  const isPublic = bridge?.isPublic ?? false;
  const submitting = bridge?.submitting ?? false;
  const label = !hasDraft
    ? 'Reply'
    : isPublic
      ? submitting
        ? 'Sending…'
        : 'Send reply'
      : submitting
        ? 'Saving…'
        : 'Add note';

  return {
    ...dockBase,
    label,
    title: !bridge
      ? 'Ticket composer is loading'
      : !bridge.canPost
        ? 'You need helpdesk access to post'
        : !hasDraft
          ? 'Focus the ticket reply composer'
          : isPublic
            ? 'Send this reply to the customer'
            : 'Post this internal note',
    disabled: !bridge || !bridge.canPost || submitting,
    disabledReason: !bridge
      ? 'Ticket composer unavailable'
      : !bridge.canPost
        ? 'Missing helpdesk access'
        : null,
    loading: submitting,
    onClick: () => {
      if (!bridge) return;
      if (!bridge.hasDraft) {
        bridge.focus();
        return;
      }
      bridge.submit();
    },
    icon: hasDraft ? (
      <Send className="h-4 w-4 shrink-0" />
    ) : (
      <Ticket className="h-4 w-4 shrink-0" />
    ),
  };
}

function resolveConversationTerminal(bridge: ThreadComposerBridge | null): TerminalActionVm {
  const hasDraft = bridge?.hasDraft ?? false;
  const isPublic = bridge?.isPublic ?? false;
  const submitting = bridge?.submitting ?? false;
  const canPost = bridge?.canPost ?? false;
  const label = !hasDraft
    ? 'Add note'
    : isPublic
      ? submitting
        ? 'Posting…'
        : 'Post'
      : submitting
        ? 'Saving…'
        : 'Add note';

  return {
    ...dockBase,
    label,
    title: !bridge
      ? 'Warehouse thread is loading'
      : !canPost
        ? 'You need thread manage permission to post'
        : !hasDraft
          ? 'Focus the composer to write a note'
          : isPublic
            ? 'Post this note to the warehouse record'
            : 'Post this internal team note',
    disabled: !bridge || !canPost || submitting,
    disabledReason: !bridge
      ? 'Warehouse thread unavailable'
      : !canPost
        ? 'Missing permission to post'
        : null,
    loading: submitting,
    onClick: () => {
      if (!bridge) return;
      if (!bridge.hasDraft) {
        bridge.focus();
        return;
      }
      bridge.submit();
    },
    icon: <MessageSquare className="h-4 w-4 shrink-0" />,
  };
}

function resolveTimelineTerminal(tracking: string | null): TerminalActionVm {
  const value = String(tracking ?? '').trim();
  return {
    ...dockBase,
    label: value ? 'Copy tracking' : 'Timeline',
    title: value ? `Copy ${value}` : 'No tracking number linked to this ticket',
    disabled: !value,
    disabledReason: value ? null : 'No tracking number',
    onClick: () => {
      if (!value) return;
      void navigator.clipboard.writeText(value).then(
        () => toast.success('Tracking copied'),
        () => toast.error('Could not copy tracking'),
      );
    },
    icon: <Copy className="h-4 w-4 shrink-0" />,
  };
}
