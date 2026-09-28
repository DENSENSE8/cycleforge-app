# Dogfood Auth-Only Mode — First-Principles Improvement-First Plan

**Status:** Phases 1–5 and phase-6 instrumentation implemented; live observation, rehearsal, and cutback remain pending  
**Scope:** Dogfood organizations only  
**Primary goal:** Preserve reliable authentication and tenant isolation while removing role and permission friction from rapid product iteration.  
**Default production posture:** Strict authorization remains the default and the eventual target.

## Implementation record — 2026-09-28

Implemented:

- Typed, fail-closed `strict` / `authenticated-only` configuration with an explicit organization UUID allowlist.
- Separate stored and effective permission sets. Auth-only mode grants every declared internal permission without mutating role assignments.
- Central server policy in current-user construction, `withAuth`, dynamic route guards, legacy permission checks, kiosk/realtime role resolution, and AI tool authorization.
- Client session policy consumed by navigation and controls.
- Account-menu status and role-editor warning expose the policy only where access configuration is relevant; no global shell header or banner is rendered.
- Automatic permission-derived step-up bypass only in auth-only mode. Explicit security step-up, authentication, tenant isolation, validation, feature/capability gates, and external-action safeguards remain enforced.
- Local dogfood organizations 1 and 2 are allowlisted in the worktree environment.
- Central route guards emit non-blocking `authorization.prospective_denial` audit records when auth-only access succeeds but stored permissions would deny the request.
- `/settings/roles` includes a tenant-scoped 30-day strict-mode readiness report grouped by permission, staff member, method, and route.

Verified:

- Authorization policy and rehearsal tests: 14/14 pass, covering fail-closed configuration, both dogfood allowlist entries, stored/effective permissions, step-up classification, prospective-denial recording, tenant attribution, and report mapping.
- Authenticated runtime envelope for the dogfood organization reports `authenticated-only`, 130 stored permissions, 130 effective permissions, and all declared permissions effective.
- `http://localhost:3050`: desktop `/` and mobile `/m/home` contain no dogfood auth status region; each app root fills its viewport dimension.
- `http://localhost:3050/settings/roles`: the readiness panel renders in context; its authenticated API returns the tenant-scoped 30-day report.

Remaining verification and rollout work:

- A live missing-permission signal still requires normal use by a non-admin dogfood staff member. The recorder is proven with an injected staff/tenant context; no session or production audit row was fabricated.
- `pnpm verify:fast` reached all 11 gates. The rehearsal changes produced no reported lint or type errors. The current worktree remains red on the existing `pin.ts` generic constraint and one mobile-to-receiving boundary violation outside the authorization paths.
- Phase 6 now collects and reports prospective denials. Role repair and scheduled strict-mode rehearsal windows remain operational work; phase 7 cutback remains pending.

## 1. Problem

CycleForge is still in dogfood. Product surfaces, workflows, navigation, and data models are changing faster than the role and permission model can be stabilized. During this phase, permission checks can block an authenticated operator from reaching unfinished or newly added functionality, making a product defect look like an authorization defect.

Removing authentication would be unsafe. Deleting the permission system would destroy useful work and make later enforcement harder. Assigning every user a fake `admin` role would corrupt role semantics, hide permission defects, and couple dogfood behavior to stored authorization data.

The required temporary operating model is narrower:

> A valid, active session and membership in an explicitly allowlisted dogfood organization grant access to all internal application surfaces. Stored roles and permissions remain intact but are not enforced for those organizations.

This mode separates two concerns:

- **Authentication:** Who is making this request, are they active, and which organization are they acting in?
- **Authorization:** Which authenticated actions does their role permit?

Dogfood iteration keeps the first boundary strict and temporarily bypasses the second boundary in one explicit, observable place.

## 2. First principles

### 2.1 Identity must remain trustworthy

Every request must still resolve a real session, staff identity, account state, and organization membership. Anonymous access is not introduced.

