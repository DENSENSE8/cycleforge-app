'use client';

import { useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Clock, ExternalLink, Loader2, TicketHelp, Unlink } from '@/components/Icons';
import { toast } from '@/lib/toast';
import { cn } from '@/utils/_cn';
import { formatDateTimePST } from '@/utils/date';
import { AnchoredLayer } from '@/design-system/primitives/AnchoredLayer';
import { Button } from '@/design-system/primitives';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import { TicketNasBackupButton } from '@/components/photos/TicketNasBackupButton';
import { IdentityLinkChip } from './IdentityLinkChip';
import {
  SellerMessageAnchoredPanel,
  SellerMessageMenuItem,
} from './SellerMessageChip';
import { renderInlineMarkdown } from '@/lib/support/markdown';

/**
 * Prefer the server's field-level `details` (e.g. a Zod issue string like
 * "receivingId: Expected number, received string") over the generic `error`
 * ("Validation failed") so the toast names exactly what the API rejected.
 */
function ticketApiError(json: unknown, fallback: string): string {
  const j = (json ?? {}) as { error?: unknown; details?: unknown };
  const details = typeof j.details === 'string' ? j.details.trim() : '';
  const error = typeof j.error === 'string' ? j.error.trim() : '';
  if (details && error && details !== error) return `${error}: ${details}`;
  return details || error || fallback;
}

