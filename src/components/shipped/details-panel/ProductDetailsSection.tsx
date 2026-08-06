'use client';

import { useEffect, useMemo, useState } from 'react';
import { ShippedOrder } from '@/lib/neon/orders-queries';
import { useOrderAssignment } from '@/hooks';
import { useSkuIdentity } from '@/hooks/useSkuIdentity';
import { CopyableValueFieldBlock } from '@/components/shipped/details-panel/blocks/CopyableValueFieldBlock';
import { ContextualManualLinkRow } from '@/components/shipped/details-panel/blocks/ContextualManualLinkRow';
import { ConditionPills } from '@/components/receiving/workspace/ConditionPills';
import { FnskuCatalogInfoPanel } from '@/components/fba/FnskuCatalogInfoPanel';
import { getFnskuCatalogValue, isFnskuCatalogContext } from '@/utils/fnsku-catalog';
import { CopyChip } from '@/components/ui/CopyChip';
import { LedgerValue } from '@/design-system/components/LedgerValue';
import { DetailsPanelRow } from '@/design-system/components/DetailsPanelRow';
import { Button, IconButton } from '@/design-system/primitives';
import { Copy, ExternalLink, Lock } from '@/components/Icons';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import type { EditableShippingFields } from '@/components/shipped/details-panel/ShippingInformationSection';
import { useExternalItemUrl } from '@/hooks/useExternalItemUrl';
import { isOrderShipped } from '@/components/shipped/details-panel/shipped-details-logic';
import { isAmazonOrderForItemRefresh } from '@/lib/amazon/order-item-refresh-shared';
import { conditionGradeTone } from '@/lib/condition-tone';
import { conditionLabel } from '@/lib/conditions';
import { toast } from '@/lib/toast';

import { normalizeCondition, type ConditionGrade } from '@/components/tech/StationConditionEditor';
import { refreshDomain } from '@/lib/refresh/bus';

// Per-platform CopyChip styling. Chip palette matches SkuIdentity /
// order-platform.ts so the panel stays consistent with the rest of the app.
const PLATFORM_STYLE: Record<
  string,
  { label: string; chip: string }
> = {
  zoho:    { label: 'Zoho',    chip: 'border-red-200    bg-red-50    text-red-700' },
  amazon:  { label: 'Amazon',  chip: 'border-orange-200 bg-orange-50 text-orange-700' },
  fba:     { label: 'FBA',     chip: 'border-orange-200 bg-orange-50 text-orange-700' },
  ecwid:   { label: 'Ecwid',   chip: 'border-blue-200   bg-blue-50   text-blue-700' },
  ebay:    { label: 'eBay',    chip: 'border-yellow-200 bg-yellow-50 text-yellow-800' },
  walmart: { label: 'Walmart', chip: 'border-amber-200  bg-amber-50  text-amber-800' },
  mercari: { label: 'Mercari', chip: 'border-purple-200 bg-purple-50 text-purple-700' },
  shopify: { label: 'Shopify', chip: 'border-border-default  bg-surface-canvas  text-text-default' },
};
const DEFAULT_STYLE = {
  label: 'Other',
  chip: 'border-border-soft bg-surface-canvas text-text-muted',
};

function styleFor(platform: string) {
  return PLATFORM_STYLE[platform.toLowerCase()] || {
    ...DEFAULT_STYLE,
    label: platform.charAt(0).toUpperCase() + platform.slice(1),
  };
}

interface PlatformSkuEntry {
  platform: string;
  value: string;
  itemId?: string | null;
  accountName?: string | null;
}

