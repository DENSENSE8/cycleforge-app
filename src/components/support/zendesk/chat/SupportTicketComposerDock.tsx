'use client';

/**
 * Floating ticket reply shell — Unbox overview compound for Support / Testing
 * ticket tabs: {@link OmnichannelComposerDock} via {@link TicketComposer}
 * `variant="station-dock"` + embedded {@link StationTerminalDock} as trailingAction.
 */

import type { ReactNode } from 'react';
import { slicedActionDockWrapperClass } from '@/design-system/primitives';
import { STATION_WORKBENCH_COLUMN } from '@/components/station/workbench';
import { StationTerminalDock } from '@/components/station/terminal';
import type { TerminalActionVm } from '@/lib/station-terminal';
import type { ThreadComposerBridge } from '@/components/threads/ThreadPanel';
import type { TicketPhotoStaging } from '@/hooks/useTicketPhotoStaging';
import { TicketComposer } from '@/components/composer/TicketComposer';

/** Staging + ticket meta the host needs to mount the floating composer. */
type SupportTicketComposerHost = {
  ticketId: number;
  requesterEmail: string | null;
  staging: TicketPhotoStaging;
  receivingId?: number;
};

export function SupportTicketComposerDock({
  host,
  terminalVm,
  onBridgeChange,
  assignedTechId,
}: {
  host: SupportTicketComposerHost;
  terminalVm: TerminalActionVm | null;
  onBridgeChange?: (bridge: ThreadComposerBridge | null) => void;
  assignedTechId?: number | null;
}): ReactNode {
  return (
    <div className={slicedActionDockWrapperClass({ docked: false })}>
      <div className={`pointer-events-auto ${STATION_WORKBENCH_COLUMN}`}>
        {terminalVm?.disabled && terminalVm.disabledReason ? (
          <p
            role="status"
            className="mb-1.5 text-right text-role-caption font-semibold text-amber-700"
          >
            {terminalVm.disabledReason}
          </p>
        ) : null}
        <TicketComposer
          ticketId={host.ticketId}
          requesterEmail={host.requesterEmail}
          staging={host.staging}
          receivingId={host.receivingId}
          onBridgeChange={onBridgeChange}
          trailingAction={
            <StationTerminalDock
              embedded
              vm={terminalVm}
              assignedTechId={assignedTechId}
            />
          }
        />
      </div>
    </div>
  );
}
