'use client';

/**
 * `SheetToolbar` — the ONE chrome row above every sheet.
 *
 * ```text
 * ┌──────────┬────┬───────────┬──────────┬───────┬──────────────┬─────────┬────────┐
 * │🔍 filter │Fltr│ ⧉  ⇅  🖨  │ − 100% + │ B I S │ A▾  ▨▾  ≡▾   │ …spacer │ ⛶  ▥   │
 * └─220px────┴────┴───────────┴──────────┴───────┴──────────────┴─────────┴────────┘
 *   find      refine  data        zoom      marks    format        station   view
 * ```
 *
 * It replaces Band 1 (tabs + Add) and Band 3 (find · Views · KPI · inspector)
 * with a single row, and the tabs move to {@link SheetBottomBar}. Plan:
 * `docs/todo/one-sheet-table-sot-PLAN.md` § 4.2.
 *
 * ## What changed from Band 3, and why
 *
 * Band 3's search owned the whole left at `min-w-0 flex-1`. Here it is **fixed
 * at 220px**. A queue filter is a short string — an order number, a SKU, a
 * staffer's name — and a field stretched across a 2560px monitor spends 2000px
 * saying nothing while the verbs an operator actually reaches for get squeezed
 * to the far edge. Fixed width puts find and the twelve verbs in the same
 * saccade.
 *
 * ## Honest absence, not disabled ghosts
 *
 * Which groups render is decided by the sheet's own {@link SheetToolbarCapabilities},
 * not by the page: a read-only surface has no Marks or Format group at all. The
 * one exception is the zoom stepper, whose buttons disable at the ends of the
 * scale — there the control exists and has simply run out of range, which is a
 * different fact from "this sheet cannot zoom".
 */

import { useCallback, type HTMLAttributes, type ReactNode, type Ref } from 'react';
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  Bold,
  Copy,
  Download,
  Italic,
  Maximize,
  Minimize,
  PaintBucket,
  Printer,
  Strikethrough,
  Type,
  Upload,
  ZoomIn,
  ZoomOut,
} from '@/components/Icons';
import { PRIMARY_CHROME_ROW_FACE } from '@/components/layout/header-shell';
import { SearchField } from '@/design-system/primitives';
import {
  GRID_ZOOM_DEFAULT,
  GRID_ZOOM_LEVELS,
} from '@/design-system/components/grid/grid-zoom';
import { useSheetChromeOptional } from '@/components/sheet/sheet-chrome-context';
import {
  SHEET_TOOLBAR_GLYPH_CLASS,
  SheetToolbarButton,
  SheetToolbarGroup,
} from '@/components/sheet/sheet-toolbar-face';
import { SheetSwatchMenu } from '@/components/sheet/SheetSwatchMenu';
import { SheetFilterMenu, type SheetFilterMenuProps } from '@/components/sheet/SheetFilterMenu';
import { SheetColumnPicker } from '@/components/sheet/SheetColumnPicker';
import type { SheetFormatColumn } from '@/components/sheet/useSheetFormat';
import { cn } from '@/utils/_cn';
import { WORKBENCH_BAND_INSET_X } from '@/components/dashboard/workbench-shell';

/** The width the find field is pinned to. See the docblock. */
export const SHEET_FIND_WIDTH_CLASS = 'w-[220px] shrink-0';

/** What this sheet can do. Absent capability ⇒ the whole group is absent. */
export interface SheetToolbarCapabilities {
  /** Copy / export / import / print. */
  data?: boolean;
  /** Bold · italic · strike · colour · align. Off for a read-only surface. */
  format?: boolean;
  /** Zoom stepper. */
  zoom?: boolean;
  /** Fullscreen. */
  fullscreen?: boolean;
}

const ALL_CAPABILITIES: Required<SheetToolbarCapabilities> = {
  data: true,
  format: true,
  zoom: true,
  fullscreen: true,
};

