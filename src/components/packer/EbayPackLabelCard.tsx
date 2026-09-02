'use client';

import { useCallback, useMemo, useState, type ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, Check, FileText, Loader2, Printer, ScanBarcode } from '@/components/Icons';
import { Button } from '@/design-system/primitives';
import { OrderDocumentsSection } from '@/components/shipped/OrderDocumentsSection';
import {
  dispatchPackPrintBundleUi,
  emitPackerFocusScan,
  triggerPackPrintBundle,
  type PrintBundleUiState,
} from '@/components/packer/pack-print-bundle';
import { useRegisterScanSink } from '@/lib/station-scan-sink';
import type { OutboundDocumentsResponse } from '@/lib/documents/types';
import { cn } from '@/utils/_cn';

export interface EbayPackLabelCardProps {
  orderId: number;
  orderRef: string;
  packerId: number;
  stationIpAddress?: string | null;
  onChanged?: () => void;
  /** Allows the host to keep the document tray in its own display plane. */
  documentsSlot?: ReactNode;
}

export function packScanMatchesOrder(value: string, orderId: number, orderRef: string): boolean {
  const scan = value.trim().toLowerCase();
  if (!scan) return false;
  return scan === String(orderId).toLowerCase() || scan === orderRef.trim().toLowerCase();
}

function statusTone(status: PrintBundleUiState['status'] | 'idle'): string {
  if (status === 'dispatched' || status === 'idempotent_replay') {
    return 'border-emerald-200 bg-emerald-50 text-emerald-800';
  }
  if (status === 'failed' || status === 'missing') {
    return 'border-amber-200 bg-amber-50 text-amber-800';
  }
  return 'border-border-soft bg-surface-card text-text-muted';
}

function statusMessage(state: PrintBundleUiState | null): string {
  if (!state || state.status === 'idle') return '';
  if (state.message) return state.message;
  if (state.status === 'dispatched') return 'Shipping label sent to the packer printer.';
  if (state.status === 'idempotent_replay') return 'This label print was already submitted.';
  return 'Label print needs attention.';
}

/**
 * eBay label slice for the packer overlay.
 *
 * eBay currently supplies the order/fulfillment surface in this repository, but
 * the document adapter explicitly does not claim a printable label endpoint.
 * This card therefore makes the safe supported path obvious: attach the label
 * purchased in eBay, preview the linked document, then print it from this order.
 * The scan path prints only an existing document; it never buys postage.
 */
