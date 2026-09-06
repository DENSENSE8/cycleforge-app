import { NextRequest, NextResponse } from 'next/server';
import { tenantQuery } from '@/lib/tenancy/db';
import { withAuth } from '@/lib/auth/withAuth';
import { checkRateLimitForOrg } from '@/lib/api-guard';

function incrementSkuCounting(currentCounting: string) {
    const firstChar = currentCounting.charAt(0);
    const lastTwo = currentCounting.substring(1);
    const number = parseInt(lastTwo);
    const isFirstCharLetter = /[A-Z]/.test(firstChar);

    if (isFirstCharLetter) {
        if (number < 99) {
            return firstChar + String(number + 1).padStart(2, '0');
        } else {
            if (firstChar === 'Z') {
                return '0A0';
            } else {
                const nextLetter = String.fromCharCode(firstChar.charCodeAt(0) + 1);
                return nextLetter + '00';
            }
        }
    } else if (/^\d[A-Z]\d$/.test(currentCounting)) {
        const middleChar = currentCounting.charAt(1);
        const lastDigit = parseInt(currentCounting.charAt(2));
        if (lastDigit < 9) {
            return firstChar + middleChar + (lastDigit + 1);
        } else {
            if (middleChar === 'Z') {
                const firstDigit = parseInt(firstChar);
                if (firstDigit < 9) {
                    return (firstDigit + 1) + 'A0';
                } else {
                    return '00A';
                }
            } else {
                const nextLetter = String.fromCharCode(middleChar.charCodeAt(0) + 1);
                return firstChar + nextLetter + '0';
            }
        }
    } else {
        const lastChar = currentCounting.charAt(2);
        const firstTwoDigits = parseInt(currentCounting.substring(0, 2));
        if (lastChar === 'Z') {
            if (firstTwoDigits < 99) {
                return String(firstTwoDigits + 1).padStart(2, '0') + 'A';
            } else {
                return 'A00';
            }
        } else {
            const nextLetter = String.fromCharCode(lastChar.charCodeAt(0) + 1);
            return currentCounting.substring(0, 2) + nextLetter;
        }
    }
}

/**
 * Allocates and persists the next SKU counter for `baseSku` in `orgId`. The
 * single write path for the counter — POST and the deprecated
 * `GET ?action=increment` both go through here, so the sequence can only ever
 * be advanced in one place.
 */
async function allocateNextSku(
    orgId: string,
    baseSku: string,
): Promise<{ nextSku: string; currentSku: string }> {
    // sku_management has no organization_id column in the WHERE (NEEDS-COL):
    // scope via the session GUC only (tenantQuery).
    const result = await tenantQuery(orgId, 'SELECT * FROM sku_management WHERE base_sku = $1', [baseSku]);
    const skuRecord = result.rows[0];

    if (skuRecord) {
        const nextCounting = incrementSkuCounting(skuRecord.current_sku_counting);
        // GUC-wrapped write — sku_management is NEEDS-COL so there is no
        // organization_id to stamp or to add to the WHERE clause.
        await tenantQuery(
            orgId,
            'UPDATE sku_management SET current_sku_counting = $1, updated_at = CURRENT_TIMESTAMP WHERE base_sku = $2',
            [nextCounting, baseSku]
        );
        return { nextSku: `${baseSku}:${nextCounting}`, currentSku: `${baseSku}:${nextCounting}` };
    }

    // First time - set to A01 (since A00 was just used).
    // sku_management grew an organization_id column (2026-06-14 phase-B
    // needs-col-2) with a GUC-or-USAV default. tenantQuery sets the GUC so the
    // default would stamp correctly, but stamp explicitly to match the project
    // convention and survive a future GUC-only default restore for tenant #2.
    await tenantQuery(
        orgId,
        'INSERT INTO sku_management (base_sku, current_sku_counting, organization_id) VALUES ($1, $2, $3::uuid)',
        [baseSku, 'A01', orgId]
    );
    return { nextSku: `${baseSku}:A01`, currentSku: `${baseSku}:A01` };
}

