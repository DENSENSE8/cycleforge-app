/**
 * Kiosk-split ProductSelector must not render staff-only meta (Categories /
 * Pick Your Repair / Products eyebrow). Staff stacked layout keeps them.
 * Floating-card POS chrome lives on `kiosk-pos-surface` recipes.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';

const SELECTOR = join(process.cwd(), 'src/components/repair/ProductSelector.tsx');
const SHELL = join(process.cwd(), 'src/app/kiosk/KioskShell.tsx');

function read(path: string): string {
  return readFileSync(path, 'utf8');
}

describe('ProductSelector kiosk-split meta', () => {
  const src = read(SELECTOR);
  const shell = read(SHELL);

  it('keeps Pick Your Repair and Categories on the stacked (staff) path', () => {
    assert.match(src, /Pick Your Repair - All Repairs/);
    assert.match(src, /\{isAtRoot \? 'Categories' : 'Sub-categories'\}/);
  });

  it('gates Pick Your Repair behind !kioskSplit', () => {
    assert.match(src, /isAtRoot && !kioskSplit/);
  });

  it('does not hardcode a Products browse heading from KioskShell', () => {
    assert.doesNotMatch(shell, /KIOSK_PANE_HEADER_TITLE\}>Products</);
    assert.doesNotMatch(shell, /browseHeader=\{/);
  });

  it('owns dynamic All repairs / All items browse title when kioskSplit', () => {
    assert.match(src, /All repairs/);
    assert.match(src, /All items/);
    assert.match(src, /browseHeader \?\?/);
  });

  it('drops the Products grid eyebrow on the POS (kiosk-split) path', () => {
    assert.match(src, /!pos && \(/);
    assert.match(src, /: 'Products'\}/);
  });

  it('composes floating-card POS surface recipes on kiosk-split', () => {
    assert.match(src, /KIOSK_POS_GRID/);
    assert.match(src, /KIOSK_POS_CARD/);
    assert.match(src, /KIOSK_POS_CATEGORY/);
    assert.match(src, /KIOSK_POS_CATEGORY_LABEL/);
    assert.match(src, /KIOSK_POS_SIDEBAR/);
    assert.match(src, /KIOSK_POS_SEARCH_INPUT/);
    assert.match(src, /KIOSK_POS_BROWSE_SCROLL/);
  });

  it('restores a collapsible spine owned by the shell', () => {
    assert.match(shell, /spineExpanded/);
    assert.match(shell, /useState\(false\)/);
    assert.match(shell, /hideBrowseSearch=\{spineExpanded\}/);
    assert.match(shell, /searchQuery=\{catalogSearch\}/);
    assert.match(shell, /onSearchQueryChange=\{setCatalogSearch\}/);
  });

  it('owns catalog search state and accepts a single controlled engine', () => {
    assert.match(src, /const \[internalSearch, setInternalSearch\] = useState\(''\)/);
    assert.match(src, /searchQuery\?: string/);
    assert.match(src, /onSearchQueryChange\?/);
    assert.match(src, /hideBrowseSearch/);
    assert.doesNotMatch(src, /fuse|Fuse|cmd-k|cmdk|CommandPalette/i);
    assert.match(src, /!hideBrowseSearch && renderSearchBar\(\)/);
  });
});
