'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useNotification } from './NotificationProvider';
import { useTooltip } from './TooltipProvider';
import ComponentEditorModal, { toPersistedEffect } from '../templates/new/components/ComponentEditorModal';
import type { EffectWithId, ExtendedComponent } from '../templates/new/components/ComponentEditorModal';
import Pagination from './Pagination';
import { apiFetch } from '../lib/api';
import { createSuggestion, toSuggestionPayloadComponent } from '../lib/suggestions';
import type { Component } from '../templates/new/page';

export interface PoolComponent extends ExtendedComponent {
  scoped_number: number;
}

interface SuggestionCreateModalProps {
  open: boolean;
  templateId: string;
  templateName: string;
  availableCategories: string[];
  availableSlots: string[];
  onClose: () => void;
}

type SortOption = 'oldest_first' | 'newest_first' | 'asc' | 'desc';

interface SuggestionDraft {
  description: string;
  pool: PoolComponent[];
  /** The template's component pool this draft was based on, used to detect
   *  whether the template changed since the draft was saved. */
  original?: PoolComponent[];
}

const DRAFT_PREFIX = 'respawn-suggestion-draft:';

function draftKey(templateId: string): string {
  return `${DRAFT_PREFIX}${templateId}`;
}

function loadDraft(templateId: string): SuggestionDraft | null {
  try {
    const raw = window.localStorage.getItem(draftKey(templateId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as SuggestionDraft;
    if (!Array.isArray(parsed.pool)) return null;
    return parsed;
  } catch {
    return null;
  }
}

function saveDraft(templateId: string, draft: SuggestionDraft) {
  try {
    window.localStorage.setItem(draftKey(templateId), JSON.stringify(draft));
  } catch {
    // storage full / unavailable — ignore
  }
}

function clearDraft(templateId: string) {
  try {
    window.localStorage.removeItem(draftKey(templateId));
  } catch {
    // ignore
  }
}

const stripEffect = (effect: Component['effects'][number] & { _id?: string }) => {
  const { _id: _ignored, ...rest } = effect;
  return rest;
};

// Canonical JSON signature used to compare an original pool component against
// the proposed one (ignores the editor-internal _id fields).
const componentSignature = (component: Component) => {
  return JSON.stringify({
    name: component.name,
    category: component.category,
    sub_category: component.sub_category ?? null,
    description: component.description ?? null,
    effects: (component.effects ?? []).map(stripEffect),
    has_levels: Boolean(component.has_levels),
    level_scaling: component.level_scaling ?? null,
    level_rule: component.level_rule
      ? {
          ...component.level_rule,
          tiers: (component.level_rule.tiers ?? []).map((tier) => ({
            ...tier,
            effects: (tier.effects ?? []).map(stripEffect),
          })),
        }
      : null,
  });
};

// Signature of the whole template pool. Used to detect whether the template has
// changed since a draft was saved (in which case the draft is invalidated).
const poolSignature = (components: PoolComponent[]) =>
  JSON.stringify(components.map((comp) => componentSignature(comp)));

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

export default function SuggestionCreateModal({
  open,
  templateId,
  templateName,
  availableCategories,
  availableSlots,
  onClose,
}: SuggestionCreateModalProps) {
  const { notify } = useNotification();

  const [step, setStep] = useState<'edit' | 'review'>('edit');
  const [description, setDescription] = useState('');
  const [original, setOriginal] = useState<PoolComponent[]>([]);
  const [pool, setPool] = useState<PoolComponent[]>([]);
  const [loading, setLoading] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [filterText, setFilterText] = useState('');
  const [filterCategory, setFilterCategory] = useState('all');
  const [filterSort, setFilterSort] = useState<SortOption>('oldest_first');
  const [statsFilter, setStatsFilter] = useState<string>('all');
  const [page, setPage] = useState(0);

  const [isImportOpen, setIsImportOpen] = useState(false);
  const [importText, setImportText] = useState('');
  const [importReplace, setImportReplace] = useState(false);
  const [importIssues, setImportIssues] = useState<string[]>([]);

  const [isComponentEditorOpen, setIsComponentEditorOpen] = useState(false);
  const [editingComponent, setEditingComponent] = useState<PoolComponent | null>(null);

  // Skips the next draft persist so an explicit clear isn't immediately
  // re-saved with the freshly reset (baseline) pool.
  const skipNextDraftSaveRef = useRef(false);

  // Load the template's current pool on open and restore any saved draft.
  useEffect(() => {
    if (!open || !templateId) return;
    setStep('edit');
    setLoading(true);
    setHydrated(false);
    apiFetch(`/templates/${encodeURIComponent(templateId)}`)
      .then((template) => {
        const base: PoolComponent[] = (Array.isArray(template.components) ? template.components : []).map(
          (comp: Component & { scoped_number?: number }, idx: number) => ({
            ...comp,
            scoped_number: typeof comp.scoped_number === 'number' ? comp.scoped_number : idx + 1,
          })
        );
        setOriginal(base);
        const draft = loadDraft(templateId);
        if (draft && draft.pool.length > 0) {
          // If the template changed since the draft was saved, the draft's
          // scoped numbers and diff are stale — clear it automatically.
          const templateChanged =
            !Array.isArray(draft.original) ||
            poolSignature(draft.original) !== poolSignature(base);
          if (!templateChanged) {
            setDescription(draft.description ?? '');
            setPool(draft.pool);
          } else {
            skipNextDraftSaveRef.current = true;
            clearDraft(templateId);
            setDescription('');
            setPool(base.map((comp) => ({ ...comp, effects: (comp.effects ?? []).map((e) => ({ ...e })) })));
            notify('Your saved suggestion draft was cleared because the template changed.', 'info');
          }
        } else {
          setDescription('');
          setPool(base.map((comp) => ({ ...comp, effects: (comp.effects ?? []).map((e) => ({ ...e })) })));
        }
      })
      .catch((error) =>
        notify(error instanceof Error ? error.message : 'Failed to load template inventory.', 'error')
      )
      .finally(() => {
        setLoading(false);
        setHydrated(true);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, templateId]);

  // Persist the working draft so closing and reopening the window keeps it.
  // Gated on `hydrated` so the very first render (empty pool, loading still
  // false) never overwrites a stored draft with an empty one.
  useEffect(() => {
    if (!open || !templateId || loading || !hydrated) return;
    if (skipNextDraftSaveRef.current) {
      skipNextDraftSaveRef.current = false;
      return;
    }
    saveDraft(templateId, { description, pool, original });
  }, [open, templateId, loading, hydrated, description, pool, original]);

  const diff = useMemo(() => {
    const originalByNumber = new Map(original.map((comp) => [comp.scoped_number, comp]));
    const poolByNumber = new Map(pool.map((comp) => [comp.scoped_number, comp]));

    const added: PoolComponent[] = [];
    const edited: PoolComponent[] = [];
    for (const comp of pool) {
      const existing = originalByNumber.get(comp.scoped_number);
      if (!existing) {
        added.push(comp);
      } else if (componentSignature(existing) !== componentSignature(comp)) {
        edited.push(comp);
      }
    }

    const removedNumbers: number[] = [];
    for (const comp of original) {
      if (!poolByNumber.has(comp.scoped_number)) {
        removedNumbers.push(comp.scoped_number);
      }
    }

    return { added, edited, removedNumbers };
  }, [original, pool]);

  const hasChanges = diff.added.length > 0 || diff.edited.length > 0 || diff.removedNumbers.length > 0;

  const knownStats = useMemo(() => {
    const stats = new Set<string>();
    pool.forEach((component) => {
      component.effects.forEach((effect) => {
        if (effect.stat.trim()) stats.add(effect.stat.trim());
      });
    });
    return Array.from(stats).sort();
  }, [pool]);

  const filteredComponents = useMemo(() => {
    const normalized = filterText.trim().toLowerCase();

    const indexedComponents = pool.map((comp, originalIndex) => ({
      comp,
      originalIndex,
    }));

    const filtered = indexedComponents.filter(({ comp }) => {
      const matchesText =
        !normalized ||
        comp.name.toLowerCase().includes(normalized) ||
        comp.category.toLowerCase().includes(normalized) ||
        (comp.sub_category && comp.sub_category.toLowerCase().includes(normalized));
      const matchesCategory = filterCategory === 'all' || comp.category === filterCategory;
      const matchesStats =
        statsFilter === 'all' || comp.effects.some((effect) => effect.stat.trim() === statsFilter);
      return matchesText && matchesCategory && matchesStats;
    });

    return filtered
      .sort((a, b) => {
        if (filterSort === 'oldest_first') return a.originalIndex - b.originalIndex;
        if (filterSort === 'newest_first') return b.originalIndex - a.originalIndex;

        const left = `${a.comp.name} ${a.comp.category}`.toLowerCase();
        const right = `${b.comp.name} ${b.comp.category}`.toLowerCase();

        return filterSort === 'asc' ? left.localeCompare(right) : right.localeCompare(left);
      })
      .map(({ comp }) => comp);
  }, [pool, filterCategory, filterSort, filterText, statsFilter]);

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

  const handleOpenComponentEditor = () => {
    if (!availableCategories || availableCategories.length === 0) {
      notify('This template has no categories to suggest components for.', 'error');
      return;
    }
    setEditingComponent(null);
    setIsComponentEditorOpen(true);
  };

  const handleEditComponent = (component: PoolComponent) => {
    setEditingComponent(component);
    setIsComponentEditorOpen(true);
  };

  const handleSaveComponent = (component: ExtendedComponent) => {
    if (editingComponent) {
      const editingIndex = pool.indexOf(editingComponent);
      if (editingIndex !== -1) {
        const next = [...pool];
        next[editingIndex] = { ...component, scoped_number: editingComponent.scoped_number };
        setPool(next);
      }
    } else {
      const maxNumber = pool.reduce((max, comp) => Math.max(max, comp.scoped_number), 0);
      setPool([...pool, { ...component, scoped_number: maxNumber + 1 }]);
    }
    setIsComponentEditorOpen(false);
    setEditingComponent(null);
  };

  const handleDeleteComponent = () => {
    if (!editingComponent) return;
    setPool(pool.filter((comp) => comp !== editingComponent));
  };

  const handleQuickDelete = (component: PoolComponent) => {
    setPool(pool.filter((comp) => comp !== component));
  };

  const handleCopyComponents = () => {
    const json = JSON.stringify(pool, null, 2);
    if (copyToClipboard(json)) {
      notify(`Copied ${pool.length} components to clipboard.`, 'success');
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
      setPool(valid.map((comp, index) => ({ ...comp, scoped_number: index + 1 })));
      notify(
        `Imported ${valid.length} components, existing pool replaced.${issues.length ? ` Skipped ${issues.length} invalid item(s).` : ''}`,
        'success'
      );
    } else {
      const existing = new Map(pool.map((comp) => [comp.name, comp]));
      let nextNumber = pool.reduce((max, comp) => Math.max(max, comp.scoped_number), 0);
      let added = 0;
      let replaced = 0;
      valid.forEach((item) => {
        const found = existing.get(item.name);
        if (found) {
          replaced += 1;
          existing.set(item.name, { ...item, scoped_number: found.scoped_number });
        } else {
          added += 1;
          nextNumber += 1;
          existing.set(item.name, { ...item, scoped_number: nextNumber });
        }
      });
      setPool(Array.from(existing.values()));
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

  const handleReview = () => {
    if (!hasChanges) {
      notify('Make at least one change to the inventory before reviewing.', 'error');
      return;
    }
    setStep('review');
  };

  const handleClearDraft = () => {
    if (!window.confirm('Clear your current suggestion draft? This cannot be undone.')) return;
    skipNextDraftSaveRef.current = true;
    clearDraft(templateId);
    setDescription('');
    setPool(original.map((comp) => ({ ...comp, effects: (comp.effects ?? []).map((e) => ({ ...e })) })));
    setFilterText('');
    setFilterCategory('all');
    setStatsFilter('all');
    setFilterSort('oldest_first');
    notify('Suggestion draft cleared.', 'info');
  };

  const handleSubmit = async () => {
    if (!hasChanges) {
      notify('Make at least one change to the inventory before submitting.', 'error');
      return;
    }
    setIsSubmitting(true);
    try {
      await createSuggestion(templateId, {
        description: description.trim() || undefined,
        added: diff.added.map((comp) => toSuggestionPayloadComponent(comp, comp.scoped_number)),
        edited: diff.edited.map((comp) => toSuggestionPayloadComponent(comp, comp.scoped_number)),
        removed: diff.removedNumbers,
      });
      clearDraft(templateId);
      notify('Suggestion submitted for review.', 'success');
      onClose();
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Failed to submit suggestion.', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  const originalByNumber = useMemo(
    () => new Map(original.map((comp) => [comp.scoped_number, comp])),
    [original]
  );

  const { showTooltip, hideTooltip, updatePosition } = useTooltip();

  const renderComponentCard = (comp: PoolComponent | Component, editable: boolean) => {
    const onEdit = editable ? () => handleEditComponent(comp as PoolComponent) : undefined;
    return (
      <div
        key={`${'scoped_number' in comp ? comp.scoped_number : comp.id}-${comp.name}`}
        className={`component-card ${editable ? 'clickable' : ''}`}
        onClick={onEdit}
        tabIndex={editable ? 0 : undefined}
        onKeyDown={(e) => {
          if (editable && (e.key === 'Enter' || e.key === ' ')) {
            e.preventDefault();
            onEdit?.();
          }
        }}
        onMouseEnter={(e) => showTooltip(comp, e)}
        onMouseMove={updatePosition}
        onMouseLeave={hideTooltip}
        onFocus={(e) => showTooltip(comp, e)}
        onBlur={hideTooltip}
      >
        {editable && (
          <button
            type="button"
            className="component-card-delete"
            onClick={(e) => {
              e.stopPropagation();
              handleQuickDelete(comp as PoolComponent);
            }}
            onMouseEnter={hideTooltip}
            aria-label={`Remove ${comp.name}`}
            title="Remove"
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
    );
  };

  const renderSection = (title: string, count: number, tone: 'added' | 'edited' | 'removed', emptyText: string) => (
    <div className={`suggestion-review-section ${tone}`}>
      <h4 className="suggestion-review-heading">
        <span className="suggestion-review-count">{count}</span> {title}
      </h4>
      {count === 0 ? (
        <p className="no-stats-text">{emptyText}</p>
      ) : (
        <div className="component-grid">{renderSectionItems(tone)}</div>
      )}
    </div>
  );

  const renderSectionItems = (tone: 'added' | 'edited' | 'removed') => {
    if (tone === 'added') return diff.added.map((comp) => renderComponentCard(comp, false));
    if (tone === 'edited') return diff.edited.map((comp) => renderComponentCard(comp, false));
    return diff.removedNumbers
      .map((number) => originalByNumber.get(number))
      .filter((comp): comp is PoolComponent => Boolean(comp))
      .map((comp) => renderComponentCard(comp, false));
  };

  return (
    <>
      {open && (
        <div className="modal-overlay">
          <div className="modal-content suggestion-inventory-modal">
            <div className="modal-actions-bar">
              <div>
                <h3 style={{ margin: 0 }}>
                  {step === 'review' ? 'Review your changes' : 'Create public inventory suggestion'}
                </h3>
                <p className="panel-subtitle">
                  {step === 'review' ? (
                    <>
                      Confirm the changes you are proposing for <strong>{templateName}</strong>.
                    </>
                  ) : (
                    <>
                      Edit the inventory for <strong>{templateName}</strong> however you like. Your
                      changes are compared to the current pool and split into added, edited and
                      removed before submitting.
                    </>
                  )}
                </p>
              </div>
            </div>

            <div className="modal-body">
              {loading ? (
                <p className="no-stats-text">Loading inventory...</p>
              ) : (
                <>
                  <label>
                    Description
                    <textarea
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      rows={2}
                      placeholder="Briefly explain your changes (optional)"
                    />
                  </label>

                  {step === 'edit' ? (
                    <>
                      <div className="component-toolbar" style={{ marginTop: '1rem' }}>
                        <div
                          style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            gap: '0.75rem',
                            flexWrap: 'wrap',
                          }}
                        >
                          <h3 style={{ margin: 0 }}>Proposed inventory ({pool.length})</h3>
                          <div style={{ display: 'flex', gap: '0.5rem' }}>
                            <button
                              type="button"
                              onClick={handleClearDraft}
                              className="secondary danger small"
                              title="Discard your draft and reset the inventory to the template's current pool"
                            >
                              Clear
                            </button>
                            <button
                              type="button"
                              onClick={handleCopyComponents}
                              className="secondary small"
                              title="Copy the proposed pool as JSON"
                            >
                              Copy JSON
                            </button>
                            <button
                              type="button"
                              onClick={handleOpenImport}
                              className="secondary small"
                              title="Paste JSON to add or replace components"
                            >
                              Paste JSON
                            </button>
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
                                <option key={cat} value={cat}>
                                  {cat}
                                </option>
                              ))}
                            </select>
                            <select value={statsFilter} onChange={(e) => setStatsFilter(e.target.value)}>
                              <option value="all">All stats</option>
                              {knownStats.map((stat) => (
                                <option key={stat} value={stat}>
                                  {stat}
                                </option>
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
                        {paginatedComponents.map((comp) => renderComponentCard(comp, true))}
                        <button type="button" className="component-card component-card-add" onClick={handleOpenComponentEditor}>
                          <span>+</span>
                          <strong>New Component</strong>
                        </button>
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
                    </>
                  ) : (
                    <div className="suggestion-review-sections">
                      {renderSection(
                        'Added',
                        diff.added.length,
                        'added',
                        'No new components.'
                      )}
                      {renderSection(
                        'Edited',
                        diff.edited.length,
                        'edited',
                        'No edits to existing components.'
                      )}
                      {renderSection(
                        'Removed',
                        diff.removedNumbers.length,
                        'removed',
                        'No components removed.'
                      )}
                    </div>
                  )}
                </>
              )}
            </div>

            <div className="modal-footer" style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end', marginTop: '1.5rem' }}>
              {step === 'review' ? (
                <>
                  <button type="button" onClick={() => setStep('edit')} className="secondary">
                    Back
                  </button>
                  <button type="button" onClick={onClose} className="secondary">
                    Cancel
                  </button>
                  <button type="button" onClick={handleSubmit} disabled={isSubmitting} className="primary">
                    {isSubmitting ? 'Submitting...' : 'Submit Suggestion'}
                  </button>
                </>
              ) : (
                <>
                  <button type="button" onClick={onClose} className="secondary">
                    Cancel
                  </button>
                  <button type="button" onClick={handleReview} className="primary">
                    Review Changes
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      <ComponentEditorModal
        open={isComponentEditorOpen}
        initial={editingComponent}
        availableCategories={availableCategories}
        availableSlots={availableSlots}
        knownStats={knownStats}
        heading={editingComponent ? 'Edit Suggested Component' : 'New Suggested Component'}
        submitLabel={editingComponent ? 'Save Changes' : 'Add to Inventory'}
        onClose={() => {
          setIsComponentEditorOpen(false);
          setEditingComponent(null);
        }}
        onSave={handleSaveComponent}
        onDelete={editingComponent ? handleDeleteComponent : undefined}
      />

      {isImportOpen && (
        <div className="modal-overlay" onClick={() => setIsImportOpen(false)}>
          <div className="modal-content import-json-form" onClick={(e) => e.stopPropagation()}>
            <h3>Paste Component Pool JSON</h3>
            <p className="hint-label">
              Paste a JSON array of components. By default, imported components are added and any
              component already present with the same name is replaced.
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
              <span>
                <strong>Empty component pool and replace</strong>
              </span>
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
    </>
  );
}
