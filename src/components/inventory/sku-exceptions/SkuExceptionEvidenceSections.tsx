'use client';

/**
 * SKU exception evidence — Product (title + description) and Locations &
 * count. Every write is the same endpoint the phone uses, then `onChanged`
 * (→ `invalidateSkuExceptions`), so the phone and this desk repaint each other.
 */

import { useState } from 'react';
import { SearchableSelectField } from '@/design-system/components/SearchableSelectField';
import {
  EVIDENCE_CONTROL_CLASS,
  EvidenceCountStepper,
  EvidenceSection,
  evidenceVerbClass,
} from '@/design-system/components/record-ledger/RecordEvidence';
import { RECORD_ID_CLASS, RECORD_LABEL_CLASS } from '@/design-system/tokens/industrial-record';
import { useAuth } from '@/contexts/AuthContext';
import { useLocationPickerOptions } from '@/hooks/useLocationPickerOptions';
import { skuExceptionLocationFace } from '@/lib/inventory/sku-exception-links';
import { commitStockRequest, stockAdjustRequest } from '@/lib/inventory/stock-bin-verb-writes';
import type { StockBinWriteTarget } from '@/lib/inventory/stock-bin-writes';
import type { ProvisionalSkuDetail, ProvisionalSkuLocation } from '@/lib/neon/provisional-sku-queries';
import { toast } from '@/lib/toast';
import { cn } from '@/utils/_cn';

const TITLE_MIN = 2;
const TITLE_MAX = 200;
const DESCRIPTION_MAX = 2000;

type OnChanged = () => Promise<void>;

// ── Product ─────────────────────────────────────────────────────────────────

/**
 * The title and description typed on the phone, editable here. An untouched
 * field shows the SERVER value, so a phone edit landing through realtime
 * repaints it; once touched it holds the draft until Save or Revert.
 */
export function SkuExceptionProductSection({
  fieldId,
  item,
  onChanged,
}: {
  fieldId: string;
  item: ProvisionalSkuDetail;
  onChanged: OnChanged;
}) {
  const [titleDraft, setTitleDraft] = useState<string | null>(null);
  const [descriptionDraft, setDescriptionDraft] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const title = titleDraft ?? item.productTitle;
  const description = descriptionDraft ?? item.description ?? '';
  const titleChanged = titleDraft !== null && titleDraft.trim() !== item.productTitle;
  const descriptionChanged =
    descriptionDraft !== null && descriptionDraft.trim() !== (item.description ?? '').trim();
  const titleLength = title.trim().length;
  const titleInvalid = titleLength < TITLE_MIN || titleLength > TITLE_MAX;
  const dirty = titleDraft !== null || descriptionDraft !== null;
  const canSave = (titleChanged || descriptionChanged) && !titleInvalid && !saving;

  const save = async () => {
    if (!canSave) return;
    setSaving(true);
    try {
      const patch: { productTitle?: string; description?: string | null } = {};
      if (titleChanged) patch.productTitle = title.trim();
      if (descriptionChanged) patch.description = description.trim() || null;
      const res = await fetch(`/api/sku-catalog/provisional/${encodeURIComponent(item.sku)}`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      });
      const data = (await res.json().catch(() => null)) as { success?: boolean; error?: string } | null;
      if (!res.ok || !data?.success) throw new Error(data?.error || `Save failed (${res.status})`);
      await onChanged();
      setTitleDraft(null);
      setDescriptionDraft(null);
      toast.success('Saved', { id: `sku-exception-saved-${item.sku}` });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not save.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <EvidenceSection label="Product" testId="sku-exception-product">
      <div className="flex flex-col gap-2">
        <label htmlFor={`${fieldId}-title`} className={cn(RECORD_LABEL_CLASS, 'text-mode-muted')}>
          Title
        </label>
        <input
          id={`${fieldId}-title`}
          value={title}
          maxLength={TITLE_MAX}
          onChange={(event) => setTitleDraft(event.target.value)}
          aria-invalid={titleInvalid || undefined}
          className={cn(EVIDENCE_CONTROL_CLASS, 'w-full')}
          data-testid="sku-exception-title"
        />
        <label htmlFor={`${fieldId}-description`} className={cn(RECORD_LABEL_CLASS, 'text-mode-muted')}>
          Description
        </label>
        <textarea
          id={`${fieldId}-description`}
          value={description}
          maxLength={DESCRIPTION_MAX}
          rows={3}
          onChange={(event) => setDescriptionDraft(event.target.value)}
          placeholder="Condition, markings, what's in the box…"
          className={cn(EVIDENCE_CONTROL_CLASS, 'w-full resize-y py-1.5')}
          data-testid="sku-exception-description"
        />
        <div className="flex items-center gap-2">
          <span role="status" aria-live="polite" className="mr-auto text-role-caption text-mode-muted">
            {titleInvalid
              ? `Title needs ${TITLE_MIN}–${TITLE_MAX} characters`
              : titleChanged || descriptionChanged
                ? 'Unsaved changes'
                : 'Up to date'}
          </span>
          <button
            type="button"
            className={evidenceVerbClass(false)}
            disabled={saving || !dirty}
            onClick={() => {
              setTitleDraft(null);
              setDescriptionDraft(null);
            }}
          >
            Revert
          </button>
          <button
            type="button"
            className={evidenceVerbClass(true)}
            disabled={!canSave}
            onClick={() => void save()}
            data-testid="sku-exception-save"
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </EvidenceSection>
  );
}

// ── Locations & count ───────────────────────────────────────────────────────

function countTarget(sku: string, barcode: string, qty: number): StockBinWriteTarget {
  const face = skuExceptionLocationFace(barcode);
  return { rowId: `${barcode}:${sku}`, barcode, sku, qty, face: `${face} · ${sku}` };
}

