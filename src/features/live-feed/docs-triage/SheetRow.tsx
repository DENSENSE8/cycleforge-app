'use client';

/**
 * One selectable row of the docs sheet's work column — a document on file, a
 * suggestion, a library search result. Pressing it shows that document in the
 * viewer; it never links or opens anything by itself. Verbs sit beside the
 * row (`aside`), never inside its press target.
 */

import type { ReactNode } from 'react';
import { FileText } from 'lucide-react';
import { focusRing } from '@/design-system/tokens/focus-ring';
import { cn } from '@/utils/_cn';

/** A portrait thumbnail: the library's stored thumbnail, else a document glyph. */
export function SheetThumb({ src, alt }: { src?: string | null; alt: string }) {
  return (
    <span className="flex h-10 w-8 shrink-0 items-center justify-center overflow-hidden rounded border border-border-hairline bg-surface-sunken">
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element -- stored library thumbnail (blob URL), not a Next-optimizable asset
        <img src={src} alt={alt} className="size-full object-cover" loading="lazy" />
      ) : (
        <FileText className="size-4 text-text-faint" aria-hidden />
      )}
    </span>
  );
}

export function SheetRow({
  selected,
  onSelect,
  title,
  meta,
  thumb,
  aside,
  testId,
}: {
  selected: boolean;
  onSelect: () => void;
  title: string;
  meta?: ReactNode;
  thumb?: ReactNode;
  aside?: ReactNode;
  testId: string;
}) {
  return (
    <li
      className={cn('flex min-w-0 items-center gap-2 rounded-lg px-1.5 transition-colors', selected ? 'bg-surface-selected' : 'hover:bg-surface-hover')}
      data-testid={testId}
      data-selected={selected ? 'true' : 'false'}
    >
      {/* ds-raw-button: a full-row two-line press target (thumb · title · meta) that selects for the viewer — Button is a one-line face. */}
      <button
        type="button"
        aria-pressed={selected}
        onClick={onSelect}
        className={cn('ds-raw-button flex min-w-0 flex-1 items-center gap-2 rounded-md py-1.5 text-left', focusRing('control'))}
      >
        {thumb}
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="min-w-0 truncate text-role-data font-medium text-text-default" title={title}>
            {title}
          </span>
          {meta ? <span className="flex min-w-0 items-center gap-1.5 truncate text-role-caption text-text-muted">{meta}</span> : null}
        </span>
      </button>
      {aside ? <span className="flex shrink-0 items-center gap-1">{aside}</span> : null}
    </li>
  );
}