### 2.2 Tenant boundaries are not permissions

Organization isolation must remain enforced independently of role permissions. Auth-only mode must never permit a staff member to select, read, mutate, or infer another organization's data.

### 2.3 Temporary policy must be explicit

Broad access must not emerge from hidden `isDogfood`, `isAdmin`, development-host, email-address, or staff-ID special cases. The selected authorization mode must be represented by a named value and visible in request context, logs, and the interface.

### 2.4 One policy decision, not hundreds of bypasses

The mode must be resolved centrally. Individual route handlers, components, tools, and navigation entries must not invent their own dogfood exceptions.

### 2.5 Stored authorization data remains truthful

Roles and permissions continue to represent their configured values. Auth-only behavior is a runtime policy overlay, not a rewrite of stored role assignments.

### 2.6 Irreversible external effects remain guarded

Permission bypass is not permission to spend money or contact real customers. Existing confirmation, sandbox, idempotency, audit, and external-provider safeguards remain active.

### 2.7 Strict mode must remain the default

Missing configuration, malformed configuration, unknown organizations, and new deployments must resolve to strict authorization. Broad access requires an explicit allowlist entry.

### 2.8 The temporary mode must be removable

Returning an organization to strict mode must require a configuration change and verification, not a schema migration or role-data repair.

## 3. Operating model

```text
Request
  |
  +-- No valid session ------------------------------> 401 Sign in required
  |
  +-- Revoked/expired session -----------------------> 401 Sign in required
  |
  +-- Disabled account/staff ------------------------> 403 Account unavailable
  |
  +-- No active membership in requested tenant -----> 403/404 tenant-safe refusal
  |
  +-- Tenant boundary violation ---------------------> tenant-safe refusal
  |
  +-- Authenticated member
        |
        +-- strict mode ------------------------------> enforce roles and permissions
        |
        +-- authenticated-only mode -----------------> allow internal action
                                                        while retaining business,
                                                        audit, confirmation, and
                                                        external-system safeguards
```

### Auth-only mode allows

- Opening every internal desktop and mobile surface.
- Calling routes that normally require a registered permission.
- Running internal read and write workflows.
- Using internal AI tools subject to their confirmation and safety contracts.
- Iterating on navigation and incomplete product flows without role configuration first.

### Auth-only mode does not allow

- Anonymous access.
- Cross-organization access.
- Use by a revoked, expired, inactive, or deleted identity.
- Bypassing request validation or domain invariants.
- Bypassing confirm-before-write behavior.
- Real payment, label purchase, email, marketplace, or customer-contact operations when the environment requires test mode.
- Bypassing webhook signatures, OAuth state, or external-provider authentication.
- Suppressing audit attribution.

## 4. Configuration contract

Use one authorization-mode setting and one explicit organization allowlist:

```env
AUTHORIZATION_MODE=authenticated-only
AUTHORIZATION_MODE_ORGS=<dogfood-org-uuid>[,<additional-dogfood-org-uuid>]
```

Supported modes:

```ts
type AuthorizationMode = 'strict' | 'authenticated-only';
```

### Resolution rules

1. `AUTHORIZATION_MODE` unset resolves to `strict`.
2. `AUTHORIZATION_MODE=strict` ignores the allowlist and enforces stored authorization.
3. `AUTHORIZATION_MODE=authenticated-only` applies only when the authenticated organization ID appears in `AUTHORIZATION_MODE_ORGS`.
4. An organization outside the allowlist remains strict.
5. An unknown mode is a startup/configuration error, not a permissive fallback.
6. Auth-only mode with an empty or malformed allowlist is a startup/configuration error.
7. Organization identifiers must be validated UUIDs.
8. Configuration must never select organizations by display name, slug, email domain, or staff ID.
9. The resolved mode must be attached to logs and request context without exposing the full allowlist.

### Why an allowlist is required

