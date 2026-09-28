/** The wire shapes of `/api/capabilities` and `/api/capabilities/history` (SIMPLE-FIRST). */

import type { CapabilitySource, CapabilityState } from './catalog';

export interface CapabilityDto {
  id: string;
  label: string;
  blurb: string;
  state: CapabilityState;
  source: CapabilitySource | null;
  enabledBy: string | null;
  enabledAt: string | null;
  landingPath: string;
  prerequisites: Array<{ provider: 'ebay' | 'amazon'; label: string; met: boolean }>;
}

export interface CapabilitiesResponse {
  capabilities: CapabilityDto[];
}

export interface CapabilityEventDto {
  id: number;
  capabilityId: string;
  capabilityLabel: string;
  event: string;
  fromState: CapabilityState | null;
  toState: CapabilityState | null;
  staffName: string | null;
  source: CapabilitySource;
  agentMutationId: number | null;
  detail: Record<string, unknown>;
  createdAt: string;
}

export interface CapabilityHistoryResponse {
  events: CapabilityEventDto[];
  nextBefore: number | null;
}
