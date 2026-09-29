'use client';

/**
 * A scanned PAIRED BIN on `/m/pack` (owner 2026-09-29), from
 * `GET /api/packing/resolve-scan`: the SKUs paired there (home bin or
 * counted), the orders waiting on them — picked (pack them) and still to
 * pick — and the next action: pack the first ready order, else the bin's
 * ± count (`/m/pair/:code/:sku`). Read-only — every action is the existing
 * screen.
 */

import { useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { Button } from '@/design-system/primitives';
import { ITEM_RECORD_MOBILE_ROW } from '@/design-system/tokens/item-record-mobile';
import { locationCode, parseLocationCodeFlat } from '@/lib/barcode-routing';
import { locationKeypadHref } from '@/lib/mobile/location-hub-href';
import type { PackScanBinSku } from '@/lib/packing/pack-scan';
import { cn } from '@/utils/_cn';
import { PACK_HREF, PackOrderCard, packJobHref, packReadiness, pickOrderHref, useQueueCards, type PackScanBin } from './pack-order-card';

function skuKey(sku: string | null | undefined): string {
  const raw = String(sku ?? '').trim();
  return (raw.includes(':') ? raw.split(':')[0]! : raw).trim().toUpperCase();
}

function PairedSkuRow({ sku, onCount }: { sku: PackScanBinSku; onCount: () => void }) {
  const counts = [sku.binQty != null ? `${sku.binQty} here` : 'Not counted here', sku.onHand != null ? `${sku.onHand} on hand` : null]
    .filter(Boolean)
    .join(' · ');
  return (
    <li className="flex min-w-0 items-center gap-3 border-b border-border-hairline py-2" data-testid="pack-bin-sku">
      <div className="flex min-w-0 flex-1 flex-col">
        <p className="truncate text-role-body font-medium text-text-default" title={sku.title ?? sku.sku}>
          {sku.title ?? sku.sku}
        </p>
        <p className="truncate text-role-caption text-text-muted">
          <span className="font-mono">{sku.sku}</span>
          {sku.home ? ' · Home bin' : ''} · {counts}
        </p>
      </div>
      <Button variant="secondary" size="md" radius="mode" onClick={onCount}>
        ± Count
      </Button>
    </li>
  );
}

/** A scanned paired bin: its SKUs, the orders waiting on them, and the next action. */
export function PackBinSheet({ scan, onClose }: { scan: PackScanBin | null; onClose: () => void }) {
  const router = useRouter();
  const { cards, queue } = useQueueCards();
  const code = scan?.code ?? '';
  const segs = code ? parseLocationCodeFlat(code) : null;
  const face = scan?.name?.trim() || (segs ? locationCode(segs) : code);

  const waiting = useMemo(() => {
    if (!scan) return { ready: [], toPick: [] };
    const skus = new Set(scan.skus.map((s) => skuKey(s.sku)));
    const onBin = cards.filter((card) =>
      card.lines.some((line) => {
        const home = line.record.sku_home_location;
        return skus.has(skuKey(line.record.sku)) || home?.barcode === scan.code || home?.name === scan.name;
      }),
    );
    return {
      ready: onBin.filter((card) => packReadiness(card) === 'readyToPack'),
      toPick: onBin.filter((card) => packReadiness(card) === 'toPick'),
    };
  }, [scan, cards]);

  const go = (href: string) => {
    onClose();
    router.push(href);
  };
  const countHref = (sku: string) => locationKeypadHref(code, sku, { returnTo: PACK_HREF });
  const firstReady = waiting.ready[0] ?? null;
  const soleSku = scan?.skus.length === 1 ? scan.skus[0]! : null;

  return (
    <BottomSheet open={scan != null} onClose={onClose} forceVariant="sheet" scrollBody title={`Bin ${face}`}>
      <div className="flex min-h-0 flex-col gap-3 pb-2 pt-2" data-testid="pack-bin-sheet">
        <section aria-label="Paired here" className="flex flex-col">
          <h3 className="text-role-eyebrow text-text-soft">Paired here · {scan?.skus.length ?? 0}</h3>
          {scan && scan.skus.length > 0 ? (
            <ul className="flex flex-col">
              {scan.skus.map((sku) => (
                <PairedSkuRow key={sku.sku} sku={sku} onCount={() => go(countHref(sku.sku))} />
              ))}
            </ul>
          ) : (
            <p className="py-2 text-role-body text-text-muted">Nothing is paired to this bin yet.</p>
          )}
        </section>

        {queue.isPending ? (
          <p className="py-2 text-role-body text-text-muted" aria-live="polite">
            Loading orders…
          </p>
        ) : (
          <>
            <section aria-label="Ready to pack" className="flex flex-col gap-2">
              <h3 className="text-role-eyebrow text-text-soft">Picked — ready to pack · {waiting.ready.length}</h3>
              {waiting.ready.length > 0 ? (
                <ul className={cn(ITEM_RECORD_MOBILE_ROW.list, 'px-0')}>
                  {waiting.ready.map((card) => (
                    <li key={card.key}>
                      <PackOrderCard model={card} onOpen={() => go(packJobHref(card.lead.id))} testIdPrefix="pack-bin-ready" />
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-role-body text-text-muted">No picked order is waiting on this bin.</p>
              )}
            </section>
            <section aria-label="To pick" className="flex flex-col gap-2">
              <h3 className="text-role-eyebrow text-text-soft">To pick · {waiting.toPick.length}</h3>
              {waiting.toPick.length > 0 ? (
                <ul className={cn(ITEM_RECORD_MOBILE_ROW.list, 'px-0')}>
                  {waiting.toPick.map((card) => (
                    <li key={card.key}>
                      <PackOrderCard model={card} onOpen={() => go(pickOrderHref(card.lead.id))} testIdPrefix="pack-bin-topick" />
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-role-body text-text-muted">Nothing left to pick from this bin.</p>
              )}
            </section>
          </>
        )}

        {firstReady ? (
          <Button
            variant="primary"
            size="xl"
            radius="mode"
            className="w-full"
            data-testid="pack-bin-action"
            onClick={() => go(packJobHref(firstReady.lead.id))}
          >
            Pack {firstReady.orderId}
          </Button>
        ) : soleSku ? (
          <Button
            variant="primary"
            size="xl"
            radius="mode"
            className="w-full"
            data-testid="pack-bin-action"
            onClick={() => go(countHref(soleSku.sku))}
          >
            Count {soleSku.sku} here
          </Button>
        ) : null}
      </div>
    </BottomSheet>
  );
}
