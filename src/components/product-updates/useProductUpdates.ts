'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useStaffPreferences } from '@/hooks/useStaffPreferences';
import {
  latestProductUpdate,
  type ProductUpdate,
} from '@/data/product-updates';

const VERSION_POLL_MS = 120_000;

export type ProductUpdatesState = {
  latest: ProductUpdate | null;
  open: boolean;
  unseen: boolean;
  staleDeploy: boolean;
  prefsLoading: boolean;
  dismiss: () => void;
  reopen: () => void;
  refresh: () => void;
};

function isUnseen(
  latest: ProductUpdate | null,
  lastSeenId: string | null | undefined,
  lastSeenSha: string | null | undefined,
): boolean {
  if (!latest) return false;
  if (lastSeenId !== latest.id) return true;
  if (latest.buildSha && lastSeenSha !== latest.buildSha) return true;
  return false;
}

/**
 * Product-updates state machine.
 *
 * The host mounts once in the root layout, so the first mount is a full
 * document load (hard refresh / new deploy). Client-side Next navigations
 * do not remount the host and therefore do not re-pop the panel.
 *
 * Auto-open: prefs loaded + latest unseen (id or buildSha) → start open.
 * Dismiss / Got it persists last-seen on staff_preferences.
 * Chip click reopens without requiring unseen.
 * `/api/version` poll (120s): sha changed vs page-load capture → staleDeploy.
 */
export function useProductUpdates(): ProductUpdatesState {
  const { prefs, isLoading, update } = useStaffPreferences();
  const latest = latestProductUpdate();

  const [open, setOpen] = useState(false);
  const [staleDeploy, setStaleDeploy] = useState(false);
  const autoOpenedRef = useRef(false);
  const loadShaRef = useRef<string | null>(null);

  const unseen =
    !isLoading &&
    prefs !== undefined &&
    isUnseen(latest, prefs.lastSeenProductUpdateId, prefs.lastSeenBuildSha);

  useEffect(() => {
    if (isLoading || autoOpenedRef.current) return;
    autoOpenedRef.current = true;
    if (unseen) setOpen(true);
  }, [isLoading, unseen]);

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
      update({
        lastSeenProductUpdateId: latest.id,
        lastSeenBuildSha: latest.buildSha ?? null,
      });
    }
    setOpen(false);
  }, [latest, update]);

  const reopen = useCallback(() => setOpen(true), []);
  const refresh = useCallback(() => {
    window.location.reload();
  }, []);

  return {
    latest,
    open,
    unseen,
    staleDeploy,
    prefsLoading: isLoading,
    dismiss,
    reopen,
    refresh,
  };
}
