'use client';

/**
 * MasterNav arrange — sortable desk-tab children + house icon catalog.
 * Daily spine stays a leaf for deskChrome pages; this list exists only while
 * arranging. Cannot mint routes.
 */

import { useSortable } from '@dnd-kit/sortable';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical } from '@/components/Icons';
import { IconButton } from '@/design-system/primitives';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/design-system/primitives/radix-popover';
import { cornerClass } from '@/design-system/tokens/radius';
import { NAV_ICON_CATALOG, NAV_ICON_KEYS } from '@/lib/nav/nav-icon-catalog';
import { navChildDragId, type NavChildDragData } from '@/lib/nav/nav-child-drag';
import { spineAccentFor } from '@/lib/nav/spine-section-accent';
import {
  SPINE_LABEL_CLASS,
  SPINE_ROW_FACE_CLASS,
  SPINE_ROW_ICON_CLASS,
  SPINE_ROW_SHELL_CLASS,
} from '@/components/sidebar/sidebar-spine';
import type { SidebarChildPage, SidebarPageNav } from '@/lib/sidebar-navigation';
import { cn } from '@/utils/_cn';
import { useNavArrange } from './nav-arrange-context';

function ArrangeChildRow({
  pageId,
  child,
  onPickIcon,
}: {
  pageId: string;
  child: SidebarChildPage;
  onPickIcon: (iconKey: string) => void;
}) {
  const accent = spineAccentFor(null);
  const dragId = navChildDragId(pageId, child.id);
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: dragId,
    data: { type: 'nav-child', pageId, childId: child.id } satisfies NavChildDragData,
  });
  const ChildIcon = child.icon;

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
      }}
      className={cn('relative', isDragging && 'z-10 opacity-80')}
    >
      <div
        className={cn(
          SPINE_ROW_SHELL_CLASS,
          SPINE_ROW_FACE_CLASS,
          accent.idlePage,
          isDragging && 'ring-1 ring-inset ring-border-soft',
        )}
      >
        <span
          className="inline-flex shrink-0 cursor-grab touch-none text-text-faint active:cursor-grabbing"
          aria-label={`Reorder ${child.label}`}
          {...attributes}
          {...listeners}
        >
          <GripVertical className={cn(SPINE_ROW_ICON_CLASS)} aria-hidden />
        </span>
        <span className={cn('min-w-0 flex-1 truncate', SPINE_LABEL_CLASS)} title={child.label}>
          {child.label}
        </span>
        <Popover>
          <PopoverTrigger asChild>
            <IconButton
              type="button"
              size="xs"
              ariaLabel={`Choose icon for ${child.label}`}
              className="shrink-0 text-text-faint hover:text-text-default"
              icon={<ChildIcon className="h-3.5 w-3.5" />}
            />
          </PopoverTrigger>
          <PopoverContent
            side="right"
            align="start"
            className="w-56 p-2"
            aria-label="Tab icons"
          >
            <div className="grid grid-cols-4 gap-1">
              {NAV_ICON_KEYS.map((key) => {
                const Glyph = NAV_ICON_CATALOG[key];
                return (
                  <IconButton
                    key={key}
                    type="button"
                    size="xs"
                    ariaLabel={key}
                    onClick={() => onPickIcon(key)}
                    className={cn(
                      'text-text-muted hover:bg-surface-hover hover:text-text-default',
                      cornerClass('surface'),
                    )}
                    icon={<Glyph className="h-3.5 w-3.5" />}
                  />
                );
              })}
            </div>
          </PopoverContent>
        </Popover>
      </div>
    </div>
  );
}

export function MasterNavArrangeTabs({ page }: { page: SidebarPageNav }) {
  const { arranging, publishChildIcon } = useNavArrange();
  const children = page.children ?? [];

  if (!arranging) return null;

  const ids = children.map((child) => navChildDragId(page.id, child.id));

  return (
    <div
      data-testid="master-nav-arrange-tabs"
      className="border-b border-border-soft"
      role="group"
      aria-label={`Arrange ${page.label} tabs`}
    >
      <div className="px-2 py-1.5 text-role-caption text-text-soft">
        Arranging {page.label} tabs
      </div>
      {children.length === 0 ? (
        <p className="px-2 pb-2 text-role-caption text-text-faint">
          Open a desk with tabs to change their order and icons.
        </p>
      ) : (
        <SortableContext items={ids} strategy={verticalListSortingStrategy}>
          {children.map((child) => (
            <ArrangeChildRow
              key={child.id}
              pageId={page.id}
              child={child}
              onPickIcon={(iconKey) => {
                void publishChildIcon(page.id, child.id, iconKey);
              }}
            />
          ))}
        </SortableContext>
      )}
    </div>
  );
}
