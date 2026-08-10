/**
 * Guard — Arrival · Unbox Band-1 box CTAs share ReceivingBoxChromeActions.
 *
 * Add · Check · Export are ONE topic (this table's data), so they are TABS in a
 * single cube, never three glyphs on the row (`AGENTS.md` → Band-1 same-topic
 * controls are tabs). Add leads: it is the everyday act, exactly as Import
 * leads the To-Ship panel. The resume CTA stays a solid Button left of the
 * Plus cube — order is `[ RESUME ] [+]` (Plus far-right).
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
  it('one cube holds Add → Check → Export; resume stays a solid peer', () => {
    const src = read('src/components/receiving/ReceivingBoxChromeActions.tsx');
    // One trigger for the topic…
    assert.match(src, /WorkbenchChromeCubeMenu/);
    assert.match(src, /data-testid="receiving-box-data-menu"/);

    // …and the verbs are tabs inside it, in everyday-first order.
    const add = src.indexOf('data-testid="receiving-box-add"');
    const check = src.indexOf('data-testid="receiving-box-check"');
    const exportIdx = src.indexOf('data-testid="unbox-history-export"');
    assert.ok(add >= 0 && check > add && exportIdx > check, 'Add then Check then Export');

    // Export is browse-only — omitting `onExport` must drop the TAB, not
    // render a dead one.
    assert.match(src, /if \(onExport\)/);

    // The return-to-scan CTA is a different topic: still solid, still its own
    // cell — and left of the Plus cube (Plus is far-right).
    const resume = src.indexOf('data-testid="receiving-box-resume"');
    const menu = src.indexOf('data-testid="receiving-box-data-menu"');
    assert.ok(resume >= 0 && menu > resume, 'resume then Plus cube (far-right)');
    assert.ok(exportIdx > check, 'Export tab follows Check inside the cube');
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
});
