/**
 * Band-1 chrome cube — ONE face for every workbench chrome-row icon cell.
 *
 * The leading pin-list and every trailing UTILITY CTA share the boxed cube the
 * station identity bar already uses for Exit / Back-to-list, so a scan station's
 * Band 1 reads as peer cells instead of a pin on the left and a parade of
 * coloured pills on the right.
 *
 * The **return-to-scan** CTA is the documented exception and stays a solid
 * primary: a scan station must expose a visible way back to the bench
 * (`AGENTS.md` → return-to-scan; `display/workbench.md` → Multi-region pages).
 * Flattening it into a cube would hide the one control on the row that is not
 * a utility — so this guard pins BOTH halves.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';

const ROOT = process.cwd();

function read(rel: string): string {
  return readFileSync(join(ROOT, rel), 'utf8');
}

/** Every Band-1 icon cell across the scan stations + To-Ship. */
const CUBE_CONSUMERS: readonly string[] = [
  // Leading pin — the face the rest of the row matches.
  'src/components/receiving/unbox/UnboxAddListPopover.tsx',
  // The one shared tabbed shell every trailing data cube composes.
  'src/components/dashboard/workbench-chrome-cube-menu.tsx',
  // Trailing data cubes.
  'src/components/receiving/ReceivingBoxChromeActions.tsx',
  'src/components/repair/RepairChromeActions.tsx',
  'src/components/unshipped/OrdersSyncPopover.tsx',
];

describe('Band-1 chrome cube', () => {
  it('the cube is derived from the station identity face, not re-typed', () => {
    const cube = read('src/components/dashboard/workbench-chrome-cube.tsx');
    assert.match(cube, /STATION_CONTEXT_BOXED_CUBE_CLASS/);
    // `self-stretch` is load-bearing: the leading slot is `items-stretch` and
    // the trailing cluster is `items-center`, so only self-stretch fills the
    // band in BOTH — and a pinned h-8 already overflowed the h-7 row.
    // Match the CONSTANT, not the prose — the docblock names what it bans.
    const face = cube.match(
      /export const WORKBENCH_CHROME_CUBE_CLASS = cn\(([\s\S]*?)\);/,
    )?.[1];
    assert.ok(face, 'the cube face must stay one named export');
    assert.match(face, /self-stretch aspect-square/);
    assert.doesNotMatch(face, /\bh-\d/);
  });

  it('every Band-1 icon cell composes the shared face', () => {
    for (const rel of CUBE_CONSUMERS) {
      const source = read(rel);
      assert.match(
        source,
        /WORKBENCH_CHROME_CUBE_(CLASS|GLYPH_CLASS)|WorkbenchChromeCubeButton/,
        rel,
      );
      // A private copy of the cube geometry is the drift this file prevents.
      assert.doesNotMatch(source, /h-full aspect-square/, rel);
    }
  });

  it('same-topic verbs are TABS in one cube — never a row of glyphs', () => {
    // The shape the operator rejected: [⇩] [☑] [+] on one band.
    for (const rel of [
      'src/components/receiving/ReceivingBoxChromeActions.tsx',
      'src/components/unshipped/OrdersSyncPopover.tsx',
    ]) {
      const source = read(rel);
      assert.match(source, /WorkbenchChromeCubeMenu/, rel);
      // Exactly ONE cube trigger per topic.
      assert.equal(
        (source.match(/<WorkbenchChromeCubeMenu/g) ?? []).length,
        1,
        `${rel} must expose one cube for its topic`,
      );
      // …and no sibling bare cube buttons beside it.
      assert.doesNotMatch(source, /<WorkbenchChromeCubeButton/, rel);
    }

    // The Unbox header delegates rather than growing its own glyphs.
    const unbox = read('src/components/receiving/unbox/UnboxWorkspaceHeader.tsx');
    assert.doesNotMatch(unbox, /<WorkbenchChromeCubeButton/);
    assert.match(unbox, /onExport=\{/);
  });

  it('utility CTAs stopped being coloured pills', () => {
    for (const rel of [
      'src/components/receiving/ReceivingBoxChromeActions.tsx',
      'src/components/repair/RepairChromeActions.tsx',
      'src/components/dashboard/OutboundOrderChromeActions.tsx',
    ]) {
      const source = read(rel);
      assert.doesNotMatch(source, /bg-emerald-600/, rel);
      assert.doesNotMatch(source, /bg-slate-700/, rel);
    }
  });

  it('the return-to-scan CTA stays SOLID — the one exception, still present', () => {
    const box = read('src/components/receiving/ReceivingBoxChromeActions.tsx');
    // Resume keeps a solid primary Button; only Check / Add became cubes.
    assert.match(box, /variant="primary"/);
    assert.match(box, /data-testid="receiving-box-resume"/);
    assert.match(box, /WORKBENCH_CHROME_PILL_CLASS/);
    assert.match(box, /\{resumeLabel\}/);
    // …and it is NOT a cube.
    const resumeBlock = box.slice(box.indexOf('<Button'));
    assert.doesNotMatch(resumeBlock, /WorkbenchChromeCubeButton/);
  });

  it('Plus data cube is after resume — far-right when both exist', () => {
    const box = read('src/components/receiving/ReceivingBoxChromeActions.tsx');
    const resume = box.indexOf('data-testid="receiving-box-resume"');
    const menu = box.indexOf('data-testid="receiving-box-data-menu"');
    assert.ok(resume >= 0 && menu > resume, '[ RESUME ] [+] — Plus after resume');
  });
});
