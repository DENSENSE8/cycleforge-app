import { IncomingBrowseShell } from '@/components/receiving/incoming/IncomingBrowseShell';
import { ReceivingSurfacePage } from '@/components/receiving/ReceivingSurfacePage';
import { SurfaceGate } from '@/components/surfaces/SurfaceGate';
import { SurfaceParamHygiene } from '@/components/routing/SurfaceParamHygiene';
import { DeskPageLayout } from '@/components/desk/DeskPageLayout';
import { PoMailboxAdminSection } from '@/components/admin/PoMailboxAdminSection';

/**
 * `/incoming` — the Incoming operator surface (POs Zoho says are issued but not
 * yet received locally; attach-tracking worklist). A Workbench surface (list →
 * select → edit), not a scan bench. Bare `/incoming` derives the `incoming` mode
 * path-first. Legacy `/receiving?mode=incoming` redirects here.
 *
 * Paint order: this page returns immediately. {@link IncomingBrowseShell} puts a
 * flush ledger stand-in in the first HTML (Speed Index), and the client fetches
 * the list.
 *
 * ## There is no server seed here, deliberately (2026-08-30)
 *
 * There was one — `seedIncomingLines`, a `prefetchQuery` of the `full` phase
 * behind a 400ms `AbortSignal.timeout` so a slow list could not hold the
 * streamed segment. It never once landed. Measured against a production build:
 * `/api/receiving-lines?view=incoming&limit=50` answers in **2.9–4.8s**, so the
 * 400ms bound aborted every request, every time. The observable result was an
 * empty `dehydrate()` in the payload, a cancelled DB query per page load, a
 * `console.error` nobody read — and 400ms of delay before this surface streamed,
 * bought with nothing.
 *
 * It also fails the RSC-seed gate on its own terms (see
 * `.claude/skills/request-shape/SKILL.md`): `limit=1` costs 2.45s against
 * `limit=50`'s 2.9s, so the answer set *is* the candidate set and pre-limiting
 * buys nothing. Same verdict, same reason, as the `/triage` seed deleted on
 * 2026-08-27.
 *
 * If Incoming's first paint is worth server-side work later, the prerequisite is
 * a cheap ranking column on that query — not a shorter timeout.
 */
export default async function IncomingPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string }>;
}) {
  // PO Mailbox (admin dissolution): the emailed-PO / unmatched-carton triage
  // queue moved here from `/admin?section=po_mailbox`. It owns its whole body
  // (sub-tabs + toolbar + table), so it replaces the browse shell rather than
  // nesting inside it.
  if ((await searchParams).view === 'mailbox') {
    return (
      <>
        <SurfaceParamHygiene />
        <DeskPageLayout className="h-full">
          <PoMailboxAdminSection />
        </DeskPageLayout>
      </>
    );
  }

  return (
    <>
      <SurfaceParamHygiene />
      {/*
        The one page frame (2026-08-31) — `@/design-system/components/DeskPageChrome`
        via {@link DeskPageLayout}. Since 2026-09-14 Inbound declares its two
        LANES as nav children (`deskChrome`), so the frame draws them as the tab
        row: **Inbound** (bare path, cartons on the way) and **History**
        (`?lane=docked`, the landed-activity trail). Both lanes predate the row;
        Docked simply had no way in after the old `Pipeline | Docked` parent pair
        was deleted. Tabs come from `SIDEBAR_PAGE_NAV`, never from this file.

        It was already rail-less; that is declared on its nav entry
        (`railless: true`) instead of special-cased inside `isRaillessSurface`,
        and stays independent of `deskChrome` — the two are separate facts.
      */}
      <DeskPageLayout className="h-full">
        <IncomingBrowseShell>
          <SurfaceGate surfaceKey="incoming">
            <ReceivingSurfacePage />
          </SurfaceGate>
        </IncomingBrowseShell>
      </DeskPageLayout>
    </>
  );
}
