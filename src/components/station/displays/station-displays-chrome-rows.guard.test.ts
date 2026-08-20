/**
 * Station Displays chrome is TWO ROWS and no bottom band (ruled 2026-08-19).
 *
 *   Row 1  [< Back] title ……… [verbs][⋮][⤢][→|]     ← the single header band
 *   Row 2  [🔍 Filter displays…                 ]   ← Root Index ONLY
 *   Body   VERIFICATION · index rows / leaf body
 *
 * WHY THIS EXISTS
 * The filter used to sit in a bottom footer, justified as the left context
 * rail's twin. That pairing stopped holding when `→|` moved into the header
 * band (2026-08-18): what made the two rails read alike was the filter sharing
 * a band with the dismiss control, and once the dismiss left, the bottom band
 * held one lonely field *below* the list it filters. Row 2 puts it above that
 * list, which is the order the Unbox workbench sheet already teaches
 * (chrome → find → rows), and it uses the same `TechRailSearchBar
 * variant="chrome"` face so one muscle memory covers both surfaces.
 *
 * The other half of the ruling is a deletion: the opt-in `/` leaf-command
 * footer had **zero** leaves registering a command (both call sites passed
 * `null`), so the footer slot, its two components and `setLeafCommands` went
 * with the bottom band rather than surviving as a stage nothing could paint.
 *
 * What carries over unchanged from the old footer-stage guard: the filter is
 * INDEX-ONLY (a leaf must never inherit list-filter chrome that does not
 * refine the leaf), typing must not eject a leaf to the index, Esc clears a
 * live filter before closing, and no host may fork a page-local filter twin.
 *
 *   node --import tsx --test src/components/station/displays/station-displays-chrome-rows.guard.test.ts
 */

import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';

function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^[ \t]*\/\/.*$/gm, '');
}

const read = (rel: string) => stripComments(readFileSync(join(process.cwd(), rel), 'utf8'));

const STACK = 'src/components/station/displays/StationDisplaysPushStack.tsx';
const COLUMN = 'src/components/station/displays/StationDisplaysPushColumn.tsx';
const CHROME = 'src/components/station/displays/displays-leaf-chrome.tsx';
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

/** The bottom band and its `/` palette are gone — not parked, deleted. */
const DELETED = [
  'src/components/station/displays/StationDisplaysDismissFooter.tsx',
  'src/components/station/displays/StationDisplaysCommandFooter.tsx',
  'src/components/station/displays/displays-footer-command.ts',
] as const;

