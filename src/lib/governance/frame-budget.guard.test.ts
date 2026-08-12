/**
 * Guard — desk/station frame floors stay exported from the frame SoT.
 *
 * Run: node --import tsx --test src/lib/governance/frame-budget.guard.test.ts
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';

const ROOT = process.cwd();
const FRAME = join(ROOT, 'src/lib/right-rail/frame.ts');
const LAYOUT = join(ROOT, 'src/components/station/workbench/workbench-layout.ts');

describe('frame budget SoT', () => {
  it('exports the live desk + station floors', () => {
    const frame = readFileSync(FRAME, 'utf8');
    const layout = readFileSync(LAYOUT, 'utf8');
    assert.match(frame, /export\s+const\s+MIN_WORK_SURFACE_PX\s*=\s*784\b/);
    assert.match(frame, /export\s+const\s+RIGHT_RAIL_GUTTER_PX\s*=\s*0\b/);
    assert.match(frame, /export\s+const\s+STATION_PUSH_CENTER_FLOOR_PX\s*=\s*STATION_WORKBENCH_LOCK_PX\b/);
    assert.match(layout, /STATION_WORKBENCH_LOCK_PX\s*=\s*720\b/);
  });
});
