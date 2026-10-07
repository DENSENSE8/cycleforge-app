'use client';

/**
 * The docs popover's identity strip — pinned above the tabs, never scrolls
 * (operator 2026-10-06): exactly which order this is, before anything is
 * linked to it.
 *
 *   row 1  platform · FULL order number · tracking + carrier · buyer · ship-by · Copy all
 *   flag   a label on the order whose tracking or ship-to name is not this
 *          order's (`packet.labelMismatches`, derived server-side)
 *   lines  photo · title · PLATFORM Item # · SKU · qty · the listing on the
 *          platform (↗) — and, for a line with no catalog SKU, the catalog's
 *          best guess to confirm (`LineSkuSuggest`); a linked line offers
 *          "Wrong SKU?" into the same confirm
 *
 * Numbers are full, mono and copyable (`RecordFullId`); Copy all takes the
 * order and tracking numbers in one go. Past two lines the rest fold behind
 * "+N lines".
 */

import { useState } from 'react';
import { Copy, Package, TriangleAlert } from 'lucide-react';
import { BrandIdentityDot } from '@/components/ui/grid-cells';
import { InlineNotice } from '@/design-system/components/InlineNotice';
import { RecordFullId } from '@/design-system/components/record-ledger/RecordFullId';
import { PhotoHoverPeek } from '@/design-system/components/PhotoHoverPeek';
import { Button } from '@/design-system/primitives/Button';
import { STATE_TONE_CLASSES } from '@/design-system/tokens/lifecycle';
import { useOrderChannel } from '@/hooks/useCatalog';
import type { OrderPacket, OrderPacketLine } from '@/lib/label-prints/order-packet-contracts';
import { resolveMarketplaceChipIdentity } from '@/lib/marketplace-order-id';
import { platformMetaBrandDot } from '@/lib/source-platform';
import { toast } from '@/lib/toast';
import { cn } from '@/utils/_cn';
import { copyToClipboard } from '@/utils/_dom';
import { formatMonthDayTimePST } from '@/utils/date';
import { LineSkuSuggest } from '@/features/labels-docs/orders/pane/LineSkuSuggest';
import { ListingLinkButton } from '@/features/labels-docs/orders/pane/ListingLinkButton';

const FOLD_AFTER = 2;

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <span className="flex min-w-0 flex-col">
      <span className="text-role-eyebrow uppercase tracking-wide text-text-faint">{label}</span>
      <span className="min-w-0 text-role-data text-text-default">{children}</span>
    </span>
  );
}