export interface SheetToolbarProps {
  /**
   * Scoped list filter — the fixed-width field, flush top-left.
   *
   * Optional so a surface can supply {@link searchSlot} instead; exactly one of
   * the two should be set.
   */
  search?: { value: string; onChange: (next: string) => void; placeholder?: string };
  /**
   * A pre-built find field, used INSTEAD of {@link search}.
   *
   * The escape exists for the ~30 surfaces migrating off `WorkbenchTriageBand`.
   * Their find fields are not plain value/onChange pairs — they carry in-field
   * refine popovers, paste affordances, staff pickers and station scan-bar
   * focus rules — and rebuilding all of that as toolbar props would have meant
   * either thirty bespoke props or a lowest-common-denominator field that lost
   * what each desk needs. The node comes through; the ROW's grammar (fixed
   * width, flush left, groups walled by hairlines) still belongs to the toolbar.
   *
   * New surfaces should pass {@link search} and get the house field.
   */
  searchSlot?: ReactNode;
  /**
   * The surface's filter menu rows, wrapped in {@link SheetFilterMenu}'s lit,
   * counted trigger. Omit for a surface with nothing to refine — the group is
   * then honestly absent rather than a dead funnel.
   */
  filters?: SheetFilterMenuProps;
  /** Copy the filtered rows × visible columns as TSV. */
  onCopyAll?: () => void;
  onExport?: () => void;
  onImport?: () => void;
  onPrint?: () => void;
  /** Format handlers. Absent ⇒ the group renders but its controls are inert. */
  format?: SheetFormatHandlers;
  /** Columns the Format group may target, plus which one it is targeting. */
  formatColumns?: {
    columns: readonly SheetFormatColumn[];
    activeColumnKey: string | null;
    onSelect: (key: string | null) => void;
  };
  capabilities?: SheetToolbarCapabilities;
  /** Station verbs (icon-only Check / Unbox), right of Format. */
  stationActions?: ReactNode;
  /** Views menu + inspector toggle, far right. */
  viewActions?: ReactNode;
  /**
   * Controls the surface owns that have no toolbar group yet (staff pickers,
   * lane filters, an icon-sort). Rendered in their own walled group between
   * Refine and the spacer, so a desk keeps its controls while it migrates.
   */
  extraControls?: ReactNode;
  /** Portal host for controls a table mounts into the row (▦ column display). */
  controlsSlotRef?: Ref<HTMLDivElement>;
  controlsSlotProps?: HTMLAttributes<HTMLDivElement> & Partial<Record<`data-${string}`, string>>;
  className?: string;
}

export interface SheetFormatHandlers {
  /** True when EVERY targeted column already has the mark (the toggle's state). */
  bold: boolean;
  italic: boolean;
  strike: boolean;
  onToggleBold: () => void;
  onToggleItalic: () => void;
  onToggleStrike: () => void;
  textColor: string | null;
  fillColor: string | null;
  onTextColor: (swatch: string | null) => void;
  onFillColor: (swatch: string | null) => void;
  align: 'left' | 'center' | 'right' | null;
  onAlign: (align: 'left' | 'center' | 'right' | null) => void;
  /** No column targeted — the group is present but has nothing to act on. */
  disabled: boolean;
}

const ALIGN_OPTIONS = [
  { id: 'left' as const, label: 'Align left', Icon: AlignLeft },
  { id: 'center' as const, label: 'Align centre', Icon: AlignCenter },
  { id: 'right' as const, label: 'Align right', Icon: AlignRight },
];

