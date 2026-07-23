'use client';

/**
 * SupportContextHub — unified linkage + segmented Customer | Team | Activity
 * surface for ticket↔STN context. Composed on Support console, Unbox, and
 * packing (rollup) — one SoT, density variants only.
 */
import { useEffect, useState } from 'react';
import { Spinner } from '@/design-system/primitives';
import { useSupportContext, type SupportContextAnchor } from '@/hooks/useSupportContext';
import type { ThreadComposerBridge } from '@/components/threads/ThreadPanel';
import { cn } from '@/utils/_cn';
import { LinkageStrip } from './LinkageStrip';
import {
  SupportContextSegments,
  type SupportContextSegment,
} from './SupportContextSegments';
import { SupportContextCustomer } from './SupportContextCustomer';
import { SupportContextTeam } from './SupportContextTeam';
import { SupportContextActivity } from './SupportContextActivity';

export type SupportContextHubVariant = 'workbench' | 'station' | 'rollup';

export interface SupportContextHubProps {
  anchor: SupportContextAnchor;
  /** workbench = Support console; station = Unbox; rollup = packing compact card */
  variant?: SupportContextHubVariant;
  /** Default segment when the hub mounts. */
  defaultSegment?: SupportContextSegment;
  /** When true (station Conversation dock), Team pane uses externalSubmit. */
  externalSubmit?: boolean;
  /** Exposes the active Customer or Team composer to a station terminal dock. */
  onBridgeChange?: (bridge: ThreadComposerBridge | null) => void;
  /** Hide the Customer pane chrome send bar (station). */
  embeddedCustomer?: boolean;
  /** When host already shows Zendesk chat — hide Customer segment. */
  hideCustomerSegment?: boolean;
  /**
   * Station Ticket tab: linkage + one pane only (no Customer | Team | Activity
   * segment chrome). Conversations live on the sibling Support tab.
   */
  onlySegment?: SupportContextSegment;
  /** Hide the Linkage strip (station Ticket / Support tabs — link from entity chrome). */
  hideLinkage?: boolean;
  className?: string;
  /** Rollup: start collapsed (packing). Linkage strip stays visible either way. */
  defaultExpanded?: boolean;
  /** Context band: linkage strip only (no Customer | Team | Activity). */
  linkageOnly?: boolean;
  /**
   * `card` — self-contained rounded shell (rollup, inline embeds).
   * `flush` — body only; outer chrome comes from {@link DetailStackRailRegistrar}.
   */
  surface?: 'card' | 'flush';
  /**
   * Station hosts: open ReceivingClaimModal on Link-existing instead of the
   * inline TicketLinkPopover in the Customer empty state.
   */
  onRequestLinkTicket?: () => void;
  /**
   * Hide ticket `#` / subject embed in the linkage strip (Support station
   * Summary + Connections — Ticket tab owns the number).
   */
  hideTicketEmbed?: boolean;
}

