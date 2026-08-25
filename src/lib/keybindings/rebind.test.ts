/**
 *   node --import tsx --import ./scripts/register-server-only-shim.cjs --test src/lib/keybindings/rebind.test.ts
 *
 * The rebinder's decision layer, DB-free and React-free. Everything here is the
 * behaviour a Controls screen depends on, asserted where it can be observed —
 * against the real registry singleton, never by reading a component's source.
 */

import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';

import {
  chordToSpec,
  chordFromEvent,
  formatChord,
  parseChord,
  type ChordKeyEvent,
} from './chord';
import {
  clearAllKeybindingOverrides,
  clearKeybindingOverride,
  describeKeybinding,
  dispatchKeybinding,
  findChordOwners,
  findDefaultChordConflicts,
  getKeybindingOverrides,
  keybindingFace,
  listKeybindings,
  registerKeybinding,
  resetKeybindings,
  resolveChord,
  setKeybindingOverride,
  setKeybindingOverrides,
  subscribeKeybindings,
  wedgeReachability,
} from './registry';
import { applyRebind, proposeRebind, type RebindProposed } from './rebind';
import { serializeKeybindingsForDesktop } from './desktop-mirror';

/** A `keydown` as the chord layer sees it. Defaults are "nothing held". */
function key(partial: Partial<ChordKeyEvent> & { key: string }): ChordKeyEvent {
  return {
    key: partial.key,
    code: partial.code ?? '',
    metaKey: partial.metaKey ?? false,
    ctrlKey: partial.ctrlKey ?? false,
    altKey: partial.altKey ?? false,
    shiftKey: partial.shiftKey ?? false,
  };
}

function fire(event: Partial<ChordKeyEvent> & { key: string }): string | null {
  return dispatchKeybinding(
    { ...key(event), preventDefault: () => {}, stopPropagation: () => {} },
    { isEditableTarget: false },
  );
}

/** The four shipped-shaped bindings most tests below rebind against. */
function registerFixture(): void {
  registerKeybinding({
    id: 'tool.manuals.open',
    chord: 'Mod+Shift+M',
    label: 'Open Manuals',
    scope: 'global',
    run: () => {},
  });
  registerKeybinding({
    id: 'tool.calculator.open',
    chord: 'Mod+Shift+C',
    label: 'Open Calculator',
    scope: 'global',
    run: () => {},
  });
  registerKeybinding({
    id: 'tile.close',
    chord: 'Mod+Shift+W',
    label: 'Close tile',
    scope: 'tool',
    run: () => {},
  });
}

function proposed(result: ReturnType<typeof proposeRebind>): RebindProposed {
  assert.notEqual(result.outcome, 'refused', `expected a proposal, got: ${JSON.stringify(result)}`);
  return result as RebindProposed;
}

beforeEach(() => {
  resetKeybindings();
});

