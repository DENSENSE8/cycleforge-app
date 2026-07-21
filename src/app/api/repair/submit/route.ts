import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/withAuth';
import { submitRepairIntake, RepairIntakeValidationError } from '@/lib/repair/submit-repair-intake';

export const POST = withAuth(async (req: NextRequest, ctx) => {
    try {
        const body = await req.json();
        const idempotencyKey = req.headers.get('Idempotency-Key')?.trim() || undefined;
        const result = await submitRepairIntake({ ...body, idempotencyKey }, ctx.organizationId);
        return NextResponse.json(result);
    } catch (error: unknown) {
        if (error instanceof RepairIntakeValidationError) {
            return NextResponse.json({ error: error.message }, { status: 400 });
        }
        console.error('Error submitting repair form:', error);
        const message = error instanceof Error ? error.message : 'Failed to submit repair form';
        return NextResponse.json({
            error: message,
            details: message,
        }, { status: 500 });
    }
}, { permission: 'repair.intake' });
