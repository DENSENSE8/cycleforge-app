'use client';

/**
 * Right-rail inspector for one daily-check item.
 *
 * Claims the single RightRailHost slot (same call MyDayTaskInspector makes).
 * Index → leaf KNOW via {@link DeskInspectorIndexShell} — Unbox Displays
 * grammar, desk-hosted. Does not mount StationDisplaysPushStack.
 */

import { useMemo } from 'react';
import { MoreVertical } from '@/components/Icons';
import { IconButton } from '@/design-system/primitives';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/design-system/primitives/DropdownMenu';
import {
  DESK_INSPECTOR_INDEX,
  DeskInspectorIndexShell,
} from '@/components/right-rail/DeskInspectorIndexShell';
import { useRegisterRightPanel } from '@/components/right-rail/useRegisterRightPanel';
import { RIGHT_RAIL_PRIORITY } from '@/lib/right-rail/store';
import type { DailyCheckItem, DailyCheckReport } from '@/lib/daily-checks/types';
import { buildDailyCheckInspectorLeaves } from './build-daily-check-inspector-leaves';
import {
  ConnectionsLeaf,
  OverviewLeaf,
  TICKET_TYPE,
  TicketLeaf,
  WORK_ORDER_TYPE,
  WhoRanLeaf,
  WorkOrderLeaf,
} from './DailyCheckInspectorLeaves';
import { useDailyCheckItemLinks, useDailyCheckLinkActions } from './useDailyCheckItemLinks';

const RAIL_ID = 'detail:daily-check';

function InspectorBody({
  item,
  report,
  onClose,
  onRetire,
  retirePending,
}: {
  item: DailyCheckItem;
  report: DailyCheckReport;
  onClose: () => void;
  onRetire?: (itemId: number) => void;
  retirePending?: boolean;
}) {
  const { data: links, isLoading: linksLoading } = useDailyCheckItemLinks(item.id);
  const { attach, detach } = useDailyCheckLinkActions(item.id);

  const ticketLink = links?.find((link) => link.entityType === TICKET_TYPE);
  const workOrderLink = links?.find((link) => link.entityType === WORK_ORDER_TYPE);

  const leaves = useMemo(
    () =>
      buildDailyCheckInspectorLeaves({
        ticketLinked: ticketLink != null,
        workOrderLinked: workOrderLink != null,
        contents: {
          overview: <OverviewLeaf item={item} report={report} />,
          connections: (
            <ConnectionsLeaf
              links={links}
              loading={linksLoading}
              busy={detach.isPending}
              onDetach={(linkId) => detach.mutate(linkId)}
            />
          ),
          ticket: (
            <TicketLeaf
              ticketLink={ticketLink}
              pending={attach.isPending}
              busy={detach.isPending}
              onAttach={(entityId) =>
                attach.mutate({ entityType: TICKET_TYPE, entityId })
              }
              onDetach={(linkId) => detach.mutate(linkId)}
            />
          ),
          'work-order': (
            <WorkOrderLeaf
              workOrderLink={workOrderLink}
              pending={attach.isPending}
              busy={detach.isPending}
              onAttach={(entityId) =>
                attach.mutate({ entityType: WORK_ORDER_TYPE, entityId })
              }
              onDetach={(linkId) => detach.mutate(linkId)}
            />
          ),
          'who-ran': <WhoRanLeaf item={item} report={report} />,
        },
      }),
    [
      attach,
      detach,
      item,
      links,
      linksLoading,
      report,
      ticketLink,
      workOrderLink,
    ],
  );

  return (
    <div className="flex h-full min-h-0 flex-col" data-testid="daily-check-inspector">
      {/* No stacked chrome row — the ⋮ rides the shell's ONE band beside
          back + title (`chrome`), the Displays-column contract. */}
      <DeskInspectorIndexShell
        stance="index"
        chrome={
          onRetire ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <span>
                  <IconButton
                    type="button"
                    size="sm"
                    tone="neutral"
                    icon={<MoreVertical className="h-3.5 w-3.5" />}
                    ariaLabel="More actions"
                    title="More actions"
                    disabled={retirePending}
                    data-testid="daily-check-inspector-more"
                  />
                </span>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem
                  tone="danger"
                  disabled={retirePending}
                  onSelect={() => {
                    onRetire(item.id);
                    onClose();
                  }}
                  data-testid="daily-check-inspector-retire"
                >
                  Remove from list
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : null
        }
        key={item.id}
        leaves={leaves}
        defaultActiveId={DESK_INSPECTOR_INDEX}
        indexFilter
        ariaLabel="Daily check topics"
        testId="daily-check-inspector-index"
        backLabel="Back to topics"
      />
    </div>
  );
}

export function DailyCheckItemInspector({
  item,
  report,
  onClose,
  onRetire,
  retirePending,
}: {
  item: DailyCheckItem | null;
  report: DailyCheckReport | undefined;
  onClose: () => void;
  onRetire?: (itemId: number) => void;
  retirePending?: boolean;
}) {
  useRegisterRightPanel({
    id: RAIL_ID,
    priority: RIGHT_RAIL_PRIORITY.detail,
    enabled: item != null && report != null,
    modal: false,
    ariaLabel: 'Daily check details',
    onClose,
    node:
      item && report ? (
        <InspectorBody
          item={item}
          report={report}
          onClose={onClose}
          onRetire={onRetire}
          retirePending={retirePending}
        />
      ) : null,
  });
  return null;
}
