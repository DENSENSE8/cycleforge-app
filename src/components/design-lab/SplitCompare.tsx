'use client';

/**
 * Two same-origin iframes of one route — the un-reskinned tokens on the left,
 * the CURRENT group selection on the right.
 *
 * The right pane follows what the HUD has live rather than forcing every group,
 * because the selection is the thing under judgement: flipping `rules` alone and
 * then splitting should compare today against `rules`, not against all nine. An
 * empty selection falls back to every group, so a split opened from a fresh
 * sitting still shows something.
 *
 * The frames read their selection off the URL and, per the boot script's
 * top-frame check, never write it back into the tab's sessionStorage — so
 * opening a split does not silently flip the skin of the lab tab hosting it.
 *
 * A viewport width control is here because a reskin fails first where space is
 * tight: two half-width frames already misrepresent a desk table, and the
 * narrow preset is the only honest way to look at `/m/*` from a laptop.
 */

import { useEffect, useState } from 'react';
import { cn } from '@/utils/_cn';
import { Button } from '@/components/ui/button';
import { RESKIN_GROUP_IDS, type ReskinGroupId } from '@/design-system/themes/reskin';
import { readReskinPreference, withReskinParam } from '@/lib/theme/reskin';

const WIDTHS = [
  { id: 'fill', label: 'Fill', px: null },
  { id: 'desk', label: 'Desk 1280', px: 1280 },
  { id: 'tablet', label: 'Tablet 768', px: 768 },
  { id: 'phone', label: 'Phone 390', px: 390 },
] as const;

type WidthId = (typeof WIDTHS)[number]['id'];

export function SplitCompare({ route }: { route: string }) {
  const [width, setWidth] = useState<WidthId>('fill');
  const [stacked, setStacked] = useState(false);
  const [selection, setSelection] = useState<readonly ReskinGroupId[]>(RESKIN_GROUP_IDS);
  const px = WIDTHS.find((w) => w.id === width)?.px ?? null;

  // Read once on mount: the split is a snapshot of the sitting you opened it
  // from. Re-reading on every render would make the frames reload under the
  // pointer each time the HUD is touched.
  useEffect(() => {
    const live = readReskinPreference();
    setSelection(live.length > 0 ? live : RESKIN_GROUP_IDS);
  }, []);

  const afterLabel =
    selection.length === RESKIN_GROUP_IDS.length
      ? 'After · all groups'
      : `After · ${selection.join(', ')}`;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex flex-wrap items-center gap-1.5 border-b border-border-soft bg-surface-card px-4 py-2">
        {WIDTHS.map((w) => (
          <Button
            key={w.id}
            variant={width === w.id ? 'active' : 'outline'}
            size="sm"
            onClick={() => setWidth(w.id)}
            aria-pressed={width === w.id}
          >
            {w.label}
          </Button>
        ))}
        <span className="mx-1 h-4 w-px bg-border-soft" aria-hidden />
        <Button
          variant={stacked ? 'active' : 'outline'}
          size="sm"
          onClick={() => setStacked((value) => !value)}
          aria-pressed={stacked}
        >
          Stack
        </Button>
      </div>

      <div className={cn('grid min-h-0 flex-1 gap-px bg-border-soft', stacked ? 'grid-rows-2' : 'grid-cols-2')}>
        <Pane label="Before" route={route} selection={[]} widthPx={px} />
        <Pane label={afterLabel} route={route} selection={selection} widthPx={px} />
      </div>
    </div>
  );
}

function Pane({
  label,
  route,
  selection,
  widthPx,
}: {
  label: string;
  route: string;
  selection: readonly ReskinGroupId[];
  widthPx: number | null;
}) {
  const src = withReskinParam(route, selection);
  return (
    <section className="flex min-h-0 min-w-0 flex-col bg-surface-canvas">
      <div className="flex items-center justify-between px-3 py-1.5">
        <span className="text-role-eyebrow font-semibold uppercase tracking-wide text-text-faint">
          {label}
        </span>
        <Button variant="ghost" size="sm" asChild>
          <a href={src} target="_blank" rel="noreferrer">
            Open ↗
          </a>
        </Button>
      </div>
      <div className="flex min-h-0 flex-1 justify-center overflow-auto">
        <iframe
          key={src}
          src={src}
          title={`${label} — ${route}`}
          className="h-full w-full border-0 bg-surface-card"
          style={widthPx ? { width: `${widthPx}px`, flex: '0 0 auto' } : undefined}
        />
      </div>
    </section>
  );
}
