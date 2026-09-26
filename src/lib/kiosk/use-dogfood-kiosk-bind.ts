'use client';

/** Wait until this browser holds a `cf_kiosk` cookie for organization one. */

import { useEffect, useState } from 'react';

export function useDogfoodKioskBind(): boolean {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch('/api/kiosk/dev-autopair', {
          method: 'POST',
          credentials: 'include',
        });
        if (!res.ok) {
          console.error('[dogfood-kiosk-bind] autopair failed', res.status);
        }
      } finally {
        if (!cancelled) setReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return ready;
}
