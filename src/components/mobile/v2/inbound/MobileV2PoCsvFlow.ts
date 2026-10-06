'use client';

/**
 * The state of the phone order import (`MobileV2PoCsvImport`): the parsed
 * file, its format (found by `detectPoPreset`, overridable), the `generic`
 * format's platform pick, the column matches, the server dry run and the
 * commit — all through the one engine (`po-columns`, `po-csv-review`,
 * `po-csv-client`). The screen owns only the step and the open sheet.
 */

import { useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { PO_PRESETS, detectPoPreset, identifyColumns, poPresetPlatform, withPoMapping, type PoField, type PoPresetId } from '@/lib/inbound/po-columns';
import { postPoCsvImport, usePoCsvPreview, usePoPlatformChoices, type PoCsvImportResponse } from '@/lib/inbound/po-csv-client';
import { groupPoReviewOrders, poColumnsNeedingLook, poOrphanLines, poRemapColumn, poReviewOrders } from '@/lib/inbound/po-csv-review';
import { invalidateReceivingFeeds } from '@/lib/queries/receiving-queries';
import { parseCsv } from '@/lib/tables/import/parse-csv';

interface LoadedFile {
  fileName: string;
  headers: string[];
  rows: Record<string, string>[];
  /** The format `detectPoPreset` found in the file. */
  detected: PoPresetId;
}

export function useMobilePoCsvFlow() {
  const queryClient = useQueryClient();
  const platformChoices = usePoPlatformChoices();
  const [file, setFile] = useState<LoadedFile | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [presetId, setPresetId] = useState<PoPresetId>('generic');
  /** The operator's platform pick — asked only by the `generic` format. */
  const [platformPick, setPlatformPick] = useState('');
  /** Operator picks (field → header); null = as identified. */
  const [picked, setPicked] = useState<Partial<Record<PoField, string>> | null>(null);
  /** Headers the operator has looked at — they no longer ask for a look. */
  const [checked, setChecked] = useState<ReadonlySet<string>>(() => new Set());
  const [drill, setDrill] = useState<string | null>(null);
  const [assisting, setAssisting] = useState(false);
  const [assistError, setAssistError] = useState<string | null>(null);
  const [committing, setCommitting] = useState(false);
  const [commitError, setCommitError] = useState<string | null>(null);
  const [landed, setLanded] = useState<PoCsvImportResponse | null>(null);

  const preset = PO_PRESETS[presetId];
  const platform = poPresetPlatform(preset, platformPick);
  /** Sent to the server only for `generic` — every other format stamps its own platform. */
  const requestPlatform = preset.platform ? undefined : platformPick;
  const identification = useMemo(() => {
    if (!file) return null;
    const base = identifyColumns(file.headers, file.rows, { preset, platform });
    return picked ? withPoMapping(base, picked, { preset, platform }) : base;
  }, [file, picked, preset, platform]);
  const missing = identification?.missingRequired ?? [];
  const needLook = identification ? poColumnsNeedingLook(identification, checked) : [];

  /** The file as matched now — the dry run's input, and the assist / commit body. */
  const request = useMemo(
    () =>
      file && identification
        ? { fileName: file.fileName, headers: file.headers, rows: file.rows, preset: presetId, platform: requestPlatform, mapping: identification.mapping }
        : null,
    [file, identification, presetId, requestPlatform],
  );
  const preview = usePoCsvPreview(landed || missing.length > 0 ? null : request);
  const answer = landed ?? preview.data ?? null;
  const summary = preview.data?.summary ?? null;

  const review = useMemo(() => {
    if (!file || !answer) return null;
    const input = {
      rows: file.rows,
      mapping: answer.identification.mapping,
      platform: answer.platform,
      preset: answer.preset,
      rowProblems: answer.rowProblems,
    };
    const orders = poReviewOrders({ ...input, outcomes: answer.batch?.orders ?? [] });
    return { orders, groups: groupPoReviewOrders(orders), orphans: poOrphanLines(input) };
  }, [file, answer]);

  const resetMapping = () => {
    setPicked(null);
    setChecked(new Set());
    setAssistError(null);
  };

  const loadFile = async (upload: File) => {
    setFileError(null);
    setLanded(null);
    setCommitError(null);
    try {
      const { headers, rows } = parseCsv(await upload.text());
      if (headers.length === 0 || rows.length === 0) {
        setFileError('No data rows found in this file.');
        return;
      }
      const detected = detectPoPreset(headers, rows);
      setPresetId(detected);
      resetMapping();
      setFile({ fileName: upload.name, headers, rows, detected });
    } catch {
      setFileError('Could not read this file.');
    }
  };

  const pickPreset = (id: PoPresetId) => {
    setPresetId(id);
    resetMapping();
  };

  const pickPlatform = (value: string) => {
    setPlatformPick(value);
    resetMapping();
  };

  const remap = (header: string, field: PoField | '') => {
    if (!identification) return;
    setPicked(poRemapColumn(identification.mapping, header, field));
    setChecked((prior) => new Set(prior).add(header));
  };

  const assist = async () => {
    if (!request) return;
    setAssisting(true);
    setAssistError(null);
    try {
      const outcome = await postPoCsvImport({ ...request, assist: true, dryRun: true });
      if (!outcome.ok) setAssistError(outcome.error);
      else if (outcome.result.assist?.error) setAssistError(`AI mapping unavailable: ${outcome.result.assist.error}`);
      else setPicked(outcome.result.identification.mapping);
    } finally {
      setAssisting(false);
    }
  };

  const commit = async () => {
    if (!request) return;
    setCommitting(true);
    setCommitError(null);
    try {
      const outcome = await postPoCsvImport({ ...request, dryRun: false, label: request.fileName });
      if (!outcome.ok) {
        setCommitError(outcome.error);
        return;
      }
      invalidateReceivingFeeds(queryClient);
      void queryClient.invalidateQueries({ queryKey: ['inbound-po-csv-preview'] });
      setDrill(null);
      setLanded(outcome.result);
    } finally {
      setCommitting(false);
    }
  };

  return {
    file,
    fileError,
    presetId,
    platformChoices,
    platformPick,
    platformLabel: platformPick ? (platformChoices.find((c) => c.value === platformPick)?.label ?? platformPick) : null,
    identification,
    missing,
    needLook,
    preview,
    summary,
    /** Orders the commit would write: new + updated. */
    importable: summary ? summary.new + summary.updated : 0,
    landed,
    /** The written batch — its upload check is `purchaseImportCheckHref(batchId)`. */
    batchId: landed?.batch?.batchId ?? null,
    review,
    drillOrder: review?.orders.find((o) => o.key === drill) ?? null,
    setDrill,
    assisting,
    assistError,
    committing,
    commitError,
    loadFile,
    pickPreset,
    pickPlatform,
    remap,
    assist,
    commit,
  };
}
