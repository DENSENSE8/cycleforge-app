'use client';

/**
 * SKU Exceptions — **New temp SKU**, in the evidence column where an open
 * record sits (the ledger opens with a key no record carries, and the head
 * reads `New exception`). The desk twin of the phone's barcode-less create:
 *
 *   title (required) · description · barcode (optional) · location + qty
 *
 * - `POST /api/sku-catalog/provisional` with ONE `sourceRef` per form open, so
 *   a double press joins its own placeholder instead of minting a second one.
 *   No barcode → `TMP-XXXXX-XXXXX`; a barcode is sent only when one is typed,
 *   and can be attached later from the record's Barcode fact.
 * - A location + qty is then put into that bin through the same bin verb as
 *   Add to location ({@link putSkuExceptionStock}).
 * - Done → the new record opens (`?sku=`), photo section first, so photos are
 *   added there when the owner has them.
 */

import { useState, type KeyboardEvent } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Plus, X } from '@/components/Icons';
import { SearchableSelectField } from '@/design-system/components/SearchableSelectField';
import {
  EVIDENCE_CONTROL_CLASS,
  EvidenceDecisionBar,
  EvidenceNotice,
  EvidenceSection,
  EvidenceStateStrip,
  EvidenceTitle,
  type EvidenceVerb,
} from '@/design-system/components/record-ledger/RecordEvidence';
import { RECORD_ID_CLASS, RECORD_LABEL_CLASS } from '@/design-system/tokens/industrial-record';
import { lifecycleRecordState } from '@/design-system/tokens/lifecycle';
import { useAuth } from '@/contexts/AuthContext';
import { invalidateSkuExceptions } from '@/hooks/useProvisionalSkus';
import { useLocationPickerOptions } from '@/hooks/useLocationPickerOptions';
import { skuExceptionLocationFace } from '@/lib/inventory/sku-exception-links';
import type { ProvisionalSku } from '@/lib/neon/provisional-sku-queries';
import { safeRandomUUID } from '@/lib/safe-uuid';
import { toast } from '@/lib/toast';
import { cn } from '@/utils/_cn';
import { putSkuExceptionStock } from './SkuExceptionEvidenceSections';

const TITLE_MIN = 2;
const TITLE_MAX = 200;
const DESCRIPTION_MAX = 2000;
const BARCODE_MAX = 64;

const LABEL_CLASS = cn(RECORD_LABEL_CLASS, 'text-mode-muted');

