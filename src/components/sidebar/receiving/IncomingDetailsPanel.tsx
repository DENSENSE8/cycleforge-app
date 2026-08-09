'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { DetailStackRailRegistrar } from '@/components/right-rail/DetailStackRailRegistrar';
import {
  DESK_INSPECTOR_INDEX,
  DeskInspectorIndexShell,
} from '@/components/right-rail/DeskInspectorIndexShell';
import { InspectorActionFloor } from '@/components/right-rail/InspectorActionFloor';
import { InspectorFlushDelete } from '@/components/right-rail/InspectorFlushDelete';
import { useRailHeaderActions } from '@/components/right-rail/RailSelectionActions';
import { Button } from '@/design-system/primitives';
import { SkeletonList } from '@/design-system/components/Skeletons';
import {
  tabsForData,
  type IncomingDetailsPanelProps,
  type TabId,
} from './incoming-details/incoming-details-shared';
import { useIncomingDetails } from './incoming-details/useIncomingDetails';
import {
  INCOMING_DETAILS_RAIL_ID,
  IncomingDetailsHeader,
  incomingDetailsAriaLabel,
  incomingDetailsHeaderMeta,
} from './incoming-details/IncomingDetailsHeader';
import { buildIncomingInspectorLeaves } from './incoming-details/build-incoming-inspector-leaves';
import { PoTab } from './incoming-details/PoTab';
import { EbayTab } from './incoming-details/EbayTab';
import { PairingTab } from './incoming-details/PairingTab';
import { ShipmentTab } from './incoming-details/ShipmentTab';
import { ActivityTab } from './incoming-details/ActivityTab';
import { EmailTab } from './incoming-details/EmailTab';
import { NotesTab } from './incoming-details/NotesTab';

export type { IncomingDetailsPanelProps } from './incoming-details/incoming-details-shared';

/**
 * Tabbed details panel for a single incoming PO / shipment / marketplace row.
 * Mounts via RightRailHost when Incoming POS has a 1-check or dblclick open.
 * Data comes from one consolidated endpoint
 * (`/api/receiving-lines/incoming/details`).
 *
 * Unpaired rows (no Zoho PO) expose a leading **Pairing** topic that composes
 * Arrival's `CartonMatchHub` — desk inspector, not Station Displays push.
 *
 * Thin composition shell: data + actions live in {@link useIncomingDetails};
 * chrome + identity above {@link DeskInspectorIndexShell} (Unbox index→leaf).
 *
 * NON-MODAL inspector (`modal={false}`) — same metric as `detail:order`: picking
 * an Incoming row and reading/editing it is a pick+edit job, not a blocking
 * decision, so the grid underneath stays scrollable, clickable and undimmed.
 * `closeOnOutsideClick` stays OFF (the dismiss layer is `fixed inset-0`, which
 * would swallow the very sibling-row clicks this flip exists to keep live);
 * close is the header `→|` or Escape on RightRailHost. Outset edge-collapse is
 * suppressed (`edgeCollapse={false}`) — Unbox parity.
 */
