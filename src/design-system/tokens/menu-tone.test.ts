/**
 * Menu-row tone map — theme tokens, status-pill vs accent-ink, pointer highlight.
 *
 *   node --import tsx --test src/design-system/tokens/menu-tone.test.ts
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import {
  MENU_ITEM_HINT_CLASS,
  MENU_ITEM_ROW_CLASS,
  MENU_ITEM_STATUS_TONES,
  MENU_ITEM_TONE_CLASS,
  MENU_ITEM_TONES,
  MENU_ITEM_VERB_TONES,
  MENU_SEPARATOR_CLASS,
  isMenuItemStatusTone,
  menuItemClass,
} from './menu-tone';

const DROPDOWN = readFileSync(
  new URL('../primitives/DropdownMenu.tsx', import.meta.url),
  'utf8',
);
const CONTEXT = readFileSync(
  new URL('../primitives/ContextMenu.tsx', import.meta.url),
  'utf8',
);
const ROW = readFileSync(
  new URL('../primitives/MorphingMenuRow.tsx', import.meta.url),
  'utf8',
);

const FORBIDDEN_PAINT =
  /rose-|emerald-|#[0-9a-fA-F]{3,8}|bg-red-|text-red-|bg-green-|text-green-|bg-blue-\d|text-blue-\d/;

describe('MENU_ITEM_TONE_CLASS', () => {
  it('covers every named tone', () => {
    for (const tone of MENU_ITEM_TONES) {
      assert.equal(typeof MENU_ITEM_TONE_CLASS[tone], 'string');
      assert.ok(MENU_ITEM_TONE_CLASS[tone].length > 8, `${tone} is empty`);
    }
  });

  it('uses theme tokens only — no hex or rose/emerald literals', () => {
    for (const [tone, cls] of Object.entries(MENU_ITEM_TONE_CLASS)) {
      assert.doesNotMatch(cls, FORBIDDEN_PAINT, `${tone} leaked a literal hue`);
    }
    assert.doesNotMatch(MENU_ITEM_ROW_CLASS, FORBIDDEN_PAINT);
    assert.doesNotMatch(MENU_ITEM_HINT_CLASS, FORBIDDEN_PAINT);
    assert.doesNotMatch(ROW, FORBIDDEN_PAINT);
  });

  it('status commits rest as surface + text + ring triad', () => {
    const family: Record<(typeof MENU_ITEM_STATUS_TONES)[number], string> = {
      success: 'success',
      warning: 'warning',
      cancel: 'danger',
    };
    for (const tone of MENU_ITEM_STATUS_TONES) {
      const cls = MENU_ITEM_TONE_CLASS[tone];
      const hue = family[tone];
      assert.match(cls, new RegExp(`bg-surface-${hue}`), `${tone} missing pill fill`);
      assert.match(cls, new RegExp(`text-text-${hue}`), `${tone} missing pill ink`);
      assert.match(cls, new RegExp(`ring-border-${hue}`), `${tone} missing pill ring`);
      assert.match(cls, /my-0\.5/, `${tone} must sit as a discrete pill, not a stacked flag`);
      assert.match(cls, /hover:ring-2/);
      assert.match(cls, /focus:ring-2/);
      assert.match(cls, /data-\[highlighted\]:ring-2/);
      assert.ok(isMenuItemStatusTone(tone));
    }
  });

  it('verbs rest as ink — wash only on hover / focus / highlighted', () => {
    for (const tone of MENU_ITEM_VERB_TONES) {
      const cls = MENU_ITEM_TONE_CLASS[tone];
      const rest = cls
        .split(/\s+/)
        .filter((token) => token && !/^(hover|focus|data-\[highlighted\]):/.test(token));
      assert.ok(
        rest.every((token) => !token.startsWith('bg-')),
        `${tone} paints a fill at rest: ${rest.join(' ')}`,
      );
      assert.ok(
        rest.every((token) => token !== 'my-0.5'),
        `${tone} must not take the status-pill gap`,
      );
      assert.match(cls, /data-\[highlighted\]:bg-surface-/);
      assert.match(cls, /hover:bg-surface-/);
      assert.match(cls, /focus:bg-surface-/);
    }
    assert.match(MENU_ITEM_TONE_CLASS.accent, /text-text-default/);
    assert.match(MENU_ITEM_TONE_CLASS.accent, /data-\[highlighted\]:text-text-accent/);
    assert.match(MENU_ITEM_TONE_CLASS.danger, /text-text-danger/);
    assert.match(MENU_ITEM_TONE_CLASS.danger, /data-\[highlighted\]:bg-surface-hover/);
    assert.doesNotMatch(
      MENU_ITEM_TONE_CLASS.danger,
      /bg-surface-danger/,
      'danger verb must not steal cancel-pill fill',
    );
  });

  it('every tone keeps Radix pointer highlight (hold-key + mouse)', () => {
    for (const tone of MENU_ITEM_TONES) {
      assert.match(
        MENU_ITEM_TONE_CLASS[tone],
        /data-\[highlighted\]:/,
        `${tone} drops data-highlighted — F-hold + mouse row highlight would go dark`,
      );
    }
  });
});

describe('menu row chrome', () => {
  it('hints sit under the verb as caption, inheriting current ink', () => {
    assert.match(MENU_ITEM_HINT_CLASS, /text-role-caption/);
    assert.match(MENU_ITEM_HINT_CLASS, /text-current/);
    assert.doesNotMatch(MENU_ITEM_HINT_CLASS, /text-current\/70|text-text-muted|text-text-faint|text-text-soft/);
    assert.doesNotMatch(MENU_ITEM_HINT_CLASS, /KeyboardKey|kbd/);
    assert.match(ROW, /MENU_ITEM_HINT_CLASS/);
    assert.match(ROW, /font-medium/);
    const jsx = ROW.slice(ROW.indexOf('return ('));
    assert.doesNotMatch(jsx, /KeyboardKey/);
  });

  it('groups with the shared separator token', () => {
    assert.match(MENU_SEPARATOR_CLASS, /bg-border-soft/);
    assert.match(ROW, /MorphingMenuSeparator/);
  });

  it('menuItemClass composes row + tone', () => {
    const cls = menuItemClass('success');
    assert.match(cls, /bg-surface-success/);
    assert.match(cls, new RegExp(MENU_ITEM_ROW_CLASS.split(' ')[0]));
  });
});

describe('shared-wrapper consumers', () => {
  it('DropdownMenuItem, ContextMenuItem, and Popover consume MENU_ITEM_TONE_CLASS', () => {
    assert.match(DROPDOWN, /MENU_ITEM_TONE_CLASS/);
    assert.match(CONTEXT, /MENU_ITEM_TONE_CLASS/);
    const popover = readFileSync(
      new URL('../primitives/Popover.tsx', import.meta.url),
      'utf8',
    );
    assert.match(popover, /MENU_ITEM_TONE_CLASS/);
    assert.doesNotMatch(DROPDOWN, /text-rose-600|bg-rose-50|text-emerald-/);
    assert.doesNotMatch(CONTEXT, /text-rose-600|bg-rose-50|text-emerald-/);
  });

  it('SubTrigger and RadioItem stay on the shared row + default tone', () => {
    assert.match(DROPDOWN, /MENU_ITEM_ROW_CLASS/);
    assert.match(CONTEXT, /MENU_ITEM_ROW_CLASS/);
    assert.match(DROPDOWN, /MENU_ITEM_TONE_CLASS\.default/);
    assert.match(CONTEXT, /MENU_ITEM_TONE_CLASS\.default/);
  });
});
