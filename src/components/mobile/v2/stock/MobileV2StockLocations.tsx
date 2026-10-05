'use client';

/**
 * `/m/stock` — the warehouse walked the way it stands: Rooms › Aisles › Side ›
 * Bays › Locations (owner 2026-10-03: no long monolithic list). An aisle opens
 * on two full-height choices — odd bays on the left side, even bays on the
 * right — and the chosen side lists its bays in number order. Every place stays
 * in the walk, empty ones say Empty. Path chips jump back up; a location opens
 * its record (`/m/loc/…`), whose X returns to the bay it came from. The shell's
 * search escapes the hierarchy: it lists the room's stocked places, and a typed
 * or scanned code opens that location directly.
 */

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useMemo, type ReactNode } from 'react';
import { AlertTriangle, MapPin, Warehouse } from '@/components/Icons';
import { DetailNav, type DetailNavItem } from '@/components/mobile/detail/DetailParts';
import { PathChips, type PathChip } from '@/design-system/components/PathChips';
import { MOBILE_DATA_LIST_ROW_INTERACTION_CLASS } from '@/design-system/components/MobileDataListRow';
import { Button } from '@/design-system/primitives/Button';
import { EmptyState } from '@/design-system/primitives/EmptyState';
import { BAY_SIDE_FACE, locationCodeFlat, pad2 } from '@/lib/barcode-routing';
import { labelFace, parseLabelCode } from '@/features/location-labels/location-label-model';
import { UNROOMED_FACET_ID, type LocationStockRoomFacet, type LocationStockTableRow } from '@/lib/inventory/location-stock-row';
import {
  STOCK_DRILL_OTHER,
  stockDrillAisles,
  stockDrillBays,
  stockDrillHref,
  stockDrillLocations,
  stockDrillSides,
  type StockDrillGroup,
  type StockDrillScope,
  type StockDrillSide,
} from '@/lib/inventory/stock-drill';
import { stockLocationMatches, summarizeStockLocations, type StockLocationSummary } from '@/lib/inventory/stock-location-summary';
import { locationHubPath } from '@/lib/mobile/location-hub-href';
import { withJobReturn } from '@/lib/mobile/nav-trail';
import { cn } from '@/utils/_cn';
import { useMobileV2Search } from '../MobileV2SearchContext';

function count(value: number, singular: string, plural = `${singular}s`): string {
  return `${value} ${value === 1 ? singular : plural}`;
}

function flags(item: Pick<StockDrillGroup, 'hasOnHold' | 'hasCleanup' | 'hasException'>): string[] {
  return [item.hasOnHold ? 'On hold' : null, item.hasCleanup ? 'Cleanup' : null, item.hasException ? 'Needs a location' : null].filter(
    (flag): flag is string => flag != null,
  );
}

/** What is under a group, at a glance. An empty group says so instead of `0 units · 0 SKUs`. */
function groupMeta(group: StockDrillGroup, childNoun: string | null): string {
  return [
    childNoun ? count(group.children, childNoun) : null,
    ...(group.quantity > 0 ? [count(group.quantity, 'unit'), count(group.skuCount, 'SKU')] : ['Empty']),
    ...flags(group),
  ]
    .filter((part): part is string => part != null)
    .join(' · ');
}

function groupIcon(group: Pick<StockDrillGroup, 'hasOnHold' | 'hasCleanup' | 'hasException'>, icon: ReactNode) {
  return group.hasOnHold || group.hasCleanup || group.hasException ? <AlertTriangle className="text-amber-600" /> : icon;
}

function locationRow(summary: StockLocationSummary, returnTo: string): DetailNavItem {
  return {
    id: summary.key,
    title: summary.face,
    icon: groupIcon(summary, <MapPin />),
    meta: [
      summary.empty ? 'Empty' : `${count(summary.quantity, 'unit')} · ${count(summary.skuCount, 'SKU')}`,
      ...flags(summary),
    ].join(' · '),
    href: summary.routeCode ? withJobReturn(locationHubPath(summary.routeCode), returnTo) : null,
  };
}

