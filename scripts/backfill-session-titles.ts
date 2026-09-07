/**
 * backfill-session-titles.ts — clean Harmony control tokens out of stored
 * `ai_chat_sessions.title`.
 *
 * WHY: session titles are memory the operator reads to find work they already
 * did. Rows written before the title writer stripped Harmony hold the model's
 * deliberation verbatim — `<|channel|>analysis<|message|>User says…` painted
 * straight into the nav Sessions list (measured 2026-09-07). The display guard
 * (`displaySessionTitle`, src/lib/ai/session-title-text.ts) stops those from
 * ever RENDERING, but the row itself is still garbage: it is what a rename
 * pre-fills, what a pin persists, and what search would match. This heals the
 * stored value once.
 *
 * HOW: selects rows whose title carries a Harmony marker, then per row:
 *   1. `sanitizeSessionTitle(title)` — if a `final` channel survives, that is
 *      the name (the model did answer, we just stored the wrapper too).
 *   2. otherwise `fallbackTitle(<first user message>)` — a pure-analysis title
 *      carries no name, so re-derive from the thread's own first message, the
 *      same rule `generateSessionTitle` falls back to.
 *   3. otherwise leave the row alone and report it — never overwrite memory
 *      with a placeholder.
 * `updated_at` is deliberately NOT bumped: fixing a name is not activity, so
 * the recent list keeps its order (same rule as PATCH rename).
 *
 * SoR boundary: reads/writes Postgres only (`ai_chat_sessions.title`,
 * `ai_chat_messages` read-only). Idempotent and re-runnable — a healed row no
 * longer matches the Harmony predicate.
 *
 *   RUN='npx tsx --env-file=.env --import ./scripts/register-server-only-shim.cjs'
 *   $RUN scripts/backfill-session-titles.ts             # DRY RUN (default)
 *   $RUN scripts/backfill-session-titles.ts --apply
 *   $RUN scripts/backfill-session-titles.ts --apply --org=<uuid>
 */
import pool from '@/lib/db';
import { fallbackTitle, sanitizeSessionTitle } from '@/lib/ai/session-title-text';

const args = process.argv.slice(2);
const APPLY = args.includes('--apply');
const orgArg = args.find((a) => a.startsWith('--org='));
const ONLY_ORG = orgArg ? orgArg.slice('--org='.length) : null;

/** Any Harmony control token in a stored title. Same charset as harmony.ts. */
const HARMONY_LIKE = '%<|%|>%';

interface SessionRow {
  id: string;
  organization_id: string;
  title: string;
  first_message: string | null;
}

async function main(): Promise<void> {
  console.log(
    `\n${APPLY ? 'APPLY (rewriting titles)' : 'DRY RUN (no writes)'}` +
      `${ONLY_ORG ? ` · org=${ONLY_ORG}` : ' · all orgs'}`,
  );

  const { rows } = await pool.query<SessionRow>(
    `SELECT s.id,
            s.organization_id,
            s.title,
            (SELECT m.content
               FROM ai_chat_messages m
              WHERE m.session_id = s.id
                AND m.organization_id = s.organization_id
                AND m.role = 'user'
              ORDER BY m.created_at ASC
              LIMIT 1) AS first_message
       FROM ai_chat_sessions s
      WHERE s.title LIKE $1
        ${ONLY_ORG ? 'AND s.organization_id = $2' : ''}
      ORDER BY s.updated_at DESC`,
    ONLY_ORG ? [HARMONY_LIKE, ONLY_ORG] : [HARMONY_LIKE],
  );

  console.log(`\nsessions with Harmony markup in the title: ${rows.length}\n`);
  let healed = 0;
  let unnameable = 0;

  for (const row of rows) {
    const fromTitle = sanitizeSessionTitle(row.title);
    const next = fromTitle || (row.first_message ? fallbackTitle(row.first_message) : '');
    const source = fromTitle ? 'final-channel' : 'first-message';

    if (!next || next === row.title) {
      unnameable += 1;
      console.log(`  SKIP  ${row.id.slice(0, 12)} — nothing legible to name it`);
      continue;
    }

    console.log(`  ${APPLY ? 'FIX ' : 'WOULD'} ${row.id.slice(0, 12)} [${source}] → ${next}`);
    if (APPLY) {
      await pool.query(
        `UPDATE ai_chat_sessions
            SET title = $1
          WHERE id = $2 AND organization_id = $3`,
        [next, row.id, row.organization_id],
      );
    }
    healed += 1;
  }

  console.log(
    `\n${APPLY ? 'healed' : 'would heal'}: ${healed} · left alone: ${unnameable}` +
      `${APPLY ? '' : '\n\nDry run only. Re-run with --apply to write.'}\n`,
  );
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
