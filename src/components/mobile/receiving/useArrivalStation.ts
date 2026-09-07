'use client';

/**
 * Arrival station controller — the door's contextual scan loop.
 *
 * ## The contextual decision, in three reads and one write
 *
 * A carrier label arrives with no declaration of intent. What it MEANS depends
 * entirely on whether the warehouse has seen that tracking number before:
 *
 *   never seen  → this is an ARRIVAL. Record the incoming package.
 *   seen        → this box is already in the system. Report it; write nothing.
 *
 * So the loop is: classify the bytes (`arrivalScanIntent` — pure, no I/O),
 * then, for a carrier label, READ whether we know it
 * (`/api/receiving/preview-scan`, which creates nothing), then let the dispatch
 * table decide (`planDoorScan`), and only then commit through the same
 * `resolveViaLookupPo` rung the desktop station and `/m/scan` already use.
 *
 * The read before the write is the load-bearing part. `lookup-po` MINTS an
 * unfound carton for a never-seen tracking, so classifying from its response
 * alone cannot distinguish "this just arrived" from "this arrived on Tuesday" —
 * that is the exact defect `mobile-arrival-door.ts` was written to close.
 * Arrival differs from `/m/scan` only in what it does with the answer: `/m/scan`
 * paints a Card and lets the operator choose, whereas the DOOR station's scan
 * *is* the intake — the box is physically here, so the arrival is recorded and
 * the tape says so.
 *
 * ## Async, like the dock
 *
 * `submitRaw` never blocks the camera: the sheet keeps decoding while a commit
 * is in flight, several scans can be settling at once, and every settle is
 * handed up in ARRIVAL order (`onSettled`) rather than through a single "active"
 * slot a faster response would overwrite.
 *
 * ## No outbox, deliberately
 *
 * Scan-out queues a failed confirm because the package genuinely left the
 * building — the fact is true whether or not the wifi carried it. An arrival
 * that never reached the server is the opposite: nothing is recorded, the box is
 * still un-arrived, and only a re-scan makes it real. A queue here would tell
 * the operator a carton is logged when it is not.
 */

