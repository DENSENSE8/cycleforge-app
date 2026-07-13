'use client';

import { useState, useEffect } from 'react';
import { ConditionPills } from '@/components/receiving/workspace/ConditionPills';

export type ConditionGrade = 'BRAND_NEW' | 'LIKE_NEW' | 'REFURBISHED' | 'USED_A' | 'USED_B' | 'USED_C' | 'PARTS';

// Shipped orders historically stored the coarse 3-grade scale (NEW / USED /
// PARTS); receiving switched to the 5-grade BRAND_NEW / USED_A/B/C / PARTS
// scale. This maps legacy values forward so the picker can show the right
// pill for existing rows. Unmapped values default to USED_B (the most
// neutral "in service" grade).
export function normalizeCondition(value: string | null | undefined): ConditionGrade {
  const normalized = String(value || '').trim().toUpperCase().replace(/[\s-]+/g, '_');
  if (normalized === 'BRAND_NEW' || normalized === 'NEW') return 'BRAND_NEW';
  if (normalized === 'LIKE_NEW') return 'LIKE_NEW';
  if (normalized === 'REFURBISHED' || normalized === 'REFURB') return 'REFURBISHED';
  if (normalized === 'USED_A') return 'USED_A';
  if (normalized === 'USED_B' || normalized === 'USED') return 'USED_B';
  if (normalized === 'USED_C') return 'USED_C';
  if (normalized === 'PARTS' || normalized === 'PARTS_USED') return 'PARTS';
  return 'USED_B';
}

interface StationConditionEditorProps {
  condition: string | null | undefined;
  onChange: (nextCondition: string) => Promise<void> | void;
  isLocked?: boolean;
  collapsible?: boolean;
}

export function StationConditionEditor({
  condition,
  onChange,
  isLocked = false,
  collapsible = false,
}: StationConditionEditorProps) {
  const [conditionValue, setConditionValue] = useState<ConditionGrade>(normalizeCondition(condition));
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    setConditionValue(normalizeCondition(condition));
  }, [condition]);

  const handleChange = async (nextCondition: string) => {
    if (isLocked || isSaving) return;
    const grade = normalizeCondition(nextCondition);
    setConditionValue(grade);
    setIsSaving(true);
    try {
      await onChange(grade);
    } catch (error) {
      console.error('Failed to update condition:', error);
      // Revert on failure
      setConditionValue(normalizeCondition(condition));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="relative">
      {isSaving ? (
        <div className="absolute -top-4 right-0 flex justify-end">
          <span className="text-role-micro uppercase tracking-wide text-text-info animate-pulse">Saving</span>
        </div>
      ) : null}
      <ConditionPills
        value={conditionValue}
        onChange={handleChange}
        readOnly={isLocked}
        collapsible={collapsible}
      />
    </div>
  );
}
