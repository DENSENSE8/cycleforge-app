/**
 * Nav-keys leader machine — the PURE state machine behind the leader-armed
 * selection keyboard (spec: `docs/todo/nav-keys-selection-keyboard-HANDOFF.md`).
 *
 * Grammar: `⌘; (leader) → region key → target letter`. This reducer owns only
 * the phase transitions + whether the event was CONSUMED (so the DOM binding
 * knows to `preventDefault`); the store owns key classification, letter
 * matching (it needs the live region handle), timers, overlay claim, and side
 * effects. Keeping the phase logic pure is what makes wedge-safety testable
 * without a DOM.
 *
 * Wedge safety is expressed here as: `leader` refuses to arm while an editable
 * element holds focus (so a scan field is never hijacked), an unmapped region
 * key returns to idle WITHOUT consuming (the keystroke passes through rather
 * than being swallowed — how a coincident scan burst exits), and every `cancel`
 * (escape / timeout / pointerdown / blur / modifier combo / scan burst) drops
 * straight to idle.
 */

import type { NavRegionId } from './nav-regions';

export type NavMode =
  | { phase: 'idle' }
  | { phase: 'pick' }
  | { phase: 'armed'; region: NavRegionId };

type NavEvent =
  /** The leader chord fired. `editable` = focus is in a text input. */
  | { type: 'leader'; editable: boolean }
  /** A region-pick key. `region` = which region it names (null = none). `available` = that region is currently registered. */
  | { type: 'regionKey'; region: NavRegionId | null; available: boolean }
  /** A live target letter matched in the armed region. */
  | { type: 'commit' }
  /** Escape / timeout / pointerdown / blur / modifier combo / scan burst / unmapped letter. */
  | { type: 'cancel' };

interface NavStep {
  mode: NavMode;
  /** True when the DOM binding should preventDefault + stopPropagation. */
  consumed: boolean;
}

export const NAV_IDLE: NavMode = { phase: 'idle' };

export function navReduce(mode: NavMode, event: NavEvent): NavStep {
  switch (event.type) {
    case 'leader':
      // Never arm over a focused text input — that is the operator scanning /
      // typing, and the leader must yield the chord to them.
      if (event.editable) return { mode, consumed: false };
      return { mode: { phase: 'pick' }, consumed: true };

    case 'regionKey':
      if (mode.phase !== 'pick') return { mode, consumed: false };
      if (event.region && event.available) {
        return { mode: { phase: 'armed', region: event.region }, consumed: true };
      }
      // An unnamed / unregistered region key exits without swallowing the key.
      return { mode: NAV_IDLE, consumed: false };

    case 'commit':
      return { mode: NAV_IDLE, consumed: true };

    case 'cancel':
      // A cancel from a live session is owned (e.g. Escape is consumed); a
      // cancel while already idle is a no-op that passes through.
      return { mode: NAV_IDLE, consumed: mode.phase !== 'idle' };
  }
}
