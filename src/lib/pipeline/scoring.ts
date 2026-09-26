/** Scoring Module */

import { SCORE_WEIGHTS, RATING_MAP } from './config';
import type { ValidationResult, ScoringResult } from './types';

/**
 * Compute a weighted 0.0-1.0 score from individual validation checks.
 */
function computeAutoScore(v: ValidationResult): number {
  let score = 0;
  if (v.typecheckPass) score += SCORE_WEIGHTS.typecheck;
  if (v.lintPass) score += SCORE_WEIGHTS.lint;
  if (v.testsPass) score += SCORE_WEIGHTS.tests;
  if (v.buildPass) score += SCORE_WEIGHTS.build;
  return Math.round(score * 100) / 100;
}

/**
 * Map validation outcome to a 1-5 integer rating.
 */
function computeRating(v: ValidationResult): number {
  if (v.allPassed && v.buildPass) return 5;
  if (v.allPassed) return RATING_MAP.allPass;
  if (v.typecheckPass && v.testsPass) return RATING_MAP.testsAndTypecheck;
  if (v.typecheckPass) return RATING_MAP.typecheckOnly;
  return RATING_MAP.allFail;
}

/**
 * Build a human-readable rationale string.
 */
function buildRationale(v: ValidationResult, rating: number): string {
  const parts: string[] = [];
  parts.push(v.typecheckPass ? 'typecheck: pass' : 'typecheck: FAIL');
  parts.push(v.lintPass ? 'lint: pass' : 'lint: FAIL');
  parts.push(v.testsPass ? 'tests: pass' : 'tests: FAIL');
  if (v.buildPass) parts.push('build: pass');
  return `Rating ${rating}/5 — ${parts.join(', ')}`;
}

/**
 * Score an implementation based on its validation results.
 */
export function scoreImplementation(validation: ValidationResult): ScoringResult {
  const rating = computeRating(validation);
  const autoScore = computeAutoScore(validation);
  const rationale = buildRationale(validation, rating);
  return { rating, autoScore, rationale };
}
