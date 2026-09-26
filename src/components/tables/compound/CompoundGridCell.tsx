'use client';

/** The compound cell, WRAPPER INCLUDED — the one implementation every family mounts. */

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
import { CompoundEdgeRail } from './CompoundEdgeRail';
import { compoundSelectStatusMarks } from './compound-select-status';
import { isCompoundColumnModel } from './compound-columns';
import {
  COMPOUND_GUTTER_CHEVRON_BAND_CLASS,
  COMPOUND_GUTTER_CHEVRON_GLYPH_CLASS,
  COMPOUND_GUTTER_RAIL_INSET_CLASS,
  COMPOUND_ROW_PX,
  SLOT_TABLE_GROUP_CHILD_RAIL_CLASS,
} from './compound-row-chrome';
import type {
  CompoundRowAction,
  CompoundRowView,
  CompoundSubtitleSelect,
  CompoundSubtitleEdit,
  CompoundOrderedAtEdit,
  CompoundShipByEdit,
  CompoundStageAssign,
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
  /** The SELECTION capability for this row. */
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
  /** Present ⇒ the actions track mounts the all-staff Picker / Packer roster. */
  staffRoster?: boolean;
}

/** Is this a compound track — i.e. */
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
        statuses={compoundSelectStatusMarks(view)}
        chrome="hover"
      />
    ) : null;

    return (
      <div
        data-col="select"
        // Kept from the Orders row this cell replaced — it is how a spec finds
        // the gutter, and it now means the same thing on every family.
        data-select-gutter
        // The leading edge rail hangs off THIS box, so `relative` is load-
        // bearing geometry, not chrome — see the rail below.
        data-edge-mark-host=""
        data-frozen-edge={frozenEdge}
        className={cn(className, 'relative')}
        style={style}
        // Stopped ONLY when this gutter owns a real control.
        onClick={
          select?.onToggle || detail
            ? (event) => event.stopPropagation()
            : undefined
        }
      >
        {/*
 * FULL-HEIGHT rail, owned by the CELL (operator 2026-09-15:
 * FULL-HEIGHT rail, owned by the CELL (operator 2026-09-15: "it should
 */}
        {view.edgeMark ?? view.importMark ? (
          <CompoundEdgeRail mark={view.edgeMark ?? view.importMark!} />
        ) : null}
        {/*
 * The MARK plane is the whole cell — `CompoundSelect` pins the checklist
 * square / resting status glyph to the TOP (operator 2026-09-04 "most
 */}
        {selectFace}
        {detail ? (
          <button
            type="button"
            className={cn(
              'ds-raw-button group/row-detail flex items-center justify-center text-text-soft',
              // Its own band — the bottom half of the gutter, BELOW the pinned
              // mark, so the drop-down reads as the second glyph in the column.
              COMPOUND_GUTTER_CHEVRON_BAND_CLASS,
              // Same rail reservation as the mark above it, so the two glyphs
              // sit on one vertical centre line down the gutter.
              COMPOUND_GUTTER_RAIL_INSET_CLASS,
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
            {/* The chevron is a REACH affordance, not a standing mark (operator 2026-09-15). */}
            <span
              className={cn(
                COMPOUND_GUTTER_CHEVRON_GLYPH_CLASS,
                'transition-opacity',
                !detail.open &&
                  'opacity-0 group-hover/row:opacity-100 group-focus-visible/row-detail:opacity-100 [@media(hover:none)]:opacity-100',
              )}
            >
              {detail.open ? (
                <ChevronDown className="h-3 w-3" aria-hidden />
              ) : (
                <ChevronRight className="h-3 w-3" aria-hidden />
              )}
            </span>
          </button>
        ) : null}
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
        <div
          data-col="fulfillment"
          data-frozen-edge={frozenEdge}
          // `relative` only for the child rail's sake — see below.
          className={cn(className, view.quietIdentity && 'relative')}
          style={style}
        >
          {/*
 * MEMBERSHIP mark:
 * track's leading edge (operator 2026-09-15, replacing the black rule
 */}
          {view.quietIdentity ? (
            <span aria-hidden data-group-child-rail="" className={SLOT_TABLE_GROUP_CHILD_RAIL_CLASS} />
          ) : null}
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
