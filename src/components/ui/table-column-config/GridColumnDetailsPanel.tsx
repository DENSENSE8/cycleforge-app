'use client';

/**
 * Right-rail column display inspector — pick a product column, toggle
 * visibility, set highlight wash + cell chrome (default / chip), reset the
 * table's whole delta.
 *
 * **The SOLE operator entry is `GridColumnGutter`** — the trigger hover-revealed
 * over the grid card's own top-right corner, which also owns this panel's open
 * state and mounts it. Nothing else opens `detail:grid-column-details`.
 *
 * Two doors have been retired, for the same reason each time. The chrome
 * `GridFieldsMenu` went first (2026-08-02): Fields mutates the column set of the
 * card it sits on, so a page-chrome control acting on that card was an altitude
 * mismatch, and seven surfaces shipped both doors onto this one rail id. Then
 * the *header lip* went (same day) — resident in the header band, it either
 * reserved a permanent `w-9` track or covered the trailing column's label. The
 * ban on both lives in `workbench-trailing-cluster.guard.test.ts`.
 *
 * The open state and this mount used to be lifted to fourteen grid views, where
 * nothing outside each view's own subtree ever read them. They now live with the
 * trigger, so the door and the room behind it are one component.
 *
 * Prefs: `staff_preferences.tableColumns[tableId]` via {@link useGridFields} +
 * {@link useGridColumnDisplay}. Shell: non-modal **push** detail stack with
 * no close of its own (the host's `X` owns it) — same top-band grammar as Incoming bulk
 * tracking / app right-rail inspectors.
 *
 * ## Every import here is BY PATH, and both reasons are load-bearing
 *
 * 1. **Cycle.** `@/design-system/components/grid` re-exports `GridColumnGutter`,
 *    which mounts this panel, so a barrel import from that one would close a
 *    cycle.
 * 2. **Altitude.** This module now sits behind the grid barrel, which 64 grid
 *    modules import — including pure data ones (`fba-board-capabilities.ts`,
 *    `*-grid-descriptor.ts`). Reaching `@/design-system/primitives` for three
 *    components dragged all 52 of them plus `design-system/hooks` into every one
 *    of those graphs: measured, the barrel went 68 → 132 modules on one edge.
 *    Three concrete paths bring it back to ~10. Same rule as
 *    `build-gotchas.md` → *keep barrels honest*; it applies harder to a module
 *    that a barrel pulls than to one a page imports directly.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { RotateCcw } from '@/components/Icons';
import { DetailStackRailRegistrar } from '@/components/right-rail/DetailStackRailRegistrar';
import { ColorSwatchPicker } from '@/components/ui/ColorSwatchPicker';
import { useGridColumnDisplay } from '@/design-system/components/grid/useGridColumnDisplay';
import { useGridFields } from '@/design-system/components/grid/useGridColumnVisibility';
import { isGridColumnResizable } from '@/design-system/components/grid/grid-column-editability';
import { gridColVar } from '@/design-system/components/grid/grid-column-geometry';
import type { LedgerGridColumnModel } from '@/design-system/components/grid/grid-surface-descriptor';
import {
  GRID_HIGHLIGHT_PRESETS,
  GRID_COLUMN_TEXT_EMPHASIS_OPTS,
  normalizeGridColumnHighlight,
  normalizeGridColumnTextEmphasis,
  type GridColumnCellMode,
  type GridColumnTextEmphasis,
} from '@/design-system/components/grid/grid-column-display';
import {
  gridTrackRemToPx,
  resolveGridColumnMinTrackRem,
} from '@/design-system/components/grid/grid-column-type-track';
import { Button } from '@/design-system/primitives/Button';
import { Switch } from '@/design-system/primitives/Switch';
import { ToolbarListboxOption } from '@/design-system/primitives/ToolbarListbox';
import { focusRing } from '@/design-system/tokens/focus-ring';
import {
  customFieldEntityTypeForTableId,
  labelToCustomFieldKey,
} from '@/lib/custom-fields/table-entity';
import {
  CUSTOM_FIELD_VALUE_TYPES,
  type CustomFieldEntityType,
  type CustomFieldValueType,
} from '@/lib/custom-fields/types';
import type { TableId } from '@/lib/tables/table-columns';
import {
  COLUMN_WIDTH_MAX,
  COLUMN_WIDTH_MIN,
  clampColumnWidth,
  resolveColumnWidthClamp,
} from './useColumnWidths';
import { useGridColumnWidthBounds } from './useGridColumnWidthBounds';
import { useGridColumnWidths } from './useGridColumnWidths';
import { cn } from '@/utils/_cn';

/** Horizontal drag past this many px becomes a Figma-style scrub (not a click). */
const SCRUB_ACTIVATE_PX = 3;

