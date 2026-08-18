/**
 * Guard — capture-stack query surfaces isError (H1 Phase B).
 *
 * Failed mobile feeds must never paint as honest empty queues. The waist
 * (`useCaptureStackQuery`) returns `isError`; P1 Pick / Pack / Checklist
 * paint `GridDegradedBox` + Retry when error + no rows.
 *
 * Run: `tsx --test src/design-system/components/capture-stack/capture-stack-resilience.guard.test.ts`
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';

const ROOT = process.cwd();
const read = (rel: string) => readFileSync(join(ROOT, rel), 'utf8');

describe('capture-stack resilience (H1 Phase B)', () => {
  it('useCaptureStackQuery surfaces isError on the return shape', () => {
    const hook = read('src/design-system/components/capture-stack/useCaptureStack.ts');
    assert.match(hook, /const \{ data, isLoading, isError \} = useQuery/);
    assert.match(hook, /return \{ data: data \?\? \[\], isLoading, isError, refetch \}/);
    assert.match(hook, /isError: boolean/);
  });

  it('P1 PickQueue paints GridDegradedBox + Retry on error+empty', () => {
    const src = read('src/components/mobile/redesign/PickQueue.tsx');
    assert.match(src, /isError, refetch/);
    assert.match(src, /isError && rows\.length === 0/);
    assert.match(src, /<GridDegradedBox[\s\S]*?onRetry=/);
  });

  it('P1 MobilePackingList paints GridDegradedBox + Retry on error+empty', () => {
    const src = read('src/components/mobile/packer/MobilePackingList.tsx');
    assert.match(src, /isError, refetch/);
    assert.match(src, /isError && rows\.length === 0/);
    assert.match(src, /<GridDegradedBox[\s\S]*?onRetry=/);
  });

  it('P1 MobileChecklistOrderQueue paints GridDegradedBox + Retry on error+empty', () => {
    const src = read('src/components/mobile/checklist/MobileChecklistOrderQueue.tsx');
    assert.match(src, /isError, refetch/);
    assert.match(src, /isError && rows\.length === 0/);
    assert.match(src, /<GridDegradedBox[\s\S]*?onRetry=/);
  });
});
