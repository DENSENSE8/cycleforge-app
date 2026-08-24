import { z } from 'zod';
import { MAX_OPEN_TABS } from '@/lib/workspace/types';

/**
 * Zod contract for `staff_preferences.prefs.workspace` — the durable,
 * cross-device half of the window manager.
 *
 * **No migration.** `prefs` is an open JSONB bag behind a shallow `||` merge
 * that already exists; a new key needs a schema entry and nothing else. An
 * ABSENT key IS "start from empty" — so nothing here carries a default and no
 * backfill seeds one.
 *
 * **Send the whole sub-map.** The server merge is shallow (`prefs || patch`),
 * so writing `{ workspace: { openTabs } }` REPLACES the whole `workspace`
 * object and drops `pinnedTabs` with it. Serialize the full snapshot on every
 * write (`serializeWorkspace`) — never a nested partial.
 *
 * Lives here rather than in `schemas/staff-preferences.ts` so the localStorage
 * mirror validates against the same shape as the wire, with one import of zod
 * and nothing else in the graph.
 */

/**
 * Operator keybinding overrides: binding id → chord spec, or `null`.
 *
 * `null` means the operator DISABLED this binding; an ABSENT key means "use the
 * default". They are different answers and the schema keeps them apart.
 *
 * Defined HERE rather than in `@/lib/keybindings/persistence`, which is where it
 * is used most, because this module is server-reachable: `staff-preferences.ts`
 * imports `WorkspacePrefs` as a VALUE to validate the prefs PUT. The keybindings
 * persistence module is `'use client'` (it reads `window.localStorage` and the
 * registry singleton), so importing the schema FROM there would drag a client
 * module into the server's validation path. The dependency runs the other way:
 * the client module imports this schema.
 */
export const KeybindingOverridesSchema = z.record(
  z.string().min(1).max(120),
  z.union([z.string().min(1).max(64), z.null()]),
);

const TAB_PARAM_VALUE = z.union([
  z.string().max(2000),
  z.number(),
  z.boolean(),
  z.null(),
]);

const WORKSPACE_TAB = z
  .object({
    id: z.string().min(1).max(160),
    kind: z.enum(['session', 'table', 'tool']),
    ref: z.string().min(1).max(160),
    /** Absent = no params yet; the store normalizes to `{}` on hydrate. */
    params: z.record(z.string().max(64), TAB_PARAM_VALUE).optional(),
  })
  .strict();

export const WorkspacePrefs = z
  .object({
    openTabs: z.array(WORKSPACE_TAB).max(MAX_OPEN_TABS).optional(),
    /** Ids of pinned tabs. Ids with no matching open tab are dropped on hydrate. */
    pinnedTabs: z.array(z.string().min(1).max(160)).max(MAX_OPEN_TABS).optional(),
    /** `null` / absent = nothing focused (every tab suspended). */
    focusedTabId: z.string().min(1).max(160).nullable().optional(),
    /**
     * Operator keybinding overrides. A PERSON fact, not a device one: a
     * staffer's remapped chord must follow them to the next bench, which the
     * `cf.keybindings:{org}:{staff}` localStorage mirror cannot do alone.
     */
    keybindings: KeybindingOverridesSchema.optional(),
    /**
     * Tool keys the operator pinned in the right-rail palette. Same reasoning
     * as `keybindings` — a pin is about the person, not the workstation.
     */
    pinnedTools: z.array(z.string().min(1).max(160)).max(64).optional(),
    /**
     * The tiling arrangement. `root` stays `z.unknown()` ON PURPOSE:
     * `parseCanvasLayout` (src/lib/canvas/layout.ts) is the real validator and
     * it is depth-bounded and total. A second recursive zod schema here would
     * be a duplicate contract with nothing keeping the two in step.
     */
    canvas: z
      .object({
        root: z.unknown(),
        maximizedGroupId: z.string().max(160).nullable().optional(),
      })
      .optional(),
  })
  .strict();

export type WorkspacePrefs = z.infer<typeof WorkspacePrefs>;