A global bypass is easy to copy into customer environments and difficult to detect. An organization allowlist limits the blast radius and permits strict and dogfood organizations to coexist in the same deployment.

## 5. Server design

### 5.1 Single resolver

Add one server-only resolver responsible for parsing configuration and selecting the mode for an authenticated organization:

```ts
resolveAuthorizationMode(organizationId): AuthorizationMode
```

Required properties:

- Configuration parsed once per process.
- Invalid configuration fails loudly.
- No database call on the request path.
- No dependency on role state.
- Deterministic result for one deployment and organization.
- Unit-testable through an injectable environment record.

### 5.2 Authentication remains unchanged

The current-user/session path must continue to establish:

- Session validity.
- Credential type.
- Staff identity.
- Staff/account active state.
- Organization ID from the session.
- Membership and tenant relationship.
- Revocation and expiration.

Auth-only mode is resolved only after authentication succeeds. It must not affect session loading or tenant selection.

### 5.3 Authorization context is explicit

Extend the authenticated request context conceptually with:

```ts
interface AuthContext {
  authorizationMode: 'strict' | 'authenticated-only';
  storedPermissions: ReadonlySet<PermissionString>;
  effectivePermissions: ReadonlySet<PermissionString>;
  can(permission: PermissionString): boolean;
}
```

Semantics:

- `storedPermissions` is the role-derived source of truth.
- `effectivePermissions` is what this request may use under the selected runtime policy.
- `can(permission)` is the preferred decision API.
- In strict mode, effective and stored permissions are identical.
- In authenticated-only mode, `can(...)` returns true for registered internal permissions.

Keeping stored and effective values separate prevents telemetry, account screens, or diagnostics from falsely claiming that the user was assigned permissions they do not actually hold.

### 5.4 Central route enforcement

The route authorization decision belongs in `src/lib/auth/withAuth.ts`.

Conceptually:

```ts
const authorizationMode = resolveAuthorizationMode(user.organizationId);

if (
  authorizationMode === 'strict' &&
  opts.permission &&
  !user.permissions.has(opts.permission)
) {
  return forbidden();
}
```

The wrapper must pass the selected mode and effective authorization API to the handler. Individual routes must not read `AUTHORIZATION_MODE` directly.

### 5.5 Step-up behavior

Permission-derived step-up requirements may be bypassed in authenticated-only mode because they would otherwise recreate permission friction under a different label.

Step-up or explicit confirmation remains required when it protects an independent invariant, such as:

- Viewing or rotating secrets.
- Changing authentication credentials.
- Changing the organization or account identity.
- Disabling security controls.
- A separately defined irreversible operation.

The distinction must be encoded by route metadata rather than inferred from permission names:

- `stepUp: 'permission-derived'` — bypassed in auth-only mode.
- `stepUp: 'security-critical'` — always enforced.

Until that distinction exists, preserve explicit `stepUp: true` checks and bypass only automatic step-up derived from permission metadata. This is the conservative transition.

### 5.6 Client authorization data

Any endpoint or server component that provides current-user permissions to the client must also provide:

```json
{
  "authorizationMode": "authenticated-only"
}
```

Client components must make display decisions through the effective authorization policy. They must not independently reproduce allowlist logic.

### 5.7 AI and internal automation

AI tools and internal automations must receive the same effective authorization decision as ordinary routes. Auth-only mode must not cause tools to forge a role or claim that an operator has stored permissions they do not possess.

The following remain independent and mandatory:

- Tool input validation.
- Organization scoping.
- Confirm-before-write.
- Mutation idempotency.
- Audit actor identity.
- Sandbox/test-mode checks.
- Provider spend and concurrency controls.

## 6. Interface and display contract

Auth-only behavior must not consume global application chrome. Organizations 1 and 2 are intentional dogfood exceptions, so a permanent warning header adds noise and layout shift without helping operators complete work.

### 6.1 No global shell banner

