import { SessionSurface } from '@/components/session/SessionSurface';

/**
 * Home (`/`) — **the assistant surface**. Agent chat left, read-only artifact
 * panel right, and nothing to the left of that: the nav spine is open at its
 * remembered width or gone, so a closed spine gives this page the frame's full
 * left edge. This is the whole page: there is nothing to navigate to first.
 *
 * It replaced the Daily · Today · Tasks mode router on 2026-09-05; those
 * answers are agent artifacts now (`get_daily_checks`, `get_my_day`,
 * `get_project_tasks` → `render_artifact`). The session chrome (name · search
 * · recents) publishes UP into the GLOBAL HEADER via useHeader panelContent —
 * the panel itself is chat only. New conversation routes through ⌘N / Ctrl+N
 * and the sidebar nav entry (`/?new=1`); recents load on demand in the header
 * switcher, so there is no mount-time fetch on the first screen of a shift.
 */
export default function Home() {
  return (
    <div className="h-full w-full overflow-hidden bg-surface-card">
      <SessionSurface />
    </div>
  );
}
