'use client';

/**
 * The **desk frame**, ready to mount — what a domain's route-group layout renders and nothing more.
 * URL param (operator 2026-09-25): it is how this staffer chose to see this
 */

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useActiveSidebarChild } from '@/components/sidebar/master-nav/useActiveSidebarChild';
import { useSetting } from '@/hooks/useSettings';
import { deskViewSettingKey, settingByKey } from '@/lib/settings/registry';
import type { DeskRememberedView, DeskStageView } from '@/design-system/components/DeskStageContext';
import {
  DeskPageChrome,
  type DeskPageTab,
} from '@/design-system/components/DeskPageChrome';
import {
  DeskActionSlotProvider,
  useDeskActionSlotNode,
} from '@/design-system/components/DeskActionSlot';
import { useDeskPageChromeTabs } from '@/components/desk/useDeskPageChromeTabs';

/** A tab row supplied without a handler answers no click — say so once, here. */
const noop = () => undefined;
const NO_TABS: readonly DeskPageTab[] = [];

export interface DeskPageLayoutProps {
  children: ReactNode;
  /** Title override. */
  title?: string;
  /**
   * Optional line under the title — a count, a scope. Omit it when there is
   * nothing true to say; a placeholder subtitle is worse than none.
   */
  subtitle?: ReactNode;
  /** Per-desk tab decoration — the seam for counts a desk can prove (Shipping's held-order badge on Exceptions). */
  decorateTabs?: (tabs: readonly DeskPageTab[]) => readonly DeskPageTab[];
  /** Explicit tabs, for a page whose modes are NOT nav children. */
  tabs?: readonly DeskPageTab[];
  activeTab?: string;
  onTabChange?: (id: string) => void;
  /**
   * Same-axis overflow at the head of the tab row — see
   * {@link DeskPageChromeProps.tabsLead}. Not a second CTA slot.
   */
  tabsLead?: ReactNode;
  /** Stage shape — see `DeskPageChromeProps.stage`. */
  stage?: 'card' | 'flush';
  /**
   * No tab row — the views live in the contextual sidebar (Shipping, operator
   * 2026-09-26). Header actions still paint (operator 2026-09-27).
   */
  bare?: boolean;
  className?: string;
}

export function DeskPageLayout(props: DeskPageLayoutProps) {
  return (
    <DeskActionSlotProvider>
      <DeskPageFrame {...props} />
    </DeskActionSlotProvider>
  );
}

/** Inner half — reads the CTA slot the provider above it owns. */
function DeskPageFrame({
  children,
  title: titleOverride,
  subtitle,
  decorateTabs,
  tabs: tabsOverride,
  activeTab: activeTabOverride,
  onTabChange: onTabChangeOverride,
  tabsLead,
  stage,
  className,
  bare = false,
}: DeskPageLayoutProps) {
  const nav = useDeskPageChromeTabs();
  const title = titleOverride ?? nav.title;
  const tabs = tabsOverride ?? nav.tabs;
  const activeTab = tabsOverride ? (activeTabOverride ?? '') : nav.activeTab;
  const onTabChange = tabsOverride ? (onTabChangeOverride ?? noop) : nav.onTabChange;
  const { view, setView, toggleFloor } = useDeskView(useActiveSidebarChild().pageId);
  const addSlot = useDeskActionSlotNode();

  const decorated = useMemo(
    () => (decorateTabs ? decorateTabs(tabs) : tabs),
    [decorateTabs, tabs],
  );

  return (
    <DeskPageChrome
      title={title}
      subtitle={subtitle}
      tabs={bare ? NO_TABS : decorated}
      activeTab={activeTab}
      onTabChange={onTabChange}
      addSlot={addSlot}
      tabsLead={tabsLead}
      view={view}
      onViewChange={setView}
      onToggleFloor={toggleFloor}
      stage={stage}
      className={className}
    >
      {children}
    </DeskPageChrome>
  );
}

/**
 * The desk's stage view. In place / Split are seeded from and written to the
 * staffer's remembered choice for THIS desk; floor is a session posture on
 * top of it (owner 2026-09-26) — never written, and leaving it lands on the
 * remembered view it was entered from.
 */
function useDeskView(deskId: string) {
  const key = deskViewSettingKey(deskId);
  const remembered = settingByKey(key) != null;
  const setting = useSetting<DeskRememberedView>('desk', key);
  const [local, setLocal] = useState<{ deskId: string; value: DeskRememberedView } | null>(null);
  const [floorDesk, setFloorDesk] = useState<string | null>(null);
  const base: DeskRememberedView =
    local?.deskId === deskId ? local.value : remembered && setting.value === 'split' ? 'split' : 'in-place';
  const view: DeskStageView = floorDesk === deskId ? 'floor' : base;

  // `useSetting`'s setter is a fresh function every render; the ref keeps the
  // setter (and so the DeskStageProvider value) stable between clicks.
  const setRef = useRef(setting.set);
  useEffect(() => {
    setRef.current = setting.set;
  }, [setting.set]);
  const setView = useCallback(
    (next: DeskStageView) => {
      if (next === 'floor') {
        setFloorDesk(deskId);
        return;
      }
      setFloorDesk(null);
      if (next === base) return;
      setLocal({ deskId, value: next });
      // The click already took effect; a failed write only means it is not remembered.
      if (remembered) void setRef.current(next).catch(() => undefined);
    },
    [deskId, base, remembered],
  );
  const toggleFloor = useCallback(() => {
    setFloorDesk((current) => (current === deskId ? null : deskId));
  }, [deskId]);

  return { view, setView, toggleFloor };
}
