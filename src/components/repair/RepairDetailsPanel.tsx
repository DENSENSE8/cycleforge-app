'use client';

/** Repair details — the body a repair wears on a RAIL: */

import { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Clock, Pencil, PrinterAlt, Receipt } from '../Icons';
import { RepairPickupFlow } from '@/components/repair/RepairPickupFlow';
import {
  DESK_INSPECTOR_INDEX,
  DeskInspectorIndexShell,
  type DeskInspectorLeaf,
} from '@/components/right-rail/DeskInspectorIndexShell';
import { FLOOR_DELETE_PEER_CLASS, InspectorActionFloor } from '@/components/right-rail/InspectorActionFloor';
import { InspectorFlushDelete } from '@/components/right-rail/InspectorFlushDelete';
import { useRailHeaderActions } from '@/components/right-rail/RailSelectionActions';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import {
  PaneHeaderActionBar,
  PaneHeaderIconBadge,
  PaneHeaderLabel,
  PaneHeaderStatusPill,
} from '@/components/ui/pane-header';
import {
  type RepairDetailsPanelProps,
  type RepairTabId,
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
}: RepairDetailsPanelProps) {
  const c = useRepairDetailsPanel({ repair, onUpdate });
  const hasSavedNotes = String(repair.notes || '').trim().length > 0;
  // Selection actions self-gate on the rail-actions store — only light when
  // RepairTable is publishing via useRepairRailSelection.
  const railHeaderActions = useRailHeaderActions();

  /** Index | leaf — stub-opens on Overview; Back → topics. */
  const [navId, setNavId] = useState<string>('overview');
  useEffect(() => {
    setNavId('overview');
  }, [repair.id]);

  const onNavChange = useCallback(
    (id: string) => {
      setNavId(id);
      if (id !== DESK_INSPECTOR_INDEX) {
        c.setActiveTab(id as RepairTabId);
      }
    },
    [c.setActiveTab],
  );

  /**
   * Record identity — the editable TK number + live status. BODY, not a second
   * header line: the band's title cell is the current topic, and an inline text
   * input cannot live in a `h-7` chrome row without deforming it.
   */
  const identityBlock = (
    <div className="mb-4 flex items-center gap-2">
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
                className={"w-full border-none bg-transparent p-0 text-sm font-semibold tracking-tight text-text-default focus:ring-0" /* ds-allow-focus: identity/one-off hue or ring-0 */}
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
              ? 'text-role-micro'
              : undefined
          }
        >
          {repair.status || 'No status'}
        </PaneHeaderStatusPill>
      </div>
    </div>
  );

  /**
   * The band's trailing verb cluster — same cell on the index and on a leaf, so
   * a verb never appears or disappears with the stage. No close here: the host
   * paints the singleton `✕` into the cell the shell reserves after this.
   */
  const bandVerbs = (
    <PaneHeaderActionBar
      iconOnly
      variant="flat"
      className="py-0"
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
                    <Receipt className="h-3.5 w-3.5" />
                  </span>
                ),
                onClick: () => {
                  if (!c.isPaying) void c.openSquarePayment();
                },
              },
            ]
          : []),
        // Drop redundant "Open" when the inspect panel is already up.
        ...railHeaderActions.filter((a) => a.key !== 'rail-open'),
      ]}
    />
  );

  const leaves: DeskInspectorLeaf[] = [
    {
      id: 'overview',
      label: 'Overview',
      content: (
        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
          {identityBlock}
          <RepairOverviewTab repair={repair} c={c} />
        </div>
      ),
    },
    {
      id: 'links',
      label: 'Links',
      content: (
        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
          <RepairLinkageSection c={c} />
        </div>
      ),
    },
  ];
  return (
      <div className="flex h-full min-h-0 flex-col overflow-hidden">
        <DeskInspectorIndexShell
          stance="index"
          leaves={leaves}
          activeId={navId}
          onActiveIdChange={onNavChange}
          defaultActiveId="overview"
          ariaLabel="Repair topics"
          testId="repair-inspector-index"
          backLabel="Back to topics"
          // Same verbs on both stages — spillover changes WHERE a verb lives,
          // never WHICH verbs exist.
          indexRightSlot={bandVerbs}
          leafTrailing={bandVerbs}
        />

        <InspectorActionFloor
          above={
            c.isEditingNotes || hasSavedNotes ? (
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
            ) : undefined
          }
        >
          <InspectorFlushDelete
            onConfirm={c.handleDelete}
            onDeleted={onClose}
            label="Delete repair"
            confirmLabel="Click again to confirm delete"
            data-testid="repair-details-delete"
            className={FLOOR_DELETE_PEER_CLASS}
          />
        </InspectorActionFloor>

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
  );
}
