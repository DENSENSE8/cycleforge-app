'use client';

/**
 * ONE RightRailHost occupant for Incoming desk Band-1 tools — Check receipts
 * and tracking filter paste. Opening a second tool replaces the first; host ✕
 * clears the whole rail (no stacked registrars / no Resume toast from a buried
 * panel resurfacing).
 */

import { useCallback, useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { DetailStackRailRegistrar } from '@/components/right-rail/DetailStackRailRegistrar';
import { yieldStationRightEdgeForDeskOccupant } from '@/components/receiving/workspace/line-edit/unbox-right-edge';
import { setDetailInspectorCollapsed } from '@/design-system/shells/detail-stack';
import { openPanel } from '@/lib/right-rail/panel-store';
import { STATION_DESK_OCCUPANT_CLOSE_EVENT } from '@/utils/events';
import { IncomingBulkTrackingPanel } from './IncomingBulkTrackingPanel';
import {
  INCOMING_DESK_RAIL_ID,
  incomingDeskRailAriaLabel,
  type IncomingDeskRailTool,
} from './incoming-desk-rail';

export type { IncomingDeskRailTool } from './incoming-desk-rail';

export function IncomingDeskRightRail({
  tool,
  onClose,
}: {
  tool: IncomingDeskRailTool | null;
  onClose: () => void;
}) {
  const router = useRouter();
  const pathname = usePathname();

  const handleClose = useCallback(() => {
    onClose();
  }, [onClose]);

  useEffect(() => {
    if (!tool) return;
    setDetailInspectorCollapsed(false);
    openPanel({ id: INCOMING_DESK_RAIL_ID });
    yieldStationRightEdgeForDeskOccupant((qs) => {
      router.replace(qs ? `${pathname}?${qs}` : pathname || '/', { scroll: false });
    });
  }, [tool, router, pathname]);

  useEffect(() => {
    if (!tool) return;
    const onPeerOpen = () => handleClose();
    window.addEventListener(STATION_DESK_OCCUPANT_CLOSE_EVENT, onPeerOpen);
    return () => window.removeEventListener(STATION_DESK_OCCUPANT_CLOSE_EVENT, onPeerOpen);
  }, [tool, handleClose]);

  if (!tool) return null;

  const ariaLabel = incomingDeskRailAriaLabel(tool);

  return (
    <DetailStackRailRegistrar
      id={INCOMING_DESK_RAIL_ID}
      onClose={handleClose}
      modal={false}
      edgeCollapse={false}
      resumeOnDismiss={false}
      ariaLabel={ariaLabel}
    >
      {tool.kind === 'check' ? (
        <IncomingBulkTrackingPanel
          embedded
          open
          checkOnly={tool.checkOnly ?? true}
          onClose={handleClose}
        />
      ) : null}
      {tool.kind === 'filter' ? (
        <IncomingBulkTrackingPanel
          embedded
          open
          initialAction="filter"
          onClose={handleClose}
        />
      ) : null}
    </DetailStackRailRegistrar>
  );
}
