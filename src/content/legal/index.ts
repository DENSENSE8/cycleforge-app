/** Legal & Policies content — the CycleForge legal baseline (Terms of Service, Privacy Policy, Data Processing Agreement) rendered… */

import terms from './terms.json';
import privacy from './privacy.json';
import dpa from './dpa.json';

export interface LegalDoc {
  slug: 'terms' | 'privacy' | 'dpa';
  /** Short nav label, e.g. "Terms of Service". */
  label: string;
  /** Full document title (the markdown H1). */
  title: string;
  /** Sort order in the switcher. */
  order: number;
  /** The document body as GitHub-flavored markdown. */
  md: string;
}

export const LEGAL_DOCS: LegalDoc[] = [terms, privacy, dpa]
  .map((d) => d as LegalDoc)
  .sort((a, b) => a.order - b.order);

/** Intro blurb shown above the document switcher (matches the marketing /legal index). */
export const LEGAL_INDEX_BLURB =
  'These are CycleForge’s current legal documents — Terms of Service, Privacy Policy, and ' +
  'Data Processing Agreement (DPA) — which together govern your use of the platform. They are ' +
  'working drafts maintained alongside our actual architecture and data practices, and have not ' +
  'yet been finalized with counsel. The authoritative, published versions live at cycleforge.com/legal.';

function getLegalDoc(slug: string | null | undefined): LegalDoc {
  return LEGAL_DOCS.find((d) => d.slug === slug) ?? LEGAL_DOCS[0];
}
