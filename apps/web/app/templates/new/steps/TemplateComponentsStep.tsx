'use client';

import { useMemo, useState } from 'react';
import type { Component, Effect, Tier } from '../page';
import { useNotification } from '../../../components/NotificationProvider';
import { useTooltip } from '../../../components/TooltipProvider';

// Internal extended types for form state tracking
interface EffectWithId extends Omit<Effect, 'scope' | 'value'> {
  _id: string;
  value: number | string;
  scope?: 'slot' | 'category' | 'global';
  slot?: string;
  category_target?: string;
}

interface TierWithId extends Omit<Tier, 'effects'> {
  _id: string;
  effects: EffectWithId[];
}

// Extended Component interface matching local state expectations
export interface ExtendedComponent extends Component {
  description?: string;
  sub_category?: string;
}

interface TemplateComponentsStepProps {
  components: ExtendedComponent[];
  setComponents: (components: ExtendedComponent[]) => void;
  availableCategories: string[];
  availableSlots?: string[];
}

type SortOption = 'oldest_first' | 'newest_first' | 'asc' | 'desc';

export default function TemplateComponentsStep({
  components,
  setComponents,
  availableCategories,
  availableSlots = [],
}: TemplateComponentsStepProps) {
  const { notify } = useNotification();
  const { showTooltip, hideTooltip, updatePosition } = useTooltip();

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);

  // Form State
  const [formName, setFormName] = useState('');
  const [formCategory, setFormCategory] = useState('');
  const [formSubCategory, setFormSubCategory] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [formEffects, setFormEffects] = useState<EffectWithId[]>([]);
  const [filterText, setFilterText] = useState('');
  const [filterCategory, setFilterCategory] = useState('all');
  const [filterSort, setFilterSort] = useState<SortOption>('oldest_first');
  const [statsFilter, setStatsFilter] = useState<string>('all');
  const [formHasLevels, setFormHasLevels] = useState(false);
  const [formLevelScaling, setFormLevelScaling] = useState<'formula' | 'tiers' | null>(null);
  
  // Per-stat formulas state mapping stat names to formula expressions
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
    setEditingIndex(null);
  };

  const handleOpenModal = () => {
    if (!availableCategories || availableCategories.length === 0) {
      notify('Cannot create a component without available categories.', 'error');
      return;
    }
    resetForm();
    setIsModalOpen(true);
  };

  const handleEditComponent = (comp: ExtendedComponent) => {
    hideTooltip();
    const actualIndex = components.indexOf(comp);
    if (actualIndex === -1) return;

    setEditingIndex(actualIndex);
    setFormName(comp.name);
    setFormCategory(comp.category);
    setFormSubCategory(comp.sub_category || '');
    setFormDescription(comp.description || '');
    setFormEffects(
      comp.effects.map((e) => ({ ...e, _id: crypto.randomUUID() }))
    );
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

    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    resetForm();
  };

  const handleDeleteComponent = () => {
    if (editingIndex === null) return;

    const targetComponent = components[editingIndex];
    const nextComponents = components.filter((_, idx) => idx !== editingIndex);
    
    setComponents(nextComponents);
    notify(`Deleted "${targetComponent.name}".`, 'success');
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

  const knownStats = useMemo(() => {
    const stats = new Set<string>();
    components.forEach((component) => {
      component.effects.forEach((effect) => {
        if (effect.stat.trim()) stats.add(effect.stat.trim());
      });
    });
    return Array.from(stats).sort();
  }, [components]);

  const filteredComponents = useMemo(() => {
    const normalized = filterText.trim().toLowerCase();
    
    const indexedComponents = components.map((comp, originalIndex) => ({
      comp,
      originalIndex,
    }));

    const filtered = indexedComponents.filter(({ comp }) => {
      const matchesText =
        !normalized ||
        comp.name.toLowerCase().includes(normalized) ||
        comp.category.toLowerCase().includes(normalized) ||
        (comp.sub_category && comp.sub_category.toLowerCase().includes(normalized));
      const matchesCategory =
        filterCategory === 'all' || comp.category === filterCategory;
      const matchesStats =
        statsFilter === 'all' ||
        comp.effects.some((effect) => effect.stat.trim() === statsFilter);
      return matchesText && matchesCategory && matchesStats;
    });

    return filtered
      .sort((a, b) => {
        if (filterSort === 'oldest_first') {
          return a.originalIndex - b.originalIndex;
        }
        if (filterSort === 'newest_first') {
          return b.originalIndex - a.originalIndex;
        }

        const left = `${a.comp.name} ${a.comp.category}`.toLowerCase();
        const right = `${b.comp.name} ${b.comp.category}`.toLowerCase();

        return filterSort === 'asc'
          ? left.localeCompare(right)
          : right.localeCompare(left);
      })
      .map(({ comp }) => comp);
  }, [components, filterCategory, filterSort, filterText, statsFilter]);

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

    // Convert any empty value string to 0 before saving
    const cleanEffects: Effect[] = formEffects.map(({ _id, value, ...rest }) => ({
      ...rest,
      value: typeof value === 'number' && !isNaN(value) ? value : 0,
    })) as Effect[];

    const cleanTiers: Tier[] = formTiers.map(({ _id, effects, ...rest }) => ({
      ...rest,
      effects: effects.map(({ _id: eId, value, ...eRest }) => ({
        ...eRest,
        value: typeof value === 'number' && !isNaN(value) ? value : 0,
      })) as Effect[],
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

    if (editingIndex !== null) {
      const nextComponents = [...components];
      nextComponents[editingIndex] = updatedComponent;
      setComponents(nextComponents);
      notify(`Updated "${updatedComponent.name}".`, 'success');
    } else {
      setComponents([...components, updatedComponent]);
      notify(`Added "${updatedComponent.name}" to components inventory.`, 'success');
    }

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
    <div className="card form-card component-list">
      <div className="component-toolbar">
        <h3>Inventory ({components.length})</h3>
        <div className="component-toolbar-controls">
          <input
            type="text"
            value={filterText}
            onChange={(e) => setFilterText(e.target.value)}
            placeholder="Filter by name, category or sub-category"
          />
          <select value={filterCategory} onChange={(e) => setFilterCategory(e.target.value)}>
            <option value="all">All categories</option>
            {availableCategories.map((cat) => (
              <option key={cat} value={cat}>{cat}</option>
            ))}
          </select>
          <select value={statsFilter} onChange={(e) => setStatsFilter(e.target.value)}>
            <option value="all">All stats</option>
            {knownStats.map((stat) => (
              <option key={stat} value={stat}>{stat}</option>
            ))}
          </select>
          <select value={filterSort} onChange={(e) => setFilterSort(e.target.value as SortOption)}>
            <option value="oldest_first">Oldest First</option>
            <option value="newest_first">Newest First</option>
            <option value="desc">Descending</option>
            <option value="asc">Ascending</option>
          </select>
        </div>
      </div>

      <div className="component-grid">
        {filteredComponents.map((comp, idx) => (
          <div
            key={`${comp.name}-${idx}`}
            className="component-card"
            onMouseEnter={(e) => showTooltip(comp, e)}
            onMouseMove={updatePosition}
            onMouseLeave={hideTooltip}
            onFocus={(e) => showTooltip(comp, e)}
            onBlur={hideTooltip}
            tabIndex={0}
          >
            <div className="component-card-header">
              <strong>{comp.name}</strong>
              <div className="component-card-badges">
                <span className="component-card-category">{comp.category}</span>
              </div>
              {comp.sub_category && (
                <div className="component-card-badges">
                  <span className="component-card-subcategory">{comp.sub_category}</span>
                </div>
              )}
              {comp.has_levels && <span className="component-card-subcategory">Has levels</span>}
            </div>

            <div className="component-card-actions">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  handleEditComponent(comp);
                }}
                className="secondary small edit-btn-floating"
              >
                Edit
              </button>
            </div>
          </div>
        ))}

        <button
          type="button"
          className="component-card component-card-add"
          onClick={handleOpenModal}
        >
          <span>+</span>
          <strong>New Component</strong>
        </button>
      </div>

      {/* POPUP MODAL */}
      {isModalOpen && (
        <div className="modal-overlay" onClick={handleCloseModal}>
          <div className="modal-content add-component-form" onClick={(e) => e.stopPropagation()}>
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
              {editingIndex !== null && (
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
                {editingIndex !== null ? 'Save Changes' : 'Create Component'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}