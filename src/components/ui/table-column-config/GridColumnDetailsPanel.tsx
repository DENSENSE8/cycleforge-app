'use client';

/**
 * Right-rail column display inspector — pick a product column, toggle
 * visibility, set highlight wash + cell chrome (default / chip), reset the
 * table's whole delta.
 *
 * **The SOLE operator entry is the LedgerGrid top-right header lip**
 * (`LedgerGridColumnHeader` `onOpenColumnDetails`). The chrome `GridFieldsMenu`
 * that used to open a second door onto this same rail was retired 2026-08-02:
 * Fields mutates the column set of the card it sits on, so a page-chrome
 * control acting on that card was an altitude mismatch, and seven surfaces
 * shipped both doors at once. Retiring it is not a sticky-band regression —
 * the lip renders INSIDE the already-sticky `[data-grid-col-header]` band, so
 * the port still has exactly one sticky layer.
 *
 * Prefs: `staff_preferences.tableColumns[tableId]` via {@link useGridFields} +
 * {@link useGridColumnDisplay}. Shell: non-modal detail stack (New Order grammar).
 */

import { useEffect, useState } from 'react';
import { RotateCcw } from '@/components/Icons';
import { DetailStackRailRegistrar } from '@/components/right-rail/DetailStackRailRegistrar';
import { SidebarIntakeFormShell } from '@/design-system/components/sidebar-intake';
import {
  useGridColumnDisplay,
  useGridFields,
} from '@/design-system/components/grid';
import type { LedgerGridColumnModel } from '@/design-system/components/grid';
import type {
  GridColumnCellMode,
  GridColumnHighlight,
} from '@/design-system/components/grid/grid-column-display';
import { Button, Switch, ToolbarListboxOption } from '@/design-system/primitives';
import type { TableId } from '@/lib/tables/table-columns';
import { useGridColumnWidths } from './useGridColumnWidths';
import { cn } from '@/utils/_cn';

const HIGHLIGHT_OPTS: { id: GridColumnHighlight; label: string; swatch: string }[] = [
  { id: 'none', label: 'None', swatch: 'bg-surface-card ring-1 ring-border-soft' },
  { id: 'blue', label: 'Blue', swatch: 'bg-blue-50 ring-1 ring-blue-200' },
  { id: 'amber', label: 'Amber', swatch: 'bg-amber-50 ring-1 ring-amber-200' },
  { id: 'rose', label: 'Rose', swatch: 'bg-rose-50 ring-1 ring-rose-200' },
  { id: 'emerald', label: 'Emerald', swatch: 'bg-emerald-50 ring-1 ring-emerald-200' },
];

const CELL_OPTS: { id: GridColumnCellMode; label: string }[] = [
  { id: 'default', label: 'Default' },
  { id: 'chip', label: 'Chip' },
];

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
  const { displayByKey, setHighlight, setCellMode } = useGridColumnDisplay(tableId);
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
  const highlight = pref?.highlight ?? 'none';
  const cellMode = pref?.cell ?? 'default';

  return (
    <DetailStackRailRegistrar
      id="detail:grid-column-details"
      // This panel toggles the visible column set of the very grid it would be
      // squeezing, so a push would make its own effect indistinguishable from the
      // reflow it caused.
      push={false}
      onClose={onClose}
      modal={false}
      ariaLabel="Column display"
    >
      <SidebarIntakeFormShell
        title="Column display"
        subtitle="Grid fields"
        subtitleAccent="blue"
        onClose={onClose}
        footer={
          // Reset acts on the whole table's delta, not the selected column, so
          // it sits beside Done rather than under the per-column controls.
          // Absent while pristine — a reset that resets nothing teaches nothing.
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
        }
      >
        {fields.length === 0 ? (
          <p className="text-role-caption text-text-muted">
            This grid has no configurable columns.
          </p>
        ) : (
          <div className="space-y-5">
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
                  <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Column highlight">
                    {HIGHLIGHT_OPTS.map((opt) => {
                      const active = highlight === opt.id;
                      return (
                        <button
                          key={opt.id}
                          type="button"
                          role="radio"
                          aria-checked={active}
                          aria-label={opt.label}
                          data-highlight={opt.id}
                          onClick={() => setHighlight(selected.key, opt.id)}
                          className={cn(
                            'ds-raw-button flex h-8 items-center gap-1.5 rounded-lg px-2 text-role-caption font-semibold transition-colors',
                            active
                              ? 'bg-surface-sunken text-text-default ring-1 ring-border-default'
                              : 'text-text-muted hover:bg-surface-hover hover:text-text-default',
                          )}
                        >
                          <span className={cn('h-3.5 w-3.5 shrink-0 rounded-sm', opt.swatch)} />
                          {opt.label}
                        </button>
                      );
                    })}
                  </div>
                </section>

                <section className="space-y-2">
                  <h3 className="text-role-eyebrow font-semibold uppercase tracking-widest text-text-muted">
                    Display
                  </h3>
                  <div className="flex gap-1 rounded-lg border border-border-soft p-0.5" role="radiogroup" aria-label="Cell display">
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
              </>
            ) : null}
          </div>
        )}
      </SidebarIntakeFormShell>
    </DetailStackRailRegistrar>
  );
}