export function SupportContextHub({
  anchor,
  variant = 'workbench',
  defaultSegment = 'customer',
  externalSubmit = false,
  onBridgeChange,
  embeddedCustomer,
  hideCustomerSegment = false,
  onlySegment,
  hideLinkage = false,
  className,
  defaultExpanded = true,
  linkageOnly = false,
  surface = 'card',
  onRequestLinkTicket,
  hideTicketEmbed = false,
}: SupportContextHubProps) {
  const flush = surface === 'flush';
  const cardShellClass = flush
    ? 'flex min-h-0 flex-col overflow-hidden'
    : 'flex min-h-0 flex-col overflow-hidden rounded-2xl border border-border-soft bg-surface-card shadow-sm';
  const linkageShellClass = flush
    ? 'overflow-hidden'
    : 'overflow-hidden rounded-2xl border border-border-soft bg-surface-card';
  const { data, isLoading, isError, error } = useSupportContext(anchor);
  const initialSegment =
    onlySegment ??
    (hideCustomerSegment && defaultSegment === 'customer' ? 'activity' : defaultSegment);
  const [segment, setSegment] = useState<SupportContextSegment>(initialSegment);
  const [expanded, setExpanded] = useState(defaultExpanded);

  const dense = variant !== 'workbench';
  const embedded = embeddedCustomer ?? variant === 'station';
  const isRollup = variant === 'rollup';
  const showSegmentPills = onlySegment == null;

  // Prefer Team when no ticket yet (operator often lands on team notes first at unbox).
  useEffect(() => {
    if (!data) return;
    if (onlySegment) return;
    if (hideCustomerSegment) return;
    if (defaultSegment !== 'customer') return;
    if (!data.ticket && data.thread) {
      setSegment('team');
    }
  }, [data?.ticket?.id, data?.thread?.id, defaultSegment, hideCustomerSegment, onlySegment]);

  useEffect(() => {
    if (onlySegment) {
      setSegment(onlySegment);
      return;
    }
    if (hideCustomerSegment && segment === 'customer') {
      setSegment('activity');
    }
  }, [hideCustomerSegment, onlySegment, segment]);

  if (isLoading && !data) {
    return (
      <div className={cn('flex items-center justify-center p-8', className)}>
        <Spinner />
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className={cn('p-4 text-center text-role-caption text-rose-600', className)}>
        {error?.message || 'Could not load support context.'}
      </div>
    );
  }

  const strip =
    hideLinkage || (onlySegment != null && !linkageOnly) ? null : (
      <div
        className={cn(
          'shrink-0',
          dense ? 'px-3 pt-3 pb-3' : 'px-4 pt-4 pb-4',
          linkageOnly && 'pb-3',
        )}
      >
        <LinkageStrip
          bundle={data}
          dense={dense || linkageOnly}
          hideTicketEmbed={hideTicketEmbed}
        />
      </div>
    );

  if (linkageOnly) {
    return (
      <div className={cn(linkageShellClass, className)}>
        {strip}
      </div>
    );
  }

  const activeSegment = onlySegment ?? segment;
  const showCustomer =
    activeSegment === 'customer' && (onlySegment === 'customer' || !hideCustomerSegment);

  const segmentsChrome = (
    <>
      {showSegmentPills ? (
        <div
          className={cn(
            'flex shrink-0 items-center justify-between gap-2 border-b border-border-hairline',
            dense ? 'px-3 py-2' : 'px-4 py-2.5',
          )}
        >
          <SupportContextSegments
            value={segment}
            onChange={setSegment}
            dense={dense}
            hideCustomer={hideCustomerSegment}
          />
        </div>
      ) : null}

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        {showCustomer ? (
          <SupportContextCustomer
            bundle={data}
            embedded={embedded}
            receivingId={anchor.receivingId ?? undefined}
            onBridgeChange={onBridgeChange}
            onRequestLinkTicket={onRequestLinkTicket}
          />
        ) : null}
        {activeSegment === 'team' ? (
          <SupportContextTeam
            bundle={data}
            dense={dense}
            externalSubmit={externalSubmit}
            onBridgeChange={onBridgeChange}
          />
        ) : null}
        {activeSegment === 'activity' ? (
          <SupportContextActivity bundle={data} loading={isLoading} />
        ) : null}
      </div>
    </>
  );

  if (isRollup) {
    const ticketLabel = data.ticket?.label;
    return (
      <div className={cn(linkageShellClass, className)}>
        {/* Linkage (Link ticket / chips) always visible — never behind Open. */}
        {strip}
        <button
          type="button"
          onClick={() => setExpanded((e) => !e)}
          aria-expanded={expanded}
          className="ds-raw-button flex w-full items-center gap-2 border-t border-border-hairline px-3 py-2 text-left hover:bg-surface-hover"
        >
          <span className="flex-1 text-role-eyebrow uppercase tracking-widest text-text-soft">
            Support context
            {ticketLabel ? ` · ${ticketLabel}` : ''}
          </span>
          <span className="text-role-eyebrow text-text-faint">{expanded ? 'Hide' : 'Open'}</span>
        </button>
        {expanded ? (
          <div className="flex max-h-[28rem] flex-col border-t border-border-hairline">
            {segmentsChrome}
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <div className={cn(cardShellClass, className)}>
      {strip}
      {segmentsChrome}
    </div>
  );
}
