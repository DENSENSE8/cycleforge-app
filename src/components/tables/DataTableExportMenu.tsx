'use client';

/** The export panel — INLINE, on the same popover grammar as Sort and Filter. */

import { Fragment, useCallback, useMemo, useState } from 'react';
import { Download } from '@/components/Icons';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/design-system/primitives/radix-popover';
import {
  DATA_TABLE_TOOLBAR_CORNER,
  DROPDOWN_ITEM_CORNER,
  DROPDOWN_SHELL_CORNER,
} from '@/design-system/tokens/radius';
import { focusRing } from '@/design-system/tokens/focus-ring';
import { Button } from '@/design-system/primitives';
import { cn } from '@/utils/_cn';
import {
  groupExportFields,
  isDefaultFieldSet,
  resolveExportFieldIds,
  toggleExportField,
  type ExportField,
} from '@/lib/tables/export/export-fields';
import {
  EXPORT_FORMATS,
  exportFilename,
  serializeRows,
  type ExportCell,
  type ExportFormat,
} from '@/lib/tables/export/serialize';
import { HoverTooltip } from '@/components/ui/HoverTooltip';

const FORMATS: readonly ExportFormat[] = ['csv', 'tsv'];

export interface DataTableExportMenuProps<Row> {
  fields: readonly ExportField[];
  /** Order-faithful against the field ids it is handed. */
  toRow: (row: Row, fieldIds: readonly string[]) => readonly ExportCell[];
  /** Base filename without extension — the lane. */
  filename: string;
  /** The CURRENT narrowing. Never the unfiltered collection. */
  getViewRows: () => readonly Row[];
  /** The checked rows, or empty. */
  getSelectedRows: () => readonly Row[];
  viewCount: number;
  selectedCount: number;
  /** Stored org-wide choice, or null for the defaults. */
  chosenFieldIds: readonly string[] | null;
  onChangeFields: (next: string[]) => void;
  /** Labeled desk-header button, or the toolbar glyph. */
  face: 'header' | 'glyph';
  /** Rendered as the trigger when `face` is `'header'`. */
  renderHeaderTrigger: (props: {
    disabled: boolean;
    ariaLabel: string;
    children: React.ReactNode;
  }) => React.ReactNode;
}

