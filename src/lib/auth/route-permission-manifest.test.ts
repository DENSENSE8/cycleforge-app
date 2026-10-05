import test from 'node:test';
import assert from 'node:assert/strict';
import {
  manifestSummary,
  permissionsWithRouteCount,
  routeByPath,
  routesGatedBy,
} from './route-permission-manifest';
import { isKnownPermission } from './permission-registry';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

test('manifest summary has zero ungated writes (the Phase 2e invariant)', () => {
  const s = manifestSummary();
  assert.equal(s.ungatedWrite, 0);
});

test('routesGatedBy returns every route for a known permission', () => {
  const adminManageStaff = routesGatedBy('admin.manage_staff');
  assert.ok(adminManageStaff.length > 0, 'admin.manage_staff should gate at least one route');
  // Staff CRUD endpoint should be in there (Phase 2d hardening).
  assert.ok(
    adminManageStaff.some((r) => r.path === '/api/staff/route.ts'),
    'admin.manage_staff should gate /api/staff/route.ts',
  );
});

test('routesGatedBy with no permission match returns empty array', () => {
  const result = routesGatedBy('this.does.not.exist');
  assert.deepEqual(result, []);
});

test('routeByPath returns null for unknown paths', () => {
  assert.equal(routeByPath('/api/totally-fake/route.ts'), null);
});

test('routeByPath returns the entry for a known route', () => {
  const r = routeByPath('/api/admin/audit/route.ts');
  assert.ok(r);
  assert.equal(r.permission, 'admin.view_logs');
});

test('regression: receiving.view gates recent-staged-location', () => {
  const r = routeByPath('/api/receiving/recent-staged-location/route.ts');
  assert.ok(r);
  assert.equal(r.permission, 'receiving.view');
  assert.deepEqual(r.methods, ['GET']);
});

test('regression: tech.qc_pass gates the QC queue read, same as the QC receiving lines', () => {
  const paths = routesGatedBy('tech.qc_pass').map((r) => r.path);
  assert.ok(paths.includes('/api/qc/queue/route.ts'));
  assert.ok(paths.includes('/api/qc/receiving-lines/route.ts'));
});

test('permissionsWithRouteCount is sorted descending by routeCount', () => {
  const list = permissionsWithRouteCount();
  assert.ok(list.length > 0);
  for (let i = 1; i < list.length; i++) {
    assert.ok(list[i - 1].routeCount >= list[i].routeCount, 'list should be sorted descending');
  }
});

test('regression: work_orders.view gates the assignments routes', () => {
  const gated = routesGatedBy('work_orders.view');
  const paths = gated.map((r) => r.path);
  // Phase 2e added work_orders.view to /api/assignments/sku-search
  assert.ok(paths.some((p) => p.includes('assignments')), 'work_orders.view should gate some assignments route');
});

test('regression: rma.view/rma.manage gate the RMA routes (not orders.view)', () => {
  // Returns-unification Phase 4 Stage 1 (Gap #8): RMA routes were previously
  // gated by the generic orders.view; migrated to a dedicated rma.* pair so
  // access can be granted independently of general order visibility.
  const viewPaths = routesGatedBy('rma.view').map((r) => r.path);
  const managePaths = routesGatedBy('rma.manage').map((r) => r.path);
  const allRmaPaths = [...viewPaths, ...managePaths];
  assert.ok(allRmaPaths.includes('/api/rma/route.ts'), 'rma.* should gate /api/rma');
  assert.ok(allRmaPaths.includes('/api/rma/[id]/route.ts'), 'rma.* should gate /api/rma/[id]');
  assert.ok(allRmaPaths.includes('/api/rma/by-number/[number]/route.ts'), 'rma.* should gate the by-number lookup');
  assert.ok(managePaths.includes('/api/rma/[id]/disposition/route.ts'), 'rma.manage should gate disposition');
  assert.ok(!routesGatedBy('orders.view').some((r) => r.path.startsWith('/api/rma/')), 'no RMA route should still be on orders.view');
});

test('regression: label.manifest.manage gates the label-manifest mutation routes', () => {
  // Serial↔label pairing Phase 3 — manifest create/seal/dissolve + item add/remove
  // are gated by the new label.manifest.manage; the read (GET detail) stays on the
  // shared print.label so anyone who can print can build/scan a kit.
  const managePaths = routesGatedBy('label.manifest.manage').map((r) => r.path);
  assert.ok(managePaths.includes('/api/label-manifests/route.ts'), 'create gated by label.manifest.manage');
  assert.ok(managePaths.includes('/api/label-manifests/[id]/seal/route.ts'), 'seal gated by label.manifest.manage');
  assert.ok(managePaths.includes('/api/label-manifests/[id]/dissolve/route.ts'), 'dissolve gated by label.manifest.manage');
  assert.ok(managePaths.includes('/api/label-manifests/[id]/items/route.ts'), 'add items gated by label.manifest.manage');
  assert.ok(
    managePaths.includes('/api/label-manifests/[id]/items/[serialUnitId]/route.ts'),
    'remove item gated by label.manifest.manage',
  );
  const printPaths = routesGatedBy('print.label').map((r) => r.path);
  assert.ok(printPaths.includes('/api/label-manifests/[id]/route.ts'), 'GET detail gated by print.label');
});

test('regression: bin.adjust gates the full replenishment-task lifecycle incl. release (reversibility 5.7)', () => {
  // Release is the undo of claim (IN_PROGRESS → REQUESTED) and must sit behind
  // the same permission the claim route uses.
  const paths = routesGatedBy('bin.adjust').map((r) => r.path);
  assert.ok(paths.includes('/api/replenishment/tasks/[id]/claim/route.ts'), 'claim gated by bin.adjust');
  assert.ok(paths.includes('/api/replenishment/tasks/[id]/release/route.ts'), 'release gated by bin.adjust');
  assert.ok(paths.includes('/api/replenishment/tasks/[id]/complete/route.ts'), 'complete gated by bin.adjust');
  assert.ok(paths.includes('/api/replenishment/tasks/[id]/cancel/route.ts'), 'cancel gated by bin.adjust');
});

