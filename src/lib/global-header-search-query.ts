/** Draft query currently typed in {@link GlobalHeaderSearch}, so the far-right assistant control can seed the composer without nesting… */

let draftQuery = '';

export function setGlobalHeaderSearchDraft(query: string): void {
  draftQuery = query;
}

function getGlobalHeaderSearchDraft(): string {
  return draftQuery;
}

export function clearGlobalHeaderSearchDraft(): void {
  draftQuery = '';
}
