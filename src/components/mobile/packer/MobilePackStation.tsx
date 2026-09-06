'use client';

/**
 * /m/pack — the pack bench on the station harness.
 *
 * The gesture is the desk's own, moved to where the boxes are: scan the label
 * on the sealed box → `POST /api/packerlogs` → the pack is recorded with
 * station-activity + audit inside that route (idempotent by clientEventId,
 * server-trusted actor). No new endpoint was built for this station; the
 * operator-approved context-read turned out unnecessary because the write
 * model is shipment-level, not item-level.
 *
 * The tape is the shift's boxes, newest first, one row per shipment. A packed
 * row's action opens the pack's photo flow (`/m/p/{id}/photos`) — the same
 * route the old feed's camera CTA used. The old feed (`MobilePackingList`)
 * stays a component; this surface replaced its page because a station is what
 * the bench actually is.
 *
 * ## Offline is a no
 *
 * See `pack-station-tape.ts` — the write resolves the shipment server-side,
 * so a queue could not key its rows. The status line says OFFLINE and nothing
 * is recorded until the wifi returns.
 */

import { useCallback, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { MobileStationShell } from '@/components/mobile/station/MobileStationShell';
import { MobileCaptureWindow } from '@/components/mobile/station/MobileCaptureWindow';
import {
  pushStationTape,
  type StationItemAction,
  type StationTapeEntry,
} from '@/components/mobile/station/station-tape';
import { PackageCheck } from '@/components/Icons';
import { useNetworkOnline } from '@/hooks/useConnectionHealth';
import { useScanFeedback } from '@/lib/scan-feedback/useScanFeedback';
import { vibrateScan } from '@/lib/scan-feedback/play';
import { packTapeEntry, type SettledPack } from './pack-station-tape';

/** The POST's row shape, as far as this station reads it. */
interface PackerLogRow {
  id?: number;
  shipmentId?: number | null;
  error?: string;
}

export default function MobilePackStation() {
  const router = useRouter();
  const [tape, setTape] = useState<StationTapeEntry[]>([]);
  const [inFlight, setInFlight] = useState(0);
  const [packed, setPacked] = useState(0);
  const [packerLogIds, setPackerLogIds] = useState<Record<string, number>>({});
  const seqRef = useRef(0);
  const { playScanFeedback, hapticOn } = useScanFeedback();
  const online = useNetworkOnline();

  const submitRaw = useCallback(
    async (raw: string) => {
      const scan = raw.trim();
      if (!scan) return;

      const settle = (settled: SettledPack, kind: 'success' | 'reject') => {
        setTape((prev) => pushStationTape(prev, packTapeEntry(settled, new Date().toISOString())));
        playScanFeedback(kind);
        if (!hapticOn) vibrateScan(kind);
      };

      // OFFLINE IS A NO (file docblock): nothing is recorded; the operator
      // rescans when the wifi returns.
      if (!online) {
        settle(
          { scan, status: 'error', shipmentId: null, packerLogId: null, message: 'Offline — nothing is recorded' },
          'reject',
        );
        return;
      }

      const clientEventId =
        typeof crypto !== 'undefined' && 'randomUUID' in crypto
          ? crypto.randomUUID()
          : `pack-${Date.now()}-${(seqRef.current += 1)}`;

      setInFlight((n) => n + 1);
      try {
        const res = await fetch('/api/packerlogs', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            shippingTrackingNumber: scan,
            trackingType: 'ORDERS',
            clientEventId,
          }),
        });
        const data = (await res.json().catch(() => null)) as PackerLogRow | null;
        const ok = res.ok && !!data && !data.error;

        if (ok) {
          setPacked((n) => n + 1);
          if (typeof data?.id === 'number') {
            const logId = data.id;
            setPackerLogIds((prev) => ({ ...prev, [scan]: logId }));
          }
        }
        settle(
          {
            scan,
            status: ok ? 'packed' : 'error',
            shipmentId: typeof data?.shipmentId === 'number' ? data.shipmentId : null,
            packerLogId: ok && typeof data?.id === 'number' ? data.id : null,
            message: ok ? null : (data?.error ?? `Not recorded (${res.status})`),
          },
          ok ? 'success' : 'reject',
        );
      } catch {
        settle(
          { scan, status: 'error', shipmentId: null, packerLogId: null, message: 'Network error — not recorded' },
          'reject',
        );
      } finally {
        setInFlight((n) => Math.max(0, n - 1));
      }
    },
    [online, playScanFeedback, hapticOn],
  );

  // The row action: the pack's photo flow, same route the old feed linked to.
  const actions = useMemo(() => {
    const map = new Map<string, StationItemAction>();
    for (const [scan, logId] of Object.entries(packerLogIds)) {
      map.set(`scan:${scan}`, {
        label: 'Add photos',
        pendingLabel: 'Opening…',
        run: () => router.push(`/m/p/${logId}/photos`),
        pending: false,
      });
    }
    return map;
  }, [packerLogIds, router]);

  const itemAction = useCallback(
    (entry: StationTapeEntry): StationItemAction | null =>
      (entry.dedupeKey && actions.get(entry.dedupeKey)) || null,
    [actions],
  );

  const status = useMemo(() => {
    if (!online) return 'Offline — nothing is recorded';
    if (inFlight > 0) return `${inFlight} in flight`;
    return `${packed} packed`;
  }, [online, inFlight, packed]);

  return (
    <MobileStationShell
      tape={tape}
      untitledLabel="Unresolved label"
      empty={
        <div className="flex flex-col items-center gap-3 px-8 pb-6 text-center">
          <PackageCheck className="h-8 w-8 text-text-muted" aria-hidden />
          <p className="text-role-eyebrow uppercase text-text-soft">
            Scan a box label to record the pack
          </p>
        </div>
      }
      itemAction={itemAction}
      window={
        <MobileCaptureWindow
          label="Pack camera"
          collapsedLabel="Scan a box"
          status={status}
          statusAlert={!online}
          onDecode={submitRaw}
        />
      }
    />
  );
}
