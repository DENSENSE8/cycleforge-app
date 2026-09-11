'use client';

/**
 * The compound cell, WRAPPER INCLUDED — the one implementation every family
 * mounts.
 *
 * ## Why the wrapper moved here
 *
 * `CompoundCells.tsx` shared the cell BODIES and left each family to supply the
 * surrounding `<div>` — grid-cell class, `data-col`, frozen token, sticky
 * offset. That sounded like a clean seam and was not one: the wrapper is where
 * a cell's POSITION is decided, so leaving it per-family left the layout forked
 * in the one place nobody thinks to compare. Both copies drifted, in opposite
 * directions, from the same column model:
 *
 * - Receiving pinned the `thumb` cell with `receivingGridFrozenLeft('thumb')`,
 *   a closure over the FLAT column constant, where `thumb` does not appear. The
 *   lookup missed, the offset collapsed to the first frozen slot, and under
 *   horizontal scroll the photo pinned on top of the checkbox.
 * - Orders never applied a frozen class to `thumb` at all, so the same column —
 *   declared `frozen: true` in the same shared model — simply scrolled away.
 *
 * One column model, two behaviours, neither of them the declared one. So the
 * wrapper is shared too, and it derives everything from the model that is
 * actually mounted: `col.frozen` decides sticky, `gridFrozenLeft(columns, key)`
 * decides the offset. A family now contributes an ADAPTER and a COLUMN ARRAY.
 * Never a cell — not the body, and not the box around it.
 *
 * ## What a family still passes
 *
 * Only per-surface facts the model cannot carry: the mounted `columns` (a
 * surface may hide tracks per staff) and the one CAPABILITY handler, `onOpen`
 * (present ⇒ the chevron renders). Absence means read-only, never a second
 * component with the control deleted.
 */

import type { ReactNode } from 'react';
import {
  gridDataCellClass,
  LEDGER_GRID_FROZEN_CELL,
} from '@/design-system/components/grid';
import { gridFrozenLeft } from '@/design-system/components/grid/grid-column-geometry';
import { ChevronDown, ChevronRight } from '@/components/Icons';
import { focusRing } from '@/design-system/tokens/focus-ring';
import { cn } from '@/utils/_cn';
import type { FieldDisplayType } from '@/lib/tables/field-catalog/types';
import {
  CompoundFulfillment,
  CompoundItem,
  CompoundActions,
  CompoundDates,
  CompoundSelect,
  CompoundSlotCell,
  CompoundState,
  CompoundThumb,
} from './CompoundCells';
import { COMPOUND_TWO_LINE_CLASS } from './CompoundCell';
import { isCompoundColumnModel } from './compound-columns';
import { COMPOUND_ROW_PX } from './compound-row-chrome';
import type {
  CompoundRowAction,
  CompoundRowView,
  CompoundSubtitleSelect,
  CompoundSubtitleEdit,
  CompoundOrderedAtEdit,
  CompoundShipByEdit,
  CompoundStageAssign,
  CompoundStaffRoster,
} from './compound-row-model';

/**
 * Structural, dependency-free by design — the same reason
 * `grid-column-geometry` types its params structurally. Every family's column
 * interface satisfies this.
 */
interface CompoundCellColumn {
  key: string;
  width: string;
  frozen?: boolean;
  hideKey?: string;
  align?: 'start' | 'end' | 'center';
  /** Slot-track metadata (materialized `status:N` columns) — see
   *  `materialize-tracks.ts`. Absent on the structural chrome tracks. */
  label?: string;
  fieldId?: string;
  slotIconKey?: string;
  slotDisplayType?: FieldDisplayType;
  slotStageLabels?: Readonly<{ done: string; pending: string }>;
}

