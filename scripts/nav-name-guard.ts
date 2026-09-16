/**
 * CLI face of the nav name-collision law: **a parent and a child must never
 * wear the same name** (operator 2026-09-14).
 *
 * The rule lives in `src/lib/nav/nav-name-collisions.ts` — ONE module, three
 * consumers, exactly the shape `tools/design-mcp/server.mjs` demands of a law
 * before it will expose a verdict:
 *
 *   1. `nav-name-collisions.test.ts` — the hard gate (verify's *Unit tests*).
 *   2. this script — `node_modules/.bin/tsx scripts/nav-name-guard.ts [--json]`.
 *   3. `ds_nav_names` — the MCP face, which spawns this script, exactly as
 *      `ds_boundary` spawns `boundary-guard.ts`.
 *
 * Exit 0 = the law holds. Exit 1 = collisions, listed. Exit 2 = the guard
 * itself broke, which is never a verdict.
 */

import {
  findNavNameCollisions,
  formatNavNameCollision,
} from '../src/lib/nav/nav-name-collisions';

const asJson = process.argv.includes('--json');

try {
  const collisions = findNavNameCollisions();

  if (asJson) {
    process.stdout.write(
      `${JSON.stringify(
        {
          ok: collisions.length === 0,
          collisions,
          law: 'A parent and a child must never wear the same name (operator 2026-09-14). Rename the CHILD — the lane names the direction, the row the object, the tab the state.',
        },
        null,
        2,
      )}\n`,
    );
  } else if (collisions.length === 0) {
    process.stdout.write('nav-name-guard: no parent/child name collisions.\n');
  } else {
    process.stdout.write(
      `nav-name-guard: ${collisions.length} collision(s) — rename the CHILD, never the parent lane:\n` +
        `${collisions.map((c) => `  ${formatNavNameCollision(c)}`).join('\n')}\n`,
    );
  }

  process.exit(collisions.length === 0 ? 0 : 1);
} catch (error) {
  process.stderr.write(`nav-name-guard failed: ${String(error)}\n`);
  process.exit(2);
}