test('regression: sourcing.view gates the Bose model + compatibility read routes', () => {
  const paths = routesGatedBy('sourcing.view').map((r) => r.path);
  // Bose Sourcing Engine Phase 1 — the manifest records the first-declared
  // method's permission per file, so these read-first routes land on view.
  assert.ok(paths.includes('/api/bose-models/route.ts'), 'sourcing.view should gate /api/bose-models');
  assert.ok(paths.some((p) => p.includes('bose-models/lookup')), 'sourcing.view should gate the compatibility lookup');
  assert.ok(paths.some((p) => p.includes('product-models/lookup')), 'sourcing.view should gate the brand-neutral lookup façade');
  assert.ok(paths.includes('/api/part-compatibility/route.ts'), 'sourcing.view should gate compatibility list');
  assert.ok(paths.includes('/api/sourcing/saved-searches/route.ts'), 'sourcing.view should gate the saved-searches list');
});

test('regression: sourcing.manage gates the compatibility mutation route', () => {
  const paths = routesGatedBy('sourcing.manage').map((r) => r.path);
  assert.ok(
    paths.includes('/api/part-compatibility/[id]/route.ts'),
    'sourcing.manage should gate compatibility edit/delete',
  );
  assert.ok(
    paths.includes('/api/sourcing/saved-searches/[id]/route.ts'),
    'sourcing.manage should gate saved-search edit/delete',
  );
});

test('regression: repair.view gates the repair carrier-events read', () => {
  const paths = routesGatedBy('repair.view').map((r) => r.path);
  assert.ok(paths.includes('/api/repair-service/[id]/carrier-events/route.ts'));
});

test('regression: photos.view gates the photo library route', () => {
  const paths = routesGatedBy('photos.view').map((r) => r.path);
  assert.ok(paths.includes('/api/photos/library/route.ts'), 'photos.view should gate /api/photos/library');
});

test('regression: photos.share gates share pack creation', () => {
  const paths = routesGatedBy('photos.share').map((r) => r.path);
  assert.ok(paths.includes('/api/photos/share-packs/route.ts'), 'photos.share should gate share pack POST');
});

test('regression: support.thread.* gates the entity-thread routes', () => {
  // Entity threads (docs/todo/entity-threads-conversation-plan.md, D7): a
  // ticketless internal thread gates independently of the Zendesk integration.
  const viewPaths = routesGatedBy('support.thread.view').map((r) => r.path);
  const managePaths = routesGatedBy('support.thread.manage').map((r) => r.path);
  // The manifest records the first-declared method's permission per file:
  // /api/threads and /[id]/messages declare GET (view) first.
  assert.ok(viewPaths.includes('/api/threads/route.ts'), 'support.thread.view should gate /api/threads');
  assert.ok(
    viewPaths.includes('/api/threads/[id]/messages/route.ts'),
    'support.thread.view should gate the messages route',
  );
  assert.ok(
    managePaths.includes('/api/threads/[id]/attach-ticket/route.ts'),
    'support.thread.manage should gate attach-ticket',
  );
});

test('regression: support.issues.view gates the reported-issues read routes', () => {
  // UIC-1 — Reported-Issues console read API. Manifest records the first-
  // declared method's permission per file (GET before POST on the collection;
  // GET before PATCH on [id] — same as sku-catalog/[id]).
  const paths = routesGatedBy('support.issues.view').map((r) => r.path);
  assert.ok(paths.includes('/api/user-issues/route.ts'), 'support.issues.view should gate /api/user-issues');
  assert.ok(
    paths.includes('/api/user-issues/[id]/route.ts'),
    'support.issues.view should gate /api/user-issues/[id]',
  );
});

test('regression: support.issues.manage gates PATCH on /api/user-issues/[id]', () => {
  // UIC-3 — session Claim/Resolve/Reopen/Edit. Manifest records first-declared
  // method (GET → view) per file, so assert the route source + registry instead.
  assert.ok(
    isKnownPermission('support.issues.manage'),
    'support.issues.manage must stay in the permission registry',
  );
  const src = readFileSync(
    join(process.cwd(), 'src/app/api/user-issues/[id]/route.ts'),
    'utf8',
  );
  assert.match(
    src,
    /requireRoutePerm\(req, 'support\.issues\.manage'\)/,
    'PATCH must gate on support.issues.manage',
  );
  assert.match(
    src,
    /export async function DELETE/,
    'UIC-4 soft-delete DELETE must stay on the same [id] route',
  );
});

test('regression: receiving.upload_photo gates photo reassignment', () => {
  const paths = routesGatedBy('receiving.upload_photo').map((r) => r.path);
  assert.ok(
    paths.includes('/api/photos/[id]/reassign/route.ts'),
    'receiving.upload_photo should gate photo reassignment',
  );
});

test('regression: photo ASPECT classification is floor work, not admin work', () => {
  // Naming what a shot shows is done at the bench, by the operator standing in the capture step — the same hands that took it.
  const paths = routesGatedBy('receiving.upload_photo').map((r) => r.path);
  assert.ok(
    paths.includes('/api/photos/[id]/aspect/route.ts'),
    'receiving.upload_photo should gate photo aspect classification',
  );
});

test('regression: photo STAGE CLAIM is floor work, same as aspect/reassign', () => {
  // Arrival Link promotes a carton shot onto door evidence — same operator,
  // same permission waist as naming an aspect or moving a photo between POs.
  const paths = routesGatedBy('receiving.upload_photo').map((r) => r.path);
  assert.ok(
    paths.includes('/api/photos/[id]/claim-stage/route.ts'),
    'receiving.upload_photo should gate same-carton stage claim',
  );
});

test('regression: photo-label routes are gated (read on view, writes on manage)', () => {
  // Vocabulary list + per-photo label read land on the per-file minimum
  // (photos.view, the GET); the POST/PUT/PATCH/DELETE writes assert photos.manage
  // in-handler. The manage-gated single-label + bulk routes are recorded directly.
  const view = routesGatedBy('photos.view').map((r) => r.path);
  assert.ok(view.includes('/api/photos/labels/route.ts'), 'photos.view should gate the labels vocabulary route');
  assert.ok(view.includes('/api/photos/[id]/labels/route.ts'), 'photos.view should gate the per-photo labels route');

  const manage = routesGatedBy('photos.manage').map((r) => r.path);
  assert.ok(manage.includes('/api/photos/labels/[id]/route.ts'), 'photos.manage should gate single-label edit/delete');
  assert.ok(manage.includes('/api/photos/labels/bulk-apply/route.ts'), 'photos.manage should gate bulk label apply');
});

