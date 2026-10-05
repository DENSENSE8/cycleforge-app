'use client';

import type { NavLocateBucket, NavLocateResponse } from '@/lib/nav/context/schema';
import { focusRing } from '@/design-system/tokens/focus-ring';
import { SIDEBAR_CONTROL_CORNER } from '@/design-system/tokens/radius';
import { cn } from '@/utils/_cn';
import { NAV_CHOICE_SELECTED_CLASS } from './nav-block';
import { NAV_LOCATE_TONE_VAR } from './nav-locate-tone';
import type { PageFind } from './NavFind';

/**
 * Where the field's text lives in the section: one pill per bucket that
 * holds matches (glyph dot · label · count), the list on screen pressed in.
 * A click opens that bucket's list with the text kept as its Find.
 */
export function NavLocatePills({
  answer,
  current,
  text,
  find,
}: {
  answer: NavLocateResponse | undefined;
  current: string | undefined;
  text: string;
  find: PageFind;
}) {
  const buckets = answer?.buckets.filter((bucket) => bucket.count > 0) ?? [];
  return (
    <div data-nav-locate-pills className="flex min-w-0 flex-wrap items-center gap-1 px-1 py-0.5">
      {!answer ? (
        <span className="text-role-caption text-text-faint">Locating…</span>
      ) : buckets.length === 0 ? (
        <span className="text-role-caption text-text-faint">Nowhere in this section</span>
      ) : (
        buckets.map((bucket) => (
          // ds-raw-button: a locate pill in the find panel (tone dot · label · count, pressed when its list is on screen) — the sidebar control face, no Button variant paints it.
          <button
            key={bucket.id}
            type="button"
            data-nav-locate-pill={bucket.id}
            disabled={!bucket.href}
            aria-current={bucket.id === current ? 'true' : undefined}
            onClick={() => {
              if (bucket.href) find.open(bucket.href, text);
            }}
            className={cn(
              'ds-raw-button inline-flex h-6 min-w-0 items-center gap-1.5 bg-surface-card px-2 text-role-caption font-medium text-text-default ring-1 ring-inset ring-border-hairline',
              'hover:bg-surface-sunken active:translate-y-px disabled:cursor-default',
              bucket.id === current && NAV_CHOICE_SELECTED_CLASS,
              SIDEBAR_CONTROL_CORNER,
              focusRing('control', 'accent'),
            )}
          >
            <span aria-hidden className="size-1.5 shrink-0 rounded-full" style={{ background: NAV_LOCATE_TONE_VAR[bucket.tone] }} />
            <span className="truncate">{bucket.label}</span>
            <span className="tabular-nums text-text-muted">{bucket.count}</span>
          </button>
        ))
      )}
    </div>
  );
}

/** The bucket whose list is on screen: same pathname, every defining param present — the most specific wins. */
export function currentBucketId(
  buckets: readonly NavLocateBucket[],
  pathname: string,
  params: Pick<URLSearchParams, 'get'> | null,
): string | undefined {
  let best: { id: string; specificity: number } | undefined;
  for (const bucket of buckets) {
    if (!bucket.href) continue;
    const url = new URL(bucket.href, 'http://x');
    if (url.pathname !== pathname) continue;
    const defining = [...url.searchParams.entries()];
    if (!defining.every(([key, value]) => params?.get(key) === value)) continue;
    if (!best || defining.length > best.specificity) best = { id: bucket.id, specificity: defining.length };
  }
  return best?.id;
}