export function MobileV2StockLocations({
  rows,
  rooms,
  scope,
  legacyQuery,
  capped,
}: {
  /** The open room's locations (empty at the room level). */
  rows: LocationStockTableRow[];
  rooms: LocationStockRoomFacet[];
  scope: StockDrillScope;
  legacyQuery: string;
  capped: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const query = useMobileV2Search().query.trim() || legacyQuery;
  const returnTo = `${pathname}?${searchParams.toString()}`.replace(/\?$/, '');
  // The walk is the building: every aisle, bay and level stays in place, empty or not, so a
  // side of the aisle never disappears (owner 2026-10-03). Search lists stocked places only.
  const summaries = useMemo(() => summarizeStockLocations(rows), [rows]);
  const stocked = useMemo(() => summaries.filter((summary) => !summary.empty), [summaries]);
  const room = rooms.find((facet) => facet.id === scope.room) ?? null;
  const numericAisle = typeof scope.aisle === 'number' ? scope.aisle : null;

  const chips: PathChip[] = [{ id: 'rooms', value: 'Rooms', href: stockDrillHref({}), testId: 'stock-path-rooms' }];
  if (room) chips.push({ id: 'room', value: room.label, href: stockDrillHref({ room: room.id }), testId: 'stock-path-room' });
  if (room && scope.aisle != null) {
    chips.push(
      scope.aisle === STOCK_DRILL_OTHER
        ? { id: 'aisle', value: 'Other locations', testId: 'stock-path-aisle' }
        : { id: 'aisle', label: 'Aisle', value: pad2(scope.aisle), href: stockDrillHref({ room: room.id, aisle: scope.aisle }), testId: 'stock-path-aisle' },
    );
  }
  if (room && numericAisle != null && scope.side) {
    chips.push({
      id: 'side',
      value: BAY_SIDE_FACE[scope.side].short,
      href: stockDrillHref({ room: room.id, aisle: numericAisle, side: scope.side }),
      testId: 'stock-path-side',
    });
  }
  if (room && numericAisle != null && scope.bay != null) {
    chips.push({ id: 'bay', label: 'Bay', value: pad2(scope.bay), testId: 'stock-path-bay' });
  }
  const currentChip = chips[chips.length - 1]!.id;

  type SideChoice = { side: StockDrillSide; group: StockDrillGroup | null; href: string };
  type Listing = {
    /** Null when the path chips already say where the operator stands (the side choice). */
    label: string | null;
    rows: DetailNavItem[];
    /** The aisle level: two full-height choices (odd bays left | even bays right) instead of a list. */
    sides?: readonly [SideChoice, SideChoice];
    empty: string;
  };
  const listing = ((): Listing => {
    if (query) {
      // A code always offers its place first — at every level, so an empty place stays reachable.
      const segments = parseLabelCode(query);
      const codeRows: DetailNavItem[] = segments
        ? [{ id: 'code', title: `Open ${labelFace(segments)}`, icon: <MapPin />, meta: 'Location record', href: withJobReturn(locationHubPath(locationCodeFlat(segments)), returnTo) }]
        : [];
      if (!room) {
        // The room level holds no stock: a code opens its place; words narrow the rooms.
        const words = query.toLocaleLowerCase();
        return {
          label: 'Search results',
          rows: [
            ...codeRows,
            ...rooms
              .filter((facet) => facet.label.toLocaleLowerCase().includes(words))
              .map((facet) => ({ id: facet.id, title: facet.label, icon: <Warehouse />, meta: count(facet.count, 'location'), href: stockDrillHref({ room: facet.id }) })),
          ],
          empty: 'Type a location code, or pick a room to search its stock.',
        };
      }
      return {
        label: 'Search results',
        rows: [...codeRows, ...stocked.filter((summary) => stockLocationMatches(summary, query)).map((summary) => locationRow(summary, returnTo))],
        empty: `Nothing in ${room.label} matches “${query}”.`,
      };
    }
    if (!room) {
      return {
        label: 'Rooms',
        // Places with no room are a repair queue, not a room: last.
        rows: [...rooms]
          .sort((a, b) => Number(a.id === UNROOMED_FACET_ID) - Number(b.id === UNROOMED_FACET_ID))
          .map((facet) => ({ id: facet.id, title: facet.label, icon: <Warehouse />, meta: count(facet.count, 'location'), href: stockDrillHref({ room: facet.id }) })),
        empty: 'No rooms yet.',
      };
    }
    if (scope.aisle == null) {
      const { aisles, other } = stockDrillAisles(summaries);
      // A room with no aisle grid (Showroom, a desk floor) lists its places here: no
      // "Other locations" hop that only repeats the room.
      if (aisles.length === 0) {
        return {
          label: `Locations in ${room.label}`,
          rows: stockDrillLocations(summaries, { ...scope, aisle: STOCK_DRILL_OTHER }).map((summary) => locationRow(summary, returnTo)),
          empty: `${room.label} has no locations yet.`,
        };
      }
      return {
        label: `Aisles in ${room.label}`,
        rows: [
          ...aisles.map((aisle) => ({
            id: `aisle-${aisle.key}`,
            title: `Aisle ${pad2(aisle.key)}`,
            icon: groupIcon(aisle, <MapPin />),
            meta: groupMeta(aisle, 'bay'),
            href: stockDrillHref({ room: room.id, aisle: aisle.key }),
          })),
          ...(other > 0
            ? [{ id: 'other', title: 'Other locations', icon: <Warehouse />, meta: `${other} without an aisle`, href: stockDrillHref({ room: room.id, aisle: STOCK_DRILL_OTHER }) }]
            : []),
        ],
        empty: `${room.label} has no locations yet.`,
      };
    }
    if (numericAisle != null && !scope.side) {
      // Stand in the aisle, pick the side you face, then its bays (owner 2026-10-03).
      const sides = stockDrillSides(summaries, numericAisle);
      const choice = (side: StockDrillSide): SideChoice => ({
        side,
        group: sides[side],
        href: stockDrillHref({ room: room.id, aisle: numericAisle, side }),
      });
      return {
        label: null,
        rows: [],
        sides: [choice('left'), choice('right')],
        empty: `Aisle ${pad2(numericAisle)} has no bays in ${room.label}.`,
      };
    }
    if (numericAisle != null && scope.side && scope.bay == null) {
      const face = BAY_SIDE_FACE[scope.side];
      return {
        label: `${face.bays} · ${face.side}`,
        // One list in bay order on the chosen side; the side is the heading, never repeated per bay.
        rows: stockDrillBays(summaries, numericAisle, scope.side).map((bay) => ({
          id: `bay-${bay.key}`,
          title: `Bay ${pad2(bay.key)}`,
          icon: groupIcon(bay, <MapPin />),
          meta: groupMeta(bay, null),
          href: stockDrillHref({ room: room.id, aisle: numericAisle, bay: bay.key }),
        })),
        empty: `No ${face.bays.toLocaleLowerCase()} in aisle ${pad2(numericAisle)}.`,
      };
    }
    return {
      label: scope.aisle === STOCK_DRILL_OTHER ? 'Other locations' : `Locations in bay ${pad2(scope.bay ?? 0)}`,
      rows: stockDrillLocations(summaries, scope).map((summary) => locationRow(summary, returnTo)),
      empty: 'No locations here.',
    };
  })();

  return (
    <div className="mx-auto flex min-h-full w-full max-w-3xl flex-col bg-mode-panel" data-testid="mobile-v2-stock" data-level={currentChip}>
      <div className="sticky top-0 z-sticky border-b border-mode-rule bg-mode-panel">
        <PathChips density="compact" chips={chips} currentId={currentChip} ariaLabel="Warehouse path" testId="stock-path" />
      </div>

      {listing.label ? (
        <h2 className="px-mode-page pb-1 pt-3 text-role-caption font-semibold text-text-muted" data-testid="stock-level-heading">
          {listing.label}
        </h2>
      ) : null}
      {listing.sides ? (
        // The two choices fill what is left of the screen, split down the middle.
        <div className="grid flex-1 grid-cols-2 border-t border-mode-rule" data-testid="stock-side-choice" role="group" aria-label={`Aisle ${pad2(numericAisle ?? 0)} sides`}>
          {listing.sides.map(({ side, group, href }) => (
            <Button
              key={side}
              variant="secondary"
              size="xl"
              radius="flush"
              className={cn(
                'h-full w-full flex-col gap-1 whitespace-normal border-0 px-3 text-center enabled:active:scale-100',
                MOBILE_DATA_LIST_ROW_INTERACTION_CLASS,
                side === 'right' && 'border-l border-mode-rule',
              )}
              disabled={!group}
              onClick={() => router.push(href)}
              data-testid={`stock-side-${side}`}
            >
              <span className="text-role-title font-semibold">{BAY_SIDE_FACE[side].bays}</span>
              <span className="text-mode-body">{BAY_SIDE_FACE[side].side}</span>
              <span className="text-role-caption font-normal text-mode-muted">
                {group ? groupMeta(group, 'bay') : 'No bays on this side'}
              </span>
            </Button>
          ))}
        </div>
      ) : listing.rows.length > 0 ? (
        <div data-testid="stock-level-rows">
          <DetailNav label={listing.label ?? 'Locations'} rows={listing.rows} />
        </div>
      ) : (
        <EmptyState title={listing.empty} />
      )}

      {capped ? (
        <p className="border-t border-mode-rule bg-surface-warning px-mode-page py-2 text-role-caption text-text-warning">
          This room is larger than the live feed. Open an aisle or search to narrow it.
        </p>
      ) : null}
    </div>
  );
}
