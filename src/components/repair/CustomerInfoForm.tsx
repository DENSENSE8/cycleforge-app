'use client';

import React from 'react';
import { TextField } from '@/design-system/primitives';

export type ContactFieldKey = 'name' | 'phone' | 'email' | 'extras';

export const CONTACT_FIELDS: readonly ContactFieldKey[] = [
    'name',
    'phone',
    'email',
    'extras',
];

interface CustomerInfoFormBase {
    customer: {
        name: string;
        phone: string;
        email: string;
    };
    serialNumber: string;
    price: string;
    notes: string;
    onCustomerChange: (field: string, value: string) => void;
    onSerialNumberChange: (value: string) => void;
    onPriceChange: (value: string) => void;
    onNotesChange: (value: string) => void;
}

interface CustomerInfoFormStepProps extends CustomerInfoFormBase {
    layout?: 'step';
    activeField: ContactFieldKey;
    fieldIndex: number;
    fieldCount: number;
}

interface CustomerInfoFormAllProps extends CustomerInfoFormBase {
    layout: 'all';
    activeField?: never;
    fieldIndex?: never;
    fieldCount?: never;
}

type CustomerInfoFormProps = CustomerInfoFormStepProps | CustomerInfoFormAllProps;

function formatPhoneInput(value: string): string {
    const cleaned = value.replace(/\D/g, '');
    if (cleaned.length >= 10) {
        return `${cleaned.slice(0, 3)}-${cleaned.slice(3, 6)}-${cleaned.slice(6, 10)}`;
    }
    if (cleaned.length > 6) {
        return `${cleaned.slice(0, 3)}-${cleaned.slice(3, 6)}-${cleaned.slice(6)}`;
    }
    if (cleaned.length > 3) {
        return `${cleaned.slice(0, 3)}-${cleaned.slice(3)}`;
    }
    return cleaned;
}

function fieldLabelFor(activeField: ContactFieldKey): string {
    if (activeField === 'name') return 'Customer Name';
    if (activeField === 'phone') return 'Phone Number';
    if (activeField === 'email') return 'Email (optional)';
    return 'Repair Details';
}

export function CustomerInfoForm(props: CustomerInfoFormProps) {
    const {
        customer,
        serialNumber,
        price,
        notes,
        onCustomerChange,
        onSerialNumberChange,
        onPriceChange,
        onNotesChange,
    } = props;
    const showAll = props.layout === 'all';

    const handlePhoneChange = (value: string) => {
        onCustomerChange('phone', formatPhoneInput(value));
    };

    const nameField = (
        <TextField
            label="Customer Name"
            value={customer.name}
            onChange={(value) => onCustomerChange('name', value)}
            autoComplete="name"
            autoFocus={!showAll}
            tone="neutral"
        />
    );

    const phoneField = (
        <TextField
            label="Phone Number"
            value={customer.phone}
            onChange={handlePhoneChange}
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            maxLength={12}
            autoFocus={!showAll}
            tone="neutral"
        />
    );

    const emailField = (
        <TextField
            label="Email (optional)"
            value={customer.email}
            onChange={(value) => onCustomerChange('email', value)}
            type="email"
            autoComplete="email"
            inputClassName="lowercase"
            autoFocus={!showAll}
            tone="neutral"
        />
    );

    const extrasFields = (
        <div className="space-y-4">
            <TextField
                label="Serial Number"
                value={serialNumber}
                onChange={onSerialNumberChange}
                mono
                autoFocus={!showAll}
                tone="neutral"
            />

            <TextField
                label="Price ($)"
                value={price}
                onChange={onPriceChange}
                inputMode="decimal"
                required
                tone="emerald"
                inputClassName="font-semibold text-emerald-600"
            />

            <TextField
                label="Notes (optional)"
                value={notes}
                onChange={onNotesChange}
                multiline
                rows={3}
                tone="neutral"
            />
        </div>
    );

    if (showAll) {
        return (
            <div className="space-y-4">
                {nameField}
                {phoneField}
                {emailField}
                {extrasFields}
            </div>
        );
    }

    const activeField = props.activeField;
    const fieldIndex = props.fieldIndex;
    const fieldCount = props.fieldCount;

    return (
        <div className="space-y-4">
            <p className="text-role-micro uppercase tracking-[0.16em] text-text-faint">
                {fieldIndex + 1} of {fieldCount} · {fieldLabelFor(activeField)}
            </p>

            {activeField === 'name' && nameField}
            {activeField === 'phone' && phoneField}
            {activeField === 'email' && emailField}
            {activeField === 'extras' && extrasFields}
        </div>
    );
}