describe('Station Displays chrome rows', () => {
  it('the column exposes a subHeader row and no footer slot', () => {
    const src = read(COLUMN);
    assert.match(src, /subHeader\?: ReactNode;/, 'row 2 is a real slot');
    assert.doesNotMatch(
      src,
      /footer\?: ReactNode;/,
      'the bottom band slot is gone — a footer prop invites it back',
    );
    const bandIdx = src.indexOf('STATION_DISPLAYS_PUSH_TOP_BAND}>');
    const subIdx = src.indexOf('{subHeader}');
    const bodyIdx = src.indexOf('{children}');
    assert.ok(bandIdx >= 0 && subIdx > bandIdx, 'row 2 paints under the band');
    assert.ok(bodyIdx > subIdx, 'row 2 paints above the body');
  });

  it('the filter is row 2, index-only, and mounts once', () => {
    const src = read(STACK);
    assert.match(src, /subHeader=\{/, 'stack fills the row-2 slot');
    assert.match(src, /Filter displays…/, 'placeholder unchanged');
    assert.match(src, /unbox-displays-filter-row/, 'row carries a stable testid');

    const subIdx = src.indexOf('subHeader={');
    const slice = src.slice(subIdx, subIdx + 900);
    assert.match(slice, /onIndex \? \(/, 'row 2 renders on the index only');
    assert.match(slice, /TechRailSearchBar/, 'row 2 mounts the shared find face');
    assert.match(
      slice,
      /variant="chrome"/,
      'same face as the Unbox sheet Band-3 find — not the rail variant',
    );

    const mounts = src.split('<TechRailSearchBar').length - 1;
    assert.equal(mounts, 1, 'exactly one find field in the whole column');
    assert.doesNotMatch(
      src,
      /footer=\{/,
      'the stack paints no bottom band',
    );
  });

  it('typing in the filter never ejects a leaf to the index', () => {
    const src = read(STACK);
    assert.doesNotMatch(
      src,
      /if \(!onIndex && next\.trim\(\)\) goIndex/,
      'no leaf→index eject-by-typing substitute for Back',
    );
  });

  it('Esc clears a live filter before closing the column', () => {
    const src = read(STACK);
    assert.match(
      src,
      /onIndex && filterQuery\.trim\(\)/,
      'index Esc clears a live filter before closing the column',
    );
    assert.doesNotMatch(
      src,
      /commandOpen/,
      'the `/` palette is gone — no command-open rung left in Esc',
    );
  });

  it('the filter row wires onKeyDown into the index list', () => {
    const src = read(STACK);
    assert.match(src, /indexFilterKeysRef/);
    assert.match(
      src,
      /onKeyDown=\{\(e\) => indexFilterKeysRef\.current\?\.onFilterKeyDown\(e\)\}/,
      'character-select keys reach the armed cursor list',
    );
    const searchBar = read('src/components/sidebar/tech/TechRailSearchBar.tsx');
    assert.match(
      searchBar,
      /flushSync/,
      'nav keys flush the draft so Enter commits against typed text',
    );
  });

  it('the bottom band and its / palette are deleted, not parked', () => {
    for (const rel of DELETED) {
      assert.equal(
        existsSync(join(process.cwd(), rel)),
        false,
        `${rel} must stay deleted — a retirement is not done until the file is gone`,
      );
    }
    assert.doesNotMatch(
      read(CHROME),
      /setLeafCommands/,
      'leaf chrome no longer offers a footer to register into',
    );
  });

  it('no host forks a page-local Displays filter', () => {
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
        `${host}: the Displays filter stays inside StationDisplaysPushStack`,
      );
    }
  });

  it('SoT documents the two-row chrome and the absent footer', () => {
    const sot = read(SOT);
    assert.match(sot, /Displays chrome rows|row 2/i);
    assert.match(sot, /Filter displays…/);
    assert.doesNotMatch(
      sot,
      /StationDisplaysCommandFooter|StationDisplaysDismissFooter/,
      'SoT must not name deleted footer components',
    );
  });

  /**
   * The PARKED strip shows the Root Index as icons and has no foot button
   * (2026-08-19). Both halves matter: the button was a second door onto the one
   * action the whole strip already performs, and the empty mid it sat under
   * told the operator nothing about what was parked behind it.
   */
  it('the parked strip carries the index rail, not a restore button', () => {
    const col = read(COLUMN);
    assert.match(col, /parkedRail\?: \(open: \(\) => void\) => ReactNode;/, 'the strip takes a rail');
    assert.doesNotMatch(
      col,
      /unbox-displays-parked-expand/,
      'the foot restore button is deleted — the strip itself restores',
    );
    const parked = col.slice(col.indexOf('data-displays-parked'), col.indexOf('data-displays-parked') + 900);
    assert.match(parked, /onClick=\{restore\}/, 'whole-strip click still restores');

    const stack = read(STACK);
    assert.match(stack, /parkedRail=\{\(open\) => \(/, 'the stack fills the rail');
    assert.match(stack, /StationDisplaysParkedRail/, 'via the shared rail component');
  });

  /**
   * The header `→|` PARKS; it does not unmount (2026-08-19). It called the
   * host's `onClose` until then, so the icon strip was reachable only by
   * dragging the sash past its min — a gesture most operators never find.
   * Full close stays Esc's job, so the two controls keep two meanings.
   */
  it('the band close parks the column instead of unmounting it', () => {
    const col = read(COLUMN);
    assert.match(col, /const park = useCallback\(\(\) => setParked\(true\), \[\]\);/);
    const band = col.slice(col.indexOf('variant="column-close"'), col.indexOf('variant="column-close"') + 200);
    assert.match(band, /onClick=\{park\}/, 'the band `→|` parks');
    assert.doesNotMatch(band, /onClick=\{onClose\}/, 'it must not unmount the column');
    assert.match(col, /useEscapeClose\(true, onEscape \?\? onClose\)/, 'Esc keeps the full close');
    assert.match(
      col,
      /if \(collapsed\) restore\(\);/,
      'a parked column owns ⌘] — no edge toggle is mounted in that state',
    );
  });

  /**
   * BOTH closed states show the index — the parked column AND the scan-station
   * utility rail (the one an operator actually sees, since the column unmounts
   * on Esc). They are different components; an operator must not have to know
   * which one they are looking at to reach a display.
   */
  it('the closed scan-station strip carries the same rail as the parked column', () => {
    const body = read('src/components/receiving/workspace/UnboxDisplaysUtilityRailBody.tsx');
    assert.match(body, /indexRail\?: ReactNode;/, 'the closed strip takes the rail');
    assert.match(body, /\{indexRail\}/, 'and paints it in the mid');

    const host = read('src/components/receiving/workspace/LineEditPanel.tsx');
    const at = host.indexOf('<UnboxDisplaysUtilityRailBody');
    assert.ok(at >= 0, 'Unbox mounts the closed strip');
    const mount = host.slice(at, at + 900);
    assert.match(mount, /StationDisplaysParkedRail/, 'fed by the SAME rail component');
  });

  /**
   * The rail's cells are the 40px nav beam's icon chrome, not a hand-rolled
   * twin. The first draft used its own `h-7 w-7` box with its own hover — a
   * second answer to a question the header already answers, with a gutter
   * either side so the wash floated instead of filling the strip.
   */
  it('rail cells compose the header icon token, edge to edge', () => {
    const rail = read('src/components/station/displays/StationDisplaysParkedRail.tsx');
    assert.match(rail, /HEADER_ICON_BTN_CLASS/, 'hover depth is the header wash');
    assert.match(rail, /TOP_CHROME_ICON_FACE/, 'glyph box + nav stroke are the header face');
    assert.match(rail, /HEADER_ICON_BTN_OPEN_CLASS/, 'the open/active fill is the header token too');
    assert.match(rail, /gap-0/, 'cells abut so the wash runs across the seam');
    assert.doesNotMatch(
      rail,
      /hover:bg-surface-sunken/,
      'never re-declare the hover wash — it arrives with the header token',
    );
    assert.doesNotMatch(
      rail,
      /\.sort\(|recent|mru/i,
      'a fixed rail is reachable by muscle memory; a reordering one is not',
    );
  });

  it('the LEFT parked strip lost its foot button too', () => {
    const left = read('src/components/sidebar/tech/left-dock-toggle.tsx');
    assert.doesNotMatch(
      left,
      /function LeftDockExpandButton/,
      'the left foot button is deleted, not parked',
    );
    assert.match(
      left,
      /data-testid=\{testId\}/,
      'the strip itself carries the handle its hosts pass',
    );
  });
});
