'use client';

/**
 * /m/unbox — the unbox bench on the station harness.
 *
 * The scan loop is UNCHANGED from the surface it replaces (`Receive.tsx`,
 * retired with this port): the same `/api/receiving/lookup-po` rung, the same
 * optimistic pending row, the same speed-first `localOnly` resolution with
 * operator-initiated Zoho re-checks on the carton page. What changed is the
 * chrome: the camera lives in the bottom-anchored capture sheet (it was a
 * toggle button and a 35vh viewport UNDER the input bar), the results are the
 * upward tape (they were a filterable feed under a top-mounted text field),
 * and the ranking the filters used to express is now the tape's verb + ground
 * ("Unbox first" paints warn) with live counts in the sheet's status line.
 *
 * ## Offline is a no here, like the door and unlike the dock
 *
 * lookup-po MINTS an unfound carton for a never-seen tracking — a queued
 * write would claim a carton exists before the server agrees, and the bench
 * would tell someone to open a box the system has never heard of.
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
import { PackageOpen } from '@/components/Icons';
import { unboxStatus, unboxTapeEntry, type UnboxScanInput } from './unbox-station-tape';

type UnboxVerdict = 'expedited' | 'normal' | 'unfound';

interface ScanResult extends UnboxScanInput {
  at: string;
}

export default function MobileUnboxStation() {
  const router = useRouter();
  const [scans, setScans] = useState<ScanResult[]>([]);
  const inFlight = useRef(false);

  // ── the loop, carried verbatim from the retired surface ────────────────────
  const lookup = useCallback(async (value: string) => {
    const tracking = value.trim();
    if (!tracking || inFlight.current) return;
    inFlight.current = true;

    const tempId = `${Date.now()}-${tracking}`;
    const at = new Date().toISOString();
    // Optimistic "pending" row while the lookup runs.
    setScans((prev) =>
      [{ id: tempId, tracking, status: 'pending' as const, at, poLabel: null, receivingId: null, lineCount: 0, verdict: null }, ...prev].slice(0, 50),
    );

    try {
      const res = await fetch('/api/receiving/lookup-po', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          trackingNumber: tracking,
          intakeSurface: 'unbox',
          // SPEED-FIRST: resolve from LOCAL data only — no synchronous Zoho
          // round-trip on the scan path (desktop parity). A local miss still
          // creates + returns the unfound carton (receiving_id set), so the
          // row resolves instantly and links to /m/r/[id]; live Zoho re-checks
          // are operator-initiated there (UnfoundMatchStrip) with the
          // reconcile cron as the passive backstop.
          localOnly: true,
        }),
      });
      const data = await res.json().catch(() => null);

      if (!res.ok || !data) {
        setScans((prev) => prev.map((s) => (s.id === tempId ? { ...s, status: 'error' as const } : s)));
        return;
      }

      const matched = Boolean(data.po_matched ?? data.matched);
      const poLabel: string | null =
        Array.isArray(data.po_ids) && data.po_ids.length > 0 ? `PO ${data.po_ids[0]}` : null;

      // Prefer the server's explicit verdict; fall back to deriving it from
      // po_matched + pending_order_skus for older response shapes.
      const verdict: UnboxVerdict = ((): UnboxVerdict => {
        const v = data.unbox_verdict;
        if (v === 'expedited' || v === 'normal' || v === 'unfound') return v;
        if (!matched) return 'unfound';
        return Array.isArray(data.pending_order_skus) && data.pending_order_skus.length > 0
          ? 'expedited'
          : 'normal';
      })();

      setScans((prev) =>
        prev.map((s) =>
          s.id === tempId
            ? {
                ...s,
                status: matched ? ('matched' as const) : ('unmatched' as const),
                poLabel,
                receivingId: typeof data.receiving_id === 'number' ? data.receiving_id : null,
                lineCount: Array.isArray(data.lines) ? data.lines.length : 0,
                verdict,
              }
            : s,
        ),
      );
    } catch {
      setScans((prev) => prev.map((s) => (s.id === tempId ? { ...s, status: 'error' as const } : s)));
    } finally {
      inFlight.current = false;
    }
  }, []);

  // ── the tape ───────────────────────────────────────────────────────────────
  const tape = useMemo<StationTapeEntry[]>(
    () => scans.reduce<StationTapeEntry[]>((acc, s) => pushStationTape(acc, unboxTapeEntry(s, s.at)), []),
    [scans],
  );

  // One action per resolved row: open the carton. pending/error rows offer none.
  const actions = useMemo(() => {
    const map = new Map<string, StationItemAction>();
    for (const s of scans) {
      if (s.status !== 'matched' && s.status !== 'unmatched') continue;
      if (s.receivingId == null) continue;
      const id = s.receivingId;
      map.set(`carton:${id}`, {
        label: 'Open carton',
        pendingLabel: 'Opening…',
        run: () => router.push(`/m/r/${id}`),
        pending: false,
      });
    }
    return map;
  }, [scans, router]);

  const itemAction = useCallback(
    (entry: StationTapeEntry): StationItemAction | null =>
      (entry.dedupeKey && actions.get(entry.dedupeKey)) || null,
    [actions],
  );

  return (
    <MobileStationShell
      tape={tape}
      untitledLabel="Unresolved carton"
      empty={
        <div className="flex flex-col items-center gap-3 px-8 pb-6 text-center">
          <PackageOpen className="h-8 w-8 text-text-muted" aria-hidden />
          <p className="text-role-eyebrow uppercase text-text-soft">
            Scan a carton to open it on the bench
          </p>
        </div>
      }
      itemAction={itemAction}
      window={
        <MobileCaptureWindow
          label="Unbox camera"
          collapsedLabel="Scan a carton"
          status={unboxStatus(scans)}
          onDecode={lookup}
        />
      }
    />
  );
}
