/**
 * Station Displays footer is stage-owned:
 *   - `index-filter` — Root Index `TechRailSearchBar` (`Filter displays…`)
 *   - `leaf-dismiss` — default leaf `StationDisplaysDismissFooter`
 *   - `leaf-command` — opt-in `StationDisplaysCommandFooter` via setLeafCommands
 *
 * WHY THIS EXISTS
 * `StationDisplaysPushStack` once fused `TechRailSearchBar` (`Filter displays…`)
 * into every footer because `→|` lived in the search trailing track. Leaf
 * Action surfaces inherited list-filter chrome that did not refine the leaf
 * (and typing ejected to the index). SoT said "index-only" for *function*;
 * this guard pins *visibility* too — and the opt-in leaf-command stage must
 * never remount the index filter or invent a second ⌘K.
 *
 *   node --import tsx --test src/components/station/displays/station-displays-footer-stage.guard.test.ts
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';

function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^[ \t]*\/\/.*$/gm, '');
}

const read = (rel: string) => stripComments(readFileSync(join(process.cwd(), rel), 'utf8'));

const STACK = 'src/components/station/displays/StationDisplaysPushStack.tsx';
const DISMISS = 'src/components/station/displays/StationDisplaysDismissFooter.tsx';
const COMMAND = 'src/components/station/displays/StationDisplaysCommandFooter.tsx';
const CHROME = 'src/components/station/displays/displays-leaf-chrome.tsx';
const INVENTORY = 'src/components/receiving/workspace/line-edit/InventoryDisplayHost.tsx';
const SOT = '.claude/rules/source-of-truth.md';

/** Panels that mount the shared push stack (same census as reachability). */
const STACK_HOSTS = [
  'src/components/receiving/workspace/LineEditPanel.tsx',
  'src/components/receiving/triage/TriagePanel.tsx',
  'src/components/tech/TestingPanel.tsx',
  'src/components/packer/PackOrderPanel.tsx',
  'src/components/tech/ActiveOrderWorkspace.tsx',
  'src/features/review/packer/PackerReviewMode.tsx',
  'src/components/support/orders/SupportOrdersFocusHost.tsx',
] as const;

