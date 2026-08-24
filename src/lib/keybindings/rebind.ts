'use client';

/**
 * The decision a rebinding surface makes when an operator presses a key.
 *
 * Kept out of the component and out of the registry on purpose. It is pure over
 * the registry snapshot — no React, no DOM, no `window` — so the three answers
 * that actually matter on a bench (is this chord scanner-typeable? does it
 * already belong to something? is that collision a defect or the scope system
 * working?) are testable under `node --test` instead of only reachable by
 * clicking a settings page and pressing keys at it.
 *
 * ## Why a capture needs a decision layer at all
 *
 * The existing "Press a key…" capture in `KeyboardSection` is four `if`s inline
 * in an effect, and it answers one question (is this key in the allowed list).
 * A general rebinder has to answer four, and three of them are only answerable
 * against the whole binding table:
 *
 *  1. **Is it a chord yet?** ⌘ held with nothing else is a keydown, not a bind.
 *  2. **Can a scanner type it?** The single most consequential question here —
 *     see {@link wedgeReachability}. A silent drop teaches nothing; the operator
 *     presses P again, harder.
 *  3. **Who owns it already?**
 *  4. **Is that ownership a conflict or a scope?** Same scope means both fire
 *     (or one shadows the other by registration order, which is route-dependent
 *     and therefore not a rule anybody can hold in their head). Different scopes
 *     is precedence doing its job. Reporting them identically would either
 *     nag about legitimate binds or wave through real ones.
 *
 * ## Reassignment is ONE write
 *
 * {@link applyRebind} takes the chord AND the bindings being displaced and
 * commits them in a single `setKeybindingOverrides` call. Two calls would emit
 * twice — two prefs PUTs, two Electron mirror pushes — and would leave a commit
 * in between where both bindings really do answer to one chord.
 */

import {
  chordFromEvent,
  chordToSpec,
  formatChord,
  isApplePlatform,
  type Chord,
  type ChordKeyEvent,
} from '@/lib/keybindings/chord';
import {
  findChordOwners,
  getKeybinding,
  getKeybindingOverrides,
  setKeybindingOverrides,
  wedgeReachability,
  type ChordOwner,
  type KeybindingScope,
} from '@/lib/keybindings/registry';

export type RebindRefusal =
  /** Still assembling — ⌘ or ⇧ held with no key yet. Not an error, just not done. */
  | 'incomplete'
  /** A barcode wedge can type this chord. The hard refusal. */
  | 'wedge'
  /** The event carried no key this app can name. */
  | 'unmappable'
  /** No binding by that id is registered. */
  | 'unknown-binding';

export interface RebindRefused {
  readonly outcome: 'refused';
  readonly reason: RebindRefusal;
  /**
   * Plain language, addressed to the operator, naming the cause. "A scanner can
   * type this" is a sentence somebody on a bench can act on; a dropped
   * keystroke is not.
   */
  readonly message: string;
}

export interface RebindProposed {
  /** `conflict` when {@link blocking} is non-empty — same scope, both would fire. */
  readonly outcome: 'ready' | 'conflict';
  readonly chord: Chord;
  /** The durable spec — what lands in prefs. */
  readonly spec: string;
  /** The face to show in the capture cell. */
  readonly face: string;
  /**
   * Bindings in the SAME scope already answering to this chord. A real defect:
   * whichever registered later wins, and which one that is depends on the route
   * the operator happened to load. The surface must not commit past this
   * without either reassigning (displacing the owner) or backing out.
   */
  readonly blocking: readonly ChordOwner[];
  /**
   * Bindings in a DIFFERENT scope on the same chord. Legitimate — the
   * higher-scope one wins while it is active — but worth naming, because "⌘K
   * does something else while a tool tile is focused" is surprising if nobody
   * said it out loud.
   */
  readonly shadowed: readonly ChordOwner[];
}

export type RebindProposal = RebindRefused | RebindProposed;

function modifierAdvice(apple: boolean): string {
  return apple ? 'Hold ⌘, ⌥ or Ctrl as well.' : 'Hold Ctrl or Alt as well.';
}

/**
 * The refusal an operator reads when they capture something a scanner can type.
 *
 * Each variant names the mechanism, because the three are genuinely different
 * failures and "invalid key" would explain none of them: a letter is the
 * payload, punctuation is inside GS1 element strings, and Enter/Tab is the
 * terminator every scanner appends.
 */
function wedgeMessage(chord: Chord, apple: boolean): string {
  const face = formatChord(chord, apple);
  const advice = modifierAdvice(apple);
  switch (wedgeReachability(chord)) {
    case 'terminator':
      return `A scanner sends ${face} at the end of every scan, so this would fire on every carton. ${advice}`;
    case 'printable':
      return `A scanner can type ${face} — barcodes contain digits and punctuation — so it would fire mid-scan. ${advice}`;
    default:
      return `A scanner can type ${face}, so every barcode containing that character would fire this. ${advice}`;
  }
}

export interface ProposeRebindOptions {
  /** Face vocabulary. Resolve once per surface, never per keystroke. */
  readonly apple?: boolean;
}