const CELL_OPTS: { id: GridColumnCellMode; label: string }[] = [
  { id: 'default', label: 'Default' },
  { id: 'chip', label: 'Chip' },
];

/**
 * The chrome band. It mounts NO close — the dismiss is the host's singleton
 * `X` at the column's top-right (`closeRightPanel`). The band leads with the
 * eyebrow on the body's own content gutter and reserves the trailing cell that
 * `X` paints over, same shape as `DeskRailChromeRow`.
 */
const TOP_BAND_CLASS = 'flex h-9 shrink-0 items-center gap-1.5 border-b border-border-soft pl-4 pr-2';

export function GridColumnDetailsPanel<C extends LedgerGridColumnModel>({
  open,
  onClose,
  tableId,
  columns,
  /** Prefill selection (e.g. Fields → Add a column opens on first hidden). */
  initialHideKey = null,
  /**
   * Resolve this card's `[data-cf-grid]` so Width scrubbing can live-mutate
   * `--cf-col-*` the same way {@link ColumnResizeHandle} does. Absent → numeric
   * commits still persist; live preview is skipped.
   */
  getGridSurface = null,
}: {
  open: boolean;
  onClose: () => void;
  tableId: TableId;
  columns: readonly C[];
  initialHideKey?: string | null;
  getGridSurface?: (() => HTMLElement | null) | null;
}) {
  const { fields, setFieldVisible, reset, dirtyCount } = useGridFields(tableId, columns);
  // A drag-resized width / staff min-max clamp is part of this surface's display
  // delta, so "Reset to default" must clear them too — otherwise Reset leaves
  // the grid visibly non-default and the control quietly lies about what it did.
  const { widths, setWidth, clearWidth, resetWidths } = useGridColumnWidths(tableId);
  const { boundsByKey, setBound, clearBounds, resetBounds } =
    useGridColumnWidthBounds(tableId);
  const widthCount = Object.keys(widths).length;
  const boundsCount = Object.keys(boundsByKey).length;
  const resetAll = () => {
    reset();
    if (widthCount > 0) resetWidths();
    if (boundsCount > 0) resetBounds();
  };
  const dirtyTotal = dirtyCount + widthCount + boundsCount;
  const { displayByKey, setHighlight, setCellMode, setTextEmphasis } =
    useGridColumnDisplay(tableId);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);

  // Seed ONCE per open — deliberately NOT on every `fields` change.
  //
  // `fields` takes a new identity whenever a visibility toggle lands, so
  // depending on it here snapped the operator's pick back to the first column
  // on every switch flip: you clicked "Show Serial", the write succeeded, and
  // the panel silently jumped to the top of the list. That was survivable while
  // the chrome popover was the main toggle path; with the lip as the SOLE entry
  // it is the primary interaction, so it had to go.
  useEffect(() => {
    if (!open) return;
    setSelectedKey(
      initialHideKey && fields.some((f) => f.key === initialHideKey)
        ? initialHideKey
        : (fields[0]?.key ?? null),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps -- seed on OPEN only; `fields` is read, not tracked
  }, [open, initialHideKey]);

  // Separate concern: if the selected column leaves the model entirely (a
  // descriptor change, not a visibility toggle — a hidden column stays listed),
  // fall back rather than rendering an empty detail body.
  useEffect(() => {
    if (!open || !selectedKey) return;
    if (!fields.some((f) => f.key === selectedKey)) setSelectedKey(fields[0]?.key ?? null);
  }, [open, selectedKey, fields]);

  if (!open) return null;

  const selected = fields.find((f) => f.key === selectedKey) ?? null;
  const selectedColumn =
    selectedKey != null
      ? (columns.find((c) => (c.hideKey ?? c.key) === selectedKey) ?? null)
      : null;
  const widthKey = selectedColumn?.key ?? selectedKey;
  const resizable =
    selectedColumn != null ? isGridColumnResizable(selectedColumn) : false;
  const pref = selectedKey ? displayByKey[selectedKey] : undefined;
  const highlight = normalizeGridColumnHighlight(pref?.highlight);
  const cellMode = pref?.cell ?? 'default';
  const textMode =
    normalizeGridColumnTextEmphasis(pref?.text) ?? ('default' as const);
  const createEntityType = customFieldEntityTypeForTableId(tableId);

  return (
    <DetailStackRailRegistrar
      id="detail:grid-column-details"
      onClose={onClose}
      modal={false}
      ariaLabel="Column display"
    >
      <div className="flex h-full min-h-0 flex-col bg-surface-card">
        <div className={TOP_BAND_CLASS}>
          <div className="min-w-0 flex-1">
            <p className="truncate text-role-eyebrow font-semibold uppercase tracking-widest text-text-default">
              Column display
            </p>
            <p className="truncate text-role-micro uppercase tracking-widest text-blue-600">
              Grid fields
            </p>
          </div>
          <span
            className="inline-block h-7 w-7 shrink-0"
            aria-hidden
            data-right-rail-host-close-slot
          />
        </div>

        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-4 scrollbar-hide">
          {fields.length === 0 ? (
            <p className="text-role-caption text-text-muted">
              This grid has no configurable columns.
            </p>
          ) : (
            <>
              <section className="space-y-2">
                <h3 className="text-role-eyebrow font-semibold uppercase tracking-widest text-text-muted">
                  Column
                </h3>
                <ul
                  className="list-none space-y-0.5 rounded-lg border border-border-soft p-0.5"
                  role="listbox"
                  aria-label="Grid columns"
                >
                  {fields.map((field) => (
                    <li key={field.key} role="none">
                      <ToolbarListboxOption
                        selected={selectedKey === field.key}
                        dataAttrs={{ 'data-column-details-key': field.key }}
                        onClick={() => setSelectedKey(field.key)}
                        className={cn(selectedKey === field.key && 'bg-surface-sunken')}
                      >
                        {field.label}
                      </ToolbarListboxOption>
                    </li>
                  ))}
                </ul>
              </section>

              {selected ? (
                <>
                  <section className="flex items-center justify-between gap-3">
                    <div>
                      <h3 className="text-role-eyebrow font-semibold uppercase tracking-widest text-text-muted">
                        Visible
                      </h3>
                      <p className="text-role-caption text-text-soft">{selected.label}</p>
                    </div>
                    <Switch
                      checked={selected.visible}
                      onCheckedChange={(next) => setFieldVisible(selected.key, next)}
                      aria-label={`Show ${selected.label}`}
                    />
                  </section>

                  {resizable && widthKey && selectedColumn ? (
                    <ColumnWidthSection
                      column={selectedColumn}
                      widthKey={widthKey}
                      widthPx={widths[widthKey]}
                      bound={boundsByKey[widthKey]}
                      getGridSurface={getGridSurface}
                      onSetWidth={(px) => {
                        const minTrackRem = resolveGridColumnMinTrackRem(selectedColumn);
                        const typedFloorPx =
                          minTrackRem > 0 ? gridTrackRemToPx(minTrackRem) : undefined;
                        setWidth(widthKey, px, { typedFloorPx });
                      }}
                      onClearWidth={() => {
                        getGridSurface?.()?.style.removeProperty(gridColVar(widthKey));
                        clearWidth(widthKey);
                      }}
                      onSetBound={(patch) => {
                        const minTrackRem = resolveGridColumnMinTrackRem(selectedColumn);
                        const typedFloorPx =
                          minTrackRem > 0 ? gridTrackRemToPx(minTrackRem) : undefined;
                        const prev = boundsByKey[widthKey];
                        const nextMin =
                          'min' in patch ? (patch.min ?? undefined) : prev?.min;
                        const nextMax =
                          'max' in patch ? (patch.max ?? undefined) : prev?.max;
                        setBound(widthKey, patch);
                        // Keep current width inside the new clamp when present.
                        const cur = widths[widthKey];
                        if (cur != null) {
                          const { minPx, maxPx } = resolveColumnWidthClamp({
                            typedFloorPx,
                            staffMin: nextMin,
                            staffMax: nextMax,
                          });
                          const clamped = clampColumnWidth(cur, minPx, maxPx);
                          if (clamped !== cur) {
                            const surface = getGridSurface?.() ?? null;
                            surface?.style.setProperty(
                              gridColVar(widthKey),
                              `${clamped}px`,
                            );
                            setWidth(widthKey, clamped, { typedFloorPx });
                          }
                        }
                      }}
                      onClearBounds={() => clearBounds(widthKey)}
                    />
                  ) : null}

                  <section className="space-y-2">
                    <h3 className="text-role-eyebrow font-semibold uppercase tracking-widest text-text-muted">
                      Highlight
                    </h3>
                    <ColorSwatchPicker
                      value={highlight}
                      onChange={(hex) => setHighlight(selected.key, hex)}
                      presets={GRID_HIGHLIGHT_PRESETS}
                      allowNone
                      shape="square"
                      showHex={Boolean(highlight)}
                    />
                  </section>

                  <section className="space-y-2">
                    <h3 className="text-role-eyebrow font-semibold uppercase tracking-widest text-text-muted">
                      Display
                    </h3>
                    <div
                      className="flex gap-1 rounded-lg border border-border-soft p-0.5"
                      role="radiogroup"
                      aria-label="Cell display"
                    >
                      {CELL_OPTS.map((opt) => {
                        const active = cellMode === opt.id;
                        return (
                          <button
                            key={opt.id}
                            type="button"
                            role="radio"
                            aria-checked={active}
                            data-cell-mode={opt.id}
                            onClick={() => setCellMode(selected.key, opt.id)}
                            className={cn(
                              'ds-raw-button flex-1 rounded-md px-2 py-1.5 text-role-caption font-semibold transition-colors',
                              active
                                ? 'bg-surface-sunken text-text-default'
                                : 'text-text-muted hover:text-text-default',
                            )}
                          >
                            {opt.label}
                          </button>
                        );
                      })}
                    </div>
                  </section>

                  <section className="space-y-2">
                    <h3 className="text-role-eyebrow font-semibold uppercase tracking-widest text-text-muted">
                      Text style
                    </h3>
                    <div
                      className="flex flex-wrap gap-1 rounded-lg border border-border-soft p-0.5"
                      role="radiogroup"
                      aria-label="Text style"
                    >
                      {GRID_COLUMN_TEXT_EMPHASIS_OPTS.map((opt) => {
                        const active = textMode === opt.id;
                        return (
                          <button
                            key={opt.id}
                            type="button"
                            role="radio"
                            aria-checked={active}
                            data-text-emphasis={opt.id}
                            onClick={() =>
                              setTextEmphasis(
                                selected.key,
                                opt.id as GridColumnTextEmphasis | 'default',
                              )
                            }
                            className={cn(
                              'ds-raw-button rounded-md px-2 py-1.5 text-role-caption font-semibold transition-colors',
                              active
                                ? 'bg-surface-sunken text-text-default'
                                : 'text-text-muted hover:text-text-default',
                            )}
                          >
                            {opt.label}
                          </button>
                        );
                      })}
                    </div>
                  </section>
                </>
              ) : null}
            </>
          )}

          {createEntityType ? (
            <CreateCustomFieldSection entityType={createEntityType} />
          ) : null}
        </div>

        <div className="border-t border-border-soft bg-surface-card p-4">
          {/* Reset acts on the whole table's delta, not the selected column, so
              it sits beside Done rather than under the per-column controls.
              Absent while pristine — a reset that resets nothing teaches nothing. */}
          <div className="flex items-center gap-2">
            {dirtyTotal > 0 ? (
              <Button
                variant="secondary"
                icon={<RotateCcw className="h-3.5 w-3.5 shrink-0" />}
                onClick={resetAll}
                aria-label={`Reset to default — ${dirtyTotal} changed from default`}
              >
                Reset
              </Button>
            ) : null}
            <Button variant="primary" className="flex-1" onClick={onClose}>
              Done
            </Button>
          </div>
        </div>
      </div>
    </DetailStackRailRegistrar>
  );
}

