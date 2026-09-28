'use client';

/**
 * A key sequence as keycaps — `C` then `S`, `G` then `F` — painted ONCE.
 *
 * LAW (operator 2026-09-27, "a key is never shown twice"): when a group's
 * header already paints the leader key ("Press C, then…"), its rows paint only
 * what comes AFTER it. `ChordLeaderScope` is that header's promise; every
 * `ChordKeys` inside it drops the matching leader. So a menu, card or cheat
 * sheet cannot print `C` in the header and `C S` again on a row — the rule is
 * structural, not a convention to remember.
 *
 * Modifier chords (`⌘ S`, `Alt N`) are not leaders; paint them with
 * `chordKeys()` + `KeyboardKey` as before.
 */

import { createContext, useContext, type ReactNode } from 'react';
import { KeyboardKey, type KeyboardKeySize, type KeyboardKeyTone } from './KeyboardKey';

const ChordLeaderContext = createContext<string | null>(null);

/** Everything inside already knows the leader — the header painted it. */
export function ChordLeaderScope({ leader, children }: { leader: string; children: ReactNode }) {
  return <ChordLeaderContext.Provider value={leader}>{children}</ChordLeaderContext.Provider>;
}

/** The keys of a sequence that still need painting under the current scope. */
export function keysAfterLeader(keys: readonly string[], leader: string | null): readonly string[] {
  if (!leader || keys.length < 2) return keys;
  return keys[0]!.toLowerCase() === leader.toLowerCase() ? keys.slice(1) : keys;
}

export function ChordKeys({
  keys,
  size = 'xs',
  tone,
}: {
  /** The full sequence as pressed, leader first (`['C', 'S']`). */
  keys: readonly string[];
  size?: KeyboardKeySize;
  tone?: KeyboardKeyTone;
}) {
  const shown = keysAfterLeader(keys, useContext(ChordLeaderContext));
  return (
    <span className="inline-flex items-center gap-0.5">
      {shown.map((k, i) => (
        <KeyboardKey key={`${k}-${i}`} size={size} tone={tone}>
          {k}
        </KeyboardKey>
      ))}
    </span>
  );
}
