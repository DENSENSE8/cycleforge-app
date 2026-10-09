'use client';

/**
 * Picks — `/m/pick`, a PICK LIST only (owner 2026-09-28, BRIEF §14):
 * - an X close at the top left — the list itself carries no progress bar
 *   (owner 2026-10-08); the walk's bar lives on the scan card;
 * - my list: the To-pick orders whose PICK assignee is me, then the unowned
 *   ones; another picker's orders are never listed (`@/lib/picking/pick-walk`).
 *   No status chips, no filters — the picker triages the list itself;
 * - Start picking, floating over the list: walks the list on the scan card
 *   (`?order=<id>`, {@link PickOrderScreen}), advancing as each is picked.
 *   Tapping a card opens that order the same way.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { BrandIdentityDot } from '@/components/ui/grid-cells';
import { DetailDock } from '@/design-system/components/DetailDock';
import { RecordCardMobile } from '@/design-system/components/record-card/RecordCardMobile';
import type { RecordCardLine, RecordCardMobileModel } from '@/design-system/components/record-card/record-card-types';
import { useHiddenRecords } from '@/design-system/components/triage-card-list/dismiss';
import { Button } from '@/design-system/primitives';
import { appMobilePageGroundClass } from '@/design-system/tokens/app-surface';
import { lifecycleRecordState } from '@/design-system/tokens/lifecycle';
import { useOrderChannel } from '@/hooks/useCatalog';
import { useStaffNameMap } from '@/hooks/useStaffNameMap';
import { resolveOrderBin } from '@/lib/shipping/outbound-storage-path';
import { orderCardModel, orderRecordLine, type OrderCardModel } from '@/lib/orders/order-card-model';
import { queueOrderStatuses, toShipQueueOrders, toShipQueueQuery } from '@/lib/orders/to-ship-queue';
import { nextInWalk, pickOwnerTier, pickWalkProgress } from '@/lib/picking/pick-walk';
import { platformDisplayName, type OrderChannelResolver } from '@/lib/platform-display';
import { readLiveSearchParams } from '@/lib/routing/optimistic-url-param';
import { platformMetaBrandDot } from '@/lib/source-platform';
import { OUTBOUND_TRIAGE_VIEW } from '@/lib/triage/views';
import { getCurrentPSTDateKey } from '@/utils/date';
import { cn } from '@/utils/_cn';
import { PickOrderScreen, type PickOrderDetails } from './PickOrderScreen';
import { MobileV2DetailTopBar } from '@/components/mobile/v2/MobileV2DetailTopBar';
import { SetBinSheet } from './SetBinSheet';

/** `?order=` — the order open on the scan card. */
const ORDER_PARAM = 'order';
/** The picked beat: long enough to see the success, short enough to keep walking. */
const ADVANCE_MS = 900;

function writeParams(pathname: string, search: string, patch: (params: URLSearchParams) => void, push = false) {
  const params = readLiveSearchParams(search);
  patch(params);
  const qs = params.toString();
  const url = qs ? `${pathname}?${qs}` : pathname;
  if (push) window.history.pushState(null, '', url);
  else window.history.replaceState(null, '', url);
}

