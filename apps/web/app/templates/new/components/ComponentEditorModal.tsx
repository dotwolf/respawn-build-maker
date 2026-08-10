'use client';

import { useEffect, useMemo, useState } from 'react';
import type { Component, Effect, Tier } from '../page';
import { useNotification } from '../../../components/NotificationProvider';

// Internal extended types for form state tracking
export interface EffectWithId extends Omit<Effect, 'scope' | 'value'> {
  _id: string;
  value: number | string;
  scope?: 'slot' | 'category' | 'global';
  slot?: string;
  category_target?: string;
}

export interface TierWithId extends Omit<Tier, 'effects'> {
  _id: string;
  effects: EffectWithId[];
}

// Extended Component interface matching local state expectations
export interface ExtendedComponent extends Component {
  description?: string;
  sub_category?: string;
}

// Normalizes a form/imported effect into the persisted JSON shape:
// non-multipliers never carry slot/category targeting, and multipliers keep
// slot/category only when their scope actually requires it.
export function toPersistedEffect(effect: EffectWithId): Effect {
  const value = typeof effect.value === 'number' && !Number.isNaN(effect.value) ? effect.value : 0;
  const stat = effect.stat.trim();

  if (effect.type !== 'multiplier') {
    return { type: effect.type, scope: 'global', stat, value };
  }

  if (effect.scope === 'slot') {
    return { type: 'multiplier', scope: 'slot', stat, value, slot: effect.slot } as Effect;
  }
  if (effect.scope === 'category') {
    return {
      type: 'multiplier',
      scope: 'category',
      stat,
      value,
      category_target: effect.category_target,
    } as unknown as Effect;
  }
  return { type: 'multiplier', scope: 'global', stat, value };
}

interface ComponentEditorModalProps {
  open: boolean;
  initial: ExtendedComponent | null;
  availableCategories: string[];
  availableSlots: string[];
  knownStats: string[];
  heading?: string;
  submitLabel?: string;
  onClose: () => void;
  onSave: (component: ExtendedComponent) => void;
  onDelete?: () => void;
}

