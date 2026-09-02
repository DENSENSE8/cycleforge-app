/**
 * Server-side QA Console capability resolver.
 *
 * Two independent gates, both required:
 *   1. Organization environment === 'sandbox'
 *   2. A developer.qa_tools.* permission (admin short-circuit grants the
 *      strings, but a customer org still fails gate 1)
 *
 * A client-side hide is never enough. Routes call assertQaCapability().
 */

type OrgEnvironment = 'sandbox' | 'customer';

export const QA_TOOL_PERMISSIONS = [
  'developer.qa_tools.view',
  'developer.qa_tools.execute',
  'developer.qa_tools.destructive',
  'developer.qa_tools.connection_debug',
  'developer.qa_tools.webhook_replay',
  'developer.qa_tools.fixture_reset',
] as const;

export type QaToolPermission = (typeof QA_TOOL_PERMISSIONS)[number];

export interface QaPermissionFlags {
  view: boolean;
  execute: boolean;
  destructive: boolean;
  connectionDebug: boolean;
  webhookReplay: boolean;
  fixtureReset: boolean;
}

export interface QaCapability {
  allowed: boolean;
  reason: 'ok' | 'not_sandbox' | 'missing_permission' | 'org_not_found';
  environment: OrgEnvironment;
  permissions: QaPermissionFlags;
}

export function flagsFromPermissionSet(permissions: ReadonlySet<string>): QaPermissionFlags {
  const has = (id: QaToolPermission) => permissions.has(id);
  const view = has('developer.qa_tools.view');
  const execute = has('developer.qa_tools.execute');
  const destructive = has('developer.qa_tools.destructive');
  return {
    view,
    execute: execute || destructive,
    destructive,
    connectionDebug: has('developer.qa_tools.connection_debug') || execute || destructive,
    webhookReplay: has('developer.qa_tools.webhook_replay') || execute || destructive,
    fixtureReset: has('developer.qa_tools.fixture_reset') || destructive,
  };
}

function permissionSatisfied(flags: QaPermissionFlags, required: QaToolPermission): boolean {
  switch (required) {
    case 'developer.qa_tools.view':
      return flags.view || flags.execute || flags.destructive || flags.connectionDebug
        || flags.webhookReplay || flags.fixtureReset;
    case 'developer.qa_tools.execute':
      return flags.execute || flags.destructive;
    case 'developer.qa_tools.destructive':
      return flags.destructive;
    case 'developer.qa_tools.connection_debug':
      return flags.connectionDebug;
    case 'developer.qa_tools.webhook_replay':
      return flags.webhookReplay;
    case 'developer.qa_tools.fixture_reset':
      return flags.fixtureReset;
    default:
      return false;
  }
}

export function resolveQaCapability(args: {
  environment: OrgEnvironment;
  permissions: ReadonlySet<string>;
  required?: QaToolPermission;
  orgFound?: boolean;
}): QaCapability {
  const flags = flagsFromPermissionSet(args.permissions);
  if (args.orgFound === false) {
    return { allowed: false, reason: 'org_not_found', environment: 'customer', permissions: flags };
  }
  if (args.environment !== 'sandbox') {
    return { allowed: false, reason: 'not_sandbox', environment: args.environment, permissions: flags };
  }
  const required = args.required ?? 'developer.qa_tools.view';
  if (!permissionSatisfied(flags, required)) {
    return { allowed: false, reason: 'missing_permission', environment: args.environment, permissions: flags };
  }
  return { allowed: true, reason: 'ok', environment: args.environment, permissions: flags };
}


