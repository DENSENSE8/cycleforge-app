'use client';

/**
 * Keybinding registry — one table of every chord the app binds, one dispatcher,
 * and a serializable per-staffer override map.
 *
 * ## What this replaces
 *
 * 56 files mount their own `window` `keydown` listener today. Nothing can
 * enumerate them, so:
 *
 *  - **Nothing can detect a conflict.** Two listeners on ⌘⇧U both fire; which
 *    one "wins" is whichever called `preventDefault` first, which is mount
 *    order, which is route-dependent.
 *  - **Nothing can remap.** Exactly one key in the app is user-remappable, and
 *    only in the sense that ⌘1–9 follow the pin list's order.
 *  - **Labels drift from listeners.** `CLIPBOARD_HISTORY_HOTKEY_LABEL` exists
 *    precisely because the label and the binding had to be re-stated in two
 *    places; the constant is a patch over the missing registry, not a design.
 *
 * A binding here is `{ id, chord, label, run }`. The label comes from
 * {@link formatChord}, so a rebind repaints every hint that advertises it and a
 * stale hint is unrepresentable.
 *
 * ## Precedence is explicit, not mount order
 *
 * Bindings carry a `scope`, and the dispatcher walks scopes highest-first:
 * `tool` (the focused tool tile) → `surface` (the active workbench) →
 * `global`. Within one scope, a later registration wins — but a conflict at the
 * same scope is a **reported defect** (see {@link findKeybindingConflicts}), not
 * a silent race.
 *
 * ## Standing down inside text fields is the default
 *
 * `allowInEditable` defaults to **false**. Both existing chord owners stand
 * down inside an editable target and each wrote a paragraph explaining why:
 * ⌘⇧V *is* paste-and-match-style and the native meaning must win, and ⌘⇧U
 * steals the caret from a half-written carton note. The safe default is the one
 * both arrived at independently.
 *
 * ## Wedge safety, on BOTH doors
 *
 * A keyboard wedge emits bare printable characters with no modifier held, then
 * a terminator (Enter or Tab). A chord made only of those is a chord a barcode
 * types, and binding one arms every scan on the bench — one bare `P` and each
 * carton fires the binding once per "p" in its label.
 *
 * There are TWO doors into the binding table and both are guarded:
 *
 *  - {@link registerKeybinding} refuses a scanner-typeable DEFAULT at
 *    registration, so a bad chord never ships.
 *  - {@link setKeybindingOverrides} refuses a scanner-typeable OVERRIDE, so a
 *    rebinding surface, a hand-edited `staff_preferences` row, or a stale
 *    localStorage mirror cannot get one in through the back. This is not
 *    belt-and-braces: overrides arrive from three paths that never touch
 *    `registerKeybinding`, and the operator-facing surface is the one most
 *    likely to try (the capture handler sees a bare `P` the moment somebody
 *    presses P before reaching for ⌘).
 *
 * {@link wedgeReachability} names the reason, so a surface can explain the
 * refusal in words instead of dropping the keystroke silently.
 */

import {
  chordId,
  formatChord,
  matchesChord,
  parseChord,
  type Chord,
  type ChordKeyEvent,
} from '@/lib/keybindings/chord';

/** Highest-precedence first. The dispatcher walks in this order. */
export type KeybindingScope = 'tool' | 'surface' | 'global';

const SCOPE_ORDER: readonly KeybindingScope[] = Object.freeze(['tool', 'surface', 'global']);

export interface KeybindingInput {
  /** Stable identity — `tool.photo-library.open`, `rail.close`. Doubles as the override key. */
  readonly id: string;
  /** Default chord spec (`'Mod+Shift+P'`). An override retargets it; this never changes. */
  readonly chord: string;
  /** Operator-facing description, for the shortcuts sheet. Not the chord face. */
  readonly label: string;
  readonly scope?: KeybindingScope;
  /** Extra guard read at dispatch — e.g. "only while a tool tile is focused". */
  readonly when?: () => boolean;
  /** Opt in to firing while the caret is in an input / textarea / contenteditable. */
  readonly allowInEditable?: boolean;
  readonly run: () => void;
}

