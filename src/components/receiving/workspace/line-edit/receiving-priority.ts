/**
 * Receiving priority badge — display tones for the platform-derived rank.
 *
 * The rank itself is single-sourced in src/lib/receiving/display/precedence.ts
 * (the rules-as-data SoT the server SQL `RECEIVING_PRIORITY_RANK_SQL` also
 * derives from, via priorityRankSql). Re-exported here as `receivingPriorityRank`
 * so existing badge importers keep their import path while the logic lives in one
 * place. Lower rank = higher priority.
 */
export { platformPriorityRank as receivingPriorityRank } from '@/lib/receiving/display/precedence';

interface PriorityTone {
  /** Full label (Classify / tooltips). */
  label: string;
  /** Dense carton-bookmark label (≤4 chars preferred). */
  short: string;
  /** Longer text for the title tooltip. */
  title: string;
  /** Quiet flat tint — color-coded heat, same face language as Claim/Photos (`shadow-none`). */
  className: string;
}

/**
 * Tone + label per rank. P1 is the most urgent (amber, like the unfound pill);
 * tagged platforms step down in heat; "other" is a quiet gray.
 *
 * Labels MUST stay within the manual-tier vocabulary in
 * lib/receiving/priority-override.ts (Priority/High/Medium/Low) — the urgency
 * pill shows this derived label collapsed and the manual tiers as options, so
 * a word that isn't a selectable tier reads as a broken picker.
 */
export function receivingPriorityTone(rank: number): PriorityTone {
  switch (rank) {
    case 0:
      return {
        label: 'Priority',
        short: 'Pri',
        title: 'Flagged priority — pending-order match or manual; test/unbox first',
        className: 'border-red-200 bg-red-50 text-red-700 shadow-none',
      };
    case 1:
      return {
        label: 'High',
        short: 'High',
        title: 'Highest priority — unfound/untagged carton, triage first',
        className: 'border-amber-200 bg-amber-50 text-amber-700 shadow-none',
      };
    case 2:
      return {
        label: 'High',
        short: 'High',
        title: 'High priority — Amazon',
        className: 'border-rose-200 bg-rose-50 text-rose-700 shadow-none',
      };
    case 3:
      return {
        label: 'Medium',
        short: 'Med',
        title: 'Medium priority — eBay',
        className: 'border-yellow-200 bg-yellow-50 text-yellow-800 shadow-none',
      };
    case 4:
      return {
        label: 'Low',
        short: 'Low',
        title: 'Low priority — Goodwill',
        className: 'border-emerald-200 bg-emerald-50 text-emerald-700 shadow-none',
      };
    default:
      return {
        label: 'Other',
        short: 'Oth',
        title: 'Lowest priority — other platform',
        // ds-allow-raw-neutral: identity tone — neutral member of the quiet tint family
        className: 'border-slate-200 bg-slate-50 text-slate-600 shadow-none',
      };
  }
}
