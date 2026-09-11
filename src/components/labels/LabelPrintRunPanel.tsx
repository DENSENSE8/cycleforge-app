'use client';

/**
 * Inline print-run panel — freeze breadcrumb, preview faces on the page.
 * StickyActionBar owns Print; this surface only expands + selects faces.
 *
 * Modes:
 * - ragged — selected bays 1–16 × per-bay level N (Racks + Labels)
 * - odd/even — bay range × levels-per-bay by parity (odd=10, even=6, …)
 * - axis — vary one segment from–through (level / position / single-level bays)
 * - parts — A1–A4 · B1–B48 preset
 *
 * Callers: BinLabelPrinter, RackLabelPrinter. User: inline Labels print-run plan.
 */

import { useEffect, useMemo, useState } from 'react';
import { LocationLabelFacePreview } from '@/components/labels/LocationLabelFacePreview';
import { LabelPrintRunNumField } from '@/components/labels/LabelPrintRunNumField';
import { Button, Checkbox } from '@/design-system/primitives';
import {
  bayHand,
  formatLocationBayFace,
  LOCATION_BAY_LABEL_PLURAL,
  pad2,
} from '@/lib/barcode-routing';
import {
  expandOddEvenBayLevelsPrintRun,
  expandPartsDrawersPrintRun,
  expandPrintRun,
  expandRaggedBayLevelsPrintRun,
  type ExpandedPrintRunRow,
  type PrintRunVaryAxis,
} from '@/lib/locations/expand-print-run';
import { focusRing } from '@/design-system/tokens/focus-ring';
import { cornerClass } from '@/design-system/tokens/radius';
import { cn } from '@/utils/_cn';

/** Dense tile sticker scale — host width still clamps; this stops blow-up. */
const RUN_FACE_MAX_SCALE = 1.05;
/** Product cap for ragged bay chips (D3). Picker maxBays is a separate default. */
const RAGGED_BAY_CAP = 16;

function raggedParityBays(parity: 'odd' | 'even'): number[] {
  return Array.from({ length: RAGGED_BAY_CAP }, (_, i) => i + 1).filter((bay) =>
    parity === 'odd' ? bay % 2 === 1 : bay % 2 === 0,
  );
}

type RunMode = 'ragged' | 'oddEven' | 'axis' | 'parts';

export type LabelPrintRunFreeze = {
  roomName: string;
  zoneLetter: string;
  aisle: number;
  bay?: number | null;
  level?: number | null;
  position?: number | null;
  /** Rack printer — position 0 codes. */
  rack?: boolean;
};

export type LabelPrintRunPanelProps = {
  freeze: LabelPrintRunFreeze;
  /** Initial one-axis vary when mode is axis. */
  seedVary: PrintRunVaryAxis;
  /** Default through for one-axis mode. */
  seedThrough: number;
  /** Default bay through for odd/even mode. */
  seedMaxBays?: number;
  /** Default levels on odd bays. */
  seedOddLevels?: number;
  /** Default levels on even bays. */
  seedEvenLevels?: number;
  gln: string;
  /** Show Parts A1–A4 · B1–B48 chip (bins / aisle only). */
  showPartsPreset?: boolean;
  printing?: boolean;
  /** Lift selected faces to StickyActionBar Print N. */
  onSelectionChange?: (rows: ExpandedPrintRunRow[]) => void;
  /** Standing-in-aisle ack (D1). Default false; freeze change must clear it. */
  onAckChange?: (acked: boolean) => void;
};

const VARY_LABEL: Record<PrintRunVaryAxis, string> = {
  bay: LOCATION_BAY_LABEL_PLURAL,
  level: 'Levels',
  position: 'Positions',
};

function clamp1to99(n: number): number {
  if (!Number.isFinite(n)) return 1;
  return Math.max(1, Math.min(99, Math.floor(n)));
}

function freezeTitle(f: LabelPrintRunFreeze): string {
  const parts = [f.roomName, f.zoneLetter, `Aisle ${pad2(f.aisle)}`];
  if (f.bay != null) parts.push(formatLocationBayFace(f.bay));
  if (f.level != null) parts.push(`Level ${f.level}`);
  if (!f.rack && f.position != null && f.position > 0) {
    parts.push(`Pos ${pad2(f.position)}`);
  }
  return parts.join(' · ');
}

