'use client';

/**
 * CYC-82 — the row action manifold that opens off the leading checkbox.
 *
 * ## Where it paints
 *
 * OUTSIDE the table, on the LEFT (`left-start` against the ROW element, not
 * against the gutter cell). Anchoring to the cell put the panel on top of the
 * columns the operator is reading; anchoring to the row parks it in the page
 * margin beside the row it acts on, so the table never occludes itself.
 *
 * ## No confirm step
 *
 * Picking a staffer COMMITS. There is no Confirm/Deny view — a second press to
 * agree with the press you just made is a step that teaches nothing, and the
 * write is already optimistic and visible on the row behind the panel.
 *
 * Delete is the one exception, and it is still not a confirm BUTTON: the same
 * row re-labels and takes a second press, so an irreversible verb cannot fire
 * on a mis-click without adding a control to the panel.
 *
 * ## Roster
 *
 * Faces come from {@link StaffAvatar} keyed on staff id, so each staffer paints
 * in their assigned colour with their photo when they have one — the operator
 * reads the colour, not the name. Who may appear is
 * {@link morphingRoster}: packers are Tuan and Thuy, pickers are live staff
 * named Sang / Ajax / Lien / Michael, and Kai is never either.
 */

import { useEffect, useId, useMemo, useRef, useState, type RefObject } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { AnimatePresence, motion } from '@/design-system/motion';
import { Popover } from '@/design-system/primitives/Popover';
import {
  MorphingMenuRow,
  MorphingMenuSeparator,
} from '@/design-system/primitives/MorphingMenuRow';
import { StaffAvatar } from '@/components/identity/StaffAvatar';
import { AssigneeComboboxPanel } from '@/design-system/components/AssigneeCombobox';
import { useOrderAssignment } from '@/hooks/useOrderAssignment';
import { bustFulfillmentCaches } from '@/lib/outbound/outbound-cache-keys';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from '@/lib/toast';
import { getActiveStaff, patchCachedStaffLaneRole, type StaffMember } from '@/lib/staffCache';
import type { CompoundStageAssignRole } from '@/components/tables/compound/compound-row-model';
import {
  applyStaffLaneRole,
  oppositeStaffLane,
  staffLaneFaceLabel,
  staffLaneRosterFaces,
  staffMatchesStageLane,
} from '@/components/tables/compound/staff-stage-lane';
import {
  applyMorphingGutterClick,
  morphingAssignedName,
  morphingFilterRoster,
  morphingListingRulePair,
  morphingNotesHint,
  MORPHING_MORE_INFO_HOTKEY,
  MORPHING_NOTES_HOTKEY,
  morphingRoster,
  pairItemNumberOnce,
  type MorphingActionLane,
  type MorphingStaffRow,
} from '@/lib/outbound/morphing-row-action';
import { persistListingStaffRule } from '@/lib/outbound/persist-listing-staff-rule';
import { dispatchOpenShippedDetails, dispatchOpenListingStaffRules } from '@/utils/events';
import { applyToShipStageAfterOutOfStock } from '@/utils/dashboard-search-state';
import { OrderNotesTrail } from '@/components/shipped/details-panel/OrderNotesTrail';
import {
  GridRowCheckbox,
  type GridSelectGutterChrome,
} from '@/components/ui/GridRowCheckbox';
import type { ShippedOrder } from '@/lib/neon/orders-queries';
import type { TableRowPlaneProps } from '@/components/tables/table-surface-binding';
import { cn } from '@/utils/_cn';
import { useDeskStageOptional } from '@/design-system/components/DeskStageContext';
import { SHIPPING_EXCEPTIONS_PATH } from '@/lib/shipping/orders-desk';
import { commitExceptionsItemPaste } from '@/lib/orders/exceptions-cta';
import { SearchField } from '@/design-system/primitives/SearchField';

const MENU_EVENT = 'cyc-82-morphing-action-menu';
type MenuView = 'actions' | 'pickers' | 'notes' | 'paste';

function viewKey(view: MenuView): string {
  if (view === 'pickers') return 'pickers-view';
  if (view === 'notes') return 'notes-view';
  if (view === 'paste') return 'paste-view';
  return 'actions-view';
}