Do not render a dogfood/auth-only banner, header, ribbon, or persistent status region in desktop or mobile shells.

Policy visibility belongs in contextual administration surfaces:

- Account menu access summary.
- Role and permission settings.
- Server request and audit metadata.

These surfaces must not expose environment variables, organization UUIDs, session IDs, or secret configuration.

### 6.2 Account menu

Display:

```text
Access: Dogfood full access
```

Strict mode displays the real role/access summary instead.

The account menu should link to session/account controls. It should not suggest editing roles as a way to change access while auth-only mode is active.

### 6.3 Navigation

In authenticated-only mode:

- Permission checks must not hide navigation rows.
- Parent and child navigation remain governed by normal navigation structure.
- Capability gating remains separate from authorization.
- Feature flags remain separate from authorization.
- Permission lock icons and “request access” affordances are not shown.

A hidden row during dogfood should mean product capability or feature state, not a dormant role check.

If capability gating also impedes development, add a separate operator-only “show all capabilities” diagnostic control. Do not overload auth-only mode to change capability state.

### 6.4 Permission administration surfaces

Permission settings should remain available for inspecting and preparing the future strict model, but must carry a clear notice:

```text
Permissions are not currently enforced for this dogfood workspace.
Changes are stored and will take effect when strict authorization is enabled.
```

Editing MAY remain enabled if role design is itself under test. The interface must never imply that a role change immediately changes access in auth-only mode.

### 6.5 Refusals and errors

In authenticated-only mode, operators should see only meaningful boundaries:

- Sign-in required.
- Session expired or revoked.
- Account inactive.
- Resource not found in this workspace.
- Invalid input.
- Business rule violation.
- External system unavailable.
- Test-mode restriction.

They should not receive `Missing permission …` or `STEPUP_REQUIRED` solely because of a role permission.

## 7. Auditing and observability

Every authenticated request and mutation should make the runtime policy diagnosable.

### Required request metadata

```text
authorization_mode=authenticated-only
organization_id=<current organization>
staff_id=<current staff>
request_id=<correlation id>
```

### Required mutation audit metadata

- Actual staff actor.
- Actual organization.
- Stored role summary where already available.
- `authorizationMode` used for the decision.
- Required permission declared by the route/tool, if any.
- Confirmation or step-up state when applicable.

Do not write a fake admin role into audit events.

### Recommended operational counters

- Requests served in authenticated-only mode.
- Mutations served in authenticated-only mode.
- Security-critical step-up refusals.
- Cross-tenant or membership refusals.
- Strict permission refusals, partitioned by organization.

These counters make the eventual strict-mode rehearsal measurable.

## 8. Safety constraints that remain mandatory

Auth-only mode must not weaken:

1. Tenant query scoping and RLS.
2. Session expiration and revocation.
3. Staff/account deactivation.
4. CSRF/origin protections where applicable.
5. Webhook signature verification.
6. OAuth state and callback validation.
7. Request schemas and domain validation.
8. Idempotency for retryable mutations.
9. Confirm-before-write AI flows.
10. Test-mode controls for money and external systems.
11. Audit attribution.
12. Credential encryption and secret handling.
13. Rate limits and abuse controls.

These are independent safety properties, not role permissions.

## 9. Implementation sequence

### Phase 1 — Establish the policy primitive

1. Add the `AuthorizationMode` type.
2. Add the centralized environment parser and organization resolver.
3. Fail on malformed mode or allowlist configuration.
4. Add deterministic resolver tests covering strict defaults and allowlist boundaries.

**Exit condition:** The mode for any authenticated organization is deterministic and no route behavior has changed.

### Phase 2 — Centralize route enforcement

1. Resolve the mode in `withAuth` after session authentication.
2. Bypass declared permission refusal only for allowlisted auth-only organizations.
3. Add mode and authorization helpers to `AuthContext`.
4. Preserve strict behavior byte-for-byte for non-allowlisted organizations where practical.
5. Attach authorization mode to error and request logs.