export function IncomingDetailsPanel(props: IncomingDetailsPanelProps) {
  const { onClose, focusReceivingId, focusReceivingLineId, seedRow } = props;
  const c = useIncomingDetails(props);
  const {
    isShipmentOnly,
    isInboundOnly,
    isCartonOnly,
    tab,
    setTab,
    syncing,
    syncOne,
    handleDelete,
    data,
    isLoading,
    isError,
    refetch,
    headerPo,
    headerTracking,
    headerOrder,
    invalidateIncoming,
  } = c;
  const visibleTabs = tabsForData(data);
  const { statusLabel, vendorName } = incomingDetailsHeaderMeta(data);
  const identity = headerPo || headerOrder || headerTracking;
  // Selection actions self-gate on the rail-actions store — only light when
  // History/Incoming is publishing via useReceivingLineRailSelection.
  const selectionActions = useRailHeaderActions();

  /** Index | leaf — opens on the row's default topic; Back → topics. */
  const [navId, setNavId] = useState<string>(tab);
  useEffect(() => {
    setNavId(tab);
  }, [tab]);

  const onNavChange = useCallback(
    (id: string) => {
      setNavId(id);
      if (id !== DESK_INSPECTOR_INDEX) {
        setTab(id as TabId);
      }
    },
    [setTab],
  );

  const leafPad = 'min-h-0 flex-1 overflow-y-auto px-6 py-5';

  const leaves = useMemo(() => {
    if (!data?.success) return [];
    return buildIncomingInspectorLeaves({
      tabs: visibleTabs,
      contents: {
        pairing: (
          <div className={leafPad}>
            <PairingTab
              data={data}
              seedRow={seedRow}
              focusReceivingId={focusReceivingId}
              focusReceivingLineId={focusReceivingLineId}
              onPaired={invalidateIncoming}
            />
          </div>
        ),
        ebay: (
          <div className={leafPad}>
            <EbayTab data={data} />
          </div>
        ),
        po: (
          <div className={leafPad}>
            <PoTab
              data={data}
              focusReceivingId={focusReceivingId}
              focusReceivingLineId={focusReceivingLineId}
            />
          </div>
        ),
        shipment: (
          <div className={leafPad}>
            <ShipmentTab data={data} />
          </div>
        ),
        activity: (
          <div className={leafPad}>
            <ActivityTab data={data} />
          </div>
        ),
        email: (
          <div className={leafPad}>
            <EmailTab data={data} />
          </div>
        ),
        notes: (
          <div className={leafPad}>
            <NotesTab
              receivingId={data.receiving?.id ?? null}
              initialValue={data.notes ?? ''}
            />
          </div>
        ),
      },
    });
  }, [
    data,
    visibleTabs,
    seedRow,
    focusReceivingId,
    focusReceivingLineId,
    invalidateIncoming,
  ]);

  return (
    <DetailStackRailRegistrar
      id={INCOMING_DETAILS_RAIL_ID}
      onClose={onClose}
      modal={false}
      // Band 3 owns park / reopen (Show / Hide inspector — To-ship twin), so the
      // panel parks rather than only closing. No parked strip: the band's toggle
      // is the reopen affordance, exactly as on To-ship.
      collapsedStrip={false}
      ariaLabel={incomingDetailsAriaLabel(identity)}
    >
      <div className="flex h-full min-h-0 flex-col overflow-hidden">
        <IncomingDetailsHeader
          headerPo={headerPo}
          headerTracking={headerTracking}
          headerOrder={headerOrder}
          vendorName={vendorName}
          statusLabel={statusLabel}
          isShipmentOnly={isShipmentOnly}
          isInboundOnly={isInboundOnly}
          isCartonOnly={isCartonOnly}
          syncing={syncing}
          onSync={() => void syncOne()}
          onClose={onClose}
          selectionActions={selectionActions}
        />

        {isLoading ? (
          <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
            <SkeletonList count={7} />
          </div>
        ) : isError || !data?.success ? (
          <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
            <p className="text-role-caption font-semibold text-rose-600">
              Could not load PO details.
            </p>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => void refetch()}
              ariaLabel="Retry loading details"
            >
              Retry
            </Button>
          </div>
        ) : (
          <DeskInspectorIndexShell
            leaves={leaves}
            activeId={navId}
            onActiveIdChange={onNavChange}
            ariaLabel="Incoming topics"
            testId="incoming-inspector-index"
            backLabel="Back to topics"
          />
        )}

        {/* Floor — flush trailing Delete. Removes the Incoming row; Zoho /
            marketplace upstream records are untouched. Sync stays in chrome. */}
        <InspectorActionFloor
          delete={
            <InspectorFlushDelete
              onConfirm={handleDelete}
              onDeleted={onClose}
              label="Delete incoming row"
              confirmLabel="Click again to confirm delete"
              data-testid="incoming-details-delete"
            />
          }
        />
      </div>
    </DetailStackRailRegistrar>
  );
}
