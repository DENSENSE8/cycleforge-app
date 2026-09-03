import type { ScenarioSuite } from './runners';

export type ScenarioOutcomeStatus = 'passed' | 'failed' | 'skipped' | 'blocked';

export interface ScenarioRunResult {
  scenarioId: string;
  title: string;
  status: ScenarioOutcomeStatus;
  durationMs: number;
  detail: string;
  errorClass: string | null;
  runId: string | null;
  suite: ScenarioSuite;
  releaseRequired: boolean;
  playwrightCommand: string | null;
}

export interface ScenarioSuiteReport {
  suite: ScenarioSuite | 'all';
  startedAt: string;
  completedAt: string;
  passed: number;
  failed: number;
  skipped: number;
  blocked: number;
  results: ScenarioRunResult[];
  readyForRelease: boolean;
  missingRequired: string[];
}
