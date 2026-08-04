/**
 * A grid VIEW declares its domain; it does not re-wire the spreadsheet.
 *
 * ## What collapsed, and why a guard is the only thing that keeps it collapsed
 *
 * Until 2026-08-02 every descriptor-driven grid view repeated the same six-part
 * ritual — a `useState(columnDetailsOpen)`, a `useGridColumnVisibility`, a
 * `useMemo(() => makeXDescriptor(visible))`, a `columnDetails={{…}}` prop, a
 * sibling `<GridColumnDetailsPanel>`, and its `tableId` re-typed four times.
 * Thirteen files, ~40 identical lines each, and the lifted `columnDetailsOpen`
 * was never read outside the subtree that could have owned it. Both of its
 * consumers (the trigger and the panel) live inside the surface.
 *
 * `LedgerGridSurface` now owns visibility resolution and the descriptor build;
 * `GridColumnGutter` owns the open state, the trigger and the panel mount. A
 * view supplies its column MODEL and its `makeDescriptor`, and nothing else.
 *
 * **`knip` cannot see this un-collapse.** A view that re-lifts the state imports
 * `GridColumnDetailsPanel` — a real, reachable import — so every door is "used"
 * and dead-code tooling stays silent. That is the corollary in
 * `pattern-evolution.md` → Always #6: a dead-code tool answers *"is this
 * reachable"*, never *"is this the only way in"*. Only a guard answers the
 * second, so this file is the ruling; the prose is a pointer to it.
 *
 * ## The scope is DISCOVERED, and behaviourally
 *
 * Not by filename. A `*GridView.tsx` walk would certify the thirteen that exist
 * today and miss the fourteenth the moment someone names it `FooTable.tsx` —
 * the same gap the capabilities guard closed by walking mounts instead of a
 * hand list. Scope here is *anything that touches the plumbing*: a
 * `LedgerGridSurface` mount, a `GridColumnGutter` mount, or an import of the
 * rail.
 *
 * ## The allowlist shrinks and cannot go stale
 *
 * It is keyed per FILE **and per SYMBOL**, so an exemption states exactly what
 * is still hand-wired rather than exempting a file wholesale. And every entry is
 * asserted to still be NEEDED: an allowlisted symbol the file no longer contains
 * FAILS, which is what stops a finished migration from leaving a line behind
 * that quietly re-opens the door for the next author.
 */
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');
const SRC = path.join(ROOT, 'src');

const SURFACE = 'src/design-system/components/grid/LedgerGridSurface.tsx';
const GUTTER = 'src/design-system/components/grid/GridColumnDetailsTrigger.tsx';
const PANEL = 'src/components/ui/table-column-config/GridColumnDetailsPanel.tsx';

/** The modules that DEFINE the recipe rather than composing it. */
const DS_OWN = new Set([SURFACE, GUTTER, PANEL]);

/**
 * The banned plumbing, by the symbol a re-expansion would reintroduce.
 *
 * The load-bearing one is `railImport`, and it is deliberately anchored on the
 * MODULE PATH rather than on a JSX tag or a variable name. A tag ban
 * (`/<GridColumnDetailsPanel/`) is defeated by
 * `import { GridColumnDetailsPanel as ColumnRail }`, and a name ban
 * (`columnDetailsOpen`) is defeated by calling the state `railOpen` — between
 * them a complete un-collapse would have been invisible. A view cannot mount
 * the rail under any alias without importing the module, and the path is not
 * something a rename can dodge.
 */
const PLUMBING = {
  railImport: {
    re: /from '@\/components\/ui\/table-column-config\/GridColumnDetailsPanel'/,
    why: 'GridColumnGutter mounts the rail — a second mount is a second door onto `detail:grid-column-details`, which is the fork that already had to be undone once when chrome Fields and the header lip both opened it. A view has no reason to import the module at all',
  },
  columnDetailsOpen: {
    re: /columnDetailsOpen/,
    why: 'the column-display open state belongs to GridColumnGutter — both of its consumers (the trigger and the rail) are mounted there, so lifting it to a view lifts it past every reader',
  },
  useGridColumnVisibility: {
    re: /useGridColumnVisibility/,
    why: 'LedgerGridSurface resolves visibility from the FULL `columns` you pass it and hands the resolved list back through renderColumnHeader / renderRow / renderGroup',
  },
  columnDetails: {
    // Deliberately `columnDetails=` and not `columnDetails={{` — the prop is
    // gone from the props type so TypeScript already rejects the object-literal
    // form, and pinning the literal would have missed `columnDetails={bag}`.
    re: /columnDetails=/,
    why: 'the `columnDetails` prop is gone from LedgerGridSurface; the surface owns the control',
  },
} as const;