test('regression: inventory.list_unit gates the per-unit listing route (engine Phase 1.4)', () => {
  // The 'listed' fulfillment-tail seam — marks a serial unit live on a sales
  // channel (src/lib/inventory/markUnitListed.ts), then fires tapWorkflow('listed').
  const paths = routesGatedBy('inventory.list_unit').map((r) => r.path);
  assert.ok(
    paths.includes('/api/serial-units/[id]/list/route.ts'),
    'inventory.list_unit should gate the serial-unit list route',
  );
});

test('regression: handling_unit.view gates the handling-units read routes', () => {
  // Handling units (LPN) — docs/handling-unit-lpn-plan.md. The manifest records
  // the first-declared method's permission per file, so the read-first
  // collection + detail routes land on view.
  const paths = routesGatedBy('handling_unit.view').map((r) => r.path);
  assert.ok(paths.includes('/api/handling-units/route.ts'), 'handling_unit.view should gate the box list');
  assert.ok(paths.includes('/api/handling-units/[id]/route.ts'), 'handling_unit.view should gate the box detail');
});

test('regression: stations routes are gated (station builder, ops-studio layer 2)', () => {
  // Reads land on dashboard.view (any signed-in staff renders their stations);
  // the manifest records the first-declared method's permission per file.
  const readPaths = routesGatedBy('dashboard.view').map((r) => r.path);
  assert.ok(readPaths.includes('/api/stations/route.ts'), 'dashboard.view should gate the station definitions read');
  // Draft saves + publish are stations.manage.
  const managePaths = routesGatedBy('stations.manage').map((r) => r.path);
  assert.ok(
    managePaths.includes('/api/stations/publish/route.ts'),
    'stations.manage should gate station publish',
  );
});

test('regression: dashboard.view gates the generic saved-views API', () => {
  const paths = routesGatedBy('dashboard.view').map((r) => r.path);
  assert.ok(
    paths.includes('/api/saved-views/route.ts'),
    'dashboard.view should gate GET/POST /api/saved-views',
  );
  assert.ok(
    paths.includes('/api/saved-views/[id]/route.ts'),
    'dashboard.view should gate PATCH/DELETE /api/saved-views/[id]',
  );
});

test('regression: studio.view gates the Operations Studio graph feed (ST1)', () => {
  const paths = routesGatedBy('studio.view').map((r) => r.path);
  assert.ok(
    paths.includes('/api/studio/graph/route.ts'),
    'studio.view should gate the studio canvas graph read',
  );
});

test('regression: studio.view gates the People lens feed (ST6 / Phase E1)', () => {
  const paths = routesGatedBy('studio.view').map((r) => r.path);
  assert.ok(
    paths.includes('/api/studio/people/route.ts'),
    'studio.view should gate the People-lens staffing-coverage read',
  );
});

test('regression: studio.manage gates the draft/publish lifecycle (ST4)', () => {
  const paths = routesGatedBy('studio.manage').map((r) => r.path);
  assert.ok(
    paths.includes('/api/studio/definitions/draft/route.ts'),
    'studio.manage should gate draft creation',
  );
  assert.ok(
    paths.includes('/api/studio/definitions/[id]/graph/route.ts'),
    'studio.manage should gate draft graph saves',
  );
  assert.ok(
    paths.includes('/api/studio/definitions/[id]/publish/route.ts'),
    'studio.manage should gate publish',
  );
  // Phase C.2 — draft hygiene: discarding a never-published draft is studio.manage.
  assert.ok(
    paths.includes('/api/studio/definitions/[id]/discard/route.ts'),
    'studio.manage should gate draft discard',
  );
});

test('regression: the template library is studio.view to list/preview, studio.manage to import (ST6 / Phase E4)', () => {
  // System-owned default workflow graphs a tenant clones into its own
  // definitions. Listing/previewing a (global) template is studio.view;
  // importing CLONES it into a draft, which is the studio.manage authoring gate.
  const view = routesGatedBy('studio.view').map((r) => r.path);
  assert.ok(
    view.includes('/api/studio/templates/route.ts'),
    'studio.view should gate the template library list',
  );
  assert.ok(
    view.includes('/api/studio/templates/[id]/route.ts'),
    'studio.view should gate the template detail/preview',
  );
  const manage = routesGatedBy('studio.manage').map((r) => r.path);
  assert.ok(
    manage.includes('/api/studio/templates/[id]/import/route.ts'),
    'studio.manage should gate template import (it writes a draft)',
  );
});

test('regression: the onboarding template chooser is studio.manage (Template Platform Phase 1)', () => {
  // The first-run chooser installs a system template into the org (clone +
  // surface-seed + activate) — the same authoring write as template import, so
  // the same gate.
  const manage = routesGatedBy('studio.manage').map((r) => r.path);
  assert.ok(
    manage.includes('/api/onboarding/template/route.ts'),
    'studio.manage should gate the onboarding template chooser (it installs a workflow)',
  );
});

test('regression: package export is studio.view, package import is studio.manage (Template Platform Phase 3)', () => {
  // Exporting the org's own definition to a CycleForgeTemplatePackage is a read
  // (studio.view); importing a package clones it into a draft (studio.manage).
  const view = routesGatedBy('studio.view').map((r) => r.path);
  assert.ok(
    view.includes('/api/studio/definitions/[id]/export/route.ts'),
    'studio.view should gate the definition → package export',
  );
  const manage = routesGatedBy('studio.manage').map((r) => r.path);
  assert.ok(
    manage.includes('/api/studio/templates/import-package/route.ts'),
    'studio.manage should gate template package import (it writes a draft)',
  );
});

test('regression: catalog curation — submit is studio.manage, review is studio.catalog.review (Template Platform Phase 4)', () => {
  // Submitting the org's OWN definition to the catalog is an authoring write by its owner (studio.manage).
  const manage = routesGatedBy('studio.manage').map((r) => r.path);
  assert.ok(
    manage.includes('/api/studio/definitions/[id]/submit/route.ts'),
    'studio.manage should gate submitting an org definition to the catalog',
  );
  const view = routesGatedBy('studio.view').map((r) => r.path);
  assert.ok(
    view.includes('/api/studio/catalog/route.ts'),
    'studio.view should gate browsing the curated catalog',
  );
  const review = routesGatedBy('studio.catalog.review').map((r) => r.path);
  assert.ok(
    review.includes('/api/studio/catalog/submissions/route.ts'),
    'studio.catalog.review should gate the submission review queue',
  );
  assert.ok(
    review.includes('/api/studio/catalog/submissions/[id]/review/route.ts'),
    'studio.catalog.review should gate the approve/reject action',
  );
});

