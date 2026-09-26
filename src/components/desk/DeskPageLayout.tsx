'use client';

/**
 * The **desk frame**, ready to mount — what a domain's route-group layout renders and nothing more.
 * URL param (operator 2026-09-25): it is how this staffer chose to see this
 */

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useActiveSidebarChild } from '@/components/sidebar/master-nav/useActiveSidebarChild';
import { useSetting } from '@/hooks/useSettings';
import { deskFullscreenSettingKey, settingByKey } from '@/lib/settings/registry';
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
}: DeskPageLayoutProps) {
  const nav = useDeskPageChromeTabs();
  const title = titleOverride ?? nav.title;
  const tabs = tabsOverride ?? nav.tabs;
  const activeTab = tabsOverride ? (activeTabOverride ?? '') : nav.activeTab;
  const onTabChange = tabsOverride ? (onTabChangeOverride ?? noop) : nav.onTabChange;
  const { fullscreen, toggleFullscreen } = useDeskFullscreen(useActiveSidebarChild().pageId);
  const addSlot = useDeskActionSlotNode();

  const decorated = useMemo(
    () => (decorateTabs ? decorateTabs(tabs) : tabs),
    [decorateTabs, tabs],
  );

  return (
    <DeskPageChrome
      title={title}
      subtitle={subtitle}
      tabs={decorated}
      activeTab={activeTab}
      onTabChange={onTabChange}
      addSlot={addSlot}
      tabsLead={tabsLead}
      fullscreen={fullscreen}
      onToggleFullscreen={toggleFullscreen}
      stage={stage}
      className={className}
    >
      {children}
    </DeskPageChrome>
  );
}

/** The desk's fullscreen state, seeded from and written to the staffer's remembered choice for THIS desk. */
function useDeskFullscreen(deskId: string) {
  const key = deskFullscreenSettingKey(deskId);
  const remembered = settingByKey(key) != null;
  const setting = useSetting<boolean>('desk', key);
  const [local, setLocal] = useState<{ deskId: string; value: boolean } | null>(null);
  const fullscreen =
    local?.deskId === deskId ? local.value : remembered ? setting.value === true : false;

  // `useSetting`'s setter is a fresh function every render; the ref keeps the
  // toggle (and so the DeskStageProvider value) stable between clicks.
  const setRef = useRef(setting.set);
  useEffect(() => {
    setRef.current = setting.set;
  }, [setting.set]);
  const toggleFullscreen = useCallback(() => {
    const next = !fullscreen;
    setLocal({ deskId, value: next });
    // The click already took effect; a failed write only means it is not remembered.
    if (remembered) void setRef.current(next).catch(() => undefined);
  }, [deskId, fullscreen, remembered]);

  return { fullscreen, toggleFullscreen };
}
