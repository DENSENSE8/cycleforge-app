'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/design-system/primitives';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/design-system/components/Dialog';
import { useWarrantyMutations } from '@/hooks/useWarrantyMutations';

interface WarrantyLogClaimDialogProps {
  open: boolean;
  onClose: () => void;
  onCreated: (claimId: number) => void;
  /** Prefill the form (e.g. from a coverage lookup). `orderId` is the internal orders.id. */
  initial?: {
    orderId?: number | null;
    serialNumber?: string | null;
    sku?: string | null;
    productTitle?: string | null;
  };
}

/**
 * Minimal "Log Claim" form. Resolves the order's customer / SKU / warranty clock
 * server-side, so a serial OR order OR SKU is enough to start a claim. Opening it
 * with `initial` (from the coverage card) prefills the identifiers.
 */
export function WarrantyLogClaimDialog({ open, onClose, onCreated, initial }: WarrantyLogClaimDialogProps) {
  const { create } = useWarrantyMutations();
  const [serialNumber, setSerialNumber] = useState('');
  const [orderId, setOrderId] = useState('');
  const [sku, setSku] = useState('');
  const [productTitle, setProductTitle] = useState('');
  const [notes, setNotes] = useState('');

  // Seed the form from `initial` each time the dialog opens (so a coverage-card
  // "Log claim" arrives prefilled, and a fresh open starts clean otherwise).
  useEffect(() => {
    if (!open) return;
    setSerialNumber(initial?.serialNumber ?? '');
    setOrderId(initial?.orderId != null ? String(initial.orderId) : '');
    setSku(initial?.sku ?? '');
    setProductTitle(initial?.productTitle ?? '');
    setNotes('');
  }, [open, initial?.serialNumber, initial?.orderId, initial?.sku, initial?.productTitle]);

  const orderIdNum = Number(orderId.trim());
  const hasIdentifier = Boolean(serialNumber.trim() || sku.trim() || (orderId.trim() && orderIdNum > 0));

  const reset = () => {
    setSerialNumber('');
    setOrderId('');
    setSku('');
    setProductTitle('');
    setNotes('');
  };

  const submit = () => {
    const body: Record<string, unknown> = {};
    if (serialNumber.trim()) body.serialNumber = serialNumber.trim();
    if (orderId.trim() && orderIdNum > 0) body.orderId = orderIdNum;
    if (sku.trim()) body.sku = sku.trim();
    if (productTitle.trim()) body.productTitle = productTitle.trim();
    if (notes.trim()) body.notes = notes.trim();
    create.mutate(body, {
      onSuccess: (data) => {
        reset();
        onClose();
        if (data.claim?.id) onCreated(data.claim.id);
      },
    });
  };

  const input = 'w-full rounded-md border border-border-soft px-2.5 py-1.5 text-sm';

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next && !create.isPending) onClose();
      }}
    >
      <DialogContent hideClose className="max-w-md">
        <DialogHeader>
          <DialogTitle className="text-sm font-semibold">Log warranty claim</DialogTitle>
          <DialogDescription>
            Provide a serial, order #, or SKU. The warranty clock + customer are resolved from the order when available.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          {create.error && (
            <p className="text-xs text-text-danger">
              {create.error instanceof Error ? create.error.message : 'Failed to log claim.'}
            </p>
          )}
          <div>
            <label className="mb-1 block text-role-caption font-medium uppercase tracking-wide text-text-faint">Serial number</label>
            <input className={input} value={serialNumber} onChange={(e) => setSerialNumber(e.target.value)} placeholder="e.g. SN-12345" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-role-caption font-medium uppercase tracking-wide text-text-faint">Order # (internal id)</label>
              <input className={input} value={orderId} onChange={(e) => setOrderId(e.target.value)} inputMode="numeric" placeholder="e.g. 8421" />
            </div>
            <div>
              <label className="mb-1 block text-role-caption font-medium uppercase tracking-wide text-text-faint">SKU</label>
              <input className={input} value={sku} onChange={(e) => setSku(e.target.value)} />
            </div>
          </div>
          <div>
            <label className="mb-1 block text-role-caption font-medium uppercase tracking-wide text-text-faint">Product title</label>
            <input className={input} value={productTitle} onChange={(e) => setProductTitle(e.target.value)} />
          </div>
          <div>
            <label className="mb-1 block text-role-caption font-medium uppercase tracking-wide text-text-faint">Notes</label>
            <textarea className={input} rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="secondary"
            size="sm"
            className="text-xs"
            onClick={onClose}
            disabled={create.isPending}
          >
            Cancel
          </Button>
          <Button
            variant="primary"
            size="sm"
            className="text-xs"
            disabled={!hasIdentifier || create.isPending}
            loading={create.isPending}
            onClick={submit}
          >
            Log claim
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