test('regression: AI intake surfaces are studio.view reads, never activation (Template Platform Phase 5)', () => {
  // The AI palette (constrained vocabulary) and the template recommender are both read-only:
  const view = routesGatedBy('studio.view').map((r) => r.path);
  assert.ok(
    view.includes('/api/studio/templates/ai-vocabulary/route.ts'),
    'studio.view should gate the AI template vocabulary palette',
  );
  assert.ok(
    view.includes('/api/onboarding/recommend/route.ts'),
    'studio.view should gate the template recommender',
  );
});

test('regression: node-bound station writes are studio.manage (ST5 / Phase D)', () => {
  // The node-scoped station binding (Operations Studio L2).
  const view = routesGatedBy('studio.view').map((r) => r.path);
  assert.ok(
    view.includes('/api/studio/nodes/[id]/station/route.ts'),
    'the node-station read (GET) is gated studio.view',
  );
  const manage = routesGatedBy('studio.manage').map((r) => r.path);
  assert.ok(
    manage.includes('/api/studio/nodes/[id]/station/publish/route.ts'),
    'studio.manage should gate the node-station publish',
  );
  // The write file declares a PUT (defense-in-depth: the route itself gates it
  // studio.manage even though the manifest records the file under the GET).
  const writeFile = routeByPath('/api/studio/nodes/[id]/station/route.ts');
  assert.ok(writeFile);
  assert.ok(writeFile!.methods.includes('PUT'), 'the node-station file exposes a PUT write');
});

test('regression: orders.view gates the To-ship order-sources menu', () => {
  const r = routeByPath('/api/integrations/order-sources/route.ts');
  assert.ok(r);
  assert.equal(r.permission, 'orders.view');
  assert.deepEqual(r.methods, ['GET']);
});

test('regression: integrations.amazon gates the Amazon connection routes', () => {
  // Amazon SP-API order import (docs/amazon-sp-api-order-import-plan.md). The
  // OAuth callback is intentionally ungated (state-validated public redirect,
  // like the eBay callback) and is not asserted here.
  const paths = routesGatedBy('integrations.amazon').map((r) => r.path);
  assert.ok(paths.includes('/api/amazon/accounts/route.ts'), 'integrations.amazon should gate amazon accounts');
  assert.ok(paths.includes('/api/amazon/health/route.ts'), 'integrations.amazon should gate amazon health');
  assert.ok(paths.includes('/api/amazon/connect/route.ts'), 'integrations.amazon should gate amazon connect');
});

test('regression: handling_unit.manage gates the assign/unassign mutations', () => {
  const paths = routesGatedBy('handling_unit.manage').map((r) => r.path);
  assert.ok(
    paths.includes('/api/handling-units/[id]/assign/route.ts'),
    'handling_unit.manage should gate unit assignment',
  );
  assert.ok(
    paths.includes('/api/handling-units/[id]/unassign/route.ts'),
    'handling_unit.manage should gate unit removal',
  );
});

test('regression: integrations.google_drive gates the Drive connect + health routes', () => {
  // Google Drive photo backup. The OAuth callback is intentionally ungated
  // (encrypted-state public redirect, like the Amazon/eBay callbacks) and is
  // not asserted here.
  const paths = routesGatedBy('integrations.google_drive').map((r) => r.path);
  assert.ok(
    paths.includes('/api/integrations/google-drive/connect/route.ts'),
    'integrations.google_drive should gate the Drive connect route',
  );
  assert.ok(
    paths.includes('/api/integrations/google-drive/health/route.ts'),
    'integrations.google_drive should gate the Drive health route',
  );
});

test('regression: the image-type registry route is permission-gated', () => {
  // The saved-folder system was replaced by the image-type registry.
  const route = routeByPath('/api/photos/image-types/route.ts');
  assert.ok(route, 'the image-types route should be in the manifest');
  assert.equal(route.gate, 'withAuth');
  assert.equal(route.permission, 'photos.view');
});

test('regression: shipping.buy_label gates the order-anchored rate-shop + label-purchase routes (ShipStation)', () => {
  const paths = routesGatedBy('shipping.buy_label').map((r) => r.path);
  assert.ok(paths.includes('/api/shipping/order-rates/route.ts'), 'shipping.buy_label should gate rate-shop');
  assert.ok(
    paths.includes('/api/shipping/order-labels/purchase/route.ts'),
    'shipping.buy_label should gate label purchase',
  );
});

test('regression: shipping.void_label gates the label-void route', () => {
  const paths = routesGatedBy('shipping.void_label').map((r) => r.path);
  assert.ok(
    paths.includes('/api/shipping/order-labels/void/route.ts'),
    'shipping.void_label should gate label void',
  );
});

test('regression: the ShipStation webhook is a signature-verified public route', () => {
  const route = routeByPath('/api/webhooks/shipstation/[token]/route.ts');
  assert.ok(route, 'the ShipStation webhook should be in the manifest');
  assert.equal(route.permission, null);
  assert.ok(route.exemptReason, 'the ShipStation webhook should be exempt (signature-gated)');
});

test('assistant chat route is gated by assistant.chat', () => {
  const paths = routesGatedBy('assistant.chat').map((r) => r.path);
  assert.ok(paths.includes('/api/assistant/chat/route.ts'));
  assert.ok(paths.includes('/api/assistant/mutations/route.ts'));
  assert.ok(paths.includes('/api/mcp/route.ts'));
});

test('assistant mutation revert route is gated by studio.manage', () => {
  const paths = routesGatedBy('studio.manage').map((r) => r.path);
  assert.ok(paths.includes('/api/assistant/mutations/[id]/revert/route.ts'));
});

test('regression: operations.plans.* gates ops-plans routes', () => {
  const viewPaths = routesGatedBy('operations.plans.view').map((r) => r.path);
  const managePaths = routesGatedBy('operations.plans.manage').map((r) => r.path);
  const claimPaths = routesGatedBy('operations.plans.claim').map((r) => r.path);
  assert.ok(viewPaths.includes('/api/ops-plans/route.ts'));
  assert.ok(viewPaths.includes('/api/ops-plans/inbox/route.ts'));
  assert.ok(managePaths.includes('/api/ops-plans/from-template/route.ts'));
  assert.ok(claimPaths.includes('/api/ops-plans/tasks/[taskId]/claim/route.ts'));
});

