'use client';

/**
 * Column-foot staff assign — searchable list that grows UP from the person
 * icon under Pick / Pack. Portaled + fixed so the sticky foot's overflow and
 * table stacking cannot bury it. Full active roster; Enter / click commits
 * optimistically onto the current table selection.
 */

import {
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from 'react';
import { createPortal } from 'react-dom';
import { Command } from 'cmdk';
import { Check, Search, User } from '@/components/Icons';
import { StaffAvatar } from '@/components/identity';
import { IconButton } from '@/design-system/primitives/IconButton';
import { KeyboardKey } from '@/design-system/primitives/KeyboardKey';
import { DROPDOWN_ITEM_CORNER, DROPDOWN_SHELL_CORNER } from '@/design-system/tokens/radius';
import { elevationClass } from '@/design-system/tokens/shadows';
import { zIndex } from '@/design-system/tokens/z-index';
import { getActiveStaff } from '@/lib/staffCache';
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

type StaffRow = { id: number; name: string };

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
  const [options, setOptions] = useState<StaffRow[]>([]);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [panelBox, setPanelBox] = useState<{ left: number; bottom: number } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
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
    if (!open) {
      setQuery('');
      return;
    }
    const id = requestAnimationFrame(() => inputRef.current?.focus());
    return () => cancelAnimationFrame(id);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    getActiveStaff()
      .then((members) => {
        if (cancelled) return;
        const list = Array.isArray(members) ? members : [];
        setOptions(
          list
            .map((m) => ({ id: Number(m.id), name: String(m.name || '').trim() }))
            .filter((m) => Number.isFinite(m.id) && m.id > 0 && m.name)
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
    if (!q) return options;
    return options.filter((o) => o.name.toLowerCase().includes(q));
  }, [options, query]);

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

  const onListKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      closeStageAssignPanel();
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
            <Command
              shouldFilter={false}
              className={cn('bg-surface-card', DROPDOWN_SHELL_CORNER)}
              onKeyDown={onListKeyDown}
              id={listId}
            >
              <div
                className="flex items-center gap-2 border-b border-border-hairline px-2.5 py-2"
                cmdk-input-wrapper=""
              >
                <Search className="h-3.5 w-3.5 shrink-0 text-text-faint" aria-hidden />
                <Command.Input
                  ref={inputRef}
                  value={query}
                  onValueChange={setQuery}
                  placeholder="Search staff…"
                  disabled={saving}
                  className="w-full bg-transparent text-role-micro text-text-default outline-none placeholder:text-text-faint"
                />
              </div>
              <Command.List className="max-h-56 overflow-y-auto py-1">
                {loading ? (
                  <div className="px-3 py-3 text-center text-role-micro text-text-faint">
                    Loading…
                  </div>
                ) : (
                  <Command.Empty className="px-3 py-4 text-center text-role-eyebrow uppercase tracking-wider text-text-faint">
                    {options.length === 0 ? 'No staff' : 'No matches'}
                  </Command.Empty>
                )}
                {filtered.map((row) => (
                  <Command.Item
                    key={row.id}
                    value={`${row.name} ${row.id}`}
                    disabled={saving}
                    onSelect={() => {
                      void commit(row);
                    }}
                    className={cn(
                      'flex w-full cursor-pointer items-center gap-2 px-2.5 py-1.5 text-left outline-none transition-colors',
                      DROPDOWN_ITEM_CORNER,
                      'data-[selected=true]:bg-surface-hover text-text-default',
                    )}
                  >
                    <StaffAvatar
                      staffId={row.id}
                      name={row.name}
                      size="sm"
                      colorRing
                      avatarPhotoId={null}
                      alt=""
                    />
                    <span className="min-w-0 flex-1 truncate text-role-micro font-medium">
                      {row.name}
                    </span>
                    <Check className="h-3.5 w-3.5 shrink-0 opacity-0" aria-hidden />
                  </Command.Item>
                ))}
              </Command.List>
            </Command>
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