export interface Keybinding extends Omit<KeybindingInput, 'chord'> {
  readonly scope: KeybindingScope;
  /** The DEFAULT chord, before overrides. */
  readonly defaultChord: Chord;
  /** Registration order, for deterministic tie-breaking within a scope. */
  readonly seq: number;
}

/**
 * A serializable retarget map: binding id → chord spec, or `null` to disable
 * the binding entirely. Flat strings on purpose — it round-trips through
 * `staff_preferences.prefs` (JSONB, shallow merge) with no codec.
 */
export type KeybindingOverrides = Readonly<Record<string, string | null>>;

const bindings = new Map<string, Keybinding>();
const listeners = new Set<() => void>();
let overrides: KeybindingOverrides = Object.freeze({});
let seq = 0;

let listSnapshot: readonly Keybinding[] = Object.freeze([]);

function recompute(): void {
  listSnapshot = Object.freeze(
    [...bindings.values()].sort((a, b) => {
      const byScope = SCOPE_ORDER.indexOf(a.scope) - SCOPE_ORDER.indexOf(b.scope);
      return byScope !== 0 ? byScope : a.seq - b.seq;
    }),
  );
}

function emit(): void {
  for (const listener of listeners) listener();
}

/**
 * Codes a keyboard wedge can emit while typing a barcode's PAYLOAD. Every one
 * of them produces a printable character, and a barcode is printable characters
 * — GS1 element strings alone carry digits, parentheses, `-`, `.` and `/`.
 *
 * The list is the COMPLETE set of printable `KeyboardEvent.code` values, not a
 * sample of the likely ones, because the cost of an omission is asymmetric: a
 * code missing from here is a chord an operator can bind on the Controls screen
 * and then have fire once per matching character on every carton they scan,
 * while a code listed in error costs them one refused keystroke and a sentence
 * explaining it. Four families are easy to leave out and all four are real:
 *
 *  - `IntlHash` — the `#`/`~` key on UK and JP layouts. `#` is an ordinary
 *    barcode character, and it is `Backslash` on ANSI but `IntlHash` on ISO, so
 *    listing only its ANSI spelling covers the wrong benches.
 *  - `NumpadComma` — the numpad decimal separator on JP/BR keyboards, and the
 *    sibling of `NumpadDecimal`, which was already here.
 *  - `NumpadEqual` — same numpad family; `Equal` was already here.
 *  - `NumpadParenLeft` / `NumpadParenRight` — parentheses, which is what a GS1
 *    element string puts around every application identifier. A wedge
 *    configured to emit the numpad plane types these for `(01)`.
 */
const WEDGE_PRINTABLE_CODES =
  /^(Digit[0-9]|Numpad[0-9]|Numpad(Add|Subtract|Multiply|Divide|Decimal|Comma|Equal|ParenLeft|ParenRight)|Space|Minus|Equal|BracketLeft|BracketRight|Backslash|Semicolon|Quote|Comma|Period|Slash|Backquote|Intl(Backslash|Ro|Yen|Hash))$/;

/**
 * Codes a wedge emits as a SUFFIX, after the payload. Every scanner ships with
 * a configurable terminator and the two that ship enabled are Enter and Tab —
 * `Tab` is not a rounding error here, it is the default on a large share of the
 * handhelds a warehouse buys.
 */
const WEDGE_TERMINATOR_CODES = /^(Enter|NumpadEnter|Tab)$/;

/**
 * Why a chord is reachable by a barcode wedge, or `null` when it is safe.
 *
 * Naming the reason rather than returning a bare boolean is what lets a
 * rebinding surface say *"a scanner types this"* in words an operator can act
 * on, instead of dropping the capture with no explanation.
 */
export type WedgeReachability = 'letter' | 'printable' | 'terminator';

