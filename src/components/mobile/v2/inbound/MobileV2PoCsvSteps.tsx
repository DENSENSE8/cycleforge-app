'use client';

/**
 * The input steps of the phone purchase-order CSV import:
 *   - Choose file — the platform (full name) and the file, as two cards;
 *   - Match columns — just-in-time: one summary line ("6 of 7 columns
 *     matched") that opens every column, and open below it only what needs
 *     the operator: a required field no column holds, and columns left
 *     unmatched or matched by a weak guess (`poColumnsNeedingLook`). Each is
 *     a card that opens its picker (`PoColumnSheets`).
 */

import { useState } from 'react';
import { ChevronDown, ChevronUp } from '@/components/Icons';
import { MobileRecordCard, MobileRecordCardList } from '@/design-system/components/MobileRecordCard';
import { PO_COLUMNS, PO_FIELDS, type PoColumnIdentification, type PoField, type PoIdentifiedColumn } from '@/lib/inbound/po-columns';
import { InboundChoiceSheet, InboundRowButton, InboundRowText } from './MobileV2InboundParts';
import { plural } from './MobileV2PoCsvOrders';

/** Which picker is open: a column's field, or a required field's column. */
export type PoColumnPicker = { kind: 'column'; header: string } | { kind: 'field'; field: PoField };

const FIELD_CHOICES = [
  { value: '', label: 'Leave out', hint: 'Not imported' },
  ...PO_FIELDS.map((f) => ({ value: f, label: PO_COLUMNS[f].label, hint: PO_COLUMNS[f].required === 'always' ? 'Required' : undefined })),
];

const REASON_LABEL: Record<string, string> = {
  header: 'its header',
  preset: 'the platform’s header',
  values: 'its values',
  ai: 'AI',
  operator: 'you',
};

function ColumnCard({ col, attention, onOpen }: { col: PoIdentifiedColumn; attention: boolean; onOpen: () => void }) {
  return (
    <MobileRecordCard
      identity={col.header}
      title={col.field ? `Imports as ${PO_COLUMNS[col.field].label}` : 'Not imported'}
      detail={col.sample ? `Sample: ${col.sample}` : 'Every cell is empty'}
      facts={[{ label: col.reason ? `Matched by ${REASON_LABEL[col.reason]}` : 'Why', value: col.note }]}
      status={attention ? (col.field ? 'Check' : 'Not matched') : col.reason === 'operator' ? 'Chosen' : 'Matched'}
      tone={attention ? 'warn' : 'neutral'}
      onOpen={onOpen}
      testId={`m-po-csv-col-${col.header}`}
    />
  );
}

export function PoColumnsStep({
  identification,
  needLook,
  presetLabel,
  assistError,
  onOpenColumn,
  onOpenField,
}: {
  identification: PoColumnIdentification;
  /** Columns that ask for a look (`poColumnsNeedingLook`). */
  needLook: readonly PoIdentifiedColumn[];
  presetLabel: string;
  assistError: string | null;
  onOpenColumn: (header: string) => void;
  onOpenField: (field: PoField) => void;
}) {
  const [allOpen, setAllOpen] = useState(false);
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
            missing.length || needLook.length
              ? `${plural(missing.length + needLook.length, 'thing')} to check below`
              : 'Everything is matched — tap to see every column'
          }
          metaTone={missing.length ? 'warning' : 'muted'}
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
              Every row also gets {identification.defaults.map((d) => `${PO_COLUMNS[d.field].label.toLowerCase()} ${d.value}`).join(' · ')} ({presetLabel}).
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

/** The two pickers of the step: what a column imports as, and which column holds a required field. */
export function PoColumnSheets({
  identification,
  picker,
  onClose,
  onPick,
}: {
  identification: PoColumnIdentification | null;
  picker: PoColumnPicker | null;
  onClose: () => void;
  /** Bind `header` to `field` ('' = leave the column out). */
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

/** Step 1 "Choose file": the platform (full name) and the file — its name and size once picked. */
export function PoFileStep({
  platformLabel,
  presetHint,
  file,
  fileError,
  onPickPlatform,
  onPickFile,
}: {
  platformLabel: string | null;
  /** What the platform's preset supplies, e.g. Goodwill's one-item rows; null for none. */
  presetHint: string | null;
  file: { fileName: string; rows: number; columns: number } | null;
  fileError: string | null;
  onPickPlatform: () => void;
  onPickFile: () => void;
}) {
  return (
    <MobileRecordCardList>
      <MobileRecordCard
        identity="Platform"
        title={platformLabel ?? 'Pick the platform you bought on'}
        detail={presetHint ?? 'The platform every order in the file was bought on.'}
        tone={platformLabel ? 'neutral' : 'warn'}
        onOpen={onPickPlatform}
        testId="m-po-csv-platform"
      />
      <MobileRecordCard
        identity="File"
        title={file ? file.fileName : 'No file chosen yet'}
        detail={
          file ? 'Tap to choose a different file.' : 'One row per item, any column names — order #, title, price and tracking are found by their values.'
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
