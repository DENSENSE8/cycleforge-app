'use client';

/**
 * One movable rack in the desk record plane — the phone's rack record
 * (`/m/loc/RK12`) at desk density: the same shelves, tiers, placement and
 * derived room, the same three verbs (Print labels · Move rack · Add shelf),
 * and Remove on an empty shelf. A verb's flow replaces the body in a
 * phone-width column with Back (SURFACE_LAW §4) — one job tree, no desk-only
 * verb. Reads and writes go through `racks-client` only.
 */

import { useState, type ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowRight, ChevronLeft, Plus, Printer, Trash2 } from '@/components/Icons';
import { ArmedDangerButton } from '@/design-system/components/ArmedDangerButton';
import { DeskRecordLayout } from '@/design-system/components/DeskRecordPlane';
import { RecordActionStrip, type RecordActionVerb } from '@/design-system/components/record-action-strip/RecordActionStrip';
import { EvidenceFactRow } from '@/design-system/components/record-ledger/EvidenceDisclosure';
import { EvidenceNotice } from '@/design-system/components/record-ledger/RecordEvidence';
import { RECORD_GROUP_TITLE_CLASS, RecordGroup } from '@/design-system/components/record-ledger/RecordGroup';
import { Button } from '@/design-system/primitives';
import { rackErrorMessage, rackPlacementText, rackShelfCountText } from '@/lib/locations/rack-display';
import { RACK_MAX_SHELVES, type RackDetail, type RackShelf } from '@/lib/locations/rack-types';
import { deleteRack, editRackShelves, getRack, rackQueryKey } from '@/lib/locations/racks-client';
import { safeRandomUUID } from '@/lib/safe-uuid';
import { toast } from '@/lib/toast';
import { formatDateTimePST } from '@/utils/date';
import { RackMovePanel } from './RackMovePanel';
import { RackPrintPanel } from './RackPrintPanel';

/** The record body on the stage canvas — its groups lift as cards. */
export const RACK_RECORD_ROOT_CLASS = 'flex-1 bg-mode-canvas p-4 text-mode-ink';

/** A verb's flow, the phone's width, centred (frame law). */
export const RACK_FLOW_COLUMN_CLASS = 'mx-auto flex w-full max-w-md min-w-0 flex-col gap-4';

type RackPanel = 'print' | 'move';

export interface RackRecordSlot {
  title: ReactNode;
  subtitle: ReactNode;
  actions: ReactNode;
  view: ReactNode;
}

/** A verb's flow in place of the body: Back + its name over the phone-width column. */
export function RackFlowFrame({ title, onBack, testId, children }: { title: string; onBack: () => void; testId: string; children: ReactNode }) {
  return (
    <div className={RACK_RECORD_ROOT_CLASS} data-testid={testId}>
      <div className={RACK_FLOW_COLUMN_CLASS}>
        <div className="flex min-h-mode-hit items-center gap-2">
          <Button variant="ghost" size="sm" icon={<ChevronLeft aria-hidden />} onClick={onBack} data-testid={`${testId}-back`}>
            Back
          </Button>
          <h3 className={RECORD_GROUP_TITLE_CLASS}>{title}</h3>
        </div>
        {children}
      </div>
    </div>
  );
}

/** Title + verbs + view for the rack `code` names (any spelling; a shelf code opens its rack); null with none open. */
export function useRackRecordSlot(code: string | null, onChanged: () => void, onDeleted: () => void): RackRecordSlot | null {
  const queryClient = useQueryClient();
  const [panel, setPanel] = useState<{ code: string; panel: RackPanel } | null>(null);
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
  const active = panel && panel.code === code ? panel.panel : null;
  const closePanel = () => setPanel(null);

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

  const verbs: RecordActionVerb[] = rack
    ? [
        {
          id: 'print',
          label: 'Print labels',
          icon: <Printer aria-hidden />,
          tone: 'blue',
          pressed: active === 'print',
          run: () => setPanel({ code, panel: 'print' }),
        },
        {
          id: 'move',
          label: 'Move rack',
          icon: <ArrowRight aria-hidden />,
          pressed: active === 'move',
          run: () => setPanel({ code, panel: 'move' }),
        },
        {
          id: 'add-shelf',
          label: 'Add shelf',
          icon: <Plus aria-hidden />,
          disabled: adding || rack.shelves.length >= RACK_MAX_SHELVES,
          disabledReason: adding ? 'Adding a shelf…' : `A rack carries at most ${RACK_MAX_SHELVES} shelves`,
          // The new shelf lands in the shelves list — leave any open flow so it is visible.
          run: () => {
            closePanel();
            void addShelf();
          },
        },
      ]
    : [];

  const title = rack ? `${rack.name} · ${rack.code}` : code;
  const subtitle = rack ? rackPlacementText(rack) : undefined;
  const actions = rack ? (
    <div className="flex min-w-0 items-center gap-2">
      <RecordActionStrip key={rack.code} face="header" verbs={verbs} label={`${rack.name} actions`} testId="rack-record-actions" />
      <ArmedDangerButton
        size="sm"
        icon={<Trash2 aria-hidden />}
        iconOnlyUntilArmed
        label="Delete rack"
        confirmLabel={`Delete ${rack.code}?`}
        title="Delete rack"
        loading={deleting}
        onConfirm={() => void removeRack()}
        data-testid="rack-record-delete"
      />
    </div>
  ) : null;

  let view: ReactNode;
  if (!rack) {
    view = (
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
  } else if (active === 'print') {
    view = (
      <RackFlowFrame title="Print labels" onBack={closePanel} testId="rack-record-print">
        <RackPrintPanel key={rack.code} rack={rack} />
      </RackFlowFrame>
    );
  } else if (active === 'move') {
    view = (
      <RackFlowFrame title="Move rack" onBack={closePanel} testId="rack-record-move">
        <RackMovePanel key={rack.code} rack={rack} onMoved={changed} />
      </RackFlowFrame>
    );
  } else {
    view = <RackRecordBody rack={rack} removing={removing} onRemove={(shelf) => void removeShelf(shelf)} />;
  }

  return { title, subtitle, actions, view };
}

function RackRecordBody({ rack, removing, onRemove }: { rack: RackDetail; removing: string | null; onRemove: (shelf: RackShelf) => void }) {
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
        }
      />
    </div>
  );
}
