/**
 * `G` then a letter → a lane's MODE (the parent level). Keyed by letter so
 * two pages can never claim the same one. A page's views keep bare `1`–`9`
 * (child level); modes get the "go somewhere" sequence (Linear, GitHub,
 * Gmail). A letter only works where the resolver emitted that page as a
 * mode the staffer can reach (the `<page>.<lane>.modes` section), so the
 * sequence never offers a page the permissions filter removed.
 */
export const NAV_GO_PAGES: Readonly<Record<string, string>> = {
  s: 'outbound',
  f: 'fba',
  l: 'label-intake',
};

const LETTER_BY_PAGE: ReadonlyMap<string, string> = new Map(
  Object.entries(NAV_GO_PAGES).map(([letter, pageId]) => [pageId, letter]),
);

/** The page's go letter, if it has one. */
export function navGoLetter(pageId: string): string | undefined {
  return LETTER_BY_PAGE.get(pageId);
}
