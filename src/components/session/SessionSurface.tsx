'use client';

/**
 * SessionSurface — THE surface: the operator's mission control.
 *
 * This is what `/` mounts (2026-09-05; mission frame 2026-09-06). The session
 * chrome (name · search · recents · New) lives UP in the global header —
 * published through `useHeader().setPanelContent` — so the surface itself is
 * instruments only.
 *
 * ## Calm → focus (the power-up)
 *
 * The surface rests CALM: one centered column (greeting · composer ·
 * suggestions), the room quiet. `useFocusWake` watches for the operator
 * actually arriving — pointer travel, a key, a touch — and wakes the surface
 * into the FOCUS frame: the left column becomes header + ranked TriageLedger
 * over the composer docked bottom-left, and the right pane assembles the
 * MissionPane (telemetry strip + live floor feed). The composer is ONE node
 * in both faces, so the wake tweens the room together around it (motion
 * `layout`, `springConcierge`) and never remounts the field. A live thread
 * pins focus; extended stillness with an empty thread settles back to calm.
 *
 * ## One query
 *
 * `useOperatorPulse` polls `/api/home-board` once for the whole surface —
 * the ledger, the telemetry strip and the model's own answers read the same
 * registered-tools chokepoint (Law 15). The mission pane's floor feed is the
 * only additional read, and it is a different instrument (ambient events,
 * never ranked work).
 *
 * ## Right pane: ONE occupant
 *
 * `artifact` | `board`(mission) — the board is the RESTING occupant;
 * `render_artifact` pushes it aside, closing an artifact returns to the
 * floor. Width is the ONLY thing that moves after the wake settles: the
 * sash resizes the left column, no tween, per M1.
 */

import { useCallback, useEffect, useState } from 'react';
import { AgentSessionPanel } from './AgentSessionPanel';
import { ArtifactViewPanel } from './artifacts/ArtifactViewPanel';
import { SessionSwitcher } from './SessionSwitcher';
import {
  ensureSessionArtifactListener,
  useSessionArtifacts,
} from './useSessionArtifacts';
import { MissionPane } from './MissionPane';
import { useOperatorPulse } from './useOperatorPulse';
import { useFocusWake } from './use-focus-wake';
import { useSessionPanelOccupant, toggleHomeBoard } from './session-panel-occupant';
import { HorizontalEdgeResizeHandle } from '@/design-system/components/HorizontalEdgeResizeHandle';
import { useHorizontalEdgeResize } from '@/design-system/hooks/useHorizontalEdgeResize';
import { AnimatePresence, motion } from '@/design-system/motion';
import { springConcierge } from '@/design-system/motion/tokens';
import { useHeader } from '@/contexts/HeaderContext';
import { cn } from '@/utils/_cn';

/** Left column geometry. The mission pane takes whatever is left. */
const CHAT_PANE = {
  storageKey: 'cf.session.chat-pane.width',
  defaultWidthPx: 520,
  minWidthPx: 360,
  maxWidthPx: 720,
} as const;

export function SessionSurface() {
  const [started, setStarted] = useState(false);
  const onStartedChange = useCallback((next: boolean) => setStarted(next), []);
  // The ranked first-plane feed — ONE /api/home-board read for the ledger,
  // the telemetry strip and (via the same tools) the model's answers.
  const pulse = useOperatorPulse();
  // Calm → focus. A live thread pins focus; stillness with an empty thread
  // settles the room back to the greeting.
  const focused = useFocusWake({ pinned: started });
  const awake = focused || started;
  // An arriving artifact also starts the frame — the + menu can dispatch one
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
  // The + menu can dispatch artifacts from the CALM state (before the view
  // panel mounts) — arm the listener with the surface, not the panel.
  useEffect(() => {
    ensureSessionArtifactListener();
  }, []);

  // Which surface owns the right pane. The board (mission pane) is the
  // resting occupant; artifacts push it aside. ⌘B is the routed toggle,
  // matching how ⌘N owns New and ⌘J owns Ask.
  const occupant = useSessionPanelOccupant();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && !e.shiftKey && e.key.toLowerCase() === 'b') {
        e.preventDefault();
        toggleHomeBoard();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const { width, edgeHandleProps, isDragging } = useHorizontalEdgeResize({
    storageKey: CHAT_PANE.storageKey,
    defaultWidth: CHAT_PANE.defaultWidthPx,
    minWidth: CHAT_PANE.minWidthPx,
    maxWidth: CHAT_PANE.maxWidthPx,
    label: 'Resize work column',
    testId: 'session-chat-pane-resize',
  });

  return (
    <div className="flex h-full min-h-0" data-session-surface>
      <div
        className={cn('relative flex h-full min-h-0', awake ? 'shrink-0' : 'flex-1')}
        // Width is the only thing that moves once the frame is awake — no
        // tween on the sash, per M1. The wake itself is the one choreography.
        style={awake ? { width } : undefined}
      >
        <AgentSessionPanel
          className="min-w-0 flex-1"
          focused={focused}
          pulse={pulse}
          onStartedChange={onStartedChange}
        />
        {awake ? (
          <HorizontalEdgeResizeHandle
            edgeHandleProps={edgeHandleProps}
            isDragging={isDragging}
            edge="trailing"
            placement="inset"
            tooltipLabel="Resize work column"
          />
        ) : null}
      </div>
      {/*
        The right pane assembles ON WAKE — the mission pane slides in as the
        ledger stacks, one choreography, `springConcierge` throughout. It is
        the resting occupant; an artifact takes the column and closing it
        returns to the floor.
      */}
      <AnimatePresence initial={false}>
        {awake ? (
          <motion.div
            key="mission-right"
            initial={{ opacity: 0, x: 24 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 24 }}
            transition={springConcierge}
            className="flex min-h-0 min-w-0 flex-1"
          >
            {occupant === 'artifact' ? (
              <ArtifactViewPanel className="min-w-0 flex-1" />
            ) : (
              <MissionPane className="min-w-0 flex-1" items={pulse.items} loading={pulse.loading} />
            )}
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
