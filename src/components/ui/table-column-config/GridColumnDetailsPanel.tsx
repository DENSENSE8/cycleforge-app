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
 * `PaneHeaderCloseButton` (`→|`) — same top-band grammar as Incoming bulk
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

import { useEffect, useState } from 'react';
import { RotateCcw } from '@/components/Icons';
import { DetailStackRailRegistrar } from '@/components/right-rail/DetailStackRailRegistrar';
import { ColorSwatchPicker } from '@/components/ui/ColorSwatchPicker';
import { PaneHeaderCloseButton } from '@/components/ui/pane-header';
import { useGridColumnDisplay } from '@/design-system/components/grid/useGridColumnDisplay';
import { useGridFields } from '@/design-system/components/grid/useGridColumnVisibility';
import type { LedgerGridColumnModel } from '@/design-system/components/grid/grid-surface-descriptor';
import {
  GRID_HIGHLIGHT_PRESETS,
  GRID_COLUMN_TEXT_EMPHASIS_OPTS,
  normalizeGridColumnHighlight,
  normalizeGridColumnTextEmphasis,
  type GridColumnCellMode,
  type GridColumnTextEmphasis,
} from '@/design-system/components/grid/grid-column-display';
import { Button } from '@/design-system/primitives/Button';
import { Switch } from '@/design-system/primitives/Switch';
import { ToolbarListboxOption } from '@/design-system/primitives/ToolbarListbox';
import type { TableId } from '@/lib/tables/table-columns';
import { useGridColumnWidths } from './useGridColumnWidths';
import { cn } from '@/utils/_cn';

const CELL_OPTS: { id: GridColumnCellMode; label: string }[] = [
  { id: 'default', label: 'Default' },
  { id: 'chip', label: 'Chip' },
];

/**
 * The band that carries the panel's own dismiss, at its top-LEFT.
 * Same optical gutter as Incoming bulk tracking / Unbox push close.
 */
const TOP_BAND_CLASS = 'flex h-9 shrink-0 items-center gap-1.5 border-b border-border-soft pl-1.5 pr-3';

export function GridColumnDetailsPanel<C extends LedgerGridColumnModel>({
  open,
  onClose,
  tableId,
  columns,
  /** Prefill selection (e.g. Fields → Add a column opens on first hidden). */
  initialHideKey = null,
}: {
  open: boolean;
  onClose: () => void;
  tableId: TableId;
  columns: readonly C[];
  initialHideKey?: string | null;
}) {
  const { fields, setFieldVisible, reset, dirtyCount } = useGridFields(tableId, columns);
  // A drag-resized width is part of this surface's display delta, so "Reset to
  // default" must clear it too — otherwise Reset leaves the grid visibly
  // non-default and the control quietly lies about what it did.
  const { widths, resetWidths } = useGridColumnWidths(tableId);
  const widthCount = Object.keys(widths).length;
  const resetAll = () => {
    reset();
    if (widthCount > 0) resetWidths();
  };
  const dirtyTotal = dirtyCount + widthCount;
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
  const pref = selectedKey ? displayByKey[selectedKey] : undefined;
  const highlight = normalizeGridColumnHighlight(pref?.highlight);
  const cellMode = pref?.cell ?? 'default';
  const textMode =
    normalizeGridColumnTextEmphasis(pref?.text) ?? ('default' as const);

  return (
    <DetailStackRailRegistrar
      id="detail:grid-column-details"
      onClose={onClose}
      modal={false}
      ariaLabel="Column display"
    >
      <div className="flex h-full min-h-0 flex-col bg-surface-card">
        {/* Non-modal push has no scrim — visible dismiss is mandatory, and it
            belongs at the column's top-left where every push surface puts it. */}
        <div className={TOP_BAND_CLASS}>
          <PaneHeaderCloseButton
            onClick={onClose}
            ariaLabel="Hide column display"
            title="Hide column display"
          />
          <div className="min-w-0">
            <p className="truncate text-role-eyebrow font-semibold uppercase tracking-widest text-text-default">
              Column display
            </p>
            <p className="truncate text-role-micro uppercase tracking-widest text-blue-600">
              Grid fields
            </p>
          </div>
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
