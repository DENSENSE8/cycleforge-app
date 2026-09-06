'use client';

/**
 * SessionSurface — THE surface: agent session left, data view right.
 *
 * This is what `/` mounts (2026-09-05). It used to live behind `/session`
 * while the desks were the product; Home's Daily · Today · Tasks modes are now
 * artifacts the agent renders into the right pane, and the interactive
 * workbenches kept their own routes for the writes an artifact may not do.
 *
 * The session chrome (name · search · recents · New) lives UP in the global
 * header — published through `useHeader().setPanelContent`, the header's
 * context zone — pushed there on 2026-09-06 so the panel is chat only.
 *
 * Two states, one mount (so a morph never drops the live thread):
 *   • START — until the first message, one centered column owns the screen
 *     (greeting · composer · suggestions — the Grok/Codex landing).
 *   • SPLIT — chat pane left (operator-resizable via the house
 *     `useHorizontalEdgeResize` sash), artifact pane right. Width is the ONLY
 *     thing that moves: no tween, no geometry animation (M1).
 */

import { useCallback, useEffect, useState } from 'react';
import { AgentSessionPanel } from './AgentSessionPanel';
import { ArtifactViewPanel } from './artifacts/ArtifactViewPanel';
import { SessionSwitcher } from './SessionSwitcher';
import {
  ensureSessionArtifactListener,
  useSessionArtifacts,
} from './useSessionArtifacts';
import { HorizontalEdgeResizeHandle } from '@/design-system/components/HorizontalEdgeResizeHandle';
import { useHorizontalEdgeResize } from '@/design-system/hooks/useHorizontalEdgeResize';
import { useHeader } from '@/contexts/HeaderContext';
import { cn } from '@/utils/_cn';

/** Chat pane geometry. The artifact pane takes whatever is left. */
const CHAT_PANE = {
  storageKey: 'cf.session.chat-pane.width',
  defaultWidthPx: 440,
  minWidthPx: 360,
  maxWidthPx: 720,
} as const;

export function SessionSurface() {
  const [started, setStarted] = useState(false);
  const onStartedChange = useCallback((next: boolean) => setStarted(next), []);
  // An arriving artifact also starts the split — the + menu can dispatch one
  // before any chat message exists (e.g. "@ assign a task" → staff tasks).
  const { current: currentArtifact } = useSessionArtifacts();
  useEffect(() => {
    if (currentArtifact) setStarted(true);
  }, [currentArtifact]);
  // The switcher lives in the global header — the header's context zone is the
  // house slot for page-published chrome (goal chip uses the sibling pattern).
  const { setPanelContent } = useHeader();
  useEffect(() => {
    setPanelContent(<SessionSwitcher />);
    return () => setPanelContent(null);
  }, [setPanelContent]);
  // The + menu can dispatch artifacts from the START state (before the view
  // panel mounts) — arm the listener with the surface, not the panel.
  useEffect(() => {
    ensureSessionArtifactListener();
  }, []);

  const { width, edgeHandleProps, isDragging } = useHorizontalEdgeResize({
    storageKey: CHAT_PANE.storageKey,
    defaultWidth: CHAT_PANE.defaultWidthPx,
    minWidth: CHAT_PANE.minWidthPx,
    maxWidth: CHAT_PANE.maxWidthPx,
    edge: 'trailing',
    label: 'Resize chat panel',
    testId: 'session-chat-pane-resize',
  });

  return (
    <div className="flex h-full min-h-0" data-session-surface>
      <div
        className={cn('relative flex h-full min-h-0', started ? 'shrink-0' : 'flex-1')}
        style={started ? { width } : undefined}
      >
        <AgentSessionPanel
          className="min-w-0 flex-1"
          variant={started ? 'split' : 'start'}
          onStartedChange={onStartedChange}
        />
        {started ? (
          <HorizontalEdgeResizeHandle
            edgeHandleProps={edgeHandleProps}
            isDragging={isDragging}
            edge="trailing"
            placement="inset"
            tooltipLabel="Resize chat panel"
          />
        ) : null}
      </div>
      {started ? <ArtifactViewPanel className="min-w-0 flex-1" /> : null}
    </div>
  );
}
