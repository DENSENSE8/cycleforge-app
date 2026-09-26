'use client';

/**
 * "Watch a tracking number" — one row, inside the inbox panel.
 * Operator 2026-09-22: *"the extremely simple button to add a tracker like a
 */

import { useState } from 'react';
import { Plus, Loader2 } from '@/components/Icons';
import { IconButton } from '@/design-system/primitives';
import { cornerClass } from '@/design-system/tokens/radius';
import {
  startTrackingWatch,
  TrackingWatchError,
} from '@/lib/notifications/watch-tracking-client';
import { cn } from '@/utils/_cn';

export function InboxTrackingWatchRow() {
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [okLabel, setOkLabel] = useState<string | null>(null);

  const submit = async () => {
    const tracking = value.trim();
    if (!tracking || busy) return;
    setBusy(true);
    setError(null);
    setOkLabel(null);
    try {
      const result = await startTrackingWatch(tracking);
      setValue('');
      setOkLabel(
        result.alreadyWatching ? 'Already watching that one.' : 'Watching — you will be told when it lands.',
      );
    } catch (err) {
      // The route answers in operator words already ("Enter a full tracking
      // number"); surface its sentence rather than a status code. Anything
      // that is not a server refusal never reached the server.
      setError(err instanceof TrackingWatchError ? err.message : 'Could not reach the server.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-1">
      <div
        className={cn(
          'flex items-center gap-1 border border-border-hairline bg-surface-card pl-2',
          cornerClass('flush'),
        )}
      >
        <input
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            if (error) setError(null);
            if (okLabel) setOkLabel(null);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              void submit();
            }
            // The panel closes on Escape; let it, but do not also submit.
            e.stopPropagation();
          }}
          onMouseDown={(e) => e.stopPropagation()}
          disabled={busy}
          aria-label="Tracking number to watch"
          placeholder="Watch a tracking number"
          data-testid="inbox-watch-tracking-input"
          className={cn(
            'h-8 min-w-0 flex-1 bg-transparent text-role-caption text-text-default outline-none',
            'placeholder:text-text-faint disabled:cursor-not-allowed',
          )}
        />
        <IconButton
          type="button"
          size="sm"
          ariaLabel="Watch this tracking number"
          title="Watch this tracking number"
          disabled={busy || value.trim().length === 0}
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            void submit();
          }}
          data-testid="inbox-watch-tracking-add"
          className={cn('h-8 w-8 shrink-0 text-text-default', cornerClass('flush'))}
          icon={
            busy ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
            ) : (
              <Plus className="h-3.5 w-3.5" aria-hidden />
            )
          }
        />
      </div>
      {error ? (
        <p role="alert" className="text-role-micro text-rose-600">
          {error}
        </p>
      ) : okLabel ? (
        <p className="text-role-micro text-text-soft">{okLabel}</p>
      ) : null}
    </div>
  );
}