describe('capture', () => {
  it('a bare modifier is not a chord — the surface keeps waiting', () => {
    assert.equal(chordFromEvent(key({ key: 'Meta', metaKey: true })), null);
    assert.equal(chordFromEvent(key({ key: 'Shift', shiftKey: true })), null);
    registerFixture();
    const held = proposeRebind('tool.manuals.open', key({ key: 'Meta', metaKey: true }));
    assert.equal(held.outcome, 'refused');
    assert.equal(held.outcome === 'refused' && held.reason, 'incomplete');
    // Nothing to show the operator: mid-chord is not an error state.
    assert.equal(held.outcome === 'refused' && held.message, '');
  });

  it('infers the portable `Mod` from exactly one of Cmd/Ctrl', () => {
    const onMac = chordFromEvent(key({ key: 'v', code: 'KeyV', metaKey: true, shiftKey: true }));
    const onWindows = chordFromEvent(key({ key: 'v', code: 'KeyV', ctrlKey: true, shiftKey: true }));
    assert.deepEqual(onMac, onWindows, 'the same chord, captured on either bench');
    assert.equal(chordToSpec(onMac!), 'Mod+Shift+V');
  });

  it('keeps Ctrl+Cmd apart from Mod — they are different chords', () => {
    const both = chordFromEvent(key({ key: 'v', code: 'KeyV', metaKey: true, ctrlKey: true }));
    assert.equal(both!.mod, false);
    assert.equal(both!.meta, true);
    assert.equal(both!.ctrl, true);
    assert.equal(chordToSpec(both!), 'Meta+Ctrl+V');
  });

  it('captures an Alt+letter as a PHYSICAL code — macOS rewrites the character', () => {
    // ⌥P delivers `key: 'π'` on an Apple bench. A letter chord matches on
    // `key`, so `{ letter, 'p' }` would never fire there, and `{ letter, 'π' }`
    // does not survive `parseChord` so it could not be persisted either.
    const chord = chordFromEvent(key({ key: 'π', code: 'KeyP', altKey: true }));
    assert.deepEqual(chord, {
      key: 'KeyP',
      kind: 'code',
      mod: false,
      meta: false,
      ctrl: false,
      alt: true,
      shift: false,
    });
    assert.equal(chordToSpec(chord!), 'Alt+KeyP');
  });

  it('reads digits off `code`, never the shifted character', () => {
    const chord = chordFromEvent(key({ key: '!', code: 'Digit1', metaKey: true, shiftKey: true }));
    assert.equal(chord!.key, 'Digit1');
    assert.equal(chordToSpec(chord!), 'Mod+Shift+Digit1');
  });

  it('every captured chord round-trips through the durable spec', () => {
    const captured = [
      key({ key: 'v', code: 'KeyV', metaKey: true, shiftKey: true }),
      key({ key: 'π', code: 'KeyP', altKey: true }),
      key({ key: '!', code: 'Digit1', ctrlKey: true, shiftKey: true }),
      key({ key: 'Escape', code: 'Escape' }),
      key({ key: 'ArrowUp', code: 'ArrowUp', metaKey: true }),
      key({ key: 'F2', code: 'F2' }),
      key({ key: '/', code: 'Slash', ctrlKey: true }),
      key({ key: 'Insert', code: 'Insert' }),
    ];
    for (const event of captured) {
      const chord = chordFromEvent(event);
      assert.ok(chord, `${event.code} produced no chord`);
      assert.deepEqual(
        parseChord(chordToSpec(chord)),
        chord,
        `${chordToSpec(chord)} did not survive the round trip`,
      );
    }
  });
});

describe('wedge safety', () => {
  it('names WHY a chord is scanner-typeable, so the refusal can be explained', () => {
    assert.equal(wedgeReachability(parseChord('P')!), 'letter');
    assert.equal(wedgeReachability(parseChord('Digit4')!), 'printable');
    assert.equal(wedgeReachability(parseChord('Minus')!), 'printable');
    assert.equal(wedgeReachability(parseChord('Enter')!), 'terminator');
    // Every scanner ships a configurable terminator and Tab is the other one
    // that ships enabled — it is not an edge case on a warehouse handheld.
    assert.equal(wedgeReachability(parseChord('Tab')!), 'terminator');
    // Shift does NOT make a chord safe: a wedge types capitals, with Shift.
    assert.equal(wedgeReachability(parseChord('Shift+P')!), 'letter');
    // Nothing a scanner can emit.
    assert.equal(wedgeReachability(parseChord('Escape')!), null);
    assert.equal(wedgeReachability(parseChord('F7')!), null);
    assert.equal(wedgeReachability(parseChord('Insert')!), null);
    assert.equal(wedgeReachability(parseChord('Mod+P')!), null);
    assert.equal(wedgeReachability(parseChord('Alt+P')!), null);
  });

  it('REFUSES a wedge-reachable capture in words, not by dropping it', () => {
    registerFixture();
    const refused = proposeRebind('tool.manuals.open', key({ key: 'p', code: 'KeyP' }));
    assert.equal(refused.outcome, 'refused');
    assert.equal(refused.outcome === 'refused' && refused.reason, 'wedge');
    // The operator has to learn the mechanism, not just that it failed.
    assert.match(refused.outcome === 'refused' ? refused.message : '', /scanner/i);
  });

  it('refuses the terminator keys a scanner appends to every scan', () => {
    registerFixture();
    for (const event of [key({ key: 'Enter', code: 'Enter' }), key({ key: 'Tab', code: 'Tab' })]) {
      const refused = proposeRebind('tool.manuals.open', event);
      assert.equal(refused.outcome === 'refused' && refused.reason, 'wedge', event.code);
    }
  });

  it('allows a bare key a scanner cannot type', () => {
    registerFixture();
    const ok = proposed(proposeRebind('tool.manuals.open', key({ key: 'F8', code: 'F8' })));
    assert.equal(ok.outcome, 'ready');
    assert.equal(ok.spec, 'F8');
  });

  it('refuses a wedge chord arriving through the OVERRIDE door too', () => {
    // The back door: a hand-edited prefs row, a stale mirror, a spec written by
    // an older build. None of these went through `registerKeybinding`.
    registerFixture();
    setKeybindingOverrides({ 'tool.manuals.open': 'P' });
    assert.equal(resolveChord('tool.manuals.open'), null, 'must not be armed');
    assert.equal(fire({ key: 'p', code: 'KeyP' }), null, 'a bare scan character fires nothing');
    // And the default is NOT silently restored — that would re-arm a chord the
    // operator deliberately changed, invisibly.
    assert.equal(fire({ key: 'm', code: 'KeyM', metaKey: true, shiftKey: true }), null);
    assert.deepEqual(describeKeybinding('tool.manuals.open'), {
      state: 'invalid',
      spec: 'P',
      reason: 'wedge',
    });
  });
});

