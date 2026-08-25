/**
 *   npx tsx --test src/lib/keybindings/registry.test.ts
 *
 * DB-free and React-free: the registry is a module singleton over plain data
 * and the dispatcher takes an injected `isEditableTarget`, so every invariant
 * here runs with no DOM.
 */

import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';

import {
  dispatchKeybinding,
  findKeybindingConflicts,
  getKeybindingOverrides,
  keybindingFace,
  listKeybindings,
  registerKeybinding,
  resetKeybindings,
  resolveChord,
  setKeybindingOverrides,
  wedgeReachability,
} from './registry';
import { parseChord } from './chord';
import {
  serializeKeybindingsForDesktop,
  toElectronAccelerator,
} from './desktop-mirror';
import {
  parseKeybindingOverrides,
  serializeKeybindings,
  keybindingsStorageKey,
} from './persistence';

interface FiredEvent {
  key: string;
  code?: string;
  metaKey?: boolean;
  ctrlKey?: boolean;
  altKey?: boolean;
  shiftKey?: boolean;
}

function fire(
  event: FiredEvent,
  deps: { isEditableTarget?: boolean; overlayOpen?: boolean } = {},
) {
  let prevented = false;
  let stopped = false;
  const id = dispatchKeybinding(
    {
      key: event.key,
      code: event.code ?? '',
      metaKey: event.metaKey ?? false,
      ctrlKey: event.ctrlKey ?? false,
      altKey: event.altKey ?? false,
      shiftKey: event.shiftKey ?? false,
      preventDefault: () => {
        prevented = true;
      },
      stopPropagation: () => {
        stopped = true;
      },
    },
    { isEditableTarget: deps.isEditableTarget ?? false, overlayOpen: deps.overlayOpen },
  );
  return { id, prevented, stopped };
}

beforeEach(() => {
  resetKeybindings();
});

