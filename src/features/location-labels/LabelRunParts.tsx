'use client';

/** Leaf parts of `LocationLabelRun`: the per-bay picker and the ticked label list. */

import { LocationLabelFacePreview } from '@/components/labels/LocationLabelFacePreview';
import { TouchQtyStepper } from '@/design-system/components/TouchQtyStepper';
import { Button } from '@/design-system/primitives/Button';
import { Checkbox } from '@/design-system/primitives/Checkbox';
import { formatLocationBayFace, LOCATION_BAY_LABEL, LOCATION_BAY_LABEL_PLURAL, pad2 } from '@/lib/barcode-routing';
import type { ExpandedPrintRunRow } from '@/lib/locations/expand-print-run';
import { cn } from '@/utils/_cn';
import { labelFace } from './location-label-model';

/** Ragged runs offer this many bays. */
const RAGGED_BAY_CAP = 16;
const BAYS = Array.from({ length: RAGGED_BAY_CAP }, (_, i) => i + 1);

const parityBays = (parity: 'odd' | 'even') => BAYS.filter((bay) => (bay % 2 === 1) === (parity === 'odd'));

/** Per bay: tap the bays (or a whole side), then each picked bay's level count. */
export function RaggedBayPicker({
  bayLevels,
  onChange,
  seedLevels,
  disabled,
}: {
  /** Picked bay → its level count. */
  bayLevels: Readonly<Record<number, number>>;
  onChange: (next: Record<number, number>) => void;
  seedLevels: number;
  disabled: boolean;
}) {
  const picked = Object.keys(bayLevels).map(Number).sort((a, b) => a - b);
  const toggleBay = (bay: number) => {
    const next = { ...bayLevels };
    if (bay in next) delete next[bay];
    else next[bay] = seedLevels;
    onChange(next);
  };
  const toggleParity = (parity: 'odd' | 'even') => {
    const group = parityBays(parity);
    const allOn = group.every((bay) => bay in bayLevels);
    const next = { ...bayLevels };
    for (const bay of group) {
      if (allOn) delete next[bay];
      else next[bay] ??= seedLevels;
    }
    onChange(next);
  };
  return (
    <div className="flex flex-col gap-3 py-2">
      <div className="grid grid-cols-2 gap-2 px-mode-page">
        {(['odd', 'even'] as const).map((parity) => {
          const on = parityBays(parity).every((bay) => bay in bayLevels);
          return (
            <Button
              key={parity}
              variant={on ? 'primary' : 'secondary'}
              size="lg"
              radius="surface"
              className="min-h-mode-hit-cta"
              aria-pressed={on}
              disabled={disabled}
              onClick={() => toggleParity(parity)}
            >
              {parity === 'odd' ? 'Odd (left)' : 'Even (right)'}
            </Button>
          );
        })}
      </div>
      <div role="group" aria-label={LOCATION_BAY_LABEL_PLURAL} className="grid grid-cols-4 gap-2 px-mode-page">
        {BAYS.map((bay) => (
          <Button
            key={bay}
            variant={bay in bayLevels ? 'primary' : 'secondary'}
            size="lg"
            radius="surface"
            className="min-h-mode-hit-cta px-0 font-mono tabular-nums"
            aria-pressed={bay in bayLevels}
            ariaLabel={formatLocationBayFace(bay)}
            disabled={disabled}
            onClick={() => toggleBay(bay)}
          >
            {pad2(bay)}
          </Button>
        ))}
      </div>
      {picked.length === 0 ? (
        <p className="px-mode-page text-role-caption text-text-muted">Tap the bays to label, then set each bay&apos;s levels.</p>
      ) : (
        <div className="flex flex-col divide-y divide-mode-rule border-y border-mode-rule">
          {picked.map((bay) => (
            <div key={bay} className="flex flex-col gap-1 py-2">
              <p className="px-mode-page text-role-caption font-semibold text-text-muted">{formatLocationBayFace(bay)}</p>
              <TouchQtyStepper
                value={bayLevels[bay]}
                onChange={(n) => onChange({ ...bayLevels, [bay]: n })}
                min={1}
                max={99}
                unit={['level', 'levels']}
                label={`${formatLocationBayFace(bay)} levels`}
                disabled={disabled}
              />
            </div>
          ))}
          {picked.length > 1 ? (
            <div className="px-mode-page py-2">
              <Button
                variant="secondary"
                size="lg"
                radius="surface"
                className="min-h-mode-hit-cta w-full"
                disabled={disabled}
                onClick={() => onChange(Object.fromEntries(picked.map((bay) => [bay, bayLevels[picked[0]]])))}
              >
                {`Give every ${LOCATION_BAY_LABEL.toLowerCase()} ${bayLevels[picked[0]]} levels`}
              </Button>
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}

/** The run's labels: count, the first ticked sticker previewed, and one tick row per label. */
export function RunLabelList({
  rows,
  excluded,
  onToggle,
  roomName,
  gln,
  emptyHint,
  disabled,
}: {
  rows: readonly ExpandedPrintRunRow[];
  excluded: ReadonlySet<string>;
  onToggle: (code: string) => void;
  roomName: string;
  gln: string;
  emptyHint: string;
  disabled: boolean;
}) {
  const ticked = rows.filter((row) => !excluded.has(row.code));
  const first = ticked[0] ?? null;
  return (
    <>
      <div className="flex items-baseline justify-between px-mode-page pb-2 pt-4">
        <h3 className="text-sm font-semibold text-text-default">Labels</h3>
        <p className="text-role-caption font-semibold tabular-nums text-text-muted" data-testid="label-run-count">
          {ticked.length} of {rows.length}
        </p>
      </div>
      {first ? (
        <div className="px-mode-page pb-3" data-testid="label-run-preview">
          <LocationLabelFacePreview segments={first.segments} roomName={roomName} gln={gln} fit="host" />
        </div>
      ) : null}
      {rows.length === 0 ? (
        <p className="px-mode-page pb-4 text-role-caption text-text-muted">{emptyHint}</p>
      ) : (
        <ul className="border-t border-mode-rule" aria-label="Labels in this run">
          {rows.map((row) => {
            const on = !excluded.has(row.code);
            return (
              <li key={row.code}>
                <label
                  className="flex min-h-mode-hit-cta w-full cursor-pointer items-center gap-3 border-b border-mode-rule px-mode-page active:bg-mode-hover"
                  data-testid="label-run-row"
                >
                  <Checkbox className="h-6 w-6" checked={on} disabled={disabled} onCheckedChange={() => onToggle(row.code)} />
                  <span className={cn('font-mono text-sm font-semibold tabular-nums', on ? 'text-text-default' : 'text-text-faint')}>
                    {labelFace(row.segments)}
                  </span>
                </label>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
