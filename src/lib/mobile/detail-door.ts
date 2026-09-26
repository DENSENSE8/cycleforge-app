import type { ReactNode } from 'react';

/**
 * One door on a mobile entity hub, as data. Structurally the `DetailNavItem`
 * that `DetailNav` renders (`src/components/mobile/detail/DetailParts.tsx`);
 * declared here so a `lib` row builder never imports a component module.
 */
export interface DetailDoor {
  id: string;
  title: string;
  icon: ReactNode;
  meta: ReactNode;
  href?: string | null;
  onSelect?: () => void;
}

/** What a slice's summary hook says about its door (`useRepairPhotosRow`, …). */
interface DetailDoorSummary {
  meta: ReactNode;
  /** `false` keeps the door visible but inert; `meta` says why. Default `true`. */
  enabled?: boolean;
}

/**
 * The door to one exact job under a hub:
 * Mobile exoskeleton law (operator 2026-09-24): `src/lib/mobile/detail-hub-law.ts`.
 */
export function detailDoor(
  base: string,
  id: string,
  title: string,
  icon: ReactNode,
  { meta, enabled = true }: DetailDoorSummary,
): DetailDoor {
  const root = base.endsWith('/') ? base.slice(0, -1) : base;
  return { id, title, icon, meta, href: enabled ? `${root}/${id}` : null };
}