test('regression: operations.tv.view gates the unattended TV wall board (read-only, least-privilege)', () => {
  // HOME-OPS Phase C: a kiosk token holds ONLY operations.tv.view, so the TV
  // board feed must be gated by it and NOT by the broader operations.view.
  const tvPaths = routesGatedBy('operations.tv.view').map((r) => r.path);
  assert.ok(tvPaths.includes('/api/operations/tv-board/route.ts'));
  // The wall's Live feed panel reads its own sibling route — the kiosk lacks the feed's packing.view.
  assert.ok(tvPaths.includes('/api/operations/tv-board/live-feed/route.ts'));
});

test('regression: beta.review gates the beta-applications review queue; the public apply route stays exempt', () => {
  // Beta intake P-1a (docs/todo/beta-intake-funnel-plan.md §6): the review
  // queue over pre-tenant beta_applications is withAuth(beta.review) even
  // though /api/beta/* is proxy-public at the edge.
  const paths = routesGatedBy('beta.review').map((r) => r.path);
  assert.ok(paths.includes('/api/beta/applications/route.ts'), 'beta.review should gate the review queue');
  const apply = routeByPath('/api/beta/apply/route.ts');
  assert.ok(apply, 'the public apply route should be in the manifest');
  assert.equal(apply.permission, null);
  assert.ok(apply.exemptReason, 'the apply route is intentionally anonymous (public marketing capture)');
});

test('regression: picking.view gates the fulfillment substitution-policy read; the substitute POST enforces its OR in-handler', () => {
  // Substitution is raised from the Picker desk's active-order workspace, so the policy read is a picking gate (2026-09-27 QC/Pick split).
  const policy = routeByPath('/api/fulfillment/substitution-policy/route.ts');
  assert.ok(policy, 'the substitution-policy route should be in the manifest');
  assert.equal(policy.gate, 'withAuth');
  assert.equal(policy.permission, 'picking.view');

  const substitute = routeByPath('/api/orders/[id]/substitute/route.ts');
  assert.ok(substitute, 'the substitute route should be in the manifest');
  assert.equal(substitute.gate, 'withAuth (no permission)');
  assert.ok(substitute.methods.includes('POST'));
});

test('every internal /api/picking/* route gates on a picking.* permission, never tech.* (QC)', () => {
  // 2026-09-27: Picking and Quality Control are separate stations. A picker-only
  // role must be able to work the desk; a tech.* gate here 403s them.
  const manifest = JSON.parse(
    readFileSync(join(process.cwd(), 'docs/security/route-permissions.json'), 'utf8'),
  ) as { routes: Array<{ path: string; permission: string | null }> };
  const picking = manifest.routes.filter((r) => r.path.startsWith('/api/picking/'));
  assert.ok(picking.length > 0, 'the /api/picking routes should be in the manifest');
  for (const route of picking) {
    assert.ok(route.permission?.startsWith('picking.'), `${route.path} gates on ${route.permission}`);
  }
});

test('regression: buyer-note ack enforces packing.complete_order OR shipping.buy_label in-handler', () => {
  // The ack releases the pack / label interlock (src/lib/orders/buyer-note-interlock.ts),
  // so it is open to exactly the two verbs the interlock holds. withAuth can't
  // express an OR — same in-handler pattern as the substitute POST above.
  const ack = routeByPath('/api/orders/[id]/buyer-note/ack/route.ts');
  assert.ok(ack, 'the buyer-note ack route should be in the manifest');
  assert.equal(ack.gate, 'withAuth (no permission)');
  assert.ok(ack.methods.includes('POST'));
});

test('regression: order manuals — reads are orders.view, every manual write is product_manuals.manage', () => {
  // To-ship paperwork walk:
  const list = routeByPath('/api/orders/[id]/manuals/route.ts');
  assert.ok(list, 'the order manuals route should be in the manifest');
  assert.equal(list.gate, 'requireRoutePerm');
  assert.equal(list.permission, 'orders.view');
  assert.deepEqual([...list.methods].sort(), ['GET', 'POST']);

  const one = routeByPath('/api/orders/[id]/manuals/[manualId]/route.ts');
  assert.ok(one, 'the per-manual route should be in the manifest');
  assert.equal(one.permission, 'product_manuals.manage');
  assert.deepEqual([...one.methods].sort(), ['DELETE', 'PATCH']);
});

test('regression: receiving-lines PATCH assign-only accepts tech.qc_pass in-handler', () => {
  // Testing triage ownership (docs/todo/testing-triage-ownership-scope-HANDOFF.md):
  const src = readFileSync(join(process.cwd(), 'src/app/api/receiving-lines/route.ts'), 'utf8');
  assert.match(src, /tech\.qc_pass/);
  assert.match(src, /receiving\.mark_received\|tech\.qc_pass/);
  assert.match(src, /assignOnly/);
});

test('regression: shipping.buy_label / shipping.void_label gate the operator label-engine routes', () => {
  // Tier-3 C1 + studio-integrations exit criteria: the generic ShipStation
  // operator routes (rate-shop from an explicit spec, buy a quoted rate, void
  // by label id) reuse the existing outbound label permissions.
  const buyPaths = routesGatedBy('shipping.buy_label').map((r) => r.path);
  assert.ok(buyPaths.includes('/api/shipping/rates/route.ts'), 'buy_label should gate /api/shipping/rates');
  assert.ok(buyPaths.includes('/api/shipping/labels/route.ts'), 'buy_label should gate /api/shipping/labels');
  const voidPaths = routesGatedBy('shipping.void_label').map((r) => r.path);
  assert.ok(voidPaths.includes('/api/shipping/labels/void/route.ts'), 'void_label should gate /api/shipping/labels/void');
});

test('regression: receiving.match_email gates the incoming match-email route (incoming-todo Phase 4a)', () => {
  // Floor-staff "Match" for a Tier-0 unmatched shipping email — links to an
  // EXISTING Zoho PO only (never creates one), so it sits behind the narrower
  // receiving.match_email rather than admin.view (plan §6, Phase 4 opt-in).
  const paths = routesGatedBy('receiving.match_email').map((r) => r.path);
  assert.ok(
    paths.includes('/api/receiving-lines/incoming/match-email/route.ts'),
    'receiving.match_email should gate /api/receiving-lines/incoming/match-email',
  );
});

