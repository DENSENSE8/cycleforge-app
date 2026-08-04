/**
 * Workbench contract guard: service-workspace / Support must not mount the
 * Station column shell (`StationWorkbench` / `StationContextBar`) as primary
 * chrome. That shell is Station-region anatomy (`display/station-workbench.md`),
 * not Layer A Workbench.
 *
 * Law: `.claude/rules/display/workbench.md` + `workbench-service.md`.
 *
 * ALLOWLIST shrinks only — remove a path when Support migrates off Station
 * column chrome. Never grow the list to silence a new mount.
 *
 * Run: node --test --import tsx src/lib/stations/workbench-anti-station-shell.guard.test.ts
 */

import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, it } from 'node:test';

const ROOT = process.cwd();
const SUPPORT_ROOT = join(ROOT, 'src/components/support');

/**
 * Known debt — Station column shell still reachable from Support. Shrink only.
 *
 * **Two different kinds of debt live here, and they are not equally bad.**
 * `SupportOrdersFocusHost` genuinely mounts the column shell. The two remaining
 * `service-workspace` / chat entries do not — they only pull *shared utilities
 * and types* out of that barrel (`WorkspaceTimelineTab`,
 * `WorkspaceTimelineAnchor`, `STATION_WORKBENCH_COLUMN`), which the
 * `from '@/components/station/workbench'` pattern cannot distinguish from a
 * mount.
 *
 * `SupportTicketFocus.tsx` left the list on 2026-08-02: the thread stopped
 * building section tabs when the displays moved to the right rail, and with them
 * went its last import of that barrel. `support-ticket-tabs.tsx` was deleted in
 * the same change and its entry became `support-ticket-displays.tsx`, which
 * still reaches for `WorkspaceTimelineTab`.
 *
 * The real fix is to move those four out of the Station barrel — section tabs
 * and a timeline tab are not Station anatomy, they are DS components that Unbox
 * happened to birth. Until then these stay listed: a narrower regex would let a
 * genuine mount back in, which is the wrong trade for a guard.
 */
const STATION_SHELL_ALLOWLIST = new Set([
  'src/components/support/orders/SupportOrdersFocusHost.tsx',
  'src/components/support/service-workspace/support-ticket-displays.tsx',
  'src/components/support/zendesk/chat/SupportTicketComposerDock.tsx',
]);

/** Primary Station column shell — not every entity-context atom (identity cards OK). */
const FORBIDDEN = [
  /from\s+['"]@\/components\/station\/workbench['"]/,
  /\bStationWorkbench\b/,
  /\bStationContextBar\b/,
];

function walkTsx(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) walkTsx(full, out);
    else if (/\.(tsx|ts)$/.test(name) && !name.includes('.test.')) out.push(full);
  }
  return out;
}

function rel(abs: string): string {
  return relative(ROOT, abs).replace(/\\/g, '/');
}

describe('Workbench anti–Station-column-shell (Support)', () => {
  it('ALLOWLIST entries exist on disk', () => {
    for (const path of STATION_SHELL_ALLOWLIST) {
      assert.ok(
        (() => {
          try {
            readFileSync(join(ROOT, path), 'utf8');
            return true;
          } catch {
            return false;
          }
        })(),
        `allowlisted path missing (remove from ALLOWLIST): ${path}`,
      );
    }
  });

  it('no new Support mount of StationWorkbench / StationContextBar outside ALLOWLIST', () => {
    const offenders: string[] = [];
    for (const abs of walkTsx(SUPPORT_ROOT)) {
      const path = rel(abs);
      if (STATION_SHELL_ALLOWLIST.has(path)) continue;
      const src = readFileSync(abs, 'utf8');
      // Comments may mention the ban — strip block + line comments before match.
      const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
      if (FORBIDDEN.some((re) => re.test(code))) offenders.push(path);
    }
    assert.deepEqual(
      offenders,
      [],
      `Station column shell under Support (add to ALLOWLIST only with plan review, prefer migrate):\n${offenders.join('\n')}`,
    );
  });

  it('ALLOWLIST is shrink-only pinned (count must not grow silently)', () => {
    // Pin cardinality so a drive-by add fails review. Update this number only
    // when shrinking after a migration — never when adding debt.
    assert.equal(STATION_SHELL_ALLOWLIST.size, 3);
  });
});
