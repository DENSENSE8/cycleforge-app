'use client';

/** FBA scan result — the pack bench's active card for the OTHER entity it resolves: */

import { Package } from '@/components/Icons';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import { getLast8 } from '@/components/ui/CopyChip';
import type { PackActiveFbaPane } from '@/components/packer/usePackerOrderPane';

export function PackFbaScanCard({ scan }: { scan: PackActiveFbaPane }) {
  return (
    <div className="rounded-none border border-purple-200 bg-surface-card">
      <div className="flex items-center justify-between gap-3 border-b border-purple-100 px-3 py-2.5">
        <div className="flex items-center gap-2">
          <Package className="h-3.5 w-3.5 shrink-0 text-purple-500" />
          <p className="text-role-micro uppercase tracking-widest text-purple-500">Amazon Prep Scan</p>
          {scan.isNew ? (
            <span className="rounded-none border border-blue-200 bg-blue-100 px-1.5 py-0.5 text-role-eyebrow uppercase tracking-wider text-blue-700">
              Added to Today
            </span>
          ) : null}
        </div>
        {scan.shipmentRef ? (
          <span className="font-mono text-role-micro text-purple-700">{scan.shipmentRef}</span>
        ) : null}
      </div>

      <h3 className="px-3 py-2.5 text-base font-semibold leading-tight text-text-default">
        {scan.productTitle}
      </h3>

      <div className="flex items-stretch justify-between gap-3 border-t border-purple-100 bg-purple-50/40 px-3 py-2.5">
        <HoverTooltip label={scan.fnsku} asChild>
          <div className="min-w-0 flex-1">
            <p className="text-role-micro uppercase tracking-wider text-purple-400">Amazon SKU (FNSKU)</p>
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
