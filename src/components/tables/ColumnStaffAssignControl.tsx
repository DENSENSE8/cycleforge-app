'use client';

/**
 * Column-foot staff assign — searchable list that grows UP from the person
 * icon under Pick / Pack. Portaled + fixed so the sticky foot's overflow and
 * table stacking cannot bury it. Roster is role-filtered (pickers vs packers).
 * Enter / click commits optimistically onto the current table selection.
 */

import {
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { createPortal } from 'react-dom';
import { User } from '@/components/Icons';
import { StaffAvatar } from '@/components/identity';
import { AssigneeComboboxPanel } from '@/design-system/components/AssigneeCombobox';
import { IconButton } from '@/design-system/primitives/IconButton';
import { KeyboardKey } from '@/design-system/primitives/KeyboardKey';
import { DROPDOWN_SHELL_CORNER } from '@/design-system/tokens/radius';
import { elevationClass } from '@/design-system/tokens/shadows';
import { zIndex } from '@/design-system/tokens/z-index';
import { getActiveStaff, peekActiveStaff, type StaffMember } from '@/lib/staffCache';
import { staffLaneEmptyLabel, staffMatchesStageLane } from '@/components/tables/compound/staff-stage-lane';
import { useOrderAssignment } from '@/hooks/useOrderAssignment';
import { useTableSelection } from '@/hooks/useTableSelection';
import { DASHBOARD_ORDERS_SELECTION_SCOPE } from '@/lib/selection/dashboard-scopes';
import { refreshDomain } from '@/lib/refresh/bus';
import { toast } from '@/lib/toast';
import {
  closeStageAssignPanel,
  toggleStageAssignPanel,
  useStageAssignPanelLane,
  type StageAssignPanelLane,
} from '@/lib/tables/stage-assign-panel-store';
import { cn } from '@/utils/_cn';

type StaffRow = StaffMember;

export function ColumnStaffAssignControl({
  lane,
  label,
  hotkey,
  showHotkey,
}: {
  lane: StageAssignPanelLane;
  label: string;
  hotkey?: string;
  showHotkey: boolean;
}) {
  const openLane = useStageAssignPanelLane();
  const open = openLane === lane;
  const selectedRows = useTableSelection<{ id?: number | string }>(
    DASHBOARD_ORDERS_SELECTION_SCOPE,
    (r) => Number(r.id),
  );
  const assignOrder = useOrderAssignment();
  const [options, setOptions] = useState<StaffRow[]>(() => peekActiveStaff() ?? []);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(() => !peekActiveStaff());
  const [saving, setSaving] = useState(false);
  const [panelBox, setPanelBox] = useState<{ left: number; bottom: number } | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const listId = useId();

  useLayoutEffect(() => {
    if (!open) {
      setPanelBox(null);
      return;
    }
    const place = () => {
      const el = buttonRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      setPanelBox({ left: rect.left, bottom: window.innerHeight - rect.top + 4 });
    };
    place();
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => {
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) setQuery('');
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const cached = peekActiveStaff();
    if (cached) {
      setOptions(cached);
      setLoading(false);
    } else {
      setLoading(true);
    }
    let cancelled = false;
    getActiveStaff()
      .then((members) => {
        if (cancelled) return;
        const list = Array.isArray(members) ? members : [];
        setOptions(
          list
            .filter((m) => Number.isFinite(m.id) && m.id > 0 && m.name.trim())
            .sort((a, b) => a.name.localeCompare(b.name)),
        );
      })
      .catch(() => {
        if (!cancelled) setOptions([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: MouseEvent) => {
      const t = event.target;
      if (!(t instanceof Node)) return;
      if (buttonRef.current?.contains(t)) return;
      if (panelRef.current?.contains(t)) return;
      closeStageAssignPanel();
    };
    const onKey = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        closeStageAssignPanel();
      }
    };
    document.addEventListener('mousedown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const stageLane = lane === 'pack' ? 'packer' : 'technician';
    return options.filter((o) => {
      if (!staffMatchesStageLane(o, stageLane)) return false;
      if (!q) return true;
      return o.name.toLowerCase().includes(q);
    });
  }, [options, query, lane]);

  const commit = async (row: StaffRow) => {
    const orderIds = selectedRows
      .map((r) => Number(r.id))
      .filter((n) => Number.isFinite(n) && n > 0);
    if (orderIds.length === 0) {
      toast.error('Select at least one order');
      return;
    }
    setSaving(true);
    try {
      await assignOrder.mutateAsync(
        lane === 'pick'
          ? { orderIds, testerId: row.id, testerName: row.name }
          : { orderIds, packerId: row.id, packerName: row.name },
      );
      toast.success(
        orderIds.length === 1
          ? `${label} assigned`
          : `${label} assigned on ${orderIds.length} orders`,
      );
      refreshDomain('orders.outbound');
      closeStageAssignPanel();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not assign');
    } finally {
      setSaving(false);
    }
  };

  const letter = hotkey?.trim().toLowerCase();
  const showGlyph = Boolean(showHotkey && letter && letter.length === 1);
  const aria = letter ? `${label} (press ${letter.toUpperCase()})` : label;

  const panel =
    open && panelBox && typeof document !== 'undefined'
      ? createPortal(
          <div
            ref={panelRef}
            role="listbox"
            aria-label={label}
            data-testid={`stage-assign-bottom-up-${lane}`}
            style={{
              position: 'fixed',
              left: panelBox.left,
              bottom: panelBox.bottom,
              zIndex: zIndex.panelPopover,
              width: 260,
            }}
            className={cn(
              'overflow-hidden border border-border-soft bg-surface-card p-1 text-text-default',
              DROPDOWN_SHELL_CORNER,
              elevationClass('overlay'),
            )}
          >
            <AssigneeComboboxPanel
              query={query}
              onQueryChange={setQuery}
              rows={filtered.map((row) => ({
                id: row.id,
                name: row.name,
                assignable: true,
                leading: (
                  <StaffAvatar
                    staffId={row.id}
                    name={row.name}
                    size="sm"
                    colorRing
                    avatarPhotoId={null}
                    alt=""
                  />
                ),
              }))}
              loading={loading}
              emptyMessage={
                options.length === 0
                  ? 'No staff'
                  : query.trim()
                    ? 'No matches'
                    : staffLaneEmptyLabel(lane === 'pack' ? 'packer' : 'technician')
              }
              roster={false}
              onSelect={(row) => {
                const member = options.find((item) => item.id === row.id);
                if (member) void commit(member);
              }}
              disabled={saving}
              listId={listId}
              className={DROPDOWN_SHELL_CORNER}
              onEscape={closeStageAssignPanel}
            />
          </div>,
          document.body,
        )
      : null;

  return (
    <span
      className="relative inline-flex shrink-0"
      data-testid="data-table-selection-action-wrap"
    >
      <IconButton
        ref={buttonRef}
        type="button"
        size="md"
        tone="neutral"
        icon={<User className="h-4 w-4" />}
        ariaLabel={aria}
        title={label}
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-keyshortcuts={letter ? letter.toUpperCase() : undefined}
        data-testid={`data-table-selection-action-assign-${lane}`}
        onClick={() => toggleStageAssignPanel(lane)}
        className="relative z-raised hover:bg-surface-hover"
      />
      {showGlyph && letter ? (
        <KeyboardKey
          aria-hidden
          size="sm"
          data-testid="data-table-selection-hotkey-cap"
          className="pointer-events-none absolute right-1.5 top-1/2 z-raised -translate-y-1/2"
        >
          {letter}
        </KeyboardKey>
      ) : null}
      {panel}
    </span>
  );
}
