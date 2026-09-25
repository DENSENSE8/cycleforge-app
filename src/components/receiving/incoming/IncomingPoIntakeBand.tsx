'use client';

/**
 * Inline PO intake band — sits under the Incoming DataTable (same card width).
 *
 * Bulk phase:
 *   - Multi-line: add / remove lines on the active order
 *   - Multi-doc: paste/drop several screenshots → queue of order drafts
 *   - Multi-page of one order: select pending thumbs → Extract as one order
 *
 * Grid keeps its own scroll; this band scrolls the draft triage; the composer
 * dock is pinned at the foot.
 */

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { ImagePlus, Plus, Trash2, X } from '@/components/Icons';
import {
  Button,
  IconButton,
  OmnichannelComposerDock,
  TextField,
  type OmnichannelComposerDockHandle,
} from '@/design-system/primitives';
import { SearchableSelectField } from '@/design-system/components';
import { usePhotoDropzone } from '@/hooks/usePhotoDropzone';
import { usePlatformCatalog } from '@/hooks/useCatalog';
import { invalidateReceivingFeeds } from '@/lib/queries/receiving-queries';
import {
  addPoIntakeLine,
  applyPoIntakeReply,
  canConfirmPoIntake,
  countReadyPoIntakeOrders,
  missingPoIntakeFields,
  poIntakeMissingPrompt,
  removePoIntakeLine,
  updatePoIntakeLine,
  type PoIntakeDraft,
} from '@/lib/inbound/po-intake-draft';
import {
  addEmptyPoOrder,
  addPoIntakePendingAttachments,
  appendExtractedPoOrder,
  clearPoIntakePendingAttachments,
  closePoIntake,
  getActivePoIntakeDraft,
  getPoIntakeSnapshot,
  placeExtractedPoOrder,
  readyPoOrderIds,
  removePoIntakePendingAttachment,
  removePoOrder,
  removePoOrders,
  setPoIntakeActiveOrder,
  setPoIntakeConfirming,
  setPoIntakeDraft,
  setPoIntakeError,
  setPoIntakeExtracting,
  setPoIntakePrompt,
  subscribePoIntake,
} from '@/lib/inbound/po-intake-store';
import {
  PoIntakeOrderQueueBar,
  PoIntakePendingStrip,
} from '@/components/receiving/incoming/PoIntakeQueueChrome';
import { toast } from '@/lib/toast';
import { cn } from '@/utils/_cn';

const INBOUND_PLATFORM_PRIORITY = ['amazon', 'goodwill', 'ebay', 'walmart', 'shopify'] as const;
const MAX_PENDING = 8;

async function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.onerror = () => reject(reader.error ?? new Error('read failed'));
    reader.readAsDataURL(file);
  });
}

function draftFromApiPayload(payload: {
  platform?: string;
  order_id?: string;
  seller?: string;
  account_name?: string;
  tracking_number?: string;
  carrier_code?: string;
  priority?: string;
  notes?: string;
  lines?: Array<{
    sku?: string;
    item_name?: string;
    quantity?: string;
    line_item_id?: string;
    listing_url?: string;
  }>;
}): PoIntakeDraft {
  return {
    platform: payload.platform?.trim() || 'amazon',
    orderId: payload.order_id?.trim() || '',
    seller: payload.seller?.trim() || '',
    accountName: payload.account_name?.trim() || '',
    trackingNumber: payload.tracking_number?.trim() || '',
    carrierCode: payload.carrier_code?.trim() || '',
    priority: payload.priority?.trim() || 'auto',
    notes: payload.notes?.trim() || '',
    lines:
      payload.lines && payload.lines.length > 0
        ? payload.lines.map((l) => ({
            sku: l.sku?.trim() || '',
            itemName: l.item_name?.trim() || '',
            quantity: l.quantity?.trim() || '',
            lineItemId: l.line_item_id?.trim() || '',
            listingUrl: l.listing_url?.trim() || '',
          }))
        : [{ sku: '', itemName: '', quantity: '', lineItemId: '', listingUrl: '' }],
  };
}

