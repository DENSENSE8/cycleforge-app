/**
 * Integration check for "Keep me signed in" — the part a browser cannot prove.
 *
 * Persistence only fails after time passes, and you cannot wait 12 hours in a
 * test, so this mints real sessions through `createSession` and TIME-TRAVELS
 * `last_seen_at` / `expires_at` on the row, then asks `loadSessionWithReason`
 * what it thinks. Asserting on the reason tag (`idle-timed-out`, `revoked`, …)
 * rather than on "it looked signed out" means a failure names its own cause.
 *
 * DB-backed, so it deliberately does NOT live in src/**.test.ts (the unit pass
 * is DB-free). Run it against the dev database:
 *
 *   npx tsx --env-file=.env --import ./scripts/register-server-only-shim.cjs \
 *     scripts/verify-session-persistence.ts
 *
 * Every session it mints is labelled DEVICE_LABEL and deleted at the end, and
 * any staff row it touches is restored, pass or fail.
 */

import pool from '@/lib/db';
import {
  createSession,
  loadSessionWithReason,
  revokeSession,
  touchSession,
  type SessionNullReason,
} from '@/lib/auth/session';

const DEVICE_LABEL = 'persistence-verify';
const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

let failures = 0;
let checks = 0;

function check(ok: boolean, what: string, detail = ''): void {
  checks += 1;
  if (ok) {
    console.log(`  ✔ ${what}`);
  } else {
    failures += 1;
    console.error(`  ✘ ${what}${detail ? ` — ${detail}` : ''}`);
  }
}

/** Age a session as if nobody touched it for `ms`. */
async function ageBy(sid: string, ms: number): Promise<void> {
  await pool.query(
    `UPDATE staff_sessions SET last_seen_at = NOW() - ($2 || ' milliseconds')::INTERVAL WHERE sid = $1`,
    [sid, String(ms)],
  );
}

async function reasonFor(sid: string): Promise<SessionNullReason | 'ok'> {
  return (await loadSessionWithReason(sid)).reason;
}

async function revokedAt(sid: string): Promise<Date | null> {
  const r = await pool.query<{ revoked_at: Date | null }>(
    `SELECT revoked_at FROM staff_sessions WHERE sid = $1`,
    [sid],
  );
  return r.rows[0]?.revoked_at ?? null;
}

async function expiresAt(sid: string): Promise<Date> {
  const r = await pool.query<{ expires_at: Date }>(
    `SELECT expires_at FROM staff_sessions WHERE sid = $1`,
    [sid],
  );
  return r.rows[0]!.expires_at;
}

/** Days from now until `d`, rounded — the assertions only care about the order of magnitude. */
const daysOut = (d: Date): number => Math.round((d.getTime() - Date.now()) / DAY);

async function pickStaffId(): Promise<number> {
  const r = await pool.query<{ id: number; name: string }>(
    `SELECT id, name FROM staff
      WHERE COALESCE(active, true) = true AND COALESCE(status, 'active') = 'active'
      ORDER BY id ASC LIMIT 1`,
  );
  const row = r.rows[0];
  if (!row) throw new Error('no active staff to test with');
  console.log(`staff: #${row.id} ${row.name}`);
  return row.id;
}

