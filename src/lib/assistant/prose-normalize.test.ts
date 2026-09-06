/**
 * Gate A — prose normalizer (generation-side coercion).
 *
 * Run: node --import tsx --test src/lib/assistant/prose-normalize.test.ts
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { normalizeAssistantProse } from './prose-normalize';

describe('normalizeAssistantProse', () => {
  it('clamps H1 to H2 and leaves deeper headings alone', () => {
    assert.equal(normalizeAssistantProse('# Title'), '## Title');
    assert.equal(normalizeAssistantProse('### Section'), '### Section');
    assert.equal(normalizeAssistantProse('#### Deep'), '#### Deep');
    // A # with no space is text, not a heading — untouched.
    assert.equal(normalizeAssistantProse('#hashtag'), '#hashtag');
  });

  it('converts tab indentation in list items to 2 spaces', () => {
    assert.equal(normalizeAssistantProse('- a\n\t- child'), '- a\n  - child');
    assert.equal(normalizeAssistantProse('\t- top'), '  - top');
  });

  it('inserts blank lines around list blocks', () => {
    assert.equal(normalizeAssistantProse('Intro:\n- a\n- b'), 'Intro:\n\n- a\n- b');
    assert.equal(normalizeAssistantProse('- a\n- b\nOutro:'), '- a\n- b\n\nOutro:');
    // Consecutive list lines are ONE block — no blank inserted inside.
    assert.equal(normalizeAssistantProse('- a\n- b'), '- a\n- b');
  });

  it('inserts blank lines around heading blocks (heading stacks stay compact)', () => {
    assert.equal(normalizeAssistantProse('Intro:\n## H'), 'Intro:\n\n## H');
    assert.equal(normalizeAssistantProse('## H\nBody'), '## H\n\nBody');
    assert.equal(normalizeAssistantProse('## A\n### B'), '## A\n### B');
  });

  it('demotes bullets deeper than two levels to the child level', () => {
    assert.equal(
      normalizeAssistantProse('- a\n  - b\n    - c'),
      '- a\n  - b\n  - c',
    );
    // Ordered lists demote the same way.
    assert.equal(
      normalizeAssistantProse('1. a\n  1. b\n      1. c'),
      '1. a\n  1. b\n  1. c',
    );
  });

  it('does not touch code fences or tables', () => {
    const fenced = '```\n# not a heading\n\t- not a list\n```';
    assert.equal(normalizeAssistantProse(fenced), fenced);
    const table = '| a | b |\n| --- | --- |\n| 1 | 2 |';
    assert.equal(normalizeAssistantProse(table), table);
  });

  it('is idempotent', () => {
    const gnarly = [
      '# Title with H1',
      'Intro paragraph glued to a list:',
      '- parent',
      '\t- tabbed child',
      '\t\t- deep grandchild',
      '### Section',
      'Tail text glued to the section.',
      '```',
      '# fence heading stays',
      '```',
      '| a | b |',
      '| --- | --- |',
      '| 1 | 2 |',
    ].join('\n');
    const once = normalizeAssistantProse(gnarly);
    const twice = normalizeAssistantProse(once);
    assert.equal(twice, once);
    // And the coercion actually happened on the first pass.
    assert.ok(once.startsWith('## Title'));
    assert.ok(once.includes('  - tabbed child'));
    assert.ok(!once.includes('\t\t'));
  });
});
