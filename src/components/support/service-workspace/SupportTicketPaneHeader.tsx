'use client';

/** Support · Tickets — the thread's SPLIT header (Workbench branch `service-workspace`). */

import type { ReactNode } from 'react';
import { ChevronLeft, ColumnsTwo, ExternalLink } from '@/components/Icons';
import {
  ConversationHeaderActionButton,
  Panel,
} from '@/design-system/primitives';
import { CONVERSATION_HEADER_ACTION_GLYPH } from '@/design-system/primitives/conversation-chrome';
import type { SupportContextTicket } from '@/lib/support/context-types';
import { SupportTicketIdentity } from './SupportTicketIdentity';

export function SupportTicketPaneHeader({
  ticket,
  ticketId,
  openUrl,
  openLabel,
  contextOpen,
  onToggleContext,
  onClose,
  detailsSlot,
}: {
  ticket: SupportContextTicket | null;
  /** `?ticket=` value — the identity fallback while the bundle loads. */
  ticketId: number;
  /** Provider deep link; omitted while the bundle resolves the runtime provider. */
  openUrl: string | null;
  /**
   * Deep-link tooltip — connected helpdesk provider face
   * (`Open in Zendesk`), from {@link useCapabilityProviderLabel}.
   */
  openLabel: string;
  /** Whether the right rail currently holds the ticket context. */
  contextOpen: boolean;
  onToggleContext: () => void;
  onClose: () => void;
  /** Ticket-details popover — between open-external and inspector. */
  detailsSlot?: ReactNode;
}) {
  return (
    <Panel padding="none" radius="none" elevation="none" className="shrink-0 overflow-hidden">
      {/* One chrome plane — actions + identity; no hairline split. */}
      <div className="flex items-center justify-between gap-2 px-1.5 pt-1">
        <ConversationHeaderActionButton
          label="Back to tickets queue"
          icon={<ChevronLeft className="h-3.5 w-3.5" aria-hidden />}
          onClick={onClose}
          data-testid="support-ticket-back-to-list"
        />
        <div className="flex shrink-0 items-center gap-1">
          {openUrl ? (
            <ConversationHeaderActionButton
              label={openLabel}
              icon={<ExternalLink className={CONVERSATION_HEADER_ACTION_GLYPH} aria-hidden />}
              onClick={() => {
                window.open(openUrl, '_blank', 'noopener,noreferrer');
              }}
              data-testid="support-ticket-open-helpdesk"
            />
          ) : null}
          {detailsSlot}
          <ConversationHeaderActionButton
            label={contextOpen ? 'Hide inspector' : 'Show inspector'}
            icon={<ColumnsTwo className={CONVERSATION_HEADER_ACTION_GLYPH} aria-hidden />}
            onClick={onToggleContext}
            active={contextOpen}
            data-testid="support-ticket-toggle-inspector"
          />
        </div>
      </div>

      <div className="flex min-w-0 items-center px-2.5 pb-1.5 pt-1">
        <SupportTicketIdentity ticket={ticket} fallbackId={ticketId} />
      </div>
    </Panel>
  );
}
