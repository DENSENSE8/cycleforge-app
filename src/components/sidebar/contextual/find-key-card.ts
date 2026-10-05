'use client';

import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { HINT_INTENT_MS } from '@/design-system/components/FindField';
import { isEditableKeyTarget } from '@/lib/keyboard/is-editable-key-target';
import { hotkeyKeys, hotkeyMatches, PASTE_LIST_HOTKEY } from '@/lib/keyboard/key-registry';
import { PRESS_BEAT_MS, publishKeyPressed } from './go-keys-store';
import type { KeyHintAt, KeyHintRow } from './NavGoKeys';

/** The one hotkey that lands in the page field. Bare `F`, never while typing. */
export const FIND_KEY = 'f';
/** The palette's chord, taught by the key card (`CommandBar` owns it). */
const EVERYWHERE_HOTKEY = 'mod+k';

/** The key card's rows, hotkey first. `findLabel` null = `F` is not armed on this face. */
export function findKeyRows(findLabel: string | null, held: number): KeyHintRow[] {
  const rows: KeyHintRow[] = [];
  if (findLabel) rows.push({ id: 'find', keys: ['F'], pressedId: 'find:f', label: findLabel });
  rows.push(
    { id: 'everywhere', keys: hotkeyKeys(EVERYWHERE_HOTKEY), pressedId: 'find:k', label: 'Search everywhere' },
    {
      id: 'paste',
      keys: hotkeyKeys(PASTE_LIST_HOTKEY),
      pressedId: 'find:paste',
      label: 'Paste a list — check each number',
      count: held > 0 ? held : undefined,
    },
  );
  return rows;
}

/** Which taught row this keydown presses, if any. */
function taughtPress(event: KeyboardEvent, rows: readonly KeyHintRow[]): string | null {
  const id = hotkeyMatches(PASTE_LIST_HOTKEY, event)
    ? 'find:paste'
    : hotkeyMatches(EVERYWHERE_HOTKEY, event)
      ? 'find:k'
      : !event.metaKey && !event.ctrlKey && !event.altKey && !isEditableKeyTarget(event.target) && hotkeyMatches(FIND_KEY, event)
        ? 'find:f'
        : null;
  return id && rows.some((row) => row.pressedId === id) ? id : null;
}

/** The card hangs this far under the well. */
const KEY_CARD_GAP_PX = 6;

/**
 * The search well's hover key card: mouse on the well for HINT_INTENT_MS →
 * the card drops under it, left-aligned (measured then, so collapse and
 * resize never leave it stale); pointer off → it leaves. Hidden while
 * `suppressed` (the field has focus or its panel is open) — except for one
 * beat after a taught key fires while it is up: that cap sinks
 * (`publishKeyPressed`), then the card leaves.
 */
export function useFindKeyCard(rows: readonly KeyHintRow[], suppressed: boolean) {
  const [at, setAt] = useState<KeyHintAt | null>(null);
  const [beat, setBeat] = useState(false);
  const intent = useRef<number | undefined>(undefined);
  const rowsRef = useRef(rows);
  rowsRef.current = rows;
  const shown = at !== null && (!suppressed || beat);

  useEffect(() => () => window.clearTimeout(intent.current), []);
  useEffect(() => {
    if (!shown) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.repeat) return;
      const id = taughtPress(event, rowsRef.current);
      if (!id) return;
      publishKeyPressed(id);
      setBeat(true);
      window.setTimeout(() => {
        setBeat(false);
        setAt(null);
      }, PRESS_BEAT_MS);
    };
    // Capture: the key's own owner may stop it before it bubbles.
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [shown]);

  return {
    at: shown ? at : null,
    pointer: {
      onPointerEnter: (event: ReactPointerEvent<HTMLElement>) => {
        if (event.pointerType !== 'mouse') return;
        const well = event.currentTarget;
        window.clearTimeout(intent.current);
        intent.current = window.setTimeout(() => {
          const rect = well.getBoundingClientRect();
          setAt({ left: rect.left, top: rect.bottom + KEY_CARD_GAP_PX });
        }, HINT_INTENT_MS);
      },
      onPointerLeave: () => {
        window.clearTimeout(intent.current);
        setAt(null);
      },
    },
  };
}