async function postExtract(opts: {
  text?: string;
  imageDataUrl?: string | null;
  imageDataUrls?: string[];
}): Promise<{
  draft: PoIntakeDraft;
  ready: boolean;
  missing_prompt?: string;
}> {
  const res = await fetch('/api/receiving/inbound/extract-po', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      text: opts.text?.trim() || null,
      image_data_url: opts.imageDataUrl || null,
      image_data_urls: opts.imageDataUrls?.length ? opts.imageDataUrls : null,
    }),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok || !data?.success) {
    throw new Error(data?.error || `Extract failed (${res.status})`);
  }
  return {
    draft: draftFromApiPayload(data.draft ?? {}),
    ready: Boolean(data.ready),
    missing_prompt: data.missing_prompt,
  };
}

async function postConfirm(draft: PoIntakeDraft): Promise<{ created: number; updated: number }> {
  const res = await fetch('/api/receiving/inbound/confirm-po', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      platform: draft.platform,
      order_id: draft.orderId,
      seller: draft.seller,
      account_name: draft.accountName,
      tracking_number: draft.trackingNumber,
      carrier_code: draft.carrierCode,
      priority: draft.priority,
      lines: draft.lines.map((l) => ({
        sku: l.sku,
        item_name: l.itemName,
        quantity: l.quantity,
        line_item_id: l.lineItemId,
        listing_url: l.listingUrl,
      })),
    }),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok || !data?.success) {
    throw new Error(data?.error || `Confirm failed (${res.status})`);
  }
  return {
    created: Number(data.created ?? 0),
    updated: Number(data.updated ?? 0),
  };
}

