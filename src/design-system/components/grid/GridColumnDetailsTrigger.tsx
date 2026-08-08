'use client';

/**
 * Column-display control — the SOLE operator entry to `GridColumnDetailsPanel`
 * since chrome Fields was retired (2026-08-02).
 *
 * ## Portal or nothing (ruled 2026-08-08)
 *
 * The trigger is painted in exactly ONE way: portaled into a host it is given.
 * Two hosts exist — the **Band-3 `WorkbenchTriageBand` controls slot** (the
 * norm) and the **inspector View cluster** (Unbox · To-ship). With no host,
 * **nothing is painted**.
 *
 * **The card-corner hover-reveal float is DELETED, and must not come back.** It
 * hover-revealed a floating ▦ over the grid card's top-right corner, on the
 * Notion / Airtable argument that table chrome materialises on the table you are
 * pointing at. That grammar is for a pointer-precise authoring tool and was
 * never paid for here: it overlapped the first column header, and an operator
 * who does not know the control exists cannot hover a corner to discover it.
 * The `triggerPortalOnly` opt-out went with it — there is no fallback left to
 * opt out of.
 *
 * A surface with no host therefore shows no ▦ and keeps its descriptor default
 * columns. **Do not "fix" that by re-adding a float** — give the surface a host,
 * or wire the right-click column menu.
 *
 * Open state, the fields context and the rail all stay on {@link GridColumnGutter};
 * only the paint location ever moved.
 */

import {
  createContext,
  useCallback,
  useContext,
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
 * `children` is the framed table card. The trigger paints only into
 * {@link triggerPortalTarget} (Band-3 controls slot / inspector View topics) —
 * still owned here, so open state and the panel cannot fork no matter where the
 * icon lands. With no host, nothing is painted.
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
   * The paint host — a Band-3 controls slot or an inspector View cluster. Null
   * (or an absent / parked host) paints NO trigger; there is no fallback.
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

  // Portal or nothing. No host ⇒ no trigger — see the docblock for why the
  // card-corner float is not coming back.
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
