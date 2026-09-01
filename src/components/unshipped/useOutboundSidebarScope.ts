'use client';

/**
 * URL scope for the Outbound dashboard sidebar (Unshipped ⇄ Shipped).
 * Reads the same params the boards already honor so the left rail is a
 * focus map (My queue / Needs attention), not a second filter toolbar.
 */

import { useCallback, useMemo } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { useStaffFilter } from '@/hooks/useStaffFilter';
import { getDashboardOrderViewFromSearch, normalizeDashboardOrderViewParams } from '@/utils/dashboard-search-state';
import type { FulfillmentState } from '@/lib/unshipped-state';
import {
  useShippedFilterRefinements,
} from '@/components/shipping/shipped-filter/useShippedFilterRefinements';

export type OutboundSidebarMode = 'unshipped' | 'tested' | 'packed' | 'shipped';

type UnshippedSegmentId =
  | 'all'
  | 'mine'
  | 'attention'
  | 'PENDING'
  | 'TESTED'
  | 'BLOCKED';

function parseUstatus(raw: string | null): FulfillmentState | '' {
  const v = String(raw || '').trim().toUpperCase();
  if (v === 'PENDING' || v === 'TESTED' || v === 'BLOCKED') return v;
  return '';
}

function parseStage(raw: string | null): 'all' | 'pending' | 'tested' {
  const v = String(raw || '').toLowerCase();
  if (v === 'pending' || v === 'tested') return v;
  return 'all';
}

export function useOutboundSidebarScope() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { user } = useAuth();
  const { staffId, setStaff } = useStaffFilter();
  const shipped = useShippedFilterRefinements();

  const orderView = getDashboardOrderViewFromSearch(searchParams);
  const mode: OutboundSidebarMode =
    orderView === 'shipped' ||
    orderView === 'packed' ||
    orderView === 'unshipped' ||
    orderView === 'tested'
      ? orderView
      : 'unshipped';

  const myStaffId = user?.staffId && user.staffId > 0 ? user.staffId : null;

  const ustatus = parseUstatus(searchParams.get('ustatus'));
  const stage = parseStage(searchParams.get('stage'));
  const attentionOnly =
    searchParams.get('attention') === '1' || searchParams.get('attention') === 'true';
  const lateOnly = searchParams.get('late') === '1';

  const replaceParams = useCallback(
    (mutator: (params: URLSearchParams) => void) => {
      const params = new URLSearchParams(searchParams.toString());
      mutator(params);
      const qs = params.toString();
      router.replace(qs ? `${pathname || '/shipping/orders'}?${qs}` : pathname || '/shipping/orders', {
        scroll: false,
      });
    },
    [pathname, router, searchParams],
  );

  const setUstatus = useCallback(
    (next: FulfillmentState | null) => {
      replaceParams((p) => {
        if (next) p.set('ustatus', next);
        else p.delete('ustatus');
        // Exact lane supersedes coarse stage facet.
        p.delete('stage');
      });
    },
    [replaceParams],
  );

  /** Null when filters are mixed (e.g. other-staff only) so no single row looks selected. */
  const activeUnshippedSegment = useMemo((): UnshippedSegmentId | null => {
    if (mode === 'tested') return 'TESTED';
    if (attentionOnly && !ustatus && stage === 'all') return 'attention';
    if (ustatus === 'BLOCKED') return 'BLOCKED';
    if (ustatus) return ustatus;
    if (myStaffId != null && staffId === myStaffId && stage === 'all' && !lateOnly) return 'mine';
    if (stage === 'all' && staffId == null && !lateOnly && !attentionOnly) return 'all';
    return null;
  }, [mode, myStaffId, staffId, ustatus, stage, attentionOnly, lateOnly]);

  const selectUnshippedSegment = useCallback(
    (id: UnshippedSegmentId) => {
      if (id === 'all') {
        replaceParams((p) => {
          normalizeDashboardOrderViewParams(p, 'unshipped');
          p.delete('ustatus');
          p.delete('stage');
          p.delete('staff');
          p.delete('search');
          p.delete('late');
          p.delete('attention');
        });
        return;
      }
      if (id === 'mine') {
        if (myStaffId == null) return;
        // Toggle off if already mine-only (→ All staff, sticky).
        if (staffId === myStaffId && !ustatus && stage === 'all' && !attentionOnly && mode !== 'tested') {
          setStaff(null);
          return;
        }
        replaceParams((p) => {
          normalizeDashboardOrderViewParams(p, mode === 'tested' ? 'tested' : 'unshipped');
          p.set('staff', String(myStaffId));
          p.delete('ustatus');
          p.delete('stage');
          p.delete('attention');
          p.delete('late');
        });
        return;
      }
      if (id === 'attention') {
        if (attentionOnly && !ustatus) {
          replaceParams((p) => {
            p.delete('attention');
          });
          return;
        }
        replaceParams((p) => {
          // Urgent refine stays on the current pre-pack tab.
          if (mode !== 'tested') normalizeDashboardOrderViewParams(p, 'unshipped');
          p.set('attention', '1');
          p.delete('ustatus');
          p.delete('stage');
          p.delete('late');
        });
        return;
      }
      if (id === 'TESTED') {
        replaceParams((p) => {
          normalizeDashboardOrderViewParams(p, mode === 'tested' ? 'unshipped' : 'tested');
        });
        return;
      }
      if (id === 'PENDING') {
        replaceParams((p) => {
          normalizeDashboardOrderViewParams(p, 'unshipped');
          p.delete('ustatus');
          p.delete('attention');
        });
        return;
      }
      // BLOCKED — Pending tab + OOS refine.
      if (ustatus === 'BLOCKED' && mode === 'unshipped') {
        setUstatus(null);
        return;
      }
      replaceParams((p) => {
        normalizeDashboardOrderViewParams(p, 'unshipped');
        p.set('ustatus', 'BLOCKED');
        p.delete('stage');
        p.delete('attention');
      });
    },
    [
      attentionOnly,
      mode,
      myStaffId,
      replaceParams,
      setStaff,
      setUstatus,
      staffId,
      stage,
      ustatus,
    ],
  );

  return {
    mode,
    myStaffId,
    staffId,
    activeUnshippedSegment,
    selectUnshippedSegment,
    shipped,
    setStaff,
  };
}
