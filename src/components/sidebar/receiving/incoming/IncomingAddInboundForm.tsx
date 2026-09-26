'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { SearchableSelectField } from '@/design-system/components';
import { Button, FlushTerminalFooter, TextField } from '@/design-system/primitives';
import { useDebounce } from '@/hooks';
import { usePlatformCatalog } from '@/hooks/useCatalog';
import { useSkuCatalogSearch, type SkuCatalogItem } from '@/hooks/useSkuCatalogSearch';
import { invalidateReceivingFeeds } from '@/lib/queries/receiving-queries';
import { priorityOverrideTiersForPicker } from '@/lib/receiving/priority-override';
import {
  buildAddInboundImportBody,
  canSubmitAddInbound,
} from '@/lib/inbound/build-add-inbound-payload';
import { toast } from '@/lib/toast';
import { postInboundImport } from '@/lib/inbound/inbound-import-client';
import { rankInboundPlatformOptions } from '@/lib/inbound/inbound-platform-options';

const PRIORITY_AUTO = 'auto';

export type IncomingAddReceivingType = 'PO' | 'RETURN';

export interface IncomingAddInboundFormProps {
  receivingType: IncomingAddReceivingType;
  initialOrderId?: string;
  initialPlatform?: string;
  autoFocus?: boolean;
  onClose: () => void;
}

