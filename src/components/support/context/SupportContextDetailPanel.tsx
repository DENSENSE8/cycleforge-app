'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { DetailStackRailRegistrar } from '@/components/right-rail/DetailStackRailRegistrar';
// Direct, not via the barrel this file is itself exported from — a member
// importing its own barrel is a module cycle.
import { SupportContextHub } from './SupportContextHub';
import {
  DESK_INSPECTOR_INDEX,
  DeskInspectorIndexShell,
  type DeskInspectorLeaf,
} from '@/components/right-rail/DeskInspectorIndexShell';
import type { SectionTab } from '@/design-system/components';
import type { SupportContextAnchor } from '@/hooks/useSupportContext';

export interface SupportContextDetailPanelProps {
  ticketId: number;
  anchor: SupportContextAnchor;
  open: boolean;
  onClose: () => void;
  embedded?: boolean;
  /** Whether this occupant reflows the work surface (`true`) or floats over it (`false`). */
  push: boolean;
  /** Opt-in DISPLAYS — the right edge as a display column, one showing at a time via DeskInspectorIndexShell (Unbox index→leaf grammar). */
  displays?: SectionTab[];
  /** Ask the rail to show a particular display — e.g. */
  focusDisplay?: string;
  focusRequestId?: number;
}

/** Ticket linkage / team / activity in the global detail-stack shell ({@link DetailStackRailRegistrar} → the one `RightRailHost` slot). */
export function SupportContextDetailPanel({
  ticketId,
  anchor,
  open,
  onClose,
  embedded = false,
  push,
  displays,
  focusDisplay,
  focusRequestId = 0,
}: SupportContextDetailPanelProps) {
  const hasDisplays = Boolean(displays && displays.length > 0);
  const defaultLeafId = displays?.[0]?.id ?? DESK_INSPECTOR_INDEX;
  // Opens on the first / focused topic leaf; Back → index.
  const [navId, setNavId] = useState(defaultLeafId);

  // Read on mount as well as on change, so a request made while this panel was
  // still closed is honoured the moment it opens.
  const lastFocusRequest = useRef(0);
  useEffect(() => {
    if (!focusDisplay || focusRequestId === lastFocusRequest.current) return;
    lastFocusRequest.current = focusRequestId;
    setNavId(focusDisplay);
  }, [focusDisplay, focusRequestId]);

  // A display the caller no longer offers must not strand the rail on an empty
  // body — fall back to the first leaf (or index when none).
  useEffect(() => {
    if (!hasDisplays) return;
    if (navId === DESK_INSPECTOR_INDEX) return;
    if (displays!.some((d) => d.id === navId)) return;
    setNavId(displays![0]!.id);
  }, [displays, hasDisplays, navId]);

  const leaves = useMemo((): DeskInspectorLeaf[] => {
    if (!displays?.length) return [];
    return displays.map((tab) => ({
      id: tab.id,
      label: tab.label,
      subtitle: tab.count != null ? String(tab.count) : undefined,
      icon: tab.icon,
      content: (
        <div className="min-h-0 flex-1 overflow-y-auto">{tab.content}</div>
      ),
    }));
  }, [displays]);

  const variant = embedded ? 'station' : 'workbench';

  /**
   * The short durable key as a band METRIC, never a title and never a second
   * header line. `right-rail-inspector.md` wants the scannable key visible at
   * every stage; the band's flex-1 title cell belongs to the current segment.
   */
  const ticketKey = (
    <span className="flex h-full items-center px-1 font-mono text-role-micro text-text-soft">
      #{ticketId}
    </span>
  );

  return (
    <DetailStackRailRegistrar
      id={`detail:support-context:${ticketId}`}
      // Per host, not per panel:
      push={push}
      onClose={onClose}
      enabled={open}
      modal={false}
      ariaLabel={`Ticket #${ticketId} support context`}
    >
      <div className="flex h-full min-h-0 flex-col overflow-hidden">
        {/* Display state lives HERE, above the registrar, so switching pushes a fresh node through `updateRightRailPanelNode` without touching the… */}
        {hasDisplays ? (
          <DeskInspectorIndexShell
            stance="index"
            title="Context"
            headerRightSlot={ticketKey}
            leaves={leaves}
            activeId={navId}
            onActiveIdChange={setNavId}
            ariaLabel="Ticket inspector"
            testId="support-inspector-index"
            backLabel="Back to topics"
          />
        ) : (
          // The historical body — one hub, no topics above it, so no Back is
          // owed and the stance says so rather than defaulting into an index
          // shape this branch has never had.
          <DeskInspectorIndexShell
            stance="standalone"
            title="Context"
            headerRightSlot={ticketKey}
            ariaLabel="Ticket context"
            testId="support-inspector-index"
            body={
              <SupportContextHub
                anchor={anchor}
                variant={variant}
                defaultSegment="activity"
                hideCustomerSegment
                surface="flush"
                className="h-full"
              />
            }
          />
        )}
      </div>
    </DetailStackRailRegistrar>
  );
}
