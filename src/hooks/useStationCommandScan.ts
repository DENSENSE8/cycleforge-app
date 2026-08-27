'use client';

import { useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';

import { useAuth } from '@/contexts/AuthContext';
import { flashScanBand } from '@/lib/scan-feedback/visual';
import { toast } from '@/lib/toast';
import {
  isCommandNamespace,
  parseNavCommand,
  type NavCommandDef,
} from '@/lib/stations/nav-command-codes';
import { parseActionCommand } from '@/lib/stations/action-command-codes';
import { resolveCommandAlias } from '@/lib/stations/command-alias-store';
import {
  isAlreadyAtNavCommand,
  navCommandPermission,
  resolveNavCommandTarget,
} from '@/lib/stations/nav-command-target';
import {
  clearScanSubject,
  getScanSubject,
} from '@/lib/stations/scan-subject-store';

/**
 * The one client waist for `CMD-*` scans — navigation and action alike.
 *
 * Returns a claim predicate: `true` means the scan was a command and has been
 * fully handled (navigated, submitted, or deliberately refused) — the caller
 * must stop. `false` means it was not a command and the caller's own resolution
 * continues exactly as before.
 *
 * The predicate is SYNCHRONOUS even though an action command performs a network
 * write. Claiming has to be immediate: the caller is deciding, in the same tick,
 * whether to hand the string to its own resolver, and a promise there would let
 * a verdict sticker be looked up as a serial while the write was still in
 * flight. So the claim returns at once and the write settles behind it — the
 * scan band and a toast report the outcome, and navigation happens only if the
 * server said the write landed.
 *
 * Nav resolution stays entirely client-side (the session already carries the
 * permission set, which is what filters the sidebar), so a jump costs zero
 * round-trips. Only a write crosses the network.
 */
export function useStationCommandScan(): (raw: string) => boolean {
  const router = useRouter();
  const { has } = useAuth();
  // Guards a double trigger-pull: a scanner that fires twice must not submit
  // two verdicts. `clientEventId` makes the SERVER idempotent; this keeps the
  // second pull from even leaving the bench.
  const inFlight = useRef(false);

  /** Push to a nav command's destination. Assumes permission already checked. */
  const goTo = useCallback(
    (def: NavCommandDef): void => {
      const origin = {
        pathname: window.location.pathname || '/',
        params: new URLSearchParams(window.location.search),
      };
      if (isAlreadyAtNavCommand(def, origin)) return;
      const target = resolveNavCommandTarget(def, origin);
      if (!target) {
        toast.error(`${def.label} — destination not available`);
        return;
      }
      router.push(target.search ? `${target.pathname}?${target.search}` : target.pathname);
    },
    [router],
  );

  return useCallback(
    (raw: string): boolean => {
      // A tenant alias resolves to its TARGET first, and everything below then
      // behaves exactly as if the built-in sticker had been scanned. That is
      // what keeps `CMD-GO-BENCH-3` from becoming a second code path with its
      // own permission check and its own bugs: an alias renames a command, it
      // never widens one.
      const canonical = resolveCommandAlias(raw) ?? raw;

      // ── Navigation ────────────────────────────────────────────────────────
      const nav = parseNavCommand(canonical);
      if (nav) {
        // Permission BEFORE navigation. The nav graph's own `requires` is what
        // hides an unreachable page from the sidebar; a scan that pushed past
        // it would strand the operator on `/not-authorized` with no way back to
        // their work but the mouse they were trying not to touch.
        const perm = navCommandPermission(nav);
        if (perm && !has(perm)) {
          flashScanBand('reject');
          toast.error(`${nav.label} — you do not have access`);
          return true;
        }
        // Acknowledge the read even when already home, so the operator knows
        // the gun fired; `goTo` declines to re-push, which would reset the
        // surface's own state for a scan that changed nothing.
        flashScanBand('success');
        goTo(nav);
        return true;
      }

      // ── Action / compound ─────────────────────────────────────────────────
      const action = parseActionCommand(canonical);
      if (action) {
        if (!has(action.requires)) {
          flashScanBand('reject');
          toast.error(`${action.label} — you do not have access`);
          return true;
        }

        const subject = getScanSubject();
        if (!subject) {
          // A verb with no noun. Refusing is the only safe answer: there is no
          // "current unit" to fall back on that would not be a guess about
          // which unit the operator is holding.
          flashScanBand('reject');
          toast.error(`${action.label} — scan a unit first`);
          return true;
        }

        if (inFlight.current) {
          flashScanBand('reject');
          return true;
        }
        inFlight.current = true;

        const clientEventId = `cmd-${action.code}-${subject.value}-${subject.at}`;
        void (async () => {
          try {
            const res = await fetch('/api/stations/handoff', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                code: action.code,
                unitKey: subject.value,
                clientEventId,
              }),
            });
            const data = (await res.json().catch(() => ({}))) as {
              ok?: boolean;
              error?: string;
              to?: string;
              goTo?: string | null;
            };

            if (!res.ok || !data.ok) {
              // Nothing moved. Keep the operator where they are so the failure
              // is visible at the bench that caused it.
              flashScanBand('reject');
              toast.error(data.error || `${action.label} failed`);
              return;
            }

            flashScanBand('success');
            toast.success(`${action.label} — ${subject.value} → ${data.to}`);
            // Consumed. A second sticker scan must not re-apply a verdict that
            // already landed.
            clearScanSubject();

            if (data.goTo) {
              const next = parseNavCommand(data.goTo);
              const perm = next ? navCommandPermission(next) : null;
              if (next && (!perm || has(perm))) goTo(next);
            }
          } catch {
            flashScanBand('reject');
            toast.error(`${action.label} — could not reach the server`);
          } finally {
            inFlight.current = false;
          }
        })();
        return true;
      }

      // ── Unregistered command ──────────────────────────────────────────────
      // Still CLAIMED. Letting it fall through is how a sticker becomes a
      // serial: `classifyInput` types it `serial_partial` and the tech bench
      // persists it as a unit identity.
      if (isCommandNamespace(canonical)) {
        flashScanBand('reject');
        toast.error(`Unknown command ${String(raw).trim().toUpperCase()}`);
        return true;
      }

      return false;
    },
    [goTo, has],
  );
}
