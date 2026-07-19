import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  getTriageWorkspaceTabFromSearch,
  normalizeTriageWorkspaceTabParams,
  resolveTriageView,
} from './triage-workspace-state';

describe('triage-workspace-state', () => {
  it('defaults absent / invalid triview to triage', () => {
    assert.equal(resolveTriageView(null), 'triage');
    assert.equal(resolveTriageView(''), 'triage');
    assert.equal(resolveTriageView('nope'), 'triage');
    assert.equal(getTriageWorkspaceTabFromSearch(new URLSearchParams()), 'triage');
  });

  it('parses found / unfound / done', () => {
    assert.equal(resolveTriageView('found'), 'found');
    assert.equal(resolveTriageView('unfound'), 'unfound');
    assert.equal(resolveTriageView('done'), 'done');
    assert.equal(
      getTriageWorkspaceTabFromSearch(new URLSearchParams('triview=unfound')),
      'unfound',
    );
  });

  it('normalize: triage omits param; others set triview', () => {
    const a = new URLSearchParams('triview=found&staff=1');
    assert.equal(normalizeTriageWorkspaceTabParams(a, 'triage'), 'triage');
    assert.equal(a.get('triview'), null);
    assert.equal(a.get('staff'), '1');

    const b = new URLSearchParams();
    assert.equal(normalizeTriageWorkspaceTabParams(b, 'done'), 'done');
    assert.equal(b.get('triview'), 'done');
  });
});
