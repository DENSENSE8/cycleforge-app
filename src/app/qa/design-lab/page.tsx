import { PageHeader } from '@/components/ui/pane-header';
import { DesignLabCatalog } from '@/components/design-lab/DesignLabCatalog';
import { DESIGN_LAB_VIEWPOINTS } from '@/lib/design-lab/catalog';
import { DESIGN_LAB_SANDBOX_HREF } from '@/lib/design-lab/constants';
import Link from 'next/link';
import {
  RESKIN_CANDIDATE,
  RESKIN_GROUPS,
  reskinChangedKeys,
} from '@/design-system/themes/reskin';

export const metadata = { title: 'Design Lab' };

/**
 * QA Design Lab — the reskin compare surface.
 *
 * Settings/admin lane, so the frame is PageHeader from @/components/ui/pane-header
 * (DeskPageChrome is the operator-desk frame and threads its title off the nav
 * spine — this page is not on that spine).
 */
export default function DesignLabPage() {
  const changed = reskinChangedKeys();

  return (
    <div className="flex h-full min-h-0 w-full flex-col bg-surface-canvas">
      <PageHeader title="Design Lab" count={DESIGN_LAB_VIEWPOINTS.length} />
      <main className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-6xl px-6 py-8 sm:px-10">
          <p className="mb-2 max-w-3xl text-role-body text-text-muted">
            Every card opens a real product route against QA fixtures. Pick which token groups are
            live with the control at bottom-left, run the same clicks under both, and record a
            verdict. Before and After follow that selection, so a verdict can name one group.
          </p>
          <p className="mb-8 max-w-3xl text-role-caption text-text-soft">
            <span className="font-medium text-text-muted">
              {RESKIN_CANDIDATE.name} — {RESKIN_CANDIDATE.hint}
            </span>{' '}
            {changed.length} theme variables differ across {RESKIN_GROUPS.length} groups you can
            flip one at a time. Corner radius and the type scale are Tailwind classes, not runtime
            variables — those move in the <code>:3051</code> worktree lane, not with this toggle.
          </p>
          <p className="mb-8 max-w-3xl text-role-caption text-text-soft">
            Tuning tokens rather than testing routes?{' '}
            <Link href={DESIGN_LAB_SANDBOX_HREF} className="font-medium text-text-accent underline">
              Open the sandbox
            </Link>{' '}
            — every primitive in every variant and state on one page, grouped by the token group
            that moves it.
          </p>

          <DesignLabCatalog />
        </div>
      </main>
    </div>
  );
}