/**
 * Allocation is a state mutation, so POST owns it. Same response shape as the
 * legacy `GET ?action=increment` ({ nextSku, currentSku }) so a caller can be
 * switched over by changing only the method. `baseSku` from the JSON body,
 * falling back to the query string.
 */
export const POST = withAuth(async (request: NextRequest, ctx) => {
    try {
        const orgId = ctx.organizationId;
        const body: unknown = await request.json().catch(() => null);
        const bodySku =
            body && typeof body === 'object' && 'baseSku' in body && typeof body.baseSku === 'string'
                ? body.baseSku
                : null;
        const baseSku = bodySku || new URL(request.url).searchParams.get('baseSku');

        if (!baseSku) {
            return NextResponse.json({ error: 'Missing baseSku parameter' }, { status: 400 });
        }

        const rate = await checkRateLimitForOrg({
            headers: request.headers,
            routeKey: 'sku-manager-allocate',
            limit: 60,
            windowMs: 60_000,
            organizationId: orgId,
        });
        if (!rate.ok) {
            return NextResponse.json(
                { error: 'Rate limit exceeded' },
                { status: 429, headers: rate.retryAfterSec ? { 'Retry-After': String(rate.retryAfterSec) } : undefined }
            );
        }

        return NextResponse.json(await allocateNextSku(orgId, baseSku));
    } catch (error) {
        console.error('SKU Manager error:', error);
        const details = error instanceof Error ? error.message : String(error);
        return NextResponse.json({ error: 'Internal Server Error', details }, { status: 500 });
    }
}, { permission: 'sku_stock.manage' });

// GET ?action=current is the read. GET ?action=increment is DEPRECATED — it
// mutates (allocates the next counter) on a safe method, so a prefetch or
// crawler burns SKU numbers. It is kept working because the station flow still
// calls it (no in-repo caller remains to migrate), but it is now throttled and
// warns on every use. Both actions stay gated to sku_stock.manage.
export const GET = withAuth(async (request: NextRequest, ctx) => {
    try {
        const { searchParams } = new URL(request.url);
        const baseSku = searchParams.get('baseSku');
        const action = searchParams.get('action') || 'current';

        if (!baseSku) {
            return NextResponse.json({ error: 'Missing baseSku parameter' }, { status: 400 });
        }

        const orgId = ctx.organizationId;

        if (action === 'current') {
            // Return the current SKU from DB (the one that will be used next).
            // GUC-scoped read (tenantQuery); sku_management is NEEDS-COL so
            // there is no explicit org filter to add.
            const result = await tenantQuery(orgId, 'SELECT * FROM sku_management WHERE base_sku = $1', [baseSku]);
            const skuRecord = result.rows[0];
            if (skuRecord) {
                return NextResponse.json({ currentSku: `${baseSku}:${skuRecord.current_sku_counting}` });
            }
            // First time using this SKU - return A00 (will be created on first increment)
            return NextResponse.json({ currentSku: `${baseSku}:A00` });
        }

        if (action === 'increment') {
            console.warn(
                '[sku-manager] DEPRECATED: GET ?action=increment mutates state — migrate the caller to POST /api/sku-manager { baseSku }',
            );

            const rate = await checkRateLimitForOrg({
                headers: request.headers,
                routeKey: 'sku-manager-allocate',
                limit: 60,
                windowMs: 60_000,
                organizationId: orgId,
            });
            if (!rate.ok) {
                return NextResponse.json(
                    { error: 'Rate limit exceeded' },
                    { status: 429, headers: rate.retryAfterSec ? { 'Retry-After': String(rate.retryAfterSec) } : undefined }
                );
            }

            return NextResponse.json(await allocateNextSku(orgId, baseSku), {
                headers: { Deprecation: 'true', Link: '</api/sku-manager>; rel="successor-version"' },
            });
        }

        return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    } catch (error) {
        console.error('SKU Manager error:', error);
        const details = error instanceof Error ? error.message : String(error);
        return NextResponse.json({ error: 'Internal Server Error', details }, { status: 500 });
    }
}, { permission: 'sku_stock.manage' });

