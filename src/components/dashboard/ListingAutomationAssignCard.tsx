'use client';

/**
 * To-ship selection overlay: save (item #, SKU) → QC + packer (each with an
 * optional backup for days the primary is out) as automation_rules
 * and assign the selected orders now. Mirrors WorkOrderAssignmentCard chrome
 * (AssignmentOverlayCard + StaffButtonGrid) without the per-row carousel.
 */

import { useEffect, useState } from 'react';
import { AssignmentOverlayCard } from '@/design-system/components/AssignmentOverlayCard';
import { Button } from '@/design-system/primitives';
import { StaffButtonGrid, type StaffOption } from '@/components/shipping/StaffButtonGrid';

/** One rule key; sku null = item-#-only rule covering every SKU on that listing. */
export type ListingAutomationListing = {
  itemNumber: string;
  sku: string | null;
  orderCount: number;
};

type PreviewState =
  | { status: 'loading' }
  | {
      status: 'ready';
      listings: ListingAutomationListing[];
      skippedNoItemNumber: number;
      totalOrders: number;
    }
  | { status: 'error'; message: string };

export interface ListingAutomationAssignCardProps {
  orderIds: number[];
  technicianOptions: StaffOption[];
  packerOptions: StaffOption[];
  onClose: () => void;
  onComplete: (mode: 'save_and_assign' | 'apply_existing') => void;
}

