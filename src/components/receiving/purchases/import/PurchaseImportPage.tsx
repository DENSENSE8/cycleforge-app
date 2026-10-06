'use client';

/**
 * `/purchasing/import` body (route node `purchase-import`) — import a
 * platform's order export (CSV or TSV) on one page: the file → its format
 * (detected, overridable) → what each column is saved as and where it lands
 * → a dry run by order → Import, which opens the upload check. Recent
 * uploads sit in the facts column, each opening its check.
 */

import { useCallback, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { Upload } from '@/components/Icons';
import { Button } from '@/design-system/primitives';
import { SearchableSelectField } from '@/design-system/components/SearchableSelectField';
import { RecordGroup } from '@/design-system/components/record-ledger/RecordGroup';
import { EvidenceNotice } from '@/design-system/components/record-ledger/RecordEvidence';
import {
  DESK_RECORD_ASIDE_COLUMN_CLASS,
  DESK_RECORD_COLUMNS_CLASS,
  DESK_RECORD_MAIN_COLUMN_CLASS,
} from '@/design-system/tokens/desk-stage';
import {
  PO_COLUMNS,
  PO_PRESET_IDS,
  PO_PRESETS,
  detectPoPreset,
  identifyColumns,
  poPresetPlatform,
  withPoMapping,
  type PoField,
  type PoPresetId,
} from '@/lib/inbound/po-columns';
import {
  INBOUND_IMPORT_BATCHES_KEY,
  postPoCsvImport,
  usePoCsvPreview,
  usePoPlatformChoices,
  type PoCsvImportRequest,
} from '@/lib/inbound/po-csv-client';
import { groupPoReviewOrders, poOrphanLines, poRemapColumn, poReviewOrders } from '@/lib/inbound/po-csv-review';
import { purchaseImportCheckHref } from '@/lib/nav/route-tree';
import { invalidateReceivingFeeds } from '@/lib/queries/receiving-queries';
import { parseCsv } from '@/lib/tables/import/parse-csv';
import { toast } from '@/lib/toast';
import { cn } from '@/utils/_cn';
import { ImportColumnMapping } from './ImportColumnMapping';
import { ImportFileDrop, plural, type LoadedImportFile } from './ImportFileDrop';
import { ImportPreview } from './ImportPreview';
import { RecentImports } from './RecentImports';

const PRESET_OPTIONS = PO_PRESET_IDS.map((id) => ({
  value: id,
  label: PO_PRESETS[id].label,
  meta: PO_PRESETS[id].orderType === 'RETURN' ? 'Returns' : 'Purchase orders',
}));

export function PurchaseImportPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const platformChoices = usePoPlatformChoices();
  const [file, setFile] = useState<LoadedImportFile | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [presetId, setPresetId] = useState<PoPresetId>('generic');
  const [platformPick, setPlatformPick] = useState('');
  /** Operator picks (field → header); null = as identified. */
  const [picked, setPicked] = useState<Partial<Record<PoField, string>> | null>(null);
  const [committing, setCommitting] = useState(false);
  const [commitError, setCommitError] = useState<string | null>(null);

  const preset = PO_PRESETS[presetId];
  const platform = poPresetPlatform(preset, platformPick);
  const identification = useMemo(() => {
    if (!file) return null;
    const base = identifyColumns(file.headers, file.rows, { preset, platform });
    return picked ? withPoMapping(base, picked, { preset, platform }) : base;
  }, [file, picked, preset, platform]);
  const missing = identification?.missingRequired ?? [];

  const request = useMemo<Omit<PoCsvImportRequest, 'dryRun' | 'assist'> | null>(
    () =>
      file && identification && missing.length === 0
        ? {
            fileName: file.fileName,
            headers: file.headers,
            rows: file.rows,
            preset: presetId,
            // Only the generic preset takes the operator's platform; every other preset stamps its own.
            ...(preset.platform ? {} : { platform: platformPick }),
            mapping: identification.mapping,
          }
        : null,
    [file, identification, missing.length, presetId, preset.platform, platformPick],
  );
  const preview = usePoCsvPreview(request);
  const summary = preview.data?.summary ?? null;
  const importable = summary ? summary.new + summary.updated : 0;

  const review = useMemo(() => {
    if (!file || !preview.data) return null;
    const input = {
      rows: file.rows,
      mapping: preview.data.identification.mapping,
      platform: preview.data.platform,
      preset: presetId,
      rowProblems: preview.data.rowProblems,
    };
    return {
      groups: groupPoReviewOrders(poReviewOrders({ ...input, outcomes: preview.data.batch?.orders ?? [] })),
      orphans: poOrphanLines(input),
    };
  }, [file, preview.data, presetId]);

  const loadFile = useCallback(async (upload: File) => {
    setFileError(null);
    setCommitError(null);
    try {
      const { headers, rows } = parseCsv(await upload.text());
      if (headers.length === 0 || rows.length === 0) {
        setFileError(`No data rows in ${upload.name}.`);
        return;
      }
      setPresetId(detectPoPreset(headers, rows));
      setPicked(null);
      setFile({ fileName: upload.name, headers, rows });
    } catch {
      setFileError(`Could not read ${upload.name}.`);
    }
  }, []);

  const remap = useCallback(
    (header: string, field: PoField | '') => {
      if (identification) setPicked(poRemapColumn(identification.mapping, header, field));
    },
    [identification],
  );

  const commit = async () => {
    if (!request || importable === 0) return;
    setCommitting(true);
    setCommitError(null);
    try {
      const outcome = await postPoCsvImport({ ...request, dryRun: false });
      if (!outcome.ok) {
        setCommitError(outcome.error);
        return;
      }
      invalidateReceivingFeeds(queryClient);
      void queryClient.invalidateQueries({ queryKey: INBOUND_IMPORT_BATCHES_KEY });
      void queryClient.invalidateQueries({ queryKey: ['inbound-po-csv-preview'] });
      const { summary: landed, batch } = outcome.result;
      toast.success(`Imported ${plural(landed.landed, 'order', 'orders')}${landed.failed ? ` · ${landed.failed} failed` : ''}`);
      if (batch?.batchId != null) router.push(purchaseImportCheckHref(batch.batchId));
    } finally {
      setCommitting(false);
    }
  };

  return (
    <div className="@container h-full w-full overflow-y-auto" data-testid="purchase-import">
      <div className={cn(DESK_RECORD_COLUMNS_CLASS, 'px-4 py-4')}>
        <div className={cn(DESK_RECORD_MAIN_COLUMN_CLASS, 'flex flex-col gap-4')}>
          <ImportFileDrop file={file} error={fileError} onFile={(upload) => void loadFile(upload)} />

          {file && identification ? (
            <RecordGroup title="Columns" testId="purchase-import-columns">
              <div className="flex flex-col gap-3 px-4 pb-2 pt-1">
                <div className="flex flex-wrap items-start gap-3">
                  <SearchableSelectField
                    label="Format"
                    value={presetId}
                    options={PRESET_OPTIONS}
                    onChange={(value) => {
                      if (!value) return;
                      setPresetId(value as PoPresetId);
                      setPicked(null);
                    }}
                    className="w-72"
                    testId="purchase-import-preset"
                  />
                  {preset.platform ? null : (
                    <SearchableSelectField
                      label="Platform"
                      value={platformPick || null}
                      options={platformChoices}
                      onChange={(value) => setPlatformPick(value == null ? '' : String(value))}
                      placeholder="Pick a platform"
                      className="w-60"
                      testId="purchase-import-platform"
                    />
                  )}
                  {preset.spec ? (
                    <Button size="sm" variant="ghost" href={preset.spec}>
                      Format spec
                    </Button>
                  ) : null}
                </div>
                {preset.verified ? null : (
                  <EvidenceNotice tone="warn">Check the column matches — this format is not verified.</EvidenceNotice>
                )}
                {missing.length > 0 ? (
                  <EvidenceNotice tone="warn">
                    Match {missing.map((field) => PO_COLUMNS[field].label).join(', ')} before the preview can run.
                  </EvidenceNotice>
                ) : null}
              </div>
              <ImportColumnMapping columns={identification.columns} onRemap={remap} />
            </RecordGroup>
          ) : null}

          {request ? (
            <RecordGroup
              title="Preview"
              testId="purchase-import-preview"
              titleAccessory={
                summary ? (
                  <span className="text-role-caption tabular-nums text-text-muted">
                    {plural(summary.orders, 'order', 'orders')} · {summary.new} new · {summary.updated} updated · {summary.unchanged}{' '}
                    unchanged · {summary.needsFix} held
                  </span>
                ) : null
              }
              action={
                <Button
                  size="sm"
                  variant="primary"
                  icon={<Upload />}
                  loading={committing}
                  disabled={!summary || importable === 0 || preview.isFetching}
                  onClick={() => void commit()}
                  data-testid="purchase-import-commit"
                >
                  {importable > 0 ? `Import ${plural(importable, 'order', 'orders')}` : 'Nothing to import'}
                </Button>
              }
            >
              {commitError ? <p className="px-4 pb-2 text-role-caption text-text-danger">{commitError}</p> : null}
              {preview.isError ? (
                <p className="px-4 pb-4 text-role-caption text-text-danger">{preview.error.message}</p>
              ) : review ? (
                <ImportPreview groups={review.groups} orphans={review.orphans} platform={platform} />
              ) : (
                <p className="px-4 pb-4 text-role-caption text-text-muted">Checking every order against what is already saved…</p>
              )}
            </RecordGroup>
          ) : null}
        </div>

        <aside className={DESK_RECORD_ASIDE_COLUMN_CLASS} aria-label="Recent uploads">
          <RecordGroup title="Recent uploads" testId="purchase-import-recent">
            <RecentImports />
          </RecordGroup>
        </aside>
      </div>
    </div>
  );
}
