/**
 * Workbench branch `service-workspace` — the one home for the Support agent
 * workspace shell. Law:.
 *
 * Only the shell is public. The layout tokens are the shell's own geometry, so
 * they are imported directly by it and deliberately NOT re-exported: a token a
 * second surface can reach for is a token that drifts, and the branch has one
 * shell by design.
 */

export { ServiceWorkspaceShell } from './ServiceWorkspaceShell';
export { useSupportTicketDisplays } from './support-ticket-displays';
