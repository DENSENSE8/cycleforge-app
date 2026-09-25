'use client';

/**
 * Daily (`/`) — ONE surface: the agenda.
 *
 * It was briefly two tabs (Checklist · Tasks). Operator 2026-09-22:
 * *"consolidate the tasks into one display just under a type, like type daily
 * checklist and type task."* A tab is a place you have to already be; what is
 * on my plate today is one list with two labelled bands.
 *
 * The page frame (`DeskPageLayout`) is mounted by `DailyAgenda` itself: its tab
 * row carries the agenda's LENS tabs (local view state with live counts), the
 * way Reports passes its own. The title still comes from the nav entry — the
 * spine row is "Daily" with the lucide ListChecks glyph.
 *
 * `?mode=` tokens from removed modes (today / tasks / forge) are swallowed by
 * `parseHomeMode` rather than 404ing a bookmark.
 */

import { DailyAgenda } from './DailyAgenda';

export function HomeWorkspace() {
  return <DailyAgenda />;
}