export function EbayPackLabelCard({
  orderId,
  orderRef,
  packerId,
  stationIpAddress = null,
  onChanged,
  documentsSlot,
}: EbayPackLabelCardProps) {
  const queryClient = useQueryClient();
  const [printState, setPrintState] = useState<PrintBundleUiState | null>(null);
  const normalizedIp = stationIpAddress?.trim() || null;

  const { data, isLoading } = useQuery<OutboundDocumentsResponse>({
    queryKey: ['order-documents', orderId],
    queryFn: async () => {
      const response = await fetch(`/api/orders/${orderId}/documents`);
      if (!response.ok) throw new Error('Failed to load order documents');
      return (await response.json()) as OutboundDocumentsResponse;
    },
    enabled: Number.isFinite(orderId) && orderId > 0,
    staleTime: 30_000,
  });

  const labelCount = useMemo(
    () => (data?.documents ?? []).filter((doc) => doc.documentType === 'shipping_label').length,
    [data?.documents],
  );

  const publishPrintState = useCallback((next: PrintBundleUiState) => {
    setPrintState(next);
    dispatchPackPrintBundleUi(next);
    emitPackerFocusScan();
  }, []);

  const printLabel = useCallback(async () => {
    if (labelCount === 0) {
      publishPrintState({
        status: 'missing',
        missingTypes: ['shipping_label'],
        message: 'Attach the purchased eBay shipping label before printing.',
        orderRowId: orderId,
        packerLogId: null,
      });
      return;
    }
    if (!normalizedIp) {
      publishPrintState({
        status: 'failed',
        missingTypes: [],
        message: `No packer printer is registered for staff ${packerId} at this station.`,
        orderRowId: orderId,
        packerLogId: null,
      });
      return;
    }

    publishPrintState({
      status: 'printing',
      missingTypes: [],
      message: `Sending label to station printer at ${normalizedIp}…`,
      orderRowId: orderId,
      packerLogId: null,
    });

    try {
      const result = await triggerPackPrintBundle({
        orderRowId: orderId,
        packerLogId: null,
      });
      publishPrintState(result);
      queryClient.invalidateQueries({ queryKey: ['order-documents', orderId] });
      onChanged?.();
    } catch (error) {
      publishPrintState({
        status: 'failed',
        missingTypes: [],
        message: error instanceof Error ? error.message : 'Shipping-label print failed.',
        orderRowId: orderId,
        packerLogId: null,
      });
    }
  }, [labelCount, normalizedIp, onChanged, orderId, packerId, publishPrintState, queryClient]);

  useRegisterScanSink({
    id: `packer-ebay-label-${orderId}`,
    enabled: orderId > 0,
    onScan: (value) => {
      if (!packScanMatchesOrder(value, orderId, orderRef)) return;
      void printLabel();
    },
    focus: emitPackerFocusScan,
  });

  const effectiveDocuments = documentsSlot ?? (
    <OrderDocumentsSection
      orderId={orderId}
      orderRef={orderRef}
      documentPlatform="ebay"
      showPreview
      showBuySection={false}
      onChanged={() => {
        queryClient.invalidateQueries({ queryKey: ['order-documents', orderId] });
        onChanged?.();
      }}
    />
  );

  const isPrinting = printState?.status === 'printing';
  const canPrint = labelCount > 0 && Boolean(normalizedIp) && !isPrinting;

  return (
    <section
      className="space-y-3 border-b border-border-hairline px-3 py-3"
      data-testid="ebay-pack-label-card"
      aria-labelledby="ebay-pack-label-title"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <FileText className="h-4 w-4 shrink-0 text-blue-600" aria-hidden />
            <h2 id="ebay-pack-label-title" className="text-role-caption font-semibold text-text-default">
              eBay shipping label
            </h2>
            <span className="rounded bg-blue-50 px-1.5 py-0.5 text-role-eyebrow font-semibold uppercase tracking-widest text-blue-700 ring-1 ring-inset ring-blue-200">
              eBay
            </span>
          </div>
          <p className="mt-1 text-role-eyebrow text-text-soft">
            Attach the label purchased in eBay, verify it, then print it from this station.
          </p>
        </div>
        <span
          className={cn(
            'shrink-0 text-role-eyebrow font-semibold uppercase tracking-widest',
            labelCount > 0 ? 'text-emerald-700' : 'text-text-faint',
          )}
          data-testid="ebay-label-count"
        >
          {isLoading ? 'Checking…' : `${labelCount} attached`}
        </span>
      </div>

      <div
        className={cn(
          'flex items-center justify-between gap-2 border px-3 py-2 text-role-eyebrow',
          normalizedIp ? 'border-border-soft bg-surface-card text-text-muted' : 'border-amber-200 bg-amber-50 text-amber-800',
        )}
        data-testid="ebay-packer-printer-status"
      >
        <span className="flex min-w-0 items-center gap-1.5">
          <Printer className="h-3.5 w-3.5 shrink-0" aria-hidden />
          <span className="truncate">
            {normalizedIp
              ? `Packer ${packerId} · station printer ${normalizedIp}`
              : `Packer ${packerId} · station printer not registered`}
          </span>
        </span>
        {!normalizedIp ? <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden /> : null}
      </div>

      <div data-testid="ebay-label-documents">{effectiveDocuments}</div>

      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant="primary"
          size="sm"
          icon={isPrinting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Printer className="h-4 w-4" />}
          disabled={!canPrint}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => void printLabel()}
          data-testid="ebay-print-label"
        >
          {isPrinting ? 'Printing…' : 'Print shipping label'}
        </Button>
        <span className="flex items-center gap-1 text-role-eyebrow text-text-faint">
          <ScanBarcode className="h-3.5 w-3.5" aria-hidden />
          Scan order ID to print
        </span>
      </div>

      {printState && printState.status !== 'printing' ? (
        <div
          className={cn('flex items-start gap-2 border px-3 py-2 text-role-eyebrow', statusTone(printState.status))}
          role="status"
          data-testid="ebay-label-print-status"
        >
          {printState.status === 'dispatched' || printState.status === 'idempotent_replay' ? (
            <Check className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
          ) : (
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
          )}
          <span>{statusMessage(printState)}</span>
        </div>
      ) : null}
    </section>
  );
}
