'use client';

/**
 * FIND measure — the ONE axis every FIND surface gates on.
 *
 * ## Why this exists
 *
 * `/search` and the scan-station preview pane mount the same FIND tree, and
 * before this module they disagreed about how to ask "how wide am I?":
 *
 * | site | asked by |
 * |---|---|
 * | `SearchResultRow` | the `density` prop, with a written refusal of `md:` |
 * | `SearchDossierFrame` | `md:` breakpoints in five places |
 * | `SearchBrowseShell` | nothing — it took the desk card unconditionally |
 *
 * One surface, three laws. This is the row's law, promoted to the surface:
 * the axis is the ROW's axis, named the row's way (`SearchRowDensity`), and it
 * is declared by the ROUTE.
 *
 * ## Why a viewport query is the wrong instrument (row law, 2026-09-12)
 *
 * "A desktop sidebar rail is narrow too, and a viewport query corrupts it."
 * `SearchFindPreviewEmbed` is the live proof: it paints the dossier inside a
 * scan-station preview pane a few hundred px wide, on a 1440px monitor. Every
 * `md:` in that tree fires and reserves a 224px outline rail inside a pane
 * that has no room for one. The viewport was never the fact anyone wanted.
 *
 * ## Why a context and not a prop
 *
 * The consumers are 1 hop (`SearchBrowseShell`) and 6 hops
 * (`SearchDossierFrame`, behind `SearchDetailWorkspace` → `SearchDossier` →
 * four per-entity dossiers) from the route. Threading one string through four
 * components that have no opinion about it is four chances for a default to
 * drift; the same reasoning already split
 * {@link SearchPrimaryPaintProvider} out of its shell in this folder.
 *
 * The value is still a property of the MOUNT: the route declares it once, and
 * nothing below reads a media query.
 */

import { createContext, useContext, type ReactNode } from 'react';
import type { FindStageDensity } from '@/design-system/tokens/desk-stage';

/**
 * The FIND measure. Same two names as `SearchRowDensity`'s list surfaces
 * (`dropdown` is the header combobox and never hosts a browse plane), and the
 * same two names the stage tokens key on, so there is one vocabulary end to
 * end.
 */
export type FindDensity = FindStageDensity;

const FindDensityContext = createContext<FindDensity>('comfortable');

export function FindDensityProvider({
  density,
  children,
}: {
  density: FindDensity;
  children: ReactNode;
}) {
  return (
    <FindDensityContext.Provider value={density}>{children}</FindDensityContext.Provider>
  );
}

/**
 * The measure this FIND subtree is painting at.
 *
 * Defaults to `comfortable` so a FIND leaf mounted outside a provider keeps
 * the historical desk paint rather than silently collapsing to the phone
 * list — a missing provider must be a visual no-op, not a layout change.
 */
export function useFindDensity(): FindDensity {
  return useContext(FindDensityContext);
}