type PlumbingSymbol = keyof typeof PLUMBING;

/**
 * SHRINK-ONLY. Finishing a migration removes a line; nothing may add one without
 * a stated reason, and an entry that is no longer needed fails below.
 */
const ALLOWLIST: Readonly<Record<string, readonly PlumbingSymbol[]>> = {
  // Orders shell plumbing closed 2026-08-03 — `OrdersGridView` mounts
  // `LedgerGridSurface` with `forceHidden` + controlled `columnOrder`. The
  // allowlisted header fork (`OrdersQueueColumnHeader`) remains; it is not a
  // plumbing exemption here (header factory guard owns that).
};

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry.startsWith('.')) continue;
    const abs = path.join(dir, entry);
    if (statSync(abs).isDirectory()) walk(abs, out);
    else if (entry.endsWith('.tsx') && !entry.includes('.test.')) out.push(path.relative(ROOT, abs));
  }
  return out;
}

/**
 * Anything that touches the spreadsheet plumbing — a surface mount, a gutter
 * mount, or an import of the rail. Discovery is by CONTENT, never by filename:
 * a `*GridView.tsx` walk would certify the thirteen that exist today and miss
 * the fourteenth the moment someone names it `FooTable.tsx`.
 */
const TOUCHES = /<LedgerGridSurface[<\s/>]|<GridColumnGutter[\s>]|GridColumnDetailsPanel/;

const CONSUMERS = walk(SRC)
  .filter((rel) => !DS_OWN.has(rel))
  .filter((rel) => TOUCHES.test(readFileSync(path.join(ROOT, rel), 'utf8')))
  .sort();

