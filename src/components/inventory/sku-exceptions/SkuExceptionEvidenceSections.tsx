'use client';

/** SKU exception record groups — Product (title + description) and the Barcode fact (attach one to a placeholder created without). Its locations are the stock record's own `StockLocationsGroup`. */

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { CopyChip } from '@/components/ui/CopyChip';
import { EVIDENCE_CONTROL_CLASS } from '@/design-system/components/record-ledger/RecordEvidence';
import { RecordGroup } from '@/design-system/components/record-ledger/RecordGroup';
import { Button } from '@/design-system/primitives';
import { useUIModeOptional } from '@/design-system/providers/UIModeProvider';
import { RECORD_ID_CLASS, RECORD_LABEL_CLASS } from '@/design-system/tokens/record';
import { SKU_EXCEPTIONS_PATH } from '@/lib/inventory/sku-exception-links';
import type { ProvisionalSkuDetail } from '@/lib/neon/provisional-sku-queries';
import { toast } from '@/lib/toast';
import { focusRing } from '@/design-system/tokens/focus-ring';
import { cn } from '@/utils/_cn';

const TITLE_MIN = 2;
const TITLE_MAX = 200;
const DESCRIPTION_MAX = 2000;
/** Description height: starts at ~4 lines, drags between one short line and most of a screen. */
const DESCRIPTION_DEFAULT_PX = 96;
const DESCRIPTION_MIN_PX = 72;
const DESCRIPTION_MAX_PX = 640;
const GRIP_KEY_STEP_PX = 24;

type OnChanged = () => Promise<void>;

/**
 * A full-width grip under a field: press and drag down to grow it, up to
 * shrink it (↑ / ↓ with the grip focused). The textarea's own corner handle
 * is too small to find (owner 2026-09-30).
 */
function DragResizeGrip({
  label,
  heightPx,
  onHeight,
  testId,
}: {
  label: string;
  heightPx: number;
  onHeight: (px: number) => void;
  testId?: string;
}) {
  const clamp = (px: number) => Math.min(DESCRIPTION_MAX_PX, Math.max(DESCRIPTION_MIN_PX, Math.round(px)));
  return (
    <div
      role="separator"
      aria-orientation="horizontal"
      aria-label={label}
      aria-valuemin={DESCRIPTION_MIN_PX}
      aria-valuemax={DESCRIPTION_MAX_PX}
      aria-valuenow={heightPx}
      tabIndex={0}
      title="Drag to resize"
      data-testid={testId}
      className={cn('group/grip -mt-1 flex h-4 w-full cursor-row-resize touch-none items-center justify-center rounded-mode', focusRing('control'))}
      onPointerDown={(event) => {
        event.preventDefault();
        const startY = event.clientY;
        const startPx = heightPx;
        const target = event.currentTarget;
        target.setPointerCapture(event.pointerId);
        const move = (e: PointerEvent) => onHeight(clamp(startPx + e.clientY - startY));
        const up = () => {
          target.removeEventListener('pointermove', move);
          target.removeEventListener('pointerup', up);
          target.removeEventListener('pointercancel', up);
        };
        target.addEventListener('pointermove', move);
        target.addEventListener('pointerup', up);
        target.addEventListener('pointercancel', up);
      }}
      onKeyDown={(event) => {
        if (event.key === 'ArrowDown') onHeight(clamp(heightPx + GRIP_KEY_STEP_PX));
        else if (event.key === 'ArrowUp') onHeight(clamp(heightPx - GRIP_KEY_STEP_PX));
        else return;
        event.preventDefault();
      }}
    >
      <span aria-hidden className="h-1 w-10 rounded-full bg-border-default transition-colors group-hover/grip:bg-border-emphasis" />
    </div>
  );
}

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
  const [descriptionPx, setDescriptionPx] = useState(DESCRIPTION_DEFAULT_PX);
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
      <div className="flex flex-col gap-2 px-4 pb-3 pt-1">
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
          onChange={(event) => setDescriptionDraft(event.target.value)}
          placeholder="Condition, markings, what's in the box…"
          className={cn(EVIDENCE_CONTROL_CLASS, 'w-full resize-none py-1.5')}
          style={{ height: descriptionPx }}
          data-testid="sku-exception-description"
        />
        <DragResizeGrip label="Resize description" heightPx={descriptionPx} onHeight={setDescriptionPx} testId="sku-exception-description-grip" />
        <div className="flex min-h-8 items-center gap-2">
          <span role="status" aria-live="polite" className="mr-auto text-role-caption text-mode-muted">
            {titleInvalid
              ? `Title needs ${TITLE_MIN}–${TITLE_MAX} characters`
              : titleChanged || descriptionChanged
                ? 'Unsaved changes'
                : 'Up to date'}
          </span>
          {dirty ? (
            <Button
              variant="ghost"
              size="sm"
              disabled={saving}
              onClick={() => {
                setTitleDraft(null);
                setDescriptionDraft(null);
              }}
            >
              Revert
            </Button>
          ) : null}
        </div>
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
      <span className="text-role-caption font-medium text-mode-warn">No barcode</span>
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
