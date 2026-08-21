'use client';

import { useCallback, useState } from 'react';
import { Loader2, Pencil, Plus, Trash2 } from '@/components/Icons';
import { Panel, Button, IconButton } from '@/design-system/primitives';
import { microBadge } from '@/design-system/tokens/typography/presets';
import type { QcCheckTemplateRow } from '@/lib/neon/sku-catalog-queries';

const STEP_TYPES = ['PASS_FAIL', 'NUMERIC', 'TEXT', 'VISUAL', 'MEASUREMENT'] as const;

interface MobileQcChecksCrudProps {
  catalogId: number;
  qcChecks: QcCheckTemplateRow[];
  canManage: boolean;
  onRefresh: () => void;
}

/**
 * Phone-tuned QC checklist CRUD. Core fields only (label, type, publish);
 * structured value bands stay on desktop QcChecklistSection.
 */
export function MobileQcChecksCrud({
  catalogId,
  qcChecks,
  canManage,
  onRefresh,
}: MobileQcChecksCrudProps) {
  const [showAdd, setShowAdd] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [stepLabel, setStepLabel] = useState('');
  const [stepType, setStepType] = useState<string>('PASS_FAIL');
  const [saving, setSaving] = useState(false);
  const [removing, setRemoving] = useState<number | null>(null);
  const [publishing, setPublishing] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const resetForm = () => {
    setStepLabel('');
    setStepType('PASS_FAIL');
    setShowAdd(false);
    setEditingId(null);
    setError(null);
  };

  const openEdit = (check: QcCheckTemplateRow) => {
    setEditingId(check.id);
    setStepLabel(check.step_label);
    setStepType(check.step_type || 'PASS_FAIL');
    setShowAdd(true);
    setError(null);
  };

  const handleSave = useCallback(async () => {
    if (!stepLabel.trim() || !canManage) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/sku-catalog/${catalogId}/qc-checks`, {
        method: editingId ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(
          editingId
            ? { checkId: editingId, stepLabel: stepLabel.trim(), stepType }
            : { stepLabel: stepLabel.trim(), stepType, sortOrder: qcChecks.length },
        ),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || json?.success === false) {
        throw new Error(json?.error || `Save failed (${res.status})`);
      }
      resetForm();
      onRefresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }, [canManage, catalogId, stepLabel, stepType, editingId, qcChecks.length, onRefresh]);

  const togglePublish = useCallback(
    async (check: QcCheckTemplateRow) => {
      if (!canManage) return;
      const next = (check.status ?? 'published') === 'published' ? 'draft' : 'published';
      setPublishing(check.id);
      setError(null);
      try {
        const res = await fetch(`/api/sku-catalog/${catalogId}/qc-checks`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ checkId: check.id, status: next }),
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok || json?.success === false) {
          throw new Error(json?.error || `Update failed (${res.status})`);
        }
        onRefresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Update failed');
      } finally {
        setPublishing(null);
      }
    },
    [canManage, catalogId, onRefresh],
  );

  const handleRemove = useCallback(
    async (checkId: number) => {
      if (!canManage) return;
      setRemoving(checkId);
      setError(null);
      try {
        const res = await fetch(`/api/sku-catalog/${catalogId}/qc-checks`, {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ checkId }),
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok || json?.success === false) {
          throw new Error(json?.error || `Delete failed (${res.status})`);
        }
        resetForm();
        onRefresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Delete failed');
      } finally {
        setRemoving(null);
      }
    },
    [canManage, catalogId, onRefresh],
  );

  return (
    <div className="space-y-3">
      {qcChecks.length === 0 && !showAdd && (
        <p className="px-1 text-role-caption font-medium text-text-soft">
          No verify steps yet. Add the QC checks a packer or tech should run.
        </p>
      )}

      <ul className="space-y-2">
        {qcChecks.map((check, idx) => {
          const isDraft = (check.status ?? 'published') === 'draft';
          return (
            <li
              key={check.id}
              className={`flex items-start gap-2 rounded-none px-3 py-3 ${
                isDraft ? 'bg-amber-50/70 ring-1 ring-amber-100' : 'bg-surface-canvas'
              }`}
            >
              <span className="mt-0.5 w-5 shrink-0 text-center text-role-micro tabular-nums text-text-faint">
                {idx + 1}
              </span>
              <div className="min-w-0 flex-1">
                <p className={`text-role-body font-semibold ${isDraft ? 'text-text-soft' : 'text-text-default'}`}>
                  {check.step_label}
                </p>
                <div className="mt-1 flex flex-wrap items-center gap-1.5">
                  <span className={`rounded-full border border-border-soft bg-surface-card px-1.5 py-0.5 text-text-soft ${microBadge}`}>
                    {check.step_type}
                  </span>
                  {isDraft && (
                    <span className={`rounded-full border border-amber-200 bg-amber-50 px-1.5 py-0.5 text-amber-700 ${microBadge}`}>
                      DRAFT
                    </span>
                  )}
                </div>
              </div>
              {canManage && (
                <div className="flex shrink-0 flex-col items-end gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => togglePublish(check)}
                    disabled={publishing === check.id}
                    className="h-8 px-2 text-role-micro uppercase tracking-wider"
                  >
                    {publishing === check.id ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : isDraft ? (
                      'Publish'
                    ) : (
                      'Unpublish'
                    )}
                  </Button>
                  <div className="flex gap-1">
                    <IconButton
                      icon={<Pencil className="h-4 w-4" />}
                      ariaLabel="Edit step"
                      tone="accent"
                      onClick={() => openEdit(check)}
                      className="h-10 w-10 rounded-none text-text-muted"
                    />
                    <IconButton
                      icon={
                        removing === check.id ? (
                          <Loader2 className="h-4 w-4 animate-spin text-red-600" />
                        ) : (
                          <Trash2 className="h-4 w-4 text-red-600" />
                        )
                      }
                      ariaLabel="Delete step"
                      onClick={() => handleRemove(check.id)}
                      disabled={removing === check.id}
                      className="h-10 w-10 rounded-none"
                    />
                  </div>
                </div>
              )}
            </li>
          );
        })}
      </ul>

      {showAdd && canManage && (
        <Panel radius="2xl" padding="sm" className="space-y-2">
          <input
            type="text"
            value={stepLabel}
            onChange={(e) => setStepLabel(e.target.value)}
            placeholder="Step label (e.g. Power on test)"
            className="w-full rounded-none border border-border-soft bg-surface-canvas px-3 py-2.5 text-role-body font-semibold text-text-default placeholder:text-text-faint"
            autoFocus
          />
          <select
            value={stepType}
            onChange={(e) => setStepType(e.target.value)}
            aria-label="Step type"
            className="w-full rounded-none border border-border-soft bg-surface-canvas px-3 py-2.5 text-role-caption font-semibold text-text-default"
          >
            {STEP_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
          {error && <p className="text-role-caption font-semibold text-red-600">{error}</p>}
          <div className="flex gap-2">
            <Button
              variant="brand"
              size="sm"
              loading={saving}
              disabled={saving || !stepLabel.trim()}
              onClick={handleSave}
              className="flex-1"
            >
              {editingId ? 'Update' : 'Add step'}
            </Button>
            <Button variant="secondary" size="sm" onClick={resetForm}>
              Cancel
            </Button>
          </div>
        </Panel>
      )}

      {canManage && !showAdd && (
        <Button
          variant="ghost"
          size="sm"
          icon={<Plus className="h-4 w-4" />}
          onClick={() => {
            resetForm();
            setShowAdd(true);
          }}
          className="text-text-muted"
        >
          Add QC step
        </Button>
      )}

      {!canManage && qcChecks.length > 0 && (
        <p className="px-1 text-role-micro font-semibold text-text-faint">
          View only — need catalog manage to edit.
        </p>
      )}
    </div>
  );
}
