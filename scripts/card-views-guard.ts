/**
 * CLI face of the card-view contract: **a card paints a slot iff its view
 * declares it** — the top-right status kind, the channel, the person and the
 * Space quick look (`TriageViewDecl.status` / `slots`).
 *
 * The rule lives in `src/lib/triage/views/card-view-contract.ts`; the views →
 * adapters registry (each adapter's real model builder over sample records)
 * in `src/lib/triage/views/card-view-adapters.ts`. Three consumers:
 *
 *   1. `triage-views.test.ts` — the hard gate (verify's *Unit tests*).
 *   2. this script — `node_modules/.bin/tsx scripts/card-views-guard.ts [--json]`.
 *   3. `ds_card_views` — the MCP face, which spawns this script.
 *
 * Exit 0 = every view's card agrees. Exit 1 = mismatches, listed. Exit 2 = the
 * guard itself broke, which is never a verdict.
 */

import { checkCardViews } from '../src/lib/triage/views/card-view-adapters';

const asJson = process.argv.includes('--json');

try {
  const views = checkCardViews();
  const ok = views.every((view) => view.mismatches.length === 0);

  if (asJson) {
    process.stdout.write(
      `${JSON.stringify(
        {
          ok,
          views,
          law: "A card paints a slot iff its view declares it: the top-right status kind, the channel, the person and the Space quick look (explicit 'none' = a deliberate absence). Fix the card, or change the view's declaration — never both silently.",
        },
        null,
        2,
      )}\n`,
    );
  } else if (ok) {
    process.stdout.write(`card-views-guard: ${views.length} views — every card agrees with its view.\n`);
  } else {
    const bad = views.filter((view) => view.mismatches.length > 0);
    process.stdout.write(
      `card-views-guard: ${bad.length} view(s) disagree with their cards:\n` +
        `${bad.map((view) => `  ${view.id} (${view.adapter ?? 'no adapter'}):\n${view.mismatches.map((m) => `    - ${m}`).join('\n')}`).join('\n')}\n`,
    );
  }

  process.exit(ok ? 0 : 1);
} catch (error) {
  process.stderr.write(`card-views-guard failed: ${String(error)}\n`);
  process.exit(2);
}