export function SkuExceptionCreateForm({
  onCreated,
  onCancel,
}: {
  /** The placeholder exists — open it. */
  onCreated: (sku: string) => void;
  onCancel: () => void;
}) {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const staffId = user?.staffId && user.staffId > 0 ? user.staffId : undefined;
  const { options, loading: locationsLoading } = useLocationPickerOptions();
  // One idempotency key per open form: the ledger remounts this per open.
  const [sourceRef] = useState(safeRandomUUID);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [barcode, setBarcode] = useState('');
  const [location, setLocation] = useState<string | null>(null);
  const [qtyDraft, setQtyDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const titleLength = title.trim().length;
  const titleInvalid = titleLength < TITLE_MIN || titleLength > TITLE_MAX;
  const qty = Number.parseInt(qtyDraft, 10);
  const qtyValid = Number.isFinite(qty) && qty > 0;
  const qtyMissing = location != null && !qtyValid;
  const canCreate = !titleInvalid && !qtyMissing && !busy;

  const create = async () => {
    if (!canCreate) return;
    setBusy(true);
    setError(null);
    let item: ProvisionalSku;
    try {
      const res = await fetch('/api/sku-catalog/provisional', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          productTitle: title.trim(),
          description: description.trim() || null,
          ...(barcode.trim() ? { barcode: barcode.trim() } : {}),
          sourceRef,
        }),
      });
      const data = (await res.json().catch(() => null)) as
        | { success?: boolean; error?: string; item?: ProvisionalSku }
        | null;
      if (!res.ok || !data?.success || !data.item) throw new Error(data?.error || `Create failed (${res.status})`);
      item = data.item;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create.');
      setBusy(false);
      return;
    }

    // The placeholder exists from here on: a failed put still opens it, where
    // Locations & count can add the stock again.
    if (location != null && qtyValid) {
      const face = skuExceptionLocationFace(location);
      try {
        await putSkuExceptionStock({ sku: item.sku, barcode: location, existing: 0, qty, staffId });
        toast.success(`Created ${item.sku} · ${qty} at ${face}`);
      } catch (err) {
        toast.error(
          `Created ${item.sku}, but could not add ${qty} at ${face}: ${
            err instanceof Error ? err.message : 'stock write failed'
          }`,
        );
      }
    } else {
      toast.success(`Created ${item.sku}`);
    }
    await invalidateSkuExceptions(queryClient);
    onCreated(item.sku);
  };

  const verbs: EvidenceVerb[] = [
    {
      label: busy ? 'Creating…' : 'Create',
      icon: <Plus />,
      primary: true,
      disabled: !canCreate,
      onPress: () => void create(),
      testId: 'sku-exception-create-submit',
    },
    { label: 'Cancel', icon: <X />, disabled: busy, onPress: onCancel, testId: 'sku-exception-create-cancel' },
  ];

  /** Enter in a one-line field creates; the textarea keeps its newline. */
  const onFieldKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      void create();
    }
  };

  return (
    <div className="flex min-h-full flex-1 flex-col" data-testid="sku-exception-create">
      <EvidenceTitle sub="Held until it is paired to its Zoho item. Add photos once it opens.">
        New temp SKU
      </EvidenceTitle>
      <EvidenceStateStrip state={lifecycleRecordState('onHold')} />
      {error ? (
        <EvidenceNotice tone="warn">
          <span data-testid="sku-exception-create-error">{error}</span>
        </EvidenceNotice>
      ) : null}
      <EvidenceSection label="Product">
        <div className="flex flex-col gap-2">
          <label htmlFor="sku-exception-create-title" className={LABEL_CLASS}>
            Title
          </label>
          <input
            id="sku-exception-create-title"
            value={title}
            maxLength={TITLE_MAX}
            onChange={(event) => setTitle(event.target.value)}
            onKeyDown={onFieldKeyDown}
            required
            autoFocus
            aria-invalid={(title !== '' && titleInvalid) || undefined}
            placeholder="What it is — brand, model, color"
            className={cn(EVIDENCE_CONTROL_CLASS, 'w-full')}
            data-testid="sku-exception-create-title"
          />
          <label htmlFor="sku-exception-create-description" className={LABEL_CLASS}>
            Description · optional
          </label>
          <textarea
            id="sku-exception-create-description"
            value={description}
            maxLength={DESCRIPTION_MAX}
            rows={3}
            onChange={(event) => setDescription(event.target.value)}
            placeholder="Condition, markings, what's in the box…"
            className={cn(EVIDENCE_CONTROL_CLASS, 'w-full resize-y py-1.5')}
            data-testid="sku-exception-create-description"
          />
        </div>
      </EvidenceSection>
      <EvidenceSection label="Barcode · optional">
        <input
          id="sku-exception-create-barcode"
          value={barcode}
          maxLength={BARCODE_MAX}
          onChange={(event) => setBarcode(event.target.value)}
          onKeyDown={onFieldKeyDown}
          placeholder="None — attach one later"
          aria-label="Barcode"
          autoComplete="off"
          spellCheck={false}
          className={cn(EVIDENCE_CONTROL_CLASS, RECORD_ID_CLASS, 'w-full')}
          data-testid="sku-exception-create-barcode"
        />
      </EvidenceSection>
      <EvidenceSection label="Location · optional">
        <div className="flex items-center gap-2">
          <SearchableSelectField
            value={location}
            onChange={(next) => setLocation(next == null ? null : String(next))}
            options={options}
            loading={locationsLoading}
            placeholder="Location"
            searchPlaceholder="Bin code, name or room…"
            emptyMessage="No matching location"
            ariaLabel="Location to put it in"
            className="min-w-0 flex-1"
            testId="sku-exception-create-location"
          />
          <input
            value={qtyDraft}
            onChange={(event) => setQtyDraft(event.target.value.replace(/\D/g, ''))}
            onKeyDown={onFieldKeyDown}
            disabled={location == null}
            inputMode="numeric"
            placeholder="Qty"
            aria-label="Quantity to put there"
            aria-invalid={qtyMissing || undefined}
            className={cn(EVIDENCE_CONTROL_CLASS, 'w-14 text-center tabular-nums disabled:opacity-40')}
            data-testid="sku-exception-create-qty"
          />
        </div>
      </EvidenceSection>
      <p role="status" aria-live="polite" className="px-4 py-2 text-role-caption text-mode-muted">
        {titleInvalid
          ? `Title needs ${TITLE_MIN}–${TITLE_MAX} characters`
          : qtyMissing
            ? `Qty to put at ${skuExceptionLocationFace(location)}`
            : location != null
              ? `${qty} at ${skuExceptionLocationFace(location)}`
              : barcode.trim()
                ? 'Ready'
                : 'Ready · no barcode, a TMP- SKU is minted'}
      </p>
      <EvidenceDecisionBar verbs={verbs} />
    </div>
  );
}
