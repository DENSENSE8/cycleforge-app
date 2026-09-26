'use client';

import { useMemo } from 'react';
import { HorizontalButtonSlider, type HorizontalSliderItem } from '@/components/ui/HorizontalButtonSlider';
import { Button } from '@/design-system/primitives';
import { LIFECYCLE_CLASSES } from '@/design-system/tokens/lifecycle';
import { SidebarRailShell } from '@/components/sidebar/SidebarRailShell';
import { FbaActiveShipments } from '@/components/fba/sidebar/FbaActiveShipments';
import { useFbaBoardSelection } from '@/components/fba/hooks/useFbaBoardSelection';
import { FBA_STATUS_LABEL } from '@/lib/fba/status';
import { FBA_BOARD_SELECT_BY_FNSKU } from '@/lib/fba/events';
import type { StationTheme } from '@/utils/staff-colors';

/* ── Item row (planned / tested / packed) ─────────────────────────────── */

interface FbaItemRow {
  item_id: number;
  fnsku: unknown;
  display_title: unknown;
  asin?: unknown;
  sku?: unknown;
  expected_qty: number;
  actual_qty: number;
  item_status: string;
  shipment_ref: string;
}

/**
 * Board data has historically carried either a string title or a catalog
 * identity object. A rail must never stringify the latter into `[object Object]`:
 * the FNSKU is the honest scan identity when there is no usable human title.
 */
function fbaRailScanIdentifier(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  return normalized && !/^\[object object\]$/i.test(normalized) ? normalized : null;
}

export function fbaRailDisplayTitle(value: unknown, fallback: string): string {
  if (typeof value === 'string' && value.trim() && !/^\[object object\]$/i.test(value.trim())) return value.trim();
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    for (const key of ['display_title', 'product_title', 'title', 'name']) {
      const candidate = record[key];
      if (typeof candidate === 'string' && candidate.trim()) return candidate.trim();
    }
  }
  return fallback;
}

/** The board endpoint is a boundary, not a trust boundary. */
export function fbaRailIdentity(row: Pick<FbaItemRow, 'item_id' | 'fnsku' | 'sku' | 'asin' | 'display_title'>) {
  const scanIdentifier =
    fbaRailScanIdentifier(row.fnsku) ??
    fbaRailScanIdentifier(row.sku) ??
    fbaRailScanIdentifier(row.asin);
  const fallback = scanIdentifier ?? `FBA item #${row.item_id}`;
  return {
    scanIdentifier,
    title: fbaRailDisplayTitle(row.display_title, fallback),
  };
}

// PACKED reads LIFECYCLE (fulfillment purple); LABEL_ASSIGNED ("Combined") is
// info so the two adjacent stages never share a hue — the badge's tone too.
const ITEM_DOT: Record<string, string> = {
  PLANNED: 'bg-fill-warning',
  TESTED: 'bg-fill-success',
  PACKED: LIFECYCLE_CLASSES.packed.dot,
  LABEL_ASSIGNED: 'bg-fill-info',
};