/**
 * Is this chord typeable BY A SCANNER?
 *
 * A keyboard wedge is a keyboard: it emits bare characters with no modifier
 * held, then a terminator. So the rule is not "no bare letters" — it is **no
 * bare PRINTABLE key, and no bare terminator**. Anything a scanner cannot type
 * (Escape, the F-row, arrows, Insert, ScrollLock, Home/End, Backspace, Delete)
 * is safe unmodified, which is exactly the set the focus-scan reclaim hotkey
 * has always been restricted to — the same conclusion, reached twice.
 *
 * Holding ⇧ does NOT make a chord safe: a wedge types capitals, and it types
 * them with Shift. Only ⌘/Ctrl/⌥ are out of a scanner's reach.
 *
 * Getting this wrong arms every scan on the bench: one bare-letter binding and
 * each carton scanned fires it once per matching character in the barcode.
 */
export function wedgeReachability(chord: Chord): WedgeReachability | null {
  if (chord.mod || chord.meta || chord.ctrl || chord.alt) return null;
  if (chord.kind === 'letter' || /^Key[A-Z]$/.test(chord.key)) return 'letter';
  if (WEDGE_PRINTABLE_CODES.test(chord.key)) return 'printable';
  if (WEDGE_TERMINATOR_CODES.test(chord.key)) return 'terminator';
  return null;
}

/** {@link wedgeReachability} as a predicate. A refusal, not a warning. */
export function isWedgeReachableChord(chord: Chord): boolean {
  return wedgeReachability(chord) !== null;
}

/**
 * Register a binding. Returns an unregister that removes exactly this
 * registration — a re-registration under the same id is untouched (the `seq`
 * ownership token, same idiom as `registerRightRailPanel`).
 *
 * Returns a no-op unregister when the spec is unparseable or wedge-reachable;
 * the binding is dropped rather than silently bound to something else, and the
 * reason is logged so it is not invisible.
 */
export function registerKeybinding(input: KeybindingInput): () => void {
  const defaultChord = parseChord(input.chord);
  if (!defaultChord) {
    console.warn(`[keybindings] "${input.id}": unparseable chord "${input.chord}" — not bound`);
    return () => {};
  }
  if (isWedgeReachableChord(defaultChord)) {
    console.warn(
      `[keybindings] "${input.id}": "${input.chord}" is reachable by a barcode wedge ` +
        '(no modifier) — not bound. Add Mod / Alt, or use a non-typing code.',
    );
    return () => {};
  }

  seq += 1;
  const mySeq = seq;
  bindings.set(input.id, {
    id: input.id,
    label: input.label,
    scope: input.scope ?? 'global',
    when: input.when,
    allowInEditable: input.allowInEditable,
    run: input.run,
    defaultChord,
    seq: mySeq,
  });
  recompute();
  emit();

  return () => {
    const current = bindings.get(input.id);
    if (!current || current.seq !== mySeq) return;
    bindings.delete(input.id);
    recompute();
    emit();
  };
}

export function getKeybinding(id: string): Keybinding | undefined {
  return bindings.get(id);
}

/** Every registered binding, scope-ordered. Stable identity between mutations. */
export function listKeybindings(): readonly Keybinding[] {
  return listSnapshot;
}

