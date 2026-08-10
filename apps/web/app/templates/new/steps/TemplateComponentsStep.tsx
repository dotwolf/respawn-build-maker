'use client';

import { useEffect, useMemo, useState } from 'react';
import { useNotification } from '../../../components/NotificationProvider';
import { useTooltip } from '../../../components/TooltipProvider';
import Pagination from '../../../components/Pagination';
import ComponentEditorModal, { toPersistedEffect } from '../components/ComponentEditorModal';
import type { EffectWithId, ExtendedComponent } from '../components/ComponentEditorModal';

interface TemplateComponentsStepProps {
  components: ExtendedComponent[];
  setComponents: (components: ExtendedComponent[]) => void;
  availableCategories: string[];
  availableSlots?: string[];
  readOnly?: boolean;
}

type SortOption = 'oldest_first' | 'newest_first' | 'asc' | 'desc';

export default function TemplateComponentsStep({
  components,
  setComponents,
  availableCategories,
  availableSlots = [],
  readOnly = false,
}: TemplateComponentsStepProps) {
  const { notify } = useNotification();
  const { showTooltip, hideTooltip, updatePosition } = useTooltip();

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingComponent, setEditingComponent] = useState<ExtendedComponent | null>(null);

  const [filterText, setFilterText] = useState('');
  const [filterCategory, setFilterCategory] = useState('all');
  const [filterSort, setFilterSort] = useState<SortOption>('oldest_first');
  const [statsFilter, setStatsFilter] = useState<string>('all');
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [importText, setImportText] = useState('');
  const [importReplace, setImportReplace] = useState(false);
  const [importIssues, setImportIssues] = useState<string[]>([]);
  const [page, setPage] = useState(0);

  const handleOpenModal = () => {
    if (!availableCategories || availableCategories.length === 0) {
      notify('Cannot create a component without available categories.', 'error');
      return;
    }
    setEditingComponent(null);
    setIsModalOpen(true);
  };

  const handleEditComponent = (comp: ExtendedComponent) => {
    hideTooltip();
    setEditingComponent(comp);
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setEditingComponent(null);
  };

  const handleSaveComponent = (component: ExtendedComponent) => {
    const editingIndex = editingComponent ? components.indexOf(editingComponent) : -1;

    if (editingIndex !== -1) {
      const nextComponents = [...components];
      nextComponents[editingIndex] = component;
      setComponents(nextComponents);
      notify(`Updated "${component.name}".`, 'success');
    } else {
      setComponents([...components, component]);
      notify(`Added "${component.name}" to components inventory.`, 'success');
    }
    handleCloseModal();
  };

  const handleDeleteComponent = () => {
    if (!editingComponent) return;

    const editingIndex = components.indexOf(editingComponent);
    const targetComponent = components[editingIndex];
    const nextComponents = components.filter((_, idx) => idx !== editingIndex);

    setComponents(nextComponents);
    notify(`Deleted "${targetComponent.name}".`, 'success');
  };

  const handleQuickDelete = (comp: ExtendedComponent) => {
    const index = components.indexOf(comp);
    if (index === -1) return;

    hideTooltip();
    const nextComponents = [...components];
    nextComponents.splice(index, 1);
    setComponents(nextComponents);
    notify(`Deleted "${comp.name}".`, 'success');
  };

  const copyToClipboard = (text: string): boolean => {
    if (typeof navigator !== 'undefined' && navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(text).catch(() => {});
      return true;
    }
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();
    try {
      return document.execCommand('copy');
    } catch {
      return false;
    } finally {
      document.body.removeChild(textarea);
    }
  };

  const handleCopyComponents = () => {
    const json = JSON.stringify(components, null, 2);
    if (copyToClipboard(json)) {
      notify(`Copied ${components.length} components to clipboard.`, 'success');
    } else {
      notify('Copy failed — please copy manually.', 'error');
    }
  };

  const handleOpenImport = () => {
    setImportText('');
    setImportReplace(false);
    setImportIssues([]);
    setIsImportOpen(true);
  };

  const validateImportedComponents = (items: unknown[]): { valid: ExtendedComponent[]; issues: string[] } => {
    const valid: ExtendedComponent[] = [];
    const issues: string[] = [];

    items.forEach((item, index) => {
      const label = `Item ${index + 1}`;
      if (typeof item !== 'object' || item === null) {
        issues.push(`${label}: not an object.`);
        return;
      }

      const comp = item as Record<string, unknown>;
      const name = typeof comp.name === 'string' ? comp.name.trim() : '';
      if (!name) {
        issues.push(`${label}: missing name.`);
        return;
      }
      const category = typeof comp.category === 'string' ? comp.category.trim() : '';
      if (!category) {
        issues.push(`${label} ("${name}"): missing category.`);
        return;
      }
      if (!Array.isArray(comp.effects)) {
        issues.push(`${label} ("${name}"): effects must be an array.`);
        return;
      }

      const effectIssues: string[] = [];
      comp.effects.forEach((effect, effectIndex) => {
        if (typeof effect !== 'object' || effect === null) {
          effectIssues.push(`effect #${effectIndex + 1} must be an object`);
          return;
        }
        const e = effect as Record<string, unknown>;
        if (typeof e.stat !== 'string' || !e.stat.trim()) {
          effectIssues.push(`effect #${effectIndex + 1} missing stat`);
          return;
        }
        if (e.type !== 'flat' && e.type !== 'percent_add' && e.type !== 'multiplier') {
          effectIssues.push(`effect #${effectIndex + 1} has invalid type "${String(e.type)}"`);
          return;
        }
        const value = typeof e.value === 'number' ? e.value : typeof e.value === 'string' ? Number(e.value) : NaN;
        if (typeof value !== 'number' || Number.isNaN(value)) {
          effectIssues.push(`effect #${effectIndex + 1} has an invalid value`);
          return;
        }
      });
      if (effectIssues.length > 0) {
        issues.push(`${label} ("${name}"): ${effectIssues.join('; ')}.`);
        return;
      }

      valid.push({
        name,
        category,
        description: typeof comp.description === 'string' && comp.description.trim() ? comp.description.trim() : undefined,
        sub_category: typeof comp.sub_category === 'string' && comp.sub_category.trim() ? comp.sub_category.trim() : undefined,
        effects: (comp.effects as unknown[]).map((effect) => toPersistedEffect(effect as EffectWithId)),
        has_levels: Boolean(comp.has_levels),
        level_scaling: comp.level_scaling === 'formula' || comp.level_scaling === 'tiers' ? comp.level_scaling : null,
        level_rule: comp.level_rule as ExtendedComponent['level_rule'],
      });
    });

    return { valid, issues };
  };

  const handleApplyImport = () => {
    let parsed: unknown;
    try {
      parsed = JSON.parse(importText);
    } catch {
      notify('Invalid JSON — could not parse your paste.', 'error');
      return;
    }

    if (!Array.isArray(parsed)) {
      notify('Invalid input: expected a JSON array of components.', 'error');
      return;
    }

    const { valid, issues } = validateImportedComponents(parsed);
    setImportIssues(issues);

    if (valid.length === 0) {
      notify('No valid components found in the pasted JSON.', 'error');
      return;
    }

    if (importReplace) {
      setComponents(valid);
      notify(
        `Imported ${valid.length} components, existing pool replaced.${issues.length ? ` Skipped ${issues.length} invalid item(s).` : ''}`,
        'success'
      );
    } else {
      const existing = new Map(components.map((c) => [c.name, c]));
      let added = 0;
      let replaced = 0;
      valid.forEach((item) => {
        if (existing.has(item.name)) {
          replaced += 1;
        } else {
          added += 1;
        }
        existing.set(item.name, item);
      });
      setComponents(Array.from(existing.values()));
      notify(
        `Imported ${added} new, replaced ${replaced} matching by name.${issues.length ? ` Skipped ${issues.length} invalid item(s).` : ''}`,
        'success'
      );
    }

    setIsImportOpen(false);
    setImportText('');
    setImportReplace(false);
    setImportIssues([]);
  };

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

  const PAGE_SIZE = 20;
  const pageCount = Math.max(1, Math.ceil(filteredComponents.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount - 1);
  const paginatedComponents = useMemo(() => {
    const start = currentPage * PAGE_SIZE;
    return filteredComponents.slice(start, start + PAGE_SIZE);
  }, [filteredComponents, currentPage]);

  useEffect(() => {
    setPage(0);
  }, [filterText, filterCategory, filterSort, statsFilter]);

  return (
    <div className="card form-card component-list">
      <div className="component-toolbar">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
          <h3 style={{ margin: 0 }}>Inventory ({components.length})</h3>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button type="button" onClick={handleCopyComponents} className="secondary small" title="Copy the component pool as JSON">
              Copy JSON
            </button>
            {!readOnly && (
              <button type="button" onClick={handleOpenImport} className="secondary small" title="Paste JSON to replace the component pool">
                Paste JSON
              </button>
            )}
          </div>
        </div>
        <div className="component-toolbar-controls">
          <input
            type="text"
            value={filterText}
            onChange={(e) => setFilterText(e.target.value)}
            placeholder="Filter by name, category or sub-category"
          />
          <div className="component-toolbar-filter-row">
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
      </div>

      <div className="component-grid">
        {paginatedComponents.map((comp, idx) => (
          <div
            key={`${comp.name}-${idx}`}
            className={`component-card ${!readOnly ? 'clickable' : ''}`}
            onClick={() => {
              if (!readOnly) handleEditComponent(comp);
            }}
            onKeyDown={(e) => {
              if (!readOnly && (e.key === 'Enter' || e.key === ' ')) {
                e.preventDefault();
                handleEditComponent(comp);
              }
            }}
            onMouseEnter={(e) => showTooltip(comp, e)}
            onMouseMove={updatePosition}
            onMouseLeave={hideTooltip}
            onFocus={(e) => showTooltip(comp, e)}
            onBlur={hideTooltip}
            tabIndex={0}
          >
            {!readOnly && (
              <button
                type="button"
                className="component-card-delete"
                onClick={(e) => {
                  e.stopPropagation();
                  handleQuickDelete(comp);
                }}
                onMouseEnter={hideTooltip}
                aria-label={`Delete ${comp.name}`}
                title="Delete"
              >
                ×
              </button>
            )}
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
          </div>
        ))}

        {!readOnly && <button
          type="button"
          className="component-card component-card-add"
          onClick={handleOpenModal}
        >
          <span>+</span>
          <strong>New Component</strong>
        </button>}
      </div>

      {pageCount > 1 && (
        <Pagination
          page={currentPage}
          pageCount={pageCount}
          total={filteredComponents.length}
          pageSize={PAGE_SIZE}
          onPageChange={setPage}
        />
      )}

      {/* COMPONENT EDITOR POPUP MODAL */}
      <ComponentEditorModal
        open={isModalOpen}
        initial={editingComponent}
        availableCategories={availableCategories}
        availableSlots={availableSlots}
        knownStats={knownStats}
        onClose={handleCloseModal}
        onSave={handleSaveComponent}
        onDelete={editingComponent ? handleDeleteComponent : undefined}
      />

      {/* PASTE IMPORT MODAL */}
      {isImportOpen && (
        <div className="modal-overlay" onClick={() => setIsImportOpen(false)}>
          <div className="modal-content import-json-form" onClick={(e) => e.stopPropagation()}>
            <h3>Paste Component Pool JSON</h3>
            <p className="hint-label">
              Paste a JSON array of components. By default, imported components are added and
              any component already present with the same name is replaced.
            </p>
            <textarea
              value={importText}
              onChange={(e) => setImportText(e.target.value)}
              rows={14}
              placeholder='[{ "name": "Iron Sword", "category": "Weapons", "effects": [{ "type": "flat", "scope": "global", "stat": "Damage", "value": 5 }] }]'
              style={{ width: '100%', fontFamily: 'monospace', fontSize: '0.85rem', boxSizing: 'border-box' }}
            />
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={importReplace}
                onChange={(e) => setImportReplace(e.target.checked)}
              />
              <span><strong>Empty component pool and replace</strong></span>
            </label>
            {importIssues.length > 0 && (
              <div className="import-issues">
                <strong>Validation issues ({importIssues.length}):</strong>
                <ul>
                  {importIssues.map((issue, idx) => (
                    <li key={idx}>{issue}</li>
                  ))}
                </ul>
              </div>
            )}
            <div className="modal-footer" style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
              <button type="button" onClick={() => setIsImportOpen(false)} className="secondary">
                Cancel
              </button>
              <button type="button" onClick={handleApplyImport} className="primary">
                Import Components
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