const CREATE_FIELD_INPUT_CLASS = cn(
  'w-full rounded-none border border-border-soft bg-surface-card px-2 py-1.5',
  'text-role-caption text-text-default placeholder:text-text-faint',
  focusRing('field'),
);

function CreateCustomFieldSection({
  entityType,
}: {
  entityType: CustomFieldEntityType;
}) {
  const queryClient = useQueryClient();
  const [label, setLabel] = useState('');
  const [type, setType] = useState<CustomFieldValueType>('text');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const key = labelToCustomFieldKey(label);

  const onCreate = async () => {
    const trimmed = label.trim();
    if (!trimmed || saving) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch('/api/custom-fields/defs', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          entityType,
          key,
          label: trimmed,
          type,
        }),
      });
      const json = (await res.json().catch(() => null)) as {
        success?: boolean;
        error?: string;
      } | null;
      if (!res.ok || !json?.success) {
        throw new Error(json?.error || 'Failed to create field');
      }
      await queryClient.invalidateQueries({
        queryKey: ['custom-field-defs', entityType],
      });
      setLabel('');
      setType('text');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to create field');
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="space-y-2 border-t border-border-soft pt-5">
      <div>
        <h3 className="text-role-eyebrow font-semibold uppercase tracking-widest text-text-muted">
          Create field
        </h3>
        <p className="text-role-caption text-text-soft">
          New org column on this grid. Header “Add column…” only unhides existing tracks.
        </p>
      </div>
      <label className="block space-y-1">
        <span className="text-role-micro uppercase tracking-widest text-text-muted">
          Label
        </span>
        <input
          type="text"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="e.g. Vendor lot"
          maxLength={80}
          className={CREATE_FIELD_INPUT_CLASS}
        />
      </label>
      <label className="block space-y-1">
        <span className="text-role-micro uppercase tracking-widest text-text-muted">
          Key
        </span>
        <input
          type="text"
          value={key}
          readOnly
          aria-readonly
          className={cn(CREATE_FIELD_INPUT_CLASS, 'text-text-muted')}
        />
      </label>
      <label className="block space-y-1">
        <span className="text-role-micro uppercase tracking-widest text-text-muted">
          Type
        </span>
        <select
          value={type}
          onChange={(e) => setType(e.target.value as CustomFieldValueType)}
          className={CREATE_FIELD_INPUT_CLASS}
        >
          {CUSTOM_FIELD_VALUE_TYPES.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
      </label>
      {error ? (
        <p className="text-role-caption text-text-danger" role="alert">
          {error}
        </p>
      ) : null}
      <Button
        variant="secondary"
        className="w-full"
        disabled={!label.trim() || saving}
        onClick={() => void onCreate()}
      >
        {saving ? 'Creating…' : 'Create field'}
      </Button>
    </section>
  );
}

