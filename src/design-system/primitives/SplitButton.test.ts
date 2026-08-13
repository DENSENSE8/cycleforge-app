/**
 * Split-button SoT — flush boxed control, 1px vertical divider, flat menu.
 *
 *   node --import tsx --test src/design-system/primitives/SplitButton.test.ts
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import {
  SPLIT_BUTTON_DIVIDER_CLASS,
  SPLIT_BUTTON_GROUP_CLASS,
  SPLIT_MENU_CONTENT_CLASS,
  SPLIT_MENU_ITEM_CLASS,
} from './SplitButton';

const SRC = readFileSync(join(process.cwd(), 'src/design-system/primitives/SplitButton.tsx'), 'utf8');

describe('SplitButton', () => {
  it('is a boxed group with a 1px vertical divider between hit areas', () => {
    assert.match(SPLIT_BUTTON_GROUP_CLASS, /inline-flex/);
    assert.match(SPLIT_BUTTON_DIVIDER_CLASS.primary, /\bw-px\b/);
    assert.match(SRC, /DropdownMenuTrigger/);
    assert.match(SRC, /two tab stops|Tab →/i);
  });

  it('menu is a flush rectangle: zero radius, zero pad, flush to the button', () => {
    assert.match(SPLIT_MENU_CONTENT_CLASS, /rounded-none/);
    assert.match(SPLIT_MENU_CONTENT_CLASS, /\bp-0\b/);
    assert.match(SPLIT_MENU_CONTENT_CLASS, /shadow-none/);
    assert.match(SRC, /sideOffset=\{0\}/);
  });

  it('menu items are sentence case and separated by 1px horizontal rules', () => {
    assert.match(SPLIT_MENU_ITEM_CLASS, /normal-case/);
    assert.doesNotMatch(SPLIT_MENU_ITEM_CLASS, /uppercase/);
    assert.match(SRC, /border-t border-border-hairline/);
  });
});