export function PickScreen() {
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const { user } = useAuth();
  const { getStaffName } = useStaffNameMap();
  const hidden = useHiddenRecords();
  const [binSku, setBinSku] = useState<string | null>(null);
  /** The walk as it stood when it started — positions stay put while picked orders leave the live list. */
  const [walkIds, setWalkIds] = useState<number[] | null>(null);
  const [skipped, setSkipped] = useState<ReadonlySet<number>>(new Set());
  const [walkDone, setWalkDone] = useState(false);
  const advanceTimer = useRef<number | null>(null);

  const orderParam = Number(searchParams.get(ORDER_PARAM));
  const openOrderId = Number.isInteger(orderParam) && orderParam > 0 ? orderParam : null;

  // The desk's read: same key, so the shell's realtime layer refreshes both.
  const queue = useQuery(toShipQueueQuery());
  const orders = useMemo(() => {
    const rows = queue.data ?? [];
    return toShipQueueOrders(hidden.size === 0 ? rows : rows.filter((row) => !hidden.has(Number(row.id))));
  }, [queue.data, hidden]);

  const todayKey = getCurrentPSTDateKey();
  const staffId = user?.staffId ?? null;
  const toModel = useCallback(
    (lines: (typeof orders)[number]) =>
      orderCardModel(`${lines[0]?.order_id ?? ''}#${lines[0]?.id ?? ''}`, lines, todayKey, getStaffName),
    [todayKey, getStaffName],
  );
  /**
   * The pick list (owner 2026-10-08): EVERY order from To pick through Picked, whoever it is assigned
   * to, in the queue's ship-by / late order — each card names its picker ("To pick · Sang", "Picked ·
   * Thuc"). It stays until the packer's scan packs it. `yours` = assigned to me, or open (no one's).
   */
  const cards = useMemo(
    () =>
      orders.flatMap((lines) => {
        const statuses = queueOrderStatuses(lines);
        if (!statuses.has('toPick') && !statuses.has('picked')) return [];
        return [{ model: toModel(lines), toPick: statuses.has('toPick'), yours: pickOwnerTier(lines, staffId) !== 'other' }];
      }),
    [orders, staffId, toModel],
  );
  /** Pick all: every To-pick order, whoever it is assigned to, by ship-by / late date. */
  const walk = useMemo(() => cards.filter((card) => card.toPick).map((card) => card.model.lead.id), [cards]);
  /** Your picks: the To-pick orders assigned to me, plus the open ones. */
  const myWalk = useMemo(() => cards.filter((card) => card.toPick && card.yours).map((card) => card.model.lead.id), [cards]);
  const progress = useMemo(() => pickWalkProgress(orders, staffId, todayKey, walk.length), [orders, staffId, todayKey, walk.length]);
  const channelOf = useOrderChannel();
  /** The open order as the walk screen shows it: the list card's lines (lead first), its bin and its order facts. */
  const openOrderView = useMemo((): { lines: RecordCardLine[]; bin: string | null; details: PickOrderDetails | null } => {
    const group = openOrderId == null ? null : orders.find((lines) => lines.some((line) => Number(line.id) === openOrderId));
    if (!group) return { lines: [], bin: null, details: null };
    const model = toModel(group);
    // The listing resolves from the shown line's ITEM NUMBER on the order's own platform — a SKU-only
    // search or another store is no listing, and the pick screen offers Pair item number instead.
    const itemNumber = String(model.lines[0]?.record.item_number ?? '').trim() || null;
    return {
      lines: model.lines.map(orderRecordLine),
      bin: resolveOrderBin(model.lead.storage_locations, model.lead.sku_home_location).path,
      details: {
        buyerName: model.buyerName,
        channel: orderChannelFace(channelOf, model),
        shipBy: model.sla,
        buyerNote: model.buyerNote,
        staffNote: model.staffNote,
        listingHref: itemNumber && model.listingMatchesOrder ? model.listingHref : null,
        itemNumber,
      },
    };
  }, [orders, openOrderId, toModel, channelOf]);

  useEffect(() => () => {
    if (advanceTimer.current != null) window.clearTimeout(advanceTimer.current);
  }, []);

  const showOrder = (orderId: number | null, push: boolean) =>
    writeParams(
      pathname,
      searchParams.toString(),
      (params) => {
        if (orderId == null) params.delete(ORDER_PARAM);
        else params.set(ORDER_PARAM, String(orderId));
      },
      push,
    );

  /** Open an order on the scan card, walking `ids` (Pick all by default); a tapped order outside it is walked first. */
  const openOrder = (orderId: number, ids: readonly number[] = walk) => {
    setWalkIds(ids.includes(orderId) ? [...ids] : [orderId, ...ids]);
    setSkipped(new Set());
    setWalkDone(false);
    showOrder(orderId, true);
  };

  // A reload on `?order=` keeps walking the live list.
  const activeWalk = walkIds ?? walk;
  const moveOn = (from: number, skip: ReadonlySet<number>) => {
    const next = nextInWalk(activeWalk, from, new Set(walk), skip);
    if (next != null) {
      showOrder(next, false);
      return;
    }
    setWalkIds(null);
    setWalkDone(true);
    showOrder(null, false);
  };

  if (openOrderId != null) {
    // The bar paints today's picks first, then my live walk in order: the open order sits after the picked ones.
    const index = walk.indexOf(openOrderId);
    return (
      <PickOrderScreen
        key={openOrderId}
        orderId={openOrderId}
        active={index >= 0 ? progress.picked + index : null}
        progress={progress}
        lines={openOrderView.lines}
        details={openOrderView.details}
        bin={openOrderView.bin}
        onPicked={() => {
          if (advanceTimer.current != null) window.clearTimeout(advanceTimer.current);
          advanceTimer.current = window.setTimeout(() => {
            advanceTimer.current = null;
            moveOn(openOrderId, skipped);
          }, ADVANCE_MS);
        }}
        onSkip={() => {
          const next = new Set(skipped).add(openOrderId);
          setSkipped(next);
          moveOn(openOrderId, next);
        }}
        onBack={() => {
          setWalkIds(null);
          showOrder(null, false);
        }}
      />
    );
  }

  return (
    <div className={cn('flex h-full min-h-full flex-col', appMobilePageGroundClass)}>
      {/* The list's own header: X close top left, the Scan seat top right, no progress bar (owner 2026-10-08). */}
      <MobileV2DetailTopBar title="Picks" close backHref="/m/home" />

      <div className="flex flex-1 flex-col overflow-y-auto" data-testid="pick-queue">
        {walkDone ? (
          <Alert variant="success" role="status" className="mx-mode-page mt-3">
            <AlertDescription className="text-role-data opacity-100">Walk done — nothing left on your list to pick.</AlertDescription>
          </Alert>
        ) : null}

        {queue.isPending ? (
          <p className="py-10 text-center text-role-body text-text-muted" aria-live="polite">
            Loading orders…
          </p>
        ) : queue.isError && orders.length === 0 ? (
          <Alert variant="destructive" className="mx-mode-page mt-3">
            <AlertTitle className="text-role-title">Couldn&apos;t load the orders</AlertTitle>
            <AlertDescription className="text-role-body">{queue.error.message}</AlertDescription>
            <Button variant="primary" size="lg" radius="mode" className="col-start-2 mt-3 w-full" onClick={() => void queue.refetch()}>
              Try again
            </Button>
          </Alert>
        ) : cards.length === 0 ? (
          <p className="px-mode-page py-10 text-center text-role-body text-text-muted">Nothing to pick.</p>
        ) : (
          // Density (owner 2026-10-08): rows edge to edge, no gap between them, one horizontal hairline between rows, no side lines.
          <ul aria-label="My pick list" className="divide-y divide-border-hairline border-b border-border-hairline">
            {cards.map(({ model, toPick }) => (
              <PickListCard key={model.key} model={model} toPick={toPick} onOpen={() => openOrder(model.lead.id)} onSetBin={setBinSku} />
            ))}
          </ul>
        )}

        {/* The job CTA floats over the list; its own height is the list's bottom clearance. */}
        <DetailDock<'all' | 'mine'>
          label="Pick"
          placement="float"
          verbs={[
            // Split start (owner 2026-10-08): everything on my list, or only what is assigned to me.
            {
              id: 'all',
              label: walk.length === 0 ? 'Nothing to pick' : `Pick all · ${walk.length}`,
              icon: null,
              primary: true,
              disabled: walk.length === 0,
              testId: 'pick-all',
            },
            {
              id: 'mine',
              label: `Your picks · ${myWalk.length}`,
              icon: null,
              disabled: myWalk.length === 0,
              testId: 'pick-mine',
            },
          ]}
          onVerb={(id) => {
            const ids = id === 'mine' ? myWalk : walk;
            const first = ids[0];
            if (first != null) openOrder(first, ids);
          }}
        />
      </div>

      <SetBinSheet sku={binSku} onClose={() => setBinSku(null)} />
    </div>
  );
}

