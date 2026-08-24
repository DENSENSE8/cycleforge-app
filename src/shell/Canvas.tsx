'use client';

/**
 * THE CANVAS — the tiling surface, and the ONE place radius exists in the
 * application: `--r-hud`, one stroke, four sides.
 *
 * Tiles do not degrade below their floors; the canvas SCROLLS instead. That is
 * honest rather than complete — what a tile drops first below its minimum is
 * still an open design question — but it makes the geometry problem visible
 * instead of silent.
 */

import { AssistantFeed } from '@/shell/AssistantFeed';
import { Tile } from '@/shell/Tile';
import type { ShellApi } from '@/shell/useShell';

export function Canvas({ shell }: { shell: ShellApi }) {
  return (
    <div className="canvas-wrap">
      <div className="canvas">
        <div className="canvas-scroll">
          {shell.tiles.length === 0 ? (
            <AssistantFeed shell={shell} />
          ) : (
            shell.tiles.map((tile, i) => (
              <Tile
                key={tile.id}
                tile={tile}
                shell={shell}
                isLast={i === shell.tiles.length - 1}
              />
            ))
          )}
        </div>
      </div>
    </div>
  );
}
