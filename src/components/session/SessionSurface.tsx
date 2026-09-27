'use client';

/**
 * SessionSurface — `/ai-chat`, the AI surface. Built on the AI design system
 * (`@/design-system/ai`), not the triage system.
 *
 * ## One column, one optional panel
 *
 * Like any chatbot: no frame, a fixed-width column in the middle of a page
 * area that scrolls. Empty, the composer sits centred in it; once the
 * conversation starts the composer glides to the bottom of the viewport (same
 * width) and the transcript scrolls above and under it (`AgentSessionPanel`).
 *
 * The right panel exists only while an artifact is open in it: the newest one
 * a live turn produced (it opens on arrival), or whichever card the operator
 * clicked. Wide viewports dock it beside the page area (the column keeps its
 * width and re-centres in what is left); narrow ones overlay it on a scrim.
 * × / Esc close it; a reopened past session never opens it.
 */

import { useEffect } from 'react';
import { AgentSessionPanel } from './AgentSessionPanel';
import { ArtifactPanel } from './artifacts/ArtifactPanel';
import { ensureSessionArtifactListener, useSessionArtifacts } from './useSessionArtifacts';
import { AiSurface } from '@/design-system/ai';
import { useMediaQuery } from '@/hooks';

/** Below this the panel overlays the column instead of docking beside it. */
const DOCK_PANEL_QUERY = '(min-width: 1280px)';

export function SessionSurface() {
  const { opened, close } = useSessionArtifacts();
  const docked = useMediaQuery(DOCK_PANEL_QUERY);
  // Arm the artifact listener with the surface, so a result dispatched before
  // the first card renders is not lost.
  useEffect(() => {
    ensureSessionArtifactListener();
  }, []);

  return (
    <AiSurface className="relative flex h-full min-h-0 w-full overflow-hidden" data-session-surface>
      <AgentSessionPanel className="min-w-0 flex-1" panelDocked={opened !== null && docked} />
      <ArtifactPanel entry={opened} docked={docked} onClose={close} />
    </AiSurface>
  );
}
