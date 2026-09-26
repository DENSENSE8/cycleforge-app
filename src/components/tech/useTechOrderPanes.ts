'use client';

/** Right-pane order state for the tech dashboard's shipping mode: */

import { useEffect, useState } from 'react';
import type { ActiveStationOrder, ResolvedProductManual } from '@/hooks/useStationTestingController';
import type { UpNextPreviewPayload } from '@/utils/events';
import type { SearchSelection } from '@/lib/search/search-selection';

export interface TechActiveOrderPane {
  activeOrder: ActiveStationOrder;
  manuals: ResolvedProductManual[];
  isManualLoading: boolean;
}

interface TechOrderPanes {
  activeOrderPane: TechActiveOrderPane | null;
  setActiveOrderPane: React.Dispatch<React.SetStateAction<TechActiveOrderPane | null>>;
  previewSel: SearchSelection | null;
  setPreviewSel: React.Dispatch<React.SetStateAction<SearchSelection | null>>;
}

export function useTechOrderPanes(): TechOrderPanes {
  // Populated by `tech-active-order-changed` from useStationTestingController.
  // When set, the history branch crossfades into <ActiveOrderWorkspace/>.
  const [activeOrderPane, setActiveOrderPane] = useState<TechActiveOrderPane | null>(null);
  // Populated by `tech-upnext-preview` (a tech clicked an Up Next card). Lower
  // priority than the active order: if both are set, active wins.
  const [previewSel, setPreviewSel] = useState<SearchSelection | null>(null);

  // Active-order changes from the sidebar controller. Null clears the pane back
  // to history; a resolved active order also clears any standing preview.
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<TechActiveOrderPane | null>).detail;
      setActiveOrderPane(detail || null);
      if (detail) setPreviewSel(null);
    };
    window.addEventListener('tech-active-order-changed', handler);
    return () => window.removeEventListener('tech-active-order-changed', handler);
  }, []);

  // Up Next card clicks — preview an order in the right pane.
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<UpNextPreviewPayload>).detail;
      if (detail?.kind === 'find') {
        setPreviewSel(detail.sel);
      } else if (detail?.kind === 'order') {
        setPreviewSel({ entityType: 'order', id: detail.order.id });
      } else {
        setPreviewSel(null);
      }
    };
    window.addEventListener('tech-upnext-preview', handler);
    return () => window.removeEventListener('tech-upnext-preview', handler);
  }, []);

  return { activeOrderPane, setActiveOrderPane, previewSel, setPreviewSel };
}
