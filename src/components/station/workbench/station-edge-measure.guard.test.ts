/**
 * Scan-station edge-to-edge middle measure — Unbox golden continuous-improvement
 * ratchet.
 *
 * SoT:
 *   - `STATION_WORKBENCH_COLUMN` = `w-full min-w-0` (no `max-w` / `mx-auto` gutters)
 *   - Displays-closed center floor = `min-w-[720px]` on `STATION_CENTER_COLUMN_OPEN_CLASS`
 *   - Identity + PO lines + floating notes dock share that one measure
 *   - Flex-Grow Sandwich: Displays `flex-1` fills leftover; never host gutters
 *
 * Loop: panels missing {@link STATION_WORKBENCH_COLUMN} and local
 * `max-w-[720px]` debt may only shrink
 * ({@link SCAN_STATION_EDGE_MEASURE_MISSING_BASELINE} ·
 * {@link SCAN_STATION_LOCAL_720_MAX_BASELINE}). Escape:
 * {@link STATION_EDGE_MEASURE_ESCAPE}.
 *
 * Prompt for sibling ports:
 * `docs/todo/scan-station-edge-measure-CI-LOOP-PROMPT.md`
 *
 * Run: `node --test --import tsx src/components/station/workbench/station-edge-measure.guard.test.ts`
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import {
  STATION_CENTER_COLUMN_OPEN_CLASS,
  STATION_WORKBENCH_COLUMN,
  STATION_WORKBENCH_LOCK_PX,
} from './workbench-layout';
import {
  SCAN_STATION_EDGE_MEASURE_MISSING_BASELINE,
  SCAN_STATION_EDGE_MEASURE_PANELS,
  SCAN_STATION_LOCAL_720_MAX_BASELINE,
  STATION_EDGE_MEASURE_ESCAPE,
} from './station-workbench-chrome-config';

const SRC = join(process.cwd(), 'src');

function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^[ \t]*\/\/.*$/gm, '');
}

function readSrc(rel: string): string {
  return stripComments(readFileSync(join(SRC, rel), 'utf8'));
}

function isCommentLine(line: string): boolean {
  const t = line.trimStart();
  return t.startsWith('//') || t.startsWith('*') || t.startsWith('/*') || t.startsWith('{/*');
}

function hasEscape(lines: string[], i: number): boolean {
  for (let j = Math.max(0, i - 2); j <= i; j += 1) {
    if (lines[j].includes(STATION_EDGE_MEASURE_ESCAPE)) return true;
  }
  return false;
}

describe('Scan-station edge-to-edge middle measure (Unbox golden)', () => {
  it('STATION_WORKBENCH_COLUMN is edge-to-edge (no max-w / mx-auto gutters)', () => {
    assert.equal(
      STATION_WORKBENCH_COLUMN,
      'w-full min-w-0',
      'SoT middle measure must fill the center column — gutters are debt',
    );
    assert.equal(/max-w-\[/.test(STATION_WORKBENCH_COLUMN), false);
    assert.equal(/\bmx-auto\b/.test(STATION_WORKBENCH_COLUMN), false);
  });

  it('Displays-closed center keeps the 720 floor', () => {
    assert.match(
      STATION_CENTER_COLUMN_OPEN_CLASS,
      new RegExp(`min-w-\\[${STATION_WORKBENCH_LOCK_PX}px\\]`),
      'open center must min-w at STATION_WORKBENCH_LOCK_PX',
    );
    assert.match(STATION_CENTER_COLUMN_OPEN_CLASS, /\bflex-1\b/);
  });

  it('panels missing STATION_WORKBENCH_COLUMN only shrink (adoption ratchet)', () => {
    const missing: string[] = [];
    for (const rel of SCAN_STATION_EDGE_MEASURE_PANELS) {
      const src = readSrc(rel);
      if (!src.includes('STATION_WORKBENCH_COLUMN')) {
        missing.push(rel);
      }
    }
    assert.ok(
      missing.length <= SCAN_STATION_EDGE_MEASURE_MISSING_BASELINE,
      `Scan-station panels missing STATION_WORKBENCH_COLUMN grew to ${missing.length} ` +
        `(baseline ${SCAN_STATION_EDGE_MEASURE_MISSING_BASELINE}). ` +
        `Unbox golden is edge-to-edge — port siblings and shrink the baseline. ` +
        `Never raise it.\n  - ${missing.join('\n  - ')}\n` +
        `CI loop: docs/todo/scan-station-edge-measure-CI-LOOP-PROMPT.md`,
    );
    // Still print the open set so agents see the continuous-improvement queue.
    if (missing.length > 0) {
      assert.ok(
        true,
        `edge-measure adoption queue (${missing.length}): ${missing.join(', ')}`,
      );
    }
  });

  it('local max-w-[720px] debt in scan-station panels only shrinks', () => {
    let count = 0;
    const offenders: string[] = [];
    for (const rel of SCAN_STATION_EDGE_MEASURE_PANELS) {
      const lines = readFileSync(join(SRC, rel), 'utf8').split('\n');
      lines.forEach((line, i) => {
        if (!line.includes('max-w-[720px]')) return;
        if (isCommentLine(line)) return;
        if (hasEscape(lines, i)) return;
        count += 1;
        offenders.push(`${rel}:${i + 1}`);
      });
    }
    assert.ok(
      count <= SCAN_STATION_LOCAL_720_MAX_BASELINE,
      `Scan-station local max-w-[720px] grew to ${count} ` +
        `(baseline ${SCAN_STATION_LOCAL_720_MAX_BASELINE}). ` +
        `Unbox golden: identity + notes dock share STATION_WORKBENCH_COLUMN ` +
        `edge-to-edge — drop page-local max-w / mx-auto gutters. Escape genuine ` +
        `non-measure uses with \`${STATION_EDGE_MEASURE_ESCAPE}\`. Never raise ` +
        `the baseline.\n  - ${offenders.join('\n  - ')}\n` +
        `CI loop: docs/todo/scan-station-edge-measure-CI-LOOP-PROMPT.md`,
    );
  });

  it('SoT modules ban host gutter recipes (gap / justify-between / ml-auto detach)', () => {
    const host = readSrc('components/station/workbench/StationScanPaneHost.tsx');
    assert.equal(/\bgap-/.test(host), false, 'StationScanPaneHost must not hard-code gap-*');
    assert.equal(
      /justify-between|justify-around/.test(host),
      false,
      'StationScanPaneHost must not justify-between',
    );
    const push = readSrc('components/station/displays/StationDisplaysPushColumn.tsx');
    // Option A: Displays is an explicitly-sized `shrink-0` sibling of the elastic
    // center — it abuts the center with no gray band (the center flex-1 eats all
    // leftover), the sash clamps at the local stationDisplaysCapPx, and there is
    // no inverse coupling that would move the far context rail.
    assert.match(
      push,
      /shrink-0 self-stretch/,
      'Displays in-flow must be a sized shrink-0 sibling (center absorbs, no flex-1 invader)',
    );
    assert.equal(
      /'ml-auto shrink-0 self-stretch'/.test(push),
      false,
      'Displays must not ml-auto detach (gray band between middle and Displays)',
    );
    assert.match(
      push,
      /stationDisplaysCapPx/,
      'Displays sash must clamp at the local cap (frame − leftCost − 720)',
    );
    assert.equal(
      /station-dual-rail/.test(push),
      false,
      'Displays must not couple the far rail (rails resize independently — Option A)',
    );
    const layout = readSrc('components/station/workbench/workbench-layout.ts');
    assert.match(
      layout,
      /STATION_WORKBENCH_COLUMN\s*=\s*'w-full min-w-0'/,
      'workbench-layout must keep edge-to-edge STATION_WORKBENCH_COLUMN',
    );
  });
});
