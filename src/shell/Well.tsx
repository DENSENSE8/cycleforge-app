'use client';

/**
 * THE WELL — the inversion (HANDOFF-ai-centre §1). The feed is no longer the
 * canvas's zero-tile fallback; it IS the surface, pinned centre, always
 * mounted. One sunken column: its ground is `--bg-canvas` — the one token
 * darker than the chrome plane in BOTH themes. SQUARE (2026-08-24) — the
 * well's own radius exception is retired now that it runs flush to the
 * display's own edges (chrome inset, zero padding): F1 is absolute, no
 * exceptions, everywhere, including here.
 *
 * Tiles no longer mount on the default screen. What a tile used to show
 * becomes a block in the feed or detail in the right panel (Phases 2–3). The
 * workspace store still owns "what is open" and the left rail still lists
 * it — the canvas was demoted, the model was not.
 */

import { AssistantFeed } from '@/shell/AssistantFeed';
import type { ShellApi } from '@/shell/useShell';

export function Well({ shell }: { shell: ShellApi }) {
  return (
    <div className="well-ground">
      <div className="well">
        <AssistantFeed shell={shell} />
      </div>
    </div>
  );
}
