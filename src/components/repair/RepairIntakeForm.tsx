'use client';

import React, { useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, Wrench, X, Check, Printer } from '../Icons';
import { ProductSelector, type SelectedItem } from './ProductSelector';
import { ReasonSelector } from './ReasonSelector';
import { CustomerInfoForm, CONTACT_FIELDS } from './CustomerInfoForm';
import { SignaturePad, type SignatureData } from '@/components/ui/SignaturePad';
import RepairServiceForm from './RepairServiceForm';
import { RepairPaperworkCanvas } from './RepairPaperworkCanvas';
import {
    RepairIntakeStepper,
    type RepairIntakeStepKey,
} from './RepairIntakeStepper';
import { RepairPaperworkSheet } from './RepairPaperworkSheet';
import { TextField, Button, IconButton } from '@/design-system/primitives';
import { REPAIR_STEP_COPY, buildInitialFormData, isContactFieldValid, canSubmitRepairIntake, getRepairSubmitBlockReason, hasRepairIssue, isContactComplete, isProductSelected } from './repair-intake-logic';
import { useRepairIntakeData } from './useRepairIntakeData';
import { useRepairCustomerSearch, type ExistingCustomer } from './useRepairCustomerSearch';
import { buildRepairIntakeReceiptProps } from '@/lib/repair/repair-intake-receipt';
import { formatRepairSubmittedChromeLabel } from '@/lib/repair/repair-paper-ticket';
import { ACTION_DOCK_LIFT, ACTION_DOCK_TOP_GAP } from '@/design-system/tokens/dock-clearance';
import { focusRing } from '@/design-system/tokens/focus-ring';
import { cn } from '@/utils/_cn';



/** What the submit handler resolves with on a successful post, so the form can
 *  show the printable paper instead of dropping back to the walk-in dashboard. */
export interface RepairSubmitResult {
    id: number;
    rsNumber?: string | number | null;
    zendeskTicketNumber?: string | null;
    zendeskTicketUrl?: string | null;
}

interface RepairIntakeFormProps {
    onClose: () => void;
    /** Resolve with the created repair on success; resolve null/throw on failure. */
    onSubmit: (data: RepairFormData) => Promise<RepairSubmitResult | null | void>;
    initialData?: Partial<RepairFormData>;
    /** Headless kiosk variant (device principal, no staff session): */
    kioskMode?: boolean;
}

export interface RepairFormData {
    product: {
        type: string;
        model: string;
        sourceSku?: string | null;
    };
    repairReasons: string[];
    repairNotes: string;
    customer: {
        name: string;
        phone: string;
        email: string;
    };
    serialNumber: string;
    price: string;
    notes: string;
    assignedTechId: number | null;
    assignedTechName: string;
    signatureDataUrl?: string | null;
    signatureStrokes?: unknown[] | null;
}

const REPAIR_INTAKE_MAX_WIDTH = 'max-w-[720px]';
const SECTION_LABEL = 'text-role-micro text-text-soft';

