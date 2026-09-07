/**
 * GET /api/home-board
 *
 * The home board's tiles, in one request.
 *
 * ## Why this route calls the assistant tools
 *
 * Each tile's data source is already a registered assistant tool. Rather than
 * write a second query per tile, this route dispatches through
 * `runAssistantTool` — the same chokepoint the agent uses, with the same
 * permission check per tool and the same org-from-ctx scoping. That is what
 * makes "what's on my board?" and the board itself literally the same answer;
 * a tile cannot drift from the agent because there is one implementation.
 *
 * A tool the caller lacks permission for yields a tile in `denied` state
 * rather than failing the request: a picker who cannot read packing KPIs
 * should still get their own day, not an error page.
 *
 * Sequential, not parallel: these are org-scoped reads on the tenant pool, and
 * six concurrent connections per board load is how a shared pool starves under
 * a shift's worth of operators. The tiles are counts; the cost is small.
 */

import { NextResponse } from 'next/server';
import { withAuth, type AuthContext } from '@/lib/auth/withAuth';
import { runAssistantTool } from '@/lib/assistant/tools/index';
import type { AssistantToolCtx } from '@/lib/assistant/tools/types';

export const runtime = 'nodejs';

/**
 * Tile order IS the rail order, left to right: what is broken first, then the
 * operator's own work, then the shift's numbers. `roi_gaps` leads because a
 * board whose first tile is a to-do list buries the reason to look at it.
 */
const BOARD_TILES = [
  { id: 'roi_gaps', title: 'Close the gaps', tool: 'get_roi_gaps', input: {} },
  // The support pillar. Added 2026-09-06 with the home surface's first row: a
  // ticket assigned to you and unanswered is the only board row with a person
  // waiting on the other end of it, so the pulse cannot rank the shift
  // honestly without it.
  { id: 'support_followups', title: 'Support follow-ups', tool: 'list_support_followups', input: {} },
  { id: 'my_day', title: 'My day', tool: 'get_my_day', input: {} },
  { id: 'daily_checks', title: 'Daily checks', tool: 'get_daily_checks', input: {} },
  { id: 'project_tasks', title: 'Project tasks', tool: 'get_project_tasks', input: {} },
  { id: 'packing_kpi', title: 'Packing pace', tool: 'get_packing_kpi', input: {} },
] as const;

export const GET = withAuth(
  async (_req, ctx: AuthContext) => {
    const toolCtx: AssistantToolCtx = {
      organizationId: ctx.organizationId,
      staffId: ctx.staffId,
      permissions: ctx.permissions,
    };

    const tiles = [];
    for (const tile of BOARD_TILES) {
      const result = await runAssistantTool(tile.tool, tile.input, toolCtx);
      if (result.ok) {
        tiles.push({ id: tile.id, title: tile.title, tool: tile.tool, state: 'ok', data: result.data });
        continue;
      }
      tiles.push({
        id: tile.id,
        title: tile.title,
        tool: tile.tool,
        state: result.code === 'forbidden' ? 'denied' : 'error',
        error: result.error,
      });
    }

    return NextResponse.json({ tiles, loadedAt: new Date().toISOString() });
  },
  { permission: 'dashboard.view' },
);