describe('conflicts at bind time', () => {
  it('a SAME-scope collision is a defect, and names the owner', () => {
    registerFixture();
    const result = proposed(
      proposeRebind('tool.manuals.open', key({ key: 'c', code: 'KeyC', metaKey: true, shiftKey: true })),
    );
    assert.equal(result.outcome, 'conflict');
    assert.deepEqual(
      result.blocking.map((owner) => owner.id),
      ['tool.calculator.open'],
    );
    assert.equal(result.blocking[0].label, 'Open Calculator');
    assert.deepEqual(result.shadowed, []);
  });

  it('a CROSS-scope collision is legitimate — reported, not blocked', () => {
    registerFixture();
    // `tile.close` is tool-scoped; taking its chord for a global binding is the
    // precedence system working, not a defect.
    const result = proposed(
      proposeRebind('tool.manuals.open', key({ key: 'w', code: 'KeyW', metaKey: true, shiftKey: true })),
    );
    assert.equal(result.outcome, 'ready');
    assert.deepEqual(result.blocking, []);
    assert.deepEqual(
      result.shadowed.map((owner) => owner.id),
      ['tile.close'],
    );
  });

  it('rebinding a chord to itself is not a conflict with itself', () => {
    registerFixture();
    const result = proposed(
      proposeRebind('tool.manuals.open', key({ key: 'm', code: 'KeyM', metaKey: true, shiftKey: true })),
    );
    assert.equal(result.outcome, 'ready');
    assert.deepEqual(result.blocking, []);
  });

  it('sees a chord an override moved, not just the shipped one', () => {
    registerFixture();
    setKeybindingOverride('tool.calculator.open', 'Mod+Alt+J');
    // ⌘⇧C is now free…
    assert.equal(
      proposed(proposeRebind('tool.manuals.open', key({ key: 'c', code: 'KeyC', metaKey: true, shiftKey: true })))
        .outcome,
      'ready',
    );
    // …and ⌘⌥J is not.
    const taken = proposed(
      proposeRebind('tool.manuals.open', key({ key: '∆', code: 'KeyJ', metaKey: true, altKey: true })),
    );
    assert.equal(taken.outcome, 'conflict');
    assert.deepEqual(
      taken.blocking.map((owner) => owner.id),
      ['tool.calculator.open'],
    );
  });

  it('findChordOwners ignores a disabled binding — it owns nothing', () => {
    registerFixture();
    setKeybindingOverride('tool.calculator.open', null);
    assert.deepEqual(findChordOwners(parseChord('Mod+Shift+C')!), []);
  });
});

