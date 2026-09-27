'use client';

/** Right-pane order state for the Picker desk (`/pick`): the active order and the Up Next preview. */

import { useEffect, useState } from 'react';
import type { ActiveStationOrder, ResolvedProductManual } from '@/hooks/useDeskPickController';
import type { UpNextPreviewPayload } from '@/utils/events';
import type { SearchSelection } from '@/lib/search/search-selection';

export interface PickActiveOrderPane {
  activeOrder: ActiveStationOrder;
  manuals: ResolvedProductManual[];
  isManualLoading: boolean;
}

interface PickOrderPanes {
  activeOrderPane: PickActiveOrderPane | null;
  setActiveOrderPane: React.Dispatch<React.SetStateAction<PickActiveOrderPane | null>>;
  previewSel: SearchSelection | null;
  setPreviewSel: React.Dispatch<React.SetStateAction<SearchSelection | null>>;
}

export function usePickOrderPanes(): PickOrderPanes {
  // Populated by `tech-active-order-changed` from useDeskPickController.
  // When set, the workspace crossfades into <ActiveOrderWorkspace/>.
  const [activeOrderPane, setActiveOrderPane] = useState<PickActiveOrderPane | null>(null);
  // Populated by `tech-upnext-preview` (a picker clicked an Up Next card). Lower
  // priority than the active order: if both are set, active wins.
  const [previewSel, setPreviewSel] = useState<SearchSelection | null>(null);

  // Active-order changes from the sidebar controller. Null clears the pane back
  // to the workspace; a resolved active order also clears any standing preview.
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<PickActiveOrderPane | null>).detail;
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
