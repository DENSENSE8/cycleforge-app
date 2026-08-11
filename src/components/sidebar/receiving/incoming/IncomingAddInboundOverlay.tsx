'use client';

/**
 * Manual Add Inbound — flush right-rail create form.
 *
 * Platform · Type · Priority use the house flush combobox
 * (`SearchableSelectField` — same import + `appearance="flush"` as receiving
 * Claim compose). Goodwill / other → ingest `manual` + stamp `source_platform`.
 * Macro floor = Add CTA + `→|` close.
 */

import { useEffect, useMemo, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { DetailStackRailRegistrar } from '@/components/right-rail/DetailStackRailRegistrar';
import { PaneHeaderCloseButton, PaneHeaderLabel } from '@/components/ui/pane-header';
import { SearchableSelectField } from '@/design-system/components';
import { Button, FlushTerminalFooter, TextField } from '@/design-system/primitives';
import { cornerClass } from '@/design-system/tokens/radius';
import { useDebounce } from '@/hooks';
import { usePlatformCatalog, useReceivingTypeCatalog } from '@/hooks/useCatalog';
import { useSkuCatalogSearch, type SkuCatalogItem } from '@/hooks/useSkuCatalogSearch';
import {
  inboundSourcePlatformForRaw,
  inboundSourceTypeForPlatform,
} from '@/lib/inbound/desk-csv';
import { yieldStationRightEdgeForDeskOccupant } from '@/components/receiving/workspace/line-edit/unbox-right-edge';
import { priorityOverrideTiersForPicker } from '@/lib/receiving/priority-override';
import { invalidateReceivingFeeds } from '@/lib/queries/receiving-queries';
import { toast } from '@/lib/toast';
import { STATION_DESK_OCCUPANT_CLOSE_EVENT } from '@/utils/events';
import { cn } from '@/utils/_cn';

/** Prefer purchase sources operators fix unfound cartons with. */
const INBOUND_PLATFORM_PRIORITY = ['amazon', 'goodwill', 'ebay', 'walmart', 'shopify'] as const;

const PRIORITY_AUTO = 'auto';

export function IncomingAddInboundOverlay({
  open,
  onClose,
  initialOrderId = '',
  initialPlatform = 'amazon',
  initialType = 'PO',
}: {
  open: boolean;
  onClose: () => void;
  initialOrderId?: string;
  /** `source_platform` value (amazon · ebay · goodwill · …). */
  initialPlatform?: string;
  /** Catalog receiving_type (PO · RETURN · …). */
  initialType?: string;
}) {
  const queryClient = useQueryClient();
  const router = useRouter();
  const pathname = usePathname();
  const platformCatalog = usePlatformCatalog();
  const typeCatalog = useReceivingTypeCatalog();
  const [platform, setPlatform] = useState(initialPlatform);
  const [receivingType, setReceivingType] = useState(initialType);
  const [priority, setPriority] = useState<string>(PRIORITY_AUTO);
  const [orderId, setOrderId] = useState('');
  const [sku, setSku] = useState('');
  const [itemName, setItemName] = useState('');
  // Zoho-inventory pairing: the picked catalog item binds the real sku +
  // canonical title onto the spine. `manualMode` is the honest off-catalog escape.
  const [pickedItem, setPickedItem] = useState<SkuCatalogItem | null>(null);
  const [itemQuery, setItemQuery] = useState('');
  const [manualMode, setManualMode] = useState(false);
  const [quantity, setQuantity] = useState('1');
  const [trackingNumber, setTrackingNumber] = useState('');
  const [listingUrl, setListingUrl] = useState('');
  const [seller, setSeller] = useState('');
  const [accountName, setAccountName] = useState('');
  const [returnReason, setReturnReason] = useState('');
  const [rmaId, setRmaId] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const platformOptions = useMemo(() => {
    const catalog = platformCatalog.options ?? [];
    const ranked = [...catalog].sort((a, b) => {
      const ai = INBOUND_PLATFORM_PRIORITY.indexOf(
        a.value.toLowerCase() as (typeof INBOUND_PLATFORM_PRIORITY)[number],
      );
      const bi = INBOUND_PLATFORM_PRIORITY.indexOf(
        b.value.toLowerCase() as (typeof INBOUND_PLATFORM_PRIORITY)[number],
      );
      const ar = ai === -1 ? 99 : ai;
      const br = bi === -1 ? 99 : bi;
      return ar - br || a.label.localeCompare(b.label);
    });
    return ranked.map((o) => ({
      value: o.value,
      label: o.label,
      group: 'Platforms',
    }));
  }, [platformCatalog.options]);

  const typeOptions = useMemo(
    () =>
      (typeCatalog.options ?? [])
        .filter((o) => o.value !== 'PICKUP')
        .map((o) => ({
          value: o.value,
          label: o.label,
          group: 'Standard types',
        })),
    [typeCatalog.options],
  );

  const priorityOptions = useMemo(
    () => [
      {
        value: PRIORITY_AUTO,
        label: 'Auto',
        meta: 'Follows platform',
        group: 'Platform',
      },
      // Escalate Low → Priority (bottom); default heat is platform/org policy.
      ...priorityOverrideTiersForPicker().map((t) => ({
        value: String(t.value),
        label: t.label,
        meta: t.title,
        group: 'Manual override',
      })),
    ],
    [],
  );

  // Zoho-inventory item search — the picker pairs a real catalog SKU + title.
  // Debounce the field query into the shared search hook (Zoho items mirror).
  const debouncedItemQuery = useDebounce(itemQuery, 250);
  const itemSearch = useSkuCatalogSearch(debouncedItemQuery, {
    searchField: 'zoho_catalog',
    limit: 20,
  });

  const itemOptions = useMemo(() => {
    const rows = itemSearch.data ?? [];
    // Keep the currently-paired item present so the trigger label resolves even
    // after the query clears (remote mode does not re-fetch on empty).
    const merged =
      pickedItem && !rows.some((r) => r.id === pickedItem.id)
        ? [pickedItem, ...rows]
        : rows;
    return merged.map((it) => ({
      value: String(it.id),
      label: it.product_title || it.sku,
      meta: it.sku,
      group: 'Zoho inventory',
      data: it,
    }));
  }, [itemSearch.data, pickedItem]);

  useEffect(() => {
    if (!open) return;
    setPlatform(initialPlatform || 'amazon');
    setReceivingType(initialType || 'PO');
    setPriority(PRIORITY_AUTO);
    setOrderId(initialOrderId.trim());
    setSku('');
    setItemName('');
    setPickedItem(null);
    setItemQuery('');
    setManualMode(false);
    setQuantity('1');
    setTrackingNumber('');
    setListingUrl('');
    setSeller(initialPlatform === 'goodwill' ? 'Goodwill' : '');
    setAccountName('');
    setReturnReason('');
    setRmaId('');
    setError(null);
    setSubmitting(false);
    // One right-edge wrapper: yield Station Displays (+ details / AI) before
    // this RightRailHost claim paints — never stack two push columns.
    yieldStationRightEdgeForDeskOccupant((qs) => {
      router.replace(qs ? `${pathname}?${qs}` : pathname || '/', { scroll: false });
    });
  }, [open, initialOrderId, initialPlatform, initialType, router, pathname]);

  useEffect(() => {
    if (!open) return;
    const onPeerOpen = () => onClose();
    window.addEventListener(STATION_DESK_OCCUPANT_CLOSE_EVENT, onPeerOpen);
    return () => window.removeEventListener(STATION_DESK_OCCUPANT_CLOSE_EVENT, onPeerOpen);
  }, [open, onClose]);

  const isReturn = receivingType === 'RETURN';
  const canSubmit =
    orderId.trim().length > 0
    && platform.trim().length > 0
    && receivingType.trim().length > 0
    && (sku.trim().length > 0 || itemName.trim().length > 0)
    && !submitting;

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    try {
      const qty = Number(quantity);
      const sourceType = inboundSourceTypeForPlatform(platform);
      const sourcePlatform = inboundSourcePlatformForRaw(platform);
      const priorityTier =
        priority === PRIORITY_AUTO ? null : Number(priority);
      const res = await fetch('/api/receiving/inbound/import-purchase', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          kind: isReturn ? 'return' : 'purchase',
          source_type: sourceType,
          source_platform: sourcePlatform,
          receiving_type: receivingType,
          priority_tier: priorityTier,
          order_id: orderId.trim(),
          sku: sku.trim() || undefined,
          item_name: itemName.trim() || undefined,
          quantity: Number.isFinite(qty) && qty >= 1 ? Math.floor(qty) : 1,
          tracking_number: trackingNumber.trim() || undefined,
          listing_url: listingUrl.trim() || undefined,
          seller: seller.trim() || undefined,
          account_name: accountName.trim() || undefined,
          return_reason: isReturn ? returnReason.trim() || undefined : undefined,
          rma_id: isReturn ? rmaId.trim() || undefined : undefined,
        }),
      });
      const data = (await res.json().catch(() => null)) as {
        success?: boolean;
        error?: string;
        created?: boolean;
      } | null;
      if (!res.ok || !data?.success) {
        throw new Error(data?.error || `Import failed (${res.status})`);
      }
      invalidateReceivingFeeds(queryClient);
      const label = isReturn ? 'Return' : 'Purchase';
      toast.success(data.created ? `${label} added to Incoming` : `${label} refreshed on Incoming`);
      onClose();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Import failed';
      setError(message);
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  };

  if (!open) return null;

  const orderLabel =
    platform === 'ebay'
      ? 'eBay order #'
      : platform === 'amazon' || platform === 'fba'
        ? 'Amazon order #'
        : platform === 'goodwill'
          ? 'Goodwill order / PO #'
          : 'Order / PO #';

  const typeLabel =
    typeOptions.find((o) => o.value === receivingType)?.label ?? receivingType;

  return (
    <DetailStackRailRegistrar
      id="detail:incoming-import-ebay"
      onClose={onClose}
      modal={false}
      ariaLabel="Add inbound purchase or return"
    >
      <div className="flex h-full min-h-0 flex-col overflow-hidden bg-surface-card">
        <div className="shrink-0 border-b border-border-hairline px-3.5 py-2">
          <PaneHeaderLabel eyebrow="Add inbound" value={`${typeLabel} intake`} />
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto bg-surface-card">
          {/* One card plane — flush combobox cells (floating labels), no canvas
              gutters between Platform · Type · Priority. Keyboard: Tab walks
              triggers; ArrowDown/Enter/typeahead open; Escape returns focus. */}
          <div
            className="divide-y divide-border-hairline border-b border-border-hairline"
            data-testid="add-inbound-classify"
          >
            <SearchableSelectField
              appearance="flush"
              label="Platform"
              autoFocus
              value={platform}
              onChange={(id) => {
                if (id == null) return;
                const next = String(id);
                setPlatform(next);
                if (next === 'goodwill' && !seller.trim()) setSeller('Goodwill');
              }}
              options={platformOptions}
              placeholder="Search or select…"
              searchPlaceholder="Type to filter…"
              emptyMessage="No platforms match"
              ariaLabel="Platform"
            />
            <SearchableSelectField
              appearance="flush"
              label="Type"
              value={receivingType}
              onChange={(id) => {
                if (id == null) return;
                setReceivingType(String(id));
              }}
              options={typeOptions}
              placeholder="Search or select…"
              searchPlaceholder="Type to filter…"
              emptyMessage="No types match"
              ariaLabel="Type"
            />
            <SearchableSelectField
              appearance="flush"
              label="Priority"
              value={priority}
              onChange={(id) => {
                if (id == null) return;
                setPriority(String(id));
              }}
              options={priorityOptions}
              placeholder="Search or select…"
              searchPlaceholder="Type to filter…"
              emptyMessage="No priorities match"
              ariaLabel="Priority"
            />
          </div>

          <div className="divide-y divide-border-hairline">
            <TextField
              label={orderLabel}
              value={orderId}
              onChange={setOrderId}
              required
              tone="amber"
              appearance="flush"
            />
            {manualMode ? (
              <>
                <TextField
                  label="SKU"
                  value={sku}
                  onChange={setSku}
                  tone="neutral"
                  appearance="flush"
                />
                <TextField
                  label="Item title"
                  value={itemName}
                  onChange={setItemName}
                  tone="neutral"
                  appearance="flush"
                />
                <div className="flex items-center justify-between inset-cozy">
                  <span className="text-role-caption text-text-faint">
                    Manual item — not paired to inventory.
                  </span>
                  {/* ds-raw-button: inline text toggle, not a padded Button */}
                  <button
                    type="button"
                    className="shrink-0 text-role-caption font-medium text-blue-600 hover:underline"
                    onClick={() => setManualMode(false)}
                  >
                    Search inventory
                  </button>
                </div>
              </>
            ) : (
              <>
                <SearchableSelectField
                  appearance="flush"
                  label="Product (Zoho inventory)"
                  value={pickedItem ? String(pickedItem.id) : null}
                  onChange={(_id, opt) => {
                    const it = (opt?.data ?? null) as SkuCatalogItem | null;
                    if (!it) return;
                    setPickedItem(it);
                    setSku(it.sku ?? '');
                    setItemName(it.product_title ?? '');
                  }}
                  options={itemOptions}
                  onSearchChange={setItemQuery}
                  loading={itemSearch.isFetching}
                  placeholder="Search inventory by title or SKU…"
                  searchPlaceholder="Type a product title…"
                  emptyMessage={
                    debouncedItemQuery.trim() ? 'No inventory matches' : 'Type to search inventory'
                  }
                  ariaLabel="Product"
                />
                <div className="flex items-center justify-between inset-cozy">
                  {pickedItem ? (
                    <span className="min-w-0 truncate text-role-caption text-text-muted">
                      Paired · <span className="font-mono">{pickedItem.sku}</span>
                    </span>
                  ) : (
                    <span className="text-role-caption text-text-faint">
                      Search Zoho inventory to pair a SKU.
                    </span>
                  )}
                  {/* ds-raw-button: inline text toggle, not a padded Button */}
                  <button
                    type="button"
                    className="shrink-0 text-role-caption font-medium text-blue-600 hover:underline"
                    onClick={() => {
                      setManualMode(true);
                      setPickedItem(null);
                      setSku('');
                      setItemName('');
                    }}
                  >
                    Not in inventory?
                  </button>
                </div>
              </>
            )}
            <TextField
              label="Quantity"
              type="number"
              min={1}
              value={quantity}
              onChange={setQuantity}
              tone="neutral"
              appearance="flush"
            />
            <TextField
              label="Tracking #"
              value={trackingNumber}
              onChange={setTrackingNumber}
              tone="neutral"
              appearance="flush"
            />
            <TextField
              label="Listing URL"
              value={listingUrl}
              onChange={setListingUrl}
              tone="neutral"
              appearance="flush"
            />
            <TextField
              label="Seller / vendor"
              value={seller}
              onChange={setSeller}
              tone="neutral"
              appearance="flush"
            />
            {platform === 'ebay' ? (
              <TextField
                label="Buyer account"
                value={accountName}
                onChange={setAccountName}
                tone="neutral"
                appearance="flush"
              />
            ) : null}
            {isReturn ? (
              <>
                <TextField
                  label="RMA / return id"
                  value={rmaId}
                  onChange={setRmaId}
                  tone="neutral"
                  appearance="flush"
                />
                <TextField
                  label="Return reason"
                  value={returnReason}
                  onChange={setReturnReason}
                  tone="neutral"
                  appearance="flush"
                />
              </>
            ) : null}
          </div>

          <div className="inset-cozy">
            {error ? (
              <p className="text-role-caption font-medium text-red-600" role="alert">
                {error}
              </p>
            ) : (
              <p className="text-role-caption text-text-faint">
                Amazon / Goodwill CSV bulk upload lives under Import → Upload CSV.
                Priority applies when a carton is linked (e.g. tracking).
              </p>
            )}
          </div>
        </div>

        <FlushTerminalFooter
          layout="cluster"
          leading={
            <div className="flex min-w-0 flex-1 items-stretch">
              <Button
                type="button"
                variant="primary"
                disabled={!canSubmit}
                onClick={() => void handleSubmit()}
                ariaLabel={submitting ? 'Saving inbound' : 'Add to Incoming'}
                className="min-h-9 w-full flex-1"
                data-testid="add-inbound-submit"
              >
                {submitting ? 'Saving…' : 'Add to Incoming'}
              </Button>
            </div>
          }
        >
          <PaneHeaderCloseButton
            onClick={onClose}
            ariaLabel="Hide right panel"
            title="Hide right panel"
            className={cn(
              'h-full min-h-9 w-10',
              cornerClass('flush'),
              'rounded-none border-l border-border-hairline',
            )}
          />
        </FlushTerminalFooter>
      </div>
    </DetailStackRailRegistrar>
  );
}
