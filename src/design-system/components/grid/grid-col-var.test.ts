import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { gridColVar, gridTemplate } from '@/design-system/components/grid/grid-column-geometry';

/** `gridColVar` must emit a VALID CSS custom-property name for every column key the product can produce — including org custom columns,… */
describe('gridColVar — CSS-safe custom property names', () => {
  it('leaves ordinary system keys untouched', () => {
    assert.equal(gridColVar('title'), '--cf-col-title');
    assert.equal(gridColVar('qty'), '--cf-col-qty');
    assert.equal(gridColVar('last_counted'), '--cf-col-last_counted');
    assert.equal(gridColVar('_fill'), '--cf-col-_fill');
  });

  it('escapes the colon in an org custom column key', () => {
    assert.equal(gridColVar('custom:rack_slot'), '--cf-col-custom-rack_slot');
  });

  // The property name is what makes or breaks the whole declaration, so assert
  // the shape rather than one example: no character outside the CSS ident set.
  it('never emits a character illegal in a custom-property name', () => {
    for (const key of ['custom:a', 'custom:a_b', 'weird key', 'a.b', 'a/b', 'a(b)']) {
      assert.match(
        gridColVar(key),
        /^--cf-col-[A-Za-z0-9_-]+$/,
        `gridColVar(${JSON.stringify(key)}) must be a legal custom-property name`,
      );
    }
  });

  it('keeps a template containing a custom column parseable', () => {
    const template = gridTemplate([
      { key: 'title', width: 'minmax(8rem, 1fr)' },
      { key: 'custom:rack_slot', width: 'minmax(5rem, 5rem)' },
    ]);
    // The colon may only survive inside `minmax(`/`var(` syntax, never in a
    // property NAME — this is the exact substring the browser rejected.
    assert.ok(
      !template.includes('--cf-col-custom:'),
      `template still carries an illegal property name: ${template}`,
    );
    assert.ok(template.includes('--cf-col-custom-rack_slot'), template);
  });
});
