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
import { ContextMenu, OfflineBanner, SettingsPopover } from '@/shell/Overlays';
import { RailSessions } from '@/shell/RailSessions';
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
  // The phone put-away surface (00-endgame D4/D5): a one-handed browser page
  // at the shelf, not a workspace tenant — the shell frame has no business here.
  /^\/putaway(?:$|\/)/,
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
    cutSession,
    openLauncher,
    setContextMenu,
    closeTile,
    focusedTileId,
    toggleOffline,
  } = shell;

  /* NO document click-to-dismiss (removed 2026-08-24 with the shadcn
     migration). Radix dismisses its own surfaces on outside pointerdown,
     and this listener actively BROKE them: it fired on the very click
     that opened a menu, closing it in the same tick. Every
     `stopPropagation` in `Overlays.tsx` existed only to survive it, and
     they are gone too. */

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      /* Escape is Radix's too now — the launcher, the context menu and
         both popovers each close themselves. A second handler here would
         race them and could close a surface the operator had reopened. */
      if (!(e.metaKey || e.ctrlKey) || e.altKey) return;
      const k = e.key.toLowerCase();
      if (k === 'n') {
        // S12 — ⌘N cuts a new session block and parks the current one.
        // The launcher was never entitled to two chords: ⌘K keeps it (T19).
        e.preventDefault();
        cutSession();
      } else if (k === 'k') {
        e.preventDefault();
        openLauncher('');
      } else if (k === 'o' && e.shiftKey) {
        e.preventDefault();
        toggleOffline();
        // ⌘⇧B died with the rail rebuild (2026-08-25): the tools rail is
        // always mounted now, so the chord had nothing left to toggle —
        // the same argument that unbound ⌘B when the left rail became
        // permanent.
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
    cutSession,
    focusedTileId,
    openLauncher,
    setContextMenu,
    toggleOffline,
  ]);

  return (
    <div className="wos">
      <ShellIconSprite />
      <OfflineBanner shell={shell} />
      <GlobalHeader shell={shell} />

      {/* THE BODY IS THE CANVAS GROUND (operator, 2026-08-25 — §4 of the
          session-composer handoff): no left inset, no top inset below the
          beam, no plane strip behind either rail. The shell's only chrome
          is the global header; both icon stacks float directly on the
          canvas ground. (`.wos-body` left shell.css for Tailwind here —
          F11 shrink-only.) */}
      <div className="relative flex min-h-0 flex-1 overflow-hidden bg-plane-stage-sunken">
        <RailSessions shell={shell} />
        <Well shell={shell} />
        <ToolPanel shell={shell} />
        <RailTools shell={shell} />
        <SettingsPopover shell={shell} />
      </div>

      <ContextMenu shell={shell} />
      <Launcher shell={shell} />
    </div>
  );
}

export function ShellRoot({ children }: { children?: React.ReactNode }) {
  const pathname = usePathname() ?? '/';
  if (isChromeless(pathname)) return <>{children}</>;
  return <ShellFrame />;
}
