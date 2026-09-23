import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  INDUSTRIAL_POLICY,
  INDUSTRIAL_TRANSLATION_MATRIX,
  evaluateIndustrialTranslationMatrix,
} from './industrial-translation-law';

describe('industrial translation matrix', () => {
  it('maps every pasted concept exactly once', () => {
    const verdict = evaluateIndustrialTranslationMatrix();
    assert.equal(verdict.ok, true, JSON.stringify(verdict.violations, null, 2));
    assert.equal(verdict.sourceConceptCount, verdict.mappedConceptCount);
    assert.ok(verdict.sourceConceptCount >= 100);
  });

  it('resolves the four policy conflicts explicitly', () => {
    assert.match(INDUSTRIAL_POLICY.headerCase, /sentence case/i);
    assert.match(INDUSTRIAL_POLICY.accent, /tenant accent/i);
    assert.match(INDUSTRIAL_POLICY.mono, /IBM Plex Mono/);
    assert.match(INDUSTRIAL_POLICY.darkChrome, /station\/monitor/i);
  });

  it('does not expose a terminal token axis or raw Tailwind palette choices', () => {
    const json = JSON.stringify(INDUSTRIAL_TRANSLATION_MATRIX);
    assert.doesNotMatch(json, /axis[^}]*terminal/i);
    assert.doesNotMatch(json, /\b(?:sky|slate|cyan|emerald|amber|rose)-(?:[1-9]00|50)\b/);
  });

  it('rejects pasted call-site physics and a second table or button primitive', () => {
    const spring = INDUSTRIAL_TRANSLATION_MATRIX.find((row) => row.id === 'spring-physics');
    const table = INDUSTRIAL_TRANSLATION_MATRIX.find((row) => row.id === 'manifest-table');
    const button = INDUSTRIAL_TRANSLATION_MATRIX.find((row) => row.id === 'command-button');
    assert.equal(spring?.disposition, 'reject');
    assert.match(table?.component ?? '', /DataTable/);
    assert.equal(button?.component, 'Button');
  });
});
