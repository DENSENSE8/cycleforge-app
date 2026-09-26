'use client';

/** "Touching a message means I want to answer it" — one implementation, every ticket thread on the station. */

import { useCallback } from 'react';
import { resolveTicketThreadActivation } from '@/lib/composer/station-composer-mode';
import { requestStationComposerFocus } from './station-composer-focus';
import { useStationComposerMode } from './useStationComposerMode';

export function useTicketThreadActivation(enabled = true): (() => void) | undefined {
  const { mode, setMode } = useStationComposerMode();

  const onActivate = useCallback(() => {
    const hasTextSelection =
      typeof window !== 'undefined' &&
      (window.getSelection()?.toString().trim().length ?? 0) > 0;
    const plan = resolveTicketThreadActivation({ mode, hasTextSelection });
    if (plan.setTicketMode) setMode('ticket');
    // Focus even when the mode was already Ticket — see the note on
    // `resolveTicketThreadActivation`. Allowed at all only because this is a
    // real operator click; the mode chords deliberately do NOT focus.
    if (plan.focusComposer) requestStationComposerFocus();
  }, [mode, setMode]);

  return enabled ? onActivate : undefined;
}