**Exit condition:** An allowlisted authenticated member can call a permission-protected internal route; an unlisted member still receives the existing strict refusal.

### Phase 3 — Align client and navigation behavior

1. Expose `authorizationMode` through the current-user/session payload used by the shells.
2. Make client permission decisions consume effective authorization.
3. Remove permission-derived hiding in auth-only mode.
4. Keep capability and feature-flag behavior unchanged.
5. Keep the shell free of global dogfood/auth-only headers.
6. Add the account-menu access badge.

**Exit condition:** Every internal route visible in navigation can be opened by an allowlisted authenticated member without adding persistent global chrome.

### Phase 4 — Classify step-up checks

1. Inventory automatic permission-derived and explicit security-critical step-up requirements.
2. Bypass only permission-derived checks in auth-only mode.
3. Keep credential, identity, and security-control changes protected.
4. Add focused tests for both classes.

**Exit condition:** Permission friction is gone without weakening authentication-account security.

### Phase 5 — Align tools and secondary authorization paths

1. Find direct `permissions.has(...)`, role, and admin checks outside `withAuth`.
2. Classify each as authorization, presentation, tenant safety, or domain safety.
3. Route authorization checks through the central effective policy.
4. Leave tenant and domain safety checks intact.
5. Ensure AI tools receive the effective policy and preserve confirmation/test-mode rules.

**Exit condition:** No internal product path has an independent dogfood bypass or an accidental strict permission check.

### Phase 6 — Strict-mode rehearsal

1. Add an operator-visible report of stored permissions that would be denied in strict mode.
2. Run dogfood normally in auth-only mode while recording these prospective refusals.
3. Repair role definitions and assignments from observed workflows.
4. Schedule short strict-mode rehearsal windows.
5. Return to auth-only immediately through configuration if the rehearsal blocks iteration.

**Exit condition:** Strict mode can run for an agreed rehearsal period without unexplained permission failures.

### Phase 7 — Cut back to strict authorization

1. Confirm role and permission ownership.
2. Confirm every active workflow has a defined permission policy.
3. Remove the organization from `AUTHORIZATION_MODE_ORGS` or set `AUTHORIZATION_MODE=strict`.
4. Verify server and client behavior.
5. Retain the mode implementation temporarily for rollback.
6. Remove authenticated-only support once the product and authorization model are stable and rollback is no longer required.

## 10. Verification plan

### Resolver tests

- Unset mode resolves to strict.
- Explicit strict mode resolves to strict for every organization.
- Auth-only mode applies to an allowlisted UUID.
- Auth-only mode does not apply to an unlisted UUID.
- Empty allowlist in auth-only mode fails.
- Malformed UUID fails.
- Unknown mode fails.

### Authentication behavior

- Anonymous request remains 401.
- Expired session remains 401.
- Revoked session remains 401.
- Disabled staff remains blocked.
- Active member succeeds in their organization.
- Cross-organization resource remains unavailable.

### Authorization behavior

- Allowlisted active member passes a route whose stored permission is absent.
- The same member is refused in strict mode.
- A non-allowlisted organization is refused under the same deployment.
- Stored permissions remain unchanged after requests in auth-only mode.
- Audit records identify the actual actor and auth-only mode.

### Interface behavior

- Desktop shell has no dogfood/auth-only header.
- Mobile shell has no dogfood/auth-only header.
- Account menu identifies dogfood full access.
- Permission-protected navigation is visible in auth-only mode.
- Capability-hidden navigation remains capability-hidden.
- Strict mode restores stored-permission presentation.

### Safety behavior

- Confirm-before-write remains active.
- Test-mode purchase restrictions remain active.
- Security-critical step-up remains active.
- Invalid request bodies remain rejected.
- Rate limits remain active.
- Webhook and OAuth security remain unchanged.

