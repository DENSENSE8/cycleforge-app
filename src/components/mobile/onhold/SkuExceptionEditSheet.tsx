'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { ScanValueField } from '@/components/mobile/repair/ScanValueField';
import { Button } from '@/design-system/primitives';
import { TextField } from '@/design-system/primitives/TextField';
import { ModeRegion } from '@/design-system/providers/ModeRegion';
import { isProvisionalSku } from '@/lib/inventory/provisional-sku';
import { mobileSkuExceptionHref } from '@/lib/inventory/sku-exception-links';
import type { ProvisionalSku } from '@/lib/neon/provisional-sku-queries';

export interface SkuExceptionDraft {
  productTitle: string;
  description: string;
  /** Only offered while the placeholder has none; attach-once on the server. */
  barcode: string;
}

/** A refused save; `conflictSku` names the record that already owns the barcode. */
export interface SkuExceptionEditError {
  message: string;
  conflictSku?: string | null;
}

const TITLE_MIN = 2;
const TITLE_MAX = 200;
const DESCRIPTION_MAX = 2000;
const BARCODE_MAX = 64;

/**
 * The one edit of a SKU exception, opened from the pencil on `/info` (or the
 * Barcode row's "Add barcode", which is the same sheet). The sheet owns only
 * the draft; the page owns the write and its acknowledgement (same split as
 * `RepairInfoEditSheet`).
 *
 * A placeholder created without a barcode gets a scan-or-type Barcode field
 * here. It attaches once — after that the barcode is a read-only fact, because
 * the merge matches on it and a second one would be a different product.
 */
export function SkuExceptionEditSheet({
  open,
  item,
  saving,
  error,
  onSave,
  onClose,
}: {
  open: boolean;
  item: ProvisionalSku;
  saving: boolean;
  error: SkuExceptionEditError | null;
  onSave: (draft: SkuExceptionDraft, changed: string[]) => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState<SkuExceptionDraft>({ productTitle: '', description: '', barcode: '' });
  const canAttachBarcode = item.barcode === '';

  // Re-seed on open so a cancelled edit never survives a close.
  useEffect(() => {
    if (open) setDraft({ productTitle: item.productTitle, description: item.description ?? '', barcode: '' });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- seed on open only; a live refetch must not wipe typing
  }, [open]);

  const title = draft.productTitle.trim();
  const barcode = canAttachBarcode ? draft.barcode.trim() : '';
  const changed = [
    title !== item.productTitle ? 'title' : null,
    draft.description.trim() !== (item.description ?? '').trim() ? 'description' : null,
    barcode ? 'barcode' : null,
  ].filter((c): c is string => c != null);
  const problem =
    title.length < TITLE_MIN
      ? `The title needs at least ${TITLE_MIN} characters.`
      : title.length > TITLE_MAX
        ? `The title is limited to ${TITLE_MAX} characters.`
        : draft.description.length > DESCRIPTION_MAX
          ? `The description is limited to ${DESCRIPTION_MAX} characters.`
          : barcode.length > BARCODE_MAX
            ? `The barcode is limited to ${BARCODE_MAX} characters.`
            : null;
  const conflictSku = error?.conflictSku ?? null;

  return (
    <BottomSheet
      open={open}
      onClose={saving ? () => {} : onClose}
      forceVariant="sheet"
      title="Edit details"
      scrollBody
      dragDisabled
    >
      {/* BottomSheet portals out of the page's ModeRegion; re-declare triage. */}
      <ModeRegion mode="triage" className="-mx-1 flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-1 pb-2 pt-2">
        <TextField
          label="Title"
          value={draft.productTitle}
          onChange={(value) => setDraft((d) => ({ ...d, productTitle: value }))}
          disabled={saving}
        />
        <TextField
          label="Description"
          value={draft.description}
          onChange={(value) => setDraft((d) => ({ ...d, description: value }))}
          multiline
          rows={4}
          disabled={saving}
        />
        {canAttachBarcode ? (
          <ScanValueField
            id="sku-exception-barcode"
            label="Barcode"
            value={draft.barcode}
            onChange={(value) => setDraft((d) => ({ ...d, barcode: value }))}
            placeholder="Scan or type the UPC"
            helper="Attaches once — it is what pairing to the real SKU matches on."
            mono
            disabled={saving}
          />
        ) : null}
        {error || problem ? (
          <div
            role="alert"
            className="flex flex-col gap-1 rounded-mode border border-rose-200 bg-rose-50 px-mode-page py-2.5 text-role-caption font-semibold text-rose-700"
          >
            <p>{error?.message ?? problem}</p>
            {conflictSku && isProvisionalSku(conflictSku) ? (
              <Link href={mobileSkuExceptionHref(conflictSku)} className="font-mono underline underline-offset-2">
                Open {conflictSku}
              </Link>
            ) : conflictSku ? (
              <p className="font-mono">{conflictSku}</p>
            ) : null}
          </div>
        ) : null}
        <Button
          variant="primary"
          size="lg"
          className="w-full rounded-mode"
          disabled={changed.length === 0 || problem != null}
          loading={saving}
          onClick={() => onSave(draft, changed)}
        >
          {saving ? 'Saving' : changed.length ? `Save — ${changed.join(', ')}` : 'No changes'}
        </Button>
      </ModeRegion>
    </BottomSheet>
  );
}
