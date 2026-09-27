'use client';

import Link from 'next/link';
import type { NavItem, NavSection } from '@/lib/nav/context/schema';
import { LayoutGroup, motion } from '@/design-system/motion';
import { motionTransition } from '@/design-system/foundations/motion-presets';
import { useMotionTransition } from '@/design-system/foundations/motion-presets-hooks';
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
} from '@/components/ui/sidebar';
import { ChevronRight } from '@/components/Icons';
import { SPINE_LABEL_CLASS } from '@/components/sidebar/sidebar-spine';
import { cn } from '@/utils/_cn';
import { NAV_BLOCK_CLASS, NAV_BLOCK_PLATE_CLASS } from './nav-block';
import { NAV_VIEW_ICONS } from './nav-view-icons';

/**
 * `NavContext.sections` as sidebar groups — the same renderer for the lane map
 * (`scope: 'top'`) and a page's section panel. Rows are plain links to
 * `item.href`; `active` is resolved server-side. Nav rows never carry counts.
 *
 * `pageId` turns on the page-panel face: 32px pressable blocks (see
 * `NAV_BLOCK_CLASS`) led by the view's glyph (`NAV_VIEW_ICONS`), group names
 * as quiet eyebrows, and ONE lit plate shared across every group (`layoutId`)
 * that slides to the view you pick.
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
  /** Set on a page's own panel: blocks, sliding plate, view glyphs. */
  pageId?: string;
}) {
  const panel = pageId !== undefined;
  return (
    <LayoutGroup id={panel ? `nav-views:${pageId}` : undefined}>
      {sections.map((section) =>
        section.items.length === 0 ? null : (
          <SidebarGroup key={section.id} className={panel ? 'gap-px px-2 py-0.5' : 'py-1'}>
            {section.label ? (
              panel ? (
                <p className="px-2 pb-0.5 pt-2 text-role-micro font-semibold uppercase tracking-wider text-text-faint">
                  {section.label}
                </p>
              ) : (
                <SidebarGroupLabel>{section.label}</SidebarGroupLabel>
              )
            ) : null}
            <SidebarGroupContent>
              <SidebarMenu>
                {section.items.map((item) => (
                  <NavItemRow
                    key={item.id}
                    item={item}
                    onActiveSelect={onActiveSelect}
                    activeRowRef={item.active ? activeRowRef : undefined}
                    pageId={pageId}
                  />
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ),
      )}
    </LayoutGroup>
  );
}

function NavItemRow({
  item,
  onActiveSelect,
  activeRowRef,
  pageId,
}: {
  item: NavItem;
  onActiveSelect?: () => void;
  activeRowRef?: React.Ref<HTMLAnchorElement>;
  pageId?: string;
}) {
  const plateTransition = useMotionTransition(motionTransition.sliderIndicator);
  if (pageId !== undefined) {
    // Page panel: a pressable block. The plate paints the lit face and slides
    // between rows; the row keeps no fill of its own so nothing flashes.
    const glyph = NAV_VIEW_ICONS[`${pageId}.${item.id}`];
    return (
      <SidebarMenuItem>
        <Link
          ref={activeRowRef}
          href={item.href}
          prefetch={false}
          aria-current={item.active ? 'page' : undefined}
          className={cn(NAV_BLOCK_CLASS, 'h-8 text-role-body', item.active && 'font-medium')}
        >
          {item.active ? (
            <motion.span aria-hidden layoutId="nav-view-plate" transition={plateTransition} className={NAV_BLOCK_PLATE_CLASS} />
          ) : null}
          {glyph ? (
            <span aria-hidden className="flex shrink-0">
              <glyph.icon className={cn('size-4', glyph.tone)} />
            </span>
          ) : null}
          <span className="min-w-0 flex-1 truncate" title={item.label}>
            {item.label}
          </span>
        </Link>
      </SidebarMenuItem>
    );
  }
  const interceptActive = item.active && onActiveSelect;
  return (
    <SidebarMenuItem>
      <SidebarMenuButton asChild isActive={item.active}>
        <Link
          ref={activeRowRef}
          href={item.href}
          prefetch={false}
          aria-current={item.active ? 'page' : undefined}
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
          <span className={cn('min-w-0 flex-1 truncate', SPINE_LABEL_CLASS)} title={item.label}>
            {item.label}
          </span>
          {item.kind === 'drill' ? (
            <ChevronRight aria-hidden className="size-3.5 shrink-0 text-text-faint" />
          ) : null}
        </Link>
      </SidebarMenuButton>
      {item.badge === 'beta' ? <SidebarMenuBadge>Beta</SidebarMenuBadge> : null}
    </SidebarMenuItem>
  );
}
