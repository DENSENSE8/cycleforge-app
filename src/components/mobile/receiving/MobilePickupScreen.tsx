'use client';

/**
 * `/m/receiving/pickup` — local pickups on the phone (owner 2026-09-29, Step 3).
 * The list keeps a phone card, but its identifier, status word and next step
 * are the record's own (`pickupRecordModel` + `PICKUP_LIFECYCLE`), so a card
 * reads exactly what the desk's `/pickup` header reads. `?lcpu=<id>` opens the
 * same record — the same model and the same header verbs — with the camera on
 * the item tiles.
 */

import { useMemo } from 'react';
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { Camera, ChevronRight } from '@/components/Icons';
import { MobileDetailTopBar } from '@/components/mobile/redesign/MobileDetailTopBar';
import { pickupCardModel, pickupOrderRecords, type PickupCardModel } from '@/lib/receiving/pickup/pickup-card-model';
import { usePickupLines } from '@/lib/receiving/pickup/pickup-lines';
import { pickupRecordModel } from '@/lib/receiving/pickup/pickup-record-model';
import { usePickupRecord } from '@/lib/receiving/pickup/usePickupRecord';
import { useRecordSlot } from '@/design-system/components/record-ledger/useRecordSlot';
import { RecordTitle } from '@/design-system/components/record-ledger/RecordView';
import { focusRing } from '@/design-system/tokens/focus-ring';
import { STATE_TONE_CLASSES } from '@/design-system/tokens/lifecycle';
import { cn } from '@/utils/_cn';

/** One pickup on the phone list — the record's title, status pill and next step. */
function MobilePickupCard({ order, href }: { order: PickupCardModel; href: string }) {
  const model = pickupRecordModel(order);
  return (
    <Link
      href={href}
      prefetch={false}
      data-testid="mobile-pickup-card"
      data-ref={model.title.ref}
      className={cn('flex min-h-16 items-center gap-3 border-b border-border-hairline px-4 py-3 active:bg-surface-sunken', focusRing('control'))}
    >
      <span className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="min-w-0 truncate text-role-body font-semibold">
          <RecordTitle title={model.title} testId="mobile-pickup-card-title" />
        </span>
        <span className="flex min-w-0 items-center gap-2">
          <span
            className={cn('inline-flex h-6 min-w-0 items-center gap-1.5 rounded-mode-pill px-2 text-role-caption font-semibold', STATE_TONE_CLASSES.warning.pill)}
            data-testid="mobile-pickup-card-status"
          >
            <span className={cn('size-1.5 shrink-0 rounded-full', STATE_TONE_CLASSES.warning.dot)} aria-hidden />
            <span className="truncate">{model.status.label}</span>
          </span>
          <span className="min-w-0 truncate text-role-caption text-text-muted" data-testid="mobile-pickup-card-next">
            {model.status.detail}
          </span>
        </span>
        {order.customer ? <span className="min-w-0 truncate text-role-caption text-text-muted">{order.customer}</span> : null}
      </span>
      <ChevronRight aria-hidden className="size-4 shrink-0 text-text-muted" />
    </Link>
  );
}

export function MobilePickupScreen() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const openId = Number(searchParams.get('lcpu')) || null;
  const { data: lines, isLoading, isError } = usePickupLines();
  const orders = useMemo(
    () => pickupOrderRecords(lines ?? []).map((record) => pickupCardModel({ key: `pickup:${record.orderId}`, rows: [record] })),
    [lines],
  );
  const open = openId == null ? null : (orders.find((order) => order.lead.orderId === openId) ?? null);
  const pickup = usePickupRecord(open, { capturePhotos: true });
  const slot = useRecordSlot(pickup?.model ?? null, pickup?.verbs ?? [], open ? `Local pickup ${open.identity} actions` : 'Pickup actions', 'pickup-record');

  if (openId != null) {
    return (
      <div className="flex min-h-full flex-col" data-testid="mobile-pickup-record">
        <MobileDetailTopBar title={open?.identity ?? `LCPU-${openId}`} mono subtitle="Local pickup" meta={open?.customer ?? undefined} backHref={pathname} />
        {slot ? (
          <div className="@container flex min-w-0 flex-1 flex-col">
            <div className="flex min-w-0 flex-col gap-2 border-b border-border-hairline px-4 py-2">
              <span className="min-w-0 overflow-x-auto text-role-body font-semibold">{slot.title}</span>
              <div className="min-w-0 overflow-x-auto">{slot.actions}</div>
            </div>
            {slot.view}
          </div>
        ) : (
          <p className="p-4 text-role-data text-text-muted">{isLoading ? 'Loading pickup…' : 'This pickup is not on file.'}</p>
        )}
      </div>
    );
  }

  return (
    <div className="flex min-h-full flex-col" data-testid="mobile-pickup-list">
      <MobileDetailTopBar
        title="Local pickups"
        subtitle={isLoading ? 'Loading…' : `${orders.length} pickups`}
        backHref="/m/receiving"
        right={
          <Link
            href="/m/receiving/pickup/new?type=PICKUP"
            prefetch={false}
            className="inline-flex min-h-11 items-center gap-1.5 px-2 text-role-caption font-semibold uppercase tracking-wider text-text-default"
          >
            <Camera aria-hidden className="size-4" /> New
          </Link>
        }
      />
      {isError ? <p className="p-4 text-role-data text-text-danger">Could not load local pickups.</p> : null}
      <div className="flex flex-col">
        {orders.map((order) => {
          const next = new URLSearchParams(searchParams.toString());
          next.set('lcpu', String(order.lead.orderId));
          return <MobilePickupCard key={order.key} order={order} href={`${pathname}?${next}`} />;
        })}
      </div>
      {!isLoading && orders.length === 0 && !isError ? (
        <p className="p-4 text-role-data text-text-muted">No local pickups yet — photograph the paperwork to add one.</p>
      ) : null}
    </div>
  );
}
