'use client';

import { IncomingAddDeskField } from '@/components/receiving/incoming/IncomingAddDeskField';
import { IntakeCombobox } from '@/components/outbound/orders/intake/IntakeCombobox';
import { Loader2 } from '@/components/Icons';
import { SearchableSelectField } from '@/design-system/components';
import type { TriageSectionSpec } from '@/design-system/components/TriageScrollLayout';
import { Button as UiButton } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import type { SkuCatalogItem } from '@/hooks/useSkuCatalogSearch';
import {
  TRIAGE_PANEL_INNER_CORNER,
  triagePanelControl,
} from '@/design-system/tokens/triage-panel';
import { cn } from '@/utils/_cn';

export function incomingAddOrderLabel(platform: string): string {
  if (platform === 'ebay') return 'eBay order #';
  if (platform === 'amazon' || platform === 'fba') return 'Amazon order #';
  if (platform === 'goodwill') return 'Goodwill order / PO #';
  return 'Order / PO #';
}

export function buildIncomingAddSections(opts: {
  fieldId: string;
  isReturn: boolean;
  platform: string;
  platformOptions: ReadonlyArray<{ value: string; label: string }>;
  onPlatform: (id: string) => void;
  orderId: string;
  onOrderId: (v: string) => void;
  autoFocus: boolean;
  sku: string;
  onSku: (v: string) => void;
  quantity: string;
  onQuantity: (v: string) => void;
  listingUrl: string;
  onListingUrl: (v: string) => void;
  seller: string;
  onSeller: (v: string) => void;
  lineItemId: string;
  onLineItemId: (v: string) => void;
  accountName: string;
  onAccountName: (v: string) => void;
  trackingNumber: string;
  onTrackingNumber: (v: string) => void;
  carrierCode: string;
  onCarrierCode: (v: string) => void;
  rmaId: string;
  onRmaId: (v: string) => void;
  returnReason: string;
  onReturnReason: (v: string) => void;
  pickedItem: SkuCatalogItem | null;
  itemQuery: string;
  onItemQuery: (v: string) => void;
  hits: SkuCatalogItem[];
  searching: boolean;
  onPair: (item: SkuCatalogItem) => void;
  creating: boolean;
  onCreate: () => void;
  onSubmit: () => void;
}): TriageSectionSpec[] {
  const orderLabel = incomingAddOrderLabel(opts.platform);
  const sections: TriageSectionSpec[] = [
    {
      id: 'order',
      label: opts.isReturn ? 'Return order' : 'Purchase order',
      children: (
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Platform</Label>
            <SearchableSelectField
              value={opts.platform}
              onChange={(id) => {
                if (id == null) return;
                opts.onPlatform(String(id));
              }}
              options={opts.platformOptions.map((o) => ({
                value: o.value,
                label: o.label,
                group: 'Platforms',
              }))}
              placeholder="Platform…"
              searchPlaceholder="Type to filter…"
              emptyMessage="No platforms match"
              ariaLabel="Platform"
              className={triagePanelControl()}
            />
          </div>
          <IncomingAddDeskField
            id={`${opts.fieldId}-order`}
            label={orderLabel}
            value={opts.orderId}
            onChange={opts.onOrderId}
            required
            autoFocus={opts.autoFocus}
            mono
            onEnter={opts.onSubmit}
          />
          <IncomingAddDeskField
            id={`${opts.fieldId}-sku`}
            label="SKU or item name"
            value={opts.sku}
            onChange={opts.onSku}
            required
            onEnter={opts.onSubmit}
          />
          <IncomingAddDeskField
            id={`${opts.fieldId}-qty`}
            label="Quantity"
            value={opts.quantity}
            onChange={opts.onQuantity}
            type="number"
            min={1}
          />
          <IncomingAddDeskField
            id={`${opts.fieldId}-listing`}
            label="Listing URL"
            value={opts.listingUrl}
            onChange={opts.onListingUrl}
          />
          <IncomingAddDeskField
            id={`${opts.fieldId}-seller`}
            label="Seller / vendor"
            value={opts.seller}
            onChange={opts.onSeller}
          />
          <IncomingAddDeskField
            id={`${opts.fieldId}-item-number`}
            label={opts.platform === 'ebay' ? 'eBay item number / custom label' : 'Item number'}
            value={opts.lineItemId}
            onChange={opts.onLineItemId}
            mono
          />
          {opts.platform === 'ebay' ? (
            <IncomingAddDeskField
              id={`${opts.fieldId}-account`}
              label="Buyer account"
              value={opts.accountName}
              onChange={opts.onAccountName}
            />
          ) : null}
        </div>
      ),
    },
    {
      id: 'catalog',
      label: 'Catalog pairing',
      children: (
        <div className="space-y-3">
          <p className="text-role-caption text-text-muted">
            {opts.isReturn
              ? 'Returns must pair to Zoho inventory before Add.'
              : 'Optional on a purchase — exact SKUs still resolve in Zoho on import. Pair or create when the listing SKU should live in inventory now.'}
          </p>
          {opts.pickedItem ? (
            <p className="text-role-caption text-text-muted">
              Paired · <span className="font-mono">{opts.pickedItem.sku}</span>
            </p>
          ) : null}
          <div className="flex flex-wrap items-center justify-end gap-2">
            <IntakeCombobox
              triggerId={`${opts.fieldId}-search`}
              className={triagePanelControl('w-full min-w-56 flex-1 sm:w-auto')}
              contentClassName={cn('overflow-hidden', TRIAGE_PANEL_INNER_CORNER)}
              value={opts.pickedItem ? String(opts.pickedItem.id) : null}
              onChange={(value) => {
                const hit = opts.hits.find((h) => String(h.id) === String(value));
                if (hit) opts.onPair(hit);
              }}
              options={opts.hits.map((hit) => ({
                value: String(hit.id),
                label: hit.sku,
                mono: true,
                meta: hit.product_title ?? undefined,
              }))}
              query={opts.itemQuery}
              onQueryChange={opts.onItemQuery}
              loading={opts.searching}
              placeholder="Link an existing catalog item…"
              searchPlaceholder="Search inventory by SKU or title…"
              emptyMessage={opts.itemQuery.trim() ? 'Nothing matches.' : 'Type to search inventory.'}
              ariaLabel="Link an existing catalog item"
              testId="inbound-catalog-search"
            />
            <UiButton
              variant="outline"
              size="md"
              disabled={opts.creating}
              onClick={() => opts.onCreate()}
              className={triagePanelControl()}
              data-testid="inbound-create-sku"
            >
              {opts.creating ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" /> Creating…
                </>
              ) : (
                <>
                  Create{' '}
                  <span className="max-w-32 truncate font-mono">{opts.sku.trim() || 'new item'}</span>
                </>
              )}
            </UiButton>
          </div>
        </div>
      ),
    },
    {
      id: 'logistics',
      label: 'Logistics',
      children: (
        <div className="space-y-4">
          <IncomingAddDeskField
            id={`${opts.fieldId}-tracking`}
            label="Tracking #"
            value={opts.trackingNumber}
            onChange={opts.onTrackingNumber}
            required={opts.isReturn}
            mono
          />
          <IncomingAddDeskField
            id={`${opts.fieldId}-carrier`}
            label="Carrier"
            value={opts.carrierCode}
            onChange={opts.onCarrierCode}
          />
        </div>
      ),
    },
  ];

  if (opts.isReturn) {
    sections.push({
      id: 'return',
      label: 'Return',
      children: (
        <div className="space-y-4">
          <IncomingAddDeskField
            id={`${opts.fieldId}-rma`}
            label="RMA / return id"
            value={opts.rmaId}
            onChange={opts.onRmaId}
          />
          <IncomingAddDeskField
            id={`${opts.fieldId}-reason`}
            label="Return reason"
            value={opts.returnReason}
            onChange={opts.onReturnReason}
          />
        </div>
      ),
    });
  }

  return sections;
}
