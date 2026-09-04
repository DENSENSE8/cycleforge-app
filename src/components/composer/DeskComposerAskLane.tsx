'use client';

/**
 * The desk Field — one mouth, docked at the bottom of a desk route.
 *
 * `deskFieldPlacement` (`@/lib/composer/desk-field`) already answers the two
 * questions this component exists to act on: *does a field mount on this
 * screen?* and *where does the next input go?* Everything here is the mount —
 * the decision stays pure and testable without a screen.
 *
 * Three things the lane deliberately does NOT do:
 *
 * **It does not gate on the composer mode.** The lane used to render only while
 * the composer sat in `ask`, which meant a desk route could be standing there
 * with no field at all — the operator had to find the mode before they could
 * find the mouth. The desk mouth is present on every desk route; the mode
 * decides what the field writes to, never whether it exists.
 *
 * **It does not fork a mouth.** The field IS `StationComposerHost`, with the
 * Unbox | Ticket faces off (`showModeFaces={false}`) and the context ring kept,
 * exactly as a dumb gun station mounts it. Never `showModeRow={false}`.
 *
 * **It does not decide against a station.** A floor station carries its own
 * `StationComposerHost`, and one screen gets one mouth — the station-mouth count
 * stands this lane down through {@link DeskComposerAskLaneProps.stationMouths}.
 */

import { useCallback, useState } from 'react';
import { usePathname } from 'next/navigation';
import { deskFieldPlacement } from '@/lib/composer/desk-field';
import { StationComposerHost } from './StationComposerHost';

export type DeskComposerAskLaneProps = {
  /**
   * Station mouths already mounted on this screen. One is enough to stand the
   * desk field down.
   *
   * A prop rather than a `useStationComposerStationCount()` read: the presence
   * store that counts mounted mouths is not in this tree yet, and inventing a
   * second source of truth for it here is how two counts end up disagreeing.
   * The shell passes what it knows — the same contract `deskFieldPlacement`
   * itself is written to.
   */
  stationMouths?: number;
  /** True while the paste-orders import draft is open. */
  importDraftOpen?: boolean;
  /** Title of the armed work session, or `null` when nothing is armed. */
  armedSessionTitle?: string | null;
  /** What a committed line does. The lane owns the draft, not the destination. */
  onAsk?: (text: string) => void;
  className?: string;
};

export function DeskComposerAskLane({
  stationMouths = 0,
  importDraftOpen = false,
  armedSessionTitle = null,
  onAsk,
  className,
}: DeskComposerAskLaneProps) {
  const pathname = usePathname();
  const [draft, setDraft] = useState('');

  // Hooks run before the placement can stand the lane down: a route change is
  // what flips `mount`, and bailing out above a hook would reorder them.
  const commit = useCallback(
    (liveValue?: string) => {
      const text = (liveValue ?? draft).trim();
      if (!text) return;
      onAsk?.(text);
      setDraft('');
    },
    [draft, onAsk],
  );

  const placement = deskFieldPlacement({
    pathname: pathname ?? '/',
    stationMouths,
    importDraftOpen,
    armedSessionTitle,
  });

  if (!placement.mount) return null;

  return (
    <div
      // `presenceKind` is not a prop `StationComposerHost` carries in this tree,
      // and this goal does not touch that file. The kind rides the lane's own
      // wrapper so the presence store has something to read when it lands.
      data-presence-kind="desk"
      data-testid="desk-composer-ask-lane"
      className={className}
    >
      <StationComposerHost
        labelValue={draft}
        onLabelChange={setDraft}
        onLabelCommit={commit}
        labelPlaceholder={placement.placeholder}
        labelCommitAriaLabel="Send to this desk"
        labelCommitTooltip="Send (Enter)"
        showModeFaces={false}
        chrome="raised"
        animateMount={false}
      />
    </div>
  );
}