test('regression: operations.plans.view gates the forge master-plan routes (agentic loop Phase 1/3)', () => {
  // The agentic-loop master plan reuses the ops-plans permission family (docs/todo/agentic-loop-master-plan.md):
  const paths = routesGatedBy('operations.plans.view').map((r) => r.path);
  assert.ok(paths.includes('/api/forge/master-plan/route.ts'), 'view perm should gate /api/forge/master-plan');
  assert.ok(paths.includes('/api/forge/master-plan/seed/route.ts'), 'view perm should gate /api/forge/master-plan/seed');
});

test('regression: forge master-plan sync is machine-gated (allowAnonymous + forge token)', () => {
  // Cursor/`forge.sh` status flips POST here so ops_plans refresh without a
  // browser viewer. Ungated session writes are forbidden inside the handler.
  const r = routeByPath('/api/forge/master-plan/sync/route.ts');
  assert.ok(r, 'sync route should be in the manifest');
  assert.equal(r.permission, null);
  assert.ok(
    r.gate.includes('allowAnonymous') || r.gate.includes('withAuth'),
    `expected withAuth/allowAnonymous gate, got ${r.gate}`,
  );
});

test('regression: orders/[id]/amazon-refresh is orders.create (Product-tab ASIN reimport)', () => {
  const paths = routesGatedBy('orders.create').map((r) => r.path);
  assert.ok(
    paths.includes('/api/orders/[id]/amazon-refresh/route.ts'),
    'orders.create should gate POST /api/orders/[id]/amazon-refresh',
  );
});

test('regression: orders-exceptions/[id] PATCH is orders.create (tracking-only exception edit)', () => {
  const paths = routesGatedBy('orders.create').map((r) => r.path);
  assert.ok(
    paths.includes('/api/orders-exceptions/[id]/route.ts'),
    'orders.create should gate PATCH /api/orders-exceptions/[id]',
  );
  const r = routeByPath('/api/orders-exceptions/[id]/route.ts');
  assert.ok(r, 'orders-exceptions/[id] should be in the manifest');
  assert.equal(r.permission, 'orders.create');
  assert.ok(r.methods.includes('PATCH'), 'expected PATCH method');
});

// ── Kiosk device principal (/kiosk — FOH/BOH surface split doc 06) ───────────

test('kiosk enroll + revoke are gated by walk_in.enroll_kiosk', () => {
  const paths = routesGatedBy('walk_in.enroll_kiosk').map((r) => r.path);
  assert.ok(paths.includes('/api/kiosk/enroll/route.ts'), 'enroll gated by walk_in.enroll_kiosk');
  assert.ok(paths.includes('/api/kiosk/revoke/route.ts'), 'revoke gated by walk_in.enroll_kiosk');
});

test('walk_in.enroll_kiosk is a registered permission', () => {
  assert.equal(isKnownPermission('walk_in.enroll_kiosk'), true);
});

test('kiosk intake is a device-principal gate (withKioskAuth), no staff permission', () => {
  const r = routeByPath('/api/kiosk/intake/route.ts');
  assert.ok(r, 'intake route should be in the manifest');
  assert.equal(r.permission, null);
  assert.ok(r.gate.includes('withKioskAuth'), `expected withKioskAuth gate, got ${r.gate}`);
  // It is a device-authed WRITE — must never be an ungated (gate: NONE) route.
  assert.notEqual(r.gate, 'NONE');
});

test('walk_in.take_payment is a registered permission', () => {
  assert.equal(isKnownPermission('walk_in.take_payment'), true);
});

test('taking counter payment is NOT a route gate on any DEVICE-authed kiosk route', () => {
  // The kiosk write path is device-authed, so there is no staff session for withAuth to check a permission against.
  const r = routeByPath('/api/kiosk/intake/route.ts');
  assert.ok(r, 'intake route should be in the manifest');
  assert.equal(r.permission, null, 'device-authed: no route-level staff permission');
  const kioskGated = routesGatedBy('walk_in.take_payment').filter((route) =>
    route.path.startsWith('/api/kiosk/'),
  );
  assert.deepEqual(
    kioskGated.map((route) => route.path),
    [],
    'walk_in.take_payment is a step-up permission on the kiosk, not a route gate',
  );
});

test('changing a line price is walk_in.adjust_price: the desk override gates on it, the kiosk step-ups on it', () => {
  assert.equal(isKnownPermission('walk_in.adjust_price'), true);
  const paths = routesGatedBy('walk_in.adjust_price').map((r) => r.path);
  assert.ok(
    paths.includes('/api/counter/session/[id]/lines/[lineUuid]/price/route.ts'),
    'desk price override gated by walk_in.adjust_price, not take_payment',
  );
  // The tablet's approval route is device-authed: the permission is proven by
  // resolveKioskStepUp on the PIN, never by a staff session it does not have.
  const approval = routeByPath('/api/kiosk/price-approval/route.ts');
  assert.ok(approval, 'price-approval route should be in the manifest');
  assert.equal(approval.permission, null);
  assert.ok(approval.gate.includes('withKioskAuth'), `expected withKioskAuth gate, got ${approval.gate}`);
});

test('kiosk pair is public + capability-gated (the pairing code is the capability)', () => {
  const r = routeByPath('/api/kiosk/pair/route.ts');
  assert.ok(r, 'pair route should be in the manifest');
  assert.equal(r.permission, null);
  assert.ok(r.gate.includes('anonymous'), `expected anonymous gate, got ${r.gate}`);
});

// ── Packer Review Station (WS-REVIEW — packer-review-station-plan Phase 3) ────

test('packing.review gates the manager decide + queue routes', () => {
  const paths = routesGatedBy('packing.review').map((r) => r.path);
  assert.ok(
    paths.includes('/api/packing/verification/decide/route.ts'),
    'the manager decide route is gated by packing.review',
  );
  assert.ok(
    paths.includes('/api/packing/verification/queue/route.ts'),
    'the review queue read is gated by packing.review',
  );
  assert.ok(
    paths.includes('/api/review/catalog-link/route.ts'),
    'Review · Catalog link chores are gated by packing.review',
  );
  assert.ok(
    paths.includes('/api/review/import-exceptions/route.ts'),
    'Review · Missing item number exceptions are gated by packing.review',
  );
});

test('packing.review is a registered permission', () => {
  assert.equal(isKnownPermission('packing.review'), true);
});

test('the packer verification submit is a packing.complete_order write', () => {
  const r = routeByPath('/api/packing/verification/route.ts');
  assert.ok(r, 'the verification submit route should be in the manifest');
  assert.equal(r.permission, 'packing.complete_order');
});

