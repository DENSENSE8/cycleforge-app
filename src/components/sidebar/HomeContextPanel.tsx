'use client';

/**
 * Home → Today's context rail — the operator's own saved views over the Today
 * spreadsheet, and deliberately nothing else.
 *
 * **Why it holds only saved views.** Today's other candidates for a resident
 * column have homes already, and each of them is a rule rather than a taste:
 *
 *  - The **lanes** (All · Do next · Assigned · Needs attention) are a
 *    four-way facet over the table on screen, so they belong in that table's
 *    chrome — they WERE a 280px column and that column is what the F0 rebuild
 *    deleted (`MyDayWorkspace` docblock). Do not bring them back here.
 *  - The **queue links** are doors to other pages; they ride the chrome `right`
 *    slot so they cannot out-rank the lanes that scope the surface.
 *  - **Search** refines the on-screen list, so it is chrome too, collapsed at
 *    rest (`ui-design-system.md` → Scoped search chrome).
 *
 * What is left is the one thing a *system* cannot own: named combinations the
 * operator defines. That is exactly the tabs-vs-saved-views boundary in
 * `display/workbench.md`, and it is why a one-section rail is the honest answer
 * here rather than a thin one.
 *
 * Composes {@link SidebarShell} — it owns the column, the pinned header and the
 * single scroll body. The shell renders **no** search band by design
 * (`sidebar-search-bar.guard.test.ts`).
 */

import { SIDEBAR_GUTTER } from '@/components/layout/header-shell';
import { SidebarShell } from '@/components/layout/SidebarShell';
import { sectionLabel } from '@/design-system/tokens/typography/presets';
import { SavedViewsList } from '@/components/saved-views/SavedViewsList';
import {
  MY_DAY_SAVED_VIEWS_KEY,
  MY_DAY_VIEW_PARAMS,
} from '@/lib/my-day/my-day-saved-views';

export function HomeContextPanel() {
  return (
    <SidebarShell
      headerAbove={
        <div className={`${SIDEBAR_GUTTER} border-b border-border-hairline py-3`}>
          <p className={`px-1 ${sectionLabel} text-blue-600`}>Today</p>
          <p className="mt-1 px-1 text-role-caption font-semibold leading-snug text-text-soft">
            Your lanes, filters and sort — saved.
          </p>
        </div>
      }
    >
      <SavedViewsList
        storageKey={MY_DAY_SAVED_VIEWS_KEY}
        paramKeys={MY_DAY_VIEW_PARAMS}
        // Teach what a view IS here: on a personal daily surface the useful
        // combinations are cross-lane ("overdue support work, oldest first"),
        // not a lane — the lane strip already answers that.
        emptyHint="No saved views yet. Narrow the list — a lane, a search, a column sort — then save it here."
      />
    </SidebarShell>
  );
}
