'use client';

/**
 * The desk tablist. Hold-drag reorders when `onTabsReorder` is passed.
 * Faces stay {@link DeskTab} — this file only owns sortable motion.
 */

import { useRef } from 'react';
import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  horizontalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { DeskTab, type DeskPageTab } from './DeskTab';
import { DESK_TAB_LIST_CLASS } from '../tokens/desk-stage';

function SortableDeskTab({
  tab,
  active,
  onClick,
  ignoreClickUntilRef,
}: {
  tab: DeskPageTab;
  active: boolean;
  onClick: () => void;
  ignoreClickUntilRef: { current: number };
}) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({
    id: tab.id,
  });
  return (
    <DeskTab
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className="touch-none"
      drag={{ ...(attributes as object), ...listeners }}
      onClick={() => {
        if (Date.now() < ignoreClickUntilRef.current) return;
        onClick();
      }}
      active={active}
      label={tab.label}
      count={tab.count}
      icon={tab.icon}
      testId={`desk-tab-${tab.id}`}
    />
  );
}

export function DeskTabList({
  tabs,
  activeTab,
  onTabChange,
  onTabsReorder,
}: {
  tabs: readonly DeskPageTab[];
  activeTab: string;
  onTabChange: (id: string) => void;
  onTabsReorder?: (orderedIds: string[]) => void;
}) {
  const ignoreClickUntilRef = useRef(0);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { delay: 180, tolerance: 8 } }),
  );
  const sortable = Boolean(onTabsReorder) && tabs.length > 1;
  const ids = tabs.map((tab) => tab.id);

  const onDragEnd = (event: DragEndEvent) => {
    if (!onTabsReorder) return;
    const { active, over } = event;
    if (!over) return;
    ignoreClickUntilRef.current = Date.now() + 400;
    const oldIndex = ids.indexOf(String(active.id));
    const newIndex = ids.indexOf(String(over.id));
    if (oldIndex < 0 || newIndex < 0 || oldIndex === newIndex) return;
    onTabsReorder(arrayMove(ids, oldIndex, newIndex));
  };

  const faces = tabs.map((tab) => {
    const active = tab.id === activeTab;
    if (!sortable) {
      return (
        <DeskTab
          key={tab.id}
          onClick={() => onTabChange(tab.id)}
          active={active}
          label={tab.label}
          count={tab.count}
          icon={tab.icon}
          testId={`desk-tab-${tab.id}`}
        />
      );
    }
    return (
      <SortableDeskTab
        key={tab.id}
        tab={tab}
        active={active}
        onClick={() => onTabChange(tab.id)}
        ignoreClickUntilRef={ignoreClickUntilRef}
      />
    );
  });

  if (!sortable) {
    return (
      <div role="tablist" className={DESK_TAB_LIST_CLASS}>
        {faces}
      </div>
    );
  }

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
      <SortableContext items={ids} strategy={horizontalListSortingStrategy}>
        <div role="tablist" className={DESK_TAB_LIST_CLASS}>
          {faces}
        </div>
      </SortableContext>
    </DndContext>
  );
}
