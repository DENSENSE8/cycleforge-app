'use client';

/**
 * Support · Tickets — the thread's SPLIT header (Workbench branch
 * `service-workspace`).
 *
 *   ┌─ Panel (rounded-2xl, same shell as the queue card) ──────────────┐
 *   │ Row 1 — icon action row      Displays · Open      │ ⧉ · ×        │
 *   ├──────────────────────────────────────────────────────────────────┤
 *   │ Row 2 — dense identity       ● subject …                    #175 │
 *   └──────────────────────────────────────────────────────────────────┘
 *
 * **Why it is not `PaneHeader` itself.** `PaneHeader`'s shell is
 * `mainStickyHeaderClass` — a full-bleed, squared, bottom-bordered band. Beside
 * the rounded `MONITOR_SECTION_CARD_CLASS` queue card the thread replaces, that
 * squared edge reads as a seam, and it was the actual complaint. So this
 * composes the pane-header BLOCKS (`PaneHeaderActionBar`, `PaneHeaderCloseButton`)
 * onto a {@link Panel} whose radius, border and lift are the queue card's own —
 * the same primitives, a card shell instead of a page band. It is deliberately
 * NOT a fifth header grammar.
 *
 * **Why it is not `StationContextBar` / `CartonContextCard` either.** That is the
 * Unbox floating carton bookmark. Getting Support out of carton-bench chrome is
 * the whole branch ruling (`workbench-service.md`), and the guard pins it.
 *
 * Row order follows the house split-header grammar in
 * `display/right-rail-inspector.md`: actions on top, dense identity beneath,
 * dismiss at the far right of the action row. Identity stays caption-density via
 * {@link SupportTicketIdentity} — never a wrapping hero title.
 */

import type { ReactNode } from 'react';
import { ExternalLink, Layers } from '@/components/Icons';
import {
  PaneHeaderActionBar,
  PaneHeaderCloseButton,
  type PaneHeaderActionBarAction,
} from '@/components/ui/pane-header';
import { Panel } from '@/design-system/primitives';
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
  openLabel: string;
  /** Whether the right rail currently holds the ticket context. */
  contextOpen: boolean;
  onToggleContext: () => void;
  onClose: () => void;
  /** Secondary detail popover trigger — sits left of the dismiss control. */
  detailsSlot?: ReactNode;
}) {
  const actions: PaneHeaderActionBarAction[] = [
    {
      key: 'displays',
      // The rail is a non-modal push column with no scrim, so its close button
      // needs a way back. This is it — `active` mirrors the rail's own state so
      // the toggle never lies about what is on screen.
      //
      // It says "Displays", not "Connections": since 2026-08-02 the rail hosts
      // the whole display column (Connections · Conversations · Timeline), and
      // naming it after one of them would put two differently-scoped controls
      // called "Connections" on the same screen — this one opening the column,
      // the rail's own cell selecting inside it.
      label: 'Displays',
      icon: <Layers className="h-3.5 w-3.5" />,
      onClick: onToggleContext,
      active: contextOpen,
      title: contextOpen ? 'Hide displays' : 'Show displays',
    },
    ...(openUrl
      ? [
          {
            key: 'open-external',
            label: openLabel,
            icon: <ExternalLink className="h-3.5 w-3.5" />,
            onClick: () => window.open(openUrl, '_blank', 'noopener'),
          } satisfies PaneHeaderActionBarAction,
        ]
      : []),
  ];

  return (
    <Panel padding="none" radius="2xl" elevation="sm" className="shrink-0 overflow-hidden">
      {/* Row 1 — the only secondary action surface on this pane. */}
      <div className="flex items-center justify-between gap-2 border-b border-border-hairline px-1.5 py-1">
        <PaneHeaderActionBar variant="flat" iconOnly actions={actions} className="px-0 py-0" />
        <div className="flex shrink-0 items-center gap-1">
          {detailsSlot}
          {/* Mandatory: the thread has no scrim to click off, and Escape alone
              is not a visible dismiss. */}
          <PaneHeaderCloseButton
            onClick={onClose}
            ariaLabel="Back to tickets queue"
            title="Back to tickets queue"
          />
        </div>
      </div>

      {/* Row 2 — dense identity: status dot · subject · short durable key. */}
      <div className="flex min-w-0 items-center px-2.5 py-1.5">
        <SupportTicketIdentity ticket={ticket} fallbackId={ticketId} />
      </div>
    </Panel>
  );
}
