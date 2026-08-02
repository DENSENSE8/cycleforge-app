/**
 * Right-rail record-inspector header contract.
 *
 * Pins two laws from `source-of-truth.md` → Panel header grammar /
 * `display/right-rail-inspector.md`:
 *
 *  1. A file that both registers a `DetailStackRailRegistrar` and imports
 *     `SidebarIntakeFormShell` must be on the intake/create allowlist — record
 *     peeks compose `PaneHeader`, never the intake hero-title shell.
 *  2. Review catalog-link / import-exception rails (the Bose-title regression)
 *     must compose `PaneHeader` + `PaneHeaderLabel` and must not import the
 *     intake shell.
 *
 * Run: npx tsx --test src/components/right-rail/right-rail-inspector-header.guard.test.ts
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '../../..');
const SRC = join(ROOT, 'src');

function read(rel: string): string {
  return readFileSync(resolve(ROOT, rel), 'utf8');
}

function code(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
}

/** Create / import / prefs overlays that may keep SidebarIntakeFormShell. */
const INTAKE_SHELL_WITH_REGISTRAR_ALLOWLIST = new Set<string>([
  'src/components/sidebar/receiving/incoming/IncomingImportEbayOverlay.tsx',
  'src/components/ui/table-column-config/GridColumnDetailsPanel.tsx',
]);

/** Record peeks that must never re-adopt the intake hero-title shell. */
const RECORD_RAIL_MUST_USE_PANE_HEADER = [
  'src/features/review/catalog-link/CatalogLinkFormRail.tsx',
] as const;

function walkTsx(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === '.next' || name === 'dist') continue;
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) {
      walkTsx(full, out);
      continue;
    }
    if (name.endsWith('.tsx')) out.push(full);
  }
  return out;
}

describe('right-rail inspector header', () => {
  it('forbids SidebarIntakeFormShell on DetailStackRailRegistrar files outside the intake allowlist', () => {
    const offenders: string[] = [];
    for (const full of walkTsx(SRC)) {
      const rel = relative(ROOT, full).split('\\').join('/');
      const src = code(readFileSync(full, 'utf8'));
      const hasRegistrar =
        src.includes('DetailStackRailRegistrar') || src.includes('useRegisterRightPanel');
      const hasIntakeShell = src.includes('SidebarIntakeFormShell');
      if (!hasRegistrar || !hasIntakeShell) continue;
      if (INTAKE_SHELL_WITH_REGISTRAR_ALLOWLIST.has(rel)) continue;
      offenders.push(rel);
    }
    assert.deepEqual(
      offenders,
      [],
      `Record rails must use PaneHeader, not SidebarIntakeFormShell. Offenders: ${offenders.join(', ') || '(none)'}. ` +
        'If this is a create/import/prefs overlay, add it to INTAKE_SHELL_WITH_REGISTRAR_ALLOWLIST with a reason. ' +
        'Recipe: .claude/rules/display/right-rail-inspector.md',
    );
  });

  it('catalog-link / import-exception rails compose PaneHeader identity, not intake shell', () => {
    for (const rel of RECORD_RAIL_MUST_USE_PANE_HEADER) {
      const src = code(read(rel));
      assert.equal(
        src.includes('SidebarIntakeFormShell'),
        false,
        `${rel} must not import SidebarIntakeFormShell (intake hero-title chrome)`,
      );
      assert.ok(src.includes('PaneHeader'), `${rel} must compose PaneHeader`);
      assert.ok(src.includes('PaneHeaderLabel'), `${rel} must compose PaneHeaderLabel`);
      assert.ok(src.includes('PaneHeaderActionBar'), `${rel} must compose PaneHeaderActionBar`);
      assert.ok(src.includes('PaneHeaderCloseButton'), `${rel} must compose PaneHeaderCloseButton`);
      // Short identity keys — never productTitle as the header title prop of an intake shell.
      assert.equal(
        /title=\{[^}]*productTitle/.test(src),
        false,
        `${rel} must not put productTitle in a header title prop`,
      );
    }
  });

  it('display contract file exists and names the intake-shell ban', () => {
    const doc = read('.claude/rules/display/right-rail-inspector.md');
    assert.match(doc, /SidebarIntakeFormShell/);
    assert.match(doc, /PaneHeaderLabel/);
    assert.match(doc, /wrapping hero title/i);
  });
});
