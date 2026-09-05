'use client';

/**
 * Desk / site fallback mouth — only when no scan-station (or Incoming extract)
 * {@link StationComposerHost} is already mounted. Inline in the page column,
 * never a popover or FAB.
 */

import { useCallback, useState } from 'react';
import { StationComposerHost } from '@/components/composer/StationComposerHost';
import { useAuth } from '@/contexts/AuthContext';
import { useStationComposerMode } from '@/components/composer/useStationComposerMode';
import { useStationComposerStationCount } from '@/lib/composer/station-composer-presence';

export function DeskComposerAskLane() {
  const { user, has } = useAuth();
  const enabled = !!user && has('assistant.chat');
  const stationCount = useStationComposerStationCount();
  const { mode } = useStationComposerMode();
  const [note, setNote] = useState('');
  const onNote = useCallback((next: string) => setNote(next), []);
  const onCommit = useCallback(() => {}, []);

  if (!enabled || stationCount > 0 || mode !== 'ask') return null;

  return (
    <div
      className="shrink-0 border-t border-border-hairline bg-surface-card"
      data-testid="desk-composer-ask-lane"
    >
      <StationComposerHost
        presenceKind="desk"
        labelValue={note}
        onLabelChange={onNote}
        onLabelCommit={onCommit}
        chrome="raised"
        animateMount={false}
      />
    </div>
  );
}