function FbaItemRail({ statuses, eyebrowTitle }: { statuses: string[]; eyebrowTitle: string }) {
  // Items currently selected on the board → pulsing dot so the user sees this
  // row is already added and being combined.
  const selection = useFbaBoardSelection({ includePairedSelection: true });
  const selectedIds = useMemo(() => new Set(selection.map((i) => i.item_id)), [selection]);
  return (
    <SidebarRailShell<FbaItemRow>
      queryKey={['fba-item-rail', statuses.join(',')]}
      fetchFn={async () => {
        const res = await fetch('/api/fba/board', { cache: 'no-store' });
        const data = await res.json().catch(() => null);
        const pending: FbaItemRow[] = Array.isArray(data?.pending) ? data.pending : [];
        const set = new Set(statuses);
        return pending.filter((r) => set.has(String(r.item_status)));
      }}
      refreshEvents={['fba-print-shipped', 'fba-plan-created']}
      refreshDomains={['orders.outbound']}
      selectedId={null}
      eyebrowTitle={eyebrowTitle}
      emptyText="Nothing here yet."
      getId={(r) => r.item_id}
      getStatusDot={(r) =>
        selectedIds.has(r.item_id)
          ? 'bg-fill-info ring-2 ring-border-accent animate-pulse'
          : ITEM_DOT[String(r.item_status)] ?? 'bg-surface-strong'}
      onSelect={(r) => {
        const { scanIdentifier } = fbaRailIdentity(r);
        if (scanIdentifier) {
          window.dispatchEvent(new CustomEvent(FBA_BOARD_SELECT_BY_FNSKU, { detail: scanIdentifier }));
        }
      }}
      renderRowMain={(r) => {
        const { title } = fbaRailIdentity(r);
        return (
          <>
          {/* ds-allow-title: truncation-only fallback on a non-interactive clipped <p> */}
          <p className="truncate text-role-caption font-semibold text-text-default" title={title}>
            {title}
          </p>
          <p className="truncate text-role-eyebrow font-semibold uppercase tracking-widest text-text-soft">
            {r.actual_qty}/{r.expected_qty} units · {FBA_STATUS_LABEL[r.item_status] ?? r.item_status}
          </p>
          </>
        );
      }}
      renderPopover={(r, { openWorkspace }) => {
        const { title, scanIdentifier } = fbaRailIdentity(r);
        return (
          <div className="space-y-2 p-3.5">
          <p className="text-sm font-semibold leading-snug text-text-default">{title}</p>
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="rounded-none border border-border-accent bg-surface-accent px-1.5 py-0.5 text-role-eyebrow uppercase tracking-widest text-text-accent">
              {FBA_STATUS_LABEL[r.item_status] ?? r.item_status}
            </span>
            <span className="rounded-none bg-surface-sunken px-1.5 py-0.5 text-role-eyebrow uppercase tracking-widest text-text-muted tabular-nums">
              {r.actual_qty}/{r.expected_qty} units
            </span>
          </div>
          <dl className="space-y-1 border-t border-border-hairline pt-2 text-role-caption">
            <div className="flex justify-between gap-3"><dt className="font-semibold text-text-soft">FNSKU</dt><dd className="font-mono font-semibold text-text-default">{scanIdentifier ?? `ITEM-${r.item_id}`}</dd></div>
            {r.shipment_ref ? <div className="flex justify-between gap-3"><dt className="font-semibold text-text-soft">Plan</dt><dd className="font-semibold text-text-default">{r.shipment_ref}</dd></div> : null}
          </dl>
          <Button variant="primary" size="sm" onClick={openWorkspace} className="w-full">
            Find on board →
          </Button>
          </div>
        );
      }}
    />
  );
}

/* ── Public: pill-headed rail sections for the Plan / Combine sidebars ── */

const PLAN_PILLS: HorizontalSliderItem[] = [
  { id: 'planned', label: 'Planned' },
  { id: 'tested', label: 'Testing' },
];

export type FbaPlanRailView = 'planned' | 'tested';

export function FbaPlanRailPills({
  view,
  onViewChange,
}: {
  view: FbaPlanRailView;
  onViewChange: (view: FbaPlanRailView) => void;
}) {
  return (
    <HorizontalButtonSlider
      items={PLAN_PILLS}
      value={view}
      onChange={(v) => onViewChange(v as FbaPlanRailView)}
      variant="nav"
      dense
      className="w-full"
      aria-label="Plan view"
    />
  );
}

export function FbaPlanRailBody({ view }: { view: FbaPlanRailView }) {
  return view === 'planned' ? (
    <FbaItemRail statuses={['PLANNED']} eyebrowTitle="Planned" />
  ) : (
    <FbaItemRail statuses={['TESTED']} eyebrowTitle="Tested" />
  );
}

const COMBINE_PILLS: HorizontalSliderItem[] = [
  { id: 'recent', label: 'Recent' },
  { id: 'packed', label: 'Packed' },
];

export type FbaCombineRailView = 'recent' | 'packed';

export function FbaCombineRailPills({
  view,
  onViewChange,
}: {
  view: FbaCombineRailView;
  onViewChange: (view: FbaCombineRailView) => void;
}) {
  return (
    <HorizontalButtonSlider
      items={COMBINE_PILLS}
      value={view}
      onChange={(v) => onViewChange(v as FbaCombineRailView)}
      variant="nav"
      dense
      className="w-full"
      aria-label="Combine view"
    />
  );
}

export function FbaCombineRailBody({
  view,
  stationTheme = 'green',
}: {
  view: FbaCombineRailView;
  stationTheme?: StationTheme;
}) {
  return view === 'recent' ? (
    <FbaActiveShipments stationTheme={stationTheme} />
  ) : (
    <FbaItemRail statuses={['PACKED']} eyebrowTitle="Packed" />
  );
}
