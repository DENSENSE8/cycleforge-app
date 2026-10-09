'use client';

/**
 * The Live feed's card verbs as RecordActionStrip `dialog` bodies — shared by
 * the open package (one card) and the bulk bar (the selection):
 *   Flag… — any card, a reason from `LIVE_FEED_FLAG_REASONS` (`live_feed_flags`);
 *   Remove from list… — an order through `order_list_removals`, a card no order
 *     owns through `live_feed_dismissals`; both reason-first, Undo on the toast;
 *   Pair to order… — an unlinked card takes an order, found by the Exceptions
 *     desk's link-order search (`searchLinkableOrders`).
 * Every write re-reads the board (`LIVE_FEED_QUERY_ROOT`) at once; the
 * `order.changed` it publishes refreshes every other open board.
 */

import { useCallback, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Archive, Flag } from 'lucide-react';
import { ListRemovalDialog, ReasonDialog } from '@/components/orders/ListRemovalDialog';
import { IntakeCombobox } from '@/components/outbound/orders/intake/IntakeCombobox';
import { clearCardFlags, dismissUnlinked, flagCards, pairCardToOrder, restoreUnlinked } from '@/lib/live-feed/card-actions-client';
import { UNLINKED_DISMISS_NOTE_MAX, UNLINKED_DISMISS_NOTE_REQUIRED, UNLINKED_DISMISS_REASONS } from '@/lib/live-feed/dismissals';
import {
  LIVE_FEED_FLAG_NOTE_MAX,
  LIVE_FEED_FLAG_NOTE_REQUIRED,
  liveFeedFlagReason,
  liveFeedFlagReasonsFor,
  type LiveFeedFlagReasonId,
} from '@/lib/live-feed/flags';
import { LIVE_FEED_QUERY_ROOT } from '@/lib/live-feed/query';
import type { PackageCard, PackageLink } from '@/lib/live-feed/types';
import { listRemovalReasonLabel } from '@/lib/orders/list-removal';
import { removeFromList, restoreToList } from '@/lib/orders/list-removal-client';
import { refreshDomain } from '@/lib/refresh/bus';
import { searchLinkableOrders } from '@/lib/shipments/shipment-order-search';
import { toast } from '@/lib/toast';

const packages = (n: number) => `${n} package${n === 1 ? '' : 's'}`;
const failure = (error: unknown, fallback: string) => (error instanceof Error ? error.message : fallback);

/** Re-read every Live feed query now (the board, lanes, find, opened packages). */
export function useRefreshLiveFeed(): () => void {
  const queryClient = useQueryClient();
  return useCallback(() => void queryClient.invalidateQueries({ queryKey: LIVE_FEED_QUERY_ROOT }), [queryClient]);
}

/** Clear one active flag from one card — the × on a flag. */
export function useClearFlag(): (cardId: number, reason: string) => Promise<void> {
  const refresh = useRefreshLiveFeed();
  return useCallback(
    async (cardId, reason) => {
      try {
        await clearCardFlags([cardId], reason);
        toast.success(`Cleared ${liveFeedFlagReason(reason).label}`);
        refresh();
      } catch (error: unknown) {
        toast.error(failure(error, 'Could not clear the flag'));
      }
    },
    [refresh],
  );
}

export function FlagDialog({
  cardIds,
  links,
  done,
  onSettled,
}: {
  cardIds: readonly number[];
  /** The selected kinds of card — only the reasons that fit all of them are offered. */
  links: readonly PackageLink[];
  done: () => void;
  onSettled?: () => void;
}) {
  const refresh = useRefreshLiveFeed();
  const count = cardIds.length;
  return (
    <ReasonDialog
      prompt={`Flag ${packages(count)} — why?`}
      reasons={liveFeedFlagReasonsFor(links)}
      noteRequired={(reason) => LIVE_FEED_FLAG_NOTE_REQUIRED[reason] === true}
      noteMax={LIVE_FEED_FLAG_NOTE_MAX}
      confirmLabel={`Flag ${packages(count)}`}
      confirmIcon={<Flag />}
      confirmVariant="warning"
      cancelLabel="Cancel"
      doneTitle={(flagged) => (flagged === 0 ? 'Already flagged' : `Flagged ${packages(flagged)}`)}
      testId="live-feed-flag"
      done={done}
      onSettled={onSettled}
      onConfirm={async (reason, note) => {
        try {
          // The catalog's own ids are the chips; the server re-checks the reason.
          const changed = await flagCards(cardIds, reason as LiveFeedFlagReasonId, note);
          refresh();
          if (changed.length > 0) {
            toast.undo(`Flagged ${packages(changed.length)} · ${liveFeedFlagReason(reason).label}`, {
              onUndo: () => {
                void clearCardFlags(changed, reason)
                  .then(() => {
                    toast.success('Flag cleared');
                    refresh();
                  })
                  .catch((error: unknown) => toast.error(failure(error, 'Could not clear the flag')));
              },
            });
          }
          return changed.length;
        } catch (error: unknown) {
          toast.error(failure(error, 'Could not flag'));
          return null;
        }
      }}
    />
  );
}

