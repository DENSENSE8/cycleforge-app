'use client';

/**
 * Keybinding overrides — the durable half of "this operator remapped ⌘⇧V".
 *
 * Mirrors `@/lib/workspace/persistence` exactly, because the two hazards it
 * documents apply here verbatim:
 *
 * - **The prefs merge is SHALLOW** (`prefs || patch`). Writing a nested partial
 *   REPLACES the whole sub-map, so {@link serializeKeybindings} always emits the
 *   complete map and callers PUT that.
 * - **The mirror key carries identity.** The old `cf.quickAccess` mirror does
 *   not, so a second staffer signing in on a shared floor terminal inherits the
 *   previous operator's bag. On a warehouse floor a shared terminal is the
 *   normal case, not the edge case — {@link keybindingsStorageKey} takes org +
 *   staff and there is no keyless form to reach for.
 *
 * Keybindings are a **PERSON fact**, not a machine fact: they follow the
 * staffer across workstations. (Printer profiles, panel widths and the
 * silent-print toggle are the machine facts, and they stay device-local.)
 *
 * ## Where this map lands — the whole path, end to end
 *
 * `staff_preferences.prefs.workspace.keybindings`, beside `openTabs` /
 * `pinnedTabs` / `pinnedTools` — one sub-map, one PUT, one shallow-merge hazard
 * to think about instead of two. That wiring is COMPLETE (this docblock used to
 * say it was a pending two-line addition; it is not):
 *
 * ```text
 * rebind → setKeybindingOverrides → emit()
 *        → WorkspacePersistenceMount's subscribeKeybindings (800ms debounce)
 *        → serializeWorkspace()            ← calls serializeKeybindings()
 *        → writeWorkspaceMirror(cf.workspace:{org}:{staff})   [same tick]
 *        → PUT /api/staff-preferences { workspace }           [debounced]
 *        → StaffPreferencesPutBody → WorkspacePrefs → KeybindingOverridesSchema
 *        → updateStaffPreferences(staffId, organizationId, …)
 * ```
 *
 * and back on the next load: the mirror hydrates synchronously on mount so the
 * chords are right in the first paint, then the prefs GET overwrites it, which
 * is what makes the bindings follow the staffer to a bench they have never
 * signed in at.
 *
 * The `cf.keybindings:{org}:{staff}` mirror below is therefore a SECOND,
 * currently-unused device mirror — `serializeWorkspace` carries these overrides
 * inside the workspace bag, which has its own identity-scoped mirror. It is
 * kept because it is the keyed form to reach for if keybindings ever need to
 * persist somewhere the workspace bag does not go (an unattended shell, a
 * sign-in-less terminal); {@link keybindingsStorageKey} exists so that a future
 * caller cannot reach for a keyless one.
 */

import { KeybindingOverridesSchema } from '@/lib/workspace/prefs-schema';
import {
  getKeybindingOverrides,
  setKeybindingOverrides,
  type KeybindingOverrides,
} from '@/lib/keybindings/registry';

const MIRROR_PREFIX = 'cf.keybindings';

/**
 * Re-exported, not defined here.
 *
 * The schema lives in `@/lib/workspace/prefs-schema` because that module is
 * server-reachable (`staff-preferences.ts` imports `WorkspacePrefs` as a value
 * to validate the prefs PUT) while THIS module is `'use client'` — it reads
 * `window.localStorage` and the registry singleton. Defining it here and
 * importing it there would put a client module in the server's validation path.
 * The re-export keeps every existing importer of this name working.
 */
export { KeybindingOverridesSchema } from '@/lib/workspace/prefs-schema';

/** Device mirror key for one (org, staff) pair. Identity is REQUIRED. */
export function keybindingsStorageKey(identity: {
  orgId: string;
  staffId: string | number;
}): string {
  return `${MIRROR_PREFIX}:${identity.orgId}:${identity.staffId}`;
}

/** The whole override map, ready to PUT or mirror. */
export function serializeKeybindings(
  overrides: KeybindingOverrides = getKeybindingOverrides(),
): KeybindingOverrides {
  return { ...overrides };
}

/** Validate an untrusted bag (prefs GET, localStorage). `null` = unusable. */
export function parseKeybindingOverrides(raw: unknown): KeybindingOverrides | null {
  const parsed = KeybindingOverridesSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

/** Push a validated bag into the registry. An absent/invalid bag clears it. */
export function hydrateKeybindingsFromPrefs(
  raw: KeybindingOverrides | null | undefined,
): void {
  setKeybindingOverrides(raw ?? {});
}

/** Read the device mirror. Corrupt / unavailable storage reads as empty. */
export function readKeybindingsMirror(key: string): KeybindingOverrides | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    return parseKeybindingOverrides(JSON.parse(raw) as unknown);
  } catch {
    return null;
  }
}

/** Write the device mirror. A full quota / disabled storage is not an error here. */
export function writeKeybindingsMirror(key: string, overrides: KeybindingOverrides): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(key, JSON.stringify(overrides));
  } catch {
    /* storage disabled or full — the prefs row is the SoT, the mirror is a nicety */
  }
}
