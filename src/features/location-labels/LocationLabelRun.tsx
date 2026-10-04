'use client';

/**
 * A run of labels off the picked address: per bay, odd / even levels, one axis
 * (positions on a level, levels on a bay, bays on an aisle) or the parts-drawer
 * preset. Every number is a stepper or a tile; every label is a full-width
 * row that can be unticked; the first ticked sticker is previewed.
 */

import { useEffect, useMemo, useState } from 'react';
import { TabSwitch } from '@/design-system/components/TabSwitch';
import { TouchQtyStepper } from '@/design-system/components/TouchQtyStepper';
import { LOCATION_BAY_LABEL, LOCATION_BAY_LABEL_PLURAL, pad2 } from '@/lib/barcode-routing';
import {
  expandOddEvenBayLevelsPrintRun,
  expandPartsDrawersPrintRun,
  expandPrintRun,
  expandRaggedBayLevelsPrintRun,
  type ExpandedPrintRunRow,
  type PrintRunVaryAxis,
} from '@/lib/locations/expand-print-run';
import { NumberTiles } from './NumberTiles';
import { RaggedBayPicker, RunLabelList } from './LabelRunParts';

/** Seeds: a bay of five levels, an aisle of twelve bays, a level of twenty positions. */
const SEED_LEVELS = 5;
const SEED_BAYS = 12;
const SEED_POSITIONS = 20;

type RunMode = 'ragged' | 'oddEven' | 'axis' | 'parts';

export type LabelRunFreeze = {
  roomName: string;
  zoneLetter: string;
  aisle: number;
  bay?: number;
  level?: number;
  position?: number;
  /** Bay labels: position-0 codes, levels / bays only. */
  rack: boolean;
};

const VARY_LABEL: Record<PrintRunVaryAxis, string> = {
  bay: LOCATION_BAY_LABEL_PLURAL,
  level: 'Levels',
  position: 'Positions',
};

const SEED_THROUGH: Record<PrintRunVaryAxis, number> = {
  bay: SEED_BAYS,
  level: SEED_LEVELS,
  position: SEED_POSITIONS,
};

const AXIS_NOUN: Record<PrintRunVaryAxis, string> = {
  bay: LOCATION_BAY_LABEL.toLowerCase(),
  level: 'level',
  position: 'position',
};

const BAY_UNIT = [LOCATION_BAY_LABEL.toLowerCase(), LOCATION_BAY_LABEL.toLowerCase()] as const;

function varyOptions(f: LabelRunFreeze): PrintRunVaryAxis[] {
  if (f.rack) return f.bay != null ? ['level'] : [];
  const axes: PrintRunVaryAxis[] = ['bay'];
  if (f.bay != null) axes.push('level');
  if (f.bay != null && f.level != null) axes.push('position');
  return axes;
}

/** Deepest axis left open: positions on a picked level, levels on a picked bay, else bays. */
function seedAxis(f: LabelRunFreeze): PrintRunVaryAxis {
  const axes = varyOptions(f);
  return axes[axes.length - 1] ?? 'level';
}

function seedMode(f: LabelRunFreeze): RunMode {
  if (f.rack) return f.bay != null ? 'axis' : 'ragged';
  return f.bay != null ? 'axis' : 'oddEven';
}

