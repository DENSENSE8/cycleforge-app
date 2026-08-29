/**
 * Reveal-on-arm keycap face — the transient single-letter hint painted on a
 * target while its region is armed (nav-keys spec:
 * `docs/todo/nav-keys-selection-keyboard-HANDOFF.md`).
 *
 * Kinetic Ledger flush chrome, accent-tinted so it reads as "press me" beside
 * the armed rail. It is NEVER a permanent per-row chip — it mounts only while
 * the region is armed and unmounts on disarm — and never a mono / slate
 * terminal cosplay. Micro role (smallest legal), tabular so single letters sit
 * on one baseline.
 */

import { cn } from '@/utils/_cn';

export const NAV_KEY_HINT_CLASS = cn(
  'inline-flex h-4 shrink-0 items-center justify-center px-1',
  'text-role-micro font-semibold uppercase tabular-nums',
  'bg-accent-bg/10 text-accent-bg ring-1 ring-inset ring-accent-bg/30',
);
