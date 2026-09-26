'use client';

/**
 * The counter visit a staff phone is joined to — the one read the hub and its
 * `/info` share, and the one write the hub makes.
 *
 * The read polls (the tablet syncs about once a second). `null` data is an
 * ended link (404): polling stops and the screens say so. The write is the
 * companion's existing serial POST carrying the unit's WHOLE serial list
 * (`serial-list.ts`) — the tablet applies it through the same line write its
 * serial field makes (`patchDevice`); nothing here writes a cart line.
 *
 * Each write is built on the list the phone last wrote for that unit, never
 * on a snapshot that has not caught up (`layPhoneWrites`), and the POSTs go
 * out one at a time in order — so two quick scans on one chassis land as two
 * serials, not as the second replacing the first.
 *
 * Callers: `RepairScanCompanion` (`/m/repair-scan`), `/m/repair-scan/info`.
 * Affected API: GET/POST `/api/counter/companion`.
 * Schemas: `CompanionVisit`, `CompanionDevice`.
 */

import { useCallback, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  layPhoneWrites,
  mergeCompanionDevices,
  type CompanionDevice,
  type CompanionVisit,
  type PhoneSerialWrite,
} from '@/lib/kiosk/companion-shape';
import { qk } from '@/queries/keys';

/** The tablet syncs once a second; reading a touch slower keeps the phone quiet. */
const POLL_MS = 1500;

export const repairScanHubHref = (token: string) => `/m/repair-scan?t=${encodeURIComponent(token)}`;
export const repairScanInfoHref = (token: string) => `/m/repair-scan/info?t=${encodeURIComponent(token)}`;

export type SerialWriteResult = 'saved' | 'ended' | 'failed';

/** What a write did, and the unit's whole serial list it wrote. */
export interface SerialWrite {
  status: SerialWriteResult;
  serialNumber: string;
}

async function readVisit(token: string): Promise<CompanionVisit | null> {
  const res = await fetch(`/api/counter/companion?t=${encodeURIComponent(token)}`, { cache: 'no-store' });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error('Could not reach the tablet’s visit.');
  return (await res.json()) as CompanionVisit;
}

export function useRepairScanVisit(token: string) {
  const queryClient = useQueryClient();
  /** This phone's writes the snapshot may not show yet (`layPhoneWrites`). */
  const writes = useRef<PhoneSerialWrite[]>([]);
  /** The POST queue: one write on the wire at a time, in the order they were made. */
  const queue = useRef<Promise<unknown>>(Promise.resolve());

  const lay = useCallback((visit: CompanionVisit, readAt: number): CompanionVisit => {
    const { devices, unsettled } = layPhoneWrites(visit.devices, writes.current, readAt);
    writes.current = unsettled;
    return { ...visit, devices };
  }, []);

  const query = useQuery({
    queryKey: qk.kioskCompanion.phone(token),
    queryFn: async () => {
      const readAt = Date.now();
      const visit = await readVisit(token);
      return visit ? lay(visit, readAt) : visit;
    },
    refetchInterval: (q) => (q.state.data === null ? false : POLL_MS),
  });

  /**
   * Rewrite one unit's serial list: `next` gets the list the phone shows now
   * and returns the new one (`appendSerial` for a read, `removeSerial` for
   * Undo). The cache takes it at once, so focus moves before the round trip
   * lands and a fast second read builds on this one.
   */
  const writeSerial = useCallback(
    (lineId: string, next: (current: string) => string): Promise<SerialWrite> => {
      const key = qk.kioskCompanion.phone(token);
      const shown = queryClient.getQueryData<CompanionVisit | null>(key);
      const before = shown?.devices.find((d) => d.lineId === lineId)?.serialNumber ?? '';
      const serialNumber = next(before);
      const write: PhoneSerialWrite = { lineId, serialNumber, at: Date.now() };
      writes.current = [...writes.current.filter((w) => w.lineId !== lineId), write];
      queryClient.setQueryData<CompanionVisit | null>(key, (v) =>
        v ? { ...v, devices: mergeCompanionDevices(v.devices, [write]) } : v,
      );

      const post = async (): Promise<SerialWrite> => {
        const sentAt = Date.now();
        try {
          const res = await fetch('/api/counter/companion', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ token, lineId, serialNumber }),
          });
          if (res.status === 404) {
            queryClient.setQueryData(key, null);
            return { status: 'ended', serialNumber };
          }
          if (!res.ok) throw new Error(String(res.status));
          const { devices } = (await res.json()) as { devices: CompanionDevice[] };
          queryClient.setQueryData<CompanionVisit | null>(key, (v) => (v ? lay({ ...v, devices }, sentAt) : v));
          return { status: 'saved', serialNumber };
        } catch {
          // The write never landed: stop laying it over the tablet's list, and
          // put the unit's list back at once (unless a later write already
          // replaced it) so the next read is not aimed or checked against a
          // serial that is not there.
          writes.current = writes.current.filter((w) => w !== write);
          queryClient.setQueryData<CompanionVisit | null>(key, (v) =>
            v
              ? {
                  ...v,
                  devices: v.devices.map((d) =>
                    d.lineId === lineId && d.serialNumber === serialNumber ? { ...d, serialNumber: before } : d,
                  ),
                }
              : v,
          );
          void queryClient.invalidateQueries({ queryKey: key });
          return { status: 'failed', serialNumber };
        }
      };
      const sent = queue.current.then(post);
      queue.current = sent;
      return sent;
    },
    [lay, queryClient, token],
  );

  return {
    visit: query.data ?? null,
    ended: query.data === null,
    loading: query.isPending,
    error: query.data === undefined && query.error ? query.error.message : null,
    reload: () => void query.refetch(),
    writeSerial,
  };
}
