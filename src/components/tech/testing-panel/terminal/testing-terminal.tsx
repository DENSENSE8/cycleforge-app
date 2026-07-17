'use client';

import { Printer, Send, Ticket } from '@/components/Icons';
import type { TerminalActionVm } from '@/lib/station-terminal';
import type { TestingTerminalInput } from './types';

/**
 * Testing terminal — most tabs share Pass · Print (mode-default). Ticket tab
 * exposes File claim when testing failed and no ticket exists; ticket replies
 * are owned by the shared SupportTicketDetail composer.
 */
export function resolveTestingTerminal(
  kind: string,
  input: TestingTerminalInput,
): TerminalActionVm | null {
  if (kind === 'ticket') {
    if (input.claimFailedNoTicket && input.onFileClaim) {
      return {
        label: 'File claim',
        title: 'File a support claim for this failed unit',
        disabled: false,
        onClick: () => input.onFileClaim?.(),
        icon: <Ticket className="h-4 w-4 shrink-0" />,
        tone: 'red',
        maxWidth: 'max-w-[45rem]',
        fullWidth: true,
        docked: false,
      };
    }
    if (input.ticketId == null) return null;

    const bridge = input.ticketBridge;
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
      tone: 'accent',
      maxWidth: 'max-w-[45rem]',
      fullWidth: true,
      docked: false,
    };
  }

  if (kind !== 'mode-default') return null;
  return {
    label: input.primaryLabel,
    title: input.primaryTitle,
    disabled: input.primaryDisabled,
    loading: input.isPrinting,
    onClick: () => void input.onPrimary(),
    icon: <Printer className="h-4 w-4 shrink-0" />,
    tone: 'accent',
    maxWidth: 'max-w-[45rem]',
    fullWidth: true,
    docked: false,
  };
}
