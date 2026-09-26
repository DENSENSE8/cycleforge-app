'use client';

/** The compound ROW — the one row component, for every table. */

import type { HTMLAttributes, ReactNode, Ref } from 'react';
import {
  gridDataCellClass,
  LedgerGridLeafRow,
  type GridSurfaceCapabilities,
  type LedgerGridColumnModel,
} from '@/design-system/components/grid';
import { gridTemplate } from '@/design-system/components/grid/grid-column-geometry';
import { Button } from '@/design-system/primitives/Button';
import { cn } from '@/utils/_cn';
import { renderCompoundGridCell } from './CompoundGridCell';
import { COMPOUND_ROW_PX } from './compound-row-chrome';
import type { FieldDisplayType } from '@/lib/tables/field-catalog/types';
import type {
  CompoundOrderedAtEdit,
  CompoundRowAction,
  CompoundRowView,
  CompoundShipByEdit,
  CompoundStageAssign,
  CompoundSubtitleEdit,
  CompoundSubtitleSelect,
} from './compound-row-model';
import { CompoundRowDetailHost } from './CompoundRowDetailHost';
import { useCompoundRowDetail } from './useCompoundRowDetail';

/** Structural — every family's column interface satisfies it. */
interface CompoundRowColumn extends LedgerGridColumnModel {
  fieldId?: string;
  slotIconKey?: string;
  slotDisplayType?: FieldDisplayType;
  slotStageLabels?: Readonly<{ done: string; pending: string }>;
}

export interface CompoundRowProps<C extends CompoundRowColumn>
  extends Omit<HTMLAttributes<HTMLDivElement>, 'children'> {
  /** The MOUNTED model. Template, sticky offsets and cell insets all derive. */
  columns: readonly C[];
  /** This row's facts — the family's pure `row -> view` adapter output. */
  view: CompoundRowView;
  selected: boolean;
  capabilities: Pick<GridSurfaceCapabilities, 'rowTriageFlags'>;
  /** Present ⇒ the leading gutter paints a checkmark. See `CompoundSelect`. */
  select?: {
    checked: boolean | 'mixed';
    /** Receives the click's modifier state so shift-click can extend a range. */
    onToggle?: (event: { shiftKey: boolean }) => void;
    label: string;
    disabled?: boolean;
  };
  /** Present ⇒ the title hover carries an "Open" item. */
  onOpen?: () => void;
  /** Present ⇒ STATUS opens the carrier trail. */
  onStateOpen?: () => void;
  /** Extra verbs for this row. Menu face → title hover; trailing → `_fill`. */
  actions?: readonly CompoundRowAction[];
  /**
   * Stage-lane assign, keyed by catalog field id. Presence on a bound
   * `stage_event` track arms the empty/pending mark as a staff combo.
   */
  stageAssigns?: Readonly<Partial<Record<string, CompoundStageAssign>>>;
  /** Present ⇒ the actions column mounts the all-staff Picker / Packer roster. */
  staffRoster?: boolean;

  /* ── The IN-CELL EDIT capabilities ────────────────────────────────────────── */

  /** In-place SELECT editors for bound subtitle parts, matched by part key. */
  subtitleSelects?: readonly CompoundSubtitleSelect[];
  /** Free-text / numeric in-place editors, matched to parts by key. */
  subtitleEdits?: readonly CompoundSubtitleEdit[];
  /** Part key of the NOTE fact — pinned right as a glyph. */
  subtitleNoteKey?: string;
  /** The note's full text (the glyph's hover / editor seed). */
  noteText?: string | null;
  /** Present ⇒ the inline under-title facts drag to reorder (field onto field). */
  onReorderSubtitle?: (dragKey: string, dropKey: string) => void;
  /** Present ⇒ the DATES cell's deadline line COMMITS; absent leaves it disabled. */
  shipByEdit?: CompoundShipByEdit;
  /** Same, for the DATES cell's order-date line. */
  orderedAtEdit?: CompoundOrderedAtEdit;
  /** Present ⇒ the tracking line opens the paperwork walk. */
  onOpenLabels?: () => void;
  /** Optional triage wash for the whole row — the family's own SoT class, gated by `capabilities.rowTriageFlags` inside `ledgerRowFillClass`. */
  flagClass?: string | null;
  /**
   * When false, skip the shared scroll-min shell width var. Forwarded rather
   * than re-derived: a family that wants the airtable skin's shared width must
   * not have to rebuild the shell to ask for it.
   */
  scrollMinContent?: boolean;
  /** Override mobile stacking (almost always false under LedgerGrid). */
  isMobile?: boolean;
  /**
   * The row element — what a row-anchored plane positions against.
   *
   * Supplied by {@link CompoundPlaneRow}, the only engine caller that mounts a
   * plane. A family never passes this: it does not own the plane either.
   */
  ref?: Ref<HTMLDivElement>;
  /** The registered row-anchored plane, already bound to its row. */
  plane?: ReactNode;
}