/** The order's channel as the phone card paints it — dot, name, and FBA / Pickup. */
function orderChannelFace(channelOf: OrderChannelResolver, model: OrderCardModel): RecordCardMobileModel['channel'] {
  const channel = channelOf(model.orderId, model.accountSource);
  const label = platformDisplayName(channel);
  return label
    ? {
        label,
        dot: <BrandIdentityDot {...platformMetaBrandDot(channel.meta)} />,
        badge: model.fba ? 'FBA' : model.pickup ? 'Pickup' : null,
      }
    : null;
}

/** The orders adapter over the phone card: bin top-left ('No bin' sets the SKU's home bin), pick status, channel + order ref, SLA. */
function PickListCard({
  model,
  toPick,
  onOpen,
  onSetBin,
}: {
  model: OrderCardModel;
  /** Any line still to pick → "To pick"; else the order is "Picked" and waits for the packer. */
  toPick: boolean;
  onOpen: () => void;
  onSetBin: (sku: string) => void;
}) {
  const pickState = lifecycleRecordState(toPick ? 'toPick' : 'picked');
  const channelOf = useOrderChannel();
  const sku = String(model.lead.sku ?? '').trim();
  const bin = resolveOrderBin(model.lead.storage_locations, model.lead.sku_home_location).path;
  const title = model.lines[0]?.title ?? '';
  /**
   * Whose pick it is — first name in the chip (owner 2026-10-08): "Picked · Ana" by who picked it,
   * "To pick · Ana" by who it is assigned to.
   */
  const pickerName = toPick
    ? (model.lines.find((line) => line.record.picker_name)?.record.picker_name?.trim() || null)
    : (model.lines.find((line) => line.record.picked_at)?.record.picked_by_name?.trim() || null);
  return (
    <li data-pick-queue-order={model.lead.id}>
      <RecordCardMobile
        model={{
          key: model.key,
          leadId: model.lead.id,
          // The card's top-level pick status, one chip like No bin and To pick (owner 2026-10-08).
          code: { ...pickState, code: pickerName ? `${pickState.label} · ${pickerName.split(/\s+/)[0]}` : pickState.label },
          channel: orderChannelFace(channelOf, model),
          deadline: model.sla,
          lines: model.lines.map(orderRecordLine),
          aria: {
            card: `${title}, ${pickState.label}${pickerName ? `${toPick ? ', assigned to' : ' by'} ${pickerName}` : ''}${bin ? `, bin ${bin}` : ''}`,
            open: `Pick ${title}`,
          },
        }}
        factColumns={OUTBOUND_TRIAGE_VIEW.facts}
        location={{ path: bin, onPress: bin == null && sku ? () => onSetBin(sku) : undefined }}
        onOpen={onOpen}
        testIdPrefix="pick-card"
        density="row"
      />
    </li>
  );
}
