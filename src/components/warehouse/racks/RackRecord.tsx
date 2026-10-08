'use client';

/**
 * One movable rack in the desk record plane — the phone's rack record
 * (`/m/loc/RK12`) at desk density: the same shelves, tiers, placement and
 * derived room, the same three verbs (Print labels · Move rack · Add shelf),
 * and Remove on an empty shelf. Print labels and Move rack open the ONE
 * centered picker dialog over the record (operator 2026-10-08) — one job tree,
 * no desk-only verb. Reads and writes go through `racks-client` only.
 */

import { useState, type ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowRight, Plus, Printer, Trash2 } from '@/components/Icons';
import { ArmedDangerButton } from '@/design-system/components/ArmedDangerButton';
import { DeskRecordLayout } from '@/design-system/components/DeskRecordPlane';
import { RecordActionStrip, type RecordActionVerb } from '@/design-system/components/record-action-strip/RecordActionStrip';
import { DELETE_HOTKEY } from '@/lib/keyboard/key-registry';
import { EvidenceFactRow } from '@/design-system/components/record-ledger/EvidenceDisclosure';
import { EvidenceNotice } from '@/design-system/components/record-ledger/RecordEvidence';
import { RecordGroup } from '@/design-system/components/record-ledger/RecordGroup';
import { rackErrorMessage, rackPlacementText, rackShelfCountText } from '@/lib/locations/rack-display';
import { RACK_MAX_SHELVES, type RackDetail, type RackShelf } from '@/lib/locations/rack-types';
import { deleteRack, editRackShelves, getRack, rackQueryKey } from '@/lib/locations/racks-client';
import { safeRandomUUID } from '@/lib/safe-uuid';
import { toast } from '@/lib/toast';
import { formatDateTimePST } from '@/utils/date';
import { RackMoveDialog } from './RackMoveDialog';
import { RackPrintPanel } from './RackPrintPanel';

/** The record body on the stage canvas — its groups lift as cards. */
export const RACK_RECORD_ROOT_CLASS = 'flex-1 bg-mode-canvas p-4 text-mode-ink';

/** The create flow's column, the phone's width, centred (frame law). */
export const RACK_FLOW_COLUMN_CLASS = 'mx-auto flex w-full max-w-md min-w-0 flex-col gap-4';

export interface RackRecordSlot {
  title: ReactNode;
  subtitle: ReactNode;
  view: ReactNode;
}

/** Title + verbs + view for the rack `code` names (any spelling; a shelf code opens its rack); null with none open. */
export function useRackRecordSlot(code: string | null, onChanged: () => void, onDeleted: () => void): RackRecordSlot | null {
  const queryClient = useQueryClient();
  const [adding, setAdding] = useState(false);
  const [removing, setRemoving] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const query = useQuery({
    queryKey: rackQueryKey(code ?? ''),
    queryFn: () => getRack(code!),
    enabled: Boolean(code),
    staleTime: 10_000,
  });
  if (!code) return null;

  const rack = query.data?.rack ?? null;

  const changed = (next: RackDetail) => {
    queryClient.setQueryData(rackQueryKey(code), { rack: next });
    onChanged();
  };

  const addShelf = async () => {
    if (!rack || adding) return;
    setAdding(true);
    try {
      const res = await editRackShelves(rack.code, { add: 1, clientEventId: safeRandomUUID() });
      changed(res.rack);
      toast.success(`Added ${res.added.join(', ')} — print its label from Print labels`);
    } catch (err) {
      toast.error(rackErrorMessage(err));
    } finally {
      setAdding(false);
    }
  };

  const removeShelf = async (shelf: RackShelf) => {
    if (!rack) return;
    setRemoving(shelf.code);
    try {
      const res = await editRackShelves(rack.code, { remove: [shelf.code], clientEventId: safeRandomUUID() });
      changed(res.rack);
      toast.success(`Removed ${shelf.code}`);
    } catch (err) {
      toast.error(rackErrorMessage(err));
    } finally {
      setRemoving(null);
    }
  };

  const removeRack = async () => {
    if (!rack || deleting) return;
    setDeleting(true);
    try {
      await deleteRack(rack.code, { clientEventId: safeRandomUUID() });
      queryClient.removeQueries({ queryKey: rackQueryKey(code) });
      onChanged();
      onDeleted();
      toast.success(`${rack.name} deleted`);
    } catch (err) {
      toast.error(rackErrorMessage(err));
    } finally {
      setDeleting(false);
    }
  };

  // Print labels and Move rack open the ONE centered picker dialog (operator
  // 2026-10-08) — never a body swap.
  const verbs: RecordActionVerb[] = rack
    ? [
        {
          id: 'print',
          label: 'Print labels',
          icon: <Printer aria-hidden />,
          tone: 'blue',
          dialog: (done) => <RackPrintPanel key={rack.code} rack={rack} testId="rack-record-print" onDone={done} />,
        },
        {
          id: 'move',
          label: 'Move rack',
          icon: <ArrowRight aria-hidden />,
          dialog: (done) => <RackMoveDialog key={rack.code} rack={rack} onMoved={changed} done={done} />,
        },
        {
          id: 'add-shelf',
          label: 'Add shelf',
          icon: <Plus aria-hidden />,
          disabled: adding || rack.shelves.length >= RACK_MAX_SHELVES,
          disabledReason: adding ? 'Adding a shelf…' : `A rack carries at most ${RACK_MAX_SHELVES} shelves`,
          run: () => void addShelf(),
        },
        {
          id: 'delete',
          label: 'Delete rack',
          icon: <Trash2 aria-hidden />,
          tone: 'danger',
          hotkey: DELETE_HOTKEY,
          disabled: deleting,
          disabledReason: 'Deleting the rack…',
          confirmDetail: `${rack.code} and its shelves are deleted.`,
          run: () => void removeRack(),
        },
      ]
    : [];

  const title = rack ? `${rack.name} · ${rack.code}` : code;
  const subtitle = rack ? rackPlacementText(rack) : undefined;
  // The rack's verbs paint in the Actions panel under Placement (its movement
  // block), never the header (operator 2026-10-08).
  const actions = rack ? (
    <RecordGroup title="Actions" testId="rack-record-actions-panel">
      <RecordActionStrip face="panel" verbs={verbs} label={`${rack.name} actions`} testId="rack-record-actions" />
    </RecordGroup>
  ) : null;

  const view = rack ? (
    <RackRecordBody rack={rack} removing={removing} onRemove={(shelf) => void removeShelf(shelf)} actions={actions} />
  ) : (
    <div className={RACK_RECORD_ROOT_CLASS} data-testid="rack-record">
      <DeskRecordLayout
        main={
          <EvidenceNotice tone={query.error ? 'warn' : undefined}>
            {query.error ? rackErrorMessage(query.error) : 'Reading the rack…'}
          </EvidenceNotice>
        }
      />
    </div>
  );

  return { title, subtitle, view };
}

