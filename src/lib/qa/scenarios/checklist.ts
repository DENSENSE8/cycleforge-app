import type { ScenarioRunResult } from './run-types';

export function evaluateReleaseReadiness(results: ScenarioRunResult[]): {
  readyForRelease: boolean;
  missingRequired: string[];
} {
  const missingRequired = results
    .filter((r) => r.releaseRequired && (r.status === 'failed' || r.status === 'blocked'))
    .map((r) => r.scenarioId);
  return { readyForRelease: missingRequired.length === 0 && results.length > 0, missingRequired };
}