export function LocationLabelRun({
  freeze,
  gln,
  disabled,
  onRowsChange,
}: {
  freeze: LabelRunFreeze;
  gln: string;
  disabled: boolean;
  /** The ticked labels, in print order. */
  onRowsChange: (rows: ExpandedPrintRunRow[]) => void;
}) {
  const [mode, setMode] = useState<RunMode>(() => seedMode(freeze));
  const [vary, setVary] = useState<PrintRunVaryAxis>(() => seedAxis(freeze));
  const [from, setFrom] = useState(1);
  const [through, setThrough] = useState(() => SEED_THROUGH[seedAxis(freeze)]);
  const [bayFrom, setBayFrom] = useState(1);
  const [bayThrough, setBayThrough] = useState(SEED_BAYS);
  const [oddLevels, setOddLevels] = useState(SEED_LEVELS);
  const [evenLevels, setEvenLevels] = useState(SEED_LEVELS);
  const [bayLevels, setBayLevels] = useState<Record<number, number>>({});
  const [excluded, setExcluded] = useState<ReadonlySet<string>>(() => new Set());

  // A new address starts a new run.
  const freezeKey = `${freeze.roomName}|${freeze.zoneLetter}|${freeze.aisle}|${freeze.bay}|${freeze.level}|${freeze.position}|${freeze.rack}`;
  useEffect(() => {
    const axis = seedAxis(freeze);
    setMode(seedMode(freeze));
    setVary(axis);
    setFrom(1);
    setThrough(SEED_THROUGH[axis]);
    setBayFrom(1);
    setBayThrough(SEED_BAYS);
    setOddLevels(SEED_LEVELS);
    setEvenLevels(SEED_LEVELS);
    setBayLevels({});
    setExcluded(new Set());
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reseed on the address, not on each freeze object
  }, [freezeKey]);

  const raggedBays = useMemo(
    () => Object.keys(bayLevels).map(Number).sort((a, b) => a - b),
    [bayLevels],
  );

  const rows = useMemo((): ExpandedPrintRunRow[] => {
    const { zoneLetter: zone, aisle, rack } = freeze;
    // Position lands on the face only when the address picked one.
    const pinned = !rack && freeze.position != null && freeze.position > 0 ? freeze.position : undefined;
    if (mode === 'parts' && !rack) return expandPartsDrawersPrintRun({ zone, aisle });
    if (mode === 'ragged') {
      return expandRaggedBayLevelsPrintRun({
        zone,
        aisle,
        rack,
        position: rack ? undefined : (pinned ?? 1),
        bays: raggedBays.map((bay) => ({ bay, letter: 'X', levelStart: 1, levelEnd: bayLevels[bay] })),
      });
    }
    if (mode === 'oddEven') {
      return expandOddEvenBayLevelsPrintRun({ zone, aisle, bayFrom, bayThrough, oddLevels, evenLevels, position: pinned, rack: rack || pinned == null });
    }
    const axis = rack ? 'level' : vary;
    return expandPrintRun({
      zone,
      aisle,
      bay: freeze.bay,
      level: freeze.level,
      position: pinned,
      vary: axis,
      from,
      through,
      rack: axis === 'position' ? false : rack || pinned == null,
    });
  }, [freeze, mode, vary, from, through, bayFrom, bayThrough, oddLevels, evenLevels, raggedBays, bayLevels]);

  const ticked = useMemo(() => rows.filter((row) => !excluded.has(row.code)), [rows, excluded]);
  useEffect(() => {
    onRowsChange(ticked);
  }, [ticked, onRowsChange]);

  const axes = varyOptions(freeze);
  const modes: { id: RunMode; label: string }[] = [
    { id: 'ragged', label: `Per ${LOCATION_BAY_LABEL.toLowerCase()}` },
    { id: 'oddEven', label: 'Odd / even' },
    ...(axes.length > 0 ? [{ id: 'axis' as const, label: freeze.rack ? 'Levels' : 'One axis' }] : []),
    ...(!freeze.rack ? [{ id: 'parts' as const, label: 'Parts drawers' }] : []),
  ];

  const toggleRow = (code: string) =>
    setExcluded((prev) => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      return next;
    });

  return (
    <section aria-label="Print run" className="flex flex-col" data-testid="label-run">
      <div className="px-mode-page py-2">
        <TabSwitch
          tabs={modes.map((m) => ({ ...m, testId: `label-run-mode-${m.id}` }))}
          activeTab={mode}
          onTabChange={(id) => setMode(id as RunMode)}
          scrollable
        />
      </div>

      {mode === 'ragged' ? (
        <RaggedBayPicker bayLevels={bayLevels} onChange={setBayLevels} seedLevels={SEED_LEVELS} disabled={disabled} />
      ) : null}

      {mode === 'oddEven' ? (
        <div className="flex flex-col divide-y divide-mode-rule border-y border-mode-rule">
          {[
            { label: `${LOCATION_BAY_LABEL_PLURAL} from`, value: bayFrom, set: setBayFrom, min: 1, max: bayThrough, unit: BAY_UNIT },
            { label: `${LOCATION_BAY_LABEL_PLURAL} through`, value: bayThrough, set: setBayThrough, min: bayFrom, max: 99, unit: BAY_UNIT },
            { label: 'Levels on odd bays', value: oddLevels, set: setOddLevels, min: 1, max: 99, unit: ['level', 'levels'] as const },
            { label: 'Levels on even bays', value: evenLevels, set: setEvenLevels, min: 1, max: 99, unit: ['level', 'levels'] as const },
          ].map((field) => (
            <div key={field.label} className="flex flex-col gap-1 py-2">
              <p className="px-mode-page text-role-caption font-semibold text-text-muted">{field.label}</p>
              <TouchQtyStepper
                value={field.value}
                onChange={field.set}
                min={field.min}
                max={field.max}
                unit={field.unit}
                label={field.label}
                disabled={disabled}
              />
            </div>
          ))}
        </div>
      ) : null}

      {mode === 'axis' ? (
        <div className="flex flex-col">
          {!freeze.rack && axes.length > 1 ? (
            <div className="px-mode-page py-2">
              <TabSwitch
                tabs={axes.map((axis) => ({ id: axis, label: VARY_LABEL[axis], testId: `label-run-vary-${axis}` }))}
                activeTab={vary}
                onTabChange={(id) => {
                  const axis = id as PrintRunVaryAxis;
                  setVary(axis);
                  setFrom(1);
                  setThrough(SEED_THROUGH[axis]);
                }}
              />
            </div>
          ) : null}
          <div className="flex flex-col gap-1 border-y border-mode-rule py-2">
            <p className="px-mode-page text-role-caption font-semibold text-text-muted">From</p>
            <TouchQtyStepper
              value={from}
              onChange={setFrom}
              min={1}
              max={through}
              unit={[AXIS_NOUN[freeze.rack ? 'level' : vary], AXIS_NOUN[freeze.rack ? 'level' : vary]]}
              label="Run starts at"
              disabled={disabled}
              testId="label-run-from"
            />
          </div>
          <p className="px-mode-page pt-3 text-role-caption font-semibold text-text-muted">Through</p>
          <NumberTiles
            key={`${vary}-${freezeKey}`}
            label="Run ends at"
            value={through}
            onPick={(n) => setThrough(n)}
            count={Math.max(10, SEED_THROUGH[freeze.rack ? 'level' : vary])}
            min={from}
            pad={(freeze.rack ? 'level' : vary) !== 'level'}
            disabled={disabled}
            testId="label-run-through"
          />
        </div>
      ) : null}

      {mode === 'parts' ? (
        <p className="px-mode-page py-3 text-role-caption text-text-muted">A1–A4 · B1–B48 on aisle {pad2(freeze.aisle)}.</p>
      ) : null}

      <RunLabelList
        rows={rows}
        excluded={excluded}
        onToggle={toggleRow}
        roomName={freeze.roomName}
        gln={gln}
        emptyHint={mode === 'ragged' ? 'Pick one or more bays.' : 'Set a valid from – through.'}
        disabled={disabled}
      />
    </section>
  );
}