function measureRenderedColWidth(
  surface: HTMLElement | null,
  colKey: string,
): number | null {
  if (!surface) return null;
  const cell = surface.querySelector<HTMLElement>(
    `[data-col="${CSS.escape(colKey)}"]`,
  );
  if (!cell) return null;
  const w = cell.getBoundingClientRect().width;
  return Number.isFinite(w) && w > 0 ? w : null;
}

function ColumnWidthSection<C extends LedgerGridColumnModel>({
  column,
  widthKey,
  widthPx,
  bound,
  getGridSurface,
  onSetWidth,
  onClearWidth,
  onSetBound,
  onClearBounds,
}: {
  column: C;
  widthKey: string;
  widthPx?: number;
  bound?: { min?: number; max?: number };
  getGridSurface?: (() => HTMLElement | null) | null;
  onSetWidth: (px: number) => void;
  onClearWidth: () => void;
  onSetBound: (patch: { min?: number | null; max?: number | null }) => void;
  onClearBounds: () => void;
}) {
  const minTrackRem = resolveGridColumnMinTrackRem(column);
  const typedFloorPx = minTrackRem > 0 ? gridTrackRemToPx(minTrackRem) : undefined;
  const { minPx: effectiveMin, maxPx: effectiveMax } = resolveColumnWidthClamp({
    typedFloorPx,
    staffMin: bound?.min,
    staffMax: bound?.max,
  });
  const hasBound = bound?.min != null || bound?.max != null;
  const hasWidth = widthPx != null;

  /** Live-paint the grid track (no React render) — same path as header drag. */
  const paintLiveWidth = useCallback(
    (px: number) => {
      const surface = getGridSurface?.() ?? null;
      surface?.style.setProperty(gridColVar(widthKey), `${px}px`);
    },
    [getGridSurface, widthKey],
  );

  const resolveStartWidth = useCallback(() => {
    if (widthPx != null) return widthPx;
    const measured = measureRenderedColWidth(getGridSurface?.() ?? null, widthKey);
    if (measured != null) return Math.round(measured);
    return effectiveMin;
  }, [widthPx, getGridSurface, widthKey, effectiveMin]);

  return (
    <section className="space-y-2" data-column-width-section={widthKey}>
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-role-eyebrow font-semibold uppercase tracking-widest text-text-muted">
          Width
        </h3>
        {hasWidth || hasBound ? (
          <button
            type="button"
            className={cn(
              'ds-raw-button text-role-micro font-semibold uppercase tracking-widest text-text-muted hover:text-text-default',
              focusRing('control', 'accent'),
            )}
            onClick={() => {
              if (hasWidth) onClearWidth();
              if (hasBound) onClearBounds();
            }}
          >
            Use default
          </button>
        ) : null}
      </div>
      <div className="grid grid-cols-3 gap-2">
        <ColumnWidthPxField
          label="Width"
          value={widthPx}
          placeholder="Default"
          min={effectiveMin}
          max={effectiveMax}
          resolveStartValue={resolveStartWidth}
          onLiveChange={paintLiveWidth}
          onCommit={onSetWidth}
          onClear={hasWidth ? onClearWidth : undefined}
          ariaLabel={`${column.label ?? widthKey} width`}
          scrubHint
        />
        <ColumnWidthPxField
          label="Min"
          value={bound?.min}
          placeholder={String(typedFloorPx ?? COLUMN_WIDTH_MIN)}
          min={COLUMN_WIDTH_MIN}
          max={effectiveMax}
          resolveStartValue={() => bound?.min ?? typedFloorPx ?? COLUMN_WIDTH_MIN}
          onCommit={(px) => onSetBound({ min: px })}
          onClear={bound?.min != null ? () => onSetBound({ min: null }) : undefined}
          ariaLabel={`${column.label ?? widthKey} min width`}
          scrubHint
        />
        <ColumnWidthPxField
          label="Max"
          value={bound?.max}
          placeholder={String(COLUMN_WIDTH_MAX)}
          min={effectiveMin}
          max={2000}
          resolveStartValue={() => bound?.max ?? COLUMN_WIDTH_MAX}
          onCommit={(px) => onSetBound({ max: px })}
          onClear={bound?.max != null ? () => onSetBound({ max: null }) : undefined}
          ariaLabel={`${column.label ?? widthKey} max width`}
          scrubHint
        />
      </div>
      <p className="text-role-micro text-text-soft">
        px · drag label or value to resize · same clamps as the header grip
      </p>
    </section>
  );
}

