import { cn } from '@/utils/_cn';

/**
 * A card outline must be geometry, not shadow paint. The list raises open and
 * checked cards inside an x-clipped scrollport; inset rings are box-shadows
 * and can lose or leak the bottom/right curve at that clipping boundary.
 */
export function recordCardOutlineClass({ selected, open }: { selected: boolean; open: boolean }): string {
  return cn(
    'pointer-events-none absolute inset-0 z-30 box-border rounded-2xl border border-transparent',
    selected
      ? 'border-2 border-fill-info'
      : open
        ? 'border-border-strong'
        : 'group-hover/card:border-border-soft',
  );
}
