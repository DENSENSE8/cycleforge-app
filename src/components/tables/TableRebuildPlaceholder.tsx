/**
 * The resting state of a route whose collection table has been removed pending
 * a rewrite of its display.
 *
 * **Why the route survives the table.** Deleting a grid and its page together
 * would take the route's auth gate, its permission-registry entry, its nav
 * position and its E2E coverage with it — all of which have to be rebuilt
 * verbatim afterwards, and any of which is easy to rebuild slightly wrong. The
 * route staying mounted keeps that scaffolding honest and reduces the rewrite
 * to the one thing actually being rewritten: the display.
 *
 * Not an error and not an empty-data state — both of those are claims about the
 * DATA. This is a claim about the SURFACE, so it says so plainly rather than
 * letting an operator read "no rows" and go looking for missing records.
 */
export function TableRebuildPlaceholder({ surface }: { surface: string }) {
  return (
    <div className="flex min-h-0 flex-1 items-center justify-center px-4 py-10">
      <div className="max-w-sm text-center">
        <p className="text-role-caption font-semibold text-text-default">
          {surface} is being rebuilt
        </p>
        <p className="mt-1 text-role-micro text-text-soft">
          This table was removed while its display is rewritten. The route, its
          permissions and its data are untouched.
        </p>
      </div>
    </div>
  );
}
