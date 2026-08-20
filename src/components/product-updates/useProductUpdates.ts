'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useStaffPreferences } from '@/hooks/useStaffPreferences';
import {
  latestProductUpdate,
  type ProductUpdate,
} from '@/data/product-updates';

const VERSION_POLL_MS = 120_000;

/**
 * Device-local seen marker, written SYNCHRONOUSLY on Got it.
 *
 * The server pref (`lastSeenProductUpdateId`) is the durable cross-device SoT,
 * but it lands one round-trip later — and the host remounts whenever the auth
 * gate flips, which re-ran the auto-open before that write returned and popped
 * the panel back open. This key closes that window.
 */
const SEEN_STORAGE_KEY = 'cf.productUpdateSeen';

export type ProductUpdatesState = {
  latest: ProductUpdate | null;
  open: boolean;
  staleDeploy: boolean;
  prefsLoading: boolean;
  dismiss: () => void;
  refresh: () => void;
};

function seenToken(latest: ProductUpdate): string {
  return `${latest.id}:${latest.buildSha ?? ''}`;
}

function readSeenToken(): string | null {
  try {
    return window.localStorage.getItem(SEEN_STORAGE_KEY);
  } catch {
    return null;
  }
}

function isUnseen(
  latest: ProductUpdate | null,
  lastSeenId: string | null | undefined,
  lastSeenSha: string | null | undefined,
): boolean {
  if (!latest) return false;
  if (readSeenToken() === seenToken(latest)) return false;
  if (lastSeenId !== latest.id) return true;
  if (latest.buildSha && lastSeenSha !== latest.buildSha) return true;
  return false;
}

/**
 * Product-updates state machine.
 *
 * One shot per staffer per update: an unseen update auto-opens the panel, and
 * Got it retires it for good — there is no residual "What's new" chip and no
 * reopen. The only thing that can claim the corner afterwards is a NEW deploy
 * detected by the `/api/version` poll (120s), which offers a refresh chip.
 *
 * Got it persists last-seen on staff_preferences (cross-device) AND on
 * localStorage (immediate, remount-proof).
 */
export function useProductUpdates(): ProductUpdatesState {
  const { prefs, isLoading, update } = useStaffPreferences();
  const latest = latestProductUpdate();

  const [open, setOpen] = useState(false);
  const [staleDeploy, setStaleDeploy] = useState(false);
  const autoOpenedRef = useRef(false);
  const loadShaRef = useRef<string | null>(null);

  useEffect(() => {
    if (isLoading || prefs === undefined || autoOpenedRef.current) return;
    autoOpenedRef.current = true;
    if (isUnseen(latest, prefs.lastSeenProductUpdateId, prefs.lastSeenBuildSha)) {
      setOpen(true);
    }
  }, [isLoading, prefs, latest]);

  useEffect(() => {
    let cancelled = false;

    async function tick() {
      try {
        const res = await fetch('/api/version', { cache: 'no-store' });
        if (!res.ok) return;
        const body = (await res.json()) as { sha?: unknown };
        if (typeof body.sha !== 'string' || body.sha.length === 0) return;
        if (loadShaRef.current == null) {
          loadShaRef.current = body.sha;
          return;
        }
        if (body.sha !== loadShaRef.current && !cancelled) {
          setStaleDeploy(true);
        }
      } catch {
        // Quiet — a missed poll must never toast or reload.
      }
    }

    void tick();
    const id = window.setInterval(tick, VERSION_POLL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, []);

  const dismiss = useCallback(() => {
    if (latest) {
      try {
        window.localStorage.setItem(SEEN_STORAGE_KEY, seenToken(latest));
      } catch {
        // Private mode / quota — the server pref below still carries it.
      }
      update({
        lastSeenProductUpdateId: latest.id,
        lastSeenBuildSha: latest.buildSha ?? null,
      });
    }
    setOpen(false);
  }, [latest, update]);

  const refresh = useCallback(() => {
    window.location.reload();
  }, []);

  return {
    latest,
    open,
    staleDeploy,
    prefsLoading: isLoading,
    dismiss,
    refresh,
  };
}
