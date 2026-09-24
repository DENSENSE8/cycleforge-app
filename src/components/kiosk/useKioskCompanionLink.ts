'use client';

/**
 * useKioskCompanionLink — the tablet's half of the phone companion.
 *
 * `open()` mints this tablet's link (a token shown as a QR). While a link is
 * live the tablet syncs about once a second: it pushes its device snapshot
 * (what the phone shows) and applies every serial the phone scanned since the
 * last sync through `onSerial` — the same line write the serial field makes,
 * so a scanned serial and a typed one are the same fact.
 *
 * The link outlives the pane. The repair flow unmounts whenever the staffer
 * goes back to the catalog (the X, `+ Add another device`), and a phone that
 * joined for the first device must still reach the second — so the link is
 * held at module scope for the life of the page, not in component state.
 *
 * Callers: `KioskRepairPane` (Device & quote).
 * Affected API: POST `/api/kiosk/companion`, POST `/api/kiosk/companion/sync`
 *   (both `kioskFetchHealed`).
 * Schemas: `CompanionDevice` / `CompanionSerial`.
 * User: "scan something like a serial number to input and update the form on
 *   your phone as well".
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { kioskFetchHealed } from '@/lib/kiosk/kiosk-self-heal';
import type { CompanionDevice, CompanionSerial } from '@/lib/kiosk/companion-shape';

export interface KioskCompanionLink {
  /** What the QR encodes: the phone page, carrying the token. */
  url: string;
  expiresAt: string;
}

/** One sync a second: a scan shows up on the tablet about a second after the beep. */
const SYNC_MS = 1000;

let heldLink: KioskCompanionLink | null = null;

function liveLink(): KioskCompanionLink | null {
  if (heldLink && Date.parse(heldLink.expiresAt) <= Date.now()) heldLink = null;
  return heldLink;
}

export function useKioskCompanionLink({
  devices,
  onSerial,
}: {
  devices: readonly CompanionDevice[];
  /** Write one scanned serial onto its cart line. */
  onSerial: (serial: CompanionSerial) => void;
}) {
  const [link, setLink] = useState<KioskCompanionLink | null>(liveLink);
  const [opening, setOpening] = useState(false);
  const latest = useRef({ devices, onSerial });
  latest.current = { devices, onSerial };

  const open = useCallback(async () => {
    setOpening(true);
    try {
      const res = await kioskFetchHealed('/api/kiosk/companion', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ devices: latest.current.devices }),
      });
      if (!res.ok) return;
      const json = (await res.json()) as { token: string; expiresAt: string };
      heldLink = {
        url: `${window.location.origin}/m/repair-scan?t=${encodeURIComponent(json.token)}`,
        expiresAt: json.expiresAt,
      };
      setLink(heldLink);
    } finally {
      setOpening(false);
    }
  }, []);

  useEffect(() => {
    if (!link) return;
    let inFlight = false;
    let stopped = false;
    const sync = async () => {
      if (inFlight || stopped) return;
      inFlight = true;
      try {
        const res = await kioskFetchHealed('/api/kiosk/companion/sync', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ devices: latest.current.devices }),
        });
        if (res.status === 404) {
          heldLink = null;
          if (!stopped) setLink(null);
          return;
        }
        if (!res.ok) return;
        const json = (await res.json()) as { pending: CompanionSerial[] };
        for (const serial of json.pending) latest.current.onSerial(serial);
      } catch {
        // A dropped sync is retried on the next tick; the phone's scan waits
        // in `pending_serials` until one lands.
      } finally {
        inFlight = false;
      }
    };
    void sync();
    const timer = window.setInterval(() => void sync(), SYNC_MS);
    return () => {
      stopped = true;
      window.clearInterval(timer);
    };
  }, [link]);

  return { link, opening, open };
}