export interface CompoundGridCellParams<C extends CompoundCellColumn> {
  col: C;
  /** The MOUNTED model — sticky offsets derive from it, never from a constant. */
  columns: readonly C[];
  /** False on the last visible column (drops the trailing rule). */
  rule: boolean;
  view: CompoundRowView;
  /**
   * Org-shared column formatting for THIS column, already resolved to classes
   * by `columnFormatClass`. Supplied by {@link CompoundRow} (a component, so it
   * can read the sheet's format context); this function stays pure.
   */
  formatClass?: string;
  /** Present ⇒ the title hover menu carries an "Open" item. */
  onOpen?: () => void;
  /**
   * Extra verbs for this row's title hover, after listing/copy.
   *
   * Presentational entries only (label + callback). A family cannot pass JSX,
   * which is what stops a bespoke control reappearing inside the shared row.
   */
  actions?: readonly CompoundRowAction[];
  /**
   * The SELECTION capability for this row.
   *
   * Present ⇒ the leading gutter paints the checkmark face; absent ⇒ the track
   * renders as an empty (still edge-to-edge) cell. Inside it, `onToggle`
   * decides interactive-vs-decorative — see {@link CompoundSelect}.
   *
   * What a tick MEANS is the family's: bulk membership on Receiving, Incoming
   * and To-Ship; row select + Morphing on Tasks. The picture is the same
   * everywhere, which is the point — an operator learns one mark.
   */
  select?: {
    checked: boolean | 'mixed';
    /** Receives the click's modifier state so shift-click can extend a range. */
    onToggle?: (event: { shiftKey: boolean }) => void;
    label: string;
    disabled?: boolean;
    /**
     * Leaf detail disclosure — same chrome as parent fold chevron, different
     * verb (`data-row-detail`, not `data-group-fold`). Present ⇒ two-line
     * select stack (check over chevron).
     */
    detail?: {
      open: boolean;
      onToggle: () => void;
      /** Accessible stem — product title or "this line". */
      label: string;
    };
  };
  /**
   * In-place SELECT editors for bound subtitle parts (matched by part key).
   * Present ⇒ the claimed part edits in place; absent ⇒ the same part is
   * read-only. See {@link CompoundSubtitleSelect}.
   */
  subtitleSelects?: readonly CompoundSubtitleSelect[];
  /** Free-text / numeric in-place editors, matched to parts by key. */
  subtitleEdits?: readonly CompoundSubtitleEdit[];

  /** Part key of the NOTE fact — pinned right as a glyph. */
  subtitleNoteKey?: string;
  /** The note's full text. */
  noteText?: string | null;
  /** Present ⇒ the inline under-title facts drag to reorder (field onto field). */
  onReorderSubtitle?: (dragKey: string, dropKey: string) => void;
  /** Present ⇒ the DATES cell's deadline line COMMITS; absent leaves the same
   *  field disabled (see {@link CompoundDates}). */
  shipByEdit?: CompoundShipByEdit;
  /** Same, for the DATES cell's order-date line. */
  orderedAtEdit?: CompoundOrderedAtEdit;
  /**
   * To-ship identity tracking hover → paperwork walk. Omit on every other
   * family — Receiving must not grow a Label verb.
   */
  onOpenLabels?: () => void;
  /**
   * Present ⇒ STATUS opens the carrier trail overlay. Omit on families
   * without an order timeline (Receiving).
   */
  onStateOpen?: () => void;
  /**
   * Stage-lane assign, keyed by catalog field id (`orders.picked` /
   * `orders.packed`). Presence on a bound status track arms the empty/pending
   * mark as a staff combo; done stages stay read-only.
   */
  stageAssigns?: Readonly<Partial<Record<string, CompoundStageAssign>>>;
  /** Present ⇒ the actions track mounts the all-staff Pick/Pack role roster. */
  staffRoster?: CompoundStaffRoster;
}

/**
 * Is this a compound track — i.e. will {@link renderCompoundGridCell} paint it?
 *
 * **`select` is deliberately NOT in this list.** Every flat spreadsheet in the
 * repo also has a `select` column, and a family dispatcher that routed the key
 * unconditionally would hand the compound 48px gutter to Pickup, Catalog and
 * Repair — surfaces that never opted into this layout. The select track is
 * claimed by {@link isCompoundColumnModel} instead: the compound cell paints it
 * only when a compound MODEL is mounted.
 */
export function isCompoundCellKey(key: string): boolean {
  return (
    key === 'thumb' ||
    key === 'item' ||
    key === 'fulfillment' ||
    key === 'dates' ||
    key === 'state' ||
    // Materialized slot tracks (`status:1…N`) — the old hard-coded `tested`.
    key.startsWith('status:') ||
    key === 'actions'
  );
}

/**
 * The two GUTTER tracks: full-bleed, zero inset, equal width.
 *
 * They are the only cells in the grid with no horizontal padding — everything
 * they contain goes corner to corner.
 */
