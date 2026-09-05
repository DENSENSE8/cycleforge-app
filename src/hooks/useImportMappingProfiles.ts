'use client';

/**
 * Named column-mapping profiles for one import surface — "map this supplier
 * once".
 *
 * The rail already maps their column to our field. What it did not do is
 * remember, so the same supplier's file was mapped by hand every week — the one
 * cost in the import flow that grows with how much the feature is used.
 *
 * All matching and merging is pure (`lib/tables/import/mapping-profiles.ts`);
 * this hook only fetches, caches and dispatches. Profiles live in the
 * `organizations.settings` passthrough bag, so the feature ships with no
 * migration.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  matchProfile,
  readStoredProfiles,
  type ImportMappingProfile,
  type ProfileMatch,
} from '@/lib/tables/import/mapping-profiles';

const ENDPOINT = '/api/tables/import-profiles';

export interface UseImportMappingProfiles {
  profiles: ImportMappingProfile[];
  /** True until the first load settles — the UI offers nothing before then. */
  loading: boolean;
  /** The best profile for a header row, or null. Pure; safe in render. */
  match: (headers: readonly string[]) => ProfileMatch | null;
  /** Store (or replace) a profile under `name`. */
  save: (name: string, headers: readonly string[], mapping: Record<string, string>) => Promise<void>;
  remove: (name: string) => Promise<void>;
}

export function useImportMappingProfiles(surface: string): UseImportMappingProfiles {
  const [profiles, setProfiles] = useState<ImportMappingProfile[]>([]);
  const [loading, setLoading] = useState(true);

  // Read at dispatch time so `save` / `remove` keep a stable identity while a
  // draft re-renders on every mapping change.
  const profilesRef = useRef(profiles);
  profilesRef.current = profiles;

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void (async () => {
      try {
        const res = await fetch(`${ENDPOINT}?surface=${encodeURIComponent(surface)}`);
        const json = await res.json().catch(() => ({}));
        if (!cancelled && res.ok) setProfiles(readStoredProfiles(json?.profiles));
      } catch {
        // A profile is an accelerator, never a gate: a failed load leaves the
        // manual mapping exactly as it was.
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [surface]);

  const match = useCallback(
    (headers: readonly string[]) => matchProfile(profilesRef.current, headers),
    [],
  );

  const write = useCallback(
    async (name: string, profile: ImportMappingProfile | null) => {
      try {
        const res = await fetch(ENDPOINT, {
          method: 'PUT',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            surface,
            name,
            profile: profile
              ? { name: profile.name, headers: profile.headers, mapping: profile.mapping }
              : null,
          }),
        });
        const json = await res.json().catch(() => ({}));
        if (res.ok) setProfiles(readStoredProfiles(json?.profiles));
      } catch (error) {
        console.error('[useImportMappingProfiles] write failed:', error);
      }
    },
    [surface],
  );

  const save = useCallback(
    (name: string, headers: readonly string[], mapping: Record<string, string>) =>
      write(name, { name, headers: [...headers], mapping, updatedAt: '' }),
    [write],
  );

  const remove = useCallback((name: string) => write(name, null), [write]);

  return { profiles, loading, match, save, remove };
}
