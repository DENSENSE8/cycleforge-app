/**
 * Shared types for the AI-first Automations marketplace surface (Phase 1).
 *
 * Mirrors the GET /api/automations response shape: the org's installed
 * workflow definitions, each rolled up with a live in-flight count, node
 * (step) count, and last-run timestamp for the "Your automations" section.
 */

export interface AutomationDefinitionSummary {
  id: number;
  name: string;
  version: number;
  isActive: boolean;
  nodeCount: number;
  inFlight: number;
  /** ISO timestamp of the most recent run, or null when never run. */
  lastRunAt: string | null;
  /** ISO timestamp of the definition's last update. */
  updatedAt: string;
}

export interface AutomationsResponse {
  ok: boolean;
  installed: AutomationDefinitionSummary[];
  error?: string;
}