describe('registration', () => {
  it('binds a chord and fires it exactly once', () => {
    let ran = 0;
    registerKeybinding({
      id: 'tool.calculator.open',
      chord: 'Mod+Shift+C',
      label: 'Open Calculator',
      run: () => {
        ran += 1;
      },
    });

    const result = fire({ key: 'C', metaKey: true, shiftKey: true });
    assert.equal(result.id, 'tool.calculator.open');
    assert.equal(ran, 1);
    assert.equal(result.prevented, true);
    assert.equal(result.stopped, true);
  });

  it('REFUSES a chord a barcode wedge could type', () => {
    // A wedge emits bare characters and Enter. Binding one arms every scan.
    registerKeybinding({
      id: 'bad.bare-letter',
      chord: 'P',
      label: 'Nope',
      run: () => {
        throw new Error('a wedge-reachable chord must never bind');
      },
    });
    registerKeybinding({
      id: 'bad.bare-enter',
      chord: 'Enter',
      label: 'Nope',
      run: () => {
        throw new Error('a wedge-reachable chord must never bind');
      },
    });
    assert.equal(listKeybindings().length, 0);
    assert.equal(fire({ key: 'p' }).id, null);
    assert.equal(fire({ key: 'Enter', code: 'Enter' }).id, null);
  });

  it('refuses EVERY printable code, not a sample of the likely ones', () => {
    // The whole set of `KeyboardEvent.code` values that put a character on the
    // screen. A code missing from the predicate is a chord an operator can bind
    // on the Controls screen and then have fire once per matching character on
    // every carton — `(01)` alone reaches the numpad parens, and `#` is
    // `IntlHash` on every ISO keyboard rather than `Backslash`.
    const printable = [
      'Backquote', 'Minus', 'Equal', 'BracketLeft', 'BracketRight', 'Backslash',
      'Semicolon', 'Quote', 'Comma', 'Period', 'Slash', 'Space',
      'Digit0', 'Digit9', 'Numpad0', 'Numpad9',
      'NumpadAdd', 'NumpadSubtract', 'NumpadMultiply', 'NumpadDivide',
      'NumpadDecimal', 'NumpadComma', 'NumpadEqual',
      'NumpadParenLeft', 'NumpadParenRight',
      'IntlBackslash', 'IntlRo', 'IntlYen', 'IntlHash',
    ];
    const armed = printable.filter(
      (key) =>
        wedgeReachability({
          key,
          kind: 'code',
          mod: false,
          shift: false,
          alt: false,
          ctrl: false,
          meta: false,
        }) === null,
    );
    assert.deepEqual(armed, [], `these would arm on every scan: ${armed.join(', ')}`);

    // Holding ⇧ does not rescue any of them — a wedge types capitals with Shift.
    const shifted = printable.filter(
      (key) =>
        wedgeReachability({
          key,
          kind: 'code',
          mod: false,
          shift: true,
          alt: false,
          ctrl: false,
          meta: false,
        }) === null,
    );
    assert.deepEqual(shifted, []);

    // …and a real modifier does: these are the chords the rebinder must allow.
    assert.equal(
      wedgeReachability({
        key: 'NumpadParenLeft',
        kind: 'code',
        mod: true,
        shift: false,
        alt: false,
        ctrl: false,
        meta: false,
      }),
      null,
    );
  });

  it('drops an unparseable spec instead of binding something else', () => {
    registerKeybinding({
      id: 'bad.spec',
      chord: 'Mod+Shift',
      label: 'Nope',
      run: () => {
        throw new Error('an unparseable chord must never bind');
      },
    });
    assert.equal(listKeybindings().length, 0);
  });

  it('unregistering is scoped to THIS registration, not to the id', () => {
    const disposeFirst = registerKeybinding({
      id: 'tool.manuals.open',
      chord: 'Mod+Shift+M',
      label: 'first',
      run: () => {},
    });
    registerKeybinding({
      id: 'tool.manuals.open',
      chord: 'Mod+Shift+M',
      label: 'second',
      run: () => {},
    });
    // A stale cleanup from the replaced registration must not delete the live one.
    disposeFirst();
    assert.equal(listKeybindings().length, 1);
    assert.equal(listKeybindings()[0].label, 'second');
  });

  it('never claims a key nothing bound — a wedge burst flows through', () => {
    registerKeybinding({
      id: 'tool.calculator.open',
      chord: 'Mod+Shift+C',
      label: 'Open Calculator',
      run: () => {},
    });
    const scan = fire({ key: 'A' });
    assert.equal(scan.id, null);
    assert.equal(scan.prevented, false);
    assert.equal(scan.stopped, false);
  });
});

describe('standing down', () => {
  it('stands down inside an editable target unless the binding opts in', () => {
    let guarded = 0;
    let optedIn = 0;
    registerKeybinding({
      id: 'guarded',
      chord: 'Mod+Shift+V',
      label: 'guarded',
      run: () => {
        guarded += 1;
      },
    });
    registerKeybinding({
      id: 'opted-in',
      chord: 'Mod+Shift+J',
      label: 'opted in',
      allowInEditable: true,
      run: () => {
        optedIn += 1;
      },
    });

    assert.equal(fire({ key: 'v', metaKey: true, shiftKey: true }, { isEditableTarget: true }).id, null);
    assert.equal(guarded, 0);
    assert.equal(
      fire({ key: 'j', metaKey: true, shiftKey: true }, { isEditableTarget: true }).id,
      'opted-in',
    );
    assert.equal(optedIn, 1);
  });

  it('stands down entirely while an overlay owns the keyboard', () => {
    registerKeybinding({
      id: 'x',
      chord: 'Mod+Shift+X',
      label: 'x',
      run: () => {
        throw new Error('must not fire under an overlay');
      },
    });
    assert.equal(
      fire({ key: 'x', metaKey: true, shiftKey: true }, { overlayOpen: true }).id,
      null,
    );
  });

  it('honours a `when` guard', () => {
    let armed = false;
    registerKeybinding({
      id: 'tool-scoped',
      chord: 'Mod+Shift+G',
      label: 'tool scoped',
      scope: 'tool',
      when: () => armed,
      run: () => {},
    });
    assert.equal(fire({ key: 'g', metaKey: true, shiftKey: true }).id, null);
    armed = true;
    assert.equal(fire({ key: 'g', metaKey: true, shiftKey: true }).id, 'tool-scoped');
  });
});

