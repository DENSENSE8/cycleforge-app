'use client';

import { useState } from 'react';
import { Check, Loader2, Pencil, X } from '@/components/Icons';
import { Button, IconButton, TextField } from '@/design-system/primitives';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import { useAuth } from '@/contexts/AuthContext';
import { classifyGtinEntry, isRestrictedCirculationGtin } from '@/lib/interop/gs1-keys';

interface ProductGtinFieldProps {
  /** `sku_catalog.id` — the PATCH target. */
  catalogId: number;
  /** Current stored value; may be an internally-minted number or absent. */
  gtin: string | null;
  /** Called with the stored value after a successful write (`null` = cleared). */
  onSaved: (next: string | null) => void;
}

/** The GTIN row on the product record — read, and (with `sku_stock.manage`) edit. */
export function ProductGtinField({ catalogId, gtin, onSaved }: ProductGtinFieldProps) {
  const { has } = useAuth();
  const canManage = has('sku_stock.manage');

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const isInternal = isRestrictedCirculationGtin(gtin);

  const open = () => {
    // Seed empty when the stored value is machine-minted: the operator is here
    // to type the number they licensed, not to edit ours.
    setDraft(isInternal ? '' : (gtin ?? ''));
    setError(null);
    setEditing(true);
  };

  const cancel = () => {
    setEditing(false);
    setError(null);
  };

  const save = async () => {
    const trimmed = draft.trim();
    let next: string | null = null;

    if (trimmed) {
      const verdict = classifyGtinEntry(trimmed);
      if (!verdict.ok) {
        setError(verdict.message);
        return;
      }
      next = verdict.digits;
    }

    // Nothing typed and nothing stored — an empty save would be a no-op write.
    if (next === null && !gtin) {
      cancel();
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/sku-catalog/${catalogId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ gtin: next }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok || !body?.success) {
        throw new Error(body?.error || `Save failed (${res.status})`);
      }
      onSaved(next);
      setEditing(false);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  if (!editing) {
    return (
      <div className="flex items-baseline gap-2 text-xs">
        <span className="w-28 shrink-0 text-text-soft">GTIN</span>
        <span className="flex min-w-0 flex-1 items-baseline gap-2">
          <span
            className={`truncate font-mono ${gtin ? 'text-text-default' : 'text-text-faint'}`}
          >
            {gtin || '—'}
          </span>
          {isInternal ? (
            <HoverTooltip label="Assigned by Cycle Forge for internal labels — not a GS1 key you licensed, and never sent to a trading partner.">
              <span className="inset-chip shrink-0 rounded bg-surface-sunken text-role-micro uppercase tracking-widest text-text-soft ring-1 ring-inset ring-border-soft">
                Internal
              </span>
            </HoverTooltip>
          ) : null}
        </span>
        {canManage ? (
          <HoverTooltip label={isInternal ? 'Enter a licensed GTIN' : 'Edit GTIN'} focusable={false}>
            <IconButton
              size="xs"
              ariaLabel={isInternal ? 'Enter a licensed GTIN' : 'Edit GTIN'}
              onClick={open}
              icon={<Pencil className="h-3.5 w-3.5" />}
            />
          </HoverTooltip>
        ) : null}
      </div>
    );
  }

  return (
    <div className="space-y-1.5">
      <div className="flex items-start gap-2">
        <TextField
          label="GTIN"
          value={draft}
          onChange={(v) => {
            setDraft(v);
            setError(null);
          }}
          mono
          inputMode="numeric"
          autoFocus
          className="flex-1"
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              void save();
            }
            if (e.key === 'Escape') {
              e.preventDefault();
              cancel();
            }
          }}
        />
        <div className="flex shrink-0 items-center gap-1 pt-1.5">
          <Button size="sm" onClick={() => void save()} disabled={saving}>
            {saving ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Check className="h-3.5 w-3.5" />
            )}
            Save
          </Button>
          <IconButton
            size="xs"
            ariaLabel="Cancel"
            onClick={cancel}
            disabled={saving}
            icon={<X className="h-3.5 w-3.5" />}
          />
        </div>
      </div>
      {error ? (
        <p className="text-role-micro text-text-danger">{error}</p>
      ) : (
        <p className="text-role-micro text-text-soft">
          {gtin
            ? 'Leave blank and save to clear it back to the internal number.'
            : 'The GTIN you licensed from GS1 — 8, 12, 13 or 14 digits.'}
        </p>
      )}
    </div>
  );
}