describe('Station Displays footer stage split', () => {
  it('PushStack gates TechRailSearchBar behind index-filter stage', () => {
    const src = read(STACK);
    assert.match(
      src,
      /footerStage === 'index-filter'/,
      'footer prop must branch on footerStage (index-filter vs leaf)',
    );
    assert.match(
      src,
      /TechRailSearchBar/,
      'Root Index still mounts TechRailSearchBar',
    );
    assert.match(
      src,
      /Filter displays…/,
      'index placeholder stays Filter displays…',
    );
    assert.match(
      src,
      /StationDisplaysDismissFooter/,
      'leaf stage mounts StationDisplaysDismissFooter',
    );
    assert.match(
      src,
      /footerStage === 'leaf-command'|footerStage === \"leaf-command\"/,
      'leaf-command is gated via DisplaysFooterStage',
    );
    assert.match(
      src,
      /StationDisplaysCommandFooter/,
      'opt-in leaf-command stage mounts StationDisplaysCommandFooter',
    );
    assert.doesNotMatch(
      src,
      /if \(!onIndex && next\.trim\(\)\) goIndex/,
      'no leaf→index eject-by-typing substitute for Back',
    );

    // TechRailSearchBar must appear only in the index-filter footer branch.
    const footerIdx = src.indexOf('footer={');
    assert.ok(footerIdx >= 0, 'footer prop present');
    const footerSlice = src.slice(footerIdx, footerIdx + 1600);
    const searchIdx = footerSlice.indexOf('TechRailSearchBar');
    const commandIdx = footerSlice.indexOf('StationDisplaysCommandFooter');
    const dismissIdx = footerSlice.indexOf('StationDisplaysDismissFooter');
    assert.ok(searchIdx >= 0, 'TechRailSearchBar inside footer prop');
    assert.ok(commandIdx >= 0, 'CommandFooter inside footer prop');
    assert.ok(dismissIdx >= 0, 'DismissFooter inside footer prop');
    assert.ok(
      searchIdx < commandIdx && commandIdx < dismissIdx,
      'footer order: index-filter → leaf-command → leaf-dismiss',
    );
    const afterSearch = footerSlice.slice(searchIdx + 'TechRailSearchBar'.length);
    assert.doesNotMatch(
      afterSearch,
      /TechRailSearchBar/,
      'leaf branches must not remount TechRailSearchBar',
    );
  });

  it('Esc closes command palette before leaf pop', () => {
    const src = read(STACK);
    assert.match(src, /if \(commandOpen\)/);
    assert.match(src, /setCommandOpen\(false\)/);
    assert.match(
      src,
      /onIndex && filterQuery\.trim\(\)/,
      'index Esc clears a live filter before closing the column',
    );
  });

  it('index-filter TechRailSearchBar wires onKeyDown into the index list', () => {
    const src = read(STACK);
    assert.match(src, /indexFilterKeysRef/);
    assert.match(src, /onFilterKeyDown/);
    assert.match(
      src,
      /onKeyDown=\{\(e\) => indexFilterKeysRef\.current\?\.onFilterKeyDown\(e\)\}/,
    );
    const searchBar = read('src/components/sidebar/tech/TechRailSearchBar.tsx');
    assert.match(
      searchBar,
      /flushSync/,
      'nav keys flush the draft so Enter commits against typed text',
    );
  });

  it('DismissFooter is →| only — no list filter field', () => {
    const src = read(DISMISS);
    assert.match(src, /station-displays-dismiss-footer/);
    assert.match(src, /StationDisplaysEdgeToggle/);
    assert.match(src, /variant="column-close"/);
    assert.doesNotMatch(
      src,
      /TechRailSearchBar|Filter displays|SearchBar|SearchField/,
      'dismiss footer must not mount list-filter chrome',
    );
  });

  it('CommandFooter is / palette + →| — never index filter copy', () => {
    const src = read(COMMAND);
    assert.match(src, /station-displays-command-footer/);
    assert.match(src, /StationDisplaysEdgeToggle/);
    assert.match(src, /placeholder="Command…"/);
    assert.match(src, /COMMAND_SCAN_BURST_MS|SCAN_BURST/);
    assert.match(src, /isEditableKeyTarget|isEditable/);
    assert.match(src, /hasOpenOverlay|pushOverlay/);
    assert.match(src, /isKeyboardRegionOwner\('right'\)/);
    assert.doesNotMatch(
      src,
      /TechRailSearchBar|Filter displays…/,
      'leaf-command must not remount index filter chrome',
    );
    assert.doesNotMatch(
      src,
      /goIndex|onTabChange\(['"]index['"]\)/,
      'command footer must not eject to index',
    );
    // No bare digit key binds as actions — wedge law.
    assert.doesNotMatch(
      src,
      /e\.key === ['"][0-9]['"]/,
      'no bare digit command binds',
    );
  });

  it('leaf chrome exposes setLeafCommands for opt-in', () => {
    const src = read(CHROME);
    assert.match(src, /setLeafCommands/);
    assert.match(src, /DisplaysFooterCommand/);
  });

  it('Inventory golden opt-in registers leaf commands on sub-leaves', () => {
    const src = read(INVENTORY);
    assert.match(src, /setLeafCommands/);
    assert.match(src, /change po|change-po/);
    assert.match(src, /save notes|save-notes/);
    assert.match(src, /slash:\s*['"]refresh['"]/);
  });

  it('stack hosts do not fork a page-local Displays footer filter', () => {
    for (const host of STACK_HOSTS) {
      const src = read(host);
      assert.match(
        src,
        /<StationDisplaysPushStack/,
        `${host} must mount the shared stack`,
      );
      assert.doesNotMatch(
        src,
        /Filter displays…/,
        `${host}: no page-local Filter displays… twin outside the stack`,
      );
      assert.doesNotMatch(
        src,
        /TechRailSearchBar/,
        `${host}: Displays footer filter stays inside StationDisplaysPushStack`,
      );
    }
  });

  it('Filter displays… lives only on the stack index footer', () => {
    const stack = read(STACK);
    const dismiss = read(DISMISS);
    const command = read(COMMAND);
    assert.match(stack, /Filter displays…/);
    assert.doesNotMatch(dismiss, /Filter displays…/);
    assert.doesNotMatch(command, /Filter displays…/);
  });

  it('SoT documents footer stages including leaf-command', () => {
    const sot = read(SOT);
    assert.match(sot, /index-filter/);
    assert.match(sot, /leaf-dismiss/);
    assert.match(sot, /leaf-command/);
    assert.match(sot, /StationDisplaysCommandFooter/);
    assert.match(sot, /setLeafCommands/);
  });
});
