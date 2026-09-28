'use client';

/**
 * The triage shelf's trail band — the counter's trail (search glyph + field ·
 * back chevron · `All products › category` crumbs · category menu), ported onto
 * the task-mode utilities, with an `end` slot at the far right for the shelf
 * switch. The host owns the find (`find`: glyph chip + field); while
 * `searching`, the browse path steps aside so the field takes the row.
 */

import { Fragment, type ReactNode } from 'react';
import { ChevronLeft, ChevronRight } from '@/components/Icons';
import { SearchableSelectField } from '@/design-system/components/SearchableSelectField';
import { focusRing } from '@/design-system/tokens/focus-ring';
import { cn } from '@/utils/_cn';
import { TRIAGE_SHELF_TRAIL, TRIAGE_SHELF_TRAIL_ICON } from './triage-shelf-tokens';

const CRUMB = cn(
  'ds-raw-button shrink-0 rounded-mode-control px-1.5 py-1 text-role-caption font-medium text-mode-muted transition-colors hover:text-mode-ink',
  focusRing('control'),
);

export interface TriageShelfTrailProps {
  /** The host's find: glyph chip + field. */
  find: ReactNode;
  /** A search is on the grid — hide the browse path. */
  searching: boolean;
  /** The root crumb's name ("Favorites" / "All products"). */
  rootLabel: string;
  /** Root → current category; empty at the root. */
  crumbs: ReadonlyArray<{ id: string; name: string }>;
  onRoot: () => void;
  onCrumb: (id: string) => void;
  onBack: () => void;
  /** The category menu: scopes first, then this level's sub-categories. */
  menu: { value: string; options: ReadonlyArray<{ value: string; label: string }>; onChange: (value: string) => void };
  /** Far right — the shelf switch. */
  end?: ReactNode;
  testId: string;
}

export function TriageShelfTrail({ find, searching, rootLabel, crumbs, onRoot, onCrumb, onBack, menu, end, testId }: TriageShelfTrailProps) {
  return (
    <div className={TRIAGE_SHELF_TRAIL} data-testid={testId}>
      {find}
      {searching ? null : (
        <nav className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto" aria-label="Browse path">
          {crumbs.length > 0 ? (
            <>
              {/* ds-raw-button: trail glyph chip — the counter's back chevron, in the mode's control corner */}
              <button type="button" aria-label="Go back" onClick={onBack} className={cn(TRIAGE_SHELF_TRAIL_ICON, focusRing('control'))} data-testid={`${testId}-back`}>
                <ChevronLeft className="size-4" aria-hidden />
              </button>
              {/* ds-raw-button: breadcrumb text link — a Button would add fill and height to the trail */}
              <button type="button" onClick={onRoot} className={CRUMB}>
                {rootLabel}
              </button>
              {crumbs.slice(0, -1).map((crumb) => (
                <Fragment key={crumb.id}>
                  <ChevronRight className="size-3 shrink-0 text-mode-muted" aria-hidden />
                  {/* ds-raw-button: breadcrumb text link */}
                  <button type="button" onClick={() => onCrumb(crumb.id)} className={CRUMB}>
                    {crumb.name}
                  </button>
                </Fragment>
              ))}
              <ChevronRight className="size-3 shrink-0 text-mode-muted" aria-hidden />
            </>
          ) : null}
          <SearchableSelectField
            value={menu.value}
            onChange={(value) => value != null && menu.onChange(String(value))}
            options={menu.options}
            ariaLabel="Category"
            searchPlaceholder="Search categories"
            testId={`${testId}-category`}
            className="h-9 w-auto min-w-40 max-w-64 shrink-0 rounded-mode-control px-3 text-role-caption font-medium"
          />
        </nav>
      )}
      {end ? <div className="ml-auto flex shrink-0 items-center gap-2">{end}</div> : null}
    </div>
  );
}
