/**
 * The spine's flat DESTINATION list — every place an operator can land, in one
 * array, for the search path to rank with {@link searchNav}.
 *
 * ## Why a child page is a destination
 *
 * `/products?view=qc` is a place, not a setting. The old spine filter matched
 * child labels but could only ever *render* pages and sections, so typing a
 * child's name surfaced its parent page (or worse, its section) and the
 * operator had to finish by hand. Emitting children as first-class rows is most of
 * what makes the search feel like it answers the question asked.
 *
 * ## Why `context` and not a nested tree
 *
 * While searching there is no hierarchy to render — the whole point of
 * flattening is that the operator already told us what they want. But a bare
 * list of labels loses *where* things are, and some labels only make sense in
 * place ("Ready" is Fulfillment's; "Reference" is Catalog's). So the parent
 * rides along as one line of metadata ON the row: section for a page, page for
 * a child. That is the standard search face of a tree (VS Code, Linear, Notion),
 * and it is why the resting hierarchy can stay a hierarchy.
 */

import {
  SPINE_SECTIONS,
  spineSectionIdForPage,
  type SidebarIconComponent,
  type SidebarPageNav,
  type SpineSectionId,
} from '@/lib/sidebar-navigation';

/**
 * What SELECTING a destination does.
 *
 * A destination used to have exactly one answer — push a route — because the
 * only things you could reach were pages. The Warehouse OS shell adds three
 * more kinds of openable thing (a session, a table, a tool), and all four have
 * to live in ONE searchable index or the operator has to know which door a
 * thing is behind before they can look for it.
 *
 * `'page'` is spelled out in the union but is also the ABSENCE of the field:
 * every destination that existed before this type did keeps navigating, and
 * `CommandBar` / `SidebarNavList` did not have to change a line. That is the
 * whole reason it is optional rather than required — a required launch kind
 * would have been a type error at ~40 call sites for a value every one of them
 * would have written the same way.
 */
export type NavLaunchKind = 'page' | 'session' | 'table' | 'tool';

/**
 * The launch half of a destination. Mixed into {@link NavDestination} and into
 * the palette's page row, so one row shape can describe both a route and a tab.
 */
export interface NavLaunchTarget {
  /** Absent ⇒ `'page'`: navigate, exactly as this row always has. */
  kind?: NavLaunchKind;
  /**
   * `openTab({ kind, ref })`'s `ref` — a session key, a `TableId`, a tool key.
   * Meaningless for a page, required for everything else; the launch index is
   * what pairs them, so nothing downstream has to check.
   */
  ref?: string;
}

export interface NavDestination extends NavLaunchTarget {
  /** Stable row key. `pageId` for a page, `pageId:childId` for a child page. */
  key: string;
  pageId: string;
  /** Present iff this destination is a child page of `pageId`. */
  childId?: string;
  /** The visible text — what {@link searchNav} ranks and highlights. */
  label: string;
  /**
   * Where it lives: the section for a page, the parent page for a child. Null
   * for top/footer pins, which belong to no section and read fine alone.
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

/**
 * Context is metadata, so it must SAY something the label does not. A page whose
 * name matches its section ("Inbound" inside Inbound) would otherwise render
 * `Inbound / INBOUND` — a second line that repeats the first and reads as a
 * rendering bug rather than as placement.
 */
function contextFor(label: string, parent: string | null): string | null {
  if (!parent) return null;
  return parent.trim().toLowerCase() === label.trim().toLowerCase() ? null : parent;
}

/**
 * Flatten pages + their child pages into destinations.
 *
 * A page with children still emits its OWN row. It is a real place (its default
 * child)
 * and, more practically, dropping it would make the page's name unsearchable
 * whenever no child happens to share it — typing "shipping" would return four
 * children and never the page itself.
 */
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
