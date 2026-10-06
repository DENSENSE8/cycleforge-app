'use client';

/**
 * The input steps of the phone order import:
 *   - Choose file — the CSV / TSV file, its name and size once picked;
 *   - Format — the export format the file looks like (`detectPoPreset`),
 *     overridable among `PO_PRESET_IDS`; an unverified format says "Check the
 *     column matches"; `generic` also asks the platform the orders came from;
 *   - Match columns — just-in-time: one summary line ("6 of 7 columns
 *     matched") that opens every column, and open below it only what needs
 *     the operator: a required field no column holds, and columns left
 *     unmatched or matched by a weak guess (`poColumnsNeedingLook`). Each is
 *     a card that opens its picker (`PoColumnSheets`).
 */

import { useState } from 'react';
import { ChevronDown, ChevronUp } from '@/components/Icons';
import { MobileRecordCard, MobileRecordCardList } from '@/design-system/components/MobileRecordCard';
import {
  PO_COLUMNS,
  PO_FIELDS,
  PO_PRESETS,
  PO_PRESET_IDS,
  type PoColumnIdentification,
  type PoField,
  type PoIdentifiedColumn,
  type PoPresetId,
} from '@/lib/inbound/po-columns';
import { InboundChoiceSheet, InboundRowButton, InboundRowText } from './MobileV2InboundParts';
import { plural } from './MobileV2PoCsvOrders';

/** Which picker is open: a column's field, or a required field's column. */
export type PoColumnPicker = { kind: 'column'; header: string } | { kind: 'field'; field: PoField };

/** What an unverified format asks of the operator — its headers are a guess, not a real export. */
const UNVERIFIED_ASK = 'Check the column matches';

const FIELD_CHOICES = [
  { value: '', label: 'Not saved', hint: 'The column stays in the file only' },
  ...PO_FIELDS.map((f) => ({ value: f, label: PO_COLUMNS[f].label, hint: PO_COLUMNS[f].required === 'always' ? 'Required' : undefined })),
];

const REASON_LABEL: Record<string, string> = {
  header: 'its header',
  preset: 'the format’s header',
  values: 'its values',
  ai: 'AI',
  operator: 'you',
};

const ORDER_TYPE_WORD = { PO: 'Purchase orders', RETURN: 'Returns' } as const;

/** The format picker's rows: label, then what the file holds and whether its headers are verified. */
export function poPresetChoices(detected: PoPresetId | null) {
  return PO_PRESET_IDS.map((id) => {
    const preset = PO_PRESETS[id];
    return {
      value: id,
      label: preset.label,
      hint: [ORDER_TYPE_WORD[preset.orderType], id === detected ? 'Found in this file' : null, preset.verified ? null : UNVERIFIED_ASK]
        .filter(Boolean)
        .join(' · '),
    };
  });
}

function ColumnCard({ col, attention, onOpen }: { col: PoIdentifiedColumn; attention: boolean; onOpen: () => void }) {
  return (
    <MobileRecordCard
      identity={col.header}
      title={col.field ? `Saved as ${PO_COLUMNS[col.field].label}` : 'Not saved'}
      detail={col.sample ? `Sample: ${col.sample}` : 'Every cell is empty'}
      facts={[{ label: col.reason ? `Matched by ${REASON_LABEL[col.reason]}` : 'Why', value: col.note }]}
      status={attention ? (col.field ? 'Check' : 'Not matched') : col.reason === 'operator' ? 'Chosen' : 'Matched'}
      tone={attention ? 'warn' : 'neutral'}
      onOpen={onOpen}
      testId={`m-po-csv-col-${col.header}`}
    />
  );
}

/** Step 1 "Choose file": the file — its name and size once picked. */
export function PoFileStep({
  file,
  fileError,
  onPickFile,
}: {
  file: { fileName: string; rows: number; columns: number } | null;
  fileError: string | null;
  onPickFile: () => void;
}) {
  return (
    <MobileRecordCardList>
      <MobileRecordCard
        identity="File"
        title={file ? file.fileName : 'No file chosen yet'}
        detail={
          file
            ? 'Tap to choose a different file.'
            : 'A CSV or TSV export, one row per item — Amazon returns, eBay returns, Goodwill or any other platform.'
        }
        count={file ? `${plural(file.rows, 'row')} · ${plural(file.columns, 'column')}` : null}
        status={fileError ? 'Can’t read' : null}
        tone={fileError ? 'bad' : file ? 'ok' : 'neutral'}
        facts={fileError ? [{ label: 'Problem', value: fileError }] : undefined}
        onOpen={onPickFile}
        testId="m-po-csv-file"
      />
    </MobileRecordCardList>
  );
}

/** Step 2 "Format": the export format (found or picked) and, for `generic`, the platform. */
export function PoFormatStep({
  preset,
  detected,
  platformLabel,
  onPickPreset,
  onPickPlatform,
}: {
  preset: PoPresetId;
  /** The format `detectPoPreset` found in the file. */
  detected: PoPresetId | null;
  /** The operator's platform pick — asked only for `generic`. */
  platformLabel: string | null;
  onPickPreset: () => void;
  onPickPlatform: () => void;
}) {
  const spec = PO_PRESETS[preset];
  return (
    <MobileRecordCardList>
      <MobileRecordCard
        identity="Format"
        title={spec.label}
        detail={`${ORDER_TYPE_WORD[spec.orderType]} · ${preset === detected ? 'found from the file’s columns' : 'picked by you'}. Tap to pick another format.`}
        facts={spec.verified ? undefined : [{ label: UNVERIFIED_ASK, value: 'This format’s headers are not checked against a real export yet.' }]}
        status={spec.verified ? null : 'Check'}
        tone={spec.verified ? 'ok' : 'warn'}
        onOpen={onPickPreset}
        testId="m-po-csv-format"
      />
      {spec.platform ? null : (
        <MobileRecordCard
          identity="Platform"
          title={platformLabel ?? 'Pick the platform you bought on'}
          detail="The platform every order in the file came from, unless a column says otherwise."
          tone={platformLabel ? 'neutral' : 'warn'}
          onOpen={onPickPlatform}
          testId="m-po-csv-platform"
        />
      )}
    </MobileRecordCardList>
  );
}

