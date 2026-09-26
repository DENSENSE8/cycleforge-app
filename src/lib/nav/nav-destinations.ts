/** The spine's flat DESTINATION list — every place an operator can land, in one array, for the search path to rank with {@link searchNav}. */

import {
  SPINE_SECTIONS,
  spineSectionIdForPage,
  type SidebarIconComponent,
  type SidebarPageNav,
  type SpineSectionId,
} from '@/lib/sidebar-navigation';
import { isTabParked } from '@/lib/nav/parked-tabs';

interface NavDestination {
  /** Stable row key. `pageId` for a page, `pageId:childId` for a child page. */
  key: string;
  pageId: string;
  /** Present iff this destination is a child page of `pageId`. */
  childId?: string;
  /** The visible text — what {@link searchNav} ranks and highlights. */
  label: string;
  /**
   * Where it lives: the section for a page, the parent page for a child. Null
   * for top pins and parked registry rows, which belong to no section.
   */
  context: string | null;
  icon: SidebarIconComponent;
  sectionId: SpineSectionId | null;
  /** Searchable but never highlighted — see `nav-search.ts`. */
  keywords: string[];
}

function sectionLabel(id: SpineSectionId | null): string | null {
  if (!id) return null;
  return SPINE_SECTIONS.find((s) => s.id === id)?.label ?? null;
}

/** Context is metadata, so it must SAY something the label does not. */
function contextFor(label: string, parent: string | null): string | null {
  if (!parent) return null;
  return parent.trim().toLowerCase() === label.trim().toLowerCase() ? null : parent;
}

/** Flatten pages + their child pages into destinations. */
export function buildNavDestinations(pages: readonly SidebarPageNav[]): NavDestination[] {
  const out: NavDestination[] = [];

  for (const page of pages) {
    const sectionId = spineSectionIdForPage(page);
    const section = sectionLabel(sectionId);
    const icon = page.desktopIcon ?? page.icon;

    out.push({
      key: page.id,
      pageId: page.id,
      label: page.label,
      context: contextFor(page.label, section),
      icon,
      sectionId,
      // The href makes a URL fragment findable ("/ops/photos" → Media) without
      // letting it outrank a label; the section makes "fulfillment labels" work.
      // Inbound desk also answers "incoming" (former L2 mode name).
      keywords: [page.href, section, page.id === 'incoming' ? 'incoming' : null].filter(
        (v): v is string => Boolean(v),
      ),
    });

    for (const child of page.children ?? []) {
      // Search is a DOOR.
      if (isTabParked(page.id, child.id)) continue;
      out.push({
        key: `${page.id}:${child.id}`,
        pageId: page.id,
        childId: child.id,
        label: child.label,
        // The PAGE, not the section: a child's nearest meaningful parent is the
        // page it lives on, and showing "Fulfillment" on four sibling children
        // would not tell them apart.
        context: contextFor(child.label, page.label),
        icon,
        sectionId,
        keywords: [page.label, section].filter((v): v is string => Boolean(v)),
      });
    }
  }

  return out;
}