function PlatformSkuRow({ entry }: { entry: PlatformSkuEntry }) {
  const style = styleFor(entry.platform);
  return (
    <div className="flex items-center gap-2 py-1">
      <div className="flex w-[88px] shrink-0 flex-col items-start gap-0.5">
        <span
          className={`inline-flex w-full items-center justify-center rounded-md border px-1.5 py-0.5 text-role-micro font-semibold uppercase tracking-wider ${style.chip}`}
        >
          {style.label}
        </span>
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

function SkuPlatformList({
  canonicalSku,
  platforms,
  loading,
}: {
  canonicalSku: string;
  platforms: PlatformSkuEntry[];
  loading: boolean;
}) {
  const rows = useMemo<PlatformSkuEntry[]>(
    () => [
      ...(canonicalSku ? [{ platform: 'zoho', value: canonicalSku } satisfies PlatformSkuEntry] : []),
      ...platforms,
    ],
    [canonicalSku, platforms],
  );

  if (loading && rows.length === 0) {
    return (
      <div className="py-2">
        <div className="h-6 w-32 animate-pulse rounded bg-surface-sunken" />
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div className="py-2 text-xs text-text-faint">No SKU mappings</div>
    );
  }

  return (
    <div className="py-1.5">
      {rows.map((row, i) => (
        <PlatformSkuRow key={`${row.platform}-${i}-${row.value}`} entry={row} />
      ))}
    </div>
  );
}

function ConditionHeaderChip({
  value,
  locked,
  saving,
  expanded,
  onToggle,
}: {
  value: ConditionGrade;
  locked: boolean;
  saving: boolean;
  expanded: boolean;
  onToggle: () => void;
}) {
  const tone = conditionGradeTone(value);
  const label = conditionLabel(value, 'pill');
  const chip = (
    <span
      className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-role-micro font-semibold uppercase tracking-wider ring-1 ring-inset ${tone.badge}`}
    >
      {label}
      {locked ? <Lock className="h-3 w-3 opacity-70" aria-hidden /> : null}
      {saving ? <span className="text-text-info">…</span> : null}
    </span>
  );

  if (locked) {
    return (
      <HoverTooltip label="Condition locked after shipping" asChild focusable={false}>
        <span className="inline-flex">{chip}</span>
      </HoverTooltip>
    );
  }

  return (
    <HoverTooltip label={expanded ? 'Hide condition picker' : 'Change condition'} asChild>
      {/* ds-raw-button: compact condition chip in Product Title header — not a DS Button CTA */}
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={expanded}
        aria-label={`Condition ${label}${expanded ? ' — collapse' : ' — change'}`}
        className="ds-raw-button inline-flex rounded-md transition-opacity hover:opacity-90"
      >
        {chip}
      </button>
    </HoverTooltip>
  );
}

export function ProductDetailsSection({
  shipped,
  editableShippingFields,
}: {
  shipped: ShippedOrder;
  editableShippingFields?: EditableShippingFields;
}) {
  const [conditionValue, setConditionValue] = useState<ConditionGrade>(normalizeCondition(shipped.condition));
  const [isSavingCondition, setIsSavingCondition] = useState(false);
  const [conditionExpanded, setConditionExpanded] = useState(false);
  const [amazonRefreshing, setAmazonRefreshing] = useState(false);
  const orderAssignmentMutation = useOrderAssignment();
  const skuIdentity = useSkuIdentity(shipped.sku, shipped.account_source);
  // Condition freezes once the order has shipped — you can't re-grade what's gone.
  const conditionLocked = isOrderShipped(shipped);

  useEffect(() => {
    setConditionValue(normalizeCondition(shipped.condition));
    setConditionExpanded(false);
  }, [shipped.id, shipped.condition]);

  const handleConditionChange = async (nextCondition: string) => {
    if (conditionLocked || isSavingCondition) return;
    const grade = normalizeCondition(nextCondition);
    setConditionValue(grade);
    setConditionExpanded(false);
    setIsSavingCondition(true);
    try {
      await orderAssignmentMutation.mutateAsync({
        orderId: shipped.id,
        condition: grade,
      });
    } catch (error) {
      console.error('Failed to update condition:', error);
    } finally {
      setIsSavingCondition(false);
    }
  };

  const { getExternalUrlByItemNumber } = useExternalItemUrl();
  const fnskuCatalogValue = getFnskuCatalogValue(shipped);
  const showFnskuCatalog = isFnskuCatalogContext(shipped) && Boolean(fnskuCatalogValue);

  const refreshAfterCatalogSave = () => {
    refreshDomain('orders.outbound');
  };

  const canonicalSku = (skuIdentity.canonicalSku || shipped.sku || '').trim();
  const platformEntries = useMemo<PlatformSkuEntry[]>(() => {
    const list: PlatformSkuEntry[] = [];
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
  }, [skuIdentity.platforms]);

  const itemNumberValue = String(
    editableShippingFields?.itemNumber ?? shipped.item_number ?? '',
  ).trim();
  const hasItemNumber = Boolean(itemNumberValue);
  const canAmazonRefresh = isAmazonOrderForItemRefresh(shipped.order_id, shipped.account_source);
  const itemExternalUrl = hasItemNumber ? getExternalUrlByItemNumber(itemNumberValue) : null;

  const handleAmazonRefresh = async () => {
    if (amazonRefreshing || !canAmazonRefresh) return;
    setAmazonRefreshing(true);
    try {
      const res = await fetch(`/api/orders/${shipped.id}/amazon-refresh`, { method: 'POST' });
      const data = await res.json().catch(() => ({})) as {
        success?: boolean;
        error?: string;
        itemNumber?: string;
        productTitle?: string;
      };
      if (!res.ok || !data.success) {
        throw new Error(data.error || `Amazon refresh failed (HTTP ${res.status})`);
      }
      const nextItem = String(data.itemNumber || '').trim();
      if (nextItem && editableShippingFields) {
        editableShippingFields.onItemNumberChange(nextItem);
        editableShippingFields.onBlur();
      }
      toast.success(nextItem ? `Item number ${nextItem}` : 'Amazon listing refreshed');
      refreshAfterCatalogSave();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Amazon refresh failed');
    } finally {
      setAmazonRefreshing(false);
    }
  };

  const itemNumberRow = (
    <DetailsPanelRow
      label="Item Number"
      actions={
        hasItemNumber ? (
          <div className="flex items-center gap-1.5">
            {itemExternalUrl ? (
              <HoverTooltip label="Open listing" asChild>
                <IconButton
                  tone="accent"
                  onClick={() => window.open(itemExternalUrl, '_blank', 'noopener,noreferrer')}
                  ariaLabel="Open item number listing"
                  icon={<ExternalLink className="h-3.5 w-3.5" />}
                />
              </HoverTooltip>
            ) : null}
            <HoverTooltip label="Copy Item Number" asChild>
              <IconButton
                tone="neutral"
                onClick={() => {
                  void navigator.clipboard.writeText(itemNumberValue);
                }}
                ariaLabel="Copy Item Number"
                icon={<Copy className="h-3.5 w-3.5" />}
              />
            </HoverTooltip>
          </div>
        ) : null
      }
    >
      {hasItemNumber ? (
        <div className="space-y-0">
          <p className="truncate text-sm font-semibold text-text-default">{itemNumberValue}</p>
          <ContextualManualLinkRow
            sku={shipped.sku}
            itemNumber={itemNumberValue}
            allowEmbeddedItemNumberInput={false}
            embedded
          />
        </div>
      ) : (
        <div className="space-y-2">
          <p className="text-sm font-medium text-text-faint">No item number</p>
          {canAmazonRefresh ? (
            <Button
              type="button"
              variant="secondary"
              size="sm"
              className="text-xs"
              disabled={amazonRefreshing}
              onClick={() => { void handleAmazonRefresh(); }}
            >
              {amazonRefreshing ? 'Reimporting…' : 'Reimport from Amazon'}
            </Button>
          ) : null}
        </div>
      )}
    </DetailsPanelRow>
  );

  return (
    <section className="space-y-3">
      {showFnskuCatalog ? (
        <div className="space-y-3">
          <FnskuCatalogInfoPanel
            fnsku={fnskuCatalogValue}
            productTitle={shipped.product_title}
            condition={shipped.condition}
            sku={shipped.sku}
            asin={(shipped as { asin?: string | null }).asin ?? null}
            sourceKey={shipped.id}
            onCatalogSaved={refreshAfterCatalogSave}
          />
          {hasItemNumber ? (
            <ContextualManualLinkRow
              sku={shipped.sku}
              itemNumber={shipped.item_number}
              allowEmbeddedItemNumberInput={false}
            />
          ) : null}
        </div>
      ) : (
        <div className="space-y-0">
          <CopyableValueFieldBlock
            label="Product Title"
            value={shipped.product_title || 'Not provided'}
            noTruncate
            variant="flat"
            valueClassName="font-sans"
            headerAccessory={
              <ConditionHeaderChip
                value={conditionValue}
                locked={conditionLocked}
                saving={isSavingCondition}
                expanded={conditionExpanded}
                onToggle={() => setConditionExpanded((v) => !v)}
              />
            }
          />

          {!conditionLocked && conditionExpanded ? (
            <div className="border-b border-border-hairline py-2">
              <ConditionPills value={conditionValue} onChange={handleConditionChange} />
            </div>
          ) : null}

          {itemNumberRow}

          <SkuPlatformList
            canonicalSku={canonicalSku}
            platforms={platformEntries}
            loading={skuIdentity.loading}
          />
        </div>
      )}
    </section>
  );
}
