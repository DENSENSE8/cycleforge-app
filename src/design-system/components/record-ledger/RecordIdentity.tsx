'use client';

import { ExternalLink } from '@/components/Icons';
import { BrandIdentityDot } from '@/components/ui/grid-cells';
import { platformMetaBrandDot } from '@/lib/source-platform';
import type { PlatformDisplay } from '@/lib/platform-display';
import { RECORD_ID_CLASS, RECORD_LABEL_CLASS } from '../../tokens/industrial-record';
import { focusRing } from '../../tokens/focus-ring';
import { RECORD_HIT_CLASS } from './record-ledger-geometry';
import { cn } from '@/utils/_cn';

/** The To-ship channel face, shared with receiving: catalog dot + compact account label. */
export function RecordPlatformFace({ channel }: { channel: PlatformDisplay }) {
  return (
    <span className="inline-flex w-24 shrink-0 items-center gap-1.5" data-testid="record-platform">
      <BrandIdentityDot {...platformMetaBrandDot(channel.meta)} />
      <span className={cn(RECORD_LABEL_CLASS, 'truncate text-mode-muted')} title={channel.connectionName ?? channel.label}>
        {channel.shortLabel || '—'}
      </span>
    </span>
  );
}

/** Shared To-ship listing face. Full item identity in value mode, never opens the record. */
export function RecordListingLink({ href, itemNumber, face = 'row' }: {
  href: string | null;
  itemNumber: string | null;
  face?: 'row' | 'value';
}) {
  const item = (itemNumber ?? '').trim();
  if (!href) return (
    <span className={cn(RECORD_LABEL_CLASS, RECORD_HIT_CLASS, 'flex h-full items-center px-2 text-mode-faint')} title="No listing on this order">
      {face === 'row' ? 'Listing —' : '—'}
    </span>
  );
  return (
    <a href={href} target="_blank" rel="noopener noreferrer"
      onClick={(event) => event.stopPropagation()} onPointerDown={(event) => event.stopPropagation()}
      aria-label={item ? `Open listing ${item} in a new tab` : 'Open listing in a new tab'}
      title={item ? `Listing ${item}` : href} data-testid="ledger-listing-link"
      className={cn('flex h-full min-w-0 items-center gap-1.5 px-2 text-mode-ink hover:bg-mode-hover', RECORD_HIT_CLASS, focusRing('cell'))}>
      {face === 'row' ? <span className={RECORD_LABEL_CLASS}>Listing</span> : (
        <span className={cn(RECORD_ID_CLASS, 'min-w-0 truncate underline decoration-mode-edge underline-offset-2')}>{item || 'Open'}</span>
      )}
      <ExternalLink aria-hidden className="h-3.5 w-3.5 shrink-0" />
    </a>
  );
}
