import type { WelcomeVariant } from './welcome-variant';

export interface WelcomeStage {
  phase: 'idle' | 'greeting' | 'released';
  variant: WelcomeVariant | null;
  nonce: number;
  skipped: boolean;
}

let stage: WelcomeStage = { phase: 'idle', variant: null, nonce: 0, skipped: false };
const listeners = new Set<() => void>();

export function getWelcomeStage(): WelcomeStage {
  return stage;
}

export function subscribeWelcomeStage(callback: () => void): () => void {
  listeners.add(callback);
  return () => listeners.delete(callback);
}

function notify(): void {
  for (const listener of listeners) listener();
}

export function holdWelcome(variant: WelcomeVariant): void {
  stage = { phase: 'greeting', variant, nonce: stage.nonce + 1, skipped: false };
  notify();
}

export function releaseWelcome(options: { skipped?: boolean } = {}): void {
  stage = { ...stage, phase: 'released', skipped: options.skipped === true };
  notify();
}
