'use client';

import { useMemo } from 'react';
import { ShippedOrder } from '@/lib/neon/orders-queries';
import { useSkuIdentity } from '@/hooks/useSkuIdentity';
import { useExternalItemUrl } from '@/hooks/useExternalItemUrl';
import { ContextualManualLinkRow } from '@/components/shipped/details-panel/blocks/ContextualManualLinkRow';
import { IntakeManualLinkBlock } from '@/components/shipped/IntakeManualLinkBlock';
import { FnskuCatalogInfoPanel } from '@/components/fba/FnskuCatalogInfoPanel';
import { getFnskuCatalogValue, isFnskuCatalogContext } from '@/utils/fnsku-catalog';
import { CopyChip } from '@/components/ui/CopyChip';
import { PlatformMark } from '@/components/ui/PlatformMark';
import { LedgerValue } from '@/design-system/components/LedgerValue';
import { ItemRecordCard, type ItemRecordFact } from '@/design-system/components/item-record';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import type { EditableShippingFields } from '@/components/shipped/details-panel/ShippingInformationSection';
import { shippedOrderToItemRecords } from '@/lib/item-record/shipped-order-item-record';
import { sourcePlatformMeta } from '@/lib/source-platform';

interface PlatformSkuEntry {
  platform: string;
  value: string;
  itemId?: string | null;
  accountName?: string | null;
}

function PlatformSkuRow({ entry }: { entry: PlatformSkuEntry }) {
  const meta = sourcePlatformMeta(entry.platform);
  return (
    <div className="flex items-center gap-2 py-1">
      <div className="flex w-[88px] shrink-0 flex-col items-start gap-0.5">
        <HoverTooltip label={meta.label} asChild focusable={false}>
          <span className="inline-flex" aria-label={meta.label}>
            <PlatformMark platformValue={entry.platform} meta={meta} />
          </span>
        </HoverTooltip>
        {entry.accountName && (
          <span className="w-full truncate text-role-eyebrow font-medium uppercase tracking-wider text-text-faint">
            {entry.accountName}
          </span>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <CopyChip
          value={entry.value}
          display={entry.value}
          width="w-fit max-w-full"
          truncateDisplay={false}
        />
      </div>
      {entry.itemId && entry.itemId !== entry.value && (
        <LedgerValue value={entry.itemId} variant="id" tier="meta" tone="faint" className="shrink-0" nowrap />
      )}
    </div>
  );
}

/**
 * The order's product facts, painted on the shared item surface.
 *
 * **This section is READ-ONLY, everywhere, by construction** (operator ruling,
 * 2026-08-22). It used to be the panel's second write surface and carried
 * three mutations: an inline condition re-grade, "Reimport from Amazon", and
 * an open-listing jump. All three are gone, and with them the `canEditProduct`
 * capability prop that five call sites had to remember to pass — a prop whose
 * whole existence traced to a bug where the condition editor consulted no
 * capability at all and `/search` silently committed re-grades. A section that
 * cannot write needs no permission to describe.
 *
 * Condition re-grade still exists where the work is: the receiving workspace
 * (`ConditionPills`) and the tech station (`StationConditionEditor`).
 *
 * The face itself is {@link ItemRecordCard} — the same ledger the scan
 * stations paint in the middle context display, and the same one `/search`
 * mounts. Identifiers render last-8 with no truncation and no way to ask for
 * anything else.
 */
export function ProductDetailsSection({
  shipped,
  editableShippingFields,
}: {
  shipped: ShippedOrder;
  /**
   * Live SHIPPING-section edit state. Read for display only: while the
   * operator is typing an item number in the shipping editors, this section
   * reflects the uncommitted value rather than the stale stored one. This
   * section writes nothing back.
   */
  editableShippingFields?: EditableShippingFields;
}) {
  const skuIdentity = useSkuIdentity(shipped.sku, shipped.account_source);
  const { getExternalUrlByItemNumber } = useExternalItemUrl();

  const itemNumberValue = String(
    editableShippingFields?.itemNumber ?? shipped.item_number ?? '',
  ).trim();
  // Opening a listing is a READ. It rode out with the write bundle when this
  // section went read-only and came straight back — a jump to the marketplace
  // page mutates nothing, and it is how an operator checks what the buyer saw.
  const itemExternalUrl = itemNumberValue
    ? getExternalUrlByItemNumber(itemNumberValue)
    : null;

  const platformEntries = useMemo<PlatformSkuEntry[]>(() => {
    const canonical = (skuIdentity.canonicalSku || shipped.sku || '').trim();
    const list: PlatformSkuEntry[] = canonical
      ? [{ platform: 'zoho', value: canonical }]
      : [];
    for (const p of skuIdentity.platforms || []) {
      const value = (p.platformSku && p.platformSku.trim()) || (p.platformItemId || '').trim();
      if (!value) continue;
      list.push({
        platform: p.platform,
        value,
        itemId: p.platformItemId ?? null,
        accountName: p.accountName ?? null,
      });
    }
    return list;
  }, [skuIdentity.canonicalSku, skuIdentity.platforms, shipped.sku]);

  const items = useMemo(() => {
    const facts: ItemRecordFact[] = [
      {
        id: 'item-number',
        label: 'Item Number',
        copyValue: itemNumberValue || null,
        href: itemExternalUrl,
        hrefLabel: 'Open listing',
        value: itemNumberValue ? (
          <div className="space-y-0">
            <p className="truncate text-sm font-semibold text-text-default">{itemNumberValue}</p>
            <ContextualManualLinkRow
              sku={shipped.sku}
              itemNumber={itemNumberValue}
              allowEmbeddedItemNumberInput={false}
              embedded
            />
            {shipped.sku?.trim() ? (
              <IntakeManualLinkBlock
                sku={shipped.sku}
                productTitle={shipped.product_title ?? undefined}
                orderId={shipped.order_id ?? undefined}
              />
            ) : null}
          </div>
        ) : (
          <p className="text-sm font-medium text-text-faint">No item number</p>
        ),
      },
    ];

    if (platformEntries.length > 0 || skuIdentity.loading) {
      facts.push({
        id: 'platform-skus',
        label: 'Marketplace SKUs',
        value: skuIdentity.loading ? (
          <p className="text-sm font-medium text-text-faint">Resolving…</p>
        ) : (
          <div className="space-y-0">
            {platformEntries.map((entry) => (
              <PlatformSkuRow key={`${entry.platform}:${entry.value}`} entry={entry} />
            ))}
          </div>
        ),
      });
    }

    return shippedOrderToItemRecords(shipped).map((item) => ({ ...item, facts }));
  }, [shipped, itemNumberValue, itemExternalUrl, platformEntries, skuIdentity.loading]);

  const fnskuCatalogValue = getFnskuCatalogValue(shipped);
  const showFnskuCatalog = isFnskuCatalogContext(shipped) && Boolean(fnskuCatalogValue);

  return (
    <section className="space-y-3">
      <ItemRecordCard
        items={items}
        emptyTitle="No item"
        emptyDescription="This order carries no product facts."
        footer={
          showFnskuCatalog ? (
            <FnskuCatalogInfoPanel
              fnsku={fnskuCatalogValue}
              productTitle={shipped.product_title}
              condition={shipped.condition}
              sku={shipped.sku}
              asin={(shipped as { asin?: string | null }).asin ?? null}
              sourceKey={shipped.id}
              // Read-only section — the catalog quick-add is a write.
              allowEdit={false}
            />
          ) : null
        }
      />
    </section>
  );
}
