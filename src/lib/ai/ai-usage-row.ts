/**
 * One row of the AI usage roll-up, as the settings table reads it.
 *
 * `key` is synthesised by the page from the grouping tuple — the roll-up has no
 * primary key of its own, and the engine requires a stable row id.
 */
export interface AiUsageTableRow {
  key: string;
  capability: string;
  provider: string;
  model: string;
  context: string;
  calls: number;
  inputTokens: number;
  outputTokens: number;
  costMicrocents: number;
  unknownRateCalls: number;
}