/**
 * Turn one captured `keydown` into a decision about binding `bindingId`.
 *
 * Reads the live registry, so the conflict answer reflects every override
 * already in force — including a chord an operator moved thirty seconds ago in
 * the same session.
 */
export function proposeRebind(
  bindingId: string,
  event: ChordKeyEvent,
  options: ProposeRebindOptions = {},
): RebindProposal {
  const apple = options.apple ?? isApplePlatform();
  const binding = getKeybinding(bindingId);
  if (!binding) {
    return {
      outcome: 'refused',
      reason: 'unknown-binding',
      message: 'That action is not available right now — open the surface it belongs to and try again.',
    };
  }

  const chord = chordFromEvent(event);
  if (!chord) {
    // A bare modifier is the overwhelmingly common case and it is not a
    // failure: the operator is mid-chord. The surface keeps waiting.
    const incomplete = /^(Shift|Control|Alt|AltGraph|Meta|OS|CapsLock)$/.test(event.key);
    return incomplete
      ? { outcome: 'refused', reason: 'incomplete', message: '' }
      : {
          outcome: 'refused',
          reason: 'unmappable',
          message: 'That key has no name this app can store. Try another.',
        };
  }

  if (wedgeReachability(chord)) {
    return { outcome: 'refused', reason: 'wedge', message: wedgeMessage(chord, apple) };
  }

  const owners = findChordOwners(chord, { excludeId: bindingId });
  const blocking = owners.filter((owner) => owner.scope === binding.scope);
  const shadowed = owners.filter((owner) => owner.scope !== binding.scope);

  return {
    outcome: blocking.length > 0 ? 'conflict' : 'ready',
    chord,
    spec: chordToSpec(chord),
    face: formatChord(chord, apple),
    blocking: Object.freeze(blocking),
    shadowed: Object.freeze(shadowed),
  };
}

export interface ApplyRebindOptions {
  /**
   * Bindings to DISABLE (`null`) as part of this write — the "reassign" answer
   * to a same-scope conflict. Disabling rather than clearing is deliberate: the
   * displaced binding's default is the chord being taken, so clearing would
   * hand it straight back and reinstate the conflict.
   */
  readonly displace?: readonly string[];
}

/**
 * Commit a proposal. One write, one emit, one prefs PUT, one desktop re-mirror.
 */
export function applyRebind(
  bindingId: string,
  spec: string,
  options: ApplyRebindOptions = {},
): void {
  const next: Record<string, string | null> = { ...getKeybindingOverrides() };
  for (const displaced of options.displace ?? []) {
    if (displaced === bindingId) continue;
    // Re-check against the LIVE registry. `displace` was computed when the
    // operator pressed the chord and is spent when they click Reassign, and a
    // surface- or tool-scoped binding can unmount in between (closing the tile
    // that owns it is enough). Writing `null` for an id nobody holds any more
    // would persist a disable that is invisible AND unrecoverable: it goes to
    // `staff_preferences`, silently turns that binding off the next time its
    // surface mounts, and `KeybindingRow` renders nothing for an id
    // `describeKeybinding` does not know — so there is no row to press "Turn
    // on" from and only "Reset all" clears it.
    if (!getKeybinding(displaced)) continue;
    next[displaced] = null;
  }

  // Rebinding an action to the chord it already ships with is a no-op, not a
  // customisation. Storing the spec anyway would paint the row "Modified" in
  // blue next to a `default ⌘⇧C` face identical to the one beside it, and add
  // it to the header's "N changed" count — the screen lying about whether the
  // operator changed anything. Dropping the key restores the honest `default`
  // state, and drops through to the same place "Reset" lands.
  const binding = getKeybinding(bindingId);
  if (binding && chordToSpec(binding.defaultChord) === spec) delete next[bindingId];
  else next[bindingId] = spec;

  setKeybindingOverrides(next);
}

/** Scope faces for the grouped Controls list. Ordered highest-precedence first. */
export const KEYBINDING_SCOPE_ORDER: readonly KeybindingScope[] = Object.freeze([
  'global',
  'surface',
  'tool',
]);

/**
 * Operator-facing scope names and the one sentence each needs.
 *
 * Ordered for READING, not for precedence: an operator opening Controls scans
 * top-down and the global chords are the ones they use all shift. The
 * dispatcher's precedence order is the reverse and lives in the registry, where
 * it is a dispatch rule rather than a heading.
 */
export const KEYBINDING_SCOPE_COPY: Readonly<
  Record<KeybindingScope, { readonly title: string; readonly hint: string }>
> = Object.freeze({
  global: {
    title: 'Everywhere',
    hint: 'Available on any screen, from any station.',
  },
  surface: {
    title: 'Active workbench',
    hint: 'Only while the workbench that owns them is open. They win over the everywhere chords.',
  },
  tool: {
    title: 'Focused tool',
    hint: 'Only while a tool tile has focus. Highest precedence — a tool may claim a chord the shell also uses.',
  },
});
