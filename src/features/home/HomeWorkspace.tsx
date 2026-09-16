'use client';

/**
 * Daily (`/`, was Home) — single surface.
 *
 * The mode router is gone (2026-09-14): Today (`MyDayWorkspace`) and Tasks
 * (`TasksWorkbench`) are unmounted from this page by operator ruling — their
 * files and backends stay on disk, and deleting them remains a separate,
 * gated pass. What renders is `HomeDailyMode`: the per-staff daily checklist.
 *
 * The page's own frame (`DeskPageLayout`, mounted by `app/page.tsx`) draws
 * the title from the nav entry — the spine row is "Daily" with the lucide
 * ListChecks glyph — and, with no `SIDEBAR_PAGE_NAV` children left, no tab
 * row: the honest shape for a single-surface desk.
 *
 * `?mode=` tokens from removed modes (today / tasks / forge) are swallowed by
 * `parseHomeMode` (see `home-modes.ts`) rather than 404ing a bookmark.
 */

import { HomeDailyMode } from './HomeDailyMode';

export function HomeWorkspace() {
  return <HomeDailyMode />;
}