/** Build the file and hand it to the browser. The only DOM in this module. */
function download(
  header: readonly string[],
  rows: Iterable<readonly ExportCell[]>,
  base: string,
  format: ExportFormat,
): void {
  const text = serializeRows(header, rows, format);
  const url = URL.createObjectURL(new Blob([text], { type: EXPORT_FORMATS[format].mime }));
  const link = document.createElement('a');
  link.href = url;
  link.download = exportFilename(base, format);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export function DataTableExportMenu<Row>({
  fields,
  toRow,
  filename,
  getViewRows,
  getSelectedRows,
  viewCount,
  selectedCount,
  chosenFieldIds,
  onChangeFields,
  face,
  renderHeaderTrigger,
}: DataTableExportMenuProps<Row>) {
  const [open, setOpen] = useState(false);
  const [format, setFormat] = useState<ExportFormat>('csv');

  const activeIds = useMemo(
    () => resolveExportFieldIds(fields, chosenFieldIds),
    [fields, chosenFieldIds],
  );
  const labels = useMemo(
    () => activeIds.map((id) => fields.find((f) => f.id === id)?.label ?? id),
    [activeIds, fields],
  );
  const bands = useMemo(() => groupExportFields(fields), [fields]);
  const isDefault = isDefaultFieldSet(fields, chosenFieldIds);

  const run = useCallback(
    (rows: readonly Row[]) => {
      if (rows.length === 0) return;
      download(labels, rows.map((row) => toRow(row, activeIds)), filename, format);
      setOpen(false);
    },
    [labels, activeIds, toRow, filename, format],
  );

  const empty = viewCount === 0;
  const ariaLabel = empty
    ? 'Export to a file'
    : `Export ${viewCount} rows — ${labels.length} columns`;

  const trigger =
    face === 'header' ? (
      renderHeaderTrigger({ disabled: empty, ariaLabel, children: 'Export' })
    ) : (
      <HoverTooltip label={ariaLabel} asChild><button
        type="button"
        disabled={empty}
        data-testid="data-table-export"
        aria-label={ariaLabel}
        aria-expanded={open}
        // Stays a native `title` on purpose:
       
        // The retired `DataTableExportButton`'s own chrome, carried over
        // verbatim: the glyph face did not change, only what it opens.
        className={cn(
          'ds-raw-button inline-flex h-6 w-6 shrink-0 items-center justify-center',
          'transition-colors duration-100 ease-out',
          DATA_TABLE_TOOLBAR_CORNER,
          focusRing('control'),
          'text-text-muted hover:bg-surface-hover hover:text-text-default',
          'disabled:cursor-default disabled:text-text-faint disabled:opacity-40 disabled:hover:bg-transparent',
        )}
      >
        <Download aria-hidden className="h-3.5 w-3.5" />
      </button></HoverTooltip>
    );

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent
        align="end"
        sideOffset={2}
        data-testid="data-table-export-menu"
        className={cn(DROPDOWN_SHELL_CORNER, 'w-72 overflow-hidden p-0.5', focusRing('field', 'accent'))}
      >
        {/* ── Tier 1 · the default. Autofocused, so Enter runs it. ────────── */}
        <Button
          type="button"
          variant="primary"
          size="sm"
          autoFocus
          className="w-full justify-between"
          disabled={empty}
          data-testid="data-table-export-view"
          onClick={() => run(getViewRows())}
        >
          <span>Download this view</span>
          <span className="tabular-nums opacity-80">{viewCount.toLocaleString()}</span>
        </Button>

        {/* ── Tier 2 · scope. Absent, never disabled, with no selection. ──── */}
        {selectedCount > 0 ? (
          <Button
            type="button"
            variant="secondary"
            size="sm"
            className="mt-1 w-full justify-between"
            data-testid="data-table-export-selected"
            onClick={() => run(getSelectedRows())}
          >
            <span>Download selected</span>
            <span className="tabular-nums opacity-80">{selectedCount.toLocaleString()}</span>
          </Button>
        ) : null}

        <div className="my-1 h-px bg-border-soft" aria-hidden />

        {/* ── Tier 3 · configure ─────────────────────────────────────────── */}
        <div className="max-h-64 overflow-y-auto">
          {bands.map((band, bandIndex) => (
            <Fragment key={band.key || `band-${bandIndex}`}>
              {band.key ? (
                <p
                  className={cn(
                    'px-2 pb-0.5 text-role-micro font-semibold uppercase tracking-widest text-text-faint',
                    bandIndex === 0 ? 'pt-1' : 'pt-2',
                  )}
                >
                  {band.key}
                </p>
              ) : null}
              {band.fields.map((field) => {
                const on = activeIds.includes(field.id);
                return (
                  <button
                    key={field.id}
                    type="button"
                    role="menuitemcheckbox"
                    aria-checked={on}
                    onClick={() => onChangeFields(toggleExportField(fields, chosenFieldIds, field.id))}
                    data-testid={`data-table-export-field-${field.id}`}
                    className={cn(
                      'ds-raw-button flex w-full items-center justify-between gap-2 px-2 py-1.5 text-left text-role-caption',
                      DROPDOWN_ITEM_CORNER,
                      focusRing('control'),
                      on
                        ? 'bg-surface-sunken font-semibold text-text-default'
                        : 'text-text-soft hover:bg-surface-hover hover:text-text-default',
                    )}
                  >
                    <span className="truncate">{field.label}</span>
                  </button>
                );
              })}
            </Fragment>
          ))}
        </div>

        <div className="my-1 h-px bg-border-soft" aria-hidden />

        {/*
          Format is a RADIO over one serializer, not a second download path —
          the plan's line, and the reason `serializeRows` takes it as an
          argument rather than having a `toTsv` twin.
        */}
        <div className="flex items-center justify-between gap-2 px-2 py-1">
          <span className="text-role-micro font-semibold uppercase tracking-widest text-text-faint">
            Format
          </span>
          <div role="radiogroup" aria-label="Export format" className="inline-flex items-center gap-1">
            {FORMATS.map((id) => (
              <button
                key={id}
                type="button"
                role="radio"
                aria-checked={format === id}
                onClick={() => setFormat(id)}
                data-testid={`data-table-export-format-${id}`}
                className={cn(
                  'ds-raw-button px-2 py-0.5 text-role-caption',
                  DROPDOWN_ITEM_CORNER,
                  focusRing('control'),
                  format === id
                    ? 'bg-surface-sunken font-semibold text-text-default'
                    : 'text-text-soft hover:text-text-default',
                )}
              >
                {EXPORT_FORMATS[id].label}
              </button>
            ))}
          </div>
        </div>

        {!isDefault ? (
          <button
            type="button"
            onClick={() => onChangeFields(fields.filter((f) => f.default).map((f) => f.id))}
            data-testid="data-table-export-reset"
            className={cn(
              'ds-raw-button w-full px-2 py-1.5 text-left text-role-caption text-text-accent',
              DROPDOWN_ITEM_CORNER,
              focusRing('control'),
              'hover:bg-surface-hover',
            )}
          >
            Reset to default columns
          </button>
        ) : null}
      </PopoverContent>
    </Popover>
  );
}
