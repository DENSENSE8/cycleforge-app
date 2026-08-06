'use client';

/**
 * Allowlisted Sheets-class row context menu for Unbox receiving.
 *
 * Default (Queue / Recent / Testing): Open · Set lane · Copy PO/tracking.
 * Unbox History (`historyTriage`): column-aware top cluster + unfound/matched
 * bottom cluster — deep-links into existing flows; no raw status PATCH.
 */

import { useCallback, useState, type ReactNode } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import type { ReceivingLineRow } from '@/components/station/receiving-line-row';
import { dispatchSelectLine } from '@/components/station/receiving-lines-table-helpers';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger,
} from '@/design-system/primitives/ContextMenu';
import {
  isHistoryUnfoundRow,
  resolveReceivingColFromTarget,
  historyTriageTargetFromRow,
} from '@/lib/receiving/history-triage-row';
import type { ReceivingGridColumnKey } from '@/lib/receiving/receiving-grid-layout';
import { setReceivingHistoryUrlParams } from '@/lib/receiving-history-search';
import { resolveTrackingOpenUrl } from '@/lib/tracking-format';
import { receivingSurfaceBasePath } from '@/lib/receiving/surface-path';
import {
  dispatchReceivingOpenHistoryTriage,
  dispatchReceivingOpenPairingPo,
} from '@/utils/events';
import { printProductLabel } from '@/lib/print/printProductLabel';
import { copyToClipboard } from '@/utils/_dom';
import { toast } from '@/lib/toast';
import { workflowStageLabel } from '@/lib/receiving/workflow-stages';

const QUEUE_LANES = [
  { id: 'PO_STOCKOUT', label: 'Stockout' },
  { id: 'PO_STANDARD', label: 'Standard' },
  { id: 'RETURN', label: 'Return' },
  { id: 'HOLD', label: 'Hold' },
] as const;

/** Readiness-shaped status CTAs — open Unbox; never raw status PATCH. */
const STATUS_CTA = [
  { id: 'RECEIVED', label: 'Received' },
  { id: 'AWAITING_TEST', label: 'Awaiting test' },
  { id: 'FLAGGED', label: 'Flagged / exception' },
  { id: 'UNBOXED', label: 'Unboxed' },
] as const;

async function copyText(label: string, value: string) {
  const ok = await copyToClipboard(value);
  if (ok) toast.success(`Copied ${label}`);
  else toast.error('Could not copy');
}