async function main(): Promise<void> {
  const staffId = await pickStaffId();
  // Only restore what we actually changed — resetting a policy we never touched
  // would be a silent config edit, which is worse than the check it protects.
  let policyToRestore: { value: string | null } | null = null;

  try {
    // ── 1. Checked → long idle (handoff §1 / matrix #3) ─────────────────────
    console.log('\nchecked ("Keep me signed in") — 13 h, 30 d, 200 d of idle');
    const keep = await createSession({
      staffId, deviceKind: 'personal', deviceLabel: DEVICE_LABEL, persistent: true,
    });
    check(keep.persistent === true, 'row records persistent = true');
    check(daysOut(keep.expiresAt) >= 360, 'expires ~365 d out, not 30 d', `got ${daysOut(keep.expiresAt)} d`);

    for (const [label, ms] of [['13 h', 13 * HOUR], ['30 d', 30 * DAY], ['200 d', 200 * DAY]] as const) {
      await ageBy(keep.sid, ms);
      const reason = await reasonFor(keep.sid);
      check(reason === 'ok', `still signed in after ${label} idle`, `reason=${reason}`);
      check((await revokedAt(keep.sid)) === null, `revoked_at still NULL after ${label}`);
    }

    // touchSession must slide the absolute window forward for a persistent row.
    await pool.query(
      `UPDATE staff_sessions SET expires_at = NOW() + INTERVAL '2 days' WHERE sid = $1`,
      [keep.sid],
    );
    await touchSession(keep.sid);
    check(daysOut(await expiresAt(keep.sid)) >= 360, 'touchSession slides expires_at back out to a year');

    // ── 2. Unchecked → still expires (matrix #6, the safety property) ───────
    console.log('\nunchecked — the station window must still bite');
    const station = await createSession({
      staffId, deviceKind: 'station', deviceLabel: DEVICE_LABEL, persistent: false,
    });
    check(station.persistent === false, 'row records persistent = false');
    check(daysOut(station.expiresAt) <= 1, 'expires within a day', `got ${daysOut(station.expiresAt)} d`);
    await ageBy(station.sid, 9 * HOUR);
    const stationReason = await reasonFor(station.sid);
    check(stationReason === 'idle-timed-out', 'signed OUT after 9 h idle', `reason=${stationReason}`);
    check((await revokedAt(station.sid)) !== null, 'and the row is auto-revoked');

    // ── 3. Explicit sign-out still wins (matrix #7) ─────────────────────────
    console.log('\nexplicit sign-out beats persistence');
    const signedOut = await createSession({
      staffId, deviceKind: 'personal', deviceLabel: DEVICE_LABEL, persistent: true,
    });
    await revokeSession(signedOut.sid);
    const outReason = await reasonFor(signedOut.sid);
    check(outReason === 'revoked', 'revoked immediately', `reason=${outReason}`);
    await ageBy(signedOut.sid, 1 * HOUR);
    check((await reasonFor(signedOut.sid)) === 'revoked', 'and persistence does not resurrect it');

    // ── 4. Shift end is ignored for a persistent session (matrix #5) ────────
    console.log('\nan active shift must not cut a persistent session short');
    const shiftEnd = new Date(Date.now() + 1 * HOUR);
    const overShift = await createSession({
      staffId, deviceKind: 'station', deviceLabel: DEVICE_LABEL, persistent: true, expiresAt: shiftEnd,
    });
    check(daysOut(overShift.expiresAt) >= 360, 'expiry ignores shift end', `got ${daysOut(overShift.expiresAt)} d`);
    await ageBy(overShift.sid, 13 * HOUR); // past shift end and past every idle window
    const overReason = await reasonFor(overShift.sid);
    check(overReason === 'ok', 'still signed in past shift end', `reason=${overReason}`);

    // …and the same shift DOES bind a non-persistent one.
    const underShift = await createSession({
      staffId, deviceKind: 'station', deviceLabel: DEVICE_LABEL, persistent: false, expiresAt: shiftEnd,
    });
    check(
      Math.abs(underShift.expiresAt.getTime() - shiftEnd.getTime()) < 5000,
      'unchecked still expires at shift end',
      `got ${underShift.expiresAt.toISOString()}`,
    );

    // ── 5. Per-staff policy is an OR, not a replacement (matrix #11) ────────
    console.log('\nstaff.session_policy = persistent still wins with the box UNCHECKED');
    const before = await pool.query<{ session_policy: string | null }>(
      `SELECT session_policy FROM staff WHERE id = $1`, [staffId],
    );
    policyToRestore = { value: before.rows[0]?.session_policy ?? null };
    await pool.query(`UPDATE staff SET session_policy = 'persistent' WHERE id = $1`, [staffId]);
    const byPolicy = await createSession({
      staffId, deviceKind: 'station', deviceLabel: DEVICE_LABEL, persistent: false,
    });
    check(daysOut(byPolicy.expiresAt) >= 360, 'policy grants the year without the checkbox');
    await ageBy(byPolicy.sid, 13 * HOUR);
    const policyReason = await reasonFor(byPolicy.sid);
    check(policyReason === 'ok', 'and survives 13 h idle', `reason=${policyReason}`);
  } finally {
    if (policyToRestore) {
      await pool.query(`UPDATE staff SET session_policy = $2 WHERE id = $1`, [staffId, policyToRestore.value]);
      console.log(`restored staff #${staffId} session_policy = ${policyToRestore.value ?? 'NULL'}`);
    }
    const cleaned = await pool.query(`DELETE FROM staff_sessions WHERE device_label = $1`, [DEVICE_LABEL]);
    console.log(`\ncleanup: deleted ${cleaned.rowCount ?? 0} test session(s)`);
    await pool.end();
  }

  console.log(`\n${checks - failures}/${checks} checks passed`);
  if (failures) process.exitCode = 1;
}

void main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