export function RepairIntakeForm({ onClose, onSubmit, initialData, kioskMode = false }: RepairIntakeFormProps) {
    // The kiosk runs full-screen on a front-desk tablet, so the 720px staff-modal column left ~40% of the glass empty while the catalog…
    const columnMaxWidth = kioskMode ? 'max-w-[960px]' : REPAIR_INTAKE_MAX_WIDTH;
    const columnClass = `mx-auto w-full ${columnMaxWidth}`;

    const [currentStep, setCurrentStep] = useState<RepairIntakeStepKey>('product');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [submitError, setSubmitError] = useState<string | null>(null);
    const [showPaperwork, setShowPaperwork] = useState(false);
    const [submitted, setSubmitted] = useState<RepairSubmitResult | null>(null);

    const [formData, setFormData] = useState<RepairFormData>(() => buildInitialFormData(initialData));
    const [signatureData, setSignatureData] = useState<SignatureData | null>(null);
    const [selectedItems, setSelectedItems] = useState<SelectedItem[]>([]);

    const [customerMode, setCustomerMode] = useState<'existing' | 'new'>('new');
    const [customerQuery, setCustomerQuery] = useState('');
    const [selectedCustomerId, setSelectedCustomerId] = useState<number | null>(null);
    const [contactFieldIndex, setContactFieldIndex] = useState(0);

    // Per-SKU reasons follow the PICKED product now — a favorite is just a
    // pinned catalog row, so there is no curation id to key them off.
    const { techs, loadingTechs, skuIssues } = useRepairIntakeData(
        formData.product.sourceSku,
        kioskMode,
    );
    const { customerResults, loadingCustomers, customerSearchError } = useRepairCustomerSearch(
        !kioskMode && currentStep === 'contact' && customerMode === 'existing',
        customerQuery,
    );

    useEffect(() => {
        setFormData(buildInitialFormData(initialData));
    }, [initialData]);

    useEffect(() => {
        if (currentStep !== 'contact') {
            setContactFieldIndex(0);
        }
    }, [currentStep]);

    useEffect(() => {
        setContactFieldIndex(0);
    }, [customerMode]);

    // Single orchestrated reveal when the step (or contact field) changes — a quiet
    // settle, never on every keystroke. Honors prefers-reduced-motion via motion-reduce:.
    const [stepRevealed, setStepRevealed] = useState(true);
    useEffect(() => {
        setStepRevealed(false);
        const raf = requestAnimationFrame(() => setStepRevealed(true));
        return () => cancelAnimationFrame(raf);
    }, [currentStep, contactFieldIndex]);

    const productSelected = isProductSelected(formData);

    const canProceedFromProduct = productSelected;

    const canProceedFromIssue = hasRepairIssue(formData);

    const activeContactField = CONTACT_FIELDS[contactFieldIndex] ?? CONTACT_FIELDS[0];
    const isExistingSearch = currentStep === 'contact' && customerMode === 'existing';
    const canProceedFromContactField = isContactFieldValid(activeContactField, formData);
    const canProceedFromContact = isContactComplete(formData);
    const isLastContactField = contactFieldIndex >= CONTACT_FIELDS.length - 1;

    const canSubmit = canSubmitRepairIntake(formData, !!signatureData);

    const issueText =
        [...formData.repairReasons, formData.repairNotes ? formData.repairNotes : null]
            .filter(Boolean)
            .join(', ') || '';

    const today = new Date().toLocaleDateString('en-US', {
        month: '2-digit',
        day: '2-digit',
        year: 'numeric',
    });

    const handleSelectedItemsChange = (items: SelectedItem[]) => {
        setSelectedItems(items);
        if (items.length === 0) {
            setFormData((prev) => {
                if (prev.product.type === 'Other' && prev.product.model.trim()) return prev;
                return {
                    ...prev,
                    product: { type: '', model: '', sourceSku: null },
                };
            });
            return;
        }
        const model = items.map((i) => i.name).join(', ');
        const sku = items.map((i) => String(i.sku || '').trim()).find(Boolean) || null;
        const price = items.reduce((sum, i) => sum + (i.price ?? 0), 0);
        setFormData(prev => ({
            ...prev,
            product: { type: 'Bose Repair Service', model, sourceSku: sku },
            price: price > 0 ? price.toFixed(2) : prev.price,
        }));
    };

    const handleNext = () => {
        if (currentStep === 'product' && canProceedFromProduct) {
            setCurrentStep('issue');
        } else if (currentStep === 'issue' && canProceedFromIssue) {
            setCurrentStep('contact');
        } else if (currentStep === 'contact') {
            if (isExistingSearch) return;
            if (!isLastContactField) {
                setContactFieldIndex((prev) => prev + 1);
            } else if (canProceedFromContact) {
                setCurrentStep('review');
            }
        }
    };

    const handleBack = () => {
        if (currentStep === 'issue') setCurrentStep('product');
        else if (currentStep === 'contact') {
            if (contactFieldIndex > 0) {
                setContactFieldIndex((prev) => prev - 1);
            } else {
                setCurrentStep('issue');
            }
        } else if (currentStep === 'review') {
            setContactFieldIndex(CONTACT_FIELDS.length - 1);
            setCurrentStep('contact');
        }
    };

    const handleStepClick = (key: RepairIntakeStepKey) => {
        if (key === 'product') {
            setCurrentStep('product');
            return;
        }
        if (key === 'issue' && canProceedFromProduct) {
            setCurrentStep('issue');
            return;
        }
        if (key === 'contact' && canProceedFromProduct && canProceedFromIssue) {
            setContactFieldIndex(0);
            setCurrentStep('contact');
            return;
        }
        if (key === 'review' && canProceedFromProduct && canProceedFromIssue && canProceedFromContact) {
            setCurrentStep('review');
        }
    };

    const handleSubmit = async () => {
        if (!canSubmit || !signatureData) return;
        setIsSubmitting(true);
        setSubmitError(null);
        try {
            const result = await onSubmit({
                ...formData,
                signatureDataUrl: signatureData.dataUrl,
                signatureStrokes: signatureData.strokes,
            });
            // On success, hold the full-screen overlay and show the printable paper —
            // never reveal the walk-in dashboard to a waiting customer.
            if (result && Number.isFinite(result.id)) {
                setSubmitted(result);
            } else {
                setIsSubmitting(false);
            }
        } catch (error) {
            console.error('Error submitting form:', error);
            setSubmitError(
                error instanceof Error ? error.message : 'Error submitting repair form. Please try again.',
            );
            setIsSubmitting(false);
        }
    };

    const updateCustomer = (field: string, value: string) => {
        setFormData(prev => ({ ...prev, customer: { ...prev.customer, [field]: value } }));
    };

    const applyExistingCustomer = (customer: ExistingCustomer) => {
        setSelectedCustomerId(customer.id);
        setCustomerMode('new');
        setContactFieldIndex(0);
        setFormData((prev) => ({
            ...prev,
            customer: {
                name: customer.name || prev.customer.name,
                phone: customer.phone || '',
                email: customer.email || '',
            },
        }));
    };

    const receiptProps = buildRepairIntakeReceiptProps(formData, issueText, today);

    const stepCopy = REPAIR_STEP_COPY[currentStep];
    const stepTitle = stepCopy.title;
    const canGoBack = currentStep !== 'product' || contactFieldIndex > 0;

    const isReviewStep = currentStep === 'review';

    const primaryDisabled = isReviewStep
        ? !canSubmit || isSubmitting
        : currentStep === 'product'
            ? !canProceedFromProduct
            : currentStep === 'issue'
                ? !canProceedFromIssue
                : isExistingSearch
                    ? true
                    : !canProceedFromContactField;

    const primaryLabel = isReviewStep
        ? isSubmitting
            ? 'Submitting…'
            : 'Submit repair'
        : 'Continue';

    const primaryTitle = isReviewStep
        ? getRepairSubmitBlockReason(formData, !!signatureData)
        : primaryDisabled
            ? 'Complete the required fields to continue'
            : undefined;

    const stepNavButtonClass =
        'shrink-0 rounded-lg border border-border-soft transition-colors hover:border-border-strong';

    // Post-submit: the repair is persisted and the Zendesk ticket is created.
    // Stay full-screen and present the exact paper to print — the customer never
    // sees the walk-in dashboard, and staff print straight from here.
    if (submitted) {
        const chromeLabel = formatRepairSubmittedChromeLabel(submitted.zendeskTicketNumber);
        const printHref = `/api/repair-service/print/${submitted.id}`;
        const submittedReceiptProps = buildRepairIntakeReceiptProps(
            formData,
            issueText,
            today,
            submitted.zendeskTicketNumber ?? '',
        );

        return (
            <div className="relative flex h-full w-full flex-col bg-surface-sunken text-text-default">
                <header className="shrink-0 border-b border-border-hairline bg-surface-card">
                    <div className={`${columnClass} flex items-center justify-between gap-3 px-6 py-3`}>
                        <div className="flex min-w-0 items-center gap-2.5">
                            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-surface-inverse text-white">
                                <Check className="h-4 w-4" />
                            </span>
                            <div className="min-w-0">
                                <p className="truncate text-role-eyebrow text-text-faint sm:text-role-micro">
                                    Repair submitted
                                </p>
                                <h1 className="truncate text-sm font-semibold tracking-tight text-text-default sm:text-role-body">
                                    {chromeLabel}
                                </h1>
                            </div>
                        </div>
                        <IconButton
                            onClick={onClose}
                            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border-soft transition-colors hover:border-border-strong"
                            ariaLabel="Done"
                            icon={<X className="h-4 w-4" />}
                        />
                    </div>
                </header>

                <main className="min-h-0 flex-1 overflow-y-auto">
                    <div className="px-4 py-4 sm:px-6 sm:py-5">
                        <RepairPaperworkCanvas>
                            <RepairServiceForm {...submittedReceiptProps} surface="screen" />
                        </RepairPaperworkCanvas>
                    </div>
                </main>

                {/* Floating verbs on the receipt's own ground — no bar or rule behind them (owner 2026-10-03). */}
                <div className={`shrink-0 ${ACTION_DOCK_TOP_GAP} ${ACTION_DOCK_LIFT}`}>
                    <div className={`${columnClass} flex items-center gap-3 px-6`}>
                        {!kioskMode && submitted.zendeskTicketUrl ? (
                            <a
                                href={submitted.zendeskTicketUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="truncate text-role-micro text-text-soft underline-offset-2 hover:text-text-default hover:underline"
                            >
                                {submitted.zendeskTicketNumber ? `Ticket ${submitted.zendeskTicketNumber}` : 'View ticket'}
                            </a>
                        ) : null}
                        <div className="ml-auto flex items-center gap-2">
                            <Button
                                variant="secondary"
                                size="md"
                                onClick={onClose}
                            >
                                Done
                            </Button>
                            {!kioskMode && (
                            <Button
                                variant="brand"
                                size="md"
                                icon={<Printer className="h-4 w-4" />}
                                onClick={() => window.open(printHref, '_blank', 'noopener,noreferrer')}
                            >
                                Print document
                            </Button>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="relative flex h-full w-full flex-col bg-surface-card text-text-default">
            {/* Full-bleed chrome: */}
            <header className="shrink-0 border-b border-border-hairline">
                <div className="relative flex w-full items-center px-3 py-2.5 sm:px-4 sm:py-3">
                    <div className="relative z-10 flex shrink-0 items-center justify-start gap-1">
                        <div
                            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border-soft text-text-default"
                            aria-hidden
                        >
                            <Wrench className="h-4 w-4" />
                        </div>
                        {canGoBack ? (
                            <IconButton
                                size="lg"
                                onClick={handleBack}
                                className="rounded-lg border border-border-soft transition-colors hover:border-border-strong"
                                ariaLabel="Go back"
                                icon={<ChevronLeft className="h-4 w-4" />}
                            />
                        ) : null}
                    </div>

                    <div className="pointer-events-none absolute inset-x-0 top-1/2 z-0 flex -translate-y-1/2 justify-center px-14 sm:px-16">
                        {/* px-6 mirrors the body column's own inner padding — without it
                            the stepper sat 24px left of "Repair Intake" at every width,
                            because both share a max-width but only the body was inset. */}
                        <div className={`pointer-events-auto w-full ${columnMaxWidth} px-6`}>
                            <RepairIntakeStepper
                                compact
                                spread
                                currentStep={currentStep}
                                onStepClick={handleStepClick}
                                canNavigateTo={(key) => {
                                    if (key === 'product') return true;
                                    if (key === 'issue') return canProceedFromProduct;
                                    if (key === 'contact') return canProceedFromProduct && canProceedFromIssue;
                                    return canProceedFromProduct && canProceedFromIssue && canProceedFromContact;
                                }}
                            />
                        </div>
                    </div>

                    <div className="relative z-10 ml-auto flex shrink-0 items-center justify-end gap-1 sm:gap-2">
                        {/* Paperwork — every step (acceptance B). Close is rightmost escape. */}
                        <RepairPaperworkSheet
                            active={showPaperwork}
                            onToggle={() => setShowPaperwork((v) => !v)}
                        />
                        <IconButton
                            size="lg"
                            onClick={onClose}
                            className="rounded-lg border border-border-soft transition-colors hover:border-border-strong"
                            ariaLabel="Close"
                            icon={<X className="h-4 w-4" />}
                        />
                    </div>
                </div>
            </header>

            {/* Step body — single centered column, no sidebar split */}
            <main
                aria-labelledby="repair-intake-step-title"
                // scrollbar-gutter reserves the scroll track on BOTH edges, so this column stays centered on the same axis as the header stepper (which…
                className={`min-h-0 flex-1 overflow-y-auto [scrollbar-gutter:stable_both-edges] ${showPaperwork ? 'bg-surface-sunken' : ''}`}
            >
                {showPaperwork ? (
                    <div className="bg-surface-sunken px-4 py-4 sm:px-6 sm:py-5">
                        <RepairPaperworkCanvas>
                            <RepairServiceForm {...receiptProps} surface="screen" />
                        </RepairPaperworkCanvas>
                    </div>
                ) : (
                <div
                    className={`${columnClass} px-6 transition-all duration-300 ease-out motion-reduce:translate-y-0 motion-reduce:transition-none ${
                        currentStep === 'review' ? 'py-4' : 'py-8'
                    } ${
                        stepRevealed ? 'translate-y-0 opacity-100' : 'translate-y-1 opacity-0'
                    }`}
                >
                    {currentStep !== 'review' && currentStep !== 'contact' ? (
                        <div className="mb-6 flex items-start gap-3">
                            <div className="min-w-0 flex-1 space-y-1">
                                <p className="text-role-eyebrow text-text-faint">
                                    Repair Intake
                                </p>
                                <h1
                                    id="repair-intake-step-title"
                                    className="text-xl font-semibold tracking-tight text-text-default sm:text-2xl"
                                >
                                    {stepTitle}
                                </h1>
                                <p className="text-sm font-semibold text-text-soft">{stepCopy.subtitle}</p>
                            </div>
                            <IconButton
                                size="touch"
                                onClick={handleNext}
                                disabled={primaryDisabled}
                                className={stepNavButtonClass}
                                ariaLabel={primaryLabel}
                                title={primaryTitle}
                                icon={<ChevronRight className="h-5 w-5" />}
                            />
                        </div>
                    ) : currentStep === 'contact' ? (
                        <div className="mb-6 space-y-1">
                            <p className="text-role-eyebrow text-text-faint">
                                Repair Intake
                            </p>
                            <h1
                                id="repair-intake-step-title"
                                className="text-xl font-semibold tracking-tight text-text-default sm:text-2xl"
                            >
                                {stepTitle}
                            </h1>
                            <p className="text-sm font-semibold text-text-soft">{stepCopy.subtitle}</p>
                        </div>
                    ) : (
                        <h1 id="repair-intake-step-title" className="sr-only">
                            {stepTitle}
                        </h1>
                    )}

                    {currentStep === 'product' && (
                        // ONE picker, both principals.
                        <div className="relative space-y-8">
                            <ProductSelector
                                onSelect={(product) => setFormData(prev => ({ ...prev, product }))}
                                selectedProduct={formData.product.type ? formData.product : null}
                                onPriceChange={(price) => setFormData(prev => ({ ...prev, price }))}
                                selectedItems={selectedItems}
                                onSelectedItemsChange={handleSelectedItemsChange}
                                favoritesWorkspace="repair"
                                // Device principal reads/writes the same list
                                // through the kiosk twins; a staff session uses
                                // the default `/api/repair` pair.
                                apiBasePath={kioskMode ? '/api/kiosk/repair' : undefined}
                                hideManualEntry={kioskMode}
                                flowInPage={kioskMode}
                                fillHeight={!kioskMode}
                            />
                        </div>
                    )}

                    {currentStep === 'issue' && (
                        <div className="w-full space-y-7">
                            {productSelected && (
                                <div className="space-y-1">
                                    <p className={SECTION_LABEL}>Selected product</p>
                                    {/* A customer can drop off several devices, so this is either ONE product or a summary of many — clamp so the issue step keeps its rhythm. */}
                                    <p className="text-sm font-semibold text-text-default line-clamp-2 break-words text-pretty">{formData.product.model}</p>
                                </div>
                            )}

                            <ReasonSelector
                                selectedReasons={formData.repairReasons}
                                notes={formData.repairNotes}
                                onReasonsChange={(reasons) => setFormData(prev => ({ ...prev, repairReasons: reasons }))}
                                onNotesChange={(notes) => setFormData(prev => ({ ...prev, repairNotes: notes }))}
                                skuIssues={skuIssues}
                            />

                            {!kioskMode && (
                            <div className="space-y-2">
                                <label
                                    htmlFor="repair-tech-select"
                                    className={`block ${SECTION_LABEL}`}
                                >
                                    Assign technician <span className="font-semibold lowercase text-text-faint">(optional)</span>
                                </label>
                                <select
                                    id="repair-tech-select"
                                    value={formData.assignedTechId ?? ''}
                                    onChange={(e) => {
                                        const val = e.target.value;
                                        if (!val) {
                                            setFormData(prev => ({ ...prev, assignedTechId: null, assignedTechName: '' }));
                                            return;
                                        }
                                        const tech = techs.find(t => t.id === Number(val));
                                        setFormData(prev => ({
                                            ...prev,
                                            assignedTechId: Number(val),
                                            assignedTechName: tech?.name ?? '',
                                        }));
                                    }}
                                    disabled={loadingTechs}
                                    className={cn("h-11 w-full rounded-xl border border-border-soft bg-surface-card px-3.5 text-sm font-semibold text-text-default transition-all disabled:opacity-50", focusRing('field', 'neutral'))}
                                >
                                    <option value="">Unassigned</option>
                                    {techs.map(tech => (
                                        <option key={tech.id} value={tech.id}>{tech.name}</option>
                                    ))}
                                </select>
                            </div>
                            )}
                        </div>
                    )}

                    {currentStep === 'contact' && (
                        <div className="w-full space-y-6">
                            {!kioskMode && (
                            <div className="grid grid-cols-2 gap-2 rounded-xl border border-border-soft p-1">
                                <Button
                                    variant={customerMode === 'existing' ? 'brand' : 'ghost'}
                                    size="md"
                                    onClick={() => setCustomerMode('existing')}
                                    className="w-full"
                                >
                                    Existing
                                </Button>
                                <Button
                                    variant={customerMode === 'new' ? 'brand' : 'ghost'}
                                    size="md"
                                    onClick={() => setCustomerMode('new')}
                                    className="w-full"
                                >
                                    New
                                </Button>
                            </div>
                            )}

                            {!kioskMode && customerMode === 'existing' && (
                                <div className="space-y-3">
                                    <TextField
                                        label="Search customer"
                                        value={customerQuery}
                                        onChange={setCustomerQuery}
                                    />
                                    <div className="overflow-hidden rounded-xl border border-border-soft">
                                        <div className="grid grid-cols-[1fr_1fr_0.55fr] gap-2 border-b border-border-hairline bg-surface-canvas px-3 py-2 text-role-eyebrow text-text-soft">
                                            <span>Name</span>
                                            <span>Phone</span>
                                            <span className="text-right">Action</span>
                                        </div>
                                        <div className="max-h-40 overflow-y-auto">
                                            {loadingCustomers && (
                                                <div className="px-3 py-3 text-xs font-semibold text-text-faint">Loading…</div>
                                            )}
                                            {!loadingCustomers && customerSearchError && (
                                                <div className="px-3 py-3 text-xs font-semibold text-red-600">{customerSearchError}</div>
                                            )}
                                            {!loadingCustomers && !customerSearchError && customerResults.length === 0 && (
                                                <div className="px-3 py-3 text-xs font-semibold text-text-faint">No customers found.</div>
                                            )}
                                            {!loadingCustomers && !customerSearchError && customerResults.map((customer) => (
                                                <div
                                                    key={customer.id}
                                                    className={`grid grid-cols-[1fr_1fr_0.55fr] gap-2 border-b border-border-hairline px-3 py-2.5 text-xs ${
                                                        selectedCustomerId === customer.id ? 'bg-surface-canvas' : 'bg-surface-card'
                                                    }`}
                                                >
                                                    <span className="truncate font-semibold text-text-default">{customer.name}</span>
                                                    <span className="truncate text-text-muted">{customer.phone || '—'}</span>
                                                    <div className="text-right">
                                                        <Button
                                                            variant="brand"
                                                            size="sm"
                                                            onClick={() => applyExistingCustomer(customer)}
                                                        >
                                                            Select
                                                        </Button>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            )}

                            {!isExistingSearch && (
                                <div className="flex items-start gap-3">
                                    <IconButton
                                        size="touch"
                                        onClick={handleBack}
                                        disabled={!canGoBack}
                                        className={`mt-7 ${stepNavButtonClass}`}
                                        ariaLabel="Go back"
                                        icon={<ChevronLeft className="h-5 w-5" />}
                                    />
                                    <div className="min-w-0 flex-1">
                                        <CustomerInfoForm
                                            customer={formData.customer}
                                            serialNumber={formData.serialNumber}
                                            price={formData.price}
                                            notes={formData.notes}
                                            activeField={activeContactField}
                                            fieldIndex={contactFieldIndex}
                                            fieldCount={CONTACT_FIELDS.length}
                                            onCustomerChange={updateCustomer}
                                            onSerialNumberChange={(value) => setFormData(prev => ({ ...prev, serialNumber: value }))}
                                            onPriceChange={(value) => setFormData(prev => ({ ...prev, price: value }))}
                                            onNotesChange={(value) => setFormData(prev => ({ ...prev, notes: value }))}
                                        />
                                    </div>
                                    <IconButton
                                        size="touch"
                                        onClick={handleNext}
                                        disabled={primaryDisabled}
                                        className={`mt-7 ${stepNavButtonClass}`}
                                        ariaLabel={primaryLabel}
                                        title={primaryTitle}
                                        icon={<ChevronRight className="h-5 w-5" />}
                                    />
                                </div>
                            )}
                        </div>
                    )}

                    {currentStep === 'review' && (
                        <div className="w-full">
                            {/* ds-allow-raw-neutral: print ink — literal black-on-white output */}
                            <div className="w-full border border-black bg-surface-card">
                                <RepairServiceForm {...receiptProps} density="compact" />

                                {/* ds-allow-raw-neutral: print ink — literal black-on-white output */}
                                <div className="border-t border-black px-4 py-3">
                                    <p className="text-xs leading-relaxed text-text-soft">
                                        By signing below, the customer consents to conduct this transaction electronically
                                        and agrees to the listed repair price, terms, and any unexpected delays.
                                    </p>

                                    {submitError && (
                                        <p
                                            role="alert"
                                            className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-700"
                                        >
                                            {submitError}
                                        </p>
                                    )}
                                </div>

                                {/* ds-allow-raw-neutral: print ink — literal black-on-white output */}
                                <div className="h-[200px] overflow-hidden border-t border-black bg-surface-card">
                                    <SignaturePad
                                        onSignatureChange={(data) => {
                                            setSignatureData(data);
                                            if (data) setSubmitError(null);
                                        }}
                                        fillHeight
                                        variant="dropoff"
                                    />
                                </div>
                            </div>

                            {signatureData && (
                                <div className="mt-3 flex items-center gap-2 text-role-micro text-text-muted">
                                    <span className="flex h-4 w-4 items-center justify-center rounded-full bg-surface-inverse">
                                        <Check className="h-2.5 w-2.5 text-white" />
                                    </span>
                                    Signature captured
                                </div>
                            )}

                            <div className="mt-4 flex justify-end">
                                <Button
                                    variant="brand"
                                    size="md"
                                    onClick={() => void handleSubmit()}
                                    disabled={primaryDisabled}
                                    title={primaryTitle}
                                >
                                    {primaryLabel}
                                </Button>
                            </div>
                        </div>
                    )}
                </div>
                )}
            </main>
        </div>
    );
}
