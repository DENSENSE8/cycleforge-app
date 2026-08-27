'use client';

/**
 * Column-display control — operator entry to `GridColumnDetailsPanel`
 * since chrome Fields was retired (2026-08-02).
 *
 * ## Inspector, not Band 3 (ruled 2026-08-12)
 *
 * Column display lives on the **right rail**, reached via **Show inspector**.
 * Band 3 / the top banner must not paint ▦.
 *
 * Two remaining doors:
 * 1. **Show inspector** with an empty rail — {@link WorkbenchInspectorToggle}
 *    dispatches {@link requestOpenGridColumnDetails}; this gutter opens the
 *    panel. Used on every desk grid that does not already host ▦ in an
 *    inspector View cluster.
 * 2. **Inspector View cluster portal** (Unbox · To-ship) — pass
 *    {@link triggerPortalTarget} so ▦ paints beside compare / zoom / paint.
 *
 * **The card-corner hover-reveal float is DELETED, and must not come back.**
 * Open state, the fields context and the rail all stay on {@link GridColumnGutter}.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { ColumnsThree } from '@/components/Icons';
import { GridColumnDetailsPanel } from '@/components/ui/table-column-config/GridColumnDetailsPanel';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import { ToolbarButton } from '@/components/ui/ToolbarButton';
import type { TableId } from '@/lib/tables/table-columns';
import type { LedgerGridColumnModel } from './grid-surface-descriptor';
import {
  GRID_COLUMN_DETAILS_OPEN_EVENT,
} from './grid-column-details-open';
import { useGridFields } from './useGridColumnVisibility';

type OpenColumnDetailsFn = (hideKey?: string | null) => void;

type GridColumnFieldsApi = {
  fields: ReadonlyArray<{ key: string; label: string; visible: boolean }>;
  setFieldVisible: (hideKey: string, visible: boolean) => void;
};

const GridColumnDetailsOpenContext = createContext<OpenColumnDetailsFn | null>(
  null,
);

const GridColumnFieldsContext = createContext<GridColumnFieldsApi | null>(null);

/** Open the Fields rail for this grid card (optionally seeded on a hideKey). */
export function useOpenGridColumnDetails(): OpenColumnDetailsFn {
  return useContext(GridColumnDetailsOpenContext) ?? (() => undefined);
}

/** Visibility list + writer for Sheets header menus (Add / Hide column). */
export function useGridColumnFieldsApi(): GridColumnFieldsApi | null {
  return useContext(GridColumnFieldsContext);
}

/**
 * Mounts the column-display trigger + the rail it opens.
 *
 * `children` is the framed table card. The ▦ trigger paints only into
 * {@link triggerPortalTarget} (inspector View topics on Unbox · To-ship) —
 * still owned here, so open state and the panel cannot fork. With no host,
 * Show inspector opens the panel via {@link GRID_COLUMN_DETAILS_OPEN_EVENT}.
 *
 * `columns` is the family's **FULL canonical model**, never the resolved-visible
 * list — the rail must offer the tracks that are currently OFF.
 */
export function GridColumnGutter<C extends LedgerGridColumnModel>({
  tableId,
  columns,
  children,
  triggerPortalTarget = null,
}: {
  /** Staff-prefs identity — the panel's bucket and the visibility key. */
  tableId: TableId;
  /** FULL canonical column model (pre-visibility). */
  columns: readonly C[];
  children: ReactNode;
  /**
   * Inspector View cluster host (Unbox · To-ship). Null paints NO ▦ — Show
   * inspector opens the panel instead. Never a Band-3 / banner slot.
   */
  triggerPortalTarget?: HTMLElement | null;
}) {
  const [open, setOpen] = useState(false);
  const [seedKey, setSeedKey] = useState<string | null>(null);
  // Host owns the framed card so Columns Display can live-scrub `--cf-col-*`
  // on THIS grid's surface even though the rail itself is portaled out.
  const hostRef = useRef<HTMLDivElement>(null);
  const getGridSurface = useCallback(
    () => hostRef.current?.querySelector<HTMLElement>('[data-cf-grid]') ?? null,
    [],
  );
  const openDetails = useCallback<OpenColumnDetailsFn>((hideKey) => {
    setSeedKey(hideKey ?? null);
    setOpen(true);
  }, []);
  // Show inspector (empty rail) opens this panel when ▦ is not portaled into
  // an inspector View cluster. Skip the listener while a portal host owns the
  // door so Unbox / To-ship do not double-open.
  useEffect(() => {
    if (triggerPortalTarget) return;
    const onOpen = () => openDetails(null);
    window.addEventListener(GRID_COLUMN_DETAILS_OPEN_EVENT, onOpen);
    return () => window.removeEventListener(GRID_COLUMN_DETAILS_OPEN_EVENT, onOpen);
  }, [openDetails, triggerPortalTarget]);
  const { fields, setFieldVisible } = useGridFields(tableId, columns);
  const fieldsApi = useMemo<GridColumnFieldsApi>(
    () => ({
      fields: fields.map((f) => ({
        key: f.key,
        label: f.label,
        visible: f.visible,
      })),
      setFieldVisible,
    }),
    [fields, setFieldVisible],
  );

  const trigger = (
    <GridColumnDetailsTrigger onOpen={() => openDetails(null)} open={open} />
  );

  // Portal into an inspector View cluster, or nothing. Band 3 is not a host.
  const paintedTrigger = triggerPortalTarget
    ? createPortal(trigger, triggerPortalTarget)
    : null;

  return (
    <GridColumnDetailsOpenContext.Provider value={openDetails}>
      <GridColumnFieldsContext.Provider value={fieldsApi}>
        <div
          ref={hostRef}
          className="relative flex h-full min-h-0 min-w-0 flex-1 flex-col"
        >
          {children}
          {paintedTrigger}
          <GridColumnDetailsPanel
            open={open}
            onClose={() => {
              setOpen(false);
              setSeedKey(null);
            }}
            tableId={tableId}
            columns={columns}
            initialHideKey={seedKey}
            getGridSurface={getGridSurface}
          />
        </div>
      </GridColumnFieldsContext.Provider>
    </GridColumnDetailsOpenContext.Provider>
  );
}

export function GridColumnDetailsTrigger({
  onOpen,
  open = false,
}: {
  onOpen: () => void;
  /** Solid fill while its own rail is showing. */
  open?: boolean;
}) {
  return (
    <div data-grid-column-details-trigger="" data-open={open || undefined}>
      <HoverTooltip label="Column display" asChild>
        <ToolbarButton
          type="button"
          iconOnly
          active={open}
          aria-label="Column display"
          aria-haspopup="dialog"
          aria-expanded={open}
          onClick={onOpen}
        >
          <ColumnsThree className="h-3.5 w-3.5 shrink-0" />
        </ToolbarButton>
      </HoverTooltip>
    </div>
  );
}
