'use client';

/**
 * The bought replacement — the form stays open on it (operator 2026-10-08):
 * the full tracking, carrier and cost, then Print / Download the stored label,
 * Print the slip, Copy the buyer email ("Here's your new tracking number …"),
 * and Void through `/api/shipping/order-labels/void` with a reason.
 */

import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { AlertTriangle, Check, Download, Mail, Printer, Trash2 } from '@/components/Icons';
import { TrackingChip } from '@/components/ui/CopyChip';
import { Button, TextField } from '@/design-system/primitives';
import { PHONE_CARD_FACE } from '@/design-system/tokens/phone-card';
import { outboundDocumentContentSrc } from '@/lib/documents/outbound-document-display';
import { downloadHref, pickOrderDocument, printDocument, useOrderDocuments } from '@/lib/orders/order-paperwork-client';
import { formatMoney } from '@/lib/shipping/label-rate-choice';
import { replacementTrackingEmail, type ReplacementReason } from '@/lib/shipping/replacement-rate-shop';
import { getTrackingUrlByCarrier } from '@/lib/tracking-format';
import { toast } from '@/lib/toast';
import { copyToClipboard } from '@/utils/_dom';

/** What `POST /api/shipping/order-labels/purchase` answers for a committed buy. */
export interface ReplacementPurchase {
  ok: boolean;
  tracking?: string;
  carrier?: string;
  service?: string;
  cost?: number;
  currency?: string;
  labelId?: string;
  shipmentId?: number | null;
  labelDocumentId?: number | null;
  warning?: string | null;
  idempotent?: boolean;
  purchaseId?: number;
  error?: string;
}