test('V1 label-ingestion apply and retry are packing.complete_order writes', () => {
  // Apply moves PACKED units to LABELED and attaches tracking; retry re-runs
  // the server parser. Neither may ride the read gate the ledger list uses.
  for (const path of [
    '/api/v1/label-ingestions/[id]/apply/route.ts',
    '/api/v1/label-ingestions/[id]/retry/route.ts',
  ]) {
    const r = routeByPath(path);
    assert.ok(r, `${path} should be in the manifest`);
    assert.equal(r.permission, 'packing.complete_order');
  }
  assert.equal(routeByPath('/api/v1/label-ingestions/[id]/route.ts')?.permission, 'packing.review');
});

test('interop.read gates every standards-projection route', () => {
  // The interop projections read the whole tenant's operational history in a machine-readable form.
  assert.equal(isKnownPermission('interop.read'), true);

  const paths = routesGatedBy('interop.read').map((r) => r.path);
  for (const expected of [
    '/api/interop/epcis/route.ts',
    '/api/interop/asn/[shipmentId]/route.ts',
    '/api/interop/lineage/route.ts',
  ]) {
    assert.ok(paths.includes(expected), `${expected} must be gated by interop.read`);
  }

  // And nothing under /api/interop is gated by anything else — this is the
  // half that catches a NEW projection route added with a weaker gate.
  const manifest = JSON.parse(
    readFileSync(join(process.cwd(), 'docs/security/route-permissions.json'), 'utf8'),
  ) as { routes: Array<{ path: string; permission: string | null }> };
  for (const route of manifest.routes) {
    if (!route.path.startsWith('/api/interop/')) continue;
    assert.equal(
      route.permission,
      'interop.read',
      `${route.path} is under /api/interop but is gated by ${route.permission ?? 'nothing'}`,
    );
  }
});

test('regression: work_orders.claim gates the whole task desk — read, throw and edit', () => {
  // Increment 3 added GET beside the existing POST on /api/tasks, plus PATCH on /api/tasks/[id].
  assert.equal(isKnownPermission('work_orders.claim'), true);

  const list = routeByPath('/api/tasks/route.ts');
  assert.ok(list);
  assert.equal(list.permission, 'work_orders.claim');
  assert.deepEqual([...list.methods].sort(), ['GET', 'POST']);

  const edit = routeByPath('/api/tasks/[id]/route.ts');
  assert.ok(edit);
  assert.equal(edit.permission, 'work_orders.claim');
  assert.deepEqual(edit.methods, ['PATCH']);
});

test('regression: work_orders.claim gates the ticket-target resolver', () => {
  // The Daily composer's Ticket face resolves a helpdesk number through this route before POST /api/tasks anchors to it.
  const r = routeByPath('/api/tasks/ticket-target/route.ts');
  assert.ok(r, 'the ticket-target route should be in the manifest');
  assert.equal(r.permission, 'work_orders.claim');
  assert.deepEqual(r.methods, ['POST']);
});

test('regression: the Foundation 0 outbound slice keeps its gates', () => {
  // Acknowledge is an order mutation: it must require the same permission as
  // creating the order, never a read permission. The work projection is the
  // native clients' read seam and stays behind order visibility.
  const ack = routeByPath('/api/orders/[id]/acknowledge/route.ts');
  assert.ok(ack, 'the acknowledge route should be in the manifest');
  assert.equal(ack.permission, 'orders.create');
  assert.deepEqual(ack.methods, ['DELETE', 'POST']);
  const work = routeByPath('/api/v1/outbound/work/route.ts');
  assert.ok(work, 'the outbound work route should be in the manifest');
  assert.equal(work.permission, 'orders.view');
});

test('regression: admin.view gates the organization profile route (ship-from address write)', () => {
  // PATCH /api/admin/organization/profile writes settings.shipFrom — the origin
  // every ShipStation label is bought from. It must never drift off the admin gate.
  const paths = routesGatedBy('admin.view').map((r) => r.path);
  assert.ok(
    paths.some((p) => p.includes('/api/admin/organization/profile')),
    `expected /api/admin/organization/profile under admin.view, got ${paths.filter((p) => p.includes('organization')).join(', ')}`,
  );
});

test('regression: shipping.view gates the browser-fallback paperwork print route', () => {
  const r = routeByPath('/api/orders/print-packet/route.ts');
  assert.ok(r);
  assert.equal(r.permission, 'shipping.view');
  assert.deepEqual(r.methods, ['GET', 'POST']);
});

test('regression: shipping.view gates the ShipStation key health probe', () => {
  // The v1+v2 key probe decides whether an org's orders run through ShipStation
  // only (Google Sheets retired). Read-only; any shipping viewer may check it.
  const r = routeByPath('/api/integrations/shipstation/health/route.ts');
  assert.ok(r);
  assert.equal(r.permission, 'shipping.view');
  assert.deepEqual(r.methods, ['GET']);
});

test('regression: shipping.view gates the order label-purchase read', () => {
  // The To-ship evidence column's Label block: who bought which label, for how
  // much. Read-only, param route (requireRoutePerm), never ungated.
  const r = routeByPath('/api/orders/[id]/label-purchase/route.ts');
  assert.ok(r);
  assert.equal(r.gate, 'requireRoutePerm');
  assert.equal(r.permission, 'shipping.view');
  assert.deepEqual(r.methods, ['GET']);
});

test('regression: label pairing + price routes carry their gates (Link label, ticket, print proxy, price panel)', () => {
  // Link label searches ShipStation and writes the label ledger — the same
  // permission as buying one. Ticket links ride the helpdesk waist's gate.
  const pinned: Array<[string, string, string[]]> = [
    ['/api/orders/[id]/labels/route.ts', 'shipping.buy_label', ['GET', 'POST']],
    ['/api/orders/[id]/labels/[labelId]/route.ts', 'shipping.buy_label', ['DELETE']],
    ['/api/orders/[id]/labels/[labelId]/ticket/route.ts', 'integrations.zendesk', ['POST', 'DELETE']],
    ['/api/orders/[id]/labels/[labelId]/pdf/route.ts', 'shipping.view', ['GET']],
    ['/api/orders/[id]/price-breakdown/route.ts', 'orders.view', ['GET']],
  ];
  for (const [path, permission, methods] of pinned) {
    const r = routeByPath(path);
    assert.ok(r, `${path} should be in the manifest`);
    assert.equal(r.gate, 'requireRoutePerm', path);
    assert.equal(r.permission, permission, path);
    assert.deepEqual([...r.methods].sort(), [...methods].sort(), path);
  }
});

