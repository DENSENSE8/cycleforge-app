'use client';

import { useEffect, useRef, useState } from 'react';
import { DetailStackRailRegistrar } from '@/components/right-rail/DetailStackRailRegistrar';
// Direct, not via the barrel this file is itself exported from — a member
// importing its own barrel is a module cycle.
import { SupportContextHub } from './SupportContextHub';
import { DeskRailChromeRow } from '@/components/right-rail/DeskRailChromeRow';
import { PaneHeaderLabel } from '@/components/ui/pane-header';
import { SectionTabsSlider, type SectionTab } from '@/design-system/components';
import type { SupportContextAnchor } from '@/hooks/useSupportContext';

export interface SupportContextDetailPanelProps {
  ticketId: number;
  anchor: SupportContextAnchor;
  open: boolean;
  onClose: () => void;
  embedded?: boolean;
  /**
   * Whether this occupant reflows the work surface (`true`) or floats over it
   * (`false`).
   *
   * **Required on purpose — never defaulted.** The house default is push, but
   * this panel has two hosts with opposite answers, and a default is a silent
   * opt-out that every call site you did not visit takes automatically
   * (`backend-patterns.md` → a safety classification is a required parameter).
   * Making it required turns a missed host into a compile error.
   */
  push: boolean;
  /**
   * Opt-in DISPLAYS — the right edge as a display column, one showing at a
   * time, switched by a `density="icon"` strip (the Unbox Displays shape;
   * `display/station-workbench.md`). `/support` passes Connections ·
   * Conversations · Timeline · Assist.
   *
   * Omit for the historical body — linkage strip above the hub's own
   * Customer | Team | Activity pills, which is what the Unbox "Links" rail has
   * always shown and what its badge promises.
   *
   * **Assist landed 2026-08-02**, and the condition this docblock used to state
   * is what unblocked it: the AI display was absent because
   * `SupportSuggestionPanel` had no bridge into any composer, so it would have
   * rendered a control that could not deliver its draft anywhere.
   * `ThreadComposerBridge.setDraft` is that bridge; the panel it replaced was
   * deleted rather than left beside its successor. The rule stands unchanged —
   * a display that cannot do its job is worse absent than mounted empty.
   */
  displays?: SectionTab[];
  /**
   * Ask the rail to show a particular display — e.g. Assist, the moment an
   * image is pasted onto the ticket.
   *
   * **The intent travels as DATA, never as a timed event.** Opening the rail is
   * a state change this panel may only mount *after*, so a dispatched event
   * would fire into an empty room (the same trap Unbox hit with a
   * `requestAnimationFrame` dispatch at `CartonMatchHub`). `focusRequestId` is
   * what makes a repeat ask work: selecting Assist twice in a row is the same
   * `focusDisplay` and a different request.
   */
  focusDisplay?: string;
  focusRequestId?: number;
}

/**
 * Ticket linkage / team / activity in the global detail-stack shell
 * ({@link DetailStackRailRegistrar} → the one `RightRailHost` slot).
 *
 * NON-MODAL (`modal={false}`): reference context read BESIDE the ticket thread —
 * a scrim would hide the very conversation the linkage is about. A non-modal
 * surface has no backdrop to click off, so the header close button is mandatory.
 *
 * **This is the only right-edge home for ticket context.** `ServiceWorkspaceShell`
 * shipped a private `<aside>` rendering the same `SupportContextHub` until
 * 2026-08-01 — a second permanent consumer of the right edge, which is exactly
 * what `lib/right-rail/store.ts` exists to prevent. It was deleted rather than
 * migrated: this panel was already correct.
 */
export function SupportContextDetailPanel({
  ticketId,
  anchor,
  open,
  onClose,
  embedded = false,
  push,
  displays,
  focusDisplay,
  focusRequestId = 0,
}: SupportContextDetailPanelProps) {
  // A display the caller no longer offers must not strand the rail on an empty
  // body — `SectionTabsSlider` resolves an unknown id back to the first tab, so
  // the empty seed is deliberate rather than a missing default.
  const [display, setDisplay] = useState('');

  // Read on mount as well as on change, so a request made while this panel was
  // still closed is honoured the moment it opens.
  const lastFocusRequest = useRef(0);
  useEffect(() => {
    if (!focusDisplay || focusRequestId === lastFocusRequest.current) return;
    lastFocusRequest.current = focusRequestId;
    setDisplay(focusDisplay);
  }, [focusDisplay, focusRequestId]);
  const variant = embedded ? 'station' : 'workbench';
  const hasDisplays = Boolean(displays && displays.length > 0);

  return (
    <DetailStackRailRegistrar
      id={`detail:support-context:${ticketId}`}
      // Per host, not per panel: inside `SupportTicketDetail` this registers from
      // within `ReceivingTicketStack` — itself an `UnboxPushColumn` — so pushing
      // would make them two columns fighting one edge. On `/support` nothing else
      // owns the edge, so it pushes and the thread reflows beside it.
      push={push}
      onClose={onClose}
      enabled={open}
      modal={false}
      ariaLabel={`Ticket #${ticketId} support context`}
    >
      <div className="flex h-full min-h-0 flex-col overflow-hidden">
        <div className="shrink-0 border-b border-border-hairline bg-surface-card/90 backdrop-blur-xl">
          <DeskRailChromeRow
            onClose={onClose}
            closeTitle="Close support context"
          />
          <div className="px-2 pb-2 pt-1">
            {/* Identity is the SHORT DURABLE KEY, with the mode as the eyebrow —
                `right-rail-inspector.md`. This header used to invert them (`Ticket
                #N` as the eyebrow over a `text-role-body` "Support context" heading),
                which put a generic noun where the scannable key belongs and broke the
                caption-density cap for rail identity. */}
            <PaneHeaderLabel eyebrow="Support context" value={`#${ticketId}`} />
          </div>
        </div>

        {/* THE one scroll port of this column. The displays render into it as
            content and own no viewport of their own — a nested `overflow-y-auto`
            inside a host that already scrolls is how a child ends up with no
            height at all (`ui-design-system.md` → Scroll ownership).

            Display state lives HERE, above the registrar, so switching pushes a
            fresh node through `updateRightRailPanelNode` without touching the
            occupant id — the host keys its AnimatePresence on that id, so a
            re-key would replay the whole panel crossfade on every click. */}
        <div className="min-h-0 flex-1 overflow-y-auto">
          {hasDisplays ? (
            <SectionTabsSlider
              tabs={displays!}
              value={display}
              onChange={setDisplay}
              ariaLabel="Ticket displays"
              // The quiet switcher: idle cells are icon-only, the selected one
              // names itself. A labelled rail in a ~420px column reads louder
              // than the display it selects.
              density="icon"
              className="p-2"
              headerClassName="px-0.5"
            />
          ) : (
            <SupportContextHub
              anchor={anchor}
              variant={variant}
              defaultSegment="activity"
              hideCustomerSegment
              surface="flush"
              className="h-full"
            />
          )}
        </div>
      </div>
    </DetailStackRailRegistrar>
  );
}
