import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { gridHeaderAriaSort } from './GridHeaderLabel';

const SOURCE = readFileSync(
  resolve(dirname(fileURLToPath(import.meta.url)), 'GridHeaderLabel.tsx'),
  'utf8',
);

describe('GridHeaderLabel — title, then arrow, black ink', () => {
  it('puts the sort arrow AFTER the title, never before', () => {
    const title = SOURCE.indexOf(
      '<span className="min-w-0 truncate font-semibold text-text-default">{visibleLabel}</span>',
    );
    assert.ok(title > 0, 'title span uses text-text-default');
    const afterTitle = SOURCE.slice(title);
    const sortAfter = afterTitle.indexOf('{sortMark}');
    assert.ok(sortAfter > 0 && sortAfter < 120, 'sort mark renders immediately after the title');
    assert.doesNotMatch(SOURCE, /ArrowUpDown/, 'idle sortable headers are title-only — no standing arrow');
    assert.doesNotMatch(
      SOURCE,
      /\{sortMark\}\s*\n\s*<span className="min-w-0 truncate/,
      'the old left-of-title chevron must not return',
    );
  });

  it('keeps header titles on text-text-default, not muted chrome gray', () => {
    assert.match(SOURCE, /span className="min-w-0 truncate font-semibold text-text-default"/);
    assert.doesNotMatch(SOURCE, /ColumnTypeGlyph[^;]*text-text-soft/);
    assert.doesNotMatch(SOURCE, /ColumnTypeGlyph[^;]*text-text-faint/);
  });

  it('aria-sort is none when sortable and inactive, absent when not sortable', () => {
    assert.equal(gridHeaderAriaSort(false, null, true), 'none');
    assert.equal(gridHeaderAriaSort(false, null, false), undefined);
    assert.equal(gridHeaderAriaSort(true, 'asc', true), 'ascending');
    assert.equal(gridHeaderAriaSort(true, 'desc', true), 'descending');
  });
});
