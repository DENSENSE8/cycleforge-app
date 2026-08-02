'use client';

/**
 * Right-rail column display inspector — pick a product column, toggle
 * visibility, set highlight wash + cell chrome (default / chip).
 *
 * Prefs: `staff_preferences.tableColumns[tableId]` via {@link useGridFields} +
 * {@link useGridColumnDisplay}. Shell: non-modal detail stack (New Order grammar).
 */

import { useEffect, useState } from 'react';
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
  const { fields, setFieldVisible } = useGridFields(tableId, columns);
  const { displayByKey, setHighlight, setCellMode } = useGridColumnDisplay(tableId);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    if (initialHideKey && fields.some((f) => f.key === initialHideKey)) {
      setSelectedKey(initialHideKey);
      return;
    }
    setSelectedKey(fields[0]?.key ?? null);
  }, [open, initialHideKey, fields]);

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
          <Button variant="primary" className="w-full" onClick={onClose}>
            Done
          </Button>
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