### Runtime smoke scenario

On `http://localhost:3050`:

1. Sign in as an active dogfood staff member lacking at least one stored permission.
2. Confirm the shell has no global auth-only header and the account menu identifies dogfood full access.
3. Open desktop and mobile surfaces that the missing permission previously hid.
4. Complete one internal read and one reversible internal write.
5. Confirm the mutation audit identifies the real staff member and auth-only mode.
6. Attempt a cross-tenant identifier and confirm no data is exposed.
7. Attempt an external-money action and confirm its existing test/confirmation guard remains.
8. Switch the organization to strict mode and confirm the missing permission is enforced again.

## 11. Acceptance criteria

The plan is complete when all of the following are true:

- Authentication is mandatory on every previously authenticated route.
- Tenant isolation behavior is unchanged.
- Auth-only mode applies only to explicitly allowlisted organizations.
- All internal permission checks use one effective policy.
- Stored roles and permissions remain unchanged and inspectable.
- No user is assigned a fake admin role to implement the mode.
- Desktop and mobile render no global dogfood/auth-only banner or header.
- Navigation is not hidden by permissions in auth-only mode.
- Capability and feature gating remain separate.
- Audit records preserve actual actor identity and selected authorization mode.
- Confirmation, idempotency, sandbox, and external-system safeguards remain enforced.
- Strict mode remains the default and can be restored without a migration.
- The changed behavior is proven through the live application at `:3050`.

## 12. Risks and controls

| Risk | Control |
|---|---|
| Auth-only mode accidentally reaches customer organizations | Explicit UUID allowlist; strict fallback; configuration validation |
| Operators believe permissions are working | Account access badge, permission-settings notice, and authorization mode in audit/request metadata |
| Cross-tenant access is mistaken for permission bypass | Tenant checks remain independent; cross-tenant smoke and IDOR tests |
| External actions become too easy | Preserve confirmation, sandbox, provider, and security-critical step-up guards |
| Dogfood exceptions spread through the codebase | One resolver and one authorization API; prohibit direct env reads elsewhere |
| Stored role data becomes misleading | Keep stored and effective permissions separate; never forge admin role |
| Strict cutover reveals extensive missing assignments | Prospective-refusal telemetry and staged strict-mode rehearsals |
| Temporary mode becomes permanent | Exit criteria, named owner, and removal phase |

## 13. Alternatives rejected

### Make every dogfood user an admin

Rejected because it mutates durable role truth, triggers admin-specific behavior, bypasses more than permissions, and makes later cleanup ambiguous.

### Delete or comment out permission checks

Rejected because authorization logic would fragment, strict restoration would become a large rewrite, and new routes would behave inconsistently.

### Run only in development mode

Rejected because dogfood may use production-like deployments and integrations. `NODE_ENV` is not an organization authorization policy.

### Add route-by-route dogfood exceptions

Rejected because the number of call sites will grow, secondary checks will be missed, and removal will be unreliable.

### Disable authentication entirely

Rejected because identity, tenant selection, auditing, session behavior, and mobile/operator workflows all depend on authenticated context.

## 14. Exit strategy

Auth-only mode is a product-development tool, not the final security model.

Before strict authorization becomes permanent:

1. Name the owner of the permission registry.
2. Define permissions around stable user capabilities rather than individual UI controls.
3. Validate roles against observed dogfood workflows.
4. Remove unused and duplicate permissions.
5. Ensure mobile and desktop require the same capability permissions.
6. Run prospective-denial reporting long enough to cover normal operations.
7. Complete strict-mode rehearsals.
8. Enable strict mode for the dogfood organization.
9. Remove the auth-only configuration after the rollback window.

The final architecture keeps authentication, tenant isolation, authorization, capability gating, business validation, and external-action safety as separate layers. Dogfood mode temporarily relaxes only authorization so product iteration can remain fast without sacrificing identity or tenant safety.