/**
 * The ENGINE-facing face of this panel — what `TableSurfaceBinding.rowPlane`
 * registers for the orders entity.
 *
 * The engine mounts a plane as `{ row, open, onClose, anchorRef }`; this panel
 * has always called its row `record`. One rename adapter, declared beside the
 * panel it adapts, rather than a new file or a churned prop name on 700 lines
 * of working operator surface.
 *
 * Registering it here is what let `OrdersQueueTableRow` go: the panel was the
 * last thing the shared compound row could not mount, so To-ship kept a row
 * component alive to host it.
 */
export function OrdersRowPlane({ row, ...plane }: TableRowPlaneProps<ShippedOrder>) {
  return <MorphingRowActionMenu record={row} {...plane} />;
}

export function MorphingRowActionMenu({
  record,
  open,
  onClose,
  anchorRef,
}: {
  record: ShippedOrder;
  open: boolean;
  onClose: () => void;
  anchorRef: RefObject<HTMLElement | null>;
}) {
  const instanceId = useId();
  const [view, setView] = useState<MenuView>('actions');
  const [lane, setLane] = useState<MorphingActionLane | null>(null);
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [staffQuery, setStaffQuery] = useState('');
  const [staffReady, setStaffReady] = useState(false);
  const [rosterMode, setRosterMode] = useState(false);
  const [deleteArmed, setDeleteArmed] = useState(false);
  const [pasteDraft, setPasteDraft] = useState('');
  const [pasting, setPasting] = useState(false);
  const assign = useOrderAssignment();
  const queryClient = useQueryClient();
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const stage = useDeskStageOptional();
  const onExceptionsDesk = pathname === SHIPPING_EXCEPTIONS_PATH;

  const roster = lane ? morphingRoster(staff, lane) : [];
  const visibleRoster = useMemo(
    () => morphingFilterRoster(roster, staffQuery),
    [roster, staffQuery],
  );
  const visibleAllStaff = useMemo(() => {
    const q = staffQuery.trim().toLowerCase();
    return staff.filter((row) => {
      if (!Number.isFinite(row.id) || row.id <= 0 || !row.name.trim()) return false;
      if (!q) return true;
      return row.name.toLowerCase().includes(q);
    });
  }, [staff, staffQuery]);
  const panelStaff = rosterMode ? visibleAllStaff : visibleRoster;
  const rosterFaces = staffLaneRosterFaces(lane === 'packer' ? 'packer' : 'technician');
  const itemNumber = pairItemNumberOnce(record.item_number);
  const orderId = Number(record.id);
  const pickerName = morphingAssignedName(record, 'picker');
  const packerName = morphingAssignedName(record, 'packer');
  const notesHint = morphingNotesHint(record);

  // One manifold at a time — opening this one closes every peer row's.
  useEffect(() => {
    if (!open) return;
    const onPeer = (event: Event) => {
      const id = (event as CustomEvent<string>).detail;
      if (id !== instanceId) onClose();
    };
    window.addEventListener(MENU_EVENT, onPeer);
    return () => window.removeEventListener(MENU_EVENT, onPeer);
  }, [open, instanceId, onClose]);

  useEffect(() => {
    if (!open) return;
    window.dispatchEvent(new CustomEvent(MENU_EVENT, { detail: instanceId }));
    setView('actions');
    setLane(null);
    setDeleteArmed(false);
    setStaffQuery('');
    setRosterMode(false);
    setPasteDraft('');
    setPasting(false);
    setStaffReady(false);
    let cancelled = false;
    getActiveStaff()
      .then((members) => {
        if (cancelled) return;
        setStaff(
          (Array.isArray(members) ? members : []).filter(
            (row) => Number.isFinite(row.id) && row.id > 0 && row.name.trim(),
          ),
        );
      })
      .finally(() => {
        if (!cancelled) setStaffReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, [open, instanceId]);

  const close = () => {
    setView('actions');
    setLane(null);
    setDeleteArmed(false);
    setStaffQuery('');
    setRosterMode(false);
    setPasteDraft('');
    setPasting(false);
    onClose();
  };

  const openExceptionPaste = () => {
    setLane(null);
    setDeleteArmed(false);
    setPasteDraft('');
    setView('paste');
  };

  const openExceptionResolve = () => {
    close();
    if (stage && !stage.fullscreen) stage.toggleFullscreen();
    const params = new URLSearchParams(searchParams.toString());
    params.set('order', String(record.id));
    const qs = params.toString();
    router.replace(qs ? `${SHIPPING_EXCEPTIONS_PATH}?${qs}` : SHIPPING_EXCEPTIONS_PATH, {
      scroll: false,
    });
  };

  const commitExceptionPaste = (value: string) => {
    const next = value.trim();
    if (!next) return;
    setPasting(true);
    void commitExceptionsItemPaste(next, [
      {
        id: orderId,
        itemNumber: record.item_number ?? null,
        accountSource: record.account_source ?? null,
      },
    ]).then(async (result) => {
      setPasting(false);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      if (result.outcome === 'ambiguous') {
        toast.error('Several catalog matches — pick one in Resolve.');
        openExceptionResolve();
        return;
      }
      if (result.outcome === 'saved-item') {
        toast.success('Saved the item number. Open Resolve if it still needs a catalog SKU.');
      } else {
        toast.success(
          result.ordersUpdated > 1
            ? `Matched — backfilled ${result.ordersUpdated} orders.`
            : `Matched ${result.sku} and backfilled the order.`,
        );
      }
      await queryClient.invalidateQueries({ queryKey: ['order-exceptions'] });
      close();
    });
  };

  const chooseLane = (next: MorphingActionLane) => {
    setLane(next);
    setDeleteArmed(false);
    setRosterMode(false);
    setView('pickers');
  };

  const openNotes = () => {
    setLane(null);
    setDeleteArmed(false);
    setView('notes');
  };

  const backToActions = () => {
    setView('actions');
    setLane(null);
    setDeleteArmed(false);
    setStaffQuery('');
    setRosterMode(false);
    setPasteDraft('');
  };

  const persistLaneRole = (
    staffId: number,
    role: CompoundStageAssignRole,
    staffName: string,
    notice?: { face: CompoundStageAssignRole; eligible: boolean },
  ) => {
    void fetch('/api/staff', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: staffId, role }),
    })
      .then((res) => {
        if (!res.ok) throw new Error(`staff role ${res.status}`);
        patchCachedStaffLaneRole(staffId, role);
        const job = (notice?.face ?? role) === 'packer' ? 'packer' : 'picker';
        toast.success(
          notice && !notice.eligible
            ? `${staffName} is not a ${job}`
            : `${staffName} is a ${job}`,
        );
      })
      .catch((e) => {
        toast.error(e instanceof Error ? e.message : 'Could not update staff role');
      });
  };

  /** Stage-filling L2 on the desk table — not a rail, not a Dialog. */
  const openMoreInformation = () => {
    close();
    dispatchOpenShippedDetails(record, 'queue', { force: true });
  };

  /** A pick IS the commit — see the docblock. */
  const commitStaff = (row: MorphingStaffRow) => {
    if (!lane) return;
    const assignedLane = lane;
    assign.mutate({
      orderId,
      itemNumber,
      ...(assignedLane === 'packer'
        ? { packerId: row.id, packerName: row.name }
        : { testerId: row.id, testerName: row.name }),
    });
    close();
    if (!itemNumber) return;
    const pair = morphingListingRulePair({
      lane: assignedLane,
      staffId: row.id,
      testerId: record.tester_id,
      packerId: record.packer_id,
    });
    void persistListingStaffRule({
      orderId,
      techId: pair.techId,
      packerId: pair.packerId,
    }).then((result) => {
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(`Always assign ${row.name} on ${itemNumber}`, {
        duration: 8000,
        action: {
          label: 'Edit',
          onClick: () => dispatchOpenListingStaffRules(),
        },
      });
    });
  };

  const markUrgent = () => {
    assign.mutate({ orderId, itemNumber, isUrgent: true });
    close();
  };

  const markOutOfStock = () => {
    assign.mutate({ orderId, itemNumber, isOutOfStock: true });
    const params = new URLSearchParams(searchParams.toString());
    if (applyToShipStageAfterOutOfStock(params)) {
      const qs = params.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    }
    close();
  };

  /**
   * Two presses, one row — never a confirm button.
   *
   * `orders.void` is step-up protected for anyone who is not an admin, so a
   * 403 here is a policy answer, not a failure: say which grant is missing
   * rather than a bare "delete failed".
   */
  const deleteOrder = async () => {
    if (!deleteArmed) {
      setDeleteArmed(true);
      return;
    }
    close();
    try {
      const res = await fetch(`/api/orders/${orderId}`, { method: 'DELETE' });
      if (res.status === 403) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        toast.error(
          body.error === 'STEPUP_REQUIRED'
            ? 'Deleting an order needs a PIN step-up first'
            : 'You do not have permission to delete an order',
        );
        return;
      }
      if (!res.ok) {
        toast.error('Could not delete the order');
        return;
      }
      bustFulfillmentCaches(queryClient);
      toast.success('Order deleted');
    } catch {
      toast.error('Could not delete the order');
    }
  };

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      const key = event.key;
      if (key === 'Escape') {
        event.preventDefault();
        if (view === 'pickers' || view === 'notes' || view === 'paste') {
          backToActions();
          return;
        }
        close();
        return;
      }
      const target = event.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return;
      if (view === 'actions') {
        const hit: Record<string, () => void> = {
          a: () => chooseLane('picker'),
          p: () => chooseLane('packer'),
          n: openNotes,
          i: openMoreInformation,
          u: markUrgent,
          o: markOutOfStock,
          d: () => void deleteOrder(),
          ...(onExceptionsDesk
            ? { r: openExceptionResolve, v: openExceptionPaste }
            : {}),
        };
        const run = hit[key.toLowerCase()];
        if (run) {
          event.preventDefault();
          run();
        }
        return;
      }
      if (rosterMode) return;
      const idx = Number(key) - 1;
      if (idx >= 0 && idx < visibleRoster.length) {
        event.preventDefault();
        commitStaff(visibleRoster[idx]!);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  return (
    <Popover
      open={open}
      onClose={close}
      anchorRef={anchorRef}
      // Outside the table, in the page margin beside the row — never over the
      // columns the operator is reading.
      placement="left-start"
      gap={8}
      role="menu"
      aria-label="Row actions"
      data-testid="morphing-row-action-menu"
    >
      <motion.div
        layout
        className={cn(
          'p-1',
          view === 'notes' || view === 'paste' ? 'min-w-[20rem]' : 'min-w-[15rem]',
        )}
        data-view={viewKey(view)}
      >
        <AnimatePresence mode="popLayout" initial={false}>
          {view === 'actions' ? (
            <motion.div key="actions-view" layout className="flex flex-col gap-0.5">
              {onExceptionsDesk ? (
                <>
                  <MorphingMenuRow
                    label="Paste item #"
                    hotkey="V"
                    tone="accent"
                    onClick={openExceptionPaste}
                  />
                  <MorphingMenuRow
                    label="Resolve"
                    hotkey="R"
                    tone="success"
                    onClick={openExceptionResolve}
                  />
                  <MorphingMenuSeparator />
                </>
              ) : null}
              <MorphingMenuRow
                label="Picked by"
                hint={pickerName}
                hotkey="A"
                tone="accent"
                onClick={() => chooseLane('picker')}
              />
              <MorphingMenuRow
                label="Packed by"
                hint={packerName}
                hotkey="P"
                tone="success"
                onClick={() => chooseLane('packer')}
              />
              <MorphingMenuSeparator />
              <MorphingMenuRow
                label="Notes"
                hint={notesHint}
                hotkey={MORPHING_NOTES_HOTKEY}
                onClick={openNotes}
              />
              <MorphingMenuRow
                label="More information"
                hotkey={MORPHING_MORE_INFO_HOTKEY}
                onClick={openMoreInformation}
              />
              <MorphingMenuSeparator />
              <MorphingMenuRow label="Mark urgent" hotkey="U" tone="warning" onClick={markUrgent} />
              <MorphingMenuRow
                label="Out of stock"
                hint="Pending"
                hotkey="O"
                tone="warning"
                onClick={markOutOfStock}
              />
              <MorphingMenuSeparator />
              <MorphingMenuRow
                label={deleteArmed ? 'Delete — press again' : 'Delete'}
                hotkey="D"
                tone="danger"
                onClick={() => void deleteOrder()}
              />
            </motion.div>
          ) : view === 'notes' ? (
            <motion.div key="notes-view" layout className="px-1 pb-1">
              <OrderNotesTrail
                orderId={orderId}
                legacyNote={record.notes}
                autoFocus
              />
            </motion.div>
          ) : view === 'paste' ? (
            <motion.div
              key="paste-view"
              layout
              className="px-1 pb-1"
              data-testid="exceptions-paste-item-field"
              onKeyDown={(event) => {
                if (event.key !== 'Escape') return;
                event.preventDefault();
                event.stopPropagation();
                backToActions();
              }}
            >
              <SearchField
                value={pasteDraft}
                onChange={setPasteDraft}
                onSearch={commitExceptionPaste}
                placeholder="Item number or listing URL…"
                autoFocus
                hideLeadingIcon
                hideUnderline
                fillHost
                tone="neutral"
                isSearching={pasting}
                debounceMs={0}
              />
            </motion.div>
          ) : (
            <motion.div
              key="pickers-view"
              layout="position"
              className="w-[280px] overflow-hidden"
            >
              <AssigneeComboboxPanel
                heading={lane === 'packer' ? 'Assign packer' : 'Assign picker'}
                numbered
                query={staffQuery}
                onQueryChange={setStaffQuery}
                rows={panelStaff.map((row) => ({
                  id: row.id,
                  name: row.name,
                  assignable: true,
                  leading: (
                    <StaffAvatar staffId={row.id} name={row.name} size="sm" colorRing />
                  ),
                  faces: rosterFaces.map((face) => ({
                    id: face,
                    label: staffLaneFaceLabel(face),
                    checked: staffMatchesStageLane(row, face),
                  })),
                }))}
                loading={!staffReady}
                emptyMessage={
                  !staffReady
                    ? 'Loading staff…'
                    : staffQuery.trim()
                      ? 'No matches'
                      : rosterMode
                        ? 'No staff'
                        : lane === 'packer'
                          ? 'No packers'
                          : 'No pickers'
                }
                roster={rosterMode}
                showAllStaff
                onAllStaff={() => setRosterMode((next) => !next)}
                onSelect={(row) => commitStaff(row)}
                onFaceChange={(row, faceId, eligible) => {
                  const face = faceId as CompoundStageAssignRole;
                  const nextLane = eligible ? face : oppositeStaffLane(face);
                  setStaff((prev) =>
                    prev.map((member) =>
                      member.id === row.id ? applyStaffLaneRole(member, nextLane) : member,
                    ),
                  );
                  persistLaneRole(row.id, nextLane, row.name, { face, eligible });
                }}
                onEscape={backToActions}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </Popover>
  );
}

/**
 * Mobile stack gutter — its own checkbox, so the manifold comes with it.
 * The desktop grid does NOT come through here: it paints its leading track via
 * the shared compound engine, which takes data and not JSX, so the desk row
 * mounts {@link MorphingRowActionMenu} beside its cells instead.
 */
export function MorphingSelectGutter({
  record,
  isChecked,
  chrome,
  onToggleSelect,
  enabled,
}: {
  record: ShippedOrder;
  isChecked: boolean;
  chrome?: GridSelectGutterChrome;
  onToggleSelect: (record: ShippedOrder, event: { shiftKey: boolean }) => void;
  enabled: boolean;
}) {
  const anchorRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);

  if (!enabled) {
    return (
      <GridRowCheckbox
        checked={isChecked}
        onToggle={(event) => onToggleSelect(record, event)}
        label={isChecked ? 'Deselect row' : 'Select row'}
        chrome={chrome}
      />
    );
  }

  return (
    <div ref={anchorRef} className="relative h-full w-full">
      <GridRowCheckbox
        checked={isChecked}
        onToggle={(event) => {
          applyMorphingGutterClick({
            isChecked,
            shiftKey: event.shiftKey,
            onToggle: (next) => onToggleSelect(record, next),
            onOpenMenu: () => setOpen(true),
            onCloseMenu: () => setOpen(false),
          });
        }}
        label={isChecked ? 'Deselect row' : 'Select row and open actions'}
        chrome={chrome}
      />
      <MorphingRowActionMenu
        record={record}
        open={open}
        onClose={() => setOpen(false)}
        anchorRef={anchorRef}
      />
    </div>
  );
}