export default function ComponentEditorModal({
  open,
  initial,
  availableCategories,
  availableSlots = [],
  knownStats,
  heading,
  submitLabel,
  onClose,
  onSave,
  onDelete,
}: ComponentEditorModalProps) {
  const { notify } = useNotification();

  const [formName, setFormName] = useState('');
  const [formCategory, setFormCategory] = useState('');
  const [formSubCategory, setFormSubCategory] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [formEffects, setFormEffects] = useState<EffectWithId[]>([]);
  const [formHasLevels, setFormHasLevels] = useState(false);
  const [formLevelScaling, setFormLevelScaling] = useState<'formula' | 'tiers' | null>(null);
  const [formFormulas, setFormFormulas] = useState<Record<string, string>>({});
  const [formMaxLevel, setFormMaxLevel] = useState(10);
  const [formTiers, setFormTiers] = useState<TierWithId[]>([]);

  const resetForm = () => {
    setFormName('');
    setFormCategory('');
    setFormSubCategory('');
    setFormDescription('');
    setFormEffects([]);
    setFormHasLevels(false);
    setFormLevelScaling(null);
    setFormFormulas({});
    setFormMaxLevel(10);
    setFormTiers([]);
  };

  // Re-initialize the form whenever the modal opens.
  useEffect(() => {
    if (!open) return;

    if (!initial) {
      resetForm();
      return;
    }

    const comp = initial;
    setFormName(comp.name);
    setFormCategory(comp.category);
    setFormSubCategory(comp.sub_category || '');
    setFormDescription(comp.description || '');
    setFormEffects(comp.effects.map((e) => ({ ...e, _id: crypto.randomUUID() })));
    setFormHasLevels(comp.has_levels);
    setFormLevelScaling(comp.level_scaling ?? null);

    if (comp.level_rule?.type === 'formula') {
      const rule = comp.level_rule as {
        type: 'formula';
        formula?: string;
        formulas?: Record<string, string>;
        max_level?: number;
      };

      // Support migration from single legacy formula string to per-stat formulas
      if (rule.formulas) {
        setFormFormulas(rule.formulas);
      } else if (rule.formula) {
        const legacyMap: Record<string, string> = {};
        comp.effects.forEach((e) => {
          if (e.stat.trim()) legacyMap[e.stat.trim()] = rule.formula || '';
        });
        setFormFormulas(legacyMap);
      } else {
        setFormFormulas({});
      }

      setFormMaxLevel(rule.max_level || 10);
      setFormTiers([]);
    } else if (comp.level_rule?.type === 'tiers') {
      setFormFormulas({});
      setFormMaxLevel(10);
      setFormTiers(
        (comp.level_rule.tiers || []).map((tier) => ({
          ...tier,
          _id: crypto.randomUUID(),
          effects: tier.effects.map((e) => ({ ...e, _id: crypto.randomUUID() })),
        }))
      );
    } else {
      setFormFormulas({});
      setFormMaxLevel(10);
      setFormTiers([]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initial]);

  const handleCloseModal = () => {
    resetForm();
    onClose();
  };

  const handleDeleteComponent = () => {
    if (!onDelete) return;
    onDelete();
    handleCloseModal();
  };

  const getDefaultCategoryTarget = () => {
    return availableCategories.find((cat) => cat !== formCategory) || '';
  };

  const handleAddEffect = () => {
    setFormEffects([
      ...formEffects,
      {
        _id: crypto.randomUUID(),
        type: 'flat',
        scope: 'global',
        stat: '',
        value: 0,
        slot: availableSlots[0] || '',
        category_target: getDefaultCategoryTarget(),
      },
    ]);
  };

  const handleRemoveEffect = (id: string) => {
    setFormEffects(formEffects.filter((e) => e._id !== id));
  };

  const handleUpdateEffect = (id: string, updates: Partial<EffectWithId>) => {
    setFormEffects((prev) =>
      prev.map((e) => {
        if (e._id !== id) return e;

        const updated = { ...e, ...updates };

        if (updates.type && updates.type !== 'multiplier' && (updated.scope === 'slot' || updated.scope === 'category')) {
          updated.scope = 'global';
        }

        return updated;
      })
    );
  };

  const handleAddTier = () => {
    const newTierNumber = Math.max(0, ...formTiers.map((t) => t.tier_number)) + 1;
    setFormTiers([
      ...formTiers,
      { _id: crypto.randomUUID(), tier_number: newTierNumber, label: '', effects: [] },
    ]);
  };

  const handleRemoveTier = (id: string) => {
    setFormTiers(formTiers.filter((t) => t._id !== id));
  };

  const handleAddTierEffect = (tierId: string) => {
    setFormTiers(
      formTiers.map((t) =>
        t._id === tierId
          ? {
              ...t,
              effects: [
                ...t.effects,
                {
                  _id: crypto.randomUUID(),
                  type: 'flat',
                  scope: 'global',
                  stat: '',
                  value: 0,
                  slot: availableSlots[0] || '',
                  category_target: getDefaultCategoryTarget(),
                },
              ],
            }
          : t
      )
    );
  };

  const handleRemoveTierEffect = (tierId: string, effectId: string) => {
    setFormTiers(
      formTiers.map((t) =>
        t._id === tierId
          ? { ...t, effects: t.effects.filter((e) => e._id !== effectId) }
          : t
      )
    );
  };

  const handleUpdateTierEffect = (
    tierId: string,
    effectId: string,
    updates: Partial<EffectWithId>
  ) => {
    setFormTiers(
      formTiers.map((t) =>
        t._id === tierId
          ? {
              ...t,
              effects: t.effects.map((e) => {
                if (e._id !== effectId) return e;

                const updated = { ...e, ...updates };

                if (updates.type && updates.type !== 'multiplier' && (updated.scope === 'slot' || updated.scope === 'category')) {
                  updated.scope = 'global';
                }

                return updated;
              }),
            }
          : t
      )
    );
  };

  const activeFormStats = useMemo(() => {
    const stats = new Set<string>();
    formEffects.forEach((e) => {
      if (e.stat.trim()) stats.add(e.stat.trim());
    });
    return Array.from(stats);
  }, [formEffects]);

  const handleSaveComponent = () => {
    if (!formName.trim()) {
      notify('Component name is required.', 'error');
      return;
    }

    if (!formCategory.trim()) {
      notify('Please select a component category.', 'error');
      return;
    }

    const hasInvalidEffect = formEffects.some((e) => !e.stat.trim());
    if (hasInvalidEffect) {
      notify('All base effects must specify a stat name.', 'error');
      return;
    }

    if (formHasLevels) {
      if (!formLevelScaling) {
        notify('Please select a level scaling type (Formula or Tiers).', 'error');
        return;
      }

      if (formLevelScaling === 'formula') {
        if (activeFormStats.length === 0) {
          notify('At least one effect with a stat is required to set formula expressions.', 'error');
          return;
        }

        const unconfiguredStat = activeFormStats.find((stat) => !formFormulas[stat]?.trim());
        if (unconfiguredStat) {
          notify(`Formula expression for stat "${unconfiguredStat}" cannot be empty.`, 'error');
          return;
        }
      }

      if (formLevelScaling === 'tiers' && formTiers.length === 0) {
        notify('At least one tier must be configured for tier scaling.', 'error');
        return;
      }
    }

    // Convert form state into persisted effects: empty values become 0, and
    // slot/category targeting is stripped unless the effect actually needs it.
    const cleanEffects: Effect[] = formEffects.map(toPersistedEffect);

    const cleanTiers: Tier[] = formTiers.map(({ _id, effects, ...rest }) => ({
      ...rest,
      effects: effects.map(toPersistedEffect),
    }));

    // Filter formulas to only include active stats currently in effects
    const cleanFormulas: Record<string, string> = {};
    activeFormStats.forEach((stat) => {
      if (formFormulas[stat]) {
        cleanFormulas[stat] = formFormulas[stat].trim();
      }
    });

    const updatedComponent: ExtendedComponent = {
      name: formName.trim(),
      category: formCategory.trim(),
      sub_category: formSubCategory.trim() || undefined,
      description: formDescription.trim() || undefined,
      effects: cleanEffects,
      has_levels: formHasLevels,
      level_scaling: formHasLevels ? formLevelScaling : null,
      level_rule: formHasLevels
        ? formLevelScaling === 'formula'
          ? { type: 'formula', formulas: cleanFormulas, max_level: formMaxLevel }
          : formLevelScaling === 'tiers'
          ? { type: 'tiers', tiers: cleanTiers }
          : null
        : null,
    };

    onSave(updatedComponent);
    handleCloseModal();
  };

  const renderEffectFields = (
    effect: EffectWithId,
    onUpdate: (updates: Partial<EffectWithId>) => void
  ) => (
    <>
      <div className="effect-input-group">
        <label className="effect-label">Type<span style={{ color: 'red' }}>*</span></label>
        <select
          value={effect.type}
          onChange={(e) => onUpdate({ type: e.target.value as Effect['type'] })}
          className="effect-select"
        >
          <option value="flat">Flat Value</option>
          <option value="percent_add">Percent Add (+%)</option>
          <option value="multiplier">Multiplier (x)</option>
        </select>
      </div>

      {effect.type === 'multiplier' && (
        <div className="effect-input-group">
          <label className="effect-label">Scope<span style={{ color: 'red' }}>*</span></label>
          <select
            value={effect.scope || 'global'}
            onChange={(e) => {
              const newScope = e.target.value as EffectWithId['scope'];
              if (newScope === 'category' && !formCategory.trim()) {
                notify('Select a category first.', 'error');
                return;
              }
              onUpdate({ scope: newScope });
            }}
            className="effect-select"
          >
            <option value="slot">Slot-Specific</option>
            <option value="category">Category-Specific</option>
            <option value="global">Global</option>
          </select>
        </div>
      )}

      {effect.scope === 'slot' && (
        <div className="effect-input-group">
          <label className="effect-label">Target Slot<span style={{ color: 'red' }}>*</span></label>
          <select
            value={effect.slot || ''}
            onChange={(e) => onUpdate({ slot: e.target.value })}
            className="effect-select"
          >
            <option value="" disabled>Select target slot</option>
            {availableSlots.map((slot) => (
              <option key={slot} value={slot}>
                {slot}
              </option>
            ))}
          </select>
        </div>
      )}

      {effect.scope === 'category' && (
        <div className="effect-input-group">
          <label className="effect-label">Target Category<span style={{ color: 'red' }}>*</span></label>
          <select
            value={effect.category_target || ''}
            onChange={(e) => {
              if (!formCategory.trim()) {
                notify('Select a category first.', 'error');
                return;
              }
              onUpdate({ category_target: e.target.value });
            }}
            className="effect-select"
          >
            <option value="" disabled>Select target category</option>
            {availableCategories
              .filter((category) => category !== formCategory)
              .map((category) => (
                <option key={category} value={category}>
                  {category}
                </option>
              ))}
          </select>
        </div>
      )}

      <div className="effect-input-group stat-group">
        <label className="effect-label">Stat Name<span style={{ color: 'red' }}>*</span></label>
        <input
          type="text"
          value={effect.stat}
          onChange={(e) => onUpdate({ stat: e.target.value })}
          placeholder="e.g. Strength, Defense"
          className="effect-input"
        />
      </div>

      <div className="effect-input-group value-group">
        <label className="effect-label">Value<span style={{ color: 'red' }}>*</span></label>
        <input
          type="number"
          value={effect.value}
          onChange={(e) => {
            const val = e.target.value;
            onUpdate({ value: val === '' ? '' : parseFloat(val) });
          }}
          placeholder="0"
          className="effect-input"
        />
      </div>
    </>
  );

  return (
    <>
      {open && (
        <div className="modal-overlay" onClick={handleCloseModal}>
          <div className="modal-content add-component-form" onClick={(e) => e.stopPropagation()}>
            <div className="modal-actions-bar">
              <h3 style={{ margin: 0 }}>
                {heading ?? (initial ? 'Edit Component' : 'New Component')}
              </h3>
              <div className="modal-actions" style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                {initial && (
                  <button
                    type="button"
                    onClick={handleDeleteComponent}
                    className="secondary danger"
                    style={{ marginRight: 'auto' }}
                  >
                    Delete
                  </button>
                )}
                <button type="button" onClick={handleCloseModal} className="secondary">
                  Cancel
                </button>
                <button type="button" onClick={handleSaveComponent} className="primary">
                  {submitLabel ?? (initial ? 'Save Changes' : 'Create Component')}
                </button>
              </div>
            </div>
            <div className="modal-body">
              <label>
                Name<span style={{ color: 'red' }}>*</span>
                <input
                  type="text"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  placeholder="e.g. Iron Sword, Gold Ring"
                />
              </label>

              <div className="sub-category-selection">
                <label>
                  Sub-Category
                  <input
                    type="text"
                    value={formSubCategory}
                    onChange={(e) => setFormSubCategory(e.target.value)}
                    placeholder="e.g. Common, Rare, Legendary, Consumable, Weapon"
                  />
                </label>
                <div className="tag-editor presets-tags">
                  <span className="hint-label">Quick options:</span>
                  {['Common', 'Rare', 'Epic', 'Legendary'].map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      className={`tag ${formSubCategory === preset ? 'selected' : ''}`}
                      onClick={() => setFormSubCategory(formSubCategory === preset ? '' : preset)}
                    >
                      {preset}
                    </button>
                  ))}
                </div>
              </div>

              <div className="category-selection">
                <label>Category<span style={{ color: 'red' }}>*</span></label>
                <div className="tag-editor">
                  {availableCategories.map((cat) => (
                    <button
                      key={cat}
                      type="button"
                      className={`tag ${formCategory === cat ? 'selected' : ''}`}
                      onClick={() => setFormCategory(formCategory === cat ? '' : cat)}
                    >
                      {cat}
                    </button>
                  ))}
                </div>
              </div>

              {/* DESCRIPTION SECTION */}
              <label>
                Description
                <textarea
                  value={formDescription}
                  onChange={(e) => setFormDescription(e.target.value)}
                  placeholder="Brief description or lore for this component..."
                  rows={3}
                  className="effect-input"
                />
              </label>

              {knownStats.length > 0 && (
                <div className="tag-editor">
                  {knownStats.map((stat) => (
                    <button
                      key={stat}
                      type="button"
                      className={`tag ${formEffects.some((effect) => effect.stat.trim() === stat) ? 'selected' : ''}`}
                      onClick={() => {
                        const existing = formEffects.find((effect) => effect.stat.trim() === stat);
                        if (existing) {
                          setFormEffects(formEffects.filter((effect) => effect.stat.trim() !== stat));
                          return;
                        }

                        setFormEffects([
                          ...formEffects,
                          {
                            _id: crypto.randomUUID(),
                            type: 'flat',
                            scope: 'global',
                            stat,
                            value: 0,
                            slot: availableSlots[0] || '',
                            category_target: getDefaultCategoryTarget(),
                          },
                        ]);
                      }}
                    >
                      {stat}
                    </button>
                  ))}
                </div>
              )}

              {/* BASE EFFECTS SECTION */}
              <div className="effects-fieldset">
                <div className="effects-header">
                  <div className="effects-title">
                    <svg className="effects-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
                    </svg>
                    <span>Effects ({formEffects.length})</span>
                  </div>
                  <span className="effects-subtitle">Configure base stat modifications</span>
                </div>

                <div className="effects-list">
                  {formEffects.map((effect, index) => (
                    <div key={effect._id} className="effect-card">
                      <div className="effect-card-header">
                        <span className="effect-index">#{index + 1}</span>
                        <span className={`effect-type-badge type-${effect.type}`}>
                          {effect.type === 'flat' && 'Flat'}
                          {effect.type === 'percent_add' && '% Add'}
                          {effect.type === 'multiplier' && 'Multiplier'}
                        </span>
                        <button
                          type="button"
                          onClick={() => handleRemoveEffect(effect._id)}
                          className="effect-remove-btn"
                          title="Remove Effect"
                          aria-label="Remove Effect"
                        >
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M10 11v6M14 11v6" />
                          </svg>
                        </button>
                      </div>

                      <div className="effect-card-body">
                        {renderEffectFields(effect, (updates) => handleUpdateEffect(effect._id, updates))}
                      </div>
                    </div>
                  ))}

                  <button type="button" onClick={handleAddEffect} className="btn-add-effect">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <line x1="12" y1="5" x2="12" y2="19"></line>
                      <line x1="5" y1="12" x2="19" y2="12"></line>
                    </svg>
                    <span>Add New Effect</span>
                  </button>
                </div>
              </div>

              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={formHasLevels}
                  onChange={(e) => {
                    setFormHasLevels(e.target.checked);
                    if (!e.target.checked) {
                      setFormLevelScaling(null);
                      setFormFormulas({});
                      setFormMaxLevel(10);
                      setFormTiers([]);
                    }
                  }}
                />
                <span><strong>Has Levels</strong></span>
              </label>

              {formHasLevels && (
                <>
                  <label>
                    Level Scaling
                    <select
                      value={formLevelScaling || ''}
                      onChange={(e) => {
                        const val = (e.target.value as 'formula' | 'tiers' | '') || null;
                        setFormLevelScaling(val);
                        if (val === 'tiers' && formTiers.length === 0) {
                          setFormTiers([{ _id: crypto.randomUUID(), tier_number: 1, label: '', effects: [] }]);
                        }
                      }}
                    >
                      <option value="">Select scaling...</option>
                      <option value="formula">Formula</option>
                      <option value="tiers">Tiers</option>
                    </select>
                  </label>

                  {/* PER-STAT FORMULA INPUTS */}
                  {formLevelScaling === 'formula' && (
                    <>
                      <div className="stat-formulas-container">
                        <label className="effect-label">Stat Formulas<span style={{ color: 'red' }}>*</span></label>
                        {activeFormStats.length === 0 ? (
                          <p className="hint-label" style={{ color: '#888', fontStyle: 'italic', margin: '0.25rem 0' }}>
                            Add at least one effect with a stat name above to configure stat formulas.
                          </p>
                        ) : (
                          activeFormStats.map((statName) => (
                            <label key={statName} style={{ marginTop: '0.5rem', display: 'block' }}>
                              <span>{statName}</span>
                              <input
                                type="text"
                                value={formFormulas[statName] || ''}
                                onChange={(e) => {
                                  const val = e.target.value;
                                  setFormFormulas((prev) => ({
                                    ...prev,
                                    [statName]: val,
                                  }));
                                }}
                                placeholder="e.g. base + level * 2"
                              />
                            </label>
                          ))
                        )}
                      </div>

                      <label style={{ marginTop: '0.75rem' }}>
                        Max Level
                        <input
                          type="number"
                          value={formMaxLevel}
                          onChange={(e) => setFormMaxLevel(Math.max(1, parseInt(e.target.value) || 1))}
                          min="1"
                        />
                      </label>
                    </>
                  )}

                  {formLevelScaling === 'tiers' && (
                    <div className="tiers-container">
                      {formTiers.map((tier) => (
                        <div key={tier._id} className="tier-row">
                          <label>
                            Tier Number<span style={{ color: 'red' }}>*</span>
                            <input
                              type="number"
                              value={tier.tier_number}
                              onChange={(e) => {
                                setFormTiers(
                                  formTiers.map((t) =>
                                    t._id === tier._id
                                      ? { ...t, tier_number: parseInt(e.target.value) || 1 }
                                      : t
                                  )
                                );
                              }}
                              min="1"
                            />
                          </label>

                          <label>
                            Label
                            <input
                              type="text"
                              value={tier.label}
                              onChange={(e) => {
                                setFormTiers(
                                  formTiers.map((t) =>
                                    t._id === tier._id ? { ...t, label: e.target.value } : t
                                  )
                                );
                              }}
                              placeholder="e.g. Sword I"
                            />
                          </label>

                          {/* TIER EFFECTS SECTION */}
                          <div className="effects-fieldset tier-effects-fieldset">
                            <div className="effects-header">
                              <div className="effects-title">
                                <svg className="effects-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                  <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
                                </svg>
                                <span>Tier {tier.tier_number} Effects ({tier.effects.length})</span>
                              </div>
                              <span className="effects-subtitle">Configure effects for this specific tier level</span>
                            </div>

                            <div className="effects-list">
                              {tier.effects.map((effect, effectIdx) => (
                                <div key={effect._id} className="effect-card">
                                  <div className="effect-card-header">
                                    <span className="effect-index">#{effectIdx + 1}</span>
                                    <span className={`effect-type-badge type-${effect.type}`}>
                                      {effect.type === 'flat' && 'Flat'}
                                      {effect.type === 'percent_add' && '% Add'}
                                      {effect.type === 'multiplier' && 'Multiplier'}
                                    </span>
                                    <button
                                      type="button"
                                      onClick={() => handleRemoveTierEffect(tier._id, effect._id)}
                                      className="effect-remove-btn"
                                      title="Remove Tier Effect"
                                      aria-label="Remove Tier Effect"
                                    >
                                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                        <path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M10 11v6M14 11v6" />
                                      </svg>
                                    </button>
                                  </div>

                                  <div className="effect-card-body">
                                    {renderEffectFields(effect, (updates) =>
                                      handleUpdateTierEffect(tier._id, effect._id, updates)
                                    )}
                                  </div>
                                </div>
                              ))}

                              <button
                                type="button"
                                onClick={() => handleAddTierEffect(tier._id)}
                                className="btn-add-effect"
                              >
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                  <line x1="12" y1="5" x2="12" y2="19"></line>
                                  <line x1="5" y1="12" x2="19" y2="12"></line>
                                </svg>
                                <span>Add Tier Effect</span>
                              </button>
                            </div>
                          </div>

                          <button
                            type="button"
                            onClick={() => handleRemoveTier(tier._id)}
                            className="secondary small"
                            style={{ marginTop: '0.5rem' }}
                          >
                            Remove Tier
                          </button>
                        </div>
                      ))}

                      <button type="button" onClick={handleAddTier} className="btn-add-effect" style={{ marginTop: '0.5rem' }}>
                        <span>+ Add Tier</span>
                      </button>
                    </div>
                  )}
                </>
              )}
            </div>

            <div className="modal-footer" style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end', marginTop: '1.5rem' }}>
              {initial && (
                <button
                  type="button"
                  onClick={handleDeleteComponent}
                  className="secondary danger"
                  style={{ marginRight: 'auto' }}
                >
                  Delete
                </button>
              )}
              <button type="button" onClick={handleCloseModal} className="secondary">
                Cancel
              </button>
              <button type="button" onClick={handleSaveComponent} className="primary">
                {submitLabel ?? (initial ? 'Save Changes' : 'Create Component')}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
