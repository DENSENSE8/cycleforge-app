'use client';

/**
 * Products › Add product — one item into the catalog, the SKU identity source
 * of truth (`POST /api/sku-catalog`). The identity an item needs everywhere:
 * SKU and title (required), UPC / EAN barcodes, category, photo, and its Zoho
 * item id (kept in `catalog_external_ids`, never the key). A 1–4 digit SKU is
 * saved with its leading zeros (`1113` → `01113`), the import's rule.
 */

import { useState, type FormEvent } from 'react';
import { DeskStageOverlay } from '@/design-system/components/DeskStageOverlay';
import { Button } from '@/design-system/primitives/Button';
import { TextField } from '@/design-system/primitives/TextField';
import { EvidenceNotice } from '@/design-system/components/record-ledger/RecordEvidence';
import { safeRandomUUID } from '@/lib/safe-uuid';
import { toast } from '@/lib/toast';

interface Draft {
  sku: string;
  productTitle: string;
  upc: string;
  ean: string;
  category: string;
  imageUrl: string;
  zohoItemId: string;
}

const EMPTY: Draft = { sku: '', productTitle: '', upc: '', ean: '', category: '', imageUrl: '', zohoItemId: '' };

const FIELDS: readonly { key: keyof Draft; label: string; mono?: boolean; required?: boolean }[] = [
  { key: 'sku', label: 'SKU', mono: true, required: true },
  { key: 'productTitle', label: 'Product title', required: true },
  { key: 'upc', label: 'UPC', mono: true },
  { key: 'ean', label: 'EAN', mono: true },
  { key: 'category', label: 'Category' },
  { key: 'imageUrl', label: 'Photo URL' },
  { key: 'zohoItemId', label: 'Zoho item id', mono: true },
];

function AddProductForm({ onAdded }: { onAdded: (sku: string) => void }) {
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ready = draft.sku.trim() !== '' && draft.productTitle.trim() !== '';

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!ready || saving) return;
    setSaving(true);
    setError(null);
    const body: Record<string, string> = {};
    for (const [key, value] of Object.entries(draft)) if (value.trim()) body[key] = value.trim();
    try {
      const res = await fetch('/api/sku-catalog', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'idempotency-key': safeRandomUUID() },
        body: JSON.stringify(body),
      });
      const json = (await res.json().catch(() => ({}))) as { catalog?: { sku?: string }; error?: string; message?: string };
      if (!res.ok || !json.catalog?.sku) throw new Error(json.error || json.message || `Could not add the product (HTTP ${res.status})`);
      const saved = json.catalog.sku;
      toast.success(saved === draft.sku.trim() ? `Added SKU ${saved}` : `Added SKU ${saved} (leading zeros restored)`);
      onAdded(saved);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not add the product');
    } finally {
      setSaving(false);
    }
  };

  return (
    <form className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-4 py-3" onSubmit={submit} data-testid="add-product-form">
      {FIELDS.map((field) => (
        <TextField
          key={field.key}
          label={field.required ? `${field.label} *` : field.label}
          value={draft[field.key]}
          onChange={(value) => setDraft((current) => ({ ...current, [field.key]: value }))}
          mono={field.mono}
          autoFocus={field.key === 'sku'}
          data-testid={`add-product-${field.key}`}
        />
      ))}
      <p className="text-role-caption text-mode-muted">A SKU of 1–4 digits is saved with its leading zeros (1113 → 01113).</p>
      {error ? <EvidenceNotice tone="warn">{error}</EvidenceNotice> : null}
      <div className="flex justify-end">
        <Button type="submit" variant="ink" size="sm" disabled={!ready} loading={saving} data-testid="add-product-submit">
          Add product
        </Button>
      </div>
    </form>
  );
}

export function AddProductOverlay({ open, onClose, onAdded }: { open: boolean; onClose: () => void; onAdded: (sku: string) => void }) {
  return (
    <DeskStageOverlay open={open} onClose={onClose} title="Add product" subtitle="Into the catalog" fill="inset" testId="add-product">
      {open ? <AddProductForm onAdded={onAdded} /> : null}
    </DeskStageOverlay>
  );
}
