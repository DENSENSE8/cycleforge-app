'use client';

/**
 * Sticky "My work" default for Dashboard · Outbound.
 *
 * When the operator has a staff id and prefers My work (localStorage), a clean
 * URL with no `?staff=` is rewritten once to `?staff=<me>`. Choosing All staff
 * (or another person) flips the sticky default so the next visit stays open.
 *
 * Explicit `?staff=` always wins (deep links / saved views). Clearing staff
 * (All) is detected as a user intent and sticky becomes `all`.
 */

import { useEffect, useRef } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { useLocalStorage } from '@/hooks/_storage';
import { parseStaffParam, STAFF_FILTER_PARAM } from '@/hooks/useStaffFilter';
import {
  OUTBOUND_STAFF_DEFAULT_KEY,
  parseOutboundStaffDefault,
  type OutboundStaffDefault,
} from '@/lib/dashboard/outbound-queue-prefs';

export function useOutboundMyWorkDefault(enabled: boolean): {
  stickyDefault: OutboundStaffDefault;
  setStickyDefault: (next: OutboundStaffDefault) => void;
  myStaffId: number | null;
} {
  const { user } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [stickyDefault, setStickyDefault] = useLocalStorage<OutboundStaffDefault>(
    OUTBOUND_STAFF_DEFAULT_KEY,
    'me',
  );
  const prevStaffRef = useRef<number | null | undefined>(undefined);
  const injectingRef = useRef(false);

  const myStaffId = user?.staffId && user.staffId > 0 ? user.staffId : null;
  const preferred = parseOutboundStaffDefault(stickyDefault);

  useEffect(() => {
    if (!enabled) return;

    const staffId = parseStaffParam(searchParams.get(STAFF_FILTER_PARAM));
    const prev = prevStaffRef.current;

    // After our own inject, just track state.
    if (injectingRef.current) {
      injectingRef.current = false;
      prevStaffRef.current = staffId;
      return;
    }

    // User cleared staff (had a value → none) → sticky All.
    if (prev !== undefined && prev != null && staffId == null) {
      if (preferred !== 'all') setStickyDefault('all');
      prevStaffRef.current = null;
      return;
    }

    // Explicit staff in URL → sync sticky.
    if (staffId != null) {
      if (myStaffId != null && staffId === myStaffId) {
        if (preferred !== 'me') setStickyDefault('me');
      } else if (preferred !== 'all') {
        setStickyDefault('all');
      }
      prevStaffRef.current = staffId;
      return;
    }

    prevStaffRef.current = staffId;

    // No staff param: inject me when sticky is My work.
    if (myStaffId == null || preferred !== 'me') return;

    const params = new URLSearchParams(searchParams.toString());
    params.set(STAFF_FILTER_PARAM, String(myStaffId));
    const qs = params.toString();
    injectingRef.current = true;
    prevStaffRef.current = myStaffId;
    router.replace(qs ? `${pathname || '/dashboard'}?${qs}` : pathname || '/dashboard', {
      scroll: false,
    });
  }, [
    enabled,
    myStaffId,
    preferred,
    pathname,
    router,
    searchParams,
    setStickyDefault,
  ]);

  return { stickyDefault: preferred, setStickyDefault, myStaffId };
}
