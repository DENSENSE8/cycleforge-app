'use client';

/**
 * Incoming Import → Upload CSV — flush inspector (Amazon / Goodwill unfound fix).
 *
 * Accepts Cycle Forge desk CSV and native Amazon Manage Returns exports
 * (comma or tab). Tracking IDs register onto STN + inbound cartons so Unbox
 * can find the package. Catalog ASIN is enrichment, not a gate.
 *
 * Macro floor = Import CTA + `→|` close in one FlushTerminalFooter wrapper.
 */

import { useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { DetailStackRailRegistrar } from '@/components/right-rail/DetailStackRailRegistrar';
import { PaneHeaderCloseButton, PaneHeaderLabel } from '@/components/ui/pane-header';
import { Button, FlushTerminalFooter } from '@/design-system/primitives';
import { cornerClass } from '@/design-system/tokens/radius';
import { focusRing } from '@/design-system/tokens/focus-ring';
import {
  deskRowFromCsvRecord,
  isAmazonNativeReturnsRecord,
} from '@/lib/inbound/desk-csv';
import { invalidateReceivingFeeds } from '@/lib/queries/receiving-queries';
import { parseCsv } from '@/lib/tables/import/parse-csv';
import { toast } from '@/lib/toast';
import { cn } from '@/utils/_cn';

export function IncomingImportCsvOverlay({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [raw, setRaw] = useState('');
  const [fileName, setFileName] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const rows = useMemo(() => (raw.trim() ? parseCsv(raw).rows : []), [raw]);
  const amazonNative = useMemo(
    () => rows.length > 0 && isAmazonNativeReturnsRecord(rows[0]),
    [rows],
  );
  const preview = useMemo(
    () =>
      rows.slice(0, 8).map((r, i) => {
        try {
          const row = deskRowFromCsvRecord(r);
          return { i, ok: true as const, row };
        } catch (err) {
          return {
            i,
            ok: false as const,
            error: err instanceof Error ? err.message : 'invalid',
          };
        }
      }),
    [rows],
  );

  const canSubmit = rows.length > 0 && !submitting;

  const onFile = async (file: File | null) => {
    if (!file) return;
    setFileName(file.name);
    const text = await file.text();
    setRaw(text);
    setError(null);
  };

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch('/api/receiving/inbound/import-csv', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rows }),
      });
      const data = (await res.json().catch(() => null)) as {
        success?: boolean;
        error?: string;
        created?: number;
        updated?: number;
        skipped?: number;
        failed?: number;
      } | null;
      if (!res.ok) {
        throw new Error(data?.error || `Import failed (${res.status})`);
      }
      invalidateReceivingFeeds(queryClient);
      const created = data?.created ?? 0;
      const updated = data?.updated ?? 0;
      const skipped = data?.skipped ?? 0;
      const failed = data?.failed ?? 0;
      const parts: string[] = [];
      if (created > 0) parts.push(`${created} new`);
      if (updated > 0) parts.push(`${updated} refreshed`);
      if (skipped > 0) parts.push(`${skipped} skipped`);
      if (failed > 0) {
        toast.error(
          `Imported ${created + updated}${skipped ? ` · ${skipped} skipped` : ''}; ${failed} failed`,
        );
      } else if (created + updated === 0 && skipped > 0) {
        toast.success(`No lines imported · ${skipped} skipped`);
      } else {
        toast.success(parts.length > 0 ? parts.join(' · ') : 'Import complete');
      }
      onClose();
      setRaw('');
      setFileName(null);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Import failed';
      setError(message);
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  };

  if (!open) return null;

  return (
    <DetailStackRailRegistrar
      id="detail:incoming-import-csv"
      onClose={onClose}
      modal={false}
      ariaLabel="Upload inbound CSV"
    >
      <div className="flex h-full min-h-0 flex-col overflow-hidden bg-surface-canvas">
        <div className="shrink-0 border-b border-border-hairline inset-cozy">
          <PaneHeaderLabel eyebrow="Upload CSV" value="Amazon · Goodwill · eBay" />
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          <p className="inset-cozy text-role-caption text-text-faint">
            Desk columns: kind, source (amazon|goodwill|ebay), order_id, tracking, listing_url,
            sku, item_name, qty, seller, rma_id. Or paste Seller Central Manage Returns CSV
            (comma or tab) — Tracking ID lands on Incoming so Unbox can find it. Cancelled
            rows are skipped.
          </p>

          {amazonNative ? (
            <p className="inset-cozy border-b border-border-hairline text-role-caption font-medium text-text-default">
              Amazon Manage Returns file detected · Tracking ID → Incoming / Unbox
            </p>
          ) : null}

          <label
            className={cn(
              'ds-raw-button flex w-full cursor-pointer flex-col items-center gap-1 border-y border-border-hairline bg-surface-canvas px-3 py-5 text-center hover:bg-surface-hover',
              cornerClass('flush'),
              focusRing('control', 'accent'),
            )}
          >
            <span className="text-role-caption font-semibold text-text-default">
              {fileName || 'Choose .csv file'}
            </span>
            <span className="text-role-micro text-text-faint">or paste below</span>
            <input
              type="file"
              accept=".csv,.txt,text/csv,text/tab-separated-values"
              className="sr-only"
              onChange={(e) => void onFile(e.target.files?.[0] ?? null)}
            />
          </label>

          <textarea
            value={raw}
            onChange={(e) => {
              setRaw(e.target.value);
              setFileName(null);
            }}
            rows={10}
            placeholder={
              'kind,source,order_id,sku,item_name,qty,tracking,listing_url\n'
              + 'return,amazon,111-222-333,B0EXAMPLE1,Widget,1,1Z999,\n'
              + 'purchase,goodwill,GW-1001,SKU2,Camera,1,,'
            }
            className={cn(
              'w-full resize-y border-0 border-b border-border-hairline bg-surface-card px-3 py-2 font-mono text-role-caption text-text-default',
              cornerClass('flush'),
              focusRing('field', 'accent'),
            )}
          />

          {preview.length > 0 ? (
            <div className="divide-y divide-border-hairline border-b border-border-hairline">
              <p className="inset-cozy text-role-micro uppercase tracking-widest text-text-soft">
                Preview ({rows.length} rows)
                {amazonNative ? ' · Amazon returns' : ''}
              </p>
              {preview.map((p) =>
                p.ok ? (
                  <p key={p.i} className="truncate inset-cozy text-role-caption text-text-default">
                    {p.row.skipReason ? (
                      <span className="text-text-faint">
                        skip:{p.row.skipReason} · {p.row.orderId || '—'} · {p.row.sku || '—'}
                      </span>
                    ) : (
                      <>
                        {p.row.kind} · {p.row.sourcePlatform || p.row.sourceType} ·{' '}
                        {p.row.orderId || '—'} · {p.row.sku || p.row.itemName || '—'}
                        {p.row.trackingNumber ? ` · ${p.row.trackingNumber}` : ''}
                        {p.row.amazonNativeReturn ? ' · ASIN' : ''}
                      </>
                    )}
                  </p>
                ) : (
                  <p key={p.i} className="inset-cozy text-role-caption text-rose-600">
                    Row {p.i + 1}: {p.error}
                  </p>
                ),
              )}
            </div>
          ) : null}

          {error ? (
            <p className="inset-cozy text-role-caption font-medium text-red-600" role="alert">
              {error}
            </p>
          ) : null}
        </div>

        <FlushTerminalFooter
          layout="cluster"
          leading={
            <div className="flex min-w-0 flex-1 items-stretch">
              <Button
                type="button"
                variant="primary"
                disabled={!canSubmit}
                onClick={() => void handleSubmit()}
                ariaLabel={submitting ? 'Importing CSV' : `Import ${rows.length || 0} rows`}
                className="min-h-9 w-full flex-1"
                data-testid="import-csv-submit"
              >
                {submitting ? 'Importing…' : `Import ${rows.length || 0} row(s)`}
              </Button>
            </div>
          }
        >
          <PaneHeaderCloseButton
            onClick={onClose}
            ariaLabel="Hide right panel"
            title="Hide right panel"
            className={cn(
              'h-full min-h-9 w-10',
              cornerClass('flush'),
              'rounded-none border-l border-border-hairline',
            )}
          />
        </FlushTerminalFooter>
      </div>
    </DetailStackRailRegistrar>
  );
}