import { useCallback, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { resolveViaLookupPo } from '@/lib/receiving/scan';
import type { LookupPoData } from '@/lib/receiving/scan';
import { buildScanVerdict, scanFailureVerdict } from '@/components/mobile/redesign/scan-verdict';
import {
  arrivalScanIntent,
  planDoorScan,
  trackingSeenFromPreview,
} from '@/lib/scan/mobile-arrival-door';
import { mobileFeedQueryKey } from '@/lib/receiving/mobile-feed-query-key';
import type { SettledArrival } from './arrival-station-tape';

interface PreviewHit {
  receivingId: number;
  title: string | null;
  poNumber: string | null;
  status: string | null;
}

interface PreviewAnswer {
  matched: boolean;
  hit: PreviewHit | null;
}

/**
 * Read-only: has this tracking already been scanned into the system?
 *
 * `mode=tracking`, never `auto`: the door reads carrier labels, and letting the
 * PO/ticket rungs answer would call a box "already arrived" because its PURCHASE
 * ORDER is known — which is true of every expected delivery and would make the
 * station unable to arrive anything.
 *
 * Throws on a non-OK response. That is deliberate: a failed read means we do not
 * know whether this box is new, and guessing "new" mints a duplicate carton.
 */
async function previewTracking(raw: string): Promise<PreviewAnswer> {
  const res = await fetch(
    `/api/receiving/preview-scan?value=${encodeURIComponent(raw)}&mode=tracking`,
    { credentials: 'include' },
  );
  if (!res.ok) throw new Error(`preview-scan failed (${res.status})`);
  const json = (await res.json()) as { matched?: boolean; hit?: PreviewHit | null };
  return { matched: trackingSeenFromPreview(json.matched), hit: json.hit ?? null };
}

/** First line's product name off a lookup-po response, when it carried lines. */
function firstLineTitle(data: LookupPoData): string | null {
  const lines = data.lines;
  if (!Array.isArray(lines) || lines.length === 0) return null;
  const row = lines[0] as Record<string, unknown> | null;
  for (const key of ['catalog_product_title', 'zoho_item_title', 'item_name']) {
    const value = row?.[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return null;
}

export interface ArrivalStationOptions {
  /** Called once per settled scan, in arrival order. */
  onSettled?: (settled: SettledArrival) => void;
}

export function useArrivalStation(options: ArrivalStationOptions = {}) {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const staffId = Number(user?.staffId ?? 0);

  // Kept in a ref so a caller can pass an inline closure without re-creating
  // `submitRaw` on every render — the capture sheet holds it in a ref of its own
  // and a new identity each render is a new decode subscription.
  const onSettledRef = useRef(options.onSettled);
  onSettledRef.current = options.onSettled;

  const [inFlight, setInFlight] = useState(0);
  /** Submit order, monotonic. The tape's row key, and the settle's identity. */
  const seqRef = useRef(0);

  const submitRaw = useCallback(
    (raw: string) => {
      const value = raw.trim();
      if (!value) return;

      const seq = ++seqRef.current;
      setInFlight((n) => n + 1);

      const settle = (settled: Omit<SettledArrival, 'seq' | 'scanned'>) => {
        onSettledRef.current?.({ ...settled, seq, scanned: value });
      };

      void (async () => {
        const intent = arrivalScanIntent(value);

        // The wrong label, refused before anything is written. A carton minted
        // for a product barcode is a phantom box somebody has to hunt down.
        if (intent.kind === 'refused') {
          settle({
            status: 'refused',
            receivingId: null,
            title: null,
            tracking: null,
            recordId: null,
            imageUrl: null,
            message: intent.reason,
          });
          return;
        }

        // One of our own carton stickers. The receiving id is IN the label, so
        // the box is in the system by construction — no read, no write.
        if (intent.kind === 'carton') {
          settle({
            status: 'known',
            receivingId: intent.receivingId,
            title: null,
            tracking: intent.value,
            recordId: null,
            imageUrl: null,
            message: 'This is our own carton label — the box is already logged.',
          });
          return;
        }

        try {
          const preview = await previewTracking(intent.value);
          const plan = planDoorScan(intent.value, preview.matched);

          // Seen before. Nothing is written: a second arrival row for one box
          // double-counts the carton and sends two people to unbox it.
          if (!plan.openArrival) {
            const hit = preview.hit;
            settle({
              status: 'known',
              receivingId: hit?.receivingId ?? null,
              title: hit?.title ?? null,
              tracking: intent.value,
              recordId: hit?.poNumber ?? null,
              imageUrl: null,
              message: hit?.status
                ? `Already logged — this carton is ${hit.status.toLowerCase()}.`
                : 'Already logged. Open it to carry on where it was left.',
            });
            return;
          }

          // Never seen: THIS is the arrival. The commit stamps door-received
          // (`intakeSurface: 'triage'`) and mints or adopts the carton.
          const resolution = await resolveViaLookupPo(
            {
              callValue: intent.value,
              callMode: 'tracking',
              originalMode: 'tracking',
              staffId,
              intakeSurface: 'triage',
            },
            {
              lookupPo: async (body) => {
                const res = await fetch('/api/receiving/lookup-po', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  credentials: 'include',
                  body: JSON.stringify(body),
                });
                return res.json();
              },
            },
          );
          const verdict = buildScanVerdict(intent.value, resolution);

          // `not_found` / `integration-error` wrote no carton, so neither is an
          // arrival — the row carries the server's own reason instead of
          // claiming a box that does not exist.
          const status =
            resolution.kind === 'matched' || resolution.kind === 'unmatched'
              ? 'arrived'
              : resolution.kind === 'not_found'
                ? 'refused'
                : 'err';

          settle({
            status,
            receivingId: verdict.receivingId,
            title: firstLineTitle(resolution.data),
            tracking: intent.value,
            recordId: verdict.poIds[0] ?? null,
            imageUrl: null,
            message: verdict.detail,
          });
        } catch (err) {
          // A dead preview and a dead commit land here alike, and both mean the
          // same thing at the door: this box is NOT recorded yet.
          settle({
            status: 'err',
            receivingId: null,
            title: null,
            tracking: intent.value,
            recordId: null,
            imageUrl: null,
            message: scanFailureVerdict(intent.value, err).detail,
            transportFailed: true,
          });
        }
      })().finally(() => {
        setInFlight((n) => Math.max(0, n - 1));
        // The arrival feed the tape seeds from, and the desktop triage rails the
        // same carton has to appear in.
        void queryClient.invalidateQueries({ queryKey: mobileFeedQueryKey('triage') });
        void queryClient.invalidateQueries({ queryKey: ['receiving', 'triage', 'unfound-list'] });
      });
    },
    [queryClient, staffId],
  );

  return { submitRaw, inFlight };
}
