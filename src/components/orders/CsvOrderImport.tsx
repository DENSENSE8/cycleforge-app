'use client';

// MOUNT: drop <CsvOrderImport /> into a settings/integrations surface (e.g.

import { useMemo, useState } from 'react';
import { Button } from '@/design-system/primitives';
import { EmptyState } from '@/design-system/primitives/EmptyState';
import {
  Upload,
  FileText,
  Check,
  AlertTriangle,
  Loader2,
} from '@/components/Icons';
import { AnimatedCheck } from '@/components/ui/AnimatedCheck';
import {
  CSV_ORDER_CANONICAL_FIELDS,
  autoMapCsvOrderHeaders,
  parseCsv,
  postCsvOrderImport,
  type CsvOrderImportResult,
} from '@/lib/orders/csv-order-import';
import { focusRing } from '@/design-system/tokens/focus-ring';
import { cn } from '@/utils/_cn';

export function CsvOrderImport() {
  const [fileName, setFileName] = useState<string | null>(null);
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<Record<string, string>[]>([]);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [parseError, setParseError] = useState<string | null>(null);

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [result, setResult] = useState<CsvOrderImportResult | null>(null);

  const canSubmit = useMemo(
    () => rows.length > 0 && Boolean(mapping.order_number) && !submitting,
    [rows.length, mapping.order_number, submitting],
  );

  async function handleFile(file: File) {
    setParseError(null);
    setResult(null);
    setSubmitError(null);
    setFileName(file.name);
    try {
      const text = await file.text();
      const { headers: hdrs, rows: parsedRows } = parseCsv(text);
      if (hdrs.length === 0 || parsedRows.length === 0) {
        setHeaders([]);
        setRows([]);
        setMapping({});
        setParseError('No data rows found in this file.');
        return;
      }
      setHeaders(hdrs);
      setRows(parsedRows);
      setMapping(autoMapCsvOrderHeaders(hdrs));
    } catch {
      setParseError('Could not read this file.');
    }
  }

  function reset() {
    setFileName(null);
    setHeaders([]);
    setRows([]);
    setMapping({});
    setParseError(null);
    setSubmitError(null);
    setResult(null);
  }

  async function handleSubmit() {
    setSubmitting(true);
    setSubmitError(null);
    setResult(null);
    const outcome = await postCsvOrderImport({ rows, mapping });
    if (!outcome.ok) {
      setSubmitError(outcome.error);
      setSubmitting(false);
      return;
    }
    setResult(outcome.result);
    setSubmitting(false);
  }

  if (result) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <AnimatedCheck size={20} />
          <h3 className="text-role-caption font-semibold text-text-default">Import complete</h3>
        </div>
        <div className="divide-y divide-border-hairline rounded-xl border border-border-soft">
          <div className="flex items-center justify-between px-4 py-2.5">
            <span className="text-role-eyebrow font-semibold text-text-soft">Inserted</span>
            <span className="text-role-caption font-semibold text-emerald-700">{result.inserted}</span>
          </div>
          <div className="flex items-center justify-between px-4 py-2.5">
            {/* Backfill is additive — it filled blanks on orders this org
                already had, and never overwrote a value someone typed. */}
            <span className="text-role-eyebrow font-semibold text-text-soft">Updated (backfilled)</span>
            <span className="text-role-caption font-semibold text-text-muted">{result.updated}</span>
          </div>
          <div className="flex items-center justify-between px-4 py-2.5">
            <span className="text-role-eyebrow font-semibold text-text-soft">Skipped (duplicates)</span>
            <span className="text-role-caption font-semibold text-text-muted">{result.skipped}</span>
          </div>
          <div className="flex items-center justify-between px-4 py-2.5">
            <span className="text-role-eyebrow font-semibold text-text-soft">Errors</span>
            <span className="text-role-caption font-semibold text-rose-700">{result.errors.length}</span>
          </div>
        </div>

        {result.errors.length > 0 && (
          <div className="rounded-xl border border-dashed border-rose-200 bg-rose-50 px-4 py-3">
            <div className="mb-1.5 flex items-center gap-1.5 text-role-eyebrow text-rose-700">
              <AlertTriangle className="h-3.5 w-3.5" /> Row errors
            </div>
            <ul className="max-h-40 space-y-0.5 overflow-y-auto text-role-micro text-rose-700">
              {result.errors.slice(0, 50).map((e) => (
                <li key={e.row}>Row {e.row + 1}: {e.reason}</li>
              ))}
            </ul>
          </div>
        )}

        <Button variant="secondary" size="sm" icon={<Upload className="h-4 w-4" />} onClick={reset}>
          Import another file
        </Button>
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div className="space-y-4">
        <EmptyState
          icon={<FileText className="h-6 w-6 text-text-faint" />}
          title="Import orders from CSV"
          description="Upload a CSV export from any channel. You'll map its columns to order fields on the next step. On To-Ship, Import → CSV opens desk staging with Ready / Action required triage before confirm."
          action={
            <label className="inline-flex cursor-pointer">
              <span className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-blue-600 px-3 text-role-caption font-semibold text-white shadow-sm shadow-blue-600/25 hover:bg-blue-500">
                <Upload className="h-4 w-4" /> Choose CSV file
              </span>
              <input
                type="file"
                accept=".csv,text/csv"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void handleFile(f);
                  e.target.value = '';
                }}
              />
            </label>
          }
        />
        {parseError && (
          <div className="rounded-xl border border-dashed border-rose-200 bg-rose-50 px-4 py-3 text-center text-role-micro font-semibold text-rose-700">
            {parseError}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex min-w-0 items-center gap-2">
          <FileText className="h-4 w-4 shrink-0 text-text-soft" />
          <span className="truncate text-role-caption font-semibold text-text-default">{fileName}</span>
          <span className="shrink-0 text-role-eyebrow font-semibold text-text-soft">
            {rows.length} rows
          </span>
        </div>
        <Button variant="ghost" size="sm" onClick={reset}>Change file</Button>
      </div>

      <div className="space-y-3">
        <p className="text-role-eyebrow text-text-soft">Map columns</p>
        <div className="divide-y divide-border-hairline rounded-xl border border-border-soft">
          {CSV_ORDER_CANONICAL_FIELDS.map((field) => {
            const selected = mapping[field.key] ?? '';
            const missingRequired = field.required && !selected;
            return (
              <div key={field.key} className="flex items-center justify-between gap-3 px-4 py-2.5">
                <div className="min-w-0">
                  <p className="truncate text-role-caption font-semibold text-text-default">
                    {field.label}
                    {field.required && <span className="ml-1 text-rose-600">*</span>}
                  </p>
                  <p className="text-role-eyebrow font-semibold text-text-soft">{field.key}</p>
                </div>
                <div className="flex items-center gap-2">
                  {selected && !missingRequired && <Check className="h-3.5 w-3.5 text-emerald-600" />}
                  <select
                    value={selected}
                    onChange={(e) => {
                      const v = e.target.value;
                      setMapping((m) => {
                        const next = { ...m };
                        if (v) next[field.key] = v;
                        else delete next[field.key];
                        return next;
                      });
                    }}
                    className={cn(
                      'h-8 rounded-lg border bg-surface-card px-2 text-role-caption font-semibold text-text-default',
                      missingRequired
                        ? cn('border-rose-300', focusRing('field', 'danger'))
                        : cn('border-border-soft', focusRing('field', 'accent')),
                    )}
                  >
                    <option value="">— Not mapped —</option>
                    {headers.map((h) => (
                      <option key={h} value={h}>{h}</option>
                    ))}
                  </select>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {submitError && (
        <div className="rounded-xl border border-dashed border-rose-200 bg-rose-50 px-4 py-3 text-center text-role-micro font-semibold text-rose-700">
          {submitError}
        </div>
      )}

      <div className="flex items-center justify-end gap-2 border-t border-border-hairline pt-3">
        {!mapping.order_number && (
          <span className="text-role-micro font-semibold text-text-soft">Map an order number column to continue</span>
        )}
        <Button
          variant="primary"
          size="sm"
          disabled={!canSubmit}
          icon={submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
          onClick={() => void handleSubmit()}
        >
          {submitting ? 'Importing…' : `Import ${rows.length} orders`}
        </Button>
      </div>
    </div>
  );
}
