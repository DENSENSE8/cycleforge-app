/** putaway-placement — the declarative policy that expresses receiving's default putaway routing as a decision table… */

import type { DecisionRule } from '@/lib/workflow/decision-eval';

/** The filing category the receiving default-putaway rule files units under. */
export const RECEIVING_PUTAWAY_CATEGORY = 'default-putaway';

/** The system-default receiving placement policy: */
export function receivingDefaultPutawayPolicy(defaultBinSymbol: string): DecisionRule[] {
  const symbol = defaultBinSymbol.trim();
  if (!symbol) return [];
  return [
    {
      id: 'receiving-default-putaway',
      when: { disposition: 'ACCEPT' },
      thenPort: 'putaway',
      then: { placement: symbol, category: RECEIVING_PUTAWAY_CATEGORY },
    },
  ];
}
