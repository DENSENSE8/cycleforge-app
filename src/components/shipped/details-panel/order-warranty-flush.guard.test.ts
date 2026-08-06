/**
 * To-ship order inspector (desk `ShippedDetailsPanel`) — flush warranty tab.
 *
 * The "Claims for this order" list used to be a nested `rounded-xl border
 * bg-surface-card` card wrapped in an outer `px-6` re-inset. Flush right-panel
 * grammar (right-rail-inspector.md): the scroll body is column-edge and list
 * segments are full-bleed hairlines — no nested rounded card, no outer re-inset.
 * The colored coverage verdict stays a status callout (state emphasis, not
 * chrome), so this guard pins the LIST segment, not the callout.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';

function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^[ \t]*\/\/.*$/gm, '');
}

const read = (rel: string) => stripComments(readFileSync(join(process.cwd(), rel), 'utf8'));

const BODY = 'src/components/shipped/details-panel/ShippedDetailsBody.tsx';
const WARRANTY = 'src/components/shipped/details-panel/OrderWarrantySection.tsx';

describe('To-ship order inspector — flush warranty tab', () => {
  it('ShippedDetailsBody renders the warranty tab flush — no outer px-6 re-inset', () => {
    const body = read(BODY);
    assert.match(
      body,
      /activeSection === 'warranty'\)\s*\{\s*return <OrderWarrantySection order=\{shipped\} \/>;/,
      'warranty branch returns the section column-edge, not wrapped in px-6',
    );
    assert.doesNotMatch(
      body,
      /className="px-6">\s*<OrderWarrantySection/,
      'no outer px-6 re-inset around the warranty section',
    );
  });

  it('OrderWarrantySection Claims list is a full-bleed hairline segment, not a nested card', () => {
    const warranty = read(WARRANTY);
    assert.match(
      warranty,
      /<section className="mt-4 border-y border-border-hairline">/,
      'Claims for this order is a full-bleed hairline segment',
    );
    assert.doesNotMatch(
      warranty,
      /<section className="rounded-xl border border-border-soft bg-surface-card">/,
      'Claims list must not reintroduce a nested rounded bordered card',
    );
  });
});
