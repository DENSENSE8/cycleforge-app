'use client';

/**
 * Manual eBay purchase → Incoming bridge. Posts the same ingest path as bulk
 * marketplace sync (`POST /api/receiving/inbound/import-ebay`). Opened from the
 * Incoming chrome Add CTA (and `station:import-ebay-order`).
 *
 * Mounts in the shared right detail-stack rail (same shell as dashboard
 * {@link NewOrderEntryOverlay}) — not a centered RightPaneOverlay card.
 */

import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { DetailStackRailRegistrar } from '@/components/right-rail/DetailStackRailRegistrar';
import { TextField } from '@/design-system/primitives';
import {
  SIDEBAR_INTAKE_SUBMIT_BUTTON_CLASS,
  SidebarIntakeFormShell,
} from '@/design-system/components/sidebar-intake';
import { invalidateReceivingFeeds } from '@/lib/queries/receiving-queries';
import { toast } from '@/lib/toast';

export function IncomingImportEbayOverlay({
  open,
  onClose,
  initialOrderId = '',
}: {
  open: boolean;
  onClose: () => void;
  /** Prefill from station action / deep link. */
  initialOrderId?: string;
}) {
  const queryClient = useQueryClient();
  const [orderId, setOrderId] = useState('');
  const [sku, setSku] = useState('');
  const [itemName, setItemName] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [trackingNumber, setTrackingNumber] = useState('');
  const [seller, setSeller] = useState('');
  const [accountName, setAccountName] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setOrderId(initialOrderId.trim());
    setSku('');
    setItemName('');
    setQuantity('1');
    setTrackingNumber('');
    setSeller('');
    setAccountName('');
    setError(null);
    setSubmitting(false);
  }, [open, initialOrderId]);

  const canSubmit =
    orderId.trim().length > 0 &&
    (sku.trim().length > 0 || itemName.trim().length > 0) &&
    !submitting;

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    try {
      const qty = Number(quantity);
      const res = await fetch('/api/receiving/inbound/import-ebay', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          order_id: orderId.trim(),
          sku: sku.trim() || undefined,
          item_name: itemName.trim() || undefined,
          quantity: Number.isFinite(qty) && qty >= 1 ? Math.floor(qty) : 1,
          tracking_number: trackingNumber.trim() || undefined,
          seller: seller.trim() || undefined,
          account_name: accountName.trim() || undefined,
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
      toast.success(data.created ? 'eBay purchase added to Incoming' : 'eBay purchase refreshed');
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

  return (
    <DetailStackRailRegistrar id="detail:incoming-import-ebay" onClose={onClose}>
      <SidebarIntakeFormShell
        title="Add eBay purchase"
        subtitle="Manual order entry"
        subtitleAccent="yellow"
        onClose={onClose}
        footer={
          <button
            type="button"
            disabled={!canSubmit}
            onClick={() => void handleSubmit()}
            className={`ds-raw-button ${SIDEBAR_INTAKE_SUBMIT_BUTTON_CLASS}`}
          >
            {submitting ? 'Importing…' : 'Add to Incoming'}
          </button>
        }
      >
        <div className="space-y-3">
          <TextField
            label="eBay order #"
            value={orderId}
            onChange={setOrderId}
            autoFocus
            required
            tone="amber"
          />
          <TextField
            label="SKU"
            value={sku}
            onChange={setSku}
            tone="neutral"
          />
          <TextField
            label="Item title"
            value={itemName}
            onChange={setItemName}
            tone="neutral"
          />
          <TextField
            label="Quantity"
            type="number"
            min={1}
            value={quantity}
            onChange={setQuantity}
            tone="neutral"
          />
          <TextField
            label="Tracking #"
            value={trackingNumber}
            onChange={setTrackingNumber}
            tone="neutral"
          />
          <TextField
            label="Seller"
            value={seller}
            onChange={setSeller}
            tone="neutral"
          />
          <TextField
            label="Buyer account"
            value={accountName}
            onChange={setAccountName}
            tone="neutral"
          />
          {error ? (
            <p className="text-role-caption font-medium text-red-600" role="alert">
              {error}
            </p>
          ) : (
            <p className="text-role-caption text-text-faint">
              Provide SKU or item title. Bulk sync uses Import in the header.
            </p>
          )}
        </div>
      </SidebarIntakeFormShell>
    </DetailStackRailRegistrar>
  );
}
