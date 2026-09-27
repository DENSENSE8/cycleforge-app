'use client';

import Link from 'next/link';
import type { NavItem, NavSection } from '@/lib/nav/context/schema';
import { LayoutGroup, motion } from '@/design-system/motion';
import { motionTransition } from '@/design-system/foundations/motion-presets';
import { useMotionTransition } from '@/design-system/foundations/motion-presets-hooks';
import { SidebarGroup, SidebarMenu, SidebarMenuItem } from '@/components/ui/sidebar';
import { ChevronRight } from '@/components/Icons';
import { navIconStrokeClass } from '@/components/icons/nav-weight';
import { APP_SIDEBAR_NAV, getSidebarPageNav } from '@/lib/sidebar-navigation';
import { cn } from '@/utils/_cn';
import { NAV_BLOCK_CLASS, NAV_BLOCK_PLATE_CLASS } from './nav-block';
import { NAV_VIEW_ICONS } from './nav-view-icons';

type Glyph = { icon: React.ComponentType<{ className?: string }>; tone: string };

/**
 * A row's glyph. Page panel: the view's state glyph (`NAV_VIEW_ICONS`). Page
 * map: the page's own nav icon — for a lane door that is the lane's parent
 * icon, the same one the landing page registers.
 */
function glyphFor(item: NavItem, pageId: string | undefined): Glyph | null {
  if (pageId !== undefined) return NAV_VIEW_ICONS[`${pageId}.${item.id}`] ?? null;
  const icon = APP_SIDEBAR_NAV.find((row) => row.id === item.id)?.icon ?? getSidebarPageNav(item.id)?.icon;
  return icon ? { icon, tone: 'text-text-muted' } : null;
}

/**
 * `NavContext.sections` as pressable blocks — ONE renderer for both levels,
 * so backing out with `‹` keeps the same face:
 * - page panel (`pageId` set): the page's views, each led by its state glyph;
 * - page map (`pageId` unset): the lanes and pages, each led by its nav icon;
 *   a `drill` row carries a chevron.
 *
 * Every row is `NAV_BLOCK_CLASS` (flat, lifts on hover, sinks on press). Group
 * names are micro-caps eyebrows. ONE lit plate per level (`layoutId`) slides
 * to the row you pick. Nav rows never carry counts.
 *
 * `onActiveSelect` lets the `‹` peek treat a click on the lit row as "go back
 * down" without a navigation (the URL already is that page).
 */
export function NavSectionList({
  sections,
  onActiveSelect,
  activeRowRef,
  pageId,
}: {
  sections: readonly NavSection[];
  onActiveSelect?: () => void;
  activeRowRef?: React.Ref<HTMLAnchorElement>;
  /** Set on a page's own panel; unset renders the page map. */
  pageId?: string;
}) {
  return (
    <LayoutGroup id={pageId ? `nav-views:${pageId}` : 'nav-map'}>
      {sections.map((section) =>
        section.items.length === 0 ? null : (
          <SidebarGroup key={section.id} className="gap-px px-2 py-0.5">
            {section.label ? (
              <p className="px-2 pb-0.5 pt-2 text-role-micro font-semibold uppercase tracking-wider text-text-faint">
                {section.label}
              </p>
            ) : null}
            <SidebarMenu>
              {section.items.map((item) => (
                <NavItemRow
                  key={item.id}
                  item={item}
                  glyph={glyphFor(item, pageId)}
                  onActiveSelect={onActiveSelect}
                  activeRowRef={item.active ? activeRowRef : undefined}
                />
              ))}
            </SidebarMenu>
          </SidebarGroup>
        ),
      )}
    </LayoutGroup>
  );
}

function NavItemRow({
  item,
  glyph,
  onActiveSelect,
  activeRowRef,
}: {
  item: NavItem;
  glyph: Glyph | null;
  onActiveSelect?: () => void;
  activeRowRef?: React.Ref<HTMLAnchorElement>;
}) {
  const plateTransition = useMotionTransition(motionTransition.sliderIndicator);
  const interceptActive = item.active && onActiveSelect;
  return (
    <SidebarMenuItem>
      <Link
        ref={activeRowRef}
        href={item.href}
        prefetch={false}
        aria-current={item.active ? 'page' : undefined}
        className={cn(NAV_BLOCK_CLASS, 'h-8 text-role-body', item.active && 'font-medium')}
        onClick={
          interceptActive
            ? (event) => {
                if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return;
                event.preventDefault();
                onActiveSelect();
              }
            : undefined
        }
      >
        {item.active ? (
          <motion.span aria-hidden layoutId="nav-row-plate" transition={plateTransition} className={NAV_BLOCK_PLATE_CLASS} />
        ) : null}
        {glyph ? (
          <span aria-hidden className="flex shrink-0">
            <glyph.icon className={navIconStrokeClass(cn('size-4', glyph.tone))} />
          </span>
        ) : null}
        <span className="min-w-0 flex-1 truncate" title={item.label}>
          {item.label}
        </span>
        {item.badge === 'beta' ? (
          <span className="shrink-0 text-role-micro font-semibold uppercase tracking-wider text-text-faint">Beta</span>
        ) : null}
        {item.kind === 'drill' ? <ChevronRight aria-hidden className="size-3.5 shrink-0 text-text-faint" /> : null}
      </Link>
    </SidebarMenuItem>
  );
}
