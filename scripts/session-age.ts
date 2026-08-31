/**
 * Time machine for "Keep me signed in" — the one thing you cannot test by hand.
 *
 * Persistence only fails after hours pass. This ages your CURRENT session's
 * `last_seen_at` so the next page load sees a stale session, without waiting
 * and without restarting anything (it only writes to the database — the dev
 * server on :3050 picks it up on the very next request).
 *
 *   npm run session:age -- 13h        # past the 12 h "personal" idle window
 *   npm run session:age -- 9h         # past the 8 h "station" idle window
 *   npm run session:age -- 200d
 *   npm run session:age -- 13h --staff=Michael
 *   npm run session:age -- 13h --sid=<sid>   # exact row, never guesses
 *
 * With no filter it picks the NEWEST live session, which is the one you just
 * created by signing in. If someone else is signed in on this database, name
 * yourself with --staff= (or --sid=) so you age your row and not theirs.
 *
 * Then refresh the browser. Checked → still signed in. Unchecked → kicked to
 * /signin. That is the whole test.
 *
 * Deliberately does NOT read the session back: probing it would itself trip the
 * idle auto-revoke, and then the browser would be reporting this script's
 * side-effect instead of the real thing. The browser stays the source of truth.
 */

import pool from '@/lib/db';

const UNITS: Record<string, string> = { h: 'hours', d: 'days', m: 'minutes' };

function parseInterval(raw: string | undefined): string {
  const m = /^(\d+)\s*([hdm])$/i.exec((raw ?? '').trim());
  if (!m) {
    throw new Error(`give an age like 13h, 9h, 30d or 200d — got "${raw ?? ''}"`);
  }
  return `${m[1]} ${UNITS[m[2]!.toLowerCase()]}`;
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const interval = parseInterval(args.find((a) => !a.startsWith('--')));
  const staff = args.find((a) => a.startsWith('--staff='))?.slice('--staff='.length);
  const sid = args.find((a) => a.startsWith('--sid='))?.slice('--sid='.length);

  const target = await pool.query<{
    sid: string; name: string; device_kind: string; persistent: boolean; session_policy: string | null;
  }>(
    `SELECT s.sid, st.name, s.device_kind, s.persistent, st.session_policy
       FROM staff_sessions s
       JOIN staff st ON st.id = s.staff_id
      WHERE s.revoked_at IS NULL
        AND s.expires_at > NOW()
        AND ($1::text IS NULL OR st.name ILIKE '%' || $1 || '%')
        AND ($2::text IS NULL OR s.sid = $2)
      ORDER BY s.created_at DESC
      LIMIT 1`,
    [staff ?? null, sid ?? null],
  );
  const row = target.rows[0];
  if (!row) {
    console.error(
      sid ? `no live session with that sid`
        : staff ? `no live session for a staff matching "${staff}"`
        : 'no live session — sign in first',
    );
    process.exitCode = 1;
    return;
  }

  await pool.query(
    `UPDATE staff_sessions SET last_seen_at = NOW() - $2::interval WHERE sid = $1`,
    [row.sid, interval],
  );

  const box = row.persistent ? 'CHECKED' : 'unchecked';
  const policy = row.session_policy === 'persistent' ? ' (staff policy is persistent too)' : '';
  console.log(`aged ${row.name}'s ${row.device_kind} session by ${interval}`);
  console.log(`  "Keep me signed in" was ${box}${policy}`);
  console.log(
    row.persistent
      ? '\n→ refresh the browser. You should STILL BE SIGNED IN.'
      : '\n→ refresh the browser. You should be SIGNED OUT (that is the safety property).',
  );

  await pool.end();
}

void main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