describe('applying a rebind', () => {
  it('commits the chord and the displacement in ONE write', () => {
    registerFixture();
    let emits = 0;
    const off = subscribeKeybindings(() => {
      emits += 1;
    });

    const result = proposed(
      proposeRebind('tool.manuals.open', key({ key: 'c', code: 'KeyC', metaKey: true, shiftKey: true })),
    );
    applyRebind('tool.manuals.open', result.spec, {
      displace: result.blocking.map((owner) => owner.id),
    });
    off();

    // Two overrides, one commit: a second emit would be a second prefs PUT, a
    // second Electron mirror push, and a commit in between where BOTH bindings
    // really do answer to ⌘⇧C.
    assert.equal(emits, 1);
    assert.deepEqual(getKeybindingOverrides(), {
      'tool.manuals.open': 'Mod+Shift+C',
      'tool.calculator.open': null,
    });
    assert.equal(fire({ key: 'c', code: 'KeyC', metaKey: true, shiftKey: true }), 'tool.manuals.open');
  });

  it('gives the binding-table snapshot a NEW identity, or nothing repaints', () => {
    // Every React consumer reads the table through
    // `useSyncExternalStore(subscribeKeybindings, listKeybindings)`, and React
    // bails out of re-rendering when the snapshot compares identical. An
    // override that emits without changing the snapshot leaves every chord hint
    // in the app advertising the OLD chord until a reload — the exact
    // stale-hint failure the registry exists to make unrepresentable.
    registerFixture();
    const before = listKeybindings();
    setKeybindingOverride('tool.manuals.open', 'Mod+Alt+KeyQ');
    assert.notEqual(listKeybindings(), before);
    assert.equal(keybindingFace('tool.manuals.open'), formatChord(parseChord('Mod+Alt+KeyQ')!));
  });

  it('displaces by DISABLING, never by clearing', () => {
    // Clearing would restore the displaced binding's default, which is the very
    // chord being taken — handing the conflict straight back.
    registerFixture();
    applyRebind('tool.manuals.open', 'Mod+Shift+C', { displace: ['tool.calculator.open'] });
    assert.deepEqual(describeKeybinding('tool.calculator.open'), { state: 'disabled' });
  });

  it('the desktop mirror reflects a rebind — a custom key dies without it', () => {
    registerFixture();
    const before = serializeKeybindingsForDesktop();
    assert.ok(
      before.some((entry) => entry.accelerator === 'CommandOrControl+Shift+M'),
      'the shipped accelerator',
    );

    let pushes = 0;
    const off = subscribeKeybindings(() => {
      pushes += 1;
    });
    applyRebind('tool.manuals.open', 'Mod+Alt+KeyP');
    off();

    assert.equal(pushes, 1, 'the mount re-pushes on this emit');
    const after = serializeKeybindingsForDesktop();
    assert.ok(after.some((entry) => entry.accelerator === 'CommandOrControl+Alt+P'));
    assert.ok(!after.some((entry) => entry.accelerator === 'CommandOrControl+Shift+M'));
  });
});

describe('four states, kept apart', () => {
  it('default · custom · disabled · invalid are four different answers', () => {
    registerFixture();
    assert.deepEqual(describeKeybinding('tool.manuals.open'), {
      state: 'default',
      chord: parseChord('Mod+Shift+M'),
    });

    setKeybindingOverride('tool.manuals.open', 'Mod+Alt+KeyQ');
    assert.deepEqual(describeKeybinding('tool.manuals.open'), {
      state: 'custom',
      chord: parseChord('Mod+Alt+KeyQ'),
      spec: 'Mod+Alt+KeyQ',
    });

    setKeybindingOverride('tool.manuals.open', null);
    assert.deepEqual(describeKeybinding('tool.manuals.open'), { state: 'disabled' });

    setKeybindingOverride('tool.manuals.open', 'Mod+Shift');
    assert.deepEqual(describeKeybinding('tool.manuals.open'), {
      state: 'invalid',
      spec: 'Mod+Shift',
      reason: 'unparseable',
    });

    assert.equal(describeKeybinding('nothing.registered'), null);
  });

  it('DISABLED is not the same fact as "no override" — reset does not undo it by accident', () => {
    registerFixture();
    setKeybindingOverride('tool.manuals.open', null);
    assert.equal(fire({ key: 'm', code: 'KeyM', metaKey: true, shiftKey: true }), null);
    // Only an explicit clear brings the default back.
    clearKeybindingOverride('tool.manuals.open');
    assert.equal(fire({ key: 'm', code: 'KeyM', metaKey: true, shiftKey: true }), 'tool.manuals.open');
  });
});