export function IncomingPoIntakeBand({
  placement = 'band',
}: {
  placement?: 'band' | 'evidence';
}) {
  const snap = useSyncExternalStore(
    subscribePoIntake,
    getPoIntakeSnapshot,
    getPoIntakeSnapshot,
  );
  const queryClient = useQueryClient();
  const [composer, setComposer] = useState('');
  const [selectedPendingIds, setSelectedPendingIds] = useState<string[]>([]);
  const dockRef = useRef<OmnichannelComposerDockHandle>(null);
  const platformCatalog = usePlatformCatalog();

  const draft = getActivePoIntakeDraft(snap);

  useEffect(() => {
    if (snap.open) {
      const t = window.setTimeout(() => dockRef.current?.focus(), 40);
      return () => window.clearTimeout(t);
    }
    setComposer('');
    setSelectedPendingIds([]);
    return undefined;
  }, [snap.open]);

  useEffect(() => {
    setSelectedPendingIds((ids) =>
      ids.filter((id) => snap.pendingAttachments.some((a) => a.id === id)),
    );
  }, [snap.pendingAttachments]);

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

  const missing = useMemo(() => missingPoIntakeFields(draft), [draft]);
  const ready = canConfirmPoIntake(draft);
  const readyCount = countReadyPoIntakeOrders(snap.queue.map((o) => o.draft));

  const afterExtractPrompt = useCallback((next: PoIntakeDraft, apiPrompt?: string) => {
    const prompt =
      apiPrompt
      || (canConfirmPoIntake(next)
        ? 'Draft looks complete — confirm to add to Incoming.'
        : poIntakeMissingPrompt(missingPoIntakeFields(next)));
    setPoIntakePrompt(prompt);
  }, []);

  /** Extract one order (text and/or one-or-more page images). */
  const runExtractOnce = useCallback(
    async (opts: {
      text?: string;
      images: Array<{ name: string; dataUrl: string }>;
      /** When true, always append a new queue slot (multi-doc). */
      forceNewOrder?: boolean;
    }) => {
      const result = await postExtract({
        text: opts.text,
        imageDataUrls: opts.images.map((i) => i.dataUrl),
        imageDataUrl: opts.images[0]?.dataUrl ?? null,
      });
      const meta = {
        sourceName: opts.images.map((i) => i.name).filter(Boolean).join(', ') || null,
        thumbnailDataUrl: opts.images[0]?.dataUrl ?? null,
      };
      if (opts.forceNewOrder) {
        appendExtractedPoOrder(result.draft, meta);
      } else {
        placeExtractedPoOrder(result.draft, meta);
      }
      afterExtractPrompt(result.draft, result.missing_prompt);
      return result;
    },
    [afterExtractPrompt],
  );

  const extractPendingAsSeparateOrders = useCallback(async () => {
    const pending = getPoIntakeSnapshot().pendingAttachments;
    if (pending.length === 0) return;
    setPoIntakeExtracting(true);
    try {
      let filled = 0;
      let incomplete = 0;
      for (let i = 0; i < pending.length; i++) {
        const att = pending[i]!;
        const result = await runExtractOnce({
          images: [{ name: att.name, dataUrl: att.dataUrl }],
          forceNewOrder: i > 0 || !isActiveDraftBlank(getActivePoIntakeDraft()),
        });
        if (result.ready) filled += 1;
        else incomplete += 1;
        removePoIntakePendingAttachment(att.id);
      }
      setComposer('');
      toast.message(
        incomplete === 0
          ? `${filled} order${filled === 1 ? '' : 's'} ready to confirm`
          : `Extracted ${filled + incomplete} — ${incomplete} still need fields`,
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Extract failed';
      setPoIntakeError(message);
      toast.error(message);
    } finally {
      setPoIntakeExtracting(false);
    }
  }, [runExtractOnce]);

  const extractSelectedAsOneOrder = useCallback(async () => {
    const pending = getPoIntakeSnapshot().pendingAttachments;
    const selected = pending.filter((a) => selectedPendingIds.includes(a.id));
    const images = selected.length > 0 ? selected : pending;
    if (images.length === 0) return;
    setPoIntakeExtracting(true);
    try {
      const result = await runExtractOnce({
        text: composer,
        images: images.map((a) => ({ name: a.name, dataUrl: a.dataUrl })),
      });
      for (const a of images) removePoIntakePendingAttachment(a.id);
      setSelectedPendingIds([]);
      setComposer('');
      if (result.ready) {
        toast.success('Purchase order fields filled — confirm when ready');
      } else {
        toast.message('Filled what I could — answer the missing fields below');
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Extract failed';
      setPoIntakeError(message);
      toast.error(message);
    } finally {
      setPoIntakeExtracting(false);
    }
  }, [composer, runExtractOnce, selectedPendingIds]);

  const onFiles = useCallback(
    (files: File[]) => {
      const images = files.filter((f) => f.type.startsWith('image/')).slice(0, MAX_PENDING);
      if (images.length === 0) return;
      void (async () => {
        try {
          const encoded = await Promise.all(
            images.map(async (file) => ({
              name: file.name || 'screenshot.png',
              dataUrl: await fileToDataUrl(file),
            })),
          );
          const room = MAX_PENDING - getPoIntakeSnapshot().pendingAttachments.length;
          const toAdd = encoded.slice(0, Math.max(0, room));
          if (toAdd.length === 0) {
            toast.message(`At most ${MAX_PENDING} screenshots staged at once`);
            return;
          }
          addPoIntakePendingAttachments(toAdd);
          // Auto-extract: one file → current order; many → separate orders.
          if (toAdd.length === 1 && getPoIntakeSnapshot().pendingAttachments.length === 1) {
            await extractSelectedAsOneOrder();
          } else if (toAdd.length > 1) {
            await extractPendingAsSeparateOrders();
          } else {
            setPoIntakePrompt(
              `${toAdd.length} screenshot${toAdd.length === 1 ? '' : 's'} staged — Extract as one order or as separate orders.`,
            );
          }
        } catch (err) {
          toast.error(err instanceof Error ? err.message : 'Could not read image');
        }
      })();
    },
    [extractPendingAsSeparateOrders, extractSelectedAsOneOrder],
  );

  const dz = usePhotoDropzone(onFiles, {
    multiple: true,
    documentPaste: snap.open,
  });

  const confirmOrders = useCallback(
    async (orderIds: string[]) => {
      if (orderIds.length === 0) return;
      setPoIntakeConfirming(true);
      try {
        let created = 0;
        let updated = 0;
        const queue = getPoIntakeSnapshot().queue;
        for (const id of orderIds) {
          const entry = queue.find((o) => o.id === id);
          if (!entry || !canConfirmPoIntake(entry.draft)) {
            throw new Error('One or more selected orders are incomplete');
          }
          const result = await postConfirm(entry.draft);
          created += result.created;
          updated += result.updated;
        }
        invalidateReceivingFeeds(queryClient);
        const n = created + updated;
        toast.success(
          orderIds.length === 1
            ? n === 1
              ? 'Purchase order added to Incoming'
              : `${n} purchase lines landed on Incoming`
            : `${orderIds.length} purchase orders landed on Incoming (${n} lines)`,
        );
        removePoOrders(orderIds);
        const left = getPoIntakeSnapshot().queue;
        const stillWorking = left.some(
          (o) =>
            o.draft.orderId.trim()
            || o.draft.trackingNumber.trim()
            || o.draft.lines.some((l) => l.sku || l.itemName || l.quantity)
            || o.thumbnailDataUrl,
        );
        if (!stillWorking && getPoIntakeSnapshot().pendingAttachments.length === 0) {
          closePoIntake();
        } else {
          setPoIntakePrompt(
            stillWorking
              ? 'Confirmed. Continue with the remaining drafts.'
              : 'Confirmed. Paste another screenshot or close.',
          );
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Confirm failed';
        setPoIntakeError(message);
        toast.error(message);
      } finally {
        setPoIntakeConfirming(false);
      }
    },
    [queryClient],
  );

  const onCommit = useCallback(() => {
    const text = composer.trim();
    if (snap.extracting || snap.confirming) return;

    if (ready && (!text || /^confirm$/i.test(text))) {
      void confirmOrders([snap.activeOrderId]);
      return;
    }

    if (missing.length > 0 && text && snap.pendingAttachments.length === 0) {
      const looksLikeDocument =
        text.length > 80 || text.includes('\n') || /order\s*#|qty|quantity|tracking/i.test(text);
      if (!looksLikeDocument) {
        const next = applyPoIntakeReply(draft, text, missing);
        setPoIntakeDraft(next);
        const still = missingPoIntakeFields(next);
        setPoIntakePrompt(
          still.length === 0
            ? 'Draft looks complete — confirm to add to Incoming.'
            : poIntakeMissingPrompt(still),
        );
        setComposer('');
        return;
      }
    }

    if (snap.pendingAttachments.length > 0) {
      void extractSelectedAsOneOrder();
      return;
    }

    void (async () => {
      setPoIntakeExtracting(true);
      try {
        const result = await runExtractOnce({ text, images: [] });
        setComposer('');
        if (result.ready) {
          toast.success('Purchase order fields filled — confirm when ready');
        } else {
          toast.message('Filled what I could — answer the missing fields below');
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Extract failed';
        setPoIntakeError(message);
        toast.error(message);
      } finally {
        setPoIntakeExtracting(false);
      }
    })();
  }, [
    composer,
    snap.extracting,
    snap.confirming,
    snap.activeOrderId,
    snap.pendingAttachments.length,
    ready,
    missing,
    draft,
    confirmOrders,
    extractSelectedAsOneOrder,
    runExtractOnce,
  ]);

  if (!snap.open) return null;

  const busy = snap.extracting || snap.confirming;
  const hasPending = snap.pendingAttachments.length > 0;

  return (
    <div
      className={cn(
        'flex min-h-0 flex-col bg-surface-card',
        placement === 'evidence'
          ? 'min-h-full flex-1'
          : 'max-h-[min(48vh,28rem)] shrink-0 border-t border-border-hairline',
      )}
      data-testid="incoming-po-intake-band"
      {...dz.rootProps}
    >
      <div className="flex shrink-0 items-center justify-between gap-2 border-b border-border-hairline px-3 py-2">
        <div className="min-w-0">
          <p className="truncate text-role-caption font-semibold text-text-default">
            Add purchase order
            {snap.queue.length > 1 ? (
              <span className="ml-1.5 font-normal text-text-soft">
                · {snap.queue.length} orders · {readyCount} ready
              </span>
            ) : null}
          </p>
          <p className="truncate text-role-micro text-text-soft">
            {snap.prompt || 'Paste screenshots or order text below'}
          </p>
        </div>
        <IconButton
          size="sm"
          tone="neutral"
          ariaLabel="Close add purchase order"
          icon={<X className="h-3.5 w-3.5" />}
          onClick={() => closePoIntake()}
          disabled={busy}
        />
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-2">
        {snap.error ? (
          <p className="mb-2 text-role-caption text-text-danger" role="alert">
            {snap.error}
          </p>
        ) : null}

        {/* Order queue chips */}
        <PoIntakeOrderQueueBar
          queue={snap.queue}
          activeOrderId={snap.activeOrderId}
          busy={busy}
          onSelect={setPoIntakeActiveOrder}
          onAddOrder={() => addEmptyPoOrder()}
          onRemoveActive={() => removePoOrder(snap.activeOrderId)}
        />

        <PoIntakePendingStrip
          pending={snap.pendingAttachments}
          selectedIds={selectedPendingIds}
          busy={busy}
          onToggleSelect={(id) =>
            setSelectedPendingIds((ids) =>
              ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id],
            )
          }
          onRemove={removePoIntakePendingAttachment}
          onExtractOneOrder={() => void extractSelectedAsOneOrder()}
          onExtractSeparate={() => void extractPendingAsSeparateOrders()}
          onClear={() => clearPoIntakePendingAttachments()}
        />

        <div className="mb-2 grid gap-2 sm:grid-cols-2">
          <SearchableSelectField
            appearance="flush"
            label="Platform"
            testId="po-intake-platform"
            value={draft.platform}
            onChange={(id) => {
              if (id == null) return;
              setPoIntakeDraft({ ...draft, platform: String(id) });
            }}
            options={platformOptions}
            placeholder="Platform…"
            searchPlaceholder="Type to filter…"
            emptyMessage="No platforms match"
            ariaLabel="Platform"
          />
          <TextField
            label="Order / PO #"
            value={draft.orderId}
            onChange={(v) => setPoIntakeDraft({ ...draft, orderId: v })}
            required
            appearance="flush"
          />
          <TextField
            label="Tracking"
            value={draft.trackingNumber}
            onChange={(v) => setPoIntakeDraft({ ...draft, trackingNumber: v })}
            appearance="flush"
          />
          <TextField
            label="Seller"
            value={draft.seller}
            onChange={(v) => setPoIntakeDraft({ ...draft, seller: v })}
            appearance="flush"
          />
        </div>

        <div className="mb-1 flex items-center justify-between gap-2">
          <p className="text-role-micro font-medium text-text-soft">Line items</p>
          <Button
            variant="ghost"
            size="sm"
            disabled={busy || draft.lines.length >= 40}
            onClick={() => setPoIntakeDraft(addPoIntakeLine(draft))}
            icon={<Plus className="h-3.5 w-3.5" />}
            data-testid="po-intake-add-line"
          >
            Add line
          </Button>
        </div>

        <ul className="space-y-2" aria-label="Line items">
          {draft.lines.map((line, index) => (
            <li
              key={`line-${index}`}
              className="grid gap-2 rounded-none border border-border-hairline bg-surface-sunken/40 p-2 sm:grid-cols-[1fr_1fr_5rem_auto]"
            >
              <TextField
                label="SKU"
                value={line.sku}
                onChange={(v) => setPoIntakeDraft(updatePoIntakeLine(draft, index, { sku: v }))}
                appearance="flush"
              />
              <TextField
                label="Title"
                value={line.itemName}
                onChange={(v) =>
                  setPoIntakeDraft(updatePoIntakeLine(draft, index, { itemName: v }))
                }
                appearance="flush"
              />
              <TextField
                label="Qty"
                value={line.quantity}
                onChange={(v) =>
                  setPoIntakeDraft(updatePoIntakeLine(draft, index, { quantity: v }))
                }
                appearance="flush"
                required
              />
              <div className="flex items-end justify-end">
                <IconButton
                  size="sm"
                  tone="neutral"
                  ariaLabel={`Remove line ${index + 1}`}
                  icon={<Trash2 className="h-3.5 w-3.5" />}
                  disabled={busy || draft.lines.length <= 1}
                  onClick={() => setPoIntakeDraft(removePoIntakeLine(draft, index))}
                />
              </div>
              <div className="sm:col-span-4">
                <TextField
                  label="Listing URL"
                  value={line.listingUrl}
                  onChange={(v) =>
                    setPoIntakeDraft(updatePoIntakeLine(draft, index, { listingUrl: v }))
                  }
                  appearance="flush"
                />
              </div>
            </li>
          ))}
        </ul>

        {missing.length > 0 ? (
          <p className="mt-2 text-role-caption text-text-warning">
            {poIntakeMissingPrompt(missing)}
          </p>
        ) : (
          <p className="mt-2 text-role-caption text-text-success">
            Ready to confirm — tracking and lines are set.
          </p>
        )}
      </div>

      <div className="shrink-0 border-t border-border-soft bg-surface-card px-3 py-2">
        <OmnichannelComposerDock
          ref={dockRef}
          value={composer}
          onChange={setComposer}
          onCommit={onCommit}
          placeholder="Paste PO screenshots or text — or answer what’s missing…"
          ariaLabel="Purchase order intake"
          density="compact"
          chrome="bare"
          disabled={busy}
          hideCommitButton
          leadingStart={
            <IconButton
              size="sm"
              tone="neutral"
              ariaLabel="Attach purchase order screenshots"
              icon={<ImagePlus className="h-3.5 w-3.5" />}
              onClick={dz.openPicker}
              disabled={busy}
            />
          }
          trailingAction={
            <div className="flex items-center gap-1.5">
              <Button
                variant="ghost"
                size="sm"
                disabled={
                  busy
                  || (!composer.trim() && !hasPending)
                }
                onClick={() => {
                  if (hasPending) void extractSelectedAsOneOrder();
                  else void onCommit();
                }}
              >
                {snap.extracting ? 'Reading…' : 'Extract'}
              </Button>
              {readyCount > 1 ? (
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={busy}
                  onClick={() => void confirmOrders(readyPoOrderIds())}
                  data-testid="po-intake-confirm-all"
                >
                  {snap.confirming ? 'Adding…' : `Confirm ${readyCount} ready`}
                </Button>
              ) : null}
              <Button
                variant="primary"
                size="sm"
                disabled={busy || !ready}
                onClick={() => void confirmOrders([snap.activeOrderId])}
                data-testid="po-intake-confirm"
              >
                {snap.confirming ? 'Adding…' : 'Confirm'}
              </Button>
            </div>
          }
        />
        <input {...dz.inputProps} ref={dz.inputRef} />
      </div>
    </div>
  );
}

function isActiveDraftBlank(draft: PoIntakeDraft): boolean {
  return (
    !draft.orderId.trim()
    && !draft.trackingNumber.trim()
    && draft.lines.every((l) => !l.sku.trim() && !l.itemName.trim() && !l.quantity.trim())
  );
}

/** Wrapper: table flex-1 + optional intake band under status bar. */
export function IncomingPoIntakeTableShell({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  const open = useSyncExternalStore(
    subscribePoIntake,
    () => getPoIntakeSnapshot().open,
    () => false,
  );
  return (
    <div
      className={cn(
        'flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden',
        className,
      )}
      data-po-intake-open={open ? 'true' : 'false'}
    >
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">{children}</div>
      <IncomingPoIntakeBand />
    </div>
  );
}