function RackRecordBody({
  rack,
  removing,
  onRemove,
  actions,
}: {
  rack: RackDetail;
  removing: string | null;
  onRemove: (shelf: RackShelf) => void;
  actions: ReactNode;
}) {
  const shelves = [...rack.shelves].sort((a, b) => a.shelf - b.shelf);
  return (
    <div className={RACK_RECORD_ROOT_CLASS} data-testid="rack-record">
      <DeskRecordLayout
        main={
          <RecordGroup title={`Shelves · ${rackShelfCountText(shelves.length)}`} testId="rack-record-shelves">
            <ul className="flex flex-col px-4 pb-1">
              {shelves.map((shelf) => (
                <li
                  key={shelf.id}
                  className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 border-b border-mode-fact py-2 last:border-b-0"
                  data-testid={`rack-shelf-${shelf.code}`}
                >
                  <span className="text-role-data font-semibold text-mode-ink">Shelf {shelf.shelf}</span>
                  <span className="font-mono text-role-data text-mode-muted">{shelf.code}</span>
                  {shelf.positions.length > 0 ? (
                    <span className="text-role-data text-mode-muted">{shelf.positions.length} positions</span>
                  ) : null}
                  <span className="ml-auto text-role-data tabular-nums text-mode-muted">
                    {shelf.stockQty > 0 ? `${shelf.stockQty} ${shelf.stockQty === 1 ? 'unit' : 'units'}` : 'Empty'}
                  </span>
                  {shelf.stockQty === 0 && shelves.length > 1 ? (
                    <ArmedDangerButton
                      size="sm"
                      icon={<Trash2 aria-hidden />}
                      iconOnlyUntilArmed
                      label={`Remove ${shelf.code}`}
                      confirmLabel={`Remove ${shelf.code}?`}
                      title={`Remove ${shelf.code}`}
                      loading={removing === shelf.code}
                      disabled={removing != null}
                      onConfirm={() => onRemove(shelf)}
                      data-testid={`rack-shelf-remove-${shelf.code}`}
                    />
                  ) : null}
                </li>
              ))}
            </ul>
          </RecordGroup>
        }
        aside={
          <div className="flex flex-col gap-4">
            <RecordGroup title="Placement" testId="rack-record-placement">
              <div className="flex flex-col px-4 pb-1 [&>*:last-child]:border-b-0">
                <EvidenceFactRow label="Stands at">
                  {rack.placement.name}
                  {rack.placement.kind === 'STAGING' ? ' · floor spot' : ''}
                </EvidenceFactRow>
                {rack.room?.id !== rack.placement.id ? (
                  <EvidenceFactRow label="Room">{rack.room?.name ?? 'No room above this spot'}</EvidenceFactRow>
                ) : null}
                <EvidenceFactRow label="Last moved">{formatDateTimePST(rack.lastMovedAt)} PT</EvidenceFactRow>
                <EvidenceFactRow label="Placard">
                  <span className="font-mono">{rack.code}</span>
                </EvidenceFactRow>
              </div>
            </RecordGroup>
            {actions}
          </div>
        }
      />
    </div>
  );
}