describe('precedence', () => {
  it('a tool-scoped chord beats the global one — mount order is irrelevant', () => {
    const fired: string[] = [];
    // Register global FIRST, so a mount-order winner would be the wrong answer.
    registerKeybinding({
      id: 'global.escape',
      chord: 'Mod+Shift+E',
      label: 'global',
      scope: 'global',
      run: () => fired.push('global'),
    });
    registerKeybinding({
      id: 'tool.escape',
      chord: 'Mod+Shift+E',
      label: 'tool',
      scope: 'tool',
      run: () => fired.push('tool'),
    });

    assert.equal(fire({ key: 'e', metaKey: true, shiftKey: true }).id, 'tool.escape');
    assert.deepEqual(fired, ['tool'], 'exactly one binding runs, and it is the inner scope');
  });
});

describe('conflicts', () => {
  it('reports two bindings on one chord in ONE scope', () => {
    registerKeybinding({ id: 'a', chord: 'Mod+Shift+D', label: 'a', run: () => {} });
    registerKeybinding({ id: 'b', chord: 'shift+mod+d', label: 'b', run: () => {} });

    const conflicts = findKeybindingConflicts();
    assert.equal(conflicts.length, 1);
    assert.deepEqual([...conflicts[0].bindingIds].sort(), ['a', 'b']);
    assert.equal(conflicts[0].scope, 'global');
  });

  it('does NOT report the same chord in two different scopes', () => {
    registerKeybinding({
      id: 'global.d',
      chord: 'Mod+Shift+D',
      label: 'global',
      scope: 'global',
      run: () => {},
    });
    registerKeybinding({
      id: 'tool.d',
      chord: 'Mod+Shift+D',
      label: 'tool',
      scope: 'tool',
      run: () => {},
    });
    assert.deepEqual(findKeybindingConflicts(), []);
  });

  it('sees a conflict an OVERRIDE created', () => {
    registerKeybinding({ id: 'a', chord: 'Mod+Shift+A', label: 'a', run: () => {} });
    registerKeybinding({ id: 'b', chord: 'Mod+Shift+B', label: 'b', run: () => {} });
    assert.deepEqual(findKeybindingConflicts(), []);

    setKeybindingOverrides({ b: 'Mod+Shift+A' });
    assert.equal(findKeybindingConflicts().length, 1);
  });
});

describe('overrides', () => {
  it('retargets a binding, and the FACE follows the binding', () => {
    let ran = 0;
    registerKeybinding({
      id: 'tool.manuals.open',
      chord: 'Mod+Shift+M',
      label: 'Open Manuals',
      run: () => {
        ran += 1;
      },
    });
    setKeybindingOverrides({ 'tool.manuals.open': 'Alt+2' });

    assert.equal(fire({ key: 'm', metaKey: true, shiftKey: true }).id, null, 'the default is gone');
    assert.equal(fire({ key: '™', code: 'Digit2', altKey: true }).id, 'tool.manuals.open');
    assert.equal(ran, 1);
    // The hint and the listener come from one declaration, so they cannot drift.
    assert.equal(keybindingFace('tool.manuals.open'), 'Alt+2');
  });

  it('`null` disables a binding without restoring the default', () => {
    registerKeybinding({
      id: 'tool.calculator.open',
      chord: 'Mod+Shift+C',
      label: 'Open Calculator',
      run: () => {
        throw new Error('a disabled binding must not fire');
      },
    });
    setKeybindingOverrides({ 'tool.calculator.open': null });

    assert.equal(resolveChord('tool.calculator.open'), null);
    assert.equal(fire({ key: 'c', metaKey: true, shiftKey: true }).id, null);
    assert.equal(keybindingFace('tool.calculator.open'), '');
  });

  it('an unparseable override leaves the binding unbound, not silently re-armed', () => {
    registerKeybinding({
      id: 'tool.calculator.open',
      chord: 'Mod+Shift+C',
      label: 'Open Calculator',
      run: () => {
        throw new Error('a broken override must not fall back to the default');
      },
    });
    setKeybindingOverrides({ 'tool.calculator.open': 'Mod+Shift' });
    assert.equal(resolveChord('tool.calculator.open'), null);
    assert.equal(fire({ key: 'c', metaKey: true, shiftKey: true }).id, null);
  });

  it('an ABSENT key is "use the default" — different from an explicit null', () => {
    registerKeybinding({
      id: 'tool.calculator.open',
      chord: 'Mod+Shift+C',
      label: 'Open Calculator',
      run: () => {},
    });
    setKeybindingOverrides({ 'some.other.binding': 'Mod+Shift+Z' });
    assert.equal(fire({ key: 'c', metaKey: true, shiftKey: true }).id, 'tool.calculator.open');
  });
});

