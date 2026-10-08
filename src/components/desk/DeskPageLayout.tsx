'use client';

/**
 * The **desk frame**, ready to mount — what a domain's route-group layout renders and nothing more.
 * URL param (operator 2026-09-25): it is how this staffer chose to see this
 */

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { useActiveSidebarChild } from '@/components/sidebar/master-nav/useActiveSidebarChild';
import { useSetting } from '@/hooks/useSettings';
import { deskViewSettingKey, settingByKey } from '@/lib/settings/registry';
import { getSidebarPageNav } from '@/lib/sidebar-navigation';
import type { DeskStageView } from '@/design-system/components/DeskStageContext';
import { DeskPageChrome } from '@/design-system/components/DeskPageChrome';
import {
  DeskActionSlotProvider,
  useDeskActionSlotNode,
} from '@/design-system/components/DeskActionSlot';
import { useNavDeskHeader } from '@/components/sidebar/contextual/NavKeyStrip';

export interface DeskPageLayoutProps {
  children: ReactNode;
  /** Title override. */
  title?: string;
  /**
   * Optional line under the title — a count, a scope. Omit it when there is
   * nothing true to say; a placeholder subtitle is worse than none.
   */
  subtitle?: ReactNode;
  /**
   * A CONTEXTUAL-SIDEBAR desk: the header is built from the same `NavContext`
   * the sidebar paints (`useNavDeskHeader`): the active view as the title
   * (hover-to-unfold pills when the page declares `viewKeys`) and the key
   * strip between title and actions. There is no tab row on ANY desk — a
   * desk's views live in the left contextual sidebar (owner 2026-09-28).
   */
  bare?: boolean;
  /** The in-place stage's measure — `full` for a board (see `DeskPageChrome`). */
  measure?: 'fixed' | 'full';
  /** Something that leads the title on its line (a full-screen page's Back) — the title's first element. */
  titleLead?: ReactNode;
  /** `false` = this desk opens no record pane: no In place · Split, the stage stays in place (see `DeskPageChrome`). */
  recordViews?: boolean;
  className?: string;
}

/** What a bare desk's header draws beyond a plain frame. */
type DeskHeaderFaces = { titleSlot?: ReactNode; headerCenter?: ReactNode };

export function DeskPageLayout(props: DeskPageLayoutProps) {
  return (
    <DeskActionSlotProvider>
      {props.bare ? <BareDeskFrame {...props} /> : <DeskPageFrame {...props} />}
    </DeskActionSlotProvider>
  );
}

/** A contextual-sidebar desk: title and key strip come from the page's `NavContext`. */
function BareDeskFrame(props: DeskPageLayoutProps) {
  const header = useNavDeskHeader();
  return (
    <DeskPageFrame
      {...props}
      title={props.title ?? header.title}
      titleSlot={header.titleSlot}
      headerCenter={header.headerCenter}
    />
  );
}

/** Inner half — reads the CTA slot the provider above it owns. */
function DeskPageFrame({
  children,
  title: titleOverride,
  titleSlot,
  titleLead,
  subtitle,
  headerCenter,
  measure,
  recordViews = true,
  className,
}: DeskPageLayoutProps & DeskHeaderFaces) {
  const { pageId } = useActiveSidebarChild();
  const title = titleOverride ?? getSidebarPageNav(pageId)?.label ?? '';
  const deskView = useDeskView(pageId);
  const view: DeskStageView = recordViews ? deskView.view : 'in-place';
  const addSlot = useDeskActionSlotNode();

  return (
    <DeskPageChrome
      title={title}
      titleSlot={
        titleLead ? (
          <span className="flex min-w-0 items-center gap-1">
            {titleLead}
            <span className="truncate">{titleSlot ?? title}</span>
          </span>
        ) : (
          titleSlot
        )
      }
      subtitle={subtitle}
      addSlot={addSlot}
      headerCenter={headerCenter}
      view={view}
      onViewChange={deskView.setView}
      measure={measure}
      recordViews={recordViews}
      className={className}
    >
      {children}
    </DeskPageChrome>
  );
}

/**
 * The desk's stage view — In place / Split, seeded from and written to the
 * staffer's remembered choice for THIS desk.
 */
function useDeskView(deskId: string) {
  const key = deskViewSettingKey(deskId);
  const remembered = settingByKey(key) != null;
  const setting = useSetting<DeskStageView>('desk', key);
  const [local, setLocal] = useState<{ deskId: string; value: DeskStageView } | null>(null);
  const view: DeskStageView =
    local?.deskId === deskId ? local.value : remembered && setting.value === 'split' ? 'split' : 'in-place';

  // `useSetting`'s setter is a fresh function every render; the ref keeps the
  // setter (and so the DeskStageProvider value) stable between clicks.
  const setRef = useRef(setting.set);
  useEffect(() => {
    setRef.current = setting.set;
  }, [setting.set]);
  const setView = useCallback(
    (next: DeskStageView) => {
      if (next === view) return;
      setLocal({ deskId, value: next });
      // The click already took effect; a failed write only means it is not remembered.
      if (remembered) void setRef.current(next).catch(() => undefined);
    },
    [deskId, view, remembered],
  );

  return { view, setView };
}
