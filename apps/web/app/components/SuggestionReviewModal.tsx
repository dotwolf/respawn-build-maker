'use client';

import { useEffect, useMemo, useState } from 'react';
import { useNotification } from './NotificationProvider';
import { useTooltip } from './TooltipProvider';
import type { ComponentTooltipData } from './TooltipProvider';
import { deleteSuggestion, listSuggestions } from '../lib/suggestions';
import type { Suggestion } from '../lib/suggestions';
import type { Component } from '../templates/new/page';
import { apiFetch } from '../lib/api';

interface SuggestionReviewModalProps {
  open: boolean;
  templateId: string;
  templateName: string;
  onClose: () => void;
  onAccepted?: (suggestion: Suggestion) => void;
}

interface DiffSummary {
  added: Component[];
  edited: Component[];
  removed: number[];
}

const summarize = (suggestion: Suggestion): DiffSummary => ({
  added: suggestion.added ?? [],
  edited: suggestion.edited ?? [],
  removed: suggestion.removed ?? [],
});

function SectionCard({
  count,
  title,
  tone,
  components,
  beforeOf,
}: {
  count: number;
  title: string;
  tone: string;
  components: Component[];
  beforeOf?: (comp: Component) => Component | undefined;
}) {
  const { showTooltip, hideTooltip, updatePosition } = useTooltip();

  const tooltipFor = (comp: Component): ComponentTooltipData => {
    const before = beforeOf?.(comp);
    return before ? { ...comp, before } : comp;
  };

  return (
    <div className={`suggestion-review-section ${tone}`}>
      <h4 className="suggestion-review-heading">
        <span className="suggestion-review-count">{count}</span> {title}
      </h4>
      {count === 0 ? (
        <p className="no-stats-text">None.</p>
      ) : (
        <div className="component-grid">
          {components.map((comp, idx) => (
            <div
              key={`${comp.name}-${idx}`}
              className="component-card"
              tabIndex={0}
              onMouseEnter={(e) => showTooltip(tooltipFor(comp), e)}
              onMouseMove={updatePosition}
              onMouseLeave={hideTooltip}
              onFocus={(e) => showTooltip(tooltipFor(comp), e)}
              onBlur={hideTooltip}
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
                {comp.has_levels && (
                  <span className="component-card-subcategory">Has levels</span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function SuggestionReviewModal({
  open,
  templateId,
  templateName,
  onClose,
  onAccepted,
}: SuggestionReviewModalProps) {
  const { notify } = useNotification();

  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [originalComponents, setOriginalComponents] = useState<(Component & { scoped_number?: number })[]>([]);

  useEffect(() => {
    if (!open) return;
    setSuggestions([]);
    setExpandedId(null);
    setLoading(true);
    listSuggestions(templateId)
      .then((data) => setSuggestions(Array.isArray(data) ? data : []))
      .catch((error) => notify(error instanceof Error ? error.message : 'Failed to load suggestions.', 'error'))
      .finally(() => setLoading(false));
    apiFetch(`/templates/${encodeURIComponent(templateId)}`)
      .then((template) =>
        setOriginalComponents(Array.isArray(template?.components) ? template.components : [])
      )
      .catch(() => setOriginalComponents([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, templateId]);

  const componentsByNumber = useMemo(() => {
    const map = new Map<number, Component>();
    originalComponents.forEach((comp) => {
      if (typeof comp.scoped_number === 'number') map.set(comp.scoped_number, comp);
    });
    return map;
  }, [originalComponents]);

  // Accepting only queues the suggestion locally ("zombie" state): the change
  // is applied to the editor but is not committed to the template until the
  // creator saves. Closing or refreshing without saving discards it and the
  // suggestion stays pending.
  const handleAccept = (suggestion: Suggestion) => {
    notify(
      `Queued "${suggestion.author_name || 'a visitor'}'s" suggestion. Save the template to apply it.`,
      'success'
    );
    setSuggestions((prev) => prev.filter((s) => s.id !== suggestion.id));
    onAccepted?.(suggestion);
  };

  const handleDelete = async (suggestion: Suggestion) => {
    if (!window.confirm('Delete this suggestion? The author will not be notified.')) return;
    setProcessingId(suggestion.id);
    try {
      await deleteSuggestion(templateId, suggestion.id);
      notify('Suggestion deleted.', 'success');
      setSuggestions((prev) => prev.filter((s) => s.id !== suggestion.id));
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Failed to delete suggestion.', 'error');
    } finally {
      setProcessingId(null);
    }
  };

  const totalChanges = (suggestion: Suggestion) =>
    (suggestion.added?.length ?? 0) + (suggestion.edited?.length ?? 0) + (suggestion.removed?.length ?? 0);

  return (
    <>
      {open && (
        <div className="modal-overlay" onClick={onClose}>
          <div className="modal-content suggestion-review-form suggestion-review-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-actions-bar">
              <div>
                <h3 style={{ margin: 0 }}>Public Inventory Suggestions</h3>
                <p className="panel-subtitle">
                  Review community suggestions for <strong>{templateName}</strong>. Accepted
                  suggestions are queued and applied to the inventory when you save the template.
                  Closing or refreshing without saving discards them.
                </p>
              </div>
            </div>

            <div className="modal-body">
              {loading ? (
                <p className="no-stats-text">Loading suggestions...</p>
              ) : suggestions.length === 0 ? (
                <p className="no-stats-text">No pending suggestions right now.</p>
              ) : (
                <div className="suggestion-list">
                  {suggestions.map((suggestion) => {
                    const expanded = expandedId === suggestion.id;
                    const diff = summarize(suggestion);
                    const removedComponents = diff.removed
                      .map((number) => componentsByNumber.get(number))
                      .filter((comp): comp is Component => Boolean(comp));
                    return (
                      <div key={suggestion.id} className="suggestion-card">
                        <button
                          type="button"
                          className="suggestion-card-header"
                          onClick={() => setExpandedId(expanded ? null : suggestion.id)}
                        >
                          <div>
                            <strong>{suggestion.author_name || 'Unknown author'}</strong>
                            <span className="suggestion-meta">
                              {totalChanges(suggestion)} change
                              {totalChanges(suggestion) === 1 ? '' : 's'}
                              {suggestion.created_at
                                ? ` · ${new Date(suggestion.created_at).toLocaleDateString('en-US', {
                                    year: 'numeric',
                                    month: 'short',
                                    day: 'numeric',
                                  })}`
                                : ''}
                            </span>
                          </div>
                          <span className="suggestion-expand">{expanded ? '−' : '+'}</span>
                        </button>

                        {expanded && (
                          <div className="suggestion-card-body">
                            {suggestion.description && (
                              <p className="suggestion-description">{suggestion.description}</p>
                            )}
                            <div className="suggestion-review-sections">
                              <SectionCard
                                count={diff.added.length}
                                title="Added"
                                tone="added"
                                components={diff.added}
                              />
                              <SectionCard
                                count={diff.edited.length}
                                title="Edited"
                                tone="edited"
                                components={diff.edited}
                                beforeOf={(comp) =>
                                  componentsByNumber.get(
                                    (comp as Component & { scoped_number?: number }).scoped_number ?? -1
                                  )
                                }
                              />
                              <SectionCard
                                count={removedComponents.length}
                                title="Removed"
                                tone="removed"
                                components={removedComponents}
                              />
                            </div>
                            <div className="page-actions" style={{ justifyContent: 'flex-end', marginTop: '1rem' }}>
                              <button
                                type="button"
                                className="secondary danger"
                                onClick={() => handleDelete(suggestion)}
                                disabled={processingId === suggestion.id}
                              >
                                Delete
                              </button>
                              <button
                                type="button"
                                onClick={() => handleAccept(suggestion)}
                              >
                                Accept
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="modal-footer" style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end', marginTop: '1.5rem' }}>
              <button type="button" onClick={onClose} className="secondary">
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