export function IdentityStrip({ packet }: { packet: OrderPacket }) {
  const channel = useOrderChannel();
  const platform = channel(packet.orderRef, packet.accountSource).label;
  const meta = resolveMarketplaceChipIdentity(packet.orderRef, platform).meta;
  const dot = platformMetaBrandDot(meta);
  const [allLines, setAllLines] = useState(false);
  const late = packet.shipByAt != null && new Date(packet.shipByAt).getTime() < Date.now();
  const lines = allLines ? packet.lines : packet.lines.slice(0, FOLD_AFTER);
  const folded = packet.lines.length - lines.length;
  const platformName = (platform || meta?.label || '').toUpperCase();

  const copyAll = async () => {
    const tracking = packet.shipment?.trackingNumber;
    const text = [`Order ${packet.orderRef}`, tracking ? `Tracking ${tracking}` : null].filter(Boolean).join('\n');
    const ok = await copyToClipboard(text, { historyKind: 'order + tracking' });
    if (!ok) toast.error('Could not copy');
    else toast.success(tracking ? 'Copied order + tracking' : 'Copied the order number — no tracking yet');
  };

  return (
    <section className="flex min-w-0 flex-col gap-2 border-b border-border-soft bg-surface-card px-4 py-3" aria-label="Order identity" data-testid="docs-identity">
      <div className="flex min-w-0 flex-wrap items-start gap-x-6 gap-y-2">
        <Fact label={platform || meta?.label || 'Order'}>
          <span className="flex min-w-0 items-center gap-1.5">
            <BrandIdentityDot className={dot.className} style={dot.style} />
            <RecordFullId value={packet.orderRef} label="order number" className="text-role-body font-semibold" />
          </span>
        </Fact>
        <Fact label={packet.shipment?.carrier ? `Tracking · ${packet.shipment.carrier}` : 'Tracking'}>
          {packet.shipment ? (
            <RecordFullId value={packet.shipment.trackingNumber} label="tracking number" />
          ) : (
            <span className="text-text-muted">{packet.pickup ? 'Pickup — no tracking' : 'No tracking yet'}</span>
          )}
        </Fact>
        <Fact label="Buyer">{packet.buyerName ?? <span className="text-text-muted">—</span>}</Fact>
        <Fact label="Ship by">
          {packet.shipByAt ? (
            <span className={cn('inline-flex items-center gap-1.5', late && 'font-semibold')}>
              {formatMonthDayTimePST(packet.shipByAt)}
              {late ? <span className={cn('rounded-full px-1.5 text-role-eyebrow', STATE_TONE_CLASSES.danger.pill)}>Late</span> : null}
            </span>
          ) : (
            <span className="text-text-muted">—</span>
          )}
        </Fact>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="ml-auto self-center"
          icon={<Copy className="size-3.5" />}
          onClick={() => void copyAll()}
          title="Copy the order and tracking numbers"
          data-testid="docs-identity-copy-all"
        >
          Copy all
        </Button>
      </div>

      {packet.labelMismatches.length > 0 ? (
        <InlineNotice tone="warning" size="sm" icon={<TriangleAlert />} title="A label may not belong to this order">
          <ul data-testid="docs-identity-mismatch">
            {packet.labelMismatches.map((m) => (
              <li key={`${m.labelKey}:${m.kind}`}>
                {m.kind === 'tracking' ? (
                  <>
                    Label tracking <span className="font-mono">{m.label}</span> is not on this order (<span className="font-mono">{m.order}</span>).
                  </>
                ) : (
                  <>
                    Label ships to {m.label} — the order&apos;s buyer is {m.order}.
                  </>
                )}
              </li>
            ))}
          </ul>
        </InlineNotice>
      ) : null}

      <ul className="flex min-w-0 flex-col gap-1.5">
        {lines.map((line) => (
          <StripLine key={line.orderLineId} line={line} platformName={platformName} />
        ))}
      </ul>
      {packet.lines.length > FOLD_AFTER ? (
        <button
          type="button"
          className="ds-raw-button self-start text-role-caption text-text-muted hover:text-text-default"
          onClick={() => setAllLines((open) => !open)}
        >
          {folded > 0 ? `+${folded} more line${folded === 1 ? '' : 's'}` : 'Show fewer lines'}
        </button>
      ) : null}
    </section>
  );
}

function StripLine({ line, platformName }: { line: OrderPacketLine; platformName: string }) {
  const [changing, setChanging] = useState(false);
  return (
    <li className="flex min-w-0 flex-col gap-1.5">
      <div className="flex min-w-0 items-center gap-2.5">
        <PhotoHoverPeek
          src={line.photoUrl}
          alt={line.title}
          className={cn('block size-10 shrink-0 overflow-hidden rounded-md ring-1 ring-inset ring-border-soft', line.photoUrl ? 'bg-surface-card' : 'bg-surface-sunken')}
        >
          {line.photoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- catalog/channel photo of arbitrary origin
            <img src={line.photoUrl} alt="" loading="lazy" className="size-full object-cover" />
          ) : (
            <span className="flex size-full items-center justify-center text-text-faint" aria-hidden>
              <Package className="size-4" />
            </span>
          )}
        </PhotoHoverPeek>
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="min-w-0 truncate text-role-data font-medium text-text-default" title={line.title}>
            {line.title}
          </span>
          <span className="flex min-w-0 flex-wrap items-center gap-x-2 text-role-caption text-text-muted">
            {platformName ? <span className="font-semibold tracking-wide text-text-default">{platformName}</span> : null}
            {line.itemNumber ? <span className="font-mono">Item # {line.itemNumber}</span> : null}
            {line.sku ? <span className="font-mono">SKU {line.sku}</span> : <span className="text-text-warning">No SKU</span>}
            <span className="tabular-nums">×{line.quantity}</span>
          </span>
        </span>
        <ListingLinkButton listing={line.listing} subject={line.title} />
        {line.skuCatalogId != null ? (
          <Button type="button" variant="ghost" size="sm" className="shrink-0" aria-expanded={changing} onClick={() => setChanging((open) => !open)}>
            {changing ? 'Keep this SKU' : 'Wrong SKU?'}
          </Button>
        ) : null}
      </div>
      {line.skuCatalogId == null ? <LineSkuSuggest line={line} /> : changing ? <LineSkuSuggest line={line} onDone={() => setChanging(false)} /> : null}
    </li>
  );
}
