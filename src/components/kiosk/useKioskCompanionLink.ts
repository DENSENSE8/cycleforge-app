'use client';

/** useKioskCompanionLink — the tablet's half of the phone companion. */

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
