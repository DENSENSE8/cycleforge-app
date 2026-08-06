import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ColumnTypeGlyph } from './column-type-glyph';
import type { ColumnType } from '@/lib/tables/table-columns';

/**
 * type → glyph SoT — Price must not share Qty's Hash; Receipt is the money mark.
 */
describe('ColumnTypeGlyph', () => {
  it('maps price to Receipt (not Hash)', () => {
    const src = readFileSync(
      join(process.cwd(), 'src/components/ui/table-column-config/column-type-glyph.tsx'),
      'utf8',
    );
    assert.match(src, /price:\s*Receipt/);
    assert.doesNotMatch(src, /price:\s*DollarSign/);
    assert.match(src, /number:\s*Hash/);
  });

  it('renders every ColumnType without throwing', () => {
    const types: ColumnType[] = [
      'text',
      'number',
      'id',
      'tag',
      'longtext',
      'date',
      'external',
      'location',
      'tracking',
      'price',
    ];
    for (const type of types) {
      const html = renderToStaticMarkup(
        React.createElement(ColumnTypeGlyph, { type }),
      );
      assert.ok(html.length > 0, type);
    }
  });
});
