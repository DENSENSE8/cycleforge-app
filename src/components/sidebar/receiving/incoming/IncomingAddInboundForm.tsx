'use client';

/**
 * Incoming add form — desk triage cards + Omni Composer extract foot.
 *
 * Fields follow exceptions (`Label` + `Input` + `triagePanelControl` inside
 * `TriageScrollLayout` / `cornerClass('surface')`). Flush floating labels stay
 * on scan stations. Paste/screenshot extract uses `StationComposerHost`
 * (`showModeFaces={false}`); Confirm still POSTs import-purchase.
 */

import { useCallback, useEffect, useId, useMemo, useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { TriageScrollLayout } from '@/design-system/components/TriageScrollLayout';
import { IncomingAddExtractComposer } from '@/components/receiving/incoming/IncomingAddExtractComposer';
import { buildIncomingAddSections } from '@/components/receiving/incoming/IncomingAddInboundSections';
import { useDebounce } from '@/hooks';
import { useSkuCatalogSearch, type SkuCatalogItem } from '@/hooks/useSkuCatalogSearch';
import { usePlatformCatalog } from '@/hooks/useCatalog';
import { blobToBase64DataUrl, downscaleImageTo720 } from '@/lib/image/downscale';
import { inboundFormPatchFromExtractDraft } from '@/lib/inbound/inbound-extract-apply';
import { invalidateReceivingFeeds } from '@/lib/queries/receiving-queries';
import {
  buildAddInboundImportBody,
  canSubmitAddInbound,
} from '@/lib/inbound/build-add-inbound-payload';
import { toast } from '@/lib/toast';
import { TRIAGE_PANEL_INNER_CORNER } from '@/design-system/tokens/triage-panel';
import { cn } from '@/utils/_cn';

const PRIORITY_AUTO = 'auto';

export type IncomingAddReceivingType = 'PO' | 'RETURN';

export interface IncomingAddInboundFormProps {
  receivingType: IncomingAddReceivingType;
  initialOrderId?: string;
  initialPlatform?: string;
  autoFocus?: boolean;
  onClose: () => void;
  header?: ReactNode;
}

export function IncomingAddInboundForm({
  receivingType,
  initialOrderId = '',
  initialPlatform = 'amazon',
  autoFocus = false,
  onClose: _onClose,
  header,
}: IncomingAddInboundFormProps) {
  const queryClient = useQueryClient();
  const fieldId = useId();
  const platformCatalog = usePlatformCatalog();
  const isReturn = receivingType === 'RETURN';

  const [platform, setPlatform] = useState(initialPlatform);
  const [priority, setPriority] = useState<string>(PRIORITY_AUTO);
  const [orderId, setOrderId] = useState('');
  const [sku, setSku] = useState('');
  const [itemName, setItemName] = useState('');
  const [pickedItem, setPickedItem] = useState<SkuCatalogItem | null>(null);
  const [itemQuery, setItemQuery] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [trackingNumber, setTrackingNumber] = useState('');
  const [carrierCode, setCarrierCode] = useState('');
  const [listingUrl, setListingUrl] = useState('');
  const [seller, setSeller] = useState('');
  const [accountName, setAccountName] = useState('');
  const [lineItemId, setLineItemId] = useState('');
  const [returnReason, setReturnReason] = useState('');
  const [rmaId, setRmaId] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [extractText, setExtractText] = useState('');
  const [extractHint, setExtractHint] = useState<string | null>(null);
  const [pendingImages, setPendingImages] = useState<File[]>([]);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ticketDraftBody, setTicketDraftBody] = useState<string | null>(null);

  const resetIdentity = useCallback(() => {
    setSku('');
    setItemName('');
    setPickedItem(null);
    setItemQuery('');
    setQuantity('1');
    setTrackingNumber('');
    setCarrierCode('');
    setListingUrl('');
    setSeller(initialPlatform === 'goodwill' ? 'Goodwill' : '');
    setAccountName('');
    setLineItemId('');
    setReturnReason('');
    setRmaId('');
    setExtractText('');
    setExtractHint(null);
    setPendingImages([]);
  }, [initialPlatform]);

  useEffect(() => {
    setPlatform(initialPlatform || 'amazon');
    setPriority(PRIORITY_AUTO);
    setOrderId(initialOrderId.trim());
    resetIdentity();
    setError(null);
    setTicketDraftBody(null);
    setSubmitting(false);
  }, [initialOrderId, initialPlatform, receivingType, resetIdentity]);

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
      carrierCode,
      lineItemId,
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
      carrierCode,
      lineItemId,
    ],
  );

  const debouncedItemQuery = useDebounce(itemQuery, 250);
  const itemSearch = useSkuCatalogSearch(debouncedItemQuery, {
    searchField: 'zoho_catalog',
    limit: 20,
  });
  const hits = useMemo(() => itemSearch.data ?? [], [itemSearch.data]);

  const canSubmit = canSubmitAddInbound(formInput) && !submitting && !extracting;

  const handleSubmit = useCallback(async () => {
    if (!canSubmitAddInbound(formInput) || submitting) return;
    setSubmitting(true);
    setError(null);
    setTicketDraftBody(null);
    try {
      const res = await fetch('/api/receiving/inbound/import-purchase', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(buildAddInboundImportBody(formInput)),
      });
      const data = (await res.json().catch(() => null)) as {
        success?: boolean;
        error?: string;
        created?: boolean;
        draftBody?: string;
        ticket?: {
          success?: boolean;
          error?: string;
          draftBody?: string;
          ticketNumber?: string;
        };
        ticket_number?: string;
      } | null;
      if (!res.ok || !data?.success) {
        throw new Error(data?.error || data?.draftBody || `Import failed (${res.status})`);
      }
      invalidateReceivingFeeds(queryClient);
      const label = isReturn ? 'Return' : 'Purchase';
      toast.success(data.created ? `${label} added to Incoming` : `${label} refreshed on Incoming`);
      if (isReturn && data.ticket && !data.ticket.success) {
        const draft = data.ticket.draftBody ?? data.draftBody ?? null;
        if (draft) setTicketDraftBody(draft);
        toast.error(data.ticket.error ?? 'Return saved — ticket could not be filed');
        return;
      }
      if (isReturn && data.ticket?.success && data.ticket_number) {
        toast.success(`Ticket ${data.ticket_number} linked`);
      }
      setOrderId('');
      resetIdentity();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Import failed';
      setError(message);
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  }, [formInput, isReturn, queryClient, resetIdentity, submitting]);

  const applyExtract = useCallback(
    (draft: Parameters<typeof inboundFormPatchFromExtractDraft>[0]) => {
      const next = inboundFormPatchFromExtractDraft(draft, {
        platform,
        orderId,
        seller,
        accountName,
        trackingNumber,
        carrierCode,
        listingUrl,
        returnReason,
        rmaId,
        sku,
        itemName,
        quantity,
        lineItemId,
      });
      setPlatform(next.platform);
      setOrderId(next.orderId);
      setSeller(next.seller);
      setAccountName(next.accountName);
      setTrackingNumber(next.trackingNumber);
      setCarrierCode(next.carrierCode);
      setListingUrl(next.listingUrl);
      setReturnReason(next.returnReason);
      setRmaId(next.rmaId);
      setSku(next.sku);
      setItemName(next.itemName);
      setQuantity(next.quantity);
      setLineItemId(next.lineItemId);
    },
    [
      accountName,
      carrierCode,
      itemName,
      lineItemId,
      listingUrl,
      orderId,
      platform,
      quantity,
      returnReason,
      rmaId,
      seller,
      sku,
      trackingNumber,
    ],
  );

  const handleExtract = useCallback(
    async (liveValue?: string) => {
      const text = (liveValue ?? extractText).trim();
      if (!text && pendingImages.length === 0) {
        toast.error('Paste order text or attach a screenshot first.');
        return;
      }
      setExtracting(true);
      setExtractHint(null);
      try {
        const image_data_urls: string[] = [];
        for (const file of pendingImages.slice(0, 6)) {
          const scaled = await downscaleImageTo720(file);
          image_data_urls.push(await blobToBase64DataUrl(scaled.blob));
        }
        const res = await fetch('/api/receiving/inbound/extract-po', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            kind: isReturn ? 'return' : 'purchase',
            text: text || undefined,
            image_data_urls: image_data_urls.length ? image_data_urls : undefined,
          }),
        });
        const data = (await res.json().catch(() => null)) as {
          success?: boolean;
          error?: string;
          draft?: Parameters<typeof inboundFormPatchFromExtractDraft>[0];
          missing_prompt?: string;
        } | null;
        if (!res.ok || !data?.success || !data.draft) {
          throw new Error(data?.error || `Extract failed (${res.status})`);
        }
        applyExtract(data.draft);
        setExtractText('');
        setPendingImages([]);
        setExtractHint(data.missing_prompt?.trim() || 'Fields filled from the composer — review, then Add.');
        toast.success('Extracted into the form');
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Extract failed';
        toast.error(message);
      } finally {
        setExtracting(false);
      }
    },
    [applyExtract, extractText, isReturn, pendingImages],
  );

  const pairTo = useCallback((it: SkuCatalogItem) => {
    setPickedItem(it);
    setSku(it.sku ?? '');
    setItemName(it.product_title ?? it.sku ?? '');
  }, []);

  const createAndPair = useCallback(async () => {
    const newSku = sku.trim();
    const newTitle = (itemName || sku).trim();
    if (!newSku || !newTitle) {
      toast.error('A new catalog entry needs both a SKU and a title.');
      return;
    }
    setCreating(true);
    try {
      const res = await fetch('/api/sku-catalog', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sku: newSku, productTitle: newTitle }),
      });
      const created = (await res.json().catch(() => ({}))) as {
        success?: boolean;
        error?: string;
        catalog?: { id?: number; sku?: string; product_title?: string };
      };
      if (!res.ok || created.success === false) {
        throw new Error(created.error || `Create failed (${res.status})`);
      }
      const newId = Number(created.catalog?.id);
      if (!Number.isFinite(newId) || newId <= 0) {
        throw new Error('Catalog entry created but no id came back.');
      }
      pairTo({
        id: newId,
        sku: created.catalog?.sku ?? newSku,
        zoho_sku: null,
        product_title: created.catalog?.product_title ?? newTitle,
        category: null,
        upc: null,
        image_url: null,
        is_active: true,
      });
      toast.success('Created inventory item');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not create the catalog entry.');
    } finally {
      setCreating(false);
    }
  }, [itemName, pairTo, sku]);

  const banner = (
    <div className="space-y-2">
      {extractHint ? (
        <p className="text-role-caption text-text-muted">{extractHint}</p>
      ) : null}
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
            className={cn(
              'min-h-24 w-full resize-y border border-border-soft bg-surface-sunken p-2 font-mono text-role-caption text-text-muted',
              TRIAGE_PANEL_INNER_CORNER,
            )}
          />
        </div>
      ) : null}
    </div>
  );

  const sections = buildIncomingAddSections({
    fieldId,
    isReturn,
    platform,
    platformOptions: platformCatalog.options,
    onPlatform: setPlatform,
    orderId,
    onOrderId: setOrderId,
    autoFocus,
    sku,
    onSku: (value) => {
      setSku(value);
      if (!pickedItem) setItemName(value);
    },
    quantity,
    onQuantity: setQuantity,
    listingUrl,
    onListingUrl: setListingUrl,
    seller,
    onSeller: setSeller,
    lineItemId,
    onLineItemId: setLineItemId,
    accountName,
    onAccountName: setAccountName,
    trackingNumber,
    onTrackingNumber: setTrackingNumber,
    carrierCode,
    onCarrierCode: setCarrierCode,
    rmaId,
    onRmaId: setRmaId,
    returnReason,
    onReturnReason: setReturnReason,
    pickedItem,
    itemQuery,
    onItemQuery: setItemQuery,
    hits,
    searching: debouncedItemQuery.length > 0 && itemSearch.isFetching,
    onPair: pairTo,
    creating,
    onCreate: () => void createAndPair(),
    onSubmit: () => void handleSubmit(),
  });

  return (
    <TriageScrollLayout
      knobs
      header={header}
      banner={banner}
      sections={sections}
      className="h-full"
      data-testid="add-inbound-form"
      footer={
        <IncomingAddExtractComposer
          extractText={extractText}
          onExtractText={setExtractText}
          onExtract={(live) => void handleExtract(live)}
          extracting={extracting}
          pendingCount={pendingImages.length}
          onFiles={(files) => setPendingImages((prev) => [...prev, ...files].slice(0, 6))}
          canSubmit={canSubmit}
          submitting={submitting}
          isReturn={isReturn}
          onSubmit={() => void handleSubmit()}
        />
      }
    />
  );
}
