'use client';

import { Trash2 } from '@/components/Icons';
import { DetailStackRailRegistrar } from '@/components/right-rail/DetailStackRailRegistrar';
import { useRailHeaderActions } from '@/components/right-rail/RailSelectionActions';
import DeleteButton from '@/components/ui/DeleteButton';
import { Button } from '@/design-system/primitives';
import { SkeletonList } from '@/design-system/components/Skeletons';
import { tabsForData, type IncomingDetailsPanelProps } from './incoming-details/incoming-details-shared';
import { useIncomingDetails } from './incoming-details/useIncomingDetails';
import {
  INCOMING_DETAILS_RAIL_ID,
  IncomingDetailsHeader,
  incomingDetailsAriaLabel,
  incomingDetailsHeaderMeta,
} from './incoming-details/IncomingDetailsHeader';
import { PoTab } from './incoming-details/PoTab';
import { EbayTab } from './incoming-details/EbayTab';
import { ShipmentTab } from './incoming-details/ShipmentTab';
import { ActivityTab } from './incoming-details/ActivityTab';
import { EmailTab } from './incoming-details/EmailTab';
import { NotesTab } from './incoming-details/NotesTab';

export type { IncomingDetailsPanelProps } from './incoming-details/incoming-details-shared';

/**
 * Tabbed details panel for a single incoming PO / shipment / marketplace row.
 * Mounts via RightRailHost when Incoming POS has a row selection (click).
 * Data comes from one consolidated endpoint
 * (`/api/receiving-lines/incoming/details`).
 *
 * Thin composition shell: data + actions live in {@link useIncomingDetails};
 * chrome matches Repair/Shipped detail stacks (PaneHeader + action bar + tabs).
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
  const { onClose, focusReceivingId, focusReceivingLineId } = props;
  const c = useIncomingDetails(props);
  const {
    isShipmentOnly,
    isInboundOnly,
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
  } = c;
  const visibleTabs = tabsForData(data);
  const { statusLabel, vendorName } = incomingDetailsHeaderMeta(data);
  const identity = headerPo || headerOrder || headerTracking;
  // Selection actions self-gate on the rail-actions store — only light when
  // History/Incoming is publishing via useReceivingLineRailSelection.
  const selectionActions = useRailHeaderActions();

  return (
    <DetailStackRailRegistrar
      id={INCOMING_DETAILS_RAIL_ID}
      onClose={onClose}
      modal={false}
      edgeCollapse={false}
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
          syncing={syncing}
          onSync={() => void syncOne()}
          tabs={visibleTabs}
          tab={tab}
          onTabChange={setTab}
          onClose={onClose}
          selectionActions={selectionActions}
        />

        <div className="min-h-0 flex-1 overflow-y-auto">
          {isLoading ? (
            <div className="px-6 py-5">
              <SkeletonList count={7} />
            </div>
          ) : isError || !data?.success ? (
            <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
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
            <div className="px-6 py-5">
              {tab === 'ebay' && <EbayTab data={data} />}
              {tab === 'po' && (
                <PoTab
                  data={data}
                  focusReceivingId={focusReceivingId}
                  focusReceivingLineId={focusReceivingLineId}
                />
              )}
              {tab === 'shipment' && <ShipmentTab data={data} />}
              {tab === 'activity' && <ActivityTab data={data} />}
              {tab === 'email' && <EmailTab data={data} />}
              {tab === 'notes' && (
                <NotesTab
                  receivingId={data.receiving?.id ?? null}
                  initialValue={data.notes ?? ''}
                />
              )}
            </div>
          )}
        </div>

        {/* Footer — destructive action. Removes the Incoming row; Zoho/marketplace
            upstream records are untouched. */}
        <div className="shrink-0 border-t border-border-soft bg-surface-card px-4 py-2.5">
          <DeleteButton
            onConfirm={handleDelete}
            onDeleted={onClose}
            icon={<Trash2 className="w-3.5 h-3.5" />}
            label="Delete"
            armedLabel="Click Again To Confirm"
            className="w-full h-10 inline-flex items-center justify-center gap-2 rounded-xl bg-red-600 hover:bg-red-700 text-white text-role-micro uppercase tracking-wider disabled:opacity-50"
          />
        </div>
      </div>
    </DetailStackRailRegistrar>
  );
}