export function subscribeKeybindings(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

const EMPTY_BINDINGS: readonly Keybinding[] = Object.freeze([]);

/** Server snapshot — a frozen constant, never a fresh array. */
export function getServerKeybindings(): readonly Keybinding[] {
  return EMPTY_BINDINGS;
}

/**
 * One override, decided. Computed when the map changes rather than on every
 * keystroke: {@link dispatchKeybinding} resolves every binding on every keydown,
 * and re-parsing (and re-wedge-checking) a spec inside that loop would put a
 * regex per binding on the bench's hottest path.
 */
type ResolvedOverride =
  | { readonly kind: 'chord'; readonly chord: Chord }
  | { readonly kind: 'disabled' }
  | {
      readonly kind: 'invalid';
      readonly reason: 'unparseable' | 'wedge';
      readonly spec: string;
    };

let overrideCache: ReadonlyMap<string, ResolvedOverride> = new Map();

/**
 * Re-decide every override.
 *
 * **The wedge refusal is applied HERE as well as at registration**, and that is
 * the point of this function existing. `registerKeybinding` refuses a
 * scanner-typeable DEFAULT, but an override arrives from `staff_preferences`,
 * from a localStorage mirror, or from a rebinding surface — three paths that
 * never went through `registerKeybinding`. Without this check an operator (or a
 * corrupt prefs row) could bind a bare `P` and every barcode containing a "p"
 * would fire the binding once per character, mid-scan, on a live bench.
 *
 * A refused override is left UNBOUND rather than falling back to the default,
 * for the reason the module already applies to an unparseable spec: silently
 * re-arming a chord somebody deliberately changed is worse than a dead key,
 * because the operator has no way to notice.
 */
function recomputeOverrides(): void {
  const next = new Map<string, ResolvedOverride>();
  for (const id of Object.keys(overrides)) {
    const spec = overrides[id];
    if (spec === null) {
      next.set(id, { kind: 'disabled' });
      continue;
    }
    const chord = parseChord(spec);
    if (!chord) {
      next.set(id, { kind: 'invalid', reason: 'unparseable', spec });
      continue;
    }
    if (isWedgeReachableChord(chord)) {
      next.set(id, { kind: 'invalid', reason: 'wedge', spec });
      continue;
    }
    next.set(id, { kind: 'chord', chord });
  }
  overrideCache = next;
}

/**
 * The chord this binding fires on right now: the override when one is set,
 * parseable and wedge-safe, otherwise the default. `null` means unbound — the
 * operator disabled it, or the stored spec was refused (see
 * {@link recomputeOverrides}).
 */
export function resolveChord(id: string): Chord | null {
  const binding = bindings.get(id);
  if (!binding) return null;
  const override = overrideCache.get(id);
  if (!override) return binding.defaultChord;
  return override.kind === 'chord' ? override.chord : null;
}

/** The face to paint beside this binding's label. Empty when unbound. */
export function keybindingFace(id: string): string {
  const chord = resolveChord(id);
  return chord ? formatChord(chord) : '';
}

/**
 * What a rebinding surface needs to paint one row, as a closed union.
 *
 * The four states are genuinely four answers, and collapsing any pair loses
 * something an operator has to be able to see:
 *
 *  - `default` — no override key at all. "Reset" is a no-op.
 *  - `custom` — the operator retargeted it. Show the default alongside so
 *    "modified" is legible at a glance.
 *  - `disabled` — the operator stored `null`. **Not the same as `default` with
 *    a missing key**, and not the same as "no chord exists": they turned it OFF,
 *    on purpose, and the row must say so rather than showing an empty cell that
 *    reads as a bug.
 *  - `invalid` — a stored spec that will not bind. Reachable from a hand-edited
 *    prefs row or a spec written before a grammar change; showing it as
 *    `default` would be a lie about which key fires.
 */
export type KeybindingState =
  | { readonly state: 'default'; readonly chord: Chord }
  | { readonly state: 'custom'; readonly chord: Chord; readonly spec: string }
  | { readonly state: 'disabled' }
  | {
      readonly state: 'invalid';
      readonly spec: string;
      readonly reason: 'unparseable' | 'wedge';
    };

/** The state of one binding's chord. `null` when no such binding is registered. */
export function describeKeybinding(id: string): KeybindingState | null {
  const binding = bindings.get(id);
  if (!binding) return null;
  const override = overrideCache.get(id);
  if (!override) return { state: 'default', chord: binding.defaultChord };
  if (override.kind === 'disabled') return { state: 'disabled' };
  if (override.kind === 'invalid') {
    return { state: 'invalid', spec: override.spec, reason: override.reason };
  }
  return { state: 'custom', chord: override.chord, spec: overrides[id] as string };
}

export function setKeybindingOverrides(next: KeybindingOverrides): void {
  overrides = Object.freeze({ ...next });
  recomputeOverrides();
  // `recompute()` is what gives `listSnapshot` a NEW identity, and that is
  // load-bearing rather than housekeeping: every React consumer reads the table
  // through `useSyncExternalStore(subscribeKeybindings, listKeybindings)`, and
  // React bails out of re-rendering when a snapshot compares identical. Without
  // this line an override lands, `emit()` fires, every subscriber re-reads the
  // same frozen array and NOTHING repaints — so `StaffAccountFooter`'s chord
  // hints keep advertising the old chord until a reload, which is exactly the
  // stale-hint failure this module was built to make unrepresentable.
  recompute();
  emit();
}

export function getKeybindingOverrides(): KeybindingOverrides {
  return overrides;
}

/**
 * Retarget ONE binding, leaving every other override untouched.
 *
 * `spec === null` DISABLES the binding. That is a different write from
 * {@link clearKeybindingOverride}, which removes the key so the default comes
 * back — the schema keeps the two apart precisely so this surface can offer
 * both, and an operator who turned a chord off must not have it silently
 * re-armed by a "reset".
 */
export function setKeybindingOverride(id: string, spec: string | null): void {
  setKeybindingOverrides({ ...overrides, [id]: spec });
}

/** Drop the override for one binding — back to its `defaultChord`. */
export function clearKeybindingOverride(id: string): void {
  // An absent key is already "use the default". Emitting anyway would wake the
  // persistence mount and PUT a byte-identical prefs row.
  if (!(id in overrides)) return;
  const next = { ...overrides };
  delete next[id];
  setKeybindingOverrides(next);
}

/**
 * Back to the shipped set — every binding on its `defaultChord`, nothing
 * disabled. This is total by construction: an empty override map means every
 * `resolveChord` falls through to the default it was registered with, so there
 * is no way for a "reset all" to leave a stale retarget behind.
 */
export function clearAllKeybindingOverrides(): void {
  if (Object.keys(overrides).length === 0) return;
  setKeybindingOverrides({});
}

export interface KeybindingConflict {
  readonly chordId: string;
  readonly scope: KeybindingScope;
  readonly bindingIds: readonly string[];
}

/**
 * Bindings that resolve to the same chord in the same scope.
 *
 * Same chord in DIFFERENT scopes is not a conflict — that is the whole point of
 * scopes: a tool tile may claim Escape while the shell also binds it, and the
 * tool wins while it is focused. Same chord in the SAME scope is a defect: both
 * would fire, or one would shadow the other by registration order, and which
 * one depends on which route the operator loaded.
 */
export function findKeybindingConflicts(): readonly KeybindingConflict[] {
  // A Map of Maps, not a joined `${scope}:${chordId}` string key: a chord id
  // can contain any separator you would pick (`+`, `:`, a space — `chordId`
  // emits all three), so a flat key has to be split back apart by a delimiter
  // that cannot appear in the value. There is no such printable character, and
  // reaching for an unprintable one puts a control byte in a source file.
  const byScope = new Map<KeybindingScope, Map<string, string[]>>();
  for (const binding of listSnapshot) {
    const chord = resolveChord(binding.id);
    if (!chord) continue;
    let scoped = byScope.get(binding.scope);
    if (!scoped) {
      scoped = new Map<string, string[]>();
      byScope.set(binding.scope, scoped);
    }
    const key = chordId(chord);
    const bucket = scoped.get(key);
    if (bucket) bucket.push(binding.id);
    else scoped.set(key, [binding.id]);
  }

  const conflicts: KeybindingConflict[] = [];
  for (const [scope, scoped] of byScope) {
    for (const [chord, ids] of scoped) {
      if (ids.length < 2) continue;
      conflicts.push({ chordId: chord, scope, bindingIds: Object.freeze(ids) });
    }
  }
  return Object.freeze(conflicts);
}

/** A binding that already answers to a chord, named so a surface can say whose it is. */
export interface ChordOwner {
  readonly id: string;
  readonly label: string;
  readonly scope: KeybindingScope;
}

/**
 * Who currently answers to this chord — the question a rebinding surface must
 * ask BEFORE it commits a capture, which {@link findKeybindingConflicts} cannot
 * answer because that reports the table as it already is.
 *
 * Returns owners in EVERY scope, not just the candidate's, and leaves the
 * same-scope / cross-scope judgement to the caller. That split is the honest
 * one: two bindings on one chord in one scope is a defect (both would fire, or
 * one shadows the other by registration order), while the same chord in two
 * scopes is the entire reason scopes exist — a focused tool tile claiming Esc
 * over the shell's Esc is the design working.
 */
export function findChordOwners(
  chord: Chord,
  options?: { readonly excludeId?: string },
): readonly ChordOwner[] {
  const target = chordId(chord);
  const owners: ChordOwner[] = [];
  for (const binding of listSnapshot) {
    if (binding.id === options?.excludeId) continue;
    const resolved = resolveChord(binding.id);
    if (!resolved) continue;
    if (chordId(resolved) !== target) continue;
    owners.push({ id: binding.id, label: binding.label, scope: binding.scope });
  }
  return Object.freeze(owners);
}

/**
 * Conflicts in the SHIPPED set — the defaults, ignoring every override.
 *
 * "Reset all" is only a promise worth making if the set it returns to is itself
 * coherent. If two bindings ship on one chord in one scope, an operator who
 * resets lands on a broken table and has no way to tell that it was broken
 * before they touched it. This is the check that says so, and it is a
 * development-time assertion about the binding table rather than anything an
 * operator can cause.
 */
export function findDefaultChordConflicts(): readonly KeybindingConflict[] {
  const byScope = new Map<KeybindingScope, Map<string, string[]>>();
  for (const binding of listSnapshot) {
    let scoped = byScope.get(binding.scope);
    if (!scoped) {
      scoped = new Map<string, string[]>();
      byScope.set(binding.scope, scoped);
    }
    const key = chordId(binding.defaultChord);
    const bucket = scoped.get(key);
    if (bucket) bucket.push(binding.id);
    else scoped.set(key, [binding.id]);
  }

  const conflicts: KeybindingConflict[] = [];
  for (const [scope, scoped] of byScope) {
    for (const [chord, ids] of scoped) {
      if (ids.length < 2) continue;
      conflicts.push({ chordId: chord, scope, bindingIds: Object.freeze(ids) });
    }
  }
  return Object.freeze(conflicts);
}

export interface DispatchDeps {
  /** True when the caret is in a field. Injected so the dispatcher stays pure. */
  readonly isEditableTarget: boolean;
  /** True while a popover / dialog owns the keyboard — every binding stands down. */
  readonly overlayOpen?: boolean;
}

/**
 * The ONE dispatcher. Returns the id of the binding that fired, or `null`.
 *
 * Scope order is precedence, and the first match wins: a chord claimed by the
 * focused tool never reaches the global binding of the same chord. Firing calls
 * `preventDefault` + `stopPropagation` — but only on a match, so a wedge burst
 * of bare characters flows through untouched (the invariant
 * `handlePanelStoreKeydown` already holds, kept).
 */
export function dispatchKeybinding(
  event: ChordKeyEvent & {
    preventDefault: () => void;
    stopPropagation: () => void;
  },
  deps: DispatchDeps,
): string | null {
  if (deps.overlayOpen) return null;

  for (const scope of SCOPE_ORDER) {
    // Later registration wins within a scope, so walk the scope backwards.
    for (let i = listSnapshot.length - 1; i >= 0; i -= 1) {
      const binding = listSnapshot[i];
      if (binding.scope !== scope) continue;
      if (deps.isEditableTarget && !binding.allowInEditable) continue;
      const chord = resolveChord(binding.id);
      if (!chord) continue;
      if (!matchesChord(chord, event)) continue;
      if (binding.when && !binding.when()) continue;
      event.preventDefault();
      event.stopPropagation();
      binding.run();
      return binding.id;
    }
  }
  return null;
}

/** Test waist. Production never empties the table. */
export function resetKeybindings(): void {
  bindings.clear();
  overrides = Object.freeze({});
  overrideCache = new Map();
  seq = 0;
  recompute();
  emit();
}