function ColumnWidthPxField({
  label,
  value,
  placeholder,
  min,
  max,
  resolveStartValue,
  onLiveChange,
  onCommit,
  onClear,
  ariaLabel,
  scrubHint = false,
}: {
  label: string;
  value?: number;
  placeholder: string;
  min: number;
  max: number;
  /** Baseline when the field is empty (SoT / house default / measured track). */
  resolveStartValue: () => number;
  /** Optional live paint while scrubbing / typing (Width → grid CSS var). */
  onLiveChange?: (px: number) => void;
  onCommit: (px: number) => void;
  onClear?: () => void;
  ariaLabel: string;
  /** Show ew-resize cursor — Figma scrub affordance. */
  scrubHint?: boolean;
}) {
  const [draft, setDraft] = useState(value != null ? String(value) : '');
  const inputRef = useRef<HTMLInputElement>(null);
  const scrubbingRef = useRef(false);

  useEffect(() => {
    if (scrubbingRef.current) return;
    setDraft(value != null ? String(value) : '');
  }, [value]);

  const applyClamped = useCallback(
    (raw: number, { live, commit }: { live?: boolean; commit?: boolean }) => {
      const next = clampColumnWidth(raw, min, max);
      setDraft(String(next));
      if (live) onLiveChange?.(next);
      if (commit) onCommit(next);
      return next;
    },
    [min, max, onLiveChange, onCommit],
  );

  const commitDraft = () => {
    const trimmed = draft.trim();
    if (trimmed === '') {
      onClear?.();
      return;
    }
    const n = Number(trimmed);
    if (!Number.isFinite(n)) {
      setDraft(value != null ? String(value) : '');
      return;
    }
    applyClamped(n, { live: true, commit: true });
  };

  const onScrubPointerDown = (e: React.PointerEvent<HTMLElement>) => {
    // Only primary button; leave text-caret click-to-edit for a still click.
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();

    const startX = e.clientX;
    const startValue = resolveStartValue();
    let activated = false;
    let last = startValue;
    const prevCursor = document.body.style.cursor;
    const prevSelect = document.body.style.userSelect;
    const target = e.currentTarget;
    target.setPointerCapture(e.pointerId);

    const move = (ev: PointerEvent) => {
      const dx = ev.clientX - startX;
      if (!activated) {
        if (Math.abs(dx) < SCRUB_ACTIVATE_PX) return;
        activated = true;
        scrubbingRef.current = true;
        document.body.style.cursor = 'ew-resize';
        document.body.style.userSelect = 'none';
        // Blur so the input does not fight selection while scrubbing.
        inputRef.current?.blur();
      }
      // 1px mouse → 1px column (Figma pixel scrub). Shift = fine (0.25×).
      const scale = ev.shiftKey ? 0.25 : 1;
      last = applyClamped(startValue + dx * scale, { live: true });
    };

    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      document.body.style.cursor = prevCursor;
      document.body.style.userSelect = prevSelect;
      if (activated) {
        scrubbingRef.current = false;
        onCommit(last);
      } else {
        // Still click on the label → focus the input for typing.
        inputRef.current?.focus();
        inputRef.current?.select();
      }
    };

    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  return (
    <div className="flex min-w-0 flex-col gap-1">
      <span
        className={cn(
          'select-none text-role-micro font-semibold uppercase tracking-widest text-text-soft',
          scrubHint && 'cursor-ew-resize',
        )}
        onPointerDown={onScrubPointerDown}
      >
        {label}
      </span>
      <input
        ref={inputRef}
        type="number"
        inputMode="numeric"
        min={min}
        max={max}
        step={1}
        value={draft}
        placeholder={placeholder}
        aria-label={ariaLabel}
        data-column-width-field={label.toLowerCase()}
        onChange={(e) => {
          const next = e.target.value;
          setDraft(next);
          const n = Number(next);
          if (next.trim() !== '' && Number.isFinite(n)) {
            const clamped = clampColumnWidth(n, min, max);
            onLiveChange?.(clamped);
          }
        }}
        onBlur={commitDraft}
        onPointerDown={(e) => {
          // Drag on the value scrubbing; a still click keeps caret/edit.
          if (e.button !== 0) return;
          // Don't preventDefault yet — activation threshold decides scrub vs edit.
          const startX = e.clientX;
          const startValue = resolveStartValue();
          let activated = false;
          let last = startValue;
          const prevCursor = document.body.style.cursor;
          const prevSelect = document.body.style.userSelect;
          const el = e.currentTarget;

          const move = (ev: PointerEvent) => {
            const dx = ev.clientX - startX;
            if (!activated) {
              if (Math.abs(dx) < SCRUB_ACTIVATE_PX) return;
              activated = true;
              scrubbingRef.current = true;
              el.setPointerCapture(ev.pointerId);
              document.body.style.cursor = 'ew-resize';
              document.body.style.userSelect = 'none';
              el.blur();
            }
            const scale = ev.shiftKey ? 0.25 : 1;
            last = applyClamped(startValue + dx * scale, { live: true });
          };
          const up = () => {
            window.removeEventListener('pointermove', move);
            window.removeEventListener('pointerup', up);
            document.body.style.cursor = prevCursor;
            document.body.style.userSelect = prevSelect;
            if (activated) {
              scrubbingRef.current = false;
              onCommit(last);
            }
          };
          window.addEventListener('pointermove', move);
          window.addEventListener('pointerup', up);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            (e.target as HTMLInputElement).blur();
          } else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
            e.preventDefault();
            const base = Number(draft);
            const start = Number.isFinite(base) ? base : resolveStartValue();
            const delta = e.key === 'ArrowUp' ? 1 : -1;
            const step = e.shiftKey ? 10 : 1;
            applyClamped(start + delta * step, { live: true, commit: true });
          }
        }}
        className={cn(
          'w-full rounded-md border border-border-soft bg-surface-card px-2 py-1.5 text-role-caption text-text-default tabular-nums',
          'placeholder:text-text-faint',
          scrubHint && 'cursor-ew-resize',
          focusRing('control', 'accent'),
        )}
      />
    </div>
  );
}