/** Remove from list for order cards (`order_list_removals`); `onRemoved` gets the ids that left. */
export function OrderRemovalDialog({
  orderRowIds,
  done,
  onSettled,
  onRemoved,
}: {
  orderRowIds: readonly number[];
  done: () => void;
  onSettled?: () => void;
  onRemoved?: (ids: number[]) => void;
}) {
  const refresh = useRefreshLiveFeed();
  return (
    <ListRemovalDialog
      count={orderRowIds.length}
      done={done}
      onSettled={onSettled}
      onConfirm={async (reason, note) => {
        try {
          const removedIds = await removeFromList(orderRowIds, reason, note);
          refreshDomain('orders.outbound');
          refresh();
          toast.undo(`Removed ${removedIds.length} from the list · ${listRemovalReasonLabel(reason)}`, {
            onUndo: () => {
              void restoreToList(removedIds)
                .then((restored) => {
                  toast.success(`Put ${restored.length} back on the list`);
                  refreshDomain('orders.outbound');
                  refresh();
                })
                .catch((error: unknown) => toast.error(failure(error, 'Could not put them back')));
            },
          });
          onRemoved?.(removedIds);
          return removedIds.length;
        } catch (error: unknown) {
          toast.error(failure(error, 'Could not remove from the list'));
          return null;
        }
      }}
    />
  );
}

/** Remove from list for the cards no order owns (`live_feed_dismissals`); `onRemoved` gets the ids that left. */
export function UnlinkedRemovalDialog({
  cardIds,
  done,
  onSettled,
  onRemoved,
}: {
  cardIds: readonly number[];
  done: () => void;
  onSettled?: () => void;
  onRemoved?: (ids: number[]) => void;
}) {
  const refresh = useRefreshLiveFeed();
  const count = cardIds.length;
  return (
    <ReasonDialog
      prompt={`${packages(count)} no order owns leave${count === 1 ? 's' : ''} the list — why?`}
      reasons={UNLINKED_DISMISS_REASONS}
      noteRequired={(reason) => UNLINKED_DISMISS_NOTE_REQUIRED[reason] === true}
      noteMax={UNLINKED_DISMISS_NOTE_MAX}
      confirmLabel={`Remove ${count} from the list`}
      confirmIcon={<Archive />}
      confirmVariant="danger"
      cancelLabel={`Keep ${count === 1 ? 'it' : 'them'} on the list`}
      doneTitle={(removed) => `Removed ${removed} from the list`}
      testId="live-feed-dismiss"
      done={done}
      onSettled={onSettled}
      onConfirm={async (reason, note) => {
        try {
          const removedIds = await dismissUnlinked(cardIds, reason, note);
          refresh();
          const label = UNLINKED_DISMISS_REASONS.find((entry) => entry.id === reason)?.label ?? reason;
          toast.undo(`Removed ${removedIds.length} from the list · ${label}`, {
            onUndo: () => {
              void restoreUnlinked(removedIds)
                .then((restored) => {
                  toast.success(`Put ${restored.length} back on the list`);
                  refresh();
                })
                .catch((error: unknown) => toast.error(failure(error, 'Could not put them back')));
            },
          });
          onRemoved?.(removedIds);
          return removedIds.length;
        } catch (error: unknown) {
          toast.error(failure(error, 'Could not remove from the list'));
          return null;
        }
      }}
    />
  );
}

/**
 * Pair to order — the card's tracking (or the scanned text) on top, then the
 * order search, open and focused: type an order #, buyer, SKU or tracking;
 * Enter pairs the highlighted order. The card becomes that order's package;
 * `onPaired` hands the host the order row it became.
 */
export function PairOrderDialog({
  card,
  done,
  onPaired,
}: {
  card: Pick<PackageCard, 'orderRowId' | 'link' | 'tracking' | 'carrier'>;
  done: () => void;
  onPaired: (orderRowId: number) => void;
}) {
  const refresh = useRefreshLiveFeed();
  const [query, setQuery] = useState('');
  const [pairing, setPairing] = useState(false);
  const needle = query.trim();
  const search = useQuery({
    queryKey: ['shipment-link-order-search', needle],
    queryFn: ({ signal }) => searchLinkableOrders(needle, signal),
    enabled: needle.length >= 3,
    staleTime: 30_000,
  });
  const lines = search.data ?? [];

  const pair = async (value: string) => {
    if (pairing) return;
    const line = lines.find((candidate) => String(candidate.orderRowId) === value);
    if (!line) return;
    setPairing(true);
    try {
      const result = await pairCardToOrder(card.orderRowId, line.orderRowId);
      toast.success(`Paired to order ${line.orderRef ?? `#${line.orderRowId}`}`);
      refresh();
      done();
      onPaired(result.orderRowId);
    } catch (error: unknown) {
      toast.error(failure(error, 'Could not pair to the order'));
    } finally {
      setPairing(false);
    }
  };

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-col gap-2" data-testid="live-feed-pair" aria-busy={pairing}>
      <p className="text-role-caption text-text-soft">
        {card.link === 'scan' ? 'Scanned' : (card.carrier ?? 'Tracking')}{' '}
        <span className="font-mono text-text-default">{card.tracking ?? '—'}</span>
      </p>
      <IntakeCombobox
        surface="open"
        value={null}
        onChange={(value) => void pair(value)}
        query={query}
        onQueryChange={setQuery}
        loading={search.isFetching}
        options={lines.map((line) => ({
          value: String(line.orderRowId),
          label: line.orderRef ?? `#${line.orderRowId}`,
          mono: true,
          meta: [line.title || 'Untitled line', line.channel, line.sku ? `SKU ${line.sku}` : null, line.status].filter(Boolean).join(' · '),
        }))}
        placeholder="Order"
        searchPlaceholder="Order #, buyer, SKU or tracking…"
        emptyMessage={
          search.isError
            ? search.error.message
            : needle.length < 3
              ? 'Type at least 3 characters'
              : `No order matches “${needle}”`
        }
        ariaLabel="Pair to an order"
        optionTestId={(option) => `live-feed-pair-order-${option.value}`}
        testId="live-feed-pair-combobox"
        className="flex-1"
      />
    </div>
  );
}
