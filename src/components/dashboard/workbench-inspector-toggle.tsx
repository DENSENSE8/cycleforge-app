'use client';

/**
 * Band 3 far-right **Show / Hide inspector** — the desk twin of the Station
 * `←|` edge toggle, and the ONE implementation of it.
 *
 * Compose as {@link WorkbenchTriageBand} `trailing` on every desk / ops-queue
 * surface whose grid opens a `RightRailHost` peek. It parks / reopens the push
 * inspector through the detail-stack collapse SoT
 * (`DETAIL_STACK_COLLAPSE` + {@link toggleDetailInspectorCollapsed}) — it never
 * clears the rail occupant target, so a filter edit keeps the same record open.
 *
 * **Operator copy is `Show inspector` / `Hide inspector` — never Station
 * `Open displays` / `Hide right panel`** (SoT: source-of-truth.md → Displays vs
 * inspector). A `RightRailHost` peek is an inspector; "Displays" is the station
 * scan push column.
 *
 * **Empty rail opens Column display.** When nothing is on the right edge and
 * the caller did not pass {@link onOpenEmpty}, the toggle pushes
 * `detail:grid-column-details` — Band 3 no longer paints ▦. Unbox / To-ship
 * pass their own View-only shell opener and keep that door.
 *
 * Hotkeys (opt-in, default on): **⌘\\** and bare **]**. Never ⌘] — Station
 * Displays owns that chord. The bare key stands down inside an editable target,
 * or typing `]` into the band's own find field would park the inspector.
 *
 * **The glyph is static, so the FILL carries the state.** `ColumnsTwo` looks the
 * same parked or pushed; until 2026-08-20 the only difference between the two
 * states was the tooltip, which means an operator had to hover a control to
 * learn what it had already done. It now wears the band's lit face
 * ({@link WorkbenchBandControl} `lit`) while the inspector is showing — the same
 * solid blue Views wears while a saved view is applied.
 *
 * Goldens: Unbox History (`unbox-history-inspector-toggle`) · To-ship
 * (`orders-inspector-toggle`). Both hand-rolled this control before 2026-08-08;
 * it is one component now — do not fork a third.
 */

import { useCallback, useEffect, useState } from 'react';
import { ColumnsTwo } from '@/components/Icons';
import {
  WorkbenchBandControl,
  WORKBENCH_BAND_CONTROL_GLYPH_CLASS,
} from '@/components/dashboard/workbench-band-control';
import {
  GRID_COLUMN_DETAILS_RAIL_ID,
  requestOpenGridColumnDetails,
} from '@/design-system/components/grid/grid-column-details-open';
import { useRightRailOccupantOpen } from '@/components/right-rail/useRightRailOccupant';
import {
  DETAIL_INSPECTOR_COLLAPSE_EVENT,
  getDetailInspectorCollapsed,
  setDetailInspectorCollapsed,
  toggleDetailInspectorCollapsed,
  type DetailInspectorCollapseDetail,
} from '@/design-system/shells/detail-stack';
import { isEditableKeyTarget } from '@/lib/keyboard/is-editable-key-target';

const SHOW_LABEL = 'Show inspector';
const HIDE_LABEL = 'Hide inspector';

function useWorkbenchInspectorToggle({
  open,
  onOpenEmpty,
  hotkeys = true,
  enabled = true,
}: {
  /** An inspector target exists (row picked, or a View-only shell is showing). */
  open: boolean;
  /**
   * Called instead of toggling when nothing is open — e.g. To-ship / Unbox
   * History open a View-only shell so layout chrome stays reachable with no row
   * selected. Omit on surfaces where "no row" simply means nothing to show.
   */
  onOpenEmpty?: () => void;
  /** Bind ⌘\ + bare `]`. */
  hotkeys?: boolean;
  /** Off while the host tab does not own the inspector (Unbox non-History). */
  enabled?: boolean;
}) {
  const [collapsed, setCollapsed] = useState(() => getDetailInspectorCollapsed());

  useEffect(() => {
    const onCollapse = (event: Event) => {
      const detail = (event as CustomEvent<DetailInspectorCollapseDetail>).detail;
      if (!detail || typeof detail.collapsed !== 'boolean') return;
      setCollapsed(detail.collapsed);
    };
    window.addEventListener(DETAIL_INSPECTOR_COLLAPSE_EVENT, onCollapse);
    return () => window.removeEventListener(DETAIL_INSPECTOR_COLLAPSE_EVENT, onCollapse);
  }, []);

  const toggle = useCallback(() => {
    if (!open) {
      if (!onOpenEmpty) return;
      onOpenEmpty();
      setDetailInspectorCollapsed(false);
      setCollapsed(false);
      return;
    }
    toggleDetailInspectorCollapsed();
    setCollapsed(getDetailInspectorCollapsed());
  }, [onOpenEmpty, open]);

  useEffect(() => {
    if (!hotkeys || !enabled) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat) return;
      const isCmdBackslash =
        (e.metaKey || e.ctrlKey) && (e.key === '\\' || e.code === 'Backslash');
      // Bare `]` is a printable character — yield to the find field.
      const isBracket =
        !e.metaKey && !e.ctrlKey && !e.altKey && e.key === ']' && !isEditableKeyTarget(e.target);
      if (!isCmdBackslash && !isBracket) return;
      e.preventDefault();
      toggle();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [enabled, hotkeys, toggle]);

  const showing = open && !collapsed;
  return { collapsed, showing, label: showing ? HIDE_LABEL : SHOW_LABEL, toggle };
}

export function WorkbenchInspectorToggle({
  open,
  onOpenEmpty,
  hotkeys = true,
  enabled = true,
  testId = 'workbench-inspector-toggle',
}: {
  open: boolean;
  onOpenEmpty?: () => void;
  hotkeys?: boolean;
  enabled?: boolean;
  /** Per-surface testid — the goldens keep their historical ids. */
  testId?: string;
}) {
  const columnDisplayOpen = useRightRailOccupantOpen(GRID_COLUMN_DETAILS_RAIL_ID);
  const { showing, label, toggle } = useWorkbenchInspectorToggle({
    open: open || columnDisplayOpen,
    onOpenEmpty: onOpenEmpty ?? requestOpenGridColumnDetails,
    hotkeys,
    enabled,
  });

  if (!enabled) return null;

  return (
    <WorkbenchBandControl
      label={label}
      lit={showing}
      aria-pressed={showing}
      icon={<ColumnsTwo className={WORKBENCH_BAND_CONTROL_GLYPH_CLASS} />}
      onClick={toggle}
      data-testid={testId}
    />
  );
}
