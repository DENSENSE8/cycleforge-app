'use client';

/**
 * Column-display control — the SOLE operator entry to `GridColumnDetailsPanel`
 * since chrome Fields was retired (2026-08-02).
 *
 * ## Where it lives
 *
 * **Default:** hover-revealed over the grid card's top-right corner (Notion /
 * Airtable grammar — table chrome on the table). Reserves no column track and
 * no page gutter.
 *
 * **Unbox triage band (2026-08-03):** when {@link triggerPortalTarget} is set,
 * the same trigger portals into the Unbox header refine row (staff / filter /
 * week) so it sits with those icon controls. Open state + rail stay here —
 * one door, one room; only the paint host moves.
 *
 * Mount via {@link GridColumnGutter}.
 */

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { ColumnsThree } from '@/components/Icons';
import { GridColumnDetailsPanel } from '@/components/ui/table-column-config/GridColumnDetailsPanel';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import { ToolbarButton } from '@/components/ui/ToolbarButton';
import { cn } from '@/utils/_cn';
import type { TableId } from '@/lib/tables/table-columns';
import type { LedgerGridColumnModel } from './grid-surface-descriptor';
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
 * `children` is the framed table card. The wrapper is a positioning context
 * for the default card-corner float. When {@link triggerPortalTarget} is set
 * (Unbox triage band), the trigger paints there instead — still owned here so
 * open state and panel cannot fork.
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
   * Optional host (e.g. Unbox `data-unbox-controls` slot). When set, the
   * trigger portals there as a resident icon — no card-corner float.
   */
  triggerPortalTarget?: HTMLElement | null;
}) {
  const [open, setOpen] = useState(false);
  const [seedKey, setSeedKey] = useState<string | null>(null);
  const openDetails = useCallback<OpenColumnDetailsFn>((hideKey) => {
    setSeedKey(hideKey ?? null);
    setOpen(true);
  }, []);
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

  const cardCornerTrigger = (
    <div
      className={cn(
        'pointer-events-none absolute right-1.5 top-1.5 z-header rounded-lg bg-surface-card shadow-sm',
        'motion-safe:transition-opacity motion-safe:duration-100',
        'opacity-0 group-hover/grid-card:opacity-100 group-focus-within/grid-card:opacity-100',
        'group-hover/grid-card:pointer-events-auto group-focus-within/grid-card:pointer-events-auto',
        open && 'opacity-100',
        open && 'pointer-events-auto',
      )}
    >
      {trigger}
    </div>
  );

  return (
    <GridColumnDetailsOpenContext.Provider value={openDetails}>
      <GridColumnFieldsContext.Provider value={fieldsApi}>
        <div className="group/grid-card relative flex h-full min-h-0 min-w-0 flex-1 flex-col">
          {children}
          {triggerPortalTarget
            ? createPortal(trigger, triggerPortalTarget)
            : cardCornerTrigger}
          <GridColumnDetailsPanel
            open={open}
            onClose={() => {
              setOpen(false);
              setSeedKey(null);
            }}
            tableId={tableId}
            columns={columns}
            initialHideKey={seedKey}
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