describe('persistence', () => {
  it('round-trips the whole map — never a nested partial', () => {
    setKeybindingOverrides({ a: 'Mod+Shift+A', b: null });
    const wire = serializeKeybindings();
    assert.deepEqual(wire, { a: 'Mod+Shift+A', b: null });

    setKeybindingOverrides({});
    assert.deepEqual(getKeybindingOverrides(), {});

    const parsed = parseKeybindingOverrides(JSON.parse(JSON.stringify(wire)));
    assert.deepEqual(parsed, { a: 'Mod+Shift+A', b: null });
  });

  it('rejects an untrusted bag that is not a map of specs', () => {
    assert.equal(parseKeybindingOverrides({ a: 42 }), null);
    assert.equal(parseKeybindingOverrides('nope'), null);
    assert.equal(parseKeybindingOverrides(null), null);
  });

  it('the mirror key carries org + staff — a shared bench is the normal case', () => {
    const key = keybindingsStorageKey({ orgId: 'org-1', staffId: 7 });
    assert.match(key, /org-1/);
    assert.match(key, /7/);
    assert.notEqual(key, keybindingsStorageKey({ orgId: 'org-1', staffId: 8 }));
  });
});

describe('desktop mirror', () => {
  it('converts a chord to an Electron accelerator', () => {
    assert.equal(toElectronAccelerator(parseChord('Mod+Shift+M')!), 'CommandOrControl+Shift+M');
    assert.equal(toElectronAccelerator(parseChord('Alt+1')!), 'Alt+1');
    assert.equal(toElectronAccelerator(parseChord('Escape')!), 'Escape');
    // Electron spells arrows without the `Arrow` prefix.
    assert.equal(toElectronAccelerator(parseChord('Mod+Up')!), 'CommandOrControl+Up');
    assert.equal(toElectronAccelerator(parseChord('F2')!), 'F2');
  });

  it('DROPS a chord with no faithful accelerator rather than approximating it', () => {
    // An approximate global shortcut steals a key the operator never asked for,
    // system-wide — worse than the binding staying renderer-only.
    assert.equal(toElectronAccelerator(parseChord('Mod+ContextMenu')!), null);
  });

  it('lists only bindings the shell should actually claim', () => {
    registerKeybinding({ id: 'a', chord: 'Mod+Shift+A', label: 'a', run: () => {} });
    registerKeybinding({ id: 'b', chord: 'Mod+Shift+B', label: 'b', run: () => {} });
    registerKeybinding({ id: 'c', chord: 'Mod+ContextMenu', label: 'c', run: () => {} });
    setKeybindingOverrides({ b: null });

    assert.deepEqual(serializeKeybindingsForDesktop(), [
      { id: 'a', accelerator: 'CommandOrControl+Shift+A' },
    ]);
  });
});
