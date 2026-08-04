'use client';

/**
 * Repair details slide-over — thin composition shell. All interactive logic
 * (ticket / notes / status edits, linkage set/clear, soft-cancel delete, pickup
 * toggle) lives in {@link useRepairDetailsPanel}; the status / info / linkage
 * sections are presentational components under `./details-panel/`.
 *
 * NON-MODAL rail inspector (`modal={false}`) on a STABLE occupant id — the
 * repair queue underneath stays live while the operator walks it with the
 * header's prev/next. See the header comment on the registrar below.
 */

import { createPortal } from 'react-dom';
import { Clock, DollarSign, Pencil, PrinterAlt } from '../Icons';
import { RepairPickupFlow } from '@/components/repair/RepairPickupFlow';
import { DetailStackRailRegistrar } from '@/components/right-rail/DetailStackRailRegistrar';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import DeleteButton from '@/components/ui/DeleteButton';
import {
  PaneHeader,
  PaneHeaderActionBar,
  PaneHeaderIconBadge,
  PaneHeaderLabel,
  PaneHeaderStatusPill,
  PaneHeaderTabs,
} from '@/components/ui/pane-header';
import {
  REPAIR_TABS,
  type RepairDetailsPanelProps,
} from './details-panel/repair-details-shared';
import { useRepairDetailsPanel } from './details-panel/useRepairDetailsPanel';
import { RepairLinkageSection } from './details-panel/RepairLinkageSection';
import { RepairOverviewTab } from './details-panel/RepairOverviewTab';
import { ShippedNotesComposer } from '@/components/shipped/details-panel/ShippedNotesComposer';

function getRepairStatusTone(status: string | null | undefined) {
  if (!status) return 'neutral' as const;
  if (status === 'Done') return 'emerald' as const;
  if (status.includes('Awaiting')) return 'amber' as const;
  if (status.includes('Pending')) return 'blue' as const;
  return 'neutral' as const;
}

