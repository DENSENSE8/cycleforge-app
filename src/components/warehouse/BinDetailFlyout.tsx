'use client';

/** Bin record inspector. */

import { useEffect, useState } from 'react';
import Link from 'next/link';
import type { BinsOverviewRow } from '@/hooks/useBinsOverview';
import { AuditTimeline } from '@/components/audit/AuditTimeline';
import { DetailStackRailRegistrar } from '@/components/right-rail/DetailStackRailRegistrar';
import { DeskInspectorIndexShell } from '@/components/right-rail/DeskInspectorIndexShell';
import { PaneHeaderLabel } from '@/components/ui/pane-header';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import { FillBar } from './FillBar';
import { StatusChips } from './StatusChip';
import { ExternalLink, Printer } from '@/components/Icons';
import { FLOOR_DELETE_PEER_CLASS, InspectorActionFloor } from '@/components/right-rail/InspectorActionFloor';
import { InspectorFlushDelete } from '@/components/right-rail/InspectorFlushDelete';
import { Panel, IconButton } from '@/design-system/primitives';
import {
  isSpecialBinBarcode,
  printSpecialBinLabelFromRow,
} from '@/lib/print/printSpecialBinLabel';
import { toast } from '@/lib/toast';

interface BinContentRow {
  id: number;
  sku: string;
  qty: number;
  minQty: number | null;
  maxQty: number | null;
  lastCounted: string | null;
  productTitle: string | null;
}

interface Props {
  row: BinsOverviewRow | null;
  onClose: () => void;
  /** Called after a successful delete so the parent can refetch its list. */
  onDeleted?: () => void;
}

