'use client';

/** The right column of a bulk run: the first ticked sticker, then one row per label with its tick on the right. */

import { LocationLabelFacePreview } from '@/components/labels/LocationLabelFacePreview';
import { Checkbox } from '@/design-system/primitives/Checkbox';
import type { ExpandedPrintRunRow } from '@/lib/locations/expand-print-run';
import { cn } from '@/utils/_cn';
import { labelFace } from './location-label-model';

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
        <p className="px-mode-page pb-4 text-role-caption text-text-muted" data-testid="label-run-empty">
          {emptyHint}
        </p>
      ) : (
        <ul className="border-t border-mode-rule" aria-label="Labels in this run">
          {rows.map((row) => {
            const on = !excluded.has(row.code);
            return (
              <li key={row.code}>
                <label
                  className="flex min-h-mode-hit-cta w-full cursor-pointer items-center justify-between gap-3 border-b border-mode-rule px-mode-page active:bg-mode-hover"
                  data-testid="label-run-row"
                >
                  <span className={cn('font-mono text-sm font-semibold tabular-nums', on ? 'text-text-default' : 'text-text-faint')}>
                    {labelFace(row.segments)}
                  </span>
                  <Checkbox className="h-6 w-6" checked={on} disabled={disabled} onCheckedChange={() => onToggle(row.code)} />
                </label>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
