'use client';

/**
 * URL ⇄ state for the Unbox Claim push column (`ReceivingClaimStack`).
 *
 * `?claimView=1` opens the station-scoped right-edge push work surface.
 * `?claimMode=link` selects Link-existing (omit / `create` = New ticket).
 *
 * Scoped so a stale editor can't bleed across selections:
 * - sibling-line switch clears the params;
 * - mode switch strips them via route owns;
 * - mutually exclusive with Ticket (`?ticketView=1`), Unbox tool push
 *   (move photos / photo note / audit), and `detail:receiving`.
 */

import { useCallback, useEffect, useRef } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { dispatchReceivingDetailsOverlayClose } from '@/utils/events';
import { clearPeerRightEdgeParams } from '../unbox-right-edge';
import type { ClaimModalMode } from '@/components/receiving/workspace/claim/claim-types';

const CLAIM_VIEW_PARAM = 'claimView';
const CLAIM_MODE_PARAM = 'claimMode';

/**
 * Pure decision for the clear-on-line-change effect. Clear only on a genuine
 * sibling-line switch — both ids known and different. A `null` previous id
 * (mount / deep-link resolve) must NOT self-clear.
 */
export function shouldClearClaimViewOnLineChange(
  prevLineId: number | null,
  currentLineId: number | null,
  claimViewOpen: boolean,
): boolean {
  return (
    claimViewOpen &&
    prevLineId != null &&
    currentLineId != null &&
    prevLineId !== currentLineId
  );
}

interface ReceivingClaimViewState {
  /** True when `?claimView=1` is present. */
  claimView: boolean;
  /** Wizard tab from `?claimMode=` — defaults to `create`. */
  claimMode: ClaimModalMode;
  /** Set/clear claim URL params; opening clears ticket + receiving details. */
  setClaimView: (on: boolean, mode?: ClaimModalMode) => void;
}

export function useReceivingClaimView(currentLineId: number | null): ReceivingClaimViewState {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const claimView = searchParams.get(CLAIM_VIEW_PARAM) === '1';
  const claimModeRaw = searchParams.get(CLAIM_MODE_PARAM);
  const claimMode: ClaimModalMode = claimModeRaw === 'link' ? 'link' : 'create';

  const setClaimView = useCallback(
    (on: boolean, mode: ClaimModalMode = 'create') => {
      const next = new URLSearchParams(searchParams.toString());
      if (on) {
        next.set(CLAIM_VIEW_PARAM, '1');
        // One right-edge secondary surface: drop Ticket + Displays in this SAME
        // write (a sibling effect would race and lose) + suspend details.
        clearPeerRightEdgeParams(next, 'claim');
        if (mode === 'link') next.set(CLAIM_MODE_PARAM, 'link');
        else next.delete(CLAIM_MODE_PARAM);
        dispatchReceivingDetailsOverlayClose();
      } else {
        next.delete(CLAIM_VIEW_PARAM);
        next.delete(CLAIM_MODE_PARAM);
      }
      const qs = next.toString();
      router.replace(qs ? `${pathname}?${qs}` : (pathname ?? ''));
    },
    [router, pathname, searchParams],
  );

  // Deep-link / reload with claim already open — suspend details once.
  useEffect(() => {
    if (claimView) dispatchReceivingDetailsOverlayClose();
  }, [claimView]);

  const prevLineIdRef = useRef<number | null>(null);
  useEffect(() => {
    const prev = prevLineIdRef.current;
    prevLineIdRef.current = currentLineId;
    if (shouldClearClaimViewOnLineChange(prev, currentLineId, claimView)) {
      setClaimView(false);
    }
  }, [currentLineId, claimView, setClaimView]);

  // More details opened → clear Claim URL so detail:receiving owns the slot.
  useEffect(() => {
    const handler = () => {
      if (!claimView) return;
      const next = new URLSearchParams(searchParams.toString());
      if (!next.has(CLAIM_VIEW_PARAM)) return;
      next.delete(CLAIM_VIEW_PARAM);
      next.delete(CLAIM_MODE_PARAM);
      const qs = next.toString();
      router.replace(qs ? `${pathname}?${qs}` : (pathname ?? ''));
    };
    window.addEventListener('receiving-open-details-overlay', handler);
    return () => window.removeEventListener('receiving-open-details-overlay', handler);
  }, [claimView, router, pathname, searchParams]);

  return { claimView, claimMode, setClaimView };
}
