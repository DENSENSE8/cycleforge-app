/**
 * Body schema for PUT /api/tables/import-profiles — the org-wide named column
 * mapping write.
 *
 * Structural only, like `table-layouts`: the route re-reads the stored bag
 * through `readStoredProfiles`, which is the strict shape-reader, so a blob
 * that gets past this schema still cannot become a half-understood mapping in
 * the settings bag.
 */

import { z } from 'zod';

/** A header row and the field→header bindings learned from it. */
export const ImportMappingProfileBody = z
  .object({
    name: z.string().trim().min(1).max(80),
    /** The file's header row, as parsed. Drives matching, not display. */
    headers: z.array(z.string().min(1).max(200)).min(1).max(256),
    /** our field id → their column header. */
    mapping: z.record(z.string().min(1).max(64), z.string().min(1).max(200)),
  })
  .strict();

export const ImportMappingProfilePutBody = z
  .object({
    surface: z.string().min(1).max(64),
    /**
     * The profile to delete when `profile` is null. Ignored on an upsert —
     * `profile.name` is the identity there, so a rename cannot silently orphan
     * the row it meant to replace.
     */
    name: z.string().trim().min(1).max(80),
    /** The profile to store, or null to delete the one named above. */
    profile: ImportMappingProfileBody.nullable(),
  })
  .strict();

export type ImportMappingProfilePutBody = z.infer<typeof ImportMappingProfilePutBody>;