/**
 * One row per location holding the placeholder — − / signed amount / + and
 * Apply — plus Add to location for a bin that holds none yet. Every write is
 * the phone's own bin verb (`PATCH /api/locations/[barcode]` put / take via
 * `stockAdjustRequest`), so the ledger row, the `sku_stock` recompute and the
 * `STOCK_DELTA_*` publish are identical to a count made on the floor. A take
 * can never exceed what the bin holds.
 */
export function SkuExceptionLocationsSection({
  fieldId,
  item,
  onChanged,
}: {
  fieldId: string;
  item: ProvisionalSkuDetail;
  onChanged: OnChanged;
}) {
  const { user } = useAuth();
  const staffId = user?.staffId && user.staffId > 0 ? user.staffId : undefined;
  const { options, loading } = useLocationPickerOptions();
  const [barcode, setBarcode] = useState<string | null>(null);
  const [qtyDraft, setQtyDraft] = useState('');
  const [busy, setBusy] = useState(false);

  const qty = Number.parseInt(qtyDraft, 10);
  const ready = Boolean(barcode) && Number.isFinite(qty) && qty > 0 && !busy;
  const existing = item.locations.find((loc) => loc.barcode === barcode)?.qty ?? 0;

  const add = async () => {
    if (!ready || !barcode) return;
    setBusy(true);
    try {
      await commitStockRequest(
        stockAdjustRequest(countTarget(item.sku, barcode, existing), {
          direction: 'in',
          qty,
          staffId,
          // The reason the phone's pairing commit sends, so both read as one verb.
          reasonCode: 'BIN_ADD',
        }),
      );
      setQtyDraft('');
      setBarcode(null);
      await onChanged();
      toast.success(`Added ${qty} at ${skuExceptionLocationFace(barcode)}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not add stock.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <EvidenceSection
      label="Locations & count"
      testId="sku-exception-locations"
      action={
        <span className={cn(RECORD_LABEL_CLASS, 'tabular-nums text-mode-ink')} data-testid="sku-exception-on-hand">
          {item.stock} on hand
        </span>
      }
    >
      {item.locations.length > 0 ? (
        <ul className="flex flex-col" aria-label="Locations holding this SKU">
          {item.locations.map((location, index) => (
            <SkuExceptionCountRow
              key={location.locationId}
              inputId={index === 0 ? `${fieldId}-count` : undefined}
              sku={item.sku}
              location={location}
              staffId={staffId}
              onChanged={onChanged}
            />
          ))}
        </ul>
      ) : (
        <p className={cn(RECORD_LABEL_CLASS, 'py-1 text-mode-warn')}>Not in any location</p>
      )}
      <div className="mt-3 flex flex-col gap-2 border-t border-mode-rule pt-3">
        <span className={cn(RECORD_LABEL_CLASS, 'text-mode-muted')}>Add to location</span>
        <div className="flex items-center gap-2">
          <SearchableSelectField
            value={barcode}
            onChange={(next) => setBarcode(next == null ? null : String(next))}
            options={options}
            loading={loading}
            placeholder="Location"
            searchPlaceholder="Bin code, name or room…"
            emptyMessage="No matching location"
            ariaLabel="Location to add stock to"
            className="min-w-0 flex-1"
            testId="sku-exception-add-location"
          />
          <input
            value={qtyDraft}
            onChange={(event) => setQtyDraft(event.target.value.replace(/\D/g, ''))}
            onKeyDown={(event) => {
              if (event.key === 'Enter') void add();
            }}
            inputMode="numeric"
            placeholder="Qty"
            aria-label="Quantity to add"
            className={cn(EVIDENCE_CONTROL_CLASS, 'w-14 text-center tabular-nums')}
          />
          <button
            type="button"
            className={evidenceVerbClass(true)}
            disabled={!ready}
            onClick={() => void add()}
          >
            {busy ? 'Adding…' : 'Add'}
          </button>
        </div>
        {barcode && ready ? (
          <span className="text-role-caption tabular-nums text-mode-muted">
            {existing} → {existing + qty} at {skuExceptionLocationFace(barcode)}
          </span>
        ) : null}
      </div>
    </EvidenceSection>
  );
}

function SkuExceptionCountRow({
  inputId,
  sku,
  location,
  staffId,
  onChanged,
}: {
  inputId?: string;
  sku: string;
  location: ProvisionalSkuLocation;
  staffId: number | undefined;
  onChanged: OnChanged;
}) {
  const face = skuExceptionLocationFace(location.barcode);
  return (
    <li
      className="flex items-center gap-1.5 border-b border-mode-rule py-1.5 last:border-b-0"
      data-testid={`sku-exception-location-${location.barcode}`}
    >
      <div className="min-w-0 flex-1">
        <p className={cn(RECORD_ID_CLASS, 'truncate text-mode-ink')}>{face}</p>
        {location.room ? <p className="truncate text-role-caption text-mode-muted">{location.room}</p> : null}
      </div>
      <span className={cn(RECORD_ID_CLASS, 'w-8 text-right text-mode-ink')} data-testid="sku-exception-location-qty">
        {location.qty}
      </span>
      <EvidenceCountStepper
        inputId={inputId}
        face={face}
        qty={location.qty}
        onCommit={async (delta) => {
          await commitStockRequest(
            stockAdjustRequest(countTarget(sku, location.barcode, location.qty), {
              direction: delta > 0 ? 'in' : 'out',
              qty: Math.abs(delta),
              staffId,
            }),
          );
          await onChanged();
        }}
      />
    </li>
  );
}