export function BinDetailFlyout({ row, onClose, onDeleted }: Props) {
  const [contents, setContents] = useState<BinContentRow[]>([]);
  const [loading, setLoading] = useState(false);
  // Soft-delete; endpoint refuses non-empty bins (409) — surfaced inline.
  const [deleteError, setDeleteError] = useState<string | null>(null);

  useEffect(() => {
    setDeleteError(null);
  }, [row?.barcode]);

  // Throws on failure so InspectorFlushDelete skips its onDeleted (close);
  // the 409 "bin not empty" message is shown inline.
  const handleDelete = async () => {
    if (!row?.barcode) return;
    setDeleteError(null);
    const res = await fetch(`/api/locations/${encodeURIComponent(row.barcode)}`, {
      method: 'DELETE',
    });
    const body = await res.json().catch(() => null);
    if (!res.ok || !body?.success) {
      const msg = body?.error || `Delete failed (${res.status})`;
      setDeleteError(msg);
      throw new Error(msg);
    }
  };

  useEffect(() => {
    if (!row?.barcode) return;
    let cancelled = false;
    setLoading(true);
    void (async () => {
      try {
        const res = await fetch(`/api/locations/${encodeURIComponent(row.barcode!)}`, {
          cache: 'no-store',
        });
        const data = await res.json();
        if (cancelled || !res.ok) return;
        setContents(Array.isArray(data?.contents) ? data.contents : []);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [row?.barcode]);

  if (!row) return null;

  const identity = row.barcode ?? row.name;

  return (
    <DetailStackRailRegistrar
      id={`detail:bin:${identity}`}
      onClose={onClose}
      modal={false}
      ariaLabel={`Bin ${identity}`}
    >
      <div className="flex h-full min-h-0 flex-col overflow-hidden">
        <DeskInspectorIndexShell
          stance="standalone"
          title="Bin"
          ariaLabel="Bin detail"
          testId="bin-detail-inspector"
          headerRightSlot={
            <>
              {row.barcode ? (
                <span className="flex h-full items-center gap-1">
                  {isSpecialBinBarcode(row.barcode) ? (
                    <HoverTooltip label="Reprint 2×1 special-bin label" asChild>
                      <IconButton
                        size="xs"
                        tone="neutral"
                        ariaLabel="Reprint bin label"
                        icon={<Printer className="h-4 w-4" />}
                        onClick={() => {
                          if (printSpecialBinLabelFromRow(row)) {
                            toast.success('Printing 2×1 bin label');
                          }
                        }}
                      />
                    </HoverTooltip>
                  ) : null}
                  <HoverTooltip label="Open full bin page" asChild>
                    <IconButton
                      size="xs"
                      tone="neutral"
                      ariaLabel="Open full bin page"
                      icon={<ExternalLink className="h-4 w-4" />}
                      onClick={() => {
                        window.open(`/bin/${encodeURIComponent(row.barcode!)}`, '_blank', 'noopener');
                      }}
                    />
                  </HoverTooltip>
                </span>
              ) : null}
            </>
          }
          body={
            <div className="space-y-4 p-4">
            {/* Identity — body, never a second header line. The band's title
                cell is the one-word segment ("Bin"); the barcode and its
                room / row / column address are facts about the record. */}
            <div className="flex min-w-0 flex-col gap-0.5">
              <PaneHeaderLabel
                eyebrow="Bin"
                // Identifier → the mono cut, per the typeface SoT. It was
                // `text-lg font-semibold` before, which is hero density on a rail.
                valueClassName="truncate font-mono text-role-caption font-semibold text-text-default"
                value={identity}
                valueTitle={identity ?? undefined}
              />
              <p className="truncate text-role-caption text-text-soft">
                {row.room ?? '—'}
                {row.zone_letter ? ` [${row.zone_letter}]` : ''} · Row {row.row_label ?? '—'} · Col{' '}
                {row.col_label ?? '—'}
              </p>
            </div>

            {/* Summary */}
            <Panel radius="2xl" padding="sm">
              <div className="grid grid-cols-3 gap-3 text-center">
                <Stat label="Total qty" value={String(row.total_qty)} />
                <Stat label="SKUs" value={String(row.sku_count)} />
                <Stat label="Capacity" value={row.capacity != null ? String(row.capacity) : '—'} />
              </div>
              <div className="mt-3">
                <FillBar pct={row.fill_pct} current={row.total_qty} max={row.capacity} />
              </div>
              <div className="mt-2">
                <StatusChips
                  is_empty={row.is_empty}
                  has_low_stock={row.has_low_stock}
                  is_over_capacity={row.is_over_capacity}
                  is_stale={row.is_stale}
                />
              </div>
            </Panel>

            {/* Contents */}
            <section>
              <h3 className="mb-2 text-role-micro text-text-soft">
                Contents
              </h3>
              {loading && (
                <Panel radius="xl" padding="sm" className="text-xs text-text-faint">
                  Loading…
                </Panel>
              )}
              {!loading && contents.length === 0 && (
                <Panel radius="xl" padding="sm" className="border-dashed text-center text-xs text-text-faint">
                  No SKUs in this bin.
                </Panel>
              )}
              {!loading && contents.length > 0 && (
                <ul className="divide-y divide-border-hairline rounded-xl border border-border-soft bg-surface-card">
                  {contents.map((c) => (
                    <li key={c.id} className="px-3 py-2">
                      <div className="flex items-baseline justify-between gap-2">
                        <Link
                          href={`/inventory?sku=${encodeURIComponent(c.sku)}`}
                          className="font-mono text-xs text-blue-700 hover:underline"
                        >
                          {c.sku}
                        </Link>
                        <span className="font-mono text-sm font-semibold tabular-nums text-text-default">
                          {c.qty}
                        </span>
                      </div>
                      {c.productTitle && (
                        <div className="mt-0.5 line-clamp-1 text-role-caption text-text-soft">
                          {c.productTitle}
                        </div>
                      )}
                      {(c.minQty != null || c.maxQty != null) && (
                        <div className="mt-0.5 text-role-micro text-text-faint">
                          min {c.minQty ?? '—'} · max {c.maxQty ?? '—'}
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </section>

            {/* History */}
            <section>
              <h3 className="mb-2 text-role-micro text-text-soft">
                Recent history
              </h3>
              <AuditTimeline binId={row.id} limit={20} compact noHeader />
            </section>
            </div>
          }
        />

        {/* Floor — soft-delete this bin (endpoint refuses non-empty bins). */}
        {row.barcode ? (
          <InspectorActionFloor
            above={
              deleteError ? (
                <p className="px-3 py-2 text-role-caption font-semibold text-rose-600">
                  {deleteError}
                </p>
              ) : undefined
            }
          >
            <InspectorFlushDelete
              onConfirm={handleDelete}
              onDeleted={() => {
                onDeleted?.();
                onClose();
              }}
              label="Delete bin"
              confirmLabel="Click again to delete bin"
              data-testid="bin-details-delete"
              className={FLOOR_DELETE_PEER_CLASS}
            />
          </InspectorActionFloor>
        ) : null}
      </div>
    </DetailStackRailRegistrar>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-role-eyebrow font-semibold text-text-soft">
        {label}
      </div>
      <div className="mt-0.5 text-lg font-semibold tabular-nums text-text-default">
        {value}
      </div>
    </div>
  );
}
