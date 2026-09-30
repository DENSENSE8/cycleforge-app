'use client';

import React from 'react';
import { TextField } from '@/design-system/primitives';
import { formatKioskPhoneInput } from '@/lib/kiosk/phone';

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
        onCustomerChange('phone', formatKioskPhoneInput(value));
    };

    const nameField = (
        <TextField
            label="Customer Name"
            value={customer.name}
            onChange={(value) => onCustomerChange('name', value)}
            autoComplete="name"
            autoFocus={!showAll}
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
            />

            <TextField
                label="Price ($)"
                value={price}
                onChange={onPriceChange}
                inputMode="decimal"
                required
                inputClassName="font-semibold text-emerald-600"
            />

            <TextField
                label="Notes (optional)"
                value={notes}
                onChange={onNotesChange}
                multiline
                rows={3}
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
            {/*
              Position only. The field under this line already names itself
              ("Phone Number"), so repeating that name here printed it twice
              above the input. One visible name per field — the field's own.
            */}
            <p className="text-role-micro text-text-faint" data-testid="repair-contact-field-position">
                {fieldIndex + 1} of {fieldCount}
            </p>

            {activeField === 'name' && nameField}
            {activeField === 'phone' && phoneField}
            {activeField === 'email' && emailField}
            {activeField === 'extras' && extrasFields}
        </div>
    );
}
