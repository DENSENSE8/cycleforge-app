import type { PermissionString } from '@/lib/auth/permissions-shared';

export const QA_TOOL_PERMISSIONS = {
  view: 'developer.qa_tools.view',
  execute: 'developer.qa_tools.execute',
  fixtureReset: 'developer.qa_tools.fixture_reset',
  destructive: 'developer.qa_tools.destructive',
} as const satisfies Record<string, PermissionString>;

export type QaToolPermission = (typeof QA_TOOL_PERMISSIONS)[keyof typeof QA_TOOL_PERMISSIONS];
export type QaOrganizationEnvironment = 'customer' | 'sandbox';

export type QaToolsAccess =
  | {
      visible: true;
      canExecute: boolean;
      canResetFixtures: boolean;
      canDestructive: boolean;
      reason: 'authorized';
    }
  | {
      visible: false;
      canExecute: false;
      canResetFixtures: false;
      canDestructive: false;
      reason: 'organization_not_sandbox' | 'missing_view_permission';
    };

export function resolveQaToolsAccess(input: {
  organizationEnvironment: QaOrganizationEnvironment;
  permissions: ReadonlySet<string>;
}): QaToolsAccess {
  if (input.organizationEnvironment !== 'sandbox') {
    return {
      visible: false,
      canExecute: false,
      canResetFixtures: false,
      canDestructive: false,
      reason: 'organization_not_sandbox',
    };
  }

  if (!input.permissions.has(QA_TOOL_PERMISSIONS.view)) {
    return {
      visible: false,
      canExecute: false,
      canResetFixtures: false,
      canDestructive: false,
      reason: 'missing_view_permission',
    };
  }

  return {
    visible: true,
    canExecute: input.permissions.has(QA_TOOL_PERMISSIONS.execute),
    canResetFixtures: input.permissions.has(QA_TOOL_PERMISSIONS.fixtureReset)
      && input.permissions.has(QA_TOOL_PERMISSIONS.destructive),
    canDestructive: input.permissions.has(QA_TOOL_PERMISSIONS.destructive),
    reason: 'authorized',
  };
}
