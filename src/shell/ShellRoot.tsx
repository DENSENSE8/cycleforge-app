'use client';

/**
 * THE FRAME. One always-mounted shell: beam · rails · well · tool panel.
 *
 * `app/layout.tsx` mounts exactly this and nothing else, so the shell never
 * unmounts and a tab survives navigation — which is the whole reason the tab
 * model is not a route model.
 *
 * ## Chromeless routes
 *
 * A handful of pages are NOT the workspace and must render bare: the auth
 * pages, and the GS1 Digital Link / short-URL resolvers whose paths are
 * printed onto stickers already on boxes in the warehouse. They pass through
 * as `children`; everything else gets the frame.
 */

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { Well } from '@/shell/Well';
import { GlobalHeader } from '@/shell/GlobalHeader';
import { Launcher } from '@/shell/Launcher';
import { ContextMenu, OfflineBanner, SessionPopover, SettingsPopover } from '@/shell/Overlays';
import { RailPages } from '@/shell/RailPages';
import { RailTools } from '@/shell/RailTools';
import { ShellIconSprite } from '@/shell/icons';
import { ToolPanel } from '@/shell/ToolPanel';
import { useShell } from '@/shell/useShell';

/**
 * Paths the workspace does not own. The six resolver trees are LIVE physical
 * infrastructure — a sticker on a box in the warehouse points at them — so
 * they render exactly what the route returns, with no chrome around it.
 */
const CHROMELESS = [
  /^\/signin(?:$|\/)/,
  /^\/signup(?:$|\/)/,
  /^\/invite(?:$|\/)/,
  /^\/not-authorized(?:$|\/)/,
  /^\/offline(?:$|\/)/,
  /^\/01(?:$|\/)/,
  /^\/414(?:$|\/)/,
  /^\/gs1(?:$|\/)/,
  /^\/l(?:$|\/)/,
  /^\/p(?:$|\/)/,
  /^\/s(?:$|\/)/,
  /^\/q(?:$|\/)/,
];

function isChromeless(pathname: string): boolean {
  return CHROMELESS.some((re) => re.test(pathname));
}

function ShellFrame() {
  const shell = useShell();
  const {
    closeLauncher,
    openLauncher,
    setContextMenu,
    setSessionPopoverOpen,
    setSettingsPopoverOpen,
    closeTile,
    focusedTileId,
    toggleLeftRail,
    toggleRightRail,
    toggleOffline,
  } = shell;

  /* A click anywhere dismisses the two surfaces that are anchored to a
     corner rather than to a control. The launcher owns its own backdrop and
     the session popover is dismissed by its own control, as in the prototype. */
  useEffect(() => {
    const onClick = () => {
      setContextMenu(null);
      setSettingsPopoverOpen(false);
    };
    document.addEventListener('click', onClick);
    return () => document.removeEventListener('click', onClick);
  }, [setContextMenu, setSettingsPopoverOpen]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        closeLauncher();
        setContextMenu(null);
        setSessionPopoverOpen(false);
        setSettingsPopoverOpen(false);
        return;
      }
      if (!(e.metaKey || e.ctrlKey) || e.altKey) return;
      const k = e.key.toLowerCase();
      if (k === 'n' || k === 'k') {
        e.preventDefault();
        openLauncher('');
      } else if (k === 'o' && e.shiftKey) {
        e.preventDefault();
        toggleOffline();
      } else if (k === 'b') {
        e.preventDefault();
        if (e.shiftKey) toggleRightRail();
        else toggleLeftRail();
      } else if (k === 'w' && !e.shiftKey) {
        e.preventDefault();
        if (focusedTileId) closeTile(focusedTileId);
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [
    closeLauncher,
    closeTile,
    focusedTileId,
    openLauncher,
    setContextMenu,
    setSessionPopoverOpen,
    setSettingsPopoverOpen,
    toggleLeftRail,
    toggleOffline,
    toggleRightRail,
  ]);

  return (
    <div className="wos">
      <ShellIconSprite />
      <OfflineBanner shell={shell} />
      <GlobalHeader shell={shell} />

      <div className="wos-body">
        <RailPages shell={shell} />
        <Well shell={shell} />
        <ToolPanel shell={shell} />
        <RailTools shell={shell} />
        <SettingsPopover shell={shell} />
      </div>

      <ContextMenu shell={shell} />
      <SessionPopover shell={shell} />
      <Launcher shell={shell} />
    </div>
  );
}

export function ShellRoot({ children }: { children?: React.ReactNode }) {
  const pathname = usePathname() ?? '/';
  if (isChromeless(pathname)) return <>{children}</>;
  return <ShellFrame />;
}
