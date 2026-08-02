/**
 * Draft query currently typed in {@link GlobalHeaderSearch}, so the far-right
 * assistant control can seed the composer without nesting Sparkles beside Search.
 *
 * Module waist (not React context): search owns the field; the assistant button
 * only reads on click. Cleared when the header search unmounts.
 */

let draftQuery = '';

export function setGlobalHeaderSearchDraft(query: string): void {
  draftQuery = query;
}

export function getGlobalHeaderSearchDraft(): string {
  return draftQuery;
}

export function clearGlobalHeaderSearchDraft(): void {
  draftQuery = '';
}