export function ReplacementBoughtCard({
  orderId,
  orderNumber,
  bought,
  buyerName,
  replacement,
  reason,
  onVoided,
}: {
  orderId: number;
  orderNumber: string;
  bought: ReplacementPurchase;
  buyerName: string | null;
  /** A replacement (its buyer email offered); false = the order's first label. */
  replacement: boolean;
  reason: ReplacementReason | null;
  /** The void landed — the host forgets the purchase and refreshes. */
  onVoided: () => void;
}) {
  const [voidOpen, setVoidOpen] = useState(false);
  const [voidReason, setVoidReason] = useState('');

  // The bought label + generated slip land in the order's documents.
  const documentsQuery = useOrderDocuments(orderId);
  const documents = documentsQuery.data?.documents ?? [];
  const labelSrc = outboundDocumentContentSrc(pickOrderDocument(documents, 'shipping_label', bought.labelDocumentId ?? null));
  const slipSrc = outboundDocumentContentSrc(pickOrderDocument(documents, 'packing_slip', null));
  const tracking = bought.tracking ?? '';
  const carrier = bought.carrier ?? '';

  const voidMutation = useMutation<unknown, Error, void>({
    mutationFn: async () => {
      if (!bought.labelId) throw new Error('No label to void.');
      const res = await fetch('/api/shipping/order-labels/void', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orderId,
          labelId: bought.labelId,
          reason: voidReason.trim(),
          shipmentId: bought.shipmentId ?? undefined,
          documentId: bought.labelDocumentId ?? undefined,
        }),
      });
      const data = (await res.json()) as { ok: boolean; error?: string };
      if (!res.ok || !data.ok) throw new Error(data.error || 'Void declined.');
      return data;
    },
    onSuccess: () => {
      setVoidOpen(false);
      setVoidReason('');
      onVoided();
    },
  });

  const download = () => {
    if (!labelSrc) return;
    const link = document.createElement('a');
    link.href = downloadHref(labelSrc);
    link.download = '';
    link.click();
  };

  const copyEmail = async () => {
    const email = replacementTrackingEmail({
      buyerName,
      orderNumber,
      carrierName: carrier,
      trackingNumber: tracking,
      trackingUrl: getTrackingUrlByCarrier(tracking, carrier),
      reason,
    });
    const ok = await copyToClipboard(`Subject: ${email.subject}\n\n${email.body}`, { recordHistory: false });
    if (ok) toast.success('Buyer email copied');
    else toast.error('Could not copy the email');
  };

  return (
    <div className="flex flex-col gap-3" data-testid="send-replacement-bought">
      <div className={`${PHONE_CARD_FACE} border border-border-success bg-surface-success px-4 py-3`}>
        <p className="flex items-center gap-1.5 text-role-caption font-semibold text-text-success">
          <Check className="h-4 w-4" />
          {`${replacement ? 'Replacement label' : 'Label'} ${bought.idempotent ? 'already purchased' : 'purchased'}`}
        </p>
        <dl className="mt-2 grid grid-cols-3 gap-3">
          <div className="min-w-0">
            <dt className="mode-label text-text-success">Tracking</dt>
            <dd className="min-w-0">
              {tracking ? <TrackingChip value={tracking} display={tracking} carrierHint={carrier || null} /> : '—'}
            </dd>
          </div>
          <div>
            <dt className="mode-label text-text-success">Carrier</dt>
            <dd className="text-role-caption font-semibold text-text-default">
              {[carrier, bought.service].filter(Boolean).join(' · ') || '—'}
            </dd>
          </div>
          <div>
            <dt className="mode-label text-text-success">Cost</dt>
            <dd className="text-role-caption font-semibold tabular-nums text-text-default">
              {typeof bought.cost === 'number' ? formatMoney(bought.cost, bought.currency ?? 'USD') : '—'}
            </dd>
          </div>
        </dl>
      </div>

      {bought.warning ? (
        <p className={`flex items-start gap-1.5 ${PHONE_CARD_FACE} border border-dashed border-border-warning bg-surface-warning px-3 py-2 text-role-caption text-text-warning`}>
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>{bought.warning}</span>
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-2" data-testid="send-replacement-bought-actions">
        <Button
          variant="primary"
          size="sm"
          icon={<Printer />}
          disabled={!labelSrc}
          onClick={() => labelSrc && printDocument(labelSrc)}
          data-testid="send-replacement-print-label"
        >
          Print label
        </Button>
        <Button
          variant="secondary"
          size="sm"
          icon={<Download />}
          disabled={!labelSrc}
          onClick={download}
          data-testid="send-replacement-download-label"
        >
          Download label
        </Button>
        <Button
          variant="secondary"
          size="sm"
          icon={<Printer />}
          disabled={!slipSrc}
          onClick={() => slipSrc && printDocument(slipSrc)}
          data-testid="send-replacement-print-slip"
        >
          Print slip
        </Button>
        {/* The buyer hears a first label from the marketplace; only a replacement needs our own note. */}
        {replacement ? (
          <Button
            variant="secondary"
            size="sm"
            icon={<Mail />}
            disabled={!tracking}
            onClick={() => void copyEmail()}
            data-testid="send-replacement-copy-email"
          >
            Copy buyer email
          </Button>
        ) : null}
        {voidOpen ? null : (
          <Button
            variant="ghost"
            size="sm"
            icon={<Trash2 />}
            className="ml-auto"
            disabled={!bought.labelId}
            onClick={() => setVoidOpen(true)}
            data-testid="send-replacement-void-open"
          >
            Void label
          </Button>
        )}
      </div>
      {!labelSrc && documentsQuery.isFetching ? (
        <p className="text-role-caption text-text-faint">Loading the stored label…</p>
      ) : null}

      {voidOpen ? (
        <div className="flex flex-col gap-2 rounded-mode-control border border-border-danger bg-surface-danger p-3" data-testid="send-replacement-void">
          <TextField
            label="Reason to void"
            value={voidReason}
            onChange={setVoidReason}
            autoFocus
            data-testid="send-replacement-void-reason"
          />
          {voidMutation.isError ? (
            <p className="text-role-caption text-text-danger" role="alert">{voidMutation.error.message}</p>
          ) : null}
          <div className="flex justify-end gap-2">
            <Button
              variant="ghost"
              size="sm"
              disabled={voidMutation.isPending}
              onClick={() => {
                setVoidOpen(false);
                setVoidReason('');
              }}
            >
              Cancel
            </Button>
            <Button
              variant="danger"
              size="sm"
              icon={<Trash2 />}
              loading={voidMutation.isPending}
              disabled={!voidReason.trim()}
              onClick={() => voidMutation.mutate()}
              data-testid="send-replacement-void-confirm"
            >
              Void label
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