test('regression: assistant.chat gates every chat-sessions route (per-staff threads)', () => {
  const expected: Record<string, string[]> = {
    '/api/ai/chat-sessions/route.ts': ['GET'],
    '/api/ai/chat-sessions/[sessionId]/route.ts': ['DELETE', 'GET', 'PATCH'],
    '/api/ai/chat-sessions/[sessionId]/feedback/route.ts': ['POST'],
  };
  for (const [path, methods] of Object.entries(expected)) {
    const r = routeByPath(path);
    assert.ok(r, `${path} should be in the manifest`);
    assert.equal(r.permission, 'assistant.chat', `${path} permission`);
    assert.deepEqual(r.methods, methods, `${path} methods`);
  }
  assert.equal(routeByPath('/api/ai/chat-sessions/[sessionId]/messages/route.ts'), null);
});

test('regression: orders.view gates the import record reads (not admin.view, unlike /api/cron-runs)', () => {
  // Handoff import-history acceptance 4: staff with orders.view but not admin.view open the page.
  const paths = routesGatedBy('orders.view').map((r) => r.path);
  for (const path of ['/api/imports/runs/route.ts', '/api/imports/runs/[id]/route.ts', '/api/imports/rows/route.ts']) {
    assert.ok(paths.includes(path), `orders.view should gate ${path}`);
  }
  assert.equal(routeByPath('/api/imports/runs/[id]/route.ts')?.gate, 'requireRoutePerm');
});

test('regression: integrations.zendesk gates the support ticket link + create waist (repair anchor rides it)', () => {
  // The repair record's Link ticket / Create ticket verbs post the `repair`
  // anchor here; the anchor schemas are pinned in src/lib/schemas/support-tickets.test.ts.
  const pinned: Array<[string, string[]]> = [
    ['/api/support/tickets/link/route.ts', ['DELETE', 'GET', 'POST']],
    ['/api/support/tickets/route.ts', ['POST']],
  ];
  for (const [path, methods] of pinned) {
    const r = routeByPath(path);
    assert.ok(r, `${path} should be in the manifest`);
    assert.equal(r.gate, 'withAuth', path);
    assert.equal(r.permission, 'integrations.zendesk', path);
    assert.deepEqual(r.methods, methods, path);
  }
});

test('regression: inbound follow-ups read on receiving.view, write on the carton staff-notes permission', () => {
  const path = '/api/receiving/inbound-followups/route.ts';
  const r = routeByPath(path);
  assert.ok(r, `${path} should be in the manifest`);
  assert.equal(r.gate, 'withAuth');
  assert.equal(r.permission, 'receiving.view');
  assert.deepEqual(r.methods, ['GET', 'POST']);
  // The manifest records one permission per file; pin the POST gate from source.
  const source = readFileSync(join(process.cwd(), 'src/app', path), 'utf8');
  assert.match(source, /export const POST = withAuth\([^]*?permission: 'receiving\.mark_received'/);
});

test('regression: integrations.zendesk gates "Product sent to customer" (support_ticket_items + support product search)', () => {
  // The same permission that posts the reply the picks ride on; support staff
  // may lack orders.create, so the product search is NOT the intake route.
  const pinned: Array<[string, string, string[]]> = [
    ['/api/support/products/route.ts', 'withAuth', ['GET']],
    ['/api/support/tickets/[ticketId]/items/route.ts', 'requireRoutePerm', ['GET', 'POST']],
    ['/api/support/tickets/[ticketId]/items/[itemId]/route.ts', 'requireRoutePerm', ['DELETE']],
  ];
  for (const [path, gate, methods] of pinned) {
    const r = routeByPath(path);
    assert.ok(r, `${path} should be in the manifest`);
    assert.equal(r.gate, gate, path);
    assert.equal(r.permission, 'integrations.zendesk', path);
    assert.deepEqual(r.methods, methods, path);
  }
});

test('regression: movable racks read on sku_stock.view, write on sku_stock.manage (labels-printed is a view-level report)', () => {
  const pinned: Array<[string, string, string, string[]]> = [
    ['/api/racks/route.ts', 'withAuth', 'sku_stock.view', ['GET', 'POST']],
    ['/api/racks/[code]/route.ts', 'requireRoutePerm', 'sku_stock.view', ['GET']],
    ['/api/racks/[code]/move/route.ts', 'requireRoutePerm', 'sku_stock.manage', ['POST']],
    ['/api/racks/[code]/shelves/route.ts', 'requireRoutePerm', 'sku_stock.manage', ['POST']],
    ['/api/racks/[code]/labels-printed/route.ts', 'requireRoutePerm', 'sku_stock.view', ['POST']],
    ['/api/racks/adopt/route.ts', 'withAuth', 'sku_stock.manage', ['POST']],
  ];
  for (const [path, gate, permission, methods] of pinned) {
    const r = routeByPath(path);
    assert.ok(r, `${path} should be in the manifest`);
    assert.equal(r.gate, gate, path);
    assert.equal(r.permission, permission, path);
    assert.deepEqual(r.methods, methods, path);
  }
  // The manifest records one permission per file; pin the create gate from source.
  const source = readFileSync(join(process.cwd(), 'src/app/api/racks/route.ts'), 'utf8');
  assert.match(source, /export const POST = withAuth\([^]*?permission: 'sku_stock\.manage'/);
});

test('regression: carrier pickup cutoffs read on packing.view, replace on admin.manage_features', () => {
  // The Live feed's pickup countdowns read the set; changing it is org configuration.
  const paths = routesGatedBy('packing.view').map((r) => r.path);
  assert.ok(paths.includes('/api/live-feed/pickup-cutoffs/route.ts'), 'packing.view should gate the pickup-cutoffs read');
  const r = routeByPath('/api/live-feed/pickup-cutoffs/route.ts');
  assert.ok(r);
  assert.equal(r.gate, 'withAuth');
  assert.deepEqual(r.methods, ['GET', 'PUT']);
  // The manifest records one permission per file; pin the replace gate from source.
  const source = readFileSync(join(process.cwd(), 'src/app/api/live-feed/pickup-cutoffs/route.ts'), 'utf8');
  assert.match(source, /export const PUT = withAuth\([^]*?permission: 'admin\.manage_features'/);
});
