'use client';

/**
 * FBA scan result — the pack bench's active card for the OTHER entity it
 * resolves: an FNSKU / FBA shipment rather than an order.
 *
 * **Lives in the workspace, not the scan column** (moved 2026-08-02). It was the
 * last active-entity display left in the pack scan column (`PackScanColumn`,
 * then still named `StationPacking`), and the
 * only one there that was never gated: the order card had already been switched
 * off under `railSlot`, but an FBA scan had no middle counterpart to switch TO
 * (`pack-active-order-changed` carries orders only), so it stayed. It has one
 * now — `PackActiveFbaPane` on `usePackerOrderPane`.
 *
 * A Station renders its active entity in exactly ONE region, and that region is
 * the middle (`display/station.md`; Unbox is the control). Guard:
 * `station-sidebar-identity.guard.test.ts`.
 */

import { Package } from '@/components/Icons';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import { getLast8 } from '@/components/ui/CopyChip';
import type { PackActiveFbaPane } from '@/components/packer/usePackerOrderPane';

export function PackFbaScanCard({ scan }: { scan: PackActiveFbaPane }) {
  return (
    <div className="rounded-2xl border border-purple-200 bg-surface-card p-4 shadow-sm">
      <div className="mb-2 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Package className="h-3.5 w-3.5 shrink-0 text-purple-500" />
          <p className="text-role-micro uppercase tracking-widest text-purple-500">FBA Scan</p>
          {scan.isNew ? (
            <span className="rounded-lg border border-blue-200 bg-blue-100 px-1.5 py-0.5 text-role-eyebrow uppercase tracking-wider text-blue-700">
              Added to Today
            </span>
          ) : null}
        </div>
        {scan.shipmentRef ? (
          <span className="font-mono text-role-micro text-purple-700">{scan.shipmentRef}</span>
        ) : null}
      </div>

      <h3 className="text-base font-semibold leading-tight text-text-default">
        {scan.productTitle}
      </h3>

      <div className="mt-3 flex items-stretch justify-between gap-3 rounded-xl border border-purple-100 bg-purple-50/40 px-3 py-2.5">
        <HoverTooltip label={scan.fnsku} asChild>
          <div className="min-w-0 flex-1">
            <p className="text-role-micro uppercase tracking-wider text-purple-400">FNSKU</p>
            <p className="font-mono text-sm font-semibold tabular-nums text-text-default">
              {/* Honest absence — the ship-on-scan path resolves a shipment with
                  no single FNSKU behind it. */}
              {scan.fnsku ? getLast8(scan.fnsku) : '—'}
            </p>
          </div>
        </HoverTooltip>
        <div className="flex-1 border-x border-purple-100/80 px-2 text-center">
          <p className="text-role-micro uppercase tracking-wider text-text-faint">Planned</p>
          <p className="text-sm font-semibold tabular-nums text-text-default">
            {scan.plannedQty > 0 ? scan.plannedQty : '—'}
          </p>
        </div>
        <div className="min-w-0 flex-1 text-right">
          <p className="text-role-micro uppercase tracking-wider text-text-faint">Scanned</p>
          <p className="text-sm font-semibold tabular-nums text-text-default">
            {scan.combinedPackScannedQty}
          </p>
        </div>
      </div>
    </div>
  );
}
