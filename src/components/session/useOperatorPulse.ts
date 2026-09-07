'use client';

/**
 * The home surface's first-row data feed.
 *
 * ONE request to `/api/home-board` — the route that dispatches registered
 * assistant tools through `runAssistantTool`. The pulse strip, the board rail,
 * and the model's own answer therefore read the same query with the same
 * permission check; there is no first-row endpoint to drift from them.
 *
 * ## Refresh policy
 *
 * A shift leaves this screen open for hours, so a mount-only fetch would paint
 * a stale row all afternoon. It refreshes on mount, on window focus (the
 * operator coming back from the packing bench), and on a 60s interval — but
 * ONLY while the tab is visible: a hidden tab polling org-scoped reads on the
 * tenant pool is how a shared pool starves for no one's benefit.
 *
 * A failed poll keeps the last good row rather than blanking it. The first row
 * is a standing instrument; an empty strip means "nothing is stuck", and a
 * network blip must never say that.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import type { BoardTilePayload } from '@/components/session/board/board-tiles';
import { operatorPulse, type PulseItem } from '@/lib/assistant/operator-pulse';

const POLL_MS = 60_000;

export function useOperatorPulse(): { items: PulseItem[]; loading: boolean; refresh: () => void } {
  const [items, setItems] = useState<PulseItem[]>([]);
  // `loading` is true only until the FIRST answer lands. Later polls are
  // silent: a spinner replacing a live row every minute is a worse instrument
  // than a row that is up to 60 seconds old.
  const [loading, setLoading] = useState(true);
  const alive = useRef(true);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/home-board', { credentials: 'include' });
      if (!res.ok) return;
      const data = (await res.json()) as { tiles?: BoardTilePayload[] };
      if (!alive.current) return;
      setItems(operatorPulse(data.tiles ?? []));
    } catch {
      /* keep the last good row */
    } finally {
      if (alive.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    alive.current = true;
    void load();
    const tick = () => {
      if (document.visibilityState === 'visible') void load();
    };
    const timer = window.setInterval(tick, POLL_MS);
    window.addEventListener('focus', tick);
    document.addEventListener('visibilitychange', tick);
    return () => {
      alive.current = false;
      window.clearInterval(timer);
      window.removeEventListener('focus', tick);
      document.removeEventListener('visibilitychange', tick);
    };
  }, [load]);

  return { items, loading, refresh: load };
}
