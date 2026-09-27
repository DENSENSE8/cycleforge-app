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
import { useLaneDoorHref } from './useLaneDoorHref';

export type Glyph = { icon: React.ComponentType<{ className?: string }>; tone: string; alertCount?: true };

/**
 * A row's glyph. A page's view (`pageId` set): the view's state glyph
 * (`NAV_VIEW_ICONS`). Page map: the page's own nav icon — for a lane door
 * that is the lane's parent icon, the same one the landing page registers.
 */
export function navRowGlyph(item: NavItem, pageId: string | undefined): Glyph | null {
  if (pageId !== undefined) return NAV_VIEW_ICONS[`${pageId}.${item.id}`] ?? null;
  const icon = APP_SIDEBAR_NAV.find((row) => row.id === item.id)?.icon ?? getSidebarPageNav(item.id)?.icon;
  return icon ? { icon, tone: 'text-text-muted' } : null;
}

/**
 * The page map (`NavContext.sections` at `?view=top`) as pressable blocks:
 * the lanes and pages, each led by its nav icon; a `drill` row carries a
 * chevron; a remembering lane door opens the staffer's last view there
 * (`useLaneDoorHref`). A page's own views are not rows — they live behind
 * the head's view switcher (`NavViewSwitcher`).
 *
 * Every row is `NAV_BLOCK_CLASS` (flat, lifts on hover, sinks on press).
 * Categories are separated by a HAIRLINE, never a text heading (operator
 * 2026-09-27): a line falls before and after each multi-row category, so
 * runs of single-row lanes read as one list. The category name stays as the
 * group's accessible name. ONE lit plate (`layoutId`) slides to the row you
 * pick.
 *
 * `onActiveSelect` lets the `‹` peek treat a click on the lit row as "go back
 * down" without a navigation (the URL already is that page).
 */
export function NavSectionList({
  sections,
  onActiveSelect,
  activeRowRef,
}: {
  sections: readonly NavSection[];
  onActiveSelect?: () => void;
  activeRowRef?: React.Ref<HTMLAnchorElement>;
}) {
  const visible = sections.filter((section) => section.items.length > 0);
  const doorHref = useLaneDoorHref();
  return (
    <LayoutGroup id="nav-map">
      {visible.map((section, index) => {
        const previous = visible[index - 1];
        const hairline = previous !== undefined && (Boolean(section.label) || Boolean(previous.label));
        return (
          <SidebarGroup key={section.id} aria-label={section.label} className="gap-px px-2 py-0.5">
            {hairline ? <div role="separator" className="mx-2 mb-1.5 mt-1 h-px bg-border-hairline" /> : null}
            <SidebarMenu>
              {section.items.map((item) => (
                <NavItemRow
                  key={item.id}
                  item={item}
                  href={doorHref(item.id) ?? item.href}
                  glyph={navRowGlyph(item, undefined)}
                  onActiveSelect={onActiveSelect}
                  activeRowRef={item.active ? activeRowRef : undefined}
                />
              ))}
            </SidebarMenu>
          </SidebarGroup>
        );
      })}
    </LayoutGroup>
  );
}

function NavItemRow({
  item,
  href,
  glyph,
  onActiveSelect,
  activeRowRef,
}: {
  item: NavItem;
  href: string;
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
        href={href}
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
