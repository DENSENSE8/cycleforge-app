'use client';

/**
 * @domain-job Ready-to-Pack station floor — the open order's packing desk face,
 *   a desk-barcode scan arm, and the Last entry · Move · benches · New
 *   location menu.
 * @hardware-target Station
 * @density floor
 * @justification Cannot reuse `UnboxNotesLocationControl` — that cluster writes
 *   `receiving_line_putaway` for a carton line and mounts inside the notes
 *   composer; this one writes `order_pack_placements` for an order and mounts
 *   on a station floor with no composer. The CHROME is shared
 *   ({@link StationLocationPill}); only the writer and the menu differ.
 *
 * **This replaced the wrap of desk chips in the middle.** The centre of a scan
 * station is the work — for Ready to Pack, the serials being paired — and a
 * bench picker sitting in it made the operator's eye stop on a destination
 * before they had done the job. The desks are still one click away, in the
 * menu of the pill that already says where the order IS.
 */

import { useCallback, useMemo } from 'react';
import { History, MapPin, Plus } from '@/components/Icons';
import { StationLocationPill } from '@/components/station/location';
import type { SlicedActionMenuItem } from '@/design-system/primitives';
import { EMPTY_LOCATION_FACE } from '@/lib/receiving/recent-staged-location';
import type { PackOrderPlacement } from './usePackOrderPlacement';

export function PackLocationControl({
  orderId,
  placement,
  onOpenLocations,
}: {
  orderId: number | null;
  placement: PackOrderPlacement;
  /** Open Ready-to-Pack Displays → Locations (browse · reprint · mint). */
  onOpenLocations?: () => void;
}) {
  const { enabled, busy, locationId, locationName, benches, recent, moveTo, locations } =
    placement;

  const face = (locationName || '').trim() || EMPTY_LOCATION_FACE;

  const applyRecent = useCallback(() => {
    if (!recent?.locationId) return;
    void moveTo({ locationId: recent.locationId });
  }, [moveTo, recent]);

  /**
   * A desk barcode (`PACK-DESK-01`) is not a flat shelf address, so the
   * arrival decoder would never claim it. Match the benches this station
   * already holds; anything else still goes to the server by barcode, which
   * owns the authoritative answer and says so when it is not a bench.
   */
  const applyScan = useCallback(
    (raw: string) => {
      const code = raw.trim().toUpperCase();
      const hit = locations.find(
        (l) =>
          (l.barcode ?? '').trim().toUpperCase() === code ||
          l.name.trim().toUpperCase() === code,
      );
      if (hit) {
        void moveTo({ locationId: hit.id });
        return;
      }
      void moveTo({ barcode: raw.trim() });
    },
    [locations, moveTo],
  );

  const hasRecent = Boolean(recent?.locationId);
  const recentLabel = (recent?.locationName || '').trim();

  const menu = useMemo<SlicedActionMenuItem[]>(() => {
    const items: SlicedActionMenuItem[] = [
      {
        label: hasRecent ? `Last entry · ${recentLabel}` : 'Last entry',
        title: hasRecent
          ? `Move to ${recentLabel} — the desk you used last`
          : 'No recent desk from another order yet',
        icon: <History className="h-3.5 w-3.5 shrink-0" />,
        disabled: !hasRecent || busy,
        onClick: applyRecent,
      },
      {
        label: 'Move',
        title: hasRecent
          ? `Move to ${recentLabel} without scanning`
          : 'No recent desk from another order yet',
        icon: <MapPin className="h-3.5 w-3.5 shrink-0" />,
        disabled: !hasRecent || busy,
        onClick: applyRecent,
      },
    ];

    benches.forEach((bench, index) => {
      items.push({
        label: bench.count > 0 ? `${bench.label} · ${bench.count}` : bench.label,
        title: `Move this order to ${bench.label}`,
        icon: <MapPin className="h-3.5 w-3.5 shrink-0" />,
        selected: bench.locationId === locationId,
        disabled: busy || bench.locationId === locationId,
        separatorBefore: index === 0,
        onClick: () => void moveTo({ locationId: bench.locationId }),
      });
    });

    items.push({
      label: 'New location',
      title: onOpenLocations
        ? 'Browse, reprint, or mint an address on Displays'
        : 'Locations are not available on this surface',
      icon: <Plus className="h-3.5 w-3.5 shrink-0" />,
      disabled: !onOpenLocations,
      separatorBefore: true,
      onClick: () => onOpenLocations?.(),
    });

    return items;
  }, [applyRecent, benches, busy, hasRecent, locationId, moveTo, onOpenLocations, recentLabel]);

  return (
    <div data-pack-location-control>
      <StationLocationPill
        face={face}
        tooltip={
          enabled
            ? locationName
              ? `Packing station · ${locationName}`
              : 'Not on a packing station yet'
            : 'Start an order to place it'
        }
        menu={menu}
        menuLabel="Packing station options"
        onScan={applyScan}
        sinkId={`pack-location:${orderId ?? 0}`}
        disabled={!enabled}
        busy={busy}
        testId="pack-location-pill"
      />
    </div>
  );
}