describe('reset', () => {
  it('resetting ONE binding returns it to its default and touches nothing else', () => {
    registerFixture();
    setKeybindingOverrides({
      'tool.manuals.open': 'Mod+Alt+KeyQ',
      'tool.calculator.open': null,
    });
    clearKeybindingOverride('tool.manuals.open');

    assert.deepEqual(getKeybindingOverrides(), { 'tool.calculator.open': null });
    assert.equal(fire({ key: 'm', code: 'KeyM', metaKey: true, shiftKey: true }), 'tool.manuals.open');
    assert.equal(fire({ key: 'c', code: 'KeyC', metaKey: true, shiftKey: true }), null);
  });

  it('resetting a binding with no override does not wake the persistence mount', () => {
    registerFixture();
    let emits = 0;
    const off = subscribeKeybindings(() => {
      emits += 1;
    });
    clearKeybindingOverride('tool.manuals.open');
    off();
    assert.equal(emits, 0, 'an absent key already means "use the default"');
  });

  it('RESET ALL returns the operator to the shipped set — disables included', () => {
    registerFixture();
    setKeybindingOverrides({
      'tool.manuals.open': 'Mod+Alt+KeyQ',
      'tool.calculator.open': null,
      'tile.close': 'Mod+Alt+KeyZ',
    });
    clearAllKeybindingOverrides();

    assert.deepEqual(getKeybindingOverrides(), {});
    assert.equal(fire({ key: 'm', code: 'KeyM', metaKey: true, shiftKey: true }), 'tool.manuals.open');
    assert.equal(fire({ key: 'c', code: 'KeyC', metaKey: true, shiftKey: true }), 'tool.calculator.open');
    assert.equal(fire({ key: 'w', code: 'KeyW', metaKey: true, shiftKey: true }), 'tile.close');
  });

  it('the shipped set it resets TO is itself conflict-free', () => {
    // "Reset all" is only a promise worth making if the defaults cohere. If two
    // bindings ship on one chord in one scope, an operator who resets lands on
    // a broken table with no way to tell it was broken before they touched it.
    registerFixture();
    assert.deepEqual(findDefaultChordConflicts(), []);

    registerKeybinding({
      id: 'tool.duplicate.open',
      chord: 'Mod+Shift+M',
      label: 'Duplicate',
      scope: 'global',
      run: () => {},
    });
    const conflicts = findDefaultChordConflicts();
    assert.equal(conflicts.length, 1);
    assert.deepEqual([...conflicts[0].bindingIds].sort(), [
      'tool.duplicate.open',
      'tool.manuals.open',
    ]);
  });
});

describe('applyRebind writes only what an operator would recognise', () => {
  it('rebinding to the shipped default clears the override instead of storing one', () => {
    registerKeybinding({
      id: 'tool.clipboard.open',
      chord: 'Mod+Shift+V',
      label: 'Clipboard',
      scope: 'global',
      run: () => {},
    });

    // The operator opens Controls, captures the chord it already has, and
    // presses it. Nothing changed, so nothing may be recorded as changed:
    // storing the spec would paint the row "Modified" in blue beside a
    // `default ⌘⇧V` face identical to the one next to it, and inflate the
    // header's "N changed" count.
    applyRebind('tool.clipboard.open', 'Mod+Shift+V');

    assert.equal('tool.clipboard.open' in getKeybindingOverrides(), false);
    assert.deepEqual(describeKeybinding('tool.clipboard.open'), {
      state: 'default',
      chord: parseChord('Mod+Shift+V'),
    });
  });

  it('a genuine remap still stores a custom override', () => {
    registerKeybinding({
      id: 'tool.clipboard.open',
      chord: 'Mod+Shift+V',
      label: 'Clipboard',
      scope: 'global',
      run: () => {},
    });
    applyRebind('tool.clipboard.open', 'Mod+Shift+B');
    assert.equal(describeKeybinding('tool.clipboard.open')?.state, 'custom');
  });

  it('does not disable a displaced binding that has since unregistered', () => {
    registerKeybinding({
      id: 'tool.keeper.open',
      chord: 'Mod+Shift+K',
      label: 'Keeper',
      scope: 'global',
      run: () => {},
    });

    // `displace` is computed when the operator PRESSES the chord and spent when
    // they click Reassign. A tool-scoped binding can unmount in between —
    // closing the tile that owns it is enough. Writing `null` for an id nobody
    // holds any more persists a disable to staff_preferences that silently
    // turns that binding off next time its surface mounts, and that no row in
    // Controls can undo: `KeybindingRow` renders nothing for an unknown id.
    applyRebind('tool.keeper.open', 'Mod+Shift+G', {
      displace: ['tool.long-gone.open'],
    });

    const overrides = getKeybindingOverrides();
    assert.equal('tool.long-gone.open' in overrides, false);
    assert.equal(overrides['tool.keeper.open'], 'Mod+Shift+G');
  });

  it('still disables a displaced binding that is genuinely registered', () => {
    registerKeybinding({
      id: 'tool.taker.open',
      chord: 'Mod+Shift+T',
      label: 'Taker',
      scope: 'global',
      run: () => {},
    });
    registerKeybinding({
      id: 'tool.holder.open',
      chord: 'Mod+Shift+H',
      label: 'Holder',
      scope: 'global',
      run: () => {},
    });

    applyRebind('tool.taker.open', 'Mod+Shift+H', { displace: ['tool.holder.open'] });

    assert.equal(getKeybindingOverrides()['tool.holder.open'], null);
    assert.equal(describeKeybinding('tool.holder.open')?.state, 'disabled');
  });
});
