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
 * channel, the nav → tabs adapter, the page title, and the fullscreen state the
 * table's ⤢ toggles. A desk opts in by declaring `deskChrome: true` on its
 * `SIDEBAR_PAGE_NAV` entry and wrapping its segments in a route group with this
 * layout — no per-desk wiring, which is the point: the second copy of a frame
 * is where two desks start disagreeing about what a desk is.
 *
 * **A route GROUP, not a shared page.** Next keeps a layout mounted across
 * sibling segments, so switching tabs swaps only the body — and fullscreen
 * survives the switch. Fullscreen is deliberately session state rather than a
 * URL param: it is how this operator wants THIS screen right now, not part of
 * the address of what they are looking at, and a stage that reopened wide from
 * a pasted link would be a link that changed the page.
 *
 * **Scan stations must never mount this.** They keep the edge-to-edge station
 * shell (`kind: 'station'` never opts in).
 *
 * The chrome itself is the design system's ({@link DeskPageChrome}); this file
 * is the app-side adapter that feeds it, because the system must not import the
 * app's spine.
 */

import { useCallback, useMemo, useState, type ReactNode } from 'react';
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
  className,
}: DeskPageLayoutProps) {
  const nav = useDeskPageChromeTabs();
  const title = titleOverride ?? nav.title;
  const tabs = tabsOverride ?? nav.tabs;
  const activeTab = tabsOverride ? (activeTabOverride ?? '') : nav.activeTab;
  const onTabChange = tabsOverride ? (onTabChangeOverride ?? noop) : nav.onTabChange;
  const [fullscreen, setFullscreen] = useState(false);
  const toggleFullscreen = useCallback(() => setFullscreen((v) => !v), []);
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
      className={className}
    >
      {children}
    </DeskPageChrome>
  );
}
