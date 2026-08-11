/**
 * Guard — Arrival · Unbox Band-1 box CTAs share ReceivingBoxChromeActions.
 *
 * Order is `[ Check ] [ RESUME ] [ Add ]` (+ `[ Export ]` on History) — labeled
 * peer CTAs at button altitude. Add is the everyday intake verb with Plus +
 * "Add" text (not an icon-only cube). `AGENTS.md` / `display/workbench-ops-queue.md`.
 *
 * Run: node --import tsx --test src/components/receiving/receiving-box-chrome-actions.guard.test.ts
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';

const ROOT = process.cwd();
const read = (rel: string) => readFileSync(join(ROOT, rel), 'utf8');

describe('ReceivingBoxChromeActions', () => {
  it('Check · resume · Add CTAs — Add is labeled, Export honest when earned', () => {
    const src = read('src/components/receiving/ReceivingBoxChromeActions.tsx');

    const check = src.indexOf('<ChromeCheckButton');
    const resume = src.indexOf('data-testid="receiving-box-resume"');
    const add = src.indexOf('data-testid="receiving-box-add"');
    const exportIdx = src.indexOf('data-testid="unbox-history-export"');
    assert.ok(check >= 0 && resume > check && add > resume, '[ Check ] [ RESUME ] [ Add ]');
    assert.ok(exportIdx > add, 'Export follows Add when earned');

    // Add is a labeled global CTA — Plus icon + "Add" text, not a cube.
    const addBlock = src.slice(add - 320, add + 80);
    assert.match(addBlock, /Add inbound purchase or return/);
    assert.match(addBlock, />\s*Add\s*</);
    assert.match(addBlock, /<Plus/);
    assert.doesNotMatch(src, /WorkbenchChromeCubeMenu/, 'Add is a Button CTA, not a Plus cube');

    // Export is browse-only — omitting `onExport` must drop the control.
    assert.match(src, /\{onExport \? \(/);

    assert.match(src, /variant="primary"/);
    assert.match(src, /WORKBENCH_CHROME_PILL_CLASS/);
  });

  it('Unbox + Arrival compose the SoT; Testing / Pack do not', () => {
    const unbox = read('src/components/receiving/unbox/UnboxWorkspaceHeader.tsx');
    const arrival = read('src/components/receiving/triage/TriageWorkspaceHeader.tsx');
    assert.match(unbox, /ReceivingBoxChromeActions/);
    assert.match(arrival, /ReceivingBoxChromeActions/);
    assert.match(unbox, /IncomingAddInboundOverlay/);
    assert.match(arrival, /IncomingAddInboundOverlay/);
    assert.doesNotMatch(unbox, /IncomingChromeActions/);
    assert.doesNotMatch(arrival, /IncomingChromeActions/);

    const testing = read('src/components/tech/testing/TestingWorkspaceHeader.tsx');
    const packer = read('src/components/packer/PackWorkspaceHeader.tsx');
    assert.doesNotMatch(testing, /ReceivingBoxChromeActions/);
    assert.doesNotMatch(packer, /ReceivingBoxChromeActions/);
  });

  it('Check face is the shared ChromeCheckButton — no per-surface hardcoded fill', () => {
    const box = read('src/components/receiving/ReceivingBoxChromeActions.tsx');
    const incoming = read(
      'src/components/sidebar/receiving/incoming/IncomingChromeActions.tsx',
    );
    // One Check face: both clusters compose the shared component…
    assert.match(box, /<ChromeCheckButton/, 'box-station Check uses the shared face');
    assert.match(incoming, /<ChromeCheckButton/, 'incoming Check uses the shared face');
    // …and the retired graphite override never comes back.
    assert.doesNotMatch(incoming, /bg-slate-700/, 'no hand-painted Check fill on Incoming');
  });
});
