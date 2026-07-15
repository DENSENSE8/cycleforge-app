'use client';

import { Printer, Send, Ticket } from '@/components/Icons';
import type { TerminalActionVm } from '@/lib/station-terminal';
import type { TestingTerminalInput } from './types';

/**
 * Testing terminal — most tabs share Pass · Print (mode-default). Claim tab
 * swaps to Send / Add note (or File claim when failed with no ticket).
 */
export function resolveTestingTerminal(
  kind: string,
  input: TestingTerminalInput,
): TerminalActionVm | null {
  if (kind === 'claim') {
    if (input.claimTicketId != null && input.claimReply) {
      const reply = input.claimReply;
      const isPublic = reply.isPublic;
      return {
        label: isPublic ? 'Send to customer' : 'Add note',
        title: isPublic
          ? 'Send a public reply that emails the customer'
          : 'Add an internal note — not emailed',
        disabled: !reply.body.trim() || reply.sending,
        loading: reply.sending,
        onClick: () => void reply.send(),
        icon: <Send className="h-4 w-4 shrink-0" />,
        // Staff theme via StationTerminalDock assignedTechId (accent = operator tone).
        tone: 'accent',
        maxWidth: 'max-w-[45rem]',
        fullWidth: true,
        docked: false,
      };
    }
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
    return null;
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