function seedMode(seedVary: PrintRunVaryAxis, rack?: boolean): RunMode {
  if (rack) {
    if (seedVary === 'level') return 'axis';
    return 'ragged';
  }
  if (seedVary === 'bay') return 'oddEven';
  return 'axis';
}

export function LabelPrintRunPanel({
  freeze,
  seedVary,
  seedThrough,
  seedMaxBays = 16,
  seedOddLevels,
  seedEvenLevels,
  gln,
  showPartsPreset = false,
  printing = false,
  onSelectionChange,
  onAckChange,
}: LabelPrintRunPanelProps) {
  const [mode, setMode] = useState<RunMode>(() => seedMode(seedVary, freeze.rack));
  const [vary, setVary] = useState<PrintRunVaryAxis>(seedVary);
  const [from, setFrom] = useState(1);
  const [through, setThrough] = useState(clamp1to99(seedThrough));
  const [bayFrom, setBayFrom] = useState(1);
  const [bayThrough, setBayThrough] = useState(clamp1to99(seedMaxBays));
  const [oddLevels, setOddLevels] = useState(clamp1to99(seedOddLevels ?? seedThrough));
  const [evenLevels, setEvenLevels] = useState(clamp1to99(seedEvenLevels ?? seedThrough));
  const [selectedBays, setSelectedBays] = useState<number[]>([]);
  const [bayLevels, setBayLevels] = useState<Record<number, number>>({});
  const [acked, setAcked] = useState(false);
  const [excluded, setExcluded] = useState<Set<string>>(() => new Set());

  useEffect(() => {
    const nextMode = seedMode(seedVary, freeze.rack);
    setMode(nextMode);
    setVary(freeze.rack ? 'level' : seedVary);
    setFrom(1);
    setThrough(clamp1to99(seedThrough));
    setBayFrom(1);
    setBayThrough(clamp1to99(seedMaxBays));
    setOddLevels(clamp1to99(seedOddLevels ?? seedThrough));
    setEvenLevels(clamp1to99(seedEvenLevels ?? seedThrough));
    setSelectedBays([]);
    setBayLevels({});
    setAcked(false);
    setExcluded(new Set());
  }, [
    freeze.roomName,
    freeze.zoneLetter,
    freeze.aisle,
    freeze.bay,
    freeze.level,
    freeze.position,
    freeze.rack,
    seedVary,
    seedThrough,
    seedMaxBays,
    seedOddLevels,
    seedEvenLevels,
  ]);

  useEffect(() => {
    onAckChange?.(acked);
  }, [acked, onAckChange]);

  const raggedBaysSorted = useMemo(
    () => [...selectedBays].sort((a, b) => a - b),
    [selectedBays],
  );
  const raggedLevelDefault = clamp1to99(seedOddLevels ?? seedThrough);
  const copyDownLevels =
    raggedBaysSorted[0] != null
      ? clamp1to99(bayLevels[raggedBaysSorted[0]] ?? raggedLevelDefault)
      : raggedLevelDefault;

  const rows = useMemo((): ExpandedPrintRunRow[] => {
    if (mode === 'parts' && !freeze.rack) {
      return expandPartsDrawersPrintRun({
        zone: freeze.zoneLetter,
        aisle: freeze.aisle,
      });
    }
    // Position only lands on face + QR when the builder actually picked one.
    const positionPinned = freeze.position != null && freeze.position > 0;
    const omitPosition = freeze.rack || !positionPinned;

    if (mode === 'ragged') {
      return expandRaggedBayLevelsPrintRun({
        zone: freeze.zoneLetter,
        aisle: freeze.aisle,
        rack: !!freeze.rack,
        position: freeze.rack ? undefined : positionPinned ? freeze.position! : 1,
        bays: raggedBaysSorted.map((bay) => ({
          bay,
          letter: 'X',
          levelStart: 1,
          levelEnd: clamp1to99(bayLevels[bay] ?? raggedLevelDefault),
        })),
      });
    }

    if (mode === 'oddEven') {
      return expandOddEvenBayLevelsPrintRun({
        zone: freeze.zoneLetter,
        aisle: freeze.aisle,
        bayFrom,
        bayThrough,
        oddLevels,
        evenLevels,
        position: positionPinned ? freeze.position! : undefined,
        rack: omitPosition,
      });
    }
    const varyAxis = freeze.rack ? 'level' : vary;
    return expandPrintRun({
      zone: freeze.zoneLetter,
      aisle: freeze.aisle,
      bay: freeze.bay ?? undefined,
      level: freeze.level ?? undefined,
      position: positionPinned ? freeze.position! : undefined,
      vary: varyAxis,
      from,
      through,
      rack: varyAxis === 'position' ? false : omitPosition,
    });
  }, [
    freeze,
    mode,
    vary,
    from,
    through,
    bayFrom,
    bayThrough,
    oddLevels,
    evenLevels,
    raggedBaysSorted,
    bayLevels,
    raggedLevelDefault,
    seedThrough,
  ]);

  const selected = useMemo(
    () => rows.filter((r) => !excluded.has(r.code)),
    [rows, excluded],
  );

  useEffect(() => {
    onSelectionChange?.(selected);
  }, [selected, onSelectionChange]);

  const canVaryBay = !freeze.rack && freeze.aisle != null;
  const canVaryLevel = freeze.bay != null;
  const canVaryPosition = !freeze.rack && freeze.bay != null && freeze.level != null;

  const toggleExcluded = (code: string) => {
    setExcluded((prev) => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      return next;
    });
  };

  const toggleRaggedBay = (bay: number) => {
    setSelectedBays((prev) => {
      if (prev.includes(bay)) return prev.filter((b) => b !== bay);
      return [...prev, bay];
    });
    setBayLevels((prev) =>
      prev[bay] != null ? prev : { ...prev, [bay]: raggedLevelDefault },
    );
  };

  const applyRaggedParity = (parity: 'odd' | 'even') => {
    const group = raggedParityBays(parity);
    const allOn = group.every((bay) => selectedBays.includes(bay));
    setSelectedBays((prev) => {
      if (allOn) return prev.filter((bay) => !group.includes(bay));
      return [...new Set([...prev, ...group])];
    });
    if (allOn) return;
    setBayLevels((prev) => {
      const next = { ...prev };
      for (const bay of group) {
        if (next[bay] == null) next[bay] = raggedLevelDefault;
      }
      return next;
    });
  };

  const copyDownSelected = () => {
    const n = copyDownLevels;
    setBayLevels((prev) => {
      const next = { ...prev };
      for (const bay of raggedBaysSorted) next[bay] = n;
      return next;
    });
  };

  const varyOptions: PrintRunVaryAxis[] = freeze.rack
    ? ['level']
    : (
        [
          canVaryBay ? 'bay' : null,
          canVaryLevel ? 'level' : null,
          canVaryPosition ? 'position' : null,
        ] as (PrintRunVaryAxis | null)[]
      ).filter((v): v is PrintRunVaryAxis => v != null);

  const modeChips: { id: RunMode; label: string; show: boolean }[] = [
    { id: 'ragged', label: 'Per bay', show: true },
    { id: 'oddEven', label: 'Odd / even levels', show: true },
    {
      id: 'axis',
      label: freeze.rack ? 'Levels on bay' : 'One axis',
      show: freeze.rack ? freeze.bay != null : varyOptions.length > 0,
    },
    {
      id: 'parts',
      label: 'Parts drawers',
      show: !!showPartsPreset && !freeze.rack,
    },
  ];

  const singleFace = selected.length === 1 && rows.length === 1;

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2">
      <div className="shrink-0 stack-tight">
        <p className="text-role-micro font-semibold uppercase tracking-[0.16em] text-text-faint">
          Print run · live faces
        </p>
        <p className="text-role-micro tabular-nums text-text-soft">{freezeTitle(freeze)}</p>

        {freeze.rack ? (
          <label className="flex items-center gap-1.5 text-role-micro text-text-default">
            <Checkbox
              checked={acked}
              disabled={printing}
              onCheckedChange={(value) => setAcked(value === true)}
            />
            I am standing in this room and aisle
          </label>
        ) : null}

        <div className="flex flex-wrap gap-1">
          {modeChips
            .filter((c) => c.show)
            .map((chip) => (
              <button
                key={chip.id}
                type="button"
                disabled={printing}
                onClick={() => setMode(chip.id)}
                className={cn(
                  'h-7 px-2 text-role-micro font-semibold transition-colors',
                  cornerClass('control'),
                  focusRing('control'),
                  mode === chip.id
                    ? 'border border-blue-600 bg-blue-600 text-white'
                    : 'border border-border-soft bg-surface-card text-text-muted hover:bg-surface-hover',
                )}
              >
                {chip.label}
              </button>
            ))}
        </div>

        {mode === 'ragged' ? (
          <div className="stack-tight">
            <div className="flex flex-wrap items-center gap-1">
              <Button
                type="button"
                variant={
                  raggedParityBays('odd').every((bay) => selectedBays.includes(bay))
                    ? 'primary'
                    : 'ghost'
                }
                size="sm"
                radius="flush"
                disabled={printing}
                aria-pressed={raggedParityBays('odd').every((bay) => selectedBays.includes(bay))}
                ariaLabel={`Select odd bays (${bayHand(1)})`}
                onClick={() => applyRaggedParity('odd')}
              >
                Odds
              </Button>
              <Button
                type="button"
                variant={
                  raggedParityBays('even').every((bay) => selectedBays.includes(bay))
                    ? 'primary'
                    : 'ghost'
                }
                size="sm"
                radius="flush"
                disabled={printing}
                aria-pressed={raggedParityBays('even').every((bay) => selectedBays.includes(bay))}
                ariaLabel={`Select even bays (${bayHand(2)})`}
                onClick={() => applyRaggedParity('even')}
              >
                Evens
              </Button>
            </div>
            <div className="flex flex-wrap gap-1">
              {Array.from({ length: RAGGED_BAY_CAP }, (_, i) => i + 1).map((bay) => {
                const on = selectedBays.includes(bay);
                return (
                  <button
                    key={bay}
                    type="button"
                    disabled={printing}
                    title={formatLocationBayFace(bay)}
                    aria-pressed={on}
                    onClick={() => toggleRaggedBay(bay)}
                    className={cn(
                      'h-7 px-2 text-role-micro font-semibold tabular-nums transition-colors',
                      cornerClass('control'),
                      focusRing('control'),
                      on
                        ? 'border border-blue-600 bg-blue-600 text-white'
                        : 'border border-border-soft bg-surface-card text-text-muted hover:bg-surface-hover',
                    )}
                  >
                    {formatLocationBayFace(bay)}
                  </button>
                );
              })}
            </div>
            {raggedBaysSorted.length > 0 ? (
              <div className="flex flex-wrap items-end gap-2">
                {raggedBaysSorted.map((bay) => (
                  <LabelPrintRunNumField
                    key={bay}
                    label={`Bay ${pad2(bay)} lv`}
                    value={clamp1to99(bayLevels[bay] ?? raggedLevelDefault)}
                    disabled={printing}
                    onChange={(n) =>
                      setBayLevels((prev) => ({ ...prev, [bay]: clamp1to99(n) }))
                    }
                  />
                ))}
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  radius="flush"
                  disabled={printing || raggedBaysSorted.length < 2}
                  onClick={copyDownSelected}
                >
                  Copy {copyDownLevels} levels down
                </Button>
                <p className="pb-1.5 text-role-micro tabular-nums text-text-soft">
                  {selected.length}/{rows.length}
                </p>
              </div>
            ) : (
              <p className="text-role-micro text-text-soft">
                Select bays, then set levels (default {raggedLevelDefault}).
              </p>
            )}
          </div>
        ) : null}

        {mode === 'oddEven' ? (
          <div className="flex flex-wrap items-end gap-2">
            <LabelPrintRunNumField
              label="Bay from"
              value={bayFrom}
              max={bayThrough}
              disabled={printing}
              onChange={setBayFrom}
            />
            <LabelPrintRunNumField
              label="Bay through"
              value={bayThrough}
              min={bayFrom}
              disabled={printing}
              onChange={setBayThrough}
            />
            <LabelPrintRunNumField label="Odd levels" value={oddLevels} disabled={printing} onChange={setOddLevels} />
            <LabelPrintRunNumField label="Even levels" value={evenLevels} disabled={printing} onChange={setEvenLevels} />
            <p className="pb-1.5 text-role-micro tabular-nums text-text-soft">
              {selected.length}/{rows.length}
            </p>
          </div>
        ) : null}

        {mode === 'axis' ? (
          <div className="flex flex-wrap items-end gap-2">
            {!freeze.rack && varyOptions.length > 1 ? (
              <div className="min-w-[10rem] flex-1">
                <span className="text-role-micro font-semibold uppercase tracking-wider text-text-soft">
                  Vary
                </span>
                <div className="mt-0.5 flex flex-wrap gap-1">
                  {varyOptions.map((axis) => (
                    <button
                      key={axis}
                      type="button"
                      disabled={printing}
                      onClick={() => setVary(axis)}
                      className={cn(
                        'h-7 px-2 text-role-micro font-semibold transition-colors',
                        cornerClass('control'),
                        focusRing('control'),
                        vary === axis
                          ? 'border border-blue-600 bg-blue-600 text-white'
                          : 'border border-border-soft bg-surface-card text-text-muted hover:bg-surface-hover',
                      )}
                    >
                      {VARY_LABEL[axis]}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
            <LabelPrintRunNumField
              label="From"
              value={from}
              max={through}
              disabled={printing}
              onChange={setFrom}
            />
            <LabelPrintRunNumField
              label="Through"
              value={through}
              min={from}
              disabled={printing}
              onChange={setThrough}
            />
            <p className="pb-1.5 text-role-micro tabular-nums text-text-soft">
              {selected.length}/{rows.length}
            </p>
          </div>
        ) : null}

        {mode === 'parts' ? (
          <p className="text-role-micro text-text-soft">
            A1–A4 · B1–B48 on this aisle · {selected.length}/{rows.length} faces
          </p>
        ) : null}
      </div>

      <div className="min-h-0 max-h-[min(50vh,28rem)] flex-1 overflow-y-auto overscroll-contain">
        <div
          className={cn(
            'grid gap-1.5',
            singleFace
              ? 'grid-cols-1'
              : 'grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5',
          )}
        >
          {rows.map((row) => {
            const on = !excluded.has(row.code);
            return (
              <label
                key={row.code}
                className={cn(
                  'flex cursor-pointer flex-col gap-1 border p-1.5 transition-opacity',
                  cornerClass('surface'),
                  on
                    ? 'border-border-soft bg-surface-card'
                    : 'border-border-hairline bg-surface-canvas opacity-50',
                )}
              >
                <span className="flex items-center gap-1.5">
                  <input
                    type="checkbox"
                    checked={on}
                    disabled={printing}
                    onChange={() => toggleExcluded(row.code)}
                    className="h-3.5 w-3.5 shrink-0 accent-blue-600"
                  />
                  <span className="truncate font-mono text-role-micro font-semibold tabular-nums text-text-default">
                    {row.code}
                  </span>
                </span>
                {on ? (
                  <LocationLabelFacePreview
                    segments={row.segments}
                    roomName={freeze.roomName}
                    gln={gln}
                    fit={singleFace ? 'host' : 'capped'}
                    maxScale={singleFace ? undefined : RUN_FACE_MAX_SCALE}
                  />
                ) : null}
              </label>
            );
          })}
          {rows.length === 0 ? (
            <p className="col-span-full py-6 text-center text-role-caption text-text-soft">
              {mode === 'ragged'
                ? 'Select one or more bays and set levels.'
                : mode === 'oddEven'
                  ? 'Set bay from–through and odd/even level counts.'
                  : 'Pick a valid from–through on a frozen bay or level.'}
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}

