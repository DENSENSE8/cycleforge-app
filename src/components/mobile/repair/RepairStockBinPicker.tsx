'use client';

import { useEffect, useState } from 'react';
import { focusRing } from '@/design-system/tokens/focus-ring';
import { binsMostStockFirst, stockBinLabel, type StockBinOption } from '@/lib/repair/repair-stock-take';
import { cn } from '@/utils/_cn';

/** `GET /api/sku-stock/[sku]/bins` row — only what the picker reads. */
interface SkuBinRow {
  location: {
    id: number;
    name: string;
    room: string | null;
    rowLabel: string | null;
    colLabel: string | null;
    barcode: string | null;
  };
  qty: number;
}

interface BinOption extends StockBinOption {
  where: string | null;
}

type LoadState =
  | { kind: 'loading' }
  | { kind: 'ok'; bins: BinOption[] }
  | { kind: 'error'; message: string };

/**
 * Which bin the installed part is taken from (operator 2026-09-24:
 * Which bin the installed part is taken from (operator 2026-09-24: stock is
 */
export function RepairStockBinPicker({
  sku,
  value,
  onChange,
  disabled = false,
}: {
  sku: string;
  value: number | null;
  onChange: (locationId: number | null) => void;
  disabled?: boolean;
}) {
  const [state, setState] = useState<LoadState>({ kind: 'loading' });

  useEffect(() => {
    const ctrl = new AbortController();
    setState({ kind: 'loading' });
    (async () => {
      try {
        const res = await fetch(`/api/sku-stock/${encodeURIComponent(sku)}/bins`, {
          cache: 'no-store',
          signal: ctrl.signal,
        });
        const body = (await res.json().catch(() => null)) as { bins?: SkuBinRow[]; error?: string } | null;
        if (res.status === 403) throw new Error('You can’t see stock bins — ask a lead to take it from stock.');
        if (!res.ok || !body) throw new Error(body?.error || `HTTP ${res.status}`);
        const bins = (body.bins ?? []).map((b) => ({
          locationId: b.location.id,
          label: stockBinLabel({ id: b.location.id, name: b.location.name, barcode: b.location.barcode }),
          qty: b.qty,
          where: [b.location.room, b.location.rowLabel, b.location.colLabel].filter(Boolean).join(' · ') || null,
        }));
        setState({ kind: 'ok', bins: binsMostStockFirst(bins) });
      } catch (err) {
        if (ctrl.signal.aborted) return;
        setState({ kind: 'error', message: err instanceof Error ? err.message : 'Could not load bins' });
      }
    })();
    return () => ctrl.abort();
  }, [sku]);

  return (
    <div role="radiogroup" aria-label={`Bin to take ${sku} from`} className="space-y-2" data-testid="stock-bin-picker">
      <p className="text-role-caption font-semibold text-mode-muted">Take it from which bin?</p>
      {state.kind === 'loading' ? <p className="text-role-caption text-mode-muted">Finding bins…</p> : null}
      {state.kind === 'error' ? (
        <p role="alert" className="text-role-caption font-semibold text-rose-700">
          {state.message}
        </p>
      ) : null}
      {state.kind === 'ok' && state.bins.length === 0 ? (
        <p className="text-role-caption text-mode-muted">
          No bin holds {sku}. Count it into a bin first, or untick “Take from stock”.
        </p>
      ) : null}
      {state.kind === 'ok'
        ? state.bins.map((bin) => {
            const selected = value === bin.locationId;
            return (
              // ds-raw-button: radio row (bin + on-shelf count, selected state + role=radio), not a standard action button
              <button
                key={bin.locationId}
                type="button"
                role="radio"
                aria-checked={selected}
                disabled={disabled}
                onClick={() => onChange(selected ? null : bin.locationId)}
                className={cn(
                  'flex min-h-mode-hit w-full items-center justify-between gap-3 rounded-mode border px-3 text-left',
                  selected
                    ? 'border-mode-ink bg-mode-ink text-mode-bar'
                    : 'border-mode-control bg-mode-panel text-mode-ink active:bg-mode-hover',
                  focusRing('field', 'accent'),
                )}
              >
                <span className="min-w-0">
                  <span className="block truncate font-mono text-role-body font-semibold">{bin.label}</span>
                  {bin.where ? (
                    <span className={cn('block truncate text-role-caption', selected ? 'text-mode-bar' : 'text-mode-muted')}>
                      {bin.where}
                    </span>
                  ) : null}
                </span>
                <span className="shrink-0 text-role-caption font-semibold tabular-nums">{bin.qty} on shelf</span>
              </button>
            );
          })
        : null}
    </div>
  );
}
