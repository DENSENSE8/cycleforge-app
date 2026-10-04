/**
 * CLI face of the DISPLAY-METHOD DECISION FORMULA (owner 2026-09-29).
 *
 * The formula lives in `src/lib/tables/display-method.ts` (`scoreDisplayMethod`)
 * — the `DataTable` pin names it as the source of truth. Consumers:
 *
 *   1. `display-method.test.ts` — realistic pages pinned to their winner.
 *   2. this script — `node_modules/.bin/tsx scripts/display-method-guard.ts --json --input '<facts-json>'`.
 *   3. `ds_display_method` — the MCP face (profile gate with an `input` schema),
 *      which forwards the tool arguments as `--input <json>`.
 *
 * The decision (`implement` | `implement-name-runner-up` | `ask`) is DATA, not a
 * verdict: exit 0 whenever the facts scored. Exit 2 = bad input or the scorer
 * itself broke.
 */

import { parseDisplayFacts, scoreDisplayMethod } from '../src/lib/tables/display-method';

const asJson = process.argv.includes('--json');
const inputAt = process.argv.indexOf('--input');
const rawInput = inputAt >= 0 ? process.argv[inputAt + 1] : undefined;

try {
  if (rawInput === undefined) throw new Error("missing --input '<facts-json>'");
  const parsed = parseDisplayFacts(JSON.parse(rawInput));
  if (!parsed.ok) {
    process.stderr.write(`display-method-guard: invalid facts — ${parsed.errors.join('; ')}\n`);
    process.exit(2);
  }
  const result = scoreDisplayMethod(parsed.facts);

  if (asJson) {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } else {
    process.stdout.write(
      `${result.summary}\n` +
        `${result.ranked
          .map((c) => `  ${c.id.padEnd(16)} ${String(c.score).padStart(3)}  ${Math.round(c.confidence * 100)}% ${c.tier}`)
          .join('\n')}\n`,
    );
  }
  process.exit(0);
} catch (error) {
  process.stderr.write(`display-method-guard failed: ${String(error)}\n`);
  process.exit(2);
}
