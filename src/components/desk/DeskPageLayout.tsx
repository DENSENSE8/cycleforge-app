'use client';

/**
 * The **desk frame**, ready to mount — what a domain's route-group layout
 * renders and nothing more.
 *
 * ```tsx
 * export default function ProductsDeskLayout({ children }: { children: ReactNode }) {
 *   return <DeskPageLayout>{children}</DeskPageLayout>;
 * }
 * ```
 *
 * Everything that used to be copied per desk lives here once: the CTA slot
 * channel (primary create verb plus overall actions such as Export), the nav →
 * tabs adapter, the page title, and the fullscreen state the table's ⤢ toggles.
 * A desk opts in by declaring `deskChrome: true` on its `SIDEBAR_PAGE_NAV` entry
 * and wrapping its segments in a route group with this layout — no per-desk
 * wiring, which is the point: the second copy of a frame is where two desks
 * start disagreeing about what a desk is.
 *
 * **A route GROUP, not a shared page.** Next keeps a layout mounted across
 * sibling segments, so switching tabs swaps only the body — and fullscreen
 * survives the switch. Fullscreen is a per-staffer, per-desk PREFERENCE, not a
 * URL param (operator 2026-09-25): it is how this staffer chose to see this
 * desk's records — list-left / record-right split (`DeskRecordPlane`) instead
 * of the record in place of the list — so it is remembered through the
 * Settings Registry (`desk.<deskId>.fullscreen`, staff scope) and a pasted
 * link never changes the reader's page.
 *
 * **Scan stations must never mount this.** They keep the edge-to-edge station
 * shell (`kind: 'station'` never opts in).
 *
 * The chrome itself is the design system's ({@link DeskPageChrome}); this file
 * is the app-side adapter that feeds it, because the system must not import the
 * app's spine.
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
  /**
   * Title override. The default is the page's own `SIDEBAR_PAGE_NAV` label, and
   * that is the right answer whenever the page HAS a nav entry — it cannot then
   * drift from the spine row. Pass this only for a surface the spine does not
   * name (`/tracking-exceptions`, a nested admin report), where the alternative
   * is an empty `<h1>`.
   */
  title?: string;
  /**
   * Optional line under the title — a count, a scope. Omit it when there is
   * nothing true to say; a placeholder subtitle is worse than none.
   */
  subtitle?: ReactNode;
  /**
   * Per-desk tab decoration — the seam for counts a desk can prove
   * (Shipping's held-order badge on Exceptions).
   *
   * A callback rather than a prop on the tabs themselves because the tab LIST
   * is nav data shared by every desk, and `useDeskPageChromeTabs` must not
   * learn one desk's query. Keep the function identity stable (`useCallback`)
   * or the memo below rebuilds the list every render.
   */
  decorateTabs?: (tabs: readonly DeskPageTab[]) => readonly DeskPageTab[];
  /**
   * Explicit tabs, for a page whose modes are NOT nav children.
   *
   * The nav is the source for a desk whose tabs are its former spine
   * drill-downs. Some pages have modes that were never nav rows — Reports'
   * Bin Utilization · Velocity · Dead Stock is local view state, not
   * navigation — and those used to hand-roll a tab strip beside this one.
   * Passing them here is what stops that being a second tab vocabulary.
   *
   * `activeTab` and `onTabChange` come with it or the row cannot answer a
   * click; supply all three or none.
   */
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

/**
 * The desk's fullscreen state, seeded from and written to the staffer's
 * remembered choice for THIS desk. The local value answers the click at once
 * and is keyed by desk, so a layout shared by two desks (Shipping's route
 * group spans `outbound` and `fba`) never carries one desk's choice into the
 * other. A desk with no registry row toggles without remembering.
 */
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
