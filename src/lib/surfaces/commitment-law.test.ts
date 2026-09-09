/**
 * COMMITMENT LAW — the mechanical half of {@link COMMITMENT_LAW}.
 *
 * The law's own rule: an invariant with no check is a comment. These are the
 * parts a grep can prove today, before the purchase-order feature exists —
 * which is the point. The expensive regression is a commitment kind shipping
 * at `auto`, and that is checkable the moment the kind is registered.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';

import {
  COMMITMENT_ACCEPTANCE,
  COMMITMENT_GAPS,
  COMMITMENT_KIND_MARKERS,
  COMMITMENT_LAW,
} from './commitment-law';

const REPO = process.cwd();
const read = (rel: string) => readFileSync(path.join(REPO, rel), 'utf8');

const REGISTRY = 'src/lib/surfaces/registry.ts';
const CHOKEPOINT = 'src/lib/assistant/mutations/apply-agent-mutation.ts';

describe('commitment law — the law is quotable and complete', () => {
  it('every invariant states the rule, not just its name', () => {
    for (const [id, text] of Object.entries(COMMITMENT_LAW)) {
      assert.ok(text.length > 80, `${id}: the law must state the rule, not name it`);
    }
  });

  it('the acceptance test names the end-to-end property', () => {
    assert.match(COMMITMENT_ACCEPTANCE, /human/);
    assert.ok(COMMITMENT_KIND_MARKERS.length >= 5);
  });
});

describe('commitment law — the trust tiers the law depends on still exist', () => {
  it('MutationTrustClass still offers a review tier', () => {
    assert.match(
      read(REGISTRY),
      /MutationTrustClass\s*=\s*'auto'\s*\|\s*'draft_scoped'\s*\|\s*'review'/,
      'the commitment law routes every money write to the review tier — do not remove or rename it without amending COMMITMENT_LAW.',
    );
  });

  it('the chokepoint still parks a review mutation instead of applying it', () => {
    const code = read(CHOKEPOINT);
    assert.match(
      code,
      /if\s*\(\s*trust\s*===\s*'review'\s*\)/,
      'applyAgentMutation must branch on the review tier — this branch IS commitmentIsTwoPhase.',
    );
    assert.match(
      code,
      /'proposed'/,
      "a review-tier mutation must land as status='proposed', never apply inline.",
    );
  });
});

describe('commitment law — no commitment ships at auto', () => {
  it('a mutation kind that names money is never registered auto or draft_scoped', () => {
    const code = read(REGISTRY);
    // Each MUTATION_KINDS entry is an object literal carrying `trust:`. Split
    // on the trust key so a marker is only judged against ITS OWN entry.
    const entries = code.split(/\n\s{2}\{/).filter((chunk) => /trust:\s*'/.test(chunk));
    const offenders: string[] = [];
    for (const entry of entries) {
      const trust = /trust:\s*'(auto|draft_scoped|review)'/.exec(entry)?.[1];
      if (!trust || trust === 'review') continue;
      const marker = COMMITMENT_KIND_MARKERS.find((m) => entry.includes(m));
      if (marker) {
        const kind = /kind:\s*'([^']+)'/.exec(entry)?.[1] ?? entry.slice(0, 60).replace(/\s+/g, ' ');
        offenders.push(`${kind} → trust '${trust}' (matched "${marker}")`);
      }
    }
    assert.deepEqual(
      offenders,
      [],
      'a commitment mutation is registered below the review tier — it could spend without a human:\n' +
        offenders.join('\n'),
    );
  });

  it('an automation rule action never writes outward directly', () => {
    // automationProposesNeverPlaces: the rules runner may propose, never place.
    // Guard the runner (if it exists yet) against importing an outward writer.
    const RUNNER_CANDIDATES = [
      'src/lib/automations/run-rules.ts',
      'src/lib/automations/rules-runner.ts',
      'src/lib/automations/apply-rules.ts',
    ];
    for (const rel of RUNNER_CANDIDATES) {
      if (!existsSync(path.join(REPO, rel))) continue;
      const code = read(rel);
      assert.ok(
        !/createPurchaseOrder|placeOrder|submitOrder/.test(code),
        `${rel} reaches an outward write. A rule PROPOSES (agent_mutations, trust review); it never places a commitment.`,
      );
    }
  });
});

describe('commitment law — the named gaps stay honest', () => {
  it('every recorded gap says what closes it', () => {
    for (const gap of COMMITMENT_GAPS) {
      assert.ok(gap.why.length > 40, `${gap.what}: say why it matters`);
      assert.ok(gap.closes.length > 20, `${gap.what}: name the change that closes it`);
    }
  });

  it('the proposed-apply gap is recorded until the route exists', () => {
    const routeExists =
      existsSync(path.join(REPO, 'src/app/api/assistant/mutations/[id]/apply/route.ts'));
    const recorded = COMMITMENT_GAPS.some((g) => /apply route/i.test(g.what));
    assert.equal(
      recorded,
      !routeExists,
      routeExists
        ? 'the apply route now exists — delete the gap row from COMMITMENT_GAPS.'
        : 'the review tier has no apply route and the gap is not recorded — a commitment routed there silently never happens.',
    );
  });
});
