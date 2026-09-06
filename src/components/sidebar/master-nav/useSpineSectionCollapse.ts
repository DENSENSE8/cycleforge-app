'use client';

import { useCallback, useEffect, useState } from 'react';

/**
 * Per-device open/closed state for the spine's section disclosures.
 *
 * ## Why localStorage and not staff prefs
 *
 * Same call as the spine's own width (`SIDEBAR_SPINE_RESIZE.storageKey`,
 * `sidebar-spine.ts`): this is a per-device view state, not a per-staff
 * setting. Which sections one operator leaves folded on the packing bench
 * should not fold them on the desk they sit at after lunch, and the prefs bag
 * is `.strict()` (`lib/schemas/staff-preferences.ts`), so riding it would cost
 * a schema field, a server column read and a PUT on every chevron click.
 *
 * ## Why the store holds only the CLOSED ids
 *
 * A section is open unless it says otherwise, so a section added to the
 * registry next month arrives open on every device that already has a stored
 * value. Storing the open set instead would mean a new section is invisible to
 * every operator who ever touched a chevron, with nothing in their stored
 * state to say why. {@link SPINE_SECTION_CLOSED_BY_DEFAULT} is the one
 * exception list, and each entry is a design decision, not a user value.
 */
const STORAGE_KEY = 'sidebar-spine-sections-closed';

/**
 * Sections that start folded.
 *
 * Admin is the whole list: it is a destination an operator opens on purpose,
 * a handful of times a week, and its console sections would otherwise be the
 * longest run in the column — sitting under the desks people actually work
 * from. Stations, Desks and Operations Studio start open because they are the
 * shift's own destinations; folding them by default would hide the map behind
 * three clicks to save four rows.
 */
export const SPINE_SECTION_CLOSED_BY_DEFAULT: Record<string, true> = {
  admin: true,
  // Sessions starts folded for a measured reason, not for taste: the map has
  // ~75px of headroom at a 900px viewport, and the below-fold ratchet in
  // `sidebar-open-close.spec.ts` is pinned at zero rows. A list that grows
  // with usage must not be the thing that pushes a bench row past the fold.
  sessions: true,
};

export function useSpineSectionCollapse() {
  // Start at the design default so the SSR markup and the first client paint
  // agree on which sections are mounted; storage hydrates in the effect below.
  // A mismatch here would be a section flashing open before folding shut.
  const [closedSections, setClosedSections] = useState<ReadonlySet<string>>(
    () => new Set(Object.keys(SPINE_SECTION_CLOSED_BY_DEFAULT)),
  );

  useEffect(() => {
    let stored: string[] | null = null;
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      const parsed: unknown = raw ? JSON.parse(raw) : null;
      if (Array.isArray(parsed)) {
        stored = parsed.filter((id): id is string => typeof id === 'string');
      }
    } catch {
      // Unreadable or blocked storage keeps the design defaults.
    }
    if (stored) setClosedSections(new Set(stored));
  }, []);

  const setSectionOpen = useCallback((sectionId: string, open: boolean) => {
    setClosedSections((prev) => {
      const next = new Set(prev);
      if (open) next.delete(sectionId);
      else next.add(sectionId);
      try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify([...next]));
      } catch {
        // A blocked storage quota loses the memory of the fold, not the fold.
      }
      return next;
    });
  }, []);

  return { closedSections, setSectionOpen };
}