/** Numeric Zendesk id parsed out of a stored "#1234" / "1234" / ticket URL. */
function parseTicketId(raw: string): number | null {
  const fromUrl = raw.match(/tickets\/(\d+)/);
  const digits = (fromUrl ? fromUrl[1] : raw.replace(/^#/, '')).match(/\d+/);
  if (!digits) return null;
  const n = Number(digits[0]);
  return Number.isInteger(n) && n > 0 ? n : null;
}

import { useTicketThread, threadKey } from '@/components/support/TicketThreadCard';
import { invalidateSupportContextCaches } from '@/hooks';
import {
  invalidateReceivingFeeds,
  patchReceivingRailTicketByCarton,
} from '@/lib/queries/receiving-queries';

/**
 * Filed-ticket chip for the carton identity row. Renders the same
 * {@link IdentityLinkChip} primitive as PO#/tracking (orange `#` tone): chip
 * click copies, hover menu offers Open → Message → Edit. The Edit row opens an
 * anchored popover showing the ticket's history (live Zendesk comments) with
 * an Unlink action — instead of re-opening the full claim modal. Message opens
 * the seller-facing draft panel (formerly a standalone header icon).
 */
export function ReceivingTicketChip({
  value,
  display,
  openHref,
  providerTicketId,
  receivingId,
  lineId,
  onUnlinked,
}: {
  /** Copy value — internal ticket label (#42). */
  value: string;
  /** Short label shown in the chip (internal ticket id). */
  display: string;
  /** Zendesk deep link for the chip's external-link button. */
  openHref: string | null | undefined;
  /** Provider-native id (Zendesk) for thread/unlink/archive APIs. */
  providerTicketId?: number | null;
  receivingId: number | null;
  /** Line the ticket is linked to (RECEIVING_LINE entity); null → carton. */
  lineId: number | null;
  /** Called after a successful unlink so the parent can clear its ticket state. */
  onUnlinked: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [sellerOpen, setSellerOpen] = useState(false);
  const anchorRef = useRef<HTMLDivElement>(null);
  const zendeskTicketId = providerTicketId ?? parseTicketId(value);

  const openTicketHistory = () => {
    setSellerOpen(false);
    setOpen(true);
  };
  const openSellerMessage = () => {
    setOpen(false);
    setSellerOpen(true);
  };

  return (
    <div ref={anchorRef} className="flex shrink-0 items-center">
      <IdentityLinkChip
        openHref={openHref}
        openTitle="Open claim in Zendesk"
        value={value}
        display={display}
        tone="ticket"
        underlineClass="border-orange-500"
        disableCopy={!value.trim()}
        onEdit={openTicketHistory}
        editOpen={open}
        editLabel="View ticket history"
        actionsInMenu
        suppressMenu={sellerOpen}
        menuBetween={
          receivingId != null ? (
            <SellerMessageMenuItem onClick={openSellerMessage} active={sellerOpen} />
          ) : null
        }
      />
      <AnchoredLayer
        open={open}
        onClose={() => setOpen(false)}
        anchorRef={anchorRef}
        placement="bottom-end"
        level="panelPopover"
        gap={6}
      >
        <TicketThreadPanel
          ticketId={zendeskTicketId}
          displayTicketId={display}
          open={open}
          receivingId={receivingId}
          lineId={lineId}
          onUnlinked={() => {
            setOpen(false);
            onUnlinked();
          }}
        />
      </AnchoredLayer>
      {receivingId != null ? (
        <SellerMessageAnchoredPanel
          open={sellerOpen}
          onClose={() => setSellerOpen(false)}
          anchorRef={anchorRef}
          receivingId={receivingId}
          lineId={lineId}
          linkedTicketId={providerTicketId ?? null}
        />
      ) : null}
    </div>
  );
}

function TicketThreadPanel({
  ticketId,
  displayTicketId,
  open,
  receivingId,
  lineId,
  onUnlinked,
}: {
  ticketId: number | null;
  displayTicketId: string;
  open: boolean;
  receivingId: number | null;
  lineId: number | null;
  onUnlinked: () => void;
}) {
  const qc = useQueryClient();
  const { data, isLoading, isError, error } = useTicketThread(ticketId, open);

  const unlink = useMutation<{ removed: boolean }, Error>({
    mutationFn: async () => {
      if (receivingId == null || ticketId == null) {
        throw new Error('Missing receiving link');
      }
      const sp = new URLSearchParams({
        receivingId: String(receivingId),
        ticketId: String(ticketId),
      });
      if (lineId != null) sp.set('lineId', String(lineId));
      const res = await fetch(`/api/receiving/zendesk-claim/link?${sp.toString()}`, {
        method: 'DELETE',
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) {
        throw new Error(ticketApiError(json, `Request failed (${res.status})`));
      }
      return { removed: !!json.removed };
    },
    onSuccess: () => {
      if (ticketId != null) qc.removeQueries({ queryKey: threadKey(ticketId) });
      // Chip display comes from useEntitySupportTicket — bust that cache here so
      // every host (Unbox / Testing / Triage) drops the orange ticket number.
      invalidateSupportContextCaches(qc);
      // Unboxed rail ignores receiving-line-updated — clear the Ticket flag on
      // every rail cache by carton, then refetch feeds.
      if (receivingId != null) {
        patchReceivingRailTicketByCarton(qc, receivingId, null);
      }
      invalidateReceivingFeeds(qc);
      toast.success('Ticket unlinked');
      onUnlinked();
    },
    onError: (err) => toast.error(err.message || 'Could not unlink the ticket'),
  });

  const ticketNumber =
    ticketId != null
      ? String(ticketId)
      : displayTicketId.replace(/^#/, '').trim() || '';

  return (
    <div
      role="dialog"
      aria-label="Ticket history"
      className="flex max-h-[460px] w-[360px] max-w-[calc(100vw-24px)] flex-col overflow-hidden rounded-xl border border-border-soft bg-surface-card shadow-xl"
    >
      <header className="space-y-2 border-b border-border-hairline inset-field">
        <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-2">
          <div className="flex min-w-0 flex-1 items-start gap-2">
            <TicketHelp className="mt-0.5 h-4 w-4 shrink-0 text-orange-500" />
            <div className="min-w-0">
              <div className="break-words text-role-data font-semibold leading-snug text-text-default">
                {displayTicketId ? `Ticket ${displayTicketId.startsWith('#') ? displayTicketId : `#${displayTicketId}`}` : 'Ticket'}
              </div>
              {data?.ticket.subject ? (
                <div className="break-words text-role-micro leading-snug text-text-faint">{data.ticket.subject}</div>
              ) : null}
            </div>
          </div>
          <div className="flex max-w-full flex-wrap items-center justify-end gap-1.5">
            {data?.ticket.status ? (
              <span className="rounded-full bg-surface-sunken px-2 py-0.5 text-role-micro font-medium uppercase tracking-wide text-text-soft">
                {data.ticket.status}
              </span>
            ) : null}
            {data?.ticket.url ? (
              <HoverTooltip label="Open in Zendesk" asChild>
                <a
                  href={data.ticket.url}
                  target="_blank"
                  rel="noreferrer"
                  aria-label="Open in Zendesk"
                  className="rounded-md p-1 text-text-faint transition hover:bg-surface-sunken hover:text-text-muted"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                </a>
              </HoverTooltip>
            ) : null}
          </div>
        </div>
        {/* Under the ticket — same archive waist as the claim modal, always reachable. */}
        {ticketNumber ? (
          <div className="pt-0.5">
            <TicketNasBackupButton
              ticketNumber={ticketNumber}
              receivingId={receivingId}
              lineId={lineId}
              label="Upload & sync to NAS"
              className="w-full justify-center"
            />
          </div>
        ) : null}
      </header>

      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto px-3 py-3">
        {!ticketId ? (
          <p className="py-6 text-center text-sm text-text-faint">No ticket id to look up.</p>
        ) : isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-orange-500" />
          </div>
        ) : isError ? (
          <p className="rounded-md bg-rose-50 px-2 py-1.5 text-role-caption text-rose-600">
            History unavailable: {error instanceof Error ? error.message : 'request failed'}
          </p>
        ) : !data || data.comments.length === 0 ? (
          <p className="py-6 text-center text-sm text-text-faint">No history yet.</p>
        ) : (
          <ul className="space-y-2">
            {data.comments.map((c) => (
              <li
                key={c.id}
                className={cn(
                  'rounded-lg border inset-field',
                  c.public ? 'border-blue-100 bg-blue-50/60' : 'border-amber-100 bg-amber-50/60',
                )}
              >
                <div className="mb-1 flex items-center justify-between gap-2 text-role-micro uppercase tracking-wide">
                  <span className={c.public ? 'font-semibold text-blue-600' : 'font-semibold text-amber-600'}>
                    {c.public ? 'Public reply' : 'Internal note'}
                  </span>
                  <span className="flex items-center gap-1 normal-case text-text-faint">
                    <Clock className="h-3 w-3" />
                    {formatDateTimePST(c.createdAt)}
                  </span>
                </div>
                <div className="break-words text-role-data leading-snug text-text-default">
                  {renderInlineMarkdown(c.body)}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <footer className="flex flex-wrap items-center gap-2 border-t border-border-hairline bg-surface-canvas/60 px-3 py-2.5">
        <span className="min-w-0 flex-1 text-role-caption leading-snug text-text-faint">
          Unlinking only removes our reference — the ticket stays in Zendesk.
        </span>
        <Button
          variant="secondary"
          size="sm"
          loading={unlink.isPending}
          icon={<Unlink className="h-3.5 w-3.5" />}
          disabled={unlink.isPending || receivingId == null}
          onClick={() => unlink.mutate()}
          className="shrink-0 border border-rose-200 bg-surface-card text-rose-600 ring-0 hover:bg-rose-50"
        >
          Unlink
        </Button>
      </footer>
    </div>
  );
}

export default ReceivingTicketChip;
