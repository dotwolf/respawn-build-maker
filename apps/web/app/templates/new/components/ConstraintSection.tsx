'use client';

import { useState } from 'react';
import type { Constraint } from '../page';

interface ConstraintSectionProps {
  constraints: Constraint[];
  setConstraints: (constraints: Constraint[]) => void;
  availableCategories: string[];
  slotNames: string[];
}

export default function ConstraintSection({
  constraints,
  setConstraints,
  availableCategories,
  slotNames,
}: ConstraintSectionProps) {
  const [constraintType, setConstraintType] = useState<Constraint['type']>('seal');
  const [sealCategory, setSealCategory] = useState('');
  const [sealSlot, setSealSlot] = useState('');
  const [mutexSlotA, setMutexSlotA] = useState('');
  const [mutexSlotB, setMutexSlotB] = useState('');
  const [globalLimitCategory, setGlobalLimitCategory] = useState('');
  const [globalLimitValue, setGlobalLimitValue] = useState(1);
  const [uniqueCategory, setUniqueCategory] = useState('');
  const [poolUniqueCategory, setPoolUniqueCategory] = useState('');
  const [poolUniqueValue, setPoolUniqueValue] = useState(1);

  const handleAddConstraint = () => {
    let newConstraint: Constraint | null = null;

    if (constraintType === 'seal') {
      if (!sealCategory || !sealSlot) return;
      newConstraint = {
        type: 'seal',
        if_category: sealCategory,
        seals_slot: sealSlot,
      };
      setSealCategory('');
      setSealSlot('');
    } else if (constraintType === 'mutual_exclusion') {
      if (!mutexSlotA || !mutexSlotB || mutexSlotA === mutexSlotB) return;
      newConstraint = {
        type: 'mutual_exclusion',
        slots: [mutexSlotA, mutexSlotB] as [string, string],
      };
      setMutexSlotA('');
      setMutexSlotB('');
    } else if (constraintType === 'global_limit') {
      if (!globalLimitCategory || globalLimitValue < 1) return;
      newConstraint = {
        type: 'global_limit',
        category: globalLimitCategory,
        limit: globalLimitValue,
      };
      setGlobalLimitCategory('');
      setGlobalLimitValue(1);
    } else if (constraintType === 'unique') {
      if (!uniqueCategory) return;
      newConstraint = {
        type: 'unique',
        category: uniqueCategory,
      };
      setUniqueCategory('');
    } else if (constraintType === 'pool_unique') {
      if (!poolUniqueCategory || poolUniqueValue < 1) return;
      newConstraint = {
        type: 'pool_unique',
        category: poolUniqueCategory,
        limit: poolUniqueValue,
      };
      setPoolUniqueCategory('');
      setPoolUniqueValue(1);
    }

    if (newConstraint) {
      setConstraints([...constraints, newConstraint]);
    }
  };

  const handleDeleteConstraint = (index: number) => {
    setConstraints(constraints.filter((_, i) => i !== index));
  };

  const renderConstraintDisplay = (constraint: Constraint) => {
    if (constraint.type === 'seal') {
      return `If ${constraint.if_category} is equipped → seal ${constraint.seals_slot}`;
    }
    if (constraint.type === 'mutual_exclusion') {
      return `${constraint.slots?.[0]} and ${constraint.slots?.[1]} are mutually exclusive`;
    }
    if (constraint.type === 'global_limit') {
      return `${constraint.category} can be used at most ${constraint.limit} times across all slots`;
    }
    if (constraint.type === 'unique') {
      return `${constraint.category} can only appear once in the build`;
    }
    if (constraint.type === 'pool_unique') {
      return `${constraint.category} can fill up to ${constraint.limit} slots, but no duplicate components`;
    }
    return '';
  };

  return (
    <section className="rules-section">
      <div className="panel-header">
        <div>
          <h3>Slot Constraints</h3>
          <p className="panel-subtitle">Layer in the rules that shape build compatibility.</p>
        </div>
      </div>

      {constraints.length > 0 && (
        <div className="constraint-list">
          {constraints.map((constraint, idx) => (
            <div key={idx} className="constraint-item">
              <p>{renderConstraintDisplay(constraint)}</p>
              <button
                type="button"
                onClick={() => handleDeleteConstraint(idx)}
                className="secondary small"
              >
                Delete
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="add-constraint-form">
        <h4>Add Constraint</h4>

        <label>
          Constraint type
          <select
            value={constraintType}
            onChange={(e) => setConstraintType(e.target.value as Constraint['type'])}
          >
            <option value="seal">Seal (category seals slot)</option>
            <option value="mutual_exclusion">Mutual Exclusion (two slots cannot coexist)</option>
            <option value="global_limit">Global Limit (category usage limit)</option>
            <option value="unique">Unique (category appears only once)</option>
            <option value="pool_unique">Pool Unique (category pool with no duplicates)</option>
          </select>
        </label>

        {constraintType === 'seal' && (
          <>
            <label>
              If category
              <select value={sealCategory} onChange={(e) => setSealCategory(e.target.value)}>
                <option value="">Select category...</option>
                {availableCategories.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Seals slot
              <select value={sealSlot} onChange={(e) => setSealSlot(e.target.value)}>
                <option value="">Select slot...</option>
                {slotNames.map((slot) => (
                  <option key={slot} value={slot}>
                    {slot}
                  </option>
                ))}
              </select>
            </label>
          </>
        )}

        {constraintType === 'mutual_exclusion' && (
          <>
            <label>
              Slot A
              <select value={mutexSlotA} onChange={(e) => setMutexSlotA(e.target.value)}>
                <option value="">Select slot...</option>
                {slotNames.map((slot) => (
                  <option key={slot} value={slot}>
                    {slot}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Slot B
              <select value={mutexSlotB} onChange={(e) => setMutexSlotB(e.target.value)}>
                <option value="">Select slot...</option>
                {slotNames.map((slot) => (
                  <option key={slot} value={slot}>
                    {slot}
                  </option>
                ))}
              </select>
            </label>
          </>
        )}

        {constraintType === 'global_limit' && (
          <>
            <label>
              Category
              <select value={globalLimitCategory} onChange={(e) => setGlobalLimitCategory(e.target.value)}>
                <option value="">Select category...</option>
                {availableCategories.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Max total uses
              <input
                type="number"
                value={globalLimitValue}
                onChange={(e) => setGlobalLimitValue(Math.max(1, parseInt(e.target.value) || 1))}
                min="1"
              />
            </label>
          </>
        )}

        {constraintType === 'unique' && (
          <label>
            Category
            <select value={uniqueCategory} onChange={(e) => setUniqueCategory(e.target.value)}>
              <option value="">Select category...</option>
              {availableCategories.map((cat) => (
                <option key={cat} value={cat}>
                  {cat}
                </option>
              ))}
            </select>
          </label>
        )}

        {constraintType === 'pool_unique' && (
          <>
            <label>
              Category
              <select value={poolUniqueCategory} onChange={(e) => setPoolUniqueCategory(e.target.value)}>
                <option value="">Select category...</option>
                {availableCategories.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Max total slots
              <input
                type="number"
                value={poolUniqueValue}
                onChange={(e) => setPoolUniqueValue(Math.max(1, parseInt(e.target.value) || 1))}
                min="1"
              />
            </label>
          </>
        )}

        <button type="button" onClick={handleAddConstraint} className="secondary">
          Add constraint
        </button>
      </div>
    </section>
  );
}