export function CompoundRow<C extends CompoundRowColumn>({
  columns,
  view,
  selected,
  capabilities,
  select,
  onOpen,
  onStateOpen,
  actions,
  stageAssigns,
  staffRoster,
  subtitleSelects,
  subtitleEdits,
  subtitleNoteKey,
  noteText,
  onReorderSubtitle,
  shipByEdit,
  orderedAtEdit,
  onOpenLabels,
  flagClass,
  scrollMinContent,
  isMobile = false,
  ref,
  plane,
  className,
  ...rowProps
}: CompoundRowProps<C>) {
  // The org-shared column formatting for this sheet. Read HERE — one component
  // that every compound family already mounts — rather than threaded as a prop

  const detailState = useCompoundRowDetail(view.id);
  const detailLabel = view.title.trim() || 'this line';
  const selectWithDetail =
    select && view.detail
      ? {
          ...select,
          detail: {
            open: detailState.open,
            onToggle: detailState.toggle,
            label: detailLabel,
          },
        }
      : select;

  const renderCell = (col: C, last: boolean): ReactNode => {
    const rule = !last;
    const cell = renderCompoundGridCell({
      col,
      columns,
      rule,
      view,
      select: selectWithDetail,
      onOpen,
      onStateOpen,
      actions,
      stageAssigns,
      staffRoster,
      subtitleSelects,
      subtitleEdits,
      subtitleNoteKey,
      noteText,
      onReorderSubtitle,
      shipByEdit,
      orderedAtEdit,
      onOpenLabels,
    });
    if (cell) return cell;

    // Trailing credential verbs (Revoke) paint in `_fill` slack — never a
    // remounted compound `actions` track (cohort law: no standing ⋮ column).
    if (col.key === '_fill') {
      const trailing = (actions ?? []).filter((a) => a.face === 'trailing');
      if (trailing.length > 0) {
        return (
          <div
            data-col="_fill"
            data-trailing-verbs
            className={cn(
              gridDataCellClass(col, { rule: false, inset: 'grid' }),
              'justify-end gap-1',
            )}
            style={{ height: COMPOUND_ROW_PX }}
            onClick={(event) => event.stopPropagation()}
          >
            {trailing.map((action) => (
              <Button
                key={action.key}
                type="button"
                size="sm"
                variant={action.tone === 'danger' ? 'dangerSoft' : 'secondary'}
                disabled={action.disabled}
                tabIndex={-1}
                onClick={() => action.onSelect()}
              >
                {action.label}
              </Button>
            ))}
          </div>
        );
      }
    }

    // `_fill` and anything the compound renderer does not own: an empty cell
    // that still carries the track's chrome, so the row's rules stay unbroken.
    return (
      <div
        data-col={col.key}
        role="presentation"
        aria-hidden
        className={gridDataCellClass(col, { rule: col.key !== '_fill' && rule, inset: 'grid' })}
      />
    );
  };

  const leaf = (
    <LedgerGridLeafRow
      {...rowProps}
      className={className}
      columns={columns}
      template={gridTemplate(columns)}
      selected={selected}
      capabilities={capabilities}
      flagClass={flagClass}
      scrollMinContent={scrollMinContent}
      isMobile={isMobile}
      ref={ref}
      renderCell={(col, { last }) => renderCell(col, last)}
    >
      {plane}
    </LedgerGridLeafRow>
  );

  if (!view.detail) return leaf;

  return (
    <CompoundRowDetailHost
      rowId={view.id}
      detail={view.detail}
      title={view.title}
      columns={columns}
      detailOpen={detailState.open}
      onCloseDetail={detailState.close}
    >
      {leaf}
    </CompoundRowDetailHost>
  );
}
