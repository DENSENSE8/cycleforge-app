/**
 * `/review` mode vocabulary — the ONE parse of `?mode=` for the Review station.
 *
 * The axis is WHICH station's work you are reviewing: Packing (the default,
 * param cleared) · Pairing · Catalog link. The registry entry in
 * `sidebar-navigation.ts` (`SIDEBAR_PAGE_NAV` → `review`) is the mode LIST; this
 * is how a surface resolves which one is on screen.
 *
 * Both the workspace (`ReviewWorkspace`) and the context rail
 * (`ReviewSidebarPanel`) resolve from here so they can never disagree about
 * what the operator is looking at — the rail shipped packer-mode teaching copy
 * ("Select a packed order… or open Pairing…") on `?mode=catalog-link`, a
 * surface that has neither packed orders nor a Pairing control.
 *
 * Pure data only — no JSX, no imports.
 */

export type ReviewMode = 'packer' | 'pairing' | 'catalog-link';

/** Packing is the default and carries NO `?mode=` (its mode target nulls it). */
export function parseReviewMode(raw: string | null | undefined): ReviewMode {
  if (raw === 'pairing') return 'pairing';
  if (raw === 'catalog-link') return 'catalog-link';
  return 'packer';
}
