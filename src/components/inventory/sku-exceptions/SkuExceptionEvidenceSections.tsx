'use client';

/** SKU exception record groups — Product (title + description) and the Barcode fact (attach one to a placeholder created without). Its locations are the stock record's own `StockLocationsGroup`. */

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { CopyChip } from '@/components/ui/CopyChip';
import { EVIDENCE_CONTROL_CLASS } from '@/design-system/components/record-ledger/RecordEvidence';
import { RecordGroup } from '@/design-system/components/record-ledger/RecordGroup';
import { Button } from '@/design-system/primitives';
import { TextField } from '@/design-system/primitives/TextField';
import { useUIModeOptional } from '@/design-system/providers/UIModeProvider';
import { RECORD_ID_CLASS } from '@/design-system/tokens/record';
import { SKU_EXCEPTIONS_PATH } from '@/lib/inventory/sku-exception-links';
import type { ProvisionalSkuDetail } from '@/lib/neon/provisional-sku-queries';
import { toast } from '@/lib/toast';
import { cn } from '@/utils/_cn';

const TITLE_MIN = 2;
const TITLE_MAX = 200;
const DESCRIPTION_MAX = 2000;

type OnChanged = () => Promise<void>;

// ── Product ─────────────────────────────────────────────────────────────────

/**
 * The title and description typed on the phone, editable here as the house
 * floating-label fields (owner 2026-10-05). Edits save themselves; the card
 * speaks only while saving or when the title is out of range. An untouched
 * field shows the SERVER value, so a phone edit landing through realtime
 * repaints it; once touched it holds the draft until it saves.
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
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not save.');
    } finally {
      setSaving(false);
    }
  };

  useEffect(() => {
    if (!canSave) return;
    const timer = window.setTimeout(() => void save(), 700);
    return () => window.clearTimeout(timer);
  }, [canSave, title, description]);

  return (
    <RecordGroup
      title="Product"
      titleHidden
      testId="sku-exception-product"
      action={saving ? <span className="text-role-caption text-mode-muted" data-testid="sku-exception-saving">Saving…</span> : undefined}
    >
      <div className="flex flex-col gap-3 px-4 pb-4 pt-2">
        <TextField
          id={`${fieldId}-title`}
          label="Title"
          value={title}
          maxLength={TITLE_MAX}
          onChange={setTitleDraft}
          aria-invalid={titleInvalid || undefined}
          data-testid="sku-exception-title"
        />
        <TextField
          id={`${fieldId}-description`}
          label="Description"
          multiline
          rows={4}
          value={description}
          maxLength={DESCRIPTION_MAX}
          onChange={setDescriptionDraft}
          data-testid="sku-exception-description"
        />
        {titleInvalid ? (
          <p role="status" className="text-role-caption text-text-warning">
            Title needs {TITLE_MIN}–{TITLE_MAX} characters
          </p>
        ) : null}
      </div>
    </RecordGroup>
  );
}

// ── Barcode ─────────────────────────────────────────────────────────────────

interface BarcodeConflict {
  message: string;
  reason: string | null;
  conflictSku: string | null;
}

/** The Barcode fact's value. */
export function SkuExceptionBarcodeValue({
  fieldId,
  item,
  onChanged,
}: {
  fieldId: string;
  item: ProvisionalSkuDetail;
  onChanged: OnChanged;
}) {
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [conflict, setConflict] = useState<BarcodeConflict | null>(null);
  const { isMobile } = useUIModeOptional();

  if (item.barcode) {
    return <CopyChip value={item.barcode} display={item.barcode} tone="id" fitDisplayWidth />;
  }

  const barcode = draft.trim();
  const attach = async () => {
    if (!barcode || busy) return;
    setBusy(true);
    setConflict(null);
    try {
      const res = await fetch(`/api/sku-catalog/provisional/${encodeURIComponent(item.sku)}`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ barcode }),
      });
      const data = (await res.json().catch(() => null)) as {
        success?: boolean;
        error?: string;
        reason?: string;
        conflictSku?: string | null;
      } | null;
      if (!res.ok || !data?.success) {
        setConflict({
          message: data?.error || `Attach failed (${res.status})`,
          reason: data?.reason ?? null,
          conflictSku: data?.conflictSku ?? null,
        });
        return;
      }
      await onChanged();
      setDraft('');
      toast.success(`Barcode ${barcode} attached`, { id: `sku-exception-barcode-${item.sku}` });
    } catch (err) {
      setConflict({ message: err instanceof Error ? err.message : 'Could not attach.', reason: null, conflictSku: null });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex w-full flex-col gap-1.5 pt-1" data-testid="sku-exception-barcode-attach">
      <div className="flex items-center gap-2">
        <input
          id={`${fieldId}-barcode`}
          value={draft}
          maxLength={64}
          onChange={(event) => {
            setDraft(event.target.value);
            setConflict(null);
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter') void attach();
          }}
          placeholder="Scan or type barcode"
          aria-label="Barcode to attach"
          aria-invalid={conflict ? true : undefined}
          autoComplete="off"
          spellCheck={false}
          className={cn(EVIDENCE_CONTROL_CLASS, RECORD_ID_CLASS, 'min-w-0 flex-1')}
          data-testid="sku-exception-barcode-input"
        />
        <Button
          variant="ink"
          size={isMobile ? 'lg' : 'sm'}
          disabled={!barcode}
          loading={busy}
          onClick={() => void attach()}
          data-testid="sku-exception-barcode-attach-submit"
        >
          Attach
        </Button>
      </div>
      {conflict ? (
        <p role="alert" className="text-role-caption text-mode-warn" data-testid="sku-exception-barcode-conflict">
          {conflict.message}
          {conflict.conflictSku ? (
            <>
              {' · '}
              <Link
                href={
                  conflict.reason === 'barcode-taken'
                    ? `${SKU_EXCEPTIONS_PATH}?sku=${encodeURIComponent(conflict.conflictSku)}`
                    : `/inventory/sku/${encodeURIComponent(conflict.conflictSku)}`
                }
                className="font-mono font-bold underline underline-offset-2"
              >
                Open {conflict.conflictSku}
              </Link>
            </>
          ) : null}
        </p>
      ) : null}
    </div>
  );
}