export function RepairDetailsPanel({
  repair,
  onClose,
  onUpdate,
  onMoveUp = () => {},
  onMoveDown = () => {},
  disableMoveUp = false,
  disableMoveDown = false,
}: RepairDetailsPanelProps) {
  const c = useRepairDetailsPanel({ repair, onUpdate });
  const hasSavedNotes = String(repair.notes || '').trim().length > 0;
  // Identity for the aria name — the SAVED ticket number, never the editable
  // draft (`c.ticketNumber`), which would re-register the occupant per keystroke.
  const repairIdentity = String(repair.ticket_number || '').trim() || `RS-${repair.id}`;

  return (
    // STABLE occupant id (`detail:claim`, not `detail:claim:<id>`): the header
    // action bar has prev/next, so row→row is the loop here, and the host keys
    // its crossfade on the occupant id — a per-record id played exit→empty→enter
    // on every step. Safe because `useRepairDetailsPanel` re-seeds notes, ticket,
    // linkage editors and the open tab on `repair.id` change.
    <DetailStackRailRegistrar
      id="detail:claim"
      onClose={onClose}
      modal={false}
      ariaLabel={`Repair ${repairIdentity} details`}
    >
      <div className="flex h-full min-h-0 flex-col overflow-hidden">
        <PaneHeader
          className="border-border-hairline bg-surface-card/90 backdrop-blur-xl"
          rowClassName="px-2"
          leftSlot={
            <PaneHeaderActionBar
              iconOnly
              variant="flat"
              className="w-full px-0 py-0"
              actions={[
                {
                  key: 'edit-ticket',
                  label: 'Edit ticket number',
                  icon: <Pencil className="h-4 w-4" />,
                  onClick: () => c.setIsEditingTicket(true),
                  disabled: c.isSavingTicket,
                },
                ...c.panelActions.map((action) => ({
                  key: action.key,
                  label: action.label,
                  icon: <span className={action.toneClassName}>{action.icon}</span>,
                  onClick: action.onAction,
                })),
                {
                  key: 'print',
                  label: 'Repair document',
                  icon: (
                    <span className="text-blue-600">
                      <PrinterAlt className="h-3.5 w-3.5" />
                    </span>
                  ),
                  onClick: c.printRepairDocument,
                },
                ...(c.canCreateSquarePayment
                  ? [
                      {
                        key: 'square-pay',
                        label: c.isPaying
                          ? 'Creating payment link…'
                          : c.hasSourceSku
                            ? 'Square payment (catalog SKU)'
                            : 'Square payment (price)',
                        icon: (
                          <span className="text-emerald-600">
                            <DollarSign className="h-3.5 w-3.5" />
                          </span>
                        ),
                        onClick: () => {
                          if (!c.isPaying) void c.openSquarePayment();
                        },
                      },
                    ]
                  : []),
              ]}
              onPrev={onMoveUp}
              onNext={onMoveDown}
              prevDisabled={disableMoveUp}
              nextDisabled={disableMoveDown}
              prevTitle="Move up a row"
              nextTitle="Move down a row"
              onClose={onClose}
              closeTitle="Close details"
            />
          }
          belowSlot={
            <>
              <div className="flex items-center gap-2 px-2 pb-2">
                <PaneHeaderIconBadge Icon={Clock} bg="bg-orange-100" tint="text-orange-600" />
                <div className="flex min-w-0 flex-col gap-1">
                  <PaneHeaderLabel
                    eyebrow={c.isSavingTicket ? 'Saving ticket...' : 'Repair ticket'}
                    value={
                      c.isEditingTicket ? (
                        <input
                          ref={c.ticketInputRef}
                          type="text"
                          value={c.ticketNumber}
                          onChange={(e) => c.setTicketNumber(e.target.value)}
                          onBlur={c.handleSaveTicket}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.currentTarget.blur();
                            }
                            if (e.key === 'Escape') {
                              c.setTicketNumber(repair.ticket_number || '');
                              c.setIsEditingTicket(false);
                            }
                          }}
                          className="w-full border-none bg-transparent p-0 text-sm font-semibold uppercase tracking-tight text-text-default focus:ring-0"
                          placeholder="TK Number"
                          disabled={c.isSavingTicket}
                        />
                      ) : c.zendeskTicketUrl ? (
                        <HoverTooltip label={`Open Zendesk ticket ${c.ticketNumber}`} asChild>
                          <a
                            href={c.zendeskTicketUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="block truncate transition-colors hover:text-blue-600"
                          >
                            {c.ticketNumber}
                          </a>
                        </HoverTooltip>
                      ) : (
                        <span className="text-text-faint">TK Number</span>
                      )
                    }
                    valueTitle={c.ticketNumber || 'TK Number'}
                  />
                  <PaneHeaderStatusPill
                    tone={getRepairStatusTone(repair.status)}
                    pulse
                    className={
                      repair.status === 'Repaired, Contact Customer'
                        ? 'text-role-micro tracking-[0.14em]'
                        : undefined
                    }
                  >
                    {repair.status || 'No status'}
                  </PaneHeaderStatusPill>
                </div>
              </div>
              <PaneHeaderTabs
                tabs={REPAIR_TABS}
                value={c.activeTab}
                onChange={c.setActiveTab}
                className="px-2"
              />
            </>
          }
        />

        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
          {c.activeTab === 'overview' ? <RepairOverviewTab repair={repair} c={c} /> : null}
          {c.activeTab === 'links' ? <RepairLinkageSection c={c} /> : null}
        </div>

        <div className="shrink-0 bg-surface-card pb-8">
          {(c.isEditingNotes || hasSavedNotes) ? (
            c.isEditingNotes ? (
              <ShippedNotesComposer
                value={c.notes}
                onChange={c.setNotes}
                onCancel={() => {
                  c.setNotes(repair.notes || '');
                  c.setIsEditingNotes(false);
                }}
                onSubmit={c.handleSaveNotes}
                isSaving={c.isSaving}
              />
            ) : (
              <ShippedNotesComposer
                value={String(repair.notes || '')}
                readOnly
                onClick={() => c.setIsEditingNotes(true)}
              />
            )
          ) : null}
          <section className="mx-8 pt-2">
            <DeleteButton
              onConfirm={c.handleDelete}
              onDeleted={onClose}
              label="Delete"
              armedLabel="Click Again To Confirm"
              className="w-full h-10 inline-flex items-center justify-center gap-2 rounded-xl bg-red-600 text-white text-role-micro uppercase tracking-wider transition hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed"
            />
          </section>
        </div>

        {c.isMounted && c.showPickupFlow
          ? createPortal(
              <RepairPickupFlow
                repair={repair}
                onUpdate={onUpdate}
                onClose={() => c.setShowPickupFlow(false)}
              />,
              document.body,
            )
          : null}
      </div>
    </DetailStackRailRegistrar>
  );
}