export function ReceivingRowTriageContextMenu({
  row,
  children,
  historyTriage = false,
}: {
  row: ReceivingLineRow;
  children: ReactNode;
  /** Unbox History — column + row-state clusters. */
  historyTriage?: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname() ?? '';
  const searchParams = useSearchParams();
  const [colKey, setColKey] = useState<ReceivingGridColumnKey | null>(null);

  const patch = async (body: Record<string, unknown>) => {
    if (!row.receiving_id) {
      toast.error('No carton to update');
      return;
    }
    const res = await fetch(`/api/receiving/${row.receiving_id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      toast.error('Could not save triage field');
      return;
    }
    toast.success('Updated');
  };

  const openWorkspace = useCallback(() => {
    dispatchSelectLine(row, { recordView: false });
  }, [row]);

  const openTriage = useCallback(() => {
    const target = historyTriageTargetFromRow(row);
    if (!target) {
      toast.error('No carton record for this row yet');
      return;
    }
    dispatchReceivingOpenHistoryTriage(target);
  }, [row]);

  const openPairing = useCallback(() => {
    dispatchSelectLine(row, { recordView: false });
    window.requestAnimationFrame(() => dispatchReceivingOpenPairingPo());
  }, [row]);

  const filterByTracking = useCallback(() => {
    const tracking = (row.tracking_number || '').trim();
    if (!tracking) return;
    const base = receivingSurfaceBasePath(pathname);
    const next = setReceivingHistoryUrlParams(searchParams, {
      q: tracking,
      field: 'tracking',
    });
    const qs = next.toString();
    router.replace(qs ? `${base}?${qs}` : base, { scroll: false });
    toast.success('Filtered by tracking');
  }, [row.tracking_number, pathname, searchParams, router]);

  const printLabel = useCallback(() => {
    const sku = (row.sku || '').trim();
    if (!sku) {
      toast.info('Open in Unbox to print a carton label');
      openWorkspace();
      return;
    }
    const serial = (row.serials ?? [])
      .map((s) => (s.serial_number || '').trim())
      .find(Boolean);
    printProductLabel({ sku, serialNumber: serial });
    toast.success('Printing label');
  }, [row, openWorkspace]);

  if (!historyTriage) {
    return (
      <ContextMenu>
        <ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
        <ContextMenuContent data-testid="receiving-row-triage-menu">
          <ContextMenuItem onSelect={() => dispatchSelectLine(row)}>
            Open record
          </ContextMenuItem>
          <ContextMenuSeparator />
          <ContextMenuSub>
            <ContextMenuSubTrigger>Set lane</ContextMenuSubTrigger>
            <ContextMenuSubContent>
              {QUEUE_LANES.map((l) => (
                <ContextMenuItem
                  key={l.id}
                  onSelect={() => void patch({ priority_lane: l.id })}
                >
                  {l.label}
                </ContextMenuItem>
              ))}
              <ContextMenuItem
                onSelect={() => void patch({ priority_lane: null })}
              >
                Clear lane
              </ContextMenuItem>
            </ContextMenuSubContent>
          </ContextMenuSub>
          <ContextMenuItem
            onSelect={() => {
              const po = (row.zoho_purchaseorder_number || '').trim();
              const trk = (row.tracking_number || '').trim();
              const text = [po && `PO ${po}`, trk && `TRK ${trk}`]
                .filter(Boolean)
                .join(' · ');
              if (text) void navigator.clipboard?.writeText(text);
            }}
          >
            Copy PO / tracking
          </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>
    );
  }

  const unfound = isHistoryUnfoundRow(row);
  const tracking = (row.tracking_number || '').trim();
  const po = (row.zoho_purchaseorder_number || '').trim();
  const title = (
    row.zoho_item_title ||
    row.catalog_product_title ||
    row.item_name ||
    ''
  ).trim();
  const price = (row.unit_price || '').trim();
  const location = (row.staging_location_label || '').trim();
  const status = (row.workflow_status || '').trim();
  const carrierUrl = tracking
    ? resolveTrackingOpenUrl(tracking, row.carrier)
    : null;

  return (
    <ContextMenu
      onOpenChange={(open) => {
        if (!open) setColKey(null);
      }}
    >
      <ContextMenuTrigger asChild>
        <div
          onContextMenu={(e) => {
            setColKey(resolveReceivingColFromTarget(e.target));
          }}
        >
          {children}
        </div>
      </ContextMenuTrigger>
      <ContextMenuContent data-testid="receiving-row-triage-menu-history">
        {/* Column-specific cluster */}
        {colKey === 'tracking' && tracking ? (
          <>
            <ContextMenuItem onSelect={() => void copyText('tracking', tracking)}>
              Copy tracking number
            </ContextMenuItem>
            {carrierUrl ? (
              <ContextMenuItem
                onSelect={() => window.open(carrierUrl, '_blank', 'noopener,noreferrer')}
              >
                Open carrier tracking portal
              </ContextMenuItem>
            ) : null}
            <ContextMenuItem onSelect={filterByTracking}>
              Filter grid by this tracking number
            </ContextMenuItem>
            <ContextMenuSeparator />
          </>
        ) : null}

        {colKey === 'order' ? (
          <>
            {po ? (
              <ContextMenuItem onSelect={() => void copyText('order', po)}>
                Copy order ID
              </ContextMenuItem>
            ) : (
              <ContextMenuItem onSelect={openPairing}>
                Assign / link PO number
              </ContextMenuItem>
            )}
            <ContextMenuItem onSelect={openWorkspace}>
              Open marketplace order page
            </ContextMenuItem>
            <ContextMenuSeparator />
          </>
        ) : null}

        {colKey === 'title' && title ? (
          <>
            <ContextMenuItem onSelect={() => void copyText('title', title)}>
              Copy product title
            </ContextMenuItem>
            <ContextMenuItem onSelect={openPairing}>
              Re-match SKU / catalog item
            </ContextMenuItem>
            <ContextMenuItem onSelect={printLabel}>
              Print custom barcode label
            </ContextMenuItem>
            <ContextMenuSeparator />
          </>
        ) : null}

        {colKey === 'status' ? (
          <>
            <ContextMenuSub>
              <ContextMenuSubTrigger>
                Quick status
                {status ? ` (${workflowStageLabel(status)})` : ''}
              </ContextMenuSubTrigger>
              <ContextMenuSubContent>
                {STATUS_CTA.map((s) => (
                  <ContextMenuItem
                    key={s.id}
                    onSelect={() => {
                      toast.info(`Open in Unbox to move toward ${s.label}`);
                      openWorkspace();
                    }}
                  >
                    {s.label}
                  </ContextMenuItem>
                ))}
              </ContextMenuSubContent>
            </ContextMenuSub>
            <ContextMenuSeparator />
          </>
        ) : null}

        {colKey === 'qty' ? (
          <>
            <ContextMenuItem onSelect={openWorkspace}>
              Quick audit quantity
            </ContextMenuItem>
            <ContextMenuItem onSelect={openWorkspace}>
              Mark as short / partial shipment
            </ContextMenuItem>
            <ContextMenuItem onSelect={openWorkspace}>
              Mark as overage
            </ContextMenuItem>
            <ContextMenuSeparator />
          </>
        ) : null}

        {colKey === 'price' && price ? (
          <>
            <ContextMenuItem onSelect={() => void copyText('price', price)}>
              Copy unit price
            </ContextMenuItem>
            <ContextMenuItem onSelect={openWorkspace}>
              Override / edit item value
            </ContextMenuItem>
            <ContextMenuSeparator />
          </>
        ) : null}

        {colKey === 'location' ? (
          <>
            <ContextMenuItem
              onSelect={() => {
                if (location) void copyText('location', location);
                else openWorkspace();
              }}
            >
              Assign storage bin / location
            </ContextMenuItem>
            <ContextMenuItem onSelect={openWorkspace}>
              Print location tag
            </ContextMenuItem>
            <ContextMenuSeparator />
          </>
        ) : null}

        {/* Shared open / inspect */}
        <ContextMenuItem onSelect={openTriage}>Inspect in panel</ContextMenuItem>
        <ContextMenuItem onSelect={openWorkspace}>Open in Unbox</ContextMenuItem>
        <ContextMenuSeparator />

        {/* Row-state cluster */}
        {unfound ? (
          <>
            <ContextMenuItem onSelect={openPairing}>
              Resolve Unfound PO
            </ContextMenuItem>
            <ContextMenuItem onSelect={openWorkspace}>
              Assign holding location
            </ContextMenuItem>
            <ContextMenuItem onSelect={openWorkspace}>
              Flag as unknown package / return to sender
            </ContextMenuItem>
            <ContextMenuItem onSelect={openWorkspace}>
              Attach photo evidence
            </ContextMenuItem>
          </>
        ) : (
          <>
            <ContextMenuItem onSelect={openWorkspace}>
              Send to testing / mark fully ingested
            </ContextMenuItem>
            <ContextMenuItem onSelect={printLabel}>
              Print receiving barcode label
            </ContextMenuItem>
            <ContextMenuItem onSelect={openWorkspace}>
              View channel listing
            </ContextMenuItem>
            <ContextMenuItem onSelect={openWorkspace}>
              Report condition discrepancy
            </ContextMenuItem>
          </>
        )}

        <ContextMenuSeparator />
        <ContextMenuSub>
          <ContextMenuSubTrigger>Set lane</ContextMenuSubTrigger>
          <ContextMenuSubContent>
            {QUEUE_LANES.map((l) => (
              <ContextMenuItem
                key={l.id}
                onSelect={() => void patch({ priority_lane: l.id })}
              >
                {l.label}
              </ContextMenuItem>
            ))}
            <ContextMenuItem
              onSelect={() => void patch({ priority_lane: null })}
            >
              Clear lane
            </ContextMenuItem>
          </ContextMenuSubContent>
        </ContextMenuSub>
      </ContextMenuContent>
    </ContextMenu>
  );
}