export function SheetToolbar({
  search,
  searchSlot,
  filters,
  onCopyAll,
  onExport,
  onImport,
  onPrint,
  format,
  formatColumns,
  capabilities,
  stationActions,
  viewActions,
  extraControls,
  controlsSlotRef,
  controlsSlotProps,
  className,
}: SheetToolbarProps) {
  const caps = { ...ALL_CAPABILITIES, ...capabilities };
  /*
    OPTIONAL, not required.

    `WorkbenchTriageBand` mounts this row on surfaces that have not moved onto
    `SheetView` yet, and several of them render it outside any sheet host at all
    (`ReceivingLinesTable`, the History header). Throwing there would turn a
    chrome consolidation into a crash on a desk that was working. Outside a
    provider the row still draws — it simply has no zoom and no fullscreen to
    offer, which those surfaces already declare via `capabilities`.
  */
  const chrome = useSheetChromeOptional();
  const zoom = chrome?.zoom ?? GRID_ZOOM_DEFAULT;
  const fullscreen = chrome?.fullscreen ?? false;
  const noop = () => {};
  const zoomIn = chrome?.zoomIn ?? noop;
  const zoomOut = chrome?.zoomOut ?? noop;
  const resetZoom = chrome?.resetZoom ?? noop;
  const toggleFullscreen = chrome?.toggleFullscreen ?? noop;

  const atMaxZoom = zoom === GRID_ZOOM_LEVELS[GRID_ZOOM_LEVELS.length - 1];
  const atMinZoom = zoom === GRID_ZOOM_LEVELS[0];
  const formatDisabled = format?.disabled ?? true;

  const nextAlign = useCallback(
    (id: 'left' | 'center' | 'right') => {
      // Clicking the active alignment clears the override and returns the column
      // to its type-derived default — the same "press again to unset" the marks
      // have, so the group behaves consistently.
      format?.onAlign(format.align === id ? null : id);
    },
    [format],
  );

  return (
    <div
      data-sheet-toolbar=""
      className={cn(
        'flex min-w-0 items-stretch gap-0 border-b border-r border-border-soft bg-surface-card shadow-sm',
        WORKBENCH_BAND_INSET_X,
        PRIMARY_CHROME_ROW_FACE,
        className,
      )}
    >
      {/* ── Find: fixed width, flush left ─────────────────────────────────── */}
      <SheetToolbarGroup first className={SHEET_FIND_WIDTH_CLASS}>
        {searchSlot ?? (
          search ? (
            <SearchField
              value={search.value}
              onChange={search.onChange}
              placeholder={search.placeholder ?? 'Filter…'}
              size="compact"
              hideUnderline
              className="w-full"
            />
          ) : null
        )}
      </SheetToolbarGroup>

      {/* ── Refine ────────────────────────────────────────────────────────── */}
      <SheetToolbarGroup>
        {filters ? <SheetFilterMenu {...filters} /> : null}
      </SheetToolbarGroup>

      {/* ── The surface's own controls, while it still has some ───────────── */}
      <SheetToolbarGroup>
        {extraControls}
        {controlsSlotRef !== undefined || controlsSlotProps ? (
          <div
            ref={controlsSlotRef}
            className="flex shrink-0 items-center gap-0 empty:hidden"
            {...controlsSlotProps}
          />
        ) : null}
      </SheetToolbarGroup>

      {/* ── Data verbs ────────────────────────────────────────────────────── */}
      {caps.data ? (
        <SheetToolbarGroup>
          {onCopyAll ? (
            <SheetToolbarButton
              icon={<Copy className={SHEET_TOOLBAR_GLYPH_CLASS} />}
              label="Copy all rows"
              onClick={onCopyAll}
              data-testid="sheet-copy-all"
            />
          ) : null}
          {onImport ? (
            <SheetToolbarButton
              icon={<Upload className={SHEET_TOOLBAR_GLYPH_CLASS} />}
              label="Import"
              onClick={onImport}
              data-testid="sheet-import"
            />
          ) : null}
          {onExport ? (
            <SheetToolbarButton
              icon={<Download className={SHEET_TOOLBAR_GLYPH_CLASS} />}
              label="Export CSV"
              onClick={onExport}
              data-testid="sheet-export"
            />
          ) : null}
          {onPrint ? (
            <SheetToolbarButton
              icon={<Printer className={SHEET_TOOLBAR_GLYPH_CLASS} />}
              label="Print"
              onClick={onPrint}
              data-testid="sheet-print"
            />
          ) : null}
        </SheetToolbarGroup>
      ) : null}

      {/* ── Zoom ──────────────────────────────────────────────────────────── */}
      {caps.zoom ? (
        <SheetToolbarGroup>
          <SheetToolbarButton
            icon={<ZoomOut className={SHEET_TOOLBAR_GLYPH_CLASS} />}
            label="Zoom out"
            onClick={zoomOut}
            disabled={atMinZoom}
            data-testid="sheet-zoom-out"
          />
          {/*
            The percentage is a BUTTON, not a label: it is the only affordance
            that returns an operator to 100% in one click, and a label there
            would waste the row's most obvious reset target.
          */}
          <SheetToolbarButton
            icon={null}
            label="Reset zoom to 100%"
            text={`${zoom}%`}
            onClick={resetZoom}
            className="tabular-nums"
            data-testid="sheet-zoom-level"
          />
          <SheetToolbarButton
            icon={<ZoomIn className={SHEET_TOOLBAR_GLYPH_CLASS} />}
            label="Zoom in"
            onClick={zoomIn}
            disabled={atMaxZoom}
            data-testid="sheet-zoom-in"
          />
        </SheetToolbarGroup>
      ) : null}

      {/* ── Marks ─────────────────────────────────────────────────────────── */}
      {caps.format ? (
        <SheetToolbarGroup>
          {/* The target leads the group: an operator reads left to right, and
              "which column" has to be answered before "bold" means anything. */}
          {formatColumns ? (
            <SheetColumnPicker
              columns={formatColumns.columns}
              activeColumnKey={formatColumns.activeColumnKey}
              onSelect={formatColumns.onSelect}
            />
          ) : null}
          <SheetToolbarButton
            icon={<Bold className={SHEET_TOOLBAR_GLYPH_CLASS} />}
            label="Bold"
            active={format?.bold ?? false}
            disabled={formatDisabled}
            onClick={format?.onToggleBold}
            data-testid="sheet-bold"
          />
          <SheetToolbarButton
            icon={<Italic className={SHEET_TOOLBAR_GLYPH_CLASS} />}
            label="Italic"
            active={format?.italic ?? false}
            disabled={formatDisabled}
            onClick={format?.onToggleItalic}
            data-testid="sheet-italic"
          />
          <SheetToolbarButton
            icon={<Strikethrough className={SHEET_TOOLBAR_GLYPH_CLASS} />}
            label="Strikethrough"
            active={format?.strike ?? false}
            disabled={formatDisabled}
            onClick={format?.onToggleStrike}
            data-testid="sheet-strike"
          />
        </SheetToolbarGroup>
      ) : null}

      {/* ── Colour + alignment ────────────────────────────────────────────── */}
      {caps.format ? (
        <SheetToolbarGroup>
          <SheetSwatchMenu
            kind="text"
            value={format?.textColor ?? null}
            onSelect={(swatch) => format?.onTextColor(swatch)}
            disabled={formatDisabled}
            trigger={{
              icon: <Type className={SHEET_TOOLBAR_GLYPH_CLASS} />,
              label: 'Text colour',
              testId: 'sheet-text-color',
            }}
          />
          <SheetSwatchMenu
            kind="fill"
            value={format?.fillColor ?? null}
            onSelect={(swatch) => format?.onFillColor(swatch)}
            disabled={formatDisabled}
            trigger={{
              icon: <PaintBucket className={SHEET_TOOLBAR_GLYPH_CLASS} />,
              label: 'Fill colour',
              testId: 'sheet-fill-color',
            }}
          />
          {ALIGN_OPTIONS.map(({ id, label, Icon }) => (
            <SheetToolbarButton
              key={id}
              icon={<Icon className={SHEET_TOOLBAR_GLYPH_CLASS} />}
              label={label}
              active={format?.align === id}
              disabled={formatDisabled}
              onClick={() => nextAlign(id)}
              data-testid={`sheet-align-${id}`}
            />
          ))}
        </SheetToolbarGroup>
      ) : null}

      {/* Yield surface: the groups above are shrink-0, so overflow pushes here. */}
      <div className="min-w-0 flex-1" aria-hidden />

      {/* ── Station verbs (icon-only Check / Unbox) ───────────────────────── */}
      <SheetToolbarGroup>{stationActions}</SheetToolbarGroup>

      {/* ── View ──────────────────────────────────────────────────────────── */}
      <SheetToolbarGroup>
        {viewActions}
        {caps.fullscreen ? (
          <SheetToolbarButton
            icon={
              fullscreen ? (
                <Minimize className={SHEET_TOOLBAR_GLYPH_CLASS} />
              ) : (
                <Maximize className={SHEET_TOOLBAR_GLYPH_CLASS} />
              )
            }
            label={fullscreen ? 'Exit fullscreen (Esc)' : 'Fullscreen'}
            active={fullscreen}
            onClick={toggleFullscreen}
            data-testid="sheet-fullscreen"
          />
        ) : null}
      </SheetToolbarGroup>
    </div>
  );
}
