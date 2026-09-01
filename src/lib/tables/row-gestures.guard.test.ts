/**
 * Guard — the row gestures the code claims to support are actually reachable.
 *
 * Shift-click was declared in the plan, plumbed all the way down to
 * `useTableSelectMode`'s range walk, and then **hard-coded off at every call
 * site**: `onToggleSelect(record, { shiftKey: false })`. It typechecked, it read
 * as deliberate, and the gesture simply did not exist for the whole life of the
 * feature. Nothing could have caught it — the range walk had unit coverage, and
 * the coverage passed, because the walk worked. What was broken was that no
 * caller could reach it.
 *
 * A literal `false` modifier is the signature of that mistake, so this scans for
 * it. It is a source scan and not a type rule on purpose: the type is
 * `{ shiftKey: boolean }` and `false` is a legitimate value of it, which is
 * exactly why the compiler was never going to help.
 */

import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { describe, it } from 'node:test';

/** Ripgrep over `src`, tolerating "no matches" (exit 1). */
function scan(pattern: string): string[] {
  try {
    const out = execFileSync(
      'rg',
      ['--no-heading', '--line-number', '--glob', '*.tsx', '--glob', '*.ts', pattern, 'src'],
      { encoding: 'utf8' },
    );
    return out.trim() ? out.trim().split('\n') : [];
  } catch (error) {
    const err = error as { status?: number; stdout?: string };
    if (err.status === 1) return [];
    throw error;
  }
}

describe('shift-click is reachable', () => {
  it('no call site hard-codes the modifier off', () => {
    const hits = scan(String.raw`shiftKey:\s*false`)
      // A test may legitimately construct an unmodified event.
      .filter((line) => !/\.test\.ts:/.test(line))
      // Strip COMMENTS before judging — the same rule `retired-symbols` follows.
      // Prose describing the bug is not the bug, and a guard that cannot tell
      // the difference makes the fix undocumentable.
      .filter((line) => {
        const code = line.replace(/^[^:]+:\d+:/, '').trim();
        return !code.startsWith('//') && !code.startsWith('*') && !code.startsWith('/*');
      });

    assert.deepEqual(
      hits,
      [],
      'these call sites pass `shiftKey: false`, which is how the range gesture ' +
        'was plumbed and unreachable for its whole life. Forward the real ' +
        'event instead:\n' +
        hits.join('\n'),
    );
  });

  it('the checkbox primitive still hands its click’s modifier to the caller', () => {
    // The seam the fix turns on. `onToggle()` with no argument means the event
    // was swallowed again and every caller is back to inventing `false`.
    const hits = scan(String.raw`onToggle\(\{ shiftKey: event\.shiftKey \}\)`);
    assert.ok(
      hits.length > 0,
      'GridRowCheckbox no longer forwards the click modifier — shift-click is off again',
    );
  });
});