export function IncomingAddInboundForm({
  receivingType,
  initialOrderId = '',
  initialPlatform = 'amazon',
  autoFocus = false,
  onClose,
}: IncomingAddInboundFormProps) {
  const queryClient = useQueryClient();
  const isReturn = receivingType === 'RETURN';

  const [platform, setPlatform] = useState(initialPlatform);
  const [priority, setPriority] = useState<string>(PRIORITY_AUTO);
  const [orderId, setOrderId] = useState('');
  const [sku, setSku] = useState('');
  const [itemName, setItemName] = useState('');
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
  const [ticketDraftBody, setTicketDraftBody] = useState<string | null>(null);

  useEffect(() => {
    setPlatform(initialPlatform || 'amazon');
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
    setTicketDraftBody(null);
    setSubmitting(false);
  }, [initialOrderId, initialPlatform, receivingType]);

  useEffect(() => {
    if (isReturn && manualMode) {
      setManualMode(false);
    }
  }, [isReturn, manualMode]);

  const platformCatalog = usePlatformCatalog();

  const formInput = useMemo(
    () => ({
      platform,
      receivingType,
      priority,
      orderId,
      sku,
      itemName,
      pickedCatalogId: pickedItem?.id ?? null,
      quantity,
      trackingNumber,
      listingUrl,
      seller,
      accountName,
      returnReason,
      rmaId,
    }),
    [
      platform,
      receivingType,
      priority,
      orderId,
      sku,
      itemName,
      pickedItem,
      quantity,
      trackingNumber,
      listingUrl,
      seller,
      accountName,
      returnReason,
      rmaId,
    ],
  );

  const platformOptions = useMemo(
    () =>
      rankInboundPlatformOptions(platformCatalog.options ?? []).map((o) => ({
        value: o.value,
        label: o.label,
        group: 'Platforms',
      })),
    [platformCatalog.options],
  );

  const priorityOptions = useMemo(
    () => [
      {
        value: PRIORITY_AUTO,
        label: 'Auto',
        meta: 'Follows platform',
        group: 'Platform',
      },
      ...priorityOverrideTiersForPicker().map((t) => ({
        value: String(t.value),
        label: t.label,
        meta: t.title,
        group: 'Manual override',
      })),
    ],
    [],
  );

  const debouncedItemQuery = useDebounce(itemQuery, 250);
  const itemSearch = useSkuCatalogSearch(debouncedItemQuery, {
    searchField: 'zoho_catalog',
    limit: 20,
  });

  const itemOptions = useMemo(() => {
    const rows = itemSearch.data ?? [];
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

  const canSubmit = canSubmitAddInbound(formInput) && !submitting;

  const handleSubmit = useCallback(async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    setTicketDraftBody(null);
    try {
      const result = await postInboundImport(buildAddInboundImportBody(formInput));
      invalidateReceivingFeeds(queryClient);
      const label = isReturn ? 'Return' : 'Purchase';
      toast.success(result.created ? `${label} added to Incoming` : `${label} refreshed on Incoming`);
      if (isReturn && result.ticket && !result.ticket.success) {
        if (result.ticket.draftBody) setTicketDraftBody(result.ticket.draftBody);
        toast.error(result.ticket.error ?? 'Return saved — ticket could not be filed');
        return;
      }
      if (isReturn && result.ticket?.success && result.ticketNumber) {
        toast.success(`Ticket ${result.ticketNumber} linked`);
      }
      onClose();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Import failed';
      setError(message);
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  }, [canSubmit, formInput, isReturn, queryClient, onClose]);

  const orderLabel =
    platform === 'ebay'
      ? 'eBay order #'
      : platform === 'amazon' || platform === 'fba'
        ? 'Amazon order #'
        : platform === 'goodwill'
          ? 'Goodwill order / PO #'
          : 'Order / PO #';

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div
          className="divide-y divide-border-hairline border-b border-border-hairline"
          data-testid="add-inbound-classify"
        >
          <SearchableSelectField
            appearance="flush"
            label="Platform"
            autoFocus={autoFocus}
            testId="add-inbound-platform"
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
            label="Priority"
            testId="add-inbound-priority"
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
            appearance="flush"
          />
          {manualMode && !isReturn ? (
            <>
              <TextField label="SKU" value={sku} onChange={setSku} appearance="flush" />
              <TextField
                label="Item title"
                value={itemName}
                onChange={setItemName}
                appearance="flush"
              />
              <div className="flex items-center justify-between inset-cozy">
                <span className="text-role-caption text-text-faint">
                  Manual item — not paired to inventory.
                </span>
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
                    {isReturn
                      ? 'Required — search Zoho inventory to pair the return SKU.'
                      : 'Search Zoho inventory to pair a SKU.'}
                  </span>
                )}
                {!isReturn ? (
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
                ) : null}
              </div>
            </>
          )}
          <TextField
            label="Quantity"
            type="number"
            min={1}
            value={quantity}
            onChange={setQuantity}
            appearance="flush"
          />
          <TextField
            label="Tracking #"
            value={trackingNumber}
            onChange={setTrackingNumber}
            required={isReturn}
            appearance="flush"
          />
          <TextField
            label="Listing URL"
            value={listingUrl}
            onChange={setListingUrl}
            appearance="flush"
          />
          <TextField
            label="Seller / vendor"
            value={seller}
            onChange={setSeller}
            appearance="flush"
          />
          {platform === 'ebay' ? (
            <TextField
              label="Buyer account"
              value={accountName}
              onChange={setAccountName}
              appearance="flush"
            />
          ) : null}
          {isReturn ? (
            <>
              <TextField
                label="RMA / return id"
                value={rmaId}
                onChange={setRmaId}
                appearance="flush"
              />
              <TextField
                label="Return reason"
                value={returnReason}
                onChange={setReturnReason}
                appearance="flush"
              />
            </>
          ) : null}
        </div>

        <div className="inset-cozy space-y-2">
          {error ? (
            <p className="text-role-caption font-medium text-red-600" role="alert">
              {error}
            </p>
          ) : null}
          {ticketDraftBody ? (
            <div className="space-y-1">
              <p className="text-role-caption font-medium text-amber-700">
                Return saved — copy this ticket draft if filing failed:
              </p>
              <textarea
                readOnly
                value={ticketDraftBody}
                className="min-h-24 w-full resize-y rounded border border-border-soft bg-surface-sunken p-2 font-mono text-role-caption text-text-muted"
              />
            </div>
          ) : null}
          {!error && !ticketDraftBody ? (
            <p className="text-role-caption text-text-faint">
              {isReturn
                ? 'Return Add files an internal support ticket with order, tracking, SKU, and listing context.'
                : 'Amazon / Goodwill CSV bulk upload lives under Import → Upload CSV. Priority applies when a carton is linked (e.g. tracking).'}
            </p>
          ) : null}
        </div>
      </div>

      <FlushTerminalFooter layout="bleed">
        <Button
          type="button"
          variant="primary"
          disabled={!canSubmit}
          onClick={() => void handleSubmit()}
          ariaLabel={
            submitting
              ? 'Saving inbound'
              : isReturn
                ? 'Add return and ticket'
                : 'Add to Incoming'
          }
          className="min-h-9 w-full flex-1"
          data-testid="add-inbound-submit"
        >
          {submitting
            ? 'Saving…'
            : isReturn
              ? 'Add return + ticket'
              : 'Add to Incoming'}
        </Button>
      </FlushTerminalFooter>
    </div>
  );
}