/** Step 3 "Match columns". */
export function PoColumnsStep({
  identification,
  needLook,
  preset,
  assistError,
  onOpenColumn,
  onOpenField,
}: {
  identification: PoColumnIdentification;
  /** Columns that ask for a look (`poColumnsNeedingLook`). */
  needLook: readonly PoIdentifiedColumn[];
  preset: PoPresetId;
  assistError: string | null;
  onOpenColumn: (header: string) => void;
  onOpenField: (field: PoField) => void;
}) {
  const [allOpen, setAllOpen] = useState(false);
  const spec = PO_PRESETS[preset];
  const missing = identification.missingRequired;
  const matched = identification.columns.filter((c) => c.field).length;
  const lookHeaders = new Set(needLook.map((c) => c.header));
  const Chevron = allOpen ? ChevronUp : ChevronDown;
  return (
    <>
      <InboundRowButton
        onClick={() => setAllOpen((open) => !open)}
        pressed={allOpen}
        testId="m-po-csv-columns-summary"
        trailing={<Chevron aria-hidden className="h-5 w-5 shrink-0 text-mode-muted" />}
      >
        <InboundRowText
          title={`${matched} of ${plural(identification.columns.length, 'column')} matched`}
          meta={
            spec.verified
              ? missing.length || needLook.length
                ? `${plural(missing.length + needLook.length, 'thing')} to check below`
                : 'Everything is matched — tap to see every column'
              : `${UNVERIFIED_ASK} — ${spec.label} headers are a guess. Tap to see every column.`
          }
          metaTone={missing.length || !spec.verified ? 'warning' : 'muted'}
        />
      </InboundRowButton>
      {missing.length ? (
        <MobileRecordCardList label="No column found">
          {missing.map((field) => (
            <MobileRecordCard
              key={field}
              identity={PO_COLUMNS[field].label}
              title="No column holds this yet"
              detail="Tap to pick the column that does, or Match with AI."
              status="Required"
              tone="bad"
              onOpen={() => onOpenField(field)}
              testId={`m-po-csv-missing-${field}`}
            />
          ))}
        </MobileRecordCardList>
      ) : null}
      {assistError ? <p className="break-words px-mode-page py-2 text-role-caption text-text-warning">{assistError}</p> : null}
      {needLook.length ? (
        <MobileRecordCardList label="Check these columns">
          {needLook.map((col) => (
            <ColumnCard key={col.header} col={col} attention onOpen={() => onOpenColumn(col.header)} />
          ))}
        </MobileRecordCardList>
      ) : null}
      {allOpen ? (
        <MobileRecordCardList label="Matched columns">
          {identification.defaults.length ? (
            <p className="break-words text-role-caption text-text-muted" data-testid="m-po-csv-defaults">
              Every row also gets {identification.defaults.map((d) => `${PO_COLUMNS[d.field].label.toLowerCase()} ${d.value}`).join(' · ')} ({spec.label}).
            </p>
          ) : null}
          {identification.columns
            .filter((col) => !lookHeaders.has(col.header))
            .map((col) => (
              <ColumnCard key={col.header} col={col} attention={false} onOpen={() => onOpenColumn(col.header)} />
            ))}
        </MobileRecordCardList>
      ) : null}
    </>
  );
}

/** The two pickers of the step: what a column is saved as, and which column holds a required field. */
export function PoColumnSheets({
  identification,
  picker,
  onClose,
  onPick,
}: {
  identification: PoColumnIdentification | null;
  picker: PoColumnPicker | null;
  onClose: () => void;
  /** Bind `header` to `field` ('' = the column is not saved). */
  onPick: (header: string, field: PoField | '') => void;
}) {
  const column = picker?.kind === 'column' ? identification?.columns.find((c) => c.header === picker.header) : null;
  const field = picker?.kind === 'field' ? picker.field : null;
  return (
    <>
      <InboundChoiceSheet
        open={picker?.kind === 'column'}
        onClose={onClose}
        title={column ? `Column “${column.header}”` : 'Column'}
        options={FIELD_CHOICES}
        value={column?.field ?? ''}
        onPick={(value) => column && onPick(column.header, value as PoField | '')}
        testId="m-po-csv-field-sheet"
      />
      <InboundChoiceSheet
        open={field != null}
        onClose={onClose}
        title={field ? `Which column is ${PO_COLUMNS[field].label}?` : 'Column'}
        options={(identification?.columns ?? []).map((col) => ({
          value: col.header,
          label: col.header,
          hint: [col.sample ? `Sample: ${col.sample}` : 'Empty', col.field ? `now ${PO_COLUMNS[col.field].label}` : null].filter(Boolean).join(' · '),
        }))}
        value={field ? (identification?.mapping[field] ?? null) : null}
        onPick={(header) => field && onPick(header, field)}
        testId="m-po-csv-header-sheet"
      />
    </>
  );
}
