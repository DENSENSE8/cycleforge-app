/** POST /api/pipeline/promote */

import { trainingRuns, modelVersions } from '@/lib/drizzle/schema';
import { and, eq, desc } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/withAuth';
import { withTenantDrizzle } from '@/lib/drizzle/tenant-db';
import type { OrgId } from '@/lib/tenancy/constants';

export const runtime = 'nodejs';

export const POST = withAuth(async (_req, ctx) => {
  const orgId: OrgId = ctx.organizationId;
  return await withTenantDrizzle(orgId, async (tx) => {
  // Get latest completed training run
  const latestRun = await tx
    .select()
    .from(trainingRuns)
    .where(and(eq(trainingRuns.organizationId, orgId), eq(trainingRuns.status, 'completed')))
    .orderBy(desc(trainingRuns.completedAt))
    .limit(1);

  if (!latestRun[0]) {
    return NextResponse.json({
      ok: true,
      promoted: false,
      reason: 'No completed training runs found',
    });
  }

  const run = latestRun[0];

  // Get currently promoted model
  const currentModel = await tx
    .select()
    .from(modelVersions)
    .where(and(eq(modelVersions.organizationId, orgId), eq(modelVersions.promoted, true)))
    .limit(1);

  const current = currentModel[0];

  // Check if this run already has a version registered
  const existingVersion = await tx
    .select()
    .from(modelVersions)
    .where(and(eq(modelVersions.organizationId, orgId), eq(modelVersions.runId, run.id)))
    .limit(1);

  // Decision: promote if no current model, or if new loss is lower
  const currentLoss = current?.evalScore ? parseFloat(current.evalScore) : Infinity;
  const newLoss = run.trainLoss ? parseFloat(run.trainLoss) : Infinity;

  if (current && newLoss >= currentLoss) {
    return NextResponse.json({
      ok: true,
      promoted: false,
      reason: `New loss (${newLoss.toFixed(4)}) >= current (${currentLoss.toFixed(4)})`,
      currentVersion: current.version,
    });
  }

  // Demote current model
  if (current) {
    await tx.update(modelVersions)
      .set({ promoted: false })
      .where(and(eq(modelVersions.organizationId, orgId), eq(modelVersions.id, current.id)));
  }

  // Promote new version (create if needed, or update existing)
  if (existingVersion[0]) {
    await tx.update(modelVersions)
      .set({
        promoted: true,
        promotedAt: new Date(),
        evalScore: run.trainLoss,
      })
      .where(and(eq(modelVersions.organizationId, orgId), eq(modelVersions.id, existingVersion[0].id)));

    return NextResponse.json({
      ok: true,
      promoted: true,
      version: existingVersion[0].version,
      previousVersion: current?.version ?? null,
      adapterPath: existingVersion[0].adapterPath,
      reason: current
        ? `Improved: ${newLoss.toFixed(4)} < ${currentLoss.toFixed(4)}`
        : 'First model promoted',
    });
  }

  // Create new version entry
  const versionNum = current
    ? parseInt(current.version.replace('v', ''), 10) + 1
    : 1;
  const version = `v${versionNum}`;

  await tx.insert(modelVersions).values({
    organizationId: orgId,
    runId: run.id,
    version,
    baseModel: run.baseModel,
    adapterPath: run.adapterPath || '',
    evalScore: run.trainLoss,
    promoted: true,
    promotedAt: new Date(),
  });

  return NextResponse.json({
    ok: true,
    promoted: true,
    version,
    previousVersion: current?.version ?? null,
    adapterPath: run.adapterPath,
    reason: current
      ? `Improved: ${newLoss.toFixed(4)} < ${currentLoss.toFixed(4)}`
      : 'First model promoted',
  });
  });
}, { permission: 'admin.manage_features' });
