'use client';

/**
 * URL scope for the Outbound dashboard sidebar (Unshipped ⇄ Shipped).
 * Reads the same params the boards already honor and exposes setters + active
 * refinement chips so the left rail is a filter map, not a second board.
 */

import { useCallback, useMemo } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { useStaffFilter } from '@/hooks/useStaffFilter';
import { getDashboardOrderViewFromSearch } from '@/utils/dashboard-search-state';
import type { FulfillmentState } from '@/lib/unshipped-state';
import { FULFILLMENT_STATE_META } from '@/lib/unshipped-state';
import {
  useShippedFilterRefinements,
} from '@/components/shipping/shipped-filter/useShippedFilterRefinements';
import type { FilterRefinement } from '@/design-system/components/FilterRefinementBar';

export type OutboundSidebarMode = 'unshipped' | 'packed' | 'shipped';

export type UnshippedSegmentId =
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
  const { staffId, selectedName, setStaff } = useStaffFilter();
  const shipped = useShippedFilterRefinements();

  const orderView = getDashboardOrderViewFromSearch(searchParams);
  const mode: OutboundSidebarMode =
    orderView === 'shipped' || orderView === 'packed' || orderView === 'unshipped'
      ? orderView
      : 'unshipped';

  const myStaffId = user?.staffId && user.staffId > 0 ? user.staffId : null;

  const ustatus = parseUstatus(searchParams.get('ustatus'));
  const stage = parseStage(searchParams.get('stage'));
  const searchQuery = String(searchParams.get('search') || '').trim();
  const ostatus = String(searchParams.get('ostatus') || '').trim().toUpperCase();
  const attentionOnly =
    searchParams.get('attention') === '1' || searchParams.get('attention') === 'true';
  const lateOnly = searchParams.get('late') === '1';

  const replaceParams = useCallback(
    (mutator: (params: URLSearchParams) => void) => {
      const params = new URLSearchParams(searchParams.toString());
      mutator(params);
      const qs = params.toString();
      router.replace(qs ? `${pathname || '/dashboard'}?${qs}` : pathname || '/dashboard', {
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

  const setStage = useCallback(
    (next: 'all' | 'pending' | 'tested') => {
      replaceParams((p) => {
        if (next === 'all') p.delete('stage');
        else p.set('stage', next);
        p.delete('ustatus');
      });
    },
    [replaceParams],
  );

  const clearSearch = useCallback(() => {
    replaceParams((p) => {
      p.delete('search');
    });
  }, [replaceParams]);

  const clearOstatus = useCallback(() => {
    replaceParams((p) => {
      p.delete('ostatus');
    });
  }, [replaceParams]);

  const clearUnshippedScope = useCallback(() => {
    replaceParams((p) => {
      p.delete('ustatus');
      p.delete('stage');
      p.delete('staff');
      p.delete('search');
      p.delete('late');
      p.delete('attention');
    });
  }, [replaceParams]);

  /** Null when filters are mixed (e.g. other-staff only) so no single row looks selected. */
  const activeUnshippedSegment = useMemo((): UnshippedSegmentId | null => {
    if (attentionOnly && !ustatus && stage === 'all') return 'attention';
    if (ustatus) return ustatus;
    if (myStaffId != null && staffId === myStaffId && stage === 'all' && !lateOnly) return 'mine';
    if (stage === 'all' && staffId == null && !lateOnly && !attentionOnly) return 'all';
    return null;
  }, [myStaffId, staffId, ustatus, stage, attentionOnly, lateOnly]);

  const selectUnshippedSegment = useCallback(
    (id: UnshippedSegmentId) => {
      if (id === 'all') {
        clearUnshippedScope();
        return;
      }
      if (id === 'mine') {
        if (myStaffId == null) return;
        // Toggle off if already mine-only (→ All staff, sticky).
        if (staffId === myStaffId && !ustatus && stage === 'all' && !attentionOnly) {
          setStaff(null);
          return;
        }
        replaceParams((p) => {
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
          p.set('attention', '1');
          p.delete('ustatus');
          p.delete('stage');
          p.delete('late');
        });
        return;
      }
      // Lane segment — toggle off if already active.
      if (ustatus === id) {
        setUstatus(null);
        return;
      }
      replaceParams((p) => {
        p.set('ustatus', id);
        p.delete('stage');
        p.delete('attention');
      });
    },
    [
      attentionOnly,
      clearUnshippedScope,
      myStaffId,
      replaceParams,
      setStaff,
      setUstatus,
      staffId,
      stage,
      ustatus,
    ],
  );

  const unshippedRefinements = useMemo((): FilterRefinement[] => {
    const out: FilterRefinement[] = [];
    if (searchQuery) {
      out.push({ id: 'search', label: `“${searchQuery}”`, onRemove: clearSearch });
    }
    if (ustatus) {
      out.push({
        id: 'ustatus',
        label: FULFILLMENT_STATE_META[ustatus].label,
        onRemove: () => setUstatus(null),
      });
    } else if (stage !== 'all') {
      out.push({
        id: 'stage',
        label: stage === 'pending' ? 'Pending stage' : 'Tested stage',
        onRemove: () => setStage('all'),
      });
    }
    if (attentionOnly) {
      out.push({
        id: 'attention',
        // Wire id/param stays `attention`; the filter now means "urgent only"
        // (orders.is_urgent), so the chip reads Urgent.
        label: 'Urgent',
        onRemove: () =>
          replaceParams((p) => {
            p.delete('attention');
          }),
      });
    }
    if (staffId != null) {
      const isMe = myStaffId != null && staffId === myStaffId;
      out.push({
        id: 'staff',
        label: isMe ? 'My queue' : selectedName ? selectedName : `Staff #${staffId}`,
        onRemove: () => setStaff(null),
      });
    }
    return out;
  }, [
    searchQuery,
    ustatus,
    stage,
    staffId,
    myStaffId,
    selectedName,
    attentionOnly,
    lateOnly,
    clearSearch,
    setUstatus,
    setStage,
    setStaff,
    replaceParams,
  ]);

  const shippedRefinements = useMemo((): FilterRefinement[] => {
    const out: FilterRefinement[] = [...shipped.refinements];
    if (searchQuery) {
      out.unshift({ id: 'search', label: `“${searchQuery}”`, onRemove: clearSearch });
    }
    if (ostatus) {
      out.push({
        id: 'ostatus',
        label: ostatus.replace(/_/g, ' '),
        onRemove: clearOstatus,
      });
    }
    if (staffId != null) {
      const isMe = myStaffId != null && staffId === myStaffId;
      out.push({
        id: 'staff',
        label: isMe ? 'My queue' : selectedName ? selectedName : `Staff #${staffId}`,
        onRemove: () => setStaff(null),
      });
    }
    return out;
  }, [
    shipped.refinements,
    searchQuery,
    ostatus,
    staffId,
    myStaffId,
    selectedName,
    clearSearch,
    clearOstatus,
    setStaff,
  ]);

  const clearShippedScope = useCallback(() => {
    replaceParams((p) => {
      [
        'exceptions',
        'carrier',
        'statusCategory',
        'testedBy',
        'packedBy',
        'dateFrom',
        'dateTo',
        'staff',
        'ostatus',
        'search',
        'shippedFilter',
        'shippedSearchField',
      ].forEach((k) => p.delete(k));
    });
  }, [replaceParams]);

  return {
    mode,
    myStaffId,
    staffId,
    ustatus,
    stage,
    searchQuery,
    ostatus,
    attentionOnly,
    lateOnly,
    activeUnshippedSegment,
    selectUnshippedSegment,
    unshippedRefinements,
    shippedRefinements,
    clearUnshippedScope,
    clearShippedScope,
    shipped,
    setStaff,
    setUstatus,
    setStage,
  };
}