function isCompoundGutterKey(key: string): boolean {
  return key === 'select' || key === 'thumb';
}

/**
 * Paint one compound track, wrapper and all. Returns `null` for any other key,
 * so a family's dispatcher can fall through to its own flat cells.
 */
export function renderCompoundGridCell<C extends CompoundCellColumn>({
  col,
  columns,
  rule,
  view,
  onOpen,
  actions,
  select,
  subtitleSelects,
  subtitleEdits,
  subtitleNoteKey,
  noteText,
  onReorderSubtitle,
  shipByEdit,
  orderedAtEdit,
  stageAssigns,
  staffRoster,
  onOpenLabels,
  onStateOpen,
  formatClass,
}: CompoundGridCellParams<C>): ReactNode {
  // `select` is only ours when a COMPOUND model is mounted — see
  // `isCompoundCellKey`'s docblock for the surfaces that would otherwise be
  // hijacked.
  const gutterSelect = col.key === 'select' && isCompoundColumnModel(columns);
  if (!gutterSelect && !isCompoundCellKey(col.key)) return null;

  // ## The compound cell OWNS the row box
  //
  // `inset: 'grid'` (the flat spreadsheet's chrome) adds `py-1.5`. Stacked on
  // the cell's own 1px bottom rule that turned a 48px constant into a 61px
  // painted row on every compound table — the constant was sizing the cell's
  // CONTENT while the goal, the virtualizer estimate and the operator's eye all
  // mean the ROW. Three consumers, two different numbers, and no test could see
  // it because they all agreed about the 48.
  //
  // So: horizontal inset only, and an explicit border-box height. The row shell
  // is `items-stretch`, so one cell claiming the box sets the row and every
  // other track stretches to it. The two-row body inside fills what is left of
  // the height after the rule (`h-full`), which is why nothing here needs to
  // know that the rule costs a pixel.
  //
  // The two GUTTERS go further and take NO inset at all (`'none'`): the check
  // and the photo are asked to run edge to edge. `'none'` does not carry
  // `overflow-hidden` the way the other insets do, so it is re-added by hand —
  // without it a full-bleed image bleeds into the next track under h-scroll.
  const gutter = isCompoundGutterKey(col.key);
  const className = cn(
    gridDataCellClass(col, {
      rule,
      inset: gutter ? 'none' : 'cell',
      frozenClass: LEDGER_GRID_FROZEN_CELL,
      formatClass,
    }),
    'overflow-hidden',
    // A full-bleed child must stretch to the box, not centre inside it.
    gutter && 'items-stretch p-0',
  );

  // The trailing frozen track owns the scroll-edge shadow. Derived from the
  // mounted array for the same reason the offset is: a family constant names a
  // key the compound model does not carry.
  const frozenEdge =
    col.frozen && [...columns].reverse().find((c) => c.frozen)?.key === col.key
      ? true
      : undefined;

  const style = {
    // The ONE number. Border-box, so the cell's bottom rule is inside it and the
    // painted row measures exactly `COMPOUND_ROW_PX` — the same value
    // `compoundRowEstimateFor` hands the virtualizer.
    height: COMPOUND_ROW_PX,
    // Derived from the MOUNTED array. A key-only closure over a family's flat
    // constant is what broke this before — see the file docblock.
    ...(col.frozen ? { left: gridFrozenLeft(columns, col.key) } : null),
  };

  if (gutterSelect) {
    const detail = select?.detail;
    const selectFace = select ? (
      <CompoundSelect
        checked={select.checked}
        onToggle={select.onToggle}
        label={select.label}
        disabled={select.disabled}
        edgeMark={view.edgeMark}
        chrome="hover"
      />
    ) : null;

    return (
      <div
        data-col="select"
        // Kept from the Orders row this cell replaced — it is how a spec finds
        // the gutter, and it now means the same thing on every family.
        data-select-gutter
        data-frozen-edge={frozenEdge}
        className={className}
        style={style}
        // Stopped ONLY when this gutter owns a real control.
        //
        // Where it does, a click on the flush plane around the button must not
        // also reach the row and open the record. But on CLICK-SELECT surfaces
        // (Incoming, Unbox History) the row IS the checkbox and owns the toggle
        // — the gutter is a painted face there — so the click has to bubble to
        // it. Swallowing it unconditionally made the leftmost column inert on
        // exactly those surfaces: a prominent checkmark that did nothing.
        //
        // `ReceivingSelectCell`, the flat cell this replaced, carried the same
        // warning in prose: "the ROW click still ticks the box, so this stays a
        // painted indicator and must not swallow the click that does the
        // ticking."
        onClick={
          select?.onToggle || detail
            ? (event) => event.stopPropagation()
            : undefined
        }
      >
        {detail ? (
          <div
            className={cn(COMPOUND_TWO_LINE_CLASS, 'w-full min-h-0')}
            data-leaf-detail-stack=""
          >
            <div className="flex min-h-0 min-w-0 items-stretch">{selectFace}</div>
            <button
              type="button"
              className={cn(
                'ds-raw-button flex h-full w-full min-h-0 items-center justify-center text-text-soft',
                focusRing('control', 'neutral'),
              )}
              aria-expanded={detail.open}
              aria-label={
                detail.open
                  ? `Hide extra details for ${detail.label}`
                  : `Show more about ${detail.label}`
              }
              data-row-detail=""
              onClick={(event) => {
                event.stopPropagation();
                detail.onToggle();
              }}
            >
              <span className="flex h-4 w-4 items-center justify-center">
                {detail.open ? (
                  <ChevronDown className="h-3 w-3" aria-hidden />
                ) : (
                  <ChevronRight className="h-3 w-3" aria-hidden />
                )}
              </span>
            </button>
          </div>
        ) : (
          selectFace
        )}
      </div>
    );
  }

  // Slot tracks are keyed by SLOT INDEX (`status:1`), so they dispatch on the
  // prefix rather than the switch below; the cell body branches on the bound
  // field's displayType, never on a field id.
  if (col.key.startsWith('status:')) {
    return (
      <div data-col={col.key} data-frozen-edge={frozenEdge} className={className} style={style}>
        <CompoundSlotCell
          trackKey={col.key}
          label={col.label ?? ''}
          iconKey={col.slotIconKey}
          displayType={col.slotDisplayType}
          stageLabels={col.slotStageLabels}
          view={view}
          assign={col.fieldId ? stageAssigns?.[col.fieldId] : undefined}
        />
      </div>
    );
  }

  switch (col.key) {
    case 'thumb':
      return (
        <div data-col="thumb" data-frozen-edge={frozenEdge} className={className} style={style}>
          <CompoundThumb view={view} />
        </div>
      );
    case 'fulfillment':
      return (
        <div data-col="fulfillment" data-frozen-edge={frozenEdge} className={className} style={style}>
          <CompoundFulfillment view={view} onOpenLabels={onOpenLabels} />
        </div>
      );
    case 'item':
      return (
        <div data-col="item" data-frozen-edge={frozenEdge} className={className} style={style}>
          <CompoundItem
            view={view}
            subtitleSelects={subtitleSelects}
            subtitleEdits={subtitleEdits}
            subtitleNoteKey={subtitleNoteKey}
            noteText={noteText}
            onReorderSubtitle={onReorderSubtitle}
            extraTitleActions={[
              ...(onOpen ? [{ id: 'open', label: 'Open', onSelect: onOpen }] : []),
              ...(actions ?? [])
                .filter((action) => action.face !== 'trailing')
                .map((action) => ({
                  id: action.key,
                  label: action.label,
                  tone: action.tone,
                  disabled: action.disabled,
                  onSelect: action.onSelect,
                })),
            ]}
          />
        </div>
      );
    case 'dates':
      return (
        <div data-col="dates" data-frozen-edge={frozenEdge} className={className} style={style}>
          <CompoundDates view={view} shipByEdit={shipByEdit} orderedAtEdit={orderedAtEdit} />
        </div>
      );
    case 'state':
      return (
        <div
          data-col="state"
          data-frozen-edge={frozenEdge}
          className={className}
          style={style}
          onClick={onStateOpen ? (event) => event.stopPropagation() : undefined}
        >
          <CompoundState view={view} onOpen={onStateOpen} />
        </div>
      );
    case 'actions':
      return (
        <div data-col="actions" data-frozen-edge={frozenEdge} className={cn(className, 'justify-start')} style={style}>
          <CompoundActions
            onOpen={onOpen}
            actions={actions}
            label={view.title}
            staffRoster={staffRoster}
          />
        </div>
      );
    default:
      return null;
  }
}
