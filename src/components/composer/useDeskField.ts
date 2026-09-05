'use client';

/**
 * Where the desk Field stands and what it promises — the ONE reader of
 * {@link deskFieldPlacement} in the app.
 *
 * Two callers need the same answer and must not compute it twice:
 * {@link DeskComposerAskLane} (which mouth to paint, and its placeholder) and
 * `DeskPageLayout` (whether the desk chrome reserves a lead column at all —
 * an empty column with a title over it is worse than no column).
 */

import { usePathname } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { deskFieldPlacement, type DeskFieldPlacement } from '@/lib/composer/desk-field';
import { useStationComposerStationCount } from '@/lib/composer/station-composer-presence';

export function useDeskField(): DeskFieldPlacement {
  const { user, has } = useAuth();
  const pathname = usePathname();
  const stationMouths = useStationComposerStationCount();

  /**
   * `stationMouths` is a LIVE registration, deliberately — not a route test.
   * `/pack` is a station route whose queue view mounts no station host, and it
   * needs the desk field like any other desk; asking the route instead of the
   * screen took the mouth off it.
   */
  const placement = deskFieldPlacement({
    pathname: pathname ?? '/',
    stationMouths,
    importDraftOpen: false,
    armedSessionTitle: null,
  });

  if (!user || !has('assistant.chat')) {
    return {
      mount: false,
      placeholder: placement.placeholder,
      reason: 'This operator cannot reach the assistant, so there is no field to type at.',
    };
  }
  return placement;
}