export function ListingAutomationAssignCard({
  orderIds,
  technicianOptions,
  packerOptions,
  onClose,
  onComplete,
}: ListingAutomationAssignCardProps) {
  const [preview, setPreview] = useState<PreviewState>({ status: 'loading' });
  const [techId, setTechId] = useState<number | null>(null);
  const [packerId, setPackerId] = useState<number | null>(null);
  const [backupTechId, setBackupTechId] = useState<number | null>(null);
  const [backupPackerId, setBackupPackerId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const qs = orderIds.join(',');
    void (async () => {
      try {
        const res = await fetch(`/api/automations/listing-assign?orderIds=${encodeURIComponent(qs)}`);
        const body = (await res.json().catch(() => null)) as
          | {
              success?: boolean;
              error?: string;
              listings?: ListingAutomationListing[];
              skippedNoItemNumber?: number;
              totalOrders?: number;
            }
          | null;
        if (cancelled) return;
        if (!res.ok || !body?.success) {
          setPreview({
            status: 'error',
            message: body?.error || `Preview failed (${res.status})`,
          });
          return;
        }
        setPreview({
          status: 'ready',
          listings: body.listings ?? [],
          skippedNoItemNumber: body.skippedNoItemNumber ?? 0,
          totalOrders: body.totalOrders ?? orderIds.length,
        });
      } catch (err) {
        if (cancelled) return;
        setPreview({
          status: 'error',
          message: err instanceof Error ? err.message : 'Preview failed',
        });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [orderIds]);

  const canSave =
    preview.status === 'ready' &&
    preview.listings.length > 0 &&
    techId != null &&
    packerId != null &&
    !saving;

  const submit = async (mode: 'save_and_assign' | 'apply_existing') => {
    setError(null);
    setSaving(true);
    try {
      const res = await fetch('/api/automations/listing-assign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orderIds,
          mode,
          techId: mode === 'save_and_assign' ? techId : undefined,
          packerId: mode === 'save_and_assign' ? packerId : undefined,
          backupTechId: mode === 'save_and_assign' ? backupTechId : undefined,
          backupPackerId: mode === 'save_and_assign' ? backupPackerId : undefined,
        }),
      });
      const body = (await res.json().catch(() => null)) as {
        success?: boolean;
        error?: string;
        rulesUpserted?: number;
        orderResults?: Array<{ status: string }>;
      } | null;
      if (!res.ok || !body?.success) {
        setError(body?.error || `Request failed (${res.status})`);
        return;
      }
      onComplete(mode);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Request failed');
    } finally {
      setSaving(false);
    }
  };

  const listingCount = preview.status === 'ready' ? preview.listings.length : 0;

  return (
    <AssignmentOverlayCard
      onClose={onClose}
      dialogPosition="center"
      showHeaderGradient={false}
      widthClassName="w-[96vw] max-w-[560px]"
      title="Listing → staff"
      subtitle={
        preview.status === 'ready'
          ? `${preview.totalOrders} selected · ${listingCount} item/SKU pair${listingCount === 1 ? '' : 's'}`
          : `${orderIds.length} selected`
      }
      footer={
        <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
          <Button
            type="button"
            variant="secondary"
            disabled={saving || preview.status !== 'ready' || listingCount === 0}
            onClick={() => void submit('apply_existing')}
          >
            Apply existing rules
          </Button>
          <Button
            type="button"
            variant="primary"
            disabled={!canSave}
            onClick={() => void submit('save_and_assign')}
          >
            Save rules &amp; assign
          </Button>
        </div>
      }
    >
      <div className="space-y-4 px-5 py-4">
        {preview.status === 'loading' ? (
          <p className="text-role-caption text-text-muted">Loading listings…</p>
        ) : null}
        {preview.status === 'error' ? (
          <p className="text-role-caption text-text-danger">{preview.message}</p>
        ) : null}
        {preview.status === 'ready' ? (
          <>
            {preview.listings.length === 0 ? (
              <p className="text-role-caption text-text-muted">
                None of the selected orders have an item number. Set item numbers
                first, then save a listing rule.
              </p>
            ) : (
              <ul className="max-h-36 space-y-1 overflow-y-auto rounded-lg border border-border-hairline bg-surface-sunken px-3 py-2">
                {preview.listings.map((row) => (
                  <li
                    key={`${row.itemNumber}|${row.sku ?? ''}`}
                    className="flex items-center justify-between gap-2 text-role-caption text-text-default"
                  >
                    <span className="font-mono tabular-nums">
                      ITEM {row.itemNumber} · SKU {row.sku ?? '(any)'}
                    </span>
                    <span className="text-text-soft">
                      {row.orderCount} order{row.orderCount === 1 ? '' : 's'}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            {preview.skippedNoItemNumber > 0 ? (
              <p className="text-role-eyebrow text-text-soft">
                {preview.skippedNoItemNumber} order
                {preview.skippedNoItemNumber === 1 ? '' : 's'} skipped (no item number)
              </p>
            ) : null}

            <StaffButtonGrid
              label="Picker"
              options={technicianOptions}
              selectedId={techId}
              onSelect={(id) => {
                setTechId(id);
                if (backupTechId === id) setBackupTechId(null);
              }}
              emptyMessage="No pickers"
            />
            <StaffButtonGrid
              label="Backup picker (optional)"
              options={technicianOptions.filter((m) => m.id !== techId)}
              selectedId={backupTechId}
              onSelect={(id) => setBackupTechId((prev) => (prev === id ? null : id))}
              emptyMessage="No other pickers"
            />
            <StaffButtonGrid
              label="Packer"
              options={packerOptions}
              selectedId={packerId}
              onSelect={(id) => {
                setPackerId(id);
                if (backupPackerId === id) setBackupPackerId(null);
              }}
              columns={2}
              emptyMessage="No packers"
            />
            <StaffButtonGrid
              label="Backup packer (optional)"
              options={packerOptions.filter((m) => m.id !== packerId)}
              selectedId={backupPackerId}
              onSelect={(id) => setBackupPackerId((prev) => (prev === id ? null : id))}
              columns={2}
              emptyMessage="No other packers"
            />
          </>
        ) : null}
        {error ? <p className="text-role-caption text-text-danger">{error}</p> : null}
        <p className="text-role-eyebrow text-text-soft">
          Save rules &amp; assign writes item # + SKU → staff for future imports and
          assigns these orders now; a backup takes over on days its primary is out.
          Apply existing rules only uses rules already saved.
        </p>
      </div>
    </AssignmentOverlayCard>
  );
}
