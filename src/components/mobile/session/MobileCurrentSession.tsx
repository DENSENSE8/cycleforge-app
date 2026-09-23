'use client';

import { useEffect, useState } from 'react';
import { ChevronRight, Clock } from '@/components/Icons';
import { ItemRecordThumb } from '@/design-system/components/item-record/ItemRecordThumb';
import { focusRing } from '@/design-system/tokens/focus-ring';
import { cn } from '@/utils/_cn';
import {
  MOBILE_SESSION_EVENT,
  MOBILE_SESSION_STORAGE_KEY,
  mobileSessionJobLabel,
  parseMobileSessionEntries,
  type MobileSessionEntry,
} from '@/lib/mobile/mobile-session-feed';

function relativeTime(at: string, now: number): string {
  const seconds = Math.max(0, Math.round((now - Date.parse(at)) / 1000));
  if (seconds < 60) return 'Just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h`;
}

function stateLabel(state: MobileSessionEntry['state']): string {
  if (state === 'done') return 'Done';
  if (state === 'blocked') return 'Blocked';
  if (state === 'miss') return 'Not found';
  if (state === 'error') return 'Error';
  return 'Exception';
}

export function MobileCurrentSession() {
  const [entries, setEntries] = useState<MobileSessionEntry[]>([]);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const read = () => setEntries(parseMobileSessionEntries(sessionStorage.getItem(MOBILE_SESSION_STORAGE_KEY)));
    read();
    const tick = window.setInterval(() => setNow(Date.now()), 30_000);
    window.addEventListener(MOBILE_SESSION_EVENT, read);
    window.addEventListener('storage', read);
    return () => {
      window.clearInterval(tick);
      window.removeEventListener(MOBILE_SESSION_EVENT, read);
      window.removeEventListener('storage', read);
    };
  }, []);

  // Nothing scanned yet = nothing to say. The empty block used to spend a
  // heading plus a line of microcopy explaining a feed that is, by definition,
  // not there — on the phone that is the first screenful of the shift.
  if (entries.length === 0) return null;

  return (
    <section aria-labelledby="mobile-current-session" className="pb-5">
      <div className="flex items-baseline justify-between gap-3 pb-2">
        <h2 id="mobile-current-session" className="text-role-eyebrow font-semibold uppercase tracking-wide text-text-muted">
          Current session
        </h2>
        <span className="text-role-micro tabular-nums text-text-faint">{entries.length}</span>
      </div>
      <ul className="divide-y divide-border-hairline border-y border-border-hairline bg-surface-card">
        {entries.map((entry) => (
          <li key={entry.id}>
            <a href={entry.href} className={cn('flex min-h-16 items-center gap-3 px-4 py-2 active:bg-surface-sunken', focusRing('control'))}>
              <ItemRecordThumb imageUrl={null} plainEmpty iconClassName="h-5 w-5" className="h-10 w-10 shrink-0" />
              <span className="min-w-0 flex-1">
                <span className="flex min-w-0 items-center gap-2">
                  <span className="shrink-0 text-role-micro font-semibold uppercase tracking-wide text-accent-ink">
                    {mobileSessionJobLabel(entry.job)}
                  </span>
                  <span className="truncate text-role-caption font-semibold text-text-default">
                    {entry.title ?? entry.identifier ?? 'Unnamed work'}
                  </span>
                </span>
                <span className="mt-0.5 flex min-w-0 items-center gap-2 text-role-micro text-text-soft">
                  <span className="truncate">{entry.identifier ?? stateLabel(entry.state)}</span>
                  <span className="ml-auto inline-flex shrink-0 items-center gap-1 tabular-nums">
                    <Clock className="h-3 w-3" aria-hidden />
                    {relativeTime(entry.at, now)}
                  </span>
                </span>
              </span>
              <ChevronRight className="h-4 w-4 shrink-0 text-text-faint" aria-hidden />
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}
