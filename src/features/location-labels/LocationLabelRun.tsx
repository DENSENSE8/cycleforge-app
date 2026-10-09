'use client';

/**
 * A bulk run of location labels on one aisle. `useLabelRun` owns the plan;
 * `LabelRunControls` is the left-column form — bays and levels, each a
 * from–through pair of Figma-style scrub fields (press and drag left / right,
 * or click to type) plus All · Odd · Even, and optional positions. The ticked
 * list renders on the right (`RunLabelList`).
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { LabelPrintRunNumField } from '@/components/labels/LabelPrintRunNumField';
import { TabSwitch } from '@/design-system/components/TabSwitch';
import { Checkbox } from '@/design-system/primitives/Checkbox';
import { LOCATION_BAY_LABEL_PLURAL } from '@/lib/barcode-routing';
import {
  MAX_RUN_LABELS,
  expandRangePrintRun,
  type ExpandedPrintRunRow,
  type RunParity,
  type RunRange,
} from '@/lib/locations/expand-print-run';

/** The aisle a run prints on — room and aisle are picked in the address steps. */
export interface LabelRunAisle {
  roomName: string;
  zoneLetter: string;
  aisle: number;
}

type Span = { from: number; through: number };

const SEED_BAYS: RunRange = { from: 1, through: 12, parity: 'all' };
const SEED_LEVELS: RunRange = { from: 1, through: 5, parity: 'all' };
const SEED_POSITIONS: Span = { from: 1, through: 20 };

const PARITY_TABS: { id: RunParity; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'odd', label: 'Odd' },
  { id: 'even', label: 'Even' },
];

export interface LabelRun {
  bays: RunRange;
  setBays: (range: RunRange) => void;
  levels: RunRange;
  setLevels: (range: RunRange) => void;
  /** Null = no position on the face. */
  positions: Span | null;
  setPositions: (range: Span | null) => void;
  /** Every label the run names, in print order. */
  rows: ExpandedPrintRunRow[];
  /** Why `rows` is empty, for the list's hint. */
  emptyHint: string;
  excluded: ReadonlySet<string>;
  toggle: (code: string) => void;
  /** The labels still ticked, in print order. */
  ticked: ExpandedPrintRunRow[];
}

export function useLabelRun(aisle: LabelRunAisle | null): LabelRun {
  const [bays, setBays] = useState(SEED_BAYS);
  const [levels, setLevels] = useState(SEED_LEVELS);
  const [positions, setPositions] = useState<Span | null>(null);
  const [excluded, setExcluded] = useState<ReadonlySet<string>>(() => new Set());

  // A new aisle starts a new run.
  const aisleKey = aisle ? `${aisle.roomName}|${aisle.zoneLetter}|${aisle.aisle}` : '';
  useEffect(() => {
    setBays(SEED_BAYS);
    setLevels(SEED_LEVELS);
    setPositions(null);
    setExcluded(new Set());
  }, [aisleKey]);

  const { rows, emptyHint } = useMemo((): { rows: ExpandedPrintRunRow[]; emptyHint: string } => {
    if (!aisle) return { rows: [], emptyHint: 'Pick a room and an aisle to plan a bulk print.' };
    const plan = expandRangePrintRun({ zone: aisle.zoneLetter, aisle: aisle.aisle, bays, levels, positions });
    if (plan.status === 'ok') return { rows: plan.rows, emptyHint: '' };
    if (plan.status === 'too_many') {
      return { rows: [], emptyHint: `${plan.count} labels is more than one run takes (${MAX_RUN_LABELS}). Narrow a range.` };
    }
    return { rows: [], emptyHint: 'No labels match these ranges.' };
  }, [aisle, bays, levels, positions]);

  const toggle = useCallback(
    (code: string) =>
      setExcluded((prev) => {
        const next = new Set(prev);
        if (next.has(code)) next.delete(code);
        else next.add(code);
        return next;
      }),
    [],
  );

  const ticked = useMemo(() => rows.filter((row) => !excluded.has(row.code)), [rows, excluded]);

  return { bays, setBays, levels, setLevels, positions, setPositions, rows, emptyHint, excluded, toggle, ticked };
}

/** From never passes through: from stops at through, through stops at from. */
function SpanFields({ label, span, onChange, disabled }: { label: string; span: Span; onChange: (span: Span) => void; disabled: boolean }) {
  return (
    <span className="flex items-center gap-1">
      <LabelPrintRunNumField
        label={`${label} from`}
        showLabel={false}
        value={span.from}
        max={span.through}
        onChange={(from) => onChange({ ...span, from })}
        disabled={disabled}
      />
      <span className="text-role-caption text-text-muted">–</span>
      <LabelPrintRunNumField
        label={`${label} through`}
        showLabel={false}
        value={span.through}
        min={span.from}
        onChange={(through) => onChange({ ...span, through })}
        disabled={disabled}
      />
    </span>
  );
}

function ParityRow({
  label,
  range,
  onChange,
  disabled,
  testId,
}: {
  label: string;
  range: RunRange;
  onChange: (range: RunRange) => void;
  disabled: boolean;
  testId: string;
}) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-mode-page py-2" data-testid={testId}>
      <p className="w-20 text-role-caption font-semibold text-text-default">{label}</p>
      <SpanFields label={label} span={range} onChange={(span) => onChange({ ...range, ...span })} disabled={disabled} />
      <TabSwitch
        tabs={PARITY_TABS.map((tab) => ({ ...tab, testId: `${testId}-${tab.id}` }))}
        activeTab={range.parity}
        onTabChange={(id) => onChange({ ...range, parity: id as RunParity })}
        size="sm"
        fit="hug"
      />
    </div>
  );
}

/** The left-column bulk form, under the room and aisle steps. */
export function LabelRunControls({ run, disabled }: { run: LabelRun; disabled: boolean }) {
  return (
    <div className="flex flex-col border-t border-mode-rule py-1" data-testid="label-run-controls">
      <ParityRow label={LOCATION_BAY_LABEL_PLURAL} range={run.bays} onChange={run.setBays} disabled={disabled} testId="label-run-bays" />
      <ParityRow label="Levels" range={run.levels} onChange={run.setLevels} disabled={disabled} testId="label-run-levels" />
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-mode-page py-2">
        <label className="flex w-20 cursor-pointer items-center gap-2 text-role-caption font-semibold text-text-default">
          <Checkbox
            checked={run.positions != null}
            disabled={disabled}
            onCheckedChange={(on) => run.setPositions(on === true ? SEED_POSITIONS : null)}
            data-testid="label-run-positions-toggle"
          />
          Positions
        </label>
        {run.positions ? (
          <SpanFields label="Positions" span={run.positions} onChange={run.setPositions} disabled={disabled} />
        ) : (
          <span className="text-role-caption text-text-muted">None — labels read zone · aisle · bay · level</span>
        )}
      </div>
    </div>
  );
}
