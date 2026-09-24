'use client';

import { useEffect, useState } from 'react';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { Button } from '@/design-system/primitives';
import { TextField } from '@/design-system/primitives/TextField';
import { ModeRegion } from '@/design-system/providers/ModeRegion';
import type { ProvisionalSku } from '@/lib/neon/provisional-sku-queries';

export interface SkuExceptionDraft {
  productTitle: string;
  description: string;
}

const TITLE_MIN = 2;
const TITLE_MAX = 200;
const DESCRIPTION_MAX = 2000;

/**
 * The one edit of a SKU exception, opened from the pencil on `/info`. The
 * sheet owns only the draft; the page owns the write and its acknowledgement
 * (same split as `RepairInfoEditSheet`).
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
  error: string | null;
  onSave: (draft: SkuExceptionDraft, changed: string[]) => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState<SkuExceptionDraft>({ productTitle: '', description: '' });

  // Re-seed on open so a cancelled edit never survives a close.
  useEffect(() => {
    if (open) setDraft({ productTitle: item.productTitle, description: item.description ?? '' });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- seed on open only; a live refetch must not wipe typing
  }, [open]);

  const title = draft.productTitle.trim();
  const changed = [
    title !== item.productTitle ? 'title' : null,
    draft.description.trim() !== (item.description ?? '').trim() ? 'description' : null,
  ].filter((c): c is string => c != null);
  const problem =
    title.length < TITLE_MIN
      ? `The title needs at least ${TITLE_MIN} characters.`
      : title.length > TITLE_MAX
        ? `The title is limited to ${TITLE_MAX} characters.`
        : draft.description.length > DESCRIPTION_MAX
          ? `The description is limited to ${DESCRIPTION_MAX} characters.`
          : null;

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
        {error || problem ? (
          <p
            role="alert"
            className="rounded-mode border border-rose-200 bg-rose-50 px-mode-page py-2.5 text-role-caption font-semibold text-rose-700"
          >
            {error ?? problem}
          </p>
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
