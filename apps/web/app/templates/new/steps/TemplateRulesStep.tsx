'use client';

import { useState } from 'react';
import type { Slot, Constraint } from '../page';
import SlotSection from '../components/SlotSection';
import ConstraintSection from '../components/ConstraintSection';

interface TemplateRulesStepProps {
  slots: Slot[];
  setSlots: (slots: Slot[]) => void;
  constraints: Constraint[];
  setConstraints: (constraints: Constraint[]) => void;
}

export default function TemplateRulesStep({
  slots,
  setSlots,
  constraints,
  setConstraints,
}: TemplateRulesStepProps) {
  const [selectedSlotIndex, setSelectedSlotIndex] = useState<number | null>(null);
  const availableCategories = slots.flatMap((s) => s.accepts).filter((v, i, a) => a.indexOf(v) === i).sort();
  const slotNames = slots.map((s) => s.slot_name).sort();

  return (
    <div className="card form-card">
      <h2>Rules Configuration</h2>

      <SlotSection
        slots={slots}
        setSlots={setSlots}
        selectedSlotIndex={selectedSlotIndex}
        setSelectedSlotIndex={setSelectedSlotIndex}
      />

      <ConstraintSection
        constraints={constraints}
        setConstraints={setConstraints}
        availableCategories={availableCategories}
        slotNames={slotNames}
      />
    </div>
  );
}