describe('grid view plumbing', () => {
  it('the walk actually finds the grid views', () => {
    // A discovery guard that discovers nothing is green and worthless.
    assert.ok(
      CONSUMERS.length >= 12,
      `expected the grid views that compose the spreadsheet surface, found ${CONSUMERS.length}`,
    );
  });

  for (const rel of CONSUMERS) {
    const allowed = ALLOWLIST[rel] ?? [];

    it(`${path.basename(rel)} declares its domain, not the plumbing`, () => {
      const source = readFileSync(path.join(ROOT, rel), 'utf8');
      // Strip comments — a docblock is allowed to NAME what it no longer does.
      const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

      for (const [symbol, { re, why }] of Object.entries(PLUMBING) as [
        PlumbingSymbol,
        (typeof PLUMBING)[PlumbingSymbol],
      ][]) {
        if (allowed.includes(symbol)) continue;
        assert.doesNotMatch(
          code,
          re,
          `${rel} must not hand-wire \`${symbol}\` — ${why}.\n` +
            `See LedgerGridSurface's docblock for the inverted API. If this is a genuine\n` +
            `exception, add the SYMBOL to ALLOWLIST with the reason, never the whole file.`,
        );
      }
    });

    if (allowed.length > 0) {
      it(`${path.basename(rel)}'s allowlist entries are still needed`, () => {
        const code = readFileSync(path.join(ROOT, rel), 'utf8')
          .replace(/\/\*[\s\S]*?\*\//g, '')
          .replace(/^\s*\/\/.*$/gm, '');
        for (const symbol of allowed) {
          assert.match(
            code,
            PLUMBING[symbol].re,
            `${rel} no longer hand-wires \`${symbol}\` — delete that entry from ALLOWLIST.\n` +
              `A stale exemption is an open door nobody is walking through yet.`,
          );
        }
      });
    }
  }

  it('a view hands makeDescriptor a stable module-level reference', () => {
    for (const rel of CONSUMERS) {
      const code = readFileSync(path.join(ROOT, rel), 'utf8');
      assert.doesNotMatch(
        code,
        /makeDescriptor=\{\(/,
        `${rel} passes an inline arrow to makeDescriptor. The surface memoizes the\n` +
          `descriptor on [makeDescriptor, visible] and the descriptor carries the TanStack\n` +
          `columnDefs, so a fresh identity every render rebuilds the state engine's column\n` +
          `list every render. Pass the module-level makeXGridDescriptor reference.`,
      );
    }
  });

  it('LedgerGridSurface owns visibility, the descriptor build, and the control', () => {
    const src = readFileSync(path.join(ROOT, SURFACE), 'utf8');
    const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

    // The inversion: the surface takes the FULL model and builds, rather than
    // receiving something the caller already narrowed.
    assert.match(code, /columns: readonly C\[\]/, 'takes the full canonical column model');
    assert.match(
      code,
      /makeDescriptor: \(visible: readonly C\[\]\) => GridSurfaceDescriptor<Row, C>/,
      'takes the family descriptor factory',
    );
    assert.match(
      code,
      /useGridColumnVisibility<C>\(\{[\s\S]*?columns,[\s\S]*?tableId/,
      'resolves visibility',
    );
    assert.match(
      code,
      /<GridColumnGutter\s+tableId=\{tableId\}\s+columns=\{columns\}(?:\s+triggerPortalTarget=\{columnTriggerPortalTarget\})?\s*>/,
      'mounts the control',
    );

    // The un-collapse, spelled as the props it would need back.
    assert.doesNotMatch(code, /^\s*descriptor: GridSurfaceDescriptor/m, 'never takes a pre-narrowed descriptor');
    assert.doesNotMatch(code, /columnDetails\?:/, 'never takes a lifted open state');

    // The linkage key, declared once and typed. It was `tableId?: string` here
    // while GridColumnDetailsPanel typed it `TableId` — the same key declared
    // twice, once loosely, which is what let a surface mount with no prefs
    // identity and silently drop the resize grip.
    assert.match(code, /\btableId: TableId;/, 'tableId is required and typed TableId');
    assert.doesNotMatch(code, /tableId\?: string/, 'the linkage key is never loosely typed');

    // `visible` must reach the renderers, or a view cannot draw the tracks the
    // surface resolved and would have to resolve them again itself.
    assert.match(
      code,
      /interface LedgerGridColumnHeaderApi[\s\S]*?columns: readonly C\[\];/,
      'hands `columns` back to the header api',
    );
    assert.match(code, /api: \{ columns: readonly C\[\] \}/, 'hands `columns` back to the rows');
  });

  it('GridColumnGutter owns the open state and mounts the rail', () => {
    const src = readFileSync(path.join(ROOT, GUTTER), 'utf8');
    const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    assert.match(code, /const \[open, setOpen\] = useState\(false\)/, 'owns the open state');
    assert.match(code, /<GridColumnDetailsPanel/, 'mounts the rail it opens');
    assert.match(code, /tableId=\{tableId\}/, 'keys the rail on the surface prefs identity');
    // The rail must offer the tracks that are currently OFF — that is the only
    // way to turn one back on, so it takes the FULL model, never `visible`.
    assert.match(code, /columns=\{columns\}/, 'hands the rail the full canonical model');
    assert.doesNotMatch(code, /onOpen\?: \(\) => void/, 'the open state is no longer a caller concern');
  });

  it('the rail imports by path, never through a barrel', () => {
    const code = readFileSync(path.join(ROOT, PANEL), 'utf8');

    // 1. Cycle: `@/design-system/components/grid` re-exports GridColumnGutter,
    //    which mounts this panel.
    assert.doesNotMatch(
      code,
      /from '@\/design-system\/components\/grid'/,
      'GridColumnDetailsPanel must import the grid modules by path — the barrel would cycle',
    );

    // 2. Altitude: this module now sits BEHIND the grid barrel, which 64 grid
    //    modules import — including pure data ones. Reaching the primitives
    //    barrel for three components dragged all 52 of them plus
    //    `design-system/hooks` into every one of those graphs (measured: the
    //    barrel's value graph went 68 → 132 modules on that single edge).
    //    `build-gotchas.md` → keep barrels honest.
    assert.doesNotMatch(
      code,
      /from '@\/design-system\/primitives'/,
      'GridColumnDetailsPanel must import primitives by path (Button / Switch /\n' +
        'ToolbarListbox) — the barrel drags all 52 into every grid module that\n' +
        'imports @/design-system/components/grid, data modules included.',
    );
  });
});
