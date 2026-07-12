import { redirect } from 'next/navigation';

/**
 * /forge — alias into the Home "Plan" (forge) mode (plan §3.3).
 *
 * Forge moved from Operations ▸ Plans onto Home: `/?mode=forge&view=live`
 * mounts the same `AgenticLoopLiveConsole` (live master-plan MDX + TicketStatus
 * + plan agent). Bookmarks and Hermes docs can keep using `/forge`. The `?mode=`
 * param lets this land even while Home is otherwise parked (see `app/page.tsx`).
 */
export default function ForgePage() {
  redirect('/?mode=forge&view=live');
}
