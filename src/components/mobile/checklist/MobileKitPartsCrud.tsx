'use client';

import { useCallback, useState } from 'react';
import { Loader2, Pencil, Plus, Trash2 } from '@/components/Icons';
import { Button, IconButton } from '@/design-system/primitives';
import { microBadge } from '@/design-system/tokens/typography/presets';
import { KIT_PART_TYPES } from '@/lib/schemas/kit-parts';
import type { SkuKitPartRow } from '@/lib/neon/sku-catalog-queries';

interface MobileKitPartsCrudProps {
  catalogId: number;
  kitParts: SkuKitPartRow[];
  canManage: boolean;
  onRefresh: () => void;
}

/**
 * Phone-tuned kit-parts CRUD. Same API bodies as KitPartsSection; always-visible
 * edit/delete affordances (no hover). Document/insert fields stay on desktop.
 */
export function MobileKitPartsCrud({
  catalogId,
  kitParts,
  canManage,
  onRefresh,
}: MobileKitPartsCrudProps) {
  const [showAdd, setShowAdd] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [componentName, setComponentName] = useState('');
  const [componentType, setComponentType] = useState('PART');
  const [qtyRequired, setQtyRequired] = useState('1');
  const [isCritical, setIsCritical] = useState(true);
  const [saving, setSaving] = useState(false);
  const [removing, setRemoving] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const resetForm = () => {
    setComponentName('');
    setComponentType('PART');
    setQtyRequired('1');
    setIsCritical(true);
    setShowAdd(false);
    setEditingId(null);
    setError(null);
  };

  const openEdit = (part: SkuKitPartRow) => {
    setEditingId(part.id);
    setComponentName(part.component_name);
    setComponentType(part.component_type);
    setQtyRequired(String(part.qty_required));
    setIsCritical(part.is_critical);
    setShowAdd(true);
    setError(null);
  };

  const handleSave = useCallback(async () => {
    if (!componentName.trim() || !canManage) return;
    setSaving(true);
    setError(null);
    try {
      const qty = Number(qtyRequired);
      const body = {
        componentName: componentName.trim(),
        componentType,
        qtyRequired: Number.isFinite(qty) && qty >= 1 ? Math.floor(qty) : 1,
        isCritical,
      };
      const res = await fetch(`/api/sku-catalog/${catalogId}/kit-parts`, {
        method: editingId ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(
          editingId
            ? { partId: editingId, ...body }
            : { ...body, sortOrder: kitParts.length },
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
  }, [
    canManage,
    catalogId,
    componentName,
    componentType,
    qtyRequired,
    isCritical,
    editingId,
    kitParts.length,
    onRefresh,
  ]);

  const handleRemove = useCallback(
    async (partId: number) => {
      if (!canManage) return;
      setRemoving(partId);
      setError(null);
      try {
        const res = await fetch(`/api/sku-catalog/${catalogId}/kit-parts`, {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ partId }),
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
      {kitParts.length === 0 && !showAdd && (
        <p className="px-1 text-role-caption font-medium text-text-soft">
          Nothing in the box yet. Add the parts a packer should include.
        </p>
      )}

      <ul className="space-y-2">
        {kitParts.map((part, idx) => (
          <li
            key={part.id}
            className="flex items-start gap-2 rounded-2xl bg-surface-canvas px-3 py-3"
          >
            <span className="mt-0.5 w-5 shrink-0 text-center text-role-micro tabular-nums text-text-faint">
              {idx + 1}
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-role-body font-semibold text-text-default">{part.component_name}</p>
              <div className="mt-1 flex flex-wrap items-center gap-1.5">
                <span className={`rounded-full border border-border-soft bg-surface-card px-1.5 py-0.5 text-text-soft ${microBadge}`}>
                  {part.component_type}
                </span>
                {part.qty_required > 1 && (
                  <span className={`rounded-full border border-border-soft bg-surface-card px-1.5 py-0.5 text-text-soft ${microBadge}`}>
                    ×{part.qty_required}
                  </span>
                )}
                {part.is_critical && (
                  <span className={`rounded-full border border-amber-200 bg-amber-50 px-1.5 py-0.5 text-amber-700 ${microBadge}`}>
                    REQUIRED
                  </span>
                )}
              </div>
            </div>
            {canManage && (
              <div className="flex shrink-0 items-center gap-1">
                <IconButton
                  icon={<Pencil className="h-4 w-4" />}
                  ariaLabel="Edit part"
                  tone="accent"
                  onClick={() => openEdit(part)}
                  className="h-10 w-10 rounded-xl text-text-muted"
                />
                <IconButton
                  icon={
                    removing === part.id ? (
                      <Loader2 className="h-4 w-4 animate-spin text-red-600" />
                    ) : (
                      <Trash2 className="h-4 w-4 text-red-600" />
                    )
                  }
                  ariaLabel="Delete part"
                  onClick={() => handleRemove(part.id)}
                  disabled={removing === part.id}
                  className="h-10 w-10 rounded-xl"
                />
              </div>
            )}
          </li>
        ))}
      </ul>

      {showAdd && canManage && (
        <div className="space-y-2 rounded-2xl border border-border-soft bg-surface-card p-3">
          <input
            type="text"
            value={componentName}
            onChange={(e) => setComponentName(e.target.value)}
            placeholder="Item name (e.g. Power adapter)"
            className="w-full rounded-xl border border-border-soft bg-surface-canvas px-3 py-2.5 text-role-body font-semibold text-text-default placeholder:text-text-faint"
            autoFocus
          />
          <div className="flex gap-2">
            <select
              value={componentType}
              onChange={(e) => setComponentType(e.target.value)}
              aria-label="Component type"
              className="min-w-0 flex-1 rounded-xl border border-border-soft bg-surface-canvas px-3 py-2.5 text-role-caption font-semibold text-text-default"
            >
              {KIT_PART_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
            <input
              type="number"
              min={1}
              value={qtyRequired}
              onChange={(e) => setQtyRequired(e.target.value)}
              aria-label="Quantity"
              className="w-20 rounded-xl border border-border-soft bg-surface-canvas px-3 py-2.5 text-role-caption font-semibold text-text-default"
            />
          </div>
          <label className="flex items-center gap-2 px-0.5 text-role-caption font-semibold text-text-muted">
            <input
              type="checkbox"
              checked={isCritical}
              onChange={(e) => setIsCritical(e.target.checked)}
              className="h-4 w-4 rounded border-border-default text-blue-600"
            />
            Required in the box
          </label>
          {error && <p className="text-role-caption font-semibold text-red-600">{error}</p>}
          <div className="flex gap-2">
            <Button
              variant="brand"
              size="sm"
              loading={saving}
              disabled={saving || !componentName.trim()}
              onClick={handleSave}
              className="flex-1"
            >
              {editingId ? 'Update' : 'Add item'}
            </Button>
            <Button variant="secondary" size="sm" onClick={resetForm}>
              Cancel
            </Button>
          </div>
        </div>
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
          className="text-blue-600"
        >
          Add kit item
        </Button>
      )}

      {!canManage && kitParts.length > 0 && (
        <p className="px-1 text-role-micro font-semibold text-text-faint">
          View only — need catalog manage to edit.
        </p>
      )}
    </div>
  );
}
