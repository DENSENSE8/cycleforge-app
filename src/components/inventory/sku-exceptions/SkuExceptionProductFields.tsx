'use client';

/**
 * Product section — the title and description typed on the phone, editable
 * here, plus the facts the phone captured (barcode, who, when).
 *
 * A field that has not been touched shows the SERVER value, so a phone edit
 * landing through realtime repaints it; once touched it holds the draft until
 * Save or Revert.
 */

import { useState } from 'react';
import { format } from 'date-fns';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/design-system/primitives/Button';
import { CopyChip } from '@/components/ui/CopyChip';
import { triagePanelControl } from '@/design-system/tokens/triage-panel';
import type { ProvisionalSkuDetail } from '@/lib/neon/provisional-sku-queries';
import { toast } from '@/lib/toast';

const TITLE_MIN = 2;
const TITLE_MAX = 200;
const DESCRIPTION_MAX = 2000;

export function SkuExceptionProductFields({
  fieldId,
  item,
  onSaved,
}: {
  fieldId: string;
  item: ProvisionalSkuDetail;
  onSaved: () => Promise<void>;
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

  const created = item.createdAt ? new Date(item.createdAt) : null;
  const createdFace =
    created && !Number.isNaN(created.getTime()) ? format(created, 'MMM d · h:mm a') : null;

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
      await onSaved();
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
    <div className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor={`${fieldId}-title`}>Product title</Label>
        <Input
          id={`${fieldId}-title`}
          value={title}
          maxLength={TITLE_MAX}
          onChange={(e) => setTitleDraft(e.target.value)}
          aria-invalid={titleInvalid || undefined}
          className={triagePanelControl()}
          data-testid="sku-exception-title"
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor={`${fieldId}-description`}>Description</Label>
        <Textarea
          id={`${fieldId}-description`}
          value={description}
          maxLength={DESCRIPTION_MAX}
          rows={4}
          onChange={(e) => setDescriptionDraft(e.target.value)}
          placeholder="Condition, markings, what's in the box…"
          data-testid="sku-exception-description"
        />
      </div>
      <dl className="grid grid-cols-[auto_1fr] items-center gap-x-4 gap-y-2 text-role-caption">
        <dt className="text-text-soft">Barcode</dt>
        <dd className="min-w-0">
          <CopyChip value={item.barcode} display={item.barcode} tone="id" fitDisplayWidth />
        </dd>
        <dt className="text-text-soft">Created</dt>
        <dd className="text-text-default">
          {[item.createdByName, createdFace].filter(Boolean).join(' · ') || '—'}
        </dd>
      </dl>
      <div className="flex items-center justify-end gap-2">
        <span role="status" aria-live="polite" className="mr-auto text-role-caption text-text-soft">
          {titleInvalid
            ? `Title needs ${TITLE_MIN}–${TITLE_MAX} characters`
            : titleChanged || descriptionChanged
              ? 'Unsaved changes'
              : 'Up to date'}
        </span>
        <Button
          variant="ghost"
          size="sm"
          disabled={saving || (titleDraft === null && descriptionDraft === null)}
          onClick={() => {
            setTitleDraft(null);
            setDescriptionDraft(null);
          }}
        >
          Revert
        </Button>
        <Button
          variant="primary"
          size="sm"
          disabled={!canSave}
          loading={saving}
          onClick={() => void save()}
          data-testid="sku-exception-save"
        >
          {saving ? 'Saving…' : 'Save'}
        </Button>
      </div>
    </div>
  );
}
