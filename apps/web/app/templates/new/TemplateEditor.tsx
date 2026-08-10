'use client';

import { useEffect, useRef, useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useNotification } from '../../components/NotificationProvider';
import { TooltipProvider } from '../../components/TooltipProvider';
import { apiFetch } from '../../lib/api';
import { normalizeTemplateStats } from '../../lib/stats';
import type { StatDefinition } from '../../lib/stats';
import { getSlotRules } from '../../lib/buildMath';
import TemplateBasicsStep from './steps/TemplateBasicsStep';
import TemplateComponentsStep from './steps/TemplateComponentsStep';
import SlotSection from './components/SlotSection';
import SlotCanvas from './components/SlotCanvas';
import ConstraintSection from './components/ConstraintSection';
import SuggestionCreateModal from '../../components/SuggestionCreateModal';
import SuggestionReviewModal from '../../components/SuggestionReviewModal';
import { acceptSuggestion, countPendingSuggestions } from '../../lib/suggestions';
import type { Suggestion } from '../../lib/suggestions';

export interface SlotPosition {
  x: number;
  y: number;
}

export type SlotRule = 'stat_points' | 'formula' | 'class_points';

export interface SlotStats {
  /** Legacy single-rule form (kept for backward compatibility with persisted data). */
  rule?: SlotRule;
  /** Multi-rule form — all active rules for the slot. */
  rules?: SlotRule[];
  points_per_level?: number;
  min_level?: number;
  max_level?: number;
  stats: string[];
  formulas?: Record<string, string>;
  classes?: string[];
  class_formulas?: Record<string, Record<string, string>>;
}

export interface Slot {
  slot_name: string;
  shown_name?: string;
  accepts: string[];
  limit?: number;
  position?: SlotPosition;
  color?: string;
  textColor?: string;
  size?: number;
  transparency?: number;
  stats?: SlotStats;
}

export interface Effect {
  type: 'flat' | 'percent_add' | 'multiplier';
  scope: 'global' | 'slot';
  stat: string;
  value: number;
}

export interface Tier {
  tier_number: number;
  label: string;
  effects: Effect[];
}

export interface Component {
  id?: string;
  name: string;
  category: string;
  description?: string;
  sub_category?: string;
  effects: Effect[];
  has_levels: boolean;
  level_scaling: 'formula' | 'tiers' | null;
  level_rule?: {
    type: 'formula' | 'tiers';
    formulas?: Record<string, string>;
    formula?: string;
    max_level?: number;
    tiers?: Tier[];
  } | null;
}

export interface Constraint {
  id?: string;
  type: 'seal' | 'mutual_exclusion' | 'global_limit' | 'unique' | 'pool_unique';
  if_category?: string;
  seals_slot?: string;
  slots?: [string, string];
  category?: string;
  limit?: number;
}

export interface Rules {
  slots: Slot[];
  constraints: Constraint[];
}

export interface Auth {
  user: {
    id: number;
    email: string;
  };
  token: string;
}

export type TemplateEditorMode = 'create' | 'view' | 'edit';

export function TemplateEditor({
  templateId,
  mode = 'create',
}: {
  templateId?: string;
  mode?: TemplateEditorMode;
}) {
  const router = useRouter();
  const { notify } = useNotification();
  const [isLoading, setIsLoading] = useState(true);
  const [auth, setAuth] = useState<Auth | null>(null);

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [isPrivate, setIsPrivate] = useState(false);
  const [allowSuggestions, setAllowSuggestions] = useState(false);

  const [slots, setSlots] = useState<Slot[]>([]);
  const [constraints, setConstraints] = useState<Constraint[]>([]);
  const [components, setComponents] = useState<Component[]>([]);
  const [selectedSlotIndex, setSelectedSlotIndex] = useState<number | null>(null);
  const [templateStats, setTemplateStats] = useState<StatDefinition[]>([]);

  const [isSuggestionCreateOpen, setIsSuggestionCreateOpen] = useState(false);
  const [isSuggestionReviewOpen, setIsSuggestionReviewOpen] = useState(false);
  const [pendingSuggestionCount, setPendingSuggestionCount] = useState(0);
  // Suggestions accepted in the review modal but not yet committed to the
  // server. They only take effect once the template is saved; refreshing or
  // closing without saving discards them and they stay pending server-side.
  const [acceptedSuggestions, setAcceptedSuggestions] = useState<Suggestion[]>([]);
  // Tracks suggestion ids whose changes have already been merged into the local
  // pool so a suggestion can never be applied twice (which would duplicate its
  // added components).
  const appliedSuggestionIdsRef = useRef<Set<string>>(new Set());

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [panelWidths, setPanelWidths] = useState({ left: 25, middle: 50, right: 25 });
  const [draggingDivider, setDraggingDivider] = useState<'left' | 'right' | null>(null);
  const [creatorUserId, setCreatorUserId] = useState<number | null>(null);
  const [templateLoaded, setTemplateLoaded] = useState(false);
  const [loadedSnapshot, setLoadedSnapshot] = useState<string | null>(
    mode === 'create'
      ? JSON.stringify({ name: '', description: '', isPrivate: false, allowSuggestions: false, slots: [], constraints: [], components: [], templateStats: [] })
      : null
  );
  const [pendingLeave, setPendingLeave] = useState<string | null>(null);
  const editorShellRef = useRef<HTMLDivElement | null>(null);
  const allowUnloadRef = useRef(false);

  const currentSnapshot = useMemo(
    () => JSON.stringify({ name, description, isPrivate, allowSuggestions, slots, constraints, components, templateStats }),
    [name, description, isPrivate, allowSuggestions, slots, constraints, components, templateStats]
  );

  const isCreator = mode === 'view' && auth?.user != null && creatorUserId != null && creatorUserId === auth.user.id;
  const hasUnsavedChanges = loadedSnapshot !== null && currentSnapshot !== loadedSnapshot;
  const isDirty = mode !== 'view' && hasUnsavedChanges;

  useEffect(() => {
    if (!templateLoaded) return;
    setLoadedSnapshot(currentSnapshot);
    setTemplateLoaded(false);
  }, [templateLoaded, currentSnapshot]);

  // Automatically derive all unique stats defined across components and slot
  // stat-point/level/class formulas (guaranteed array fallback)
  const derivedStats = useMemo(() => {
    const statSet = new Set<string>();

    components.forEach((comp) => {
      // Direct component effects
      comp.effects?.forEach((eff) => {
        if (eff.stat && eff.stat.trim()) {
          statSet.add(eff.stat.trim());
        }
      });

      // Tier/Level specific effects if present
      comp.level_rule?.tiers?.forEach((tier) => {
        tier.effects?.forEach((eff) => {
          if (eff.stat && eff.stat.trim()) {
            statSet.add(eff.stat.trim());
          }
        });
      });
    });

    // Slot-defined stats: stat point options, level formula keys, and class
    // formula keys. These are priorities the optimizer must be able to see.
    slots.forEach((slot) => {
      const stats = slot.stats;
      if (!stats) return;
      const rules = getSlotRules(stats);

      if (rules.includes('stat_points')) {
        (stats.stats || []).forEach((stat) => {
          if (stat && stat.trim()) statSet.add(stat.trim());
        });
      }
      if (rules.includes('formula')) {
        Object.keys(stats.formulas || {}).forEach((stat) => {
          if (stat && stat.trim()) statSet.add(stat.trim());
        });
      }
      if (rules.includes('class_points')) {
        Object.keys(stats.class_formulas || {}).forEach((className) => {
          Object.keys(stats.class_formulas?.[className] || {}).forEach((stat) => {
            if (stat && stat.trim()) statSet.add(stat.trim());
          });
        });
      }
    });

    const statsArray = Array.from(statSet).sort();
    return statsArray.length > 0 ? statsArray : [];
  }, [components, slots]);

  // Authentication check
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const stored = window.localStorage.getItem('respawn-auth');
    if (!stored && mode !== 'view') {
      notify('You must be logged in to create a new Template!', 'error');
      router.replace('/profile');
      return;
    }

    if (!stored) {
      setIsLoading(false);
      return;
    }

    try {
      const parsedAuth = JSON.parse(stored) as Auth;
      setAuth(parsedAuth);
    } catch {
      notify('You must be logged in to create a new Template!', 'error');
      router.replace('/profile');
      return;
    }

    setIsLoading(false);
  }, [mode, notify, router]);

  useEffect(() => {
    if (!templateId) return;
    apiFetch(`/templates/${encodeURIComponent(templateId)}`)
      .then((template) => {
        const rules = template.rules && typeof template.rules === 'object' ? template.rules : {};
        setName(template.name ?? '');
        setDescription(template.description ?? '');
        setIsPrivate(Boolean(template.is_private));
        setAllowSuggestions(Boolean(template.allow_suggestions));
        setSlots(
          Array.isArray(rules.slots)
            ? rules.slots.map((slot: Slot, index: number) => ({
                ...slot,
                position: slot.position ?? {
                  x: 32 + (index % 3) * 124,
                  y: 32 + Math.floor(index / 3) * 124,
                },
              }))
            : []
        );
        setConstraints(Array.isArray(rules.constraints) ? rules.constraints : []);
        setComponents(Array.isArray(template.components) ? template.components : []);
        setTemplateStats(normalizeTemplateStats(template.stats));
        setCreatorUserId(template.creator_user_id ?? null);
        setTemplateLoaded(true);
      })
      .catch((error) => notify(error instanceof Error ? error.message : 'Failed to load template.', 'error'));
  }, [templateId, notify]);

  // Refresh the pending-suggestion count for the review badge (edit mode only).
  const refreshSuggestionCount = () => {
    if (mode === 'create' || !templateId) return;
    countPendingSuggestions()
      .then(setPendingSuggestionCount)
      .catch(() => setPendingSuggestionCount(0));
  };

  // Apply an accepted suggestion's changeset to the local component pool and
  // queue it for commit. Only the components the suggestion touched are
  // updated, so any other unsaved edits the creator has made are preserved.
  const handleSuggestionAccepted = (suggestion: Suggestion) => {
    setAcceptedSuggestions((prev) => [...prev.filter((s) => s.id !== suggestion.id), suggestion]);
    setComponents((prev) => {
      const scopedOf = (comp: Component): number | undefined =>
        (comp as Component & { scoped_number?: number }).scoped_number;

      const removedSet = new Set(suggestion.removed ?? []);
      const editedByNumber = new Map<number, Component>();
      (suggestion.edited ?? []).forEach((comp) => {
        const scoped = scopedOf(comp);
        if (typeof scoped === 'number') editedByNumber.set(scoped, comp);
      });

      let maxNumber = 0;
      const kept = prev.filter((comp) => {
        const scoped = scopedOf(comp);
        if (typeof scoped !== 'number') return true;
        maxNumber = Math.max(maxNumber, scoped);
        return !removedSet.has(scoped);
      });

      const merged = kept.map((comp) => {
        const scoped = scopedOf(comp);
        const replacement = typeof scoped === 'number' ? editedByNumber.get(scoped) : undefined;
        return replacement ? { ...comp, ...replacement } : comp;
      });

      const added = (suggestion.added ?? []).map((comp, idx) => ({
        ...comp,
        scoped_number: maxNumber + idx + 1,
      }));

      return [...merged, ...added];
    });
  };

  useEffect(() => {
    refreshSuggestionCount();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, templateId]);

  // Keep the ordered stat list in sync with the component pool: preserve the
  // author's order/group/negative flags for existing stats, append new ones.
  useEffect(() => {
    setTemplateStats((prev) => {
      const next = prev.filter((def) => derivedStats.includes(def.name));
      const seen = new Set(next.map((def) => def.name));
      derivedStats.forEach((name) => {
        if (!seen.has(name)) {
          next.push({ name });
          seen.add(name);
        }
      });
      return next.length === prev.length ? prev : next;
    });
  }, [derivedStats]);

  // Lock body scroll during full-screen editor layout
  useEffect(() => {
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = originalOverflow;
    };
  }, []);

  // Warn user before leaving page if there are unsaved changes
  useEffect(() => {
    if (!isDirty) return;

    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      if (allowUnloadRef.current || isSubmitting) return;
      event.preventDefault();
      event.returnValue = '';
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [isDirty, isSubmitting]);

  // Block in-app link navigation while there are unsaved changes and ask for
  // confirmation instead. Uses the capture phase so it runs before the link's
  // own handler and Next's client-side router.
  useEffect(() => {
    if (!isDirty) return;

    const isSamePage = (href: string) => {
      if (href.startsWith('#') || href.startsWith('mailto:') || href.startsWith('tel:')) return true;
      try {
        const base = new URL(window.location.href);
        const target = new URL(href, base);
        return target.origin === base.origin && target.pathname === base.pathname && target.search === base.search;
      } catch {
        return true;
      }
    };

    const handleClick = (event: MouseEvent) => {
      if (
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey ||
        event.defaultPrevented
      ) {
        return;
      }
      const anchor = (event.target as Element | null)?.closest?.('a[href]') as HTMLAnchorElement | null;
      if (!anchor) return;
      if (anchor.target === '_blank' || anchor.hasAttribute('download')) return;
      const href = anchor.getAttribute('href') ?? '';
      if (!href || isSamePage(href)) return;
      event.preventDefault();
      event.stopPropagation();
      setPendingLeave(href);
    };

    document.addEventListener('click', handleClick, true);
    return () => document.removeEventListener('click', handleClick, true);
  }, [isDirty]);

  const handleConfirmLeave = () => {
    const href = pendingLeave;
    if (!href) return;
    setPendingLeave(null);
    allowUnloadRef.current = true;
    if (href.startsWith('/') || href.startsWith('#')) {
      router.push(href);
    } else {
      window.location.assign(href);
    }
  };

  // Panel Resizing via Pointer Events
  useEffect(() => {
    if (!draggingDivider) return;

    const handlePointerMove = (event: PointerEvent) => {
      const shell = editorShellRef.current;
      if (!shell) return;

      const rect = shell.getBoundingClientRect();
      const percentage = ((event.clientX - rect.left) / rect.width) * 100;
      const clamp = (val: number, min: number, max: number) => Math.min(Math.max(val, min), max);

      if (draggingDivider === 'left') {
        const nextLeft = clamp(percentage, 15, 100 - panelWidths.right - 20);
        const nextMiddle = 100 - nextLeft - panelWidths.right;
        setPanelWidths((prev) => ({ ...prev, left: nextLeft, middle: nextMiddle }));
      } else {
        const nextRight = clamp(100 - percentage, 15, 100 - panelWidths.left - 20);
        const nextMiddle = 100 - panelWidths.left - nextRight;
        setPanelWidths((prev) => ({ ...prev, middle: nextMiddle, right: nextRight }));
      }
    };

    const handlePointerUp = () => setDraggingDivider(null);

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);

    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
    };
  }, [draggingDivider, panelWidths.left, panelWidths.right]);

  const validateTemplate = (): boolean => {
    const newErrors: string[] = [];

    if (!name.trim()) newErrors.push('Template name is required.');

    if (slots.length === 0) {
      newErrors.push('At least one slot must be defined.');
    } else {
      const seenNames = new Set<string>();
      for (const slot of slots) {
        if (seenNames.has(slot.slot_name)) {
          newErrors.push(`Duplicate slot name: "${slot.slot_name}".`);
        }
        seenNames.add(slot.slot_name);

        if (slot.accepts.length === 0) {
          newErrors.push(`Slot "${slot.slot_name}" must have at least one accepted category.`);
        }
      }
    }

    const constraintKeys = new Set<string>();
    for (const constraint of constraints) {
      let key = constraint.type;
      if (constraint.type === 'seal') {
        key += `_${constraint.if_category}_${constraint.seals_slot}`;
      } else if (constraint.type === 'mutual_exclusion') {
        const sorted = [...(constraint.slots ?? [])].sort().join('_');
        key += `_${sorted}`;
      } else if (
        constraint.type === 'global_limit' ||
        constraint.type === 'unique' ||
        constraint.type === 'pool_unique'
      ) {
        key += `_${constraint.category}`;
      }

      if (constraintKeys.has(key)) {
        newErrors.push('Duplicate constraint detected.');
      }
      constraintKeys.add(key);
    }

    if (components.length === 0) newErrors.push('At least one component is required.');

    for (let i = 0; i < components.length; i++) {
      const comp = components[i];
      if (!comp.name.trim()) newErrors.push(`Component ${i + 1}: name is required.`);
      if (!comp.category.trim()) newErrors.push(`Component ${i + 1}: category is required.`);

      for (let j = 0; j < comp.effects.length; j++) {
        const effect = comp.effects[j];
        if (!effect.stat.trim()) newErrors.push(`Component ${i + 1} Effect ${j + 1}: stat is required.`);
        if (typeof effect.value !== 'number' || Number.isNaN(effect.value)) {
          newErrors.push(`Component ${i + 1} Effect ${j + 1}: value must be numeric.`);
        }
      }
    }

    newErrors.forEach((err) => notify(err, 'error'));

    return newErrors.length === 0;
  };

  const handleSubmit = async () => {
    if (!validateTemplate() || !auth) return;

    setIsSubmitting(true);
    notify('Submitting template...', 'info');

    try {
      const authHeader = { Authorization: `Bearer ${auth.token}` };

      const formattedComponents = components.map((component, index) => ({
        scoped_number: index + 1,
        name: component.name,
        category: component.category,
        sub_category: component.sub_category || undefined,
        description: component.description || undefined,
        effects: component.effects,
        has_levels: component.has_levels,
        level_scaling: component.level_scaling,
        level_rule: component.level_rule || null,
      }));

      // Ordered stat definitions (name + group + negative flag) derived from components
      const payloadStats = templateStats;

      const response = await apiFetch(mode === 'edit' && templateId ? `/templates/${encodeURIComponent(templateId)}` : '/templates/full', {
        method: mode === 'edit' ? 'PUT' : 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...authHeader,
        },
        body: JSON.stringify({
          name,
          description,
          rules: { slots, constraints },
          is_private: isPrivate,
          allow_suggestions: allowSuggestions,
          stats: payloadStats,
          components: formattedComponents,
        }),
      });

      const savedTemplateId = response.id;

      // Commit any accepted-but-not-yet-saved suggestions now that the template
      // itself has been persisted. A failed finalize keeps the suggestion queued
      // so a subsequent save can retry it.
      if (templateId && acceptedSuggestions.length > 0) {
        const failedFinalizes: Suggestion[] = [];
        for (const suggestion of acceptedSuggestions) {
          try {
            await acceptSuggestion(templateId, suggestion.id);
          } catch {
            failedFinalizes.push(suggestion);
          }
        }
        setAcceptedSuggestions(failedFinalizes);
        if (failedFinalizes.length === 0) {
          refreshSuggestionCount();
          notify(
            `Applied ${acceptedSuggestions.length} queued suggestion${acceptedSuggestions.length === 1 ? '' : 's'} and notified the author${acceptedSuggestions.length === 1 ? '' : 's'}.`,
            'success'
          );
        } else {
          notify(
            `${failedFinalizes.length} queued suggestion${failedFinalizes.length === 1 ? '' : 's'} could not be finalized and will be retried on your next save.`,
            'error'
          );
        }
      }

      if (mode === 'edit') {
        notify('Template updated successfully.', 'success');
        setLoadedSnapshot(currentSnapshot);
        setIsSubmitting(false);
      } else {
        notify('Template created successfully.', 'success');
        router.replace(`/templates/${savedTemplateId}/edit`);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to create template.';
      notify(message, 'error');
      setIsSubmitting(false);
    }
  };

  const handleSwitchToView = () => {
    if (hasUnsavedChanges && !window.confirm('You have unsaved changes. Switch to view mode anyway?')) {
      return;
    }
    if (templateId) router.push(`/templates/${templateId}`);
  };

  const handleDeleteTemplate = async () => {
    if (!templateId || !auth || !window.confirm('Delete this template? This cannot be undone.')) return;
    try {
      await apiFetch(`/templates/${encodeURIComponent(templateId)}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${auth.token}` },
      });
      notify('Template deleted.', 'success');
      router.replace('/profile');
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Failed to delete template.', 'error');
    }
  };

  const availableCategories = Array.from(
    new Set(slots.flatMap((s) => s.accepts))
  ).sort();

  if (isLoading || (mode !== 'view' && !auth)) {
    return <div className="page-header">Loading...</div>;
  }

  return (
    <TooltipProvider>
      <main>
        <div
          className="template-editor-shell"
          ref={editorShellRef}
          style={{
            gridTemplateColumns: `${panelWidths.left}% 8px ${panelWidths.middle}% 8px ${panelWidths.right}%`,
          }}
        >
          {/* Left Column */}
          <section className="template-column">
            <h3>Information and Rules</h3>
            <p className="panel-subtitle">Set the identity, visibility, and rules for your template.</p>
            <TemplateBasicsStep
              name={name}
              setName={setName}
              description={description}
              setDescription={setDescription}
              isPrivate={isPrivate}
              setIsPrivate={setIsPrivate}
              allowSuggestions={allowSuggestions}
              setAllowSuggestions={setAllowSuggestions}
              stats={templateStats}
              setStats={setTemplateStats}
              readOnly={mode === 'view'}
            />
            <SlotSection
              slots={slots}
              setSlots={setSlots}
              selectedSlotIndex={selectedSlotIndex}
              setSelectedSlotIndex={setSelectedSlotIndex}
              readOnly={mode === 'view'}
            />
            <ConstraintSection
              constraints={constraints}
              setConstraints={setConstraints}
              availableCategories={availableCategories}
              slotNames={slots.map((slot) => slot.slot_name)}
              readOnly={mode === 'view'}
            />
          </section>

          {/* Left Resizer */}
          <div
            className={`panel-resizer${draggingDivider === 'left' ? ' active' : ''}`}
            onPointerDown={(e) => {
              e.preventDefault();
              setDraggingDivider('left');
            }}
            role="separator"
            aria-orientation="vertical"
          />

          {/* Middle Column */}
          <section className="template-column template-column-middle">
            <div className="panel-header">
              <div>
                <h3>Slot Views</h3>
                <p className="panel-subtitle">Drag a slot card to reorder it and click to edit it.</p>
              </div>
            </div>
            <SlotCanvas
              slots={slots}
              setSlots={setSlots}
              selectedSlotIndex={selectedSlotIndex}
              setSelectedSlotIndex={setSelectedSlotIndex}
              readOnly={mode === 'view'}
            />
          </section>

          {/* Right Resizer */}
          <div
            className={`panel-resizer${draggingDivider === 'right' ? ' active' : ''}`}
            onPointerDown={(e) => {
              e.preventDefault();
              setDraggingDivider('right');
            }}
            role="separator"
            aria-orientation="vertical"
          />

          {/* Right Column */}
          <section className="template-column">
            <h3>Component Pool</h3>
            <p className="panel-subtitle">Create all the possible components/items in this Template.</p>
            <TemplateComponentsStep
              components={components}
              setComponents={setComponents}
              availableCategories={availableCategories}
              availableSlots={slots.map((s) => s.slot_name).filter(Boolean)}
              readOnly={mode === 'view'}
            />

            {mode === 'view' && templateId && auth != null && !isCreator && allowSuggestions && (
              <div className="card form-card suggestion-entry">
                <h3 style={{ margin: 0 }}>Create public inventory suggestion</h3>
                <p className="panel-subtitle">
                  Propose new components for this template&apos;s inventory. The author will review
                  and can accept or dismiss your suggestion.
                </p>
                <button type="button" onClick={() => setIsSuggestionCreateOpen(true)}>
                  New Suggestion
                </button>
              </div>
            )}

            {mode !== 'view' && templateId && allowSuggestions && (
              <div className="card form-card suggestion-entry">
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    gap: '0.75rem',
                    flexWrap: 'wrap',
                  }}
                >
                  <div>
                    <h3 style={{ margin: 0 }}>
                      Public Inventory Suggestions
                      {pendingSuggestionCount > 0 && (
                        <span className="badge" style={{ marginLeft: '0.5rem' }}>
                          {pendingSuggestionCount}
                        </span>
                      )}
                    </h3>
                    <p className="panel-subtitle">
                      Review community component suggestions. Accepted components are added to the
                      inventory pool.
                    </p>
                  </div>
                  <button type="button" onClick={() => setIsSuggestionReviewOpen(true)}>
                    Review
                  </button>
                </div>
              </div>
            )}

            {mode === 'view' && templateId && (
              <div className={isCreator ? 'editor-footer-split' : 'editor-footer'}>
                <div className="editor-footer-cell">
                  <div>
                    <h3>Ready to build?</h3>
                    <p className="panel-subtitle">Use this template to create a build.</p>
                  </div>
                  <div className="editor-footer-cell-actions">
                    <button
                      type="button"
                      className="button secondary"
                      onClick={() => router.push(`/builds?template=${encodeURIComponent(templateId)}`)}
                    >
                      Public Builds
                    </button>
                    <button type="button" onClick={() => router.push(`/templates/${templateId}/builds/new`)}>
                      Create Build
                    </button>
                  </div>
                </div>
                {isCreator && (
                  <div className="editor-footer-cell">
                    <div>
                      <h3>Switch to edit mode</h3>
                      <p className="panel-subtitle">Make changes to this template.</p>
                    </div>
                    <button type="button" onClick={() => router.push(`/templates/${templateId}/edit`)}>
                      Edit Template
                    </button>
                  </div>
                )}
              </div>
            )}

            {mode !== 'view' && (
              <div className="editor-footer">
                <div>
                  <h3>Finish Template</h3>
                  <p className="panel-subtitle">
                    {mode === 'edit' ? 'Save changes to this template.' : 'Once the layout and component pool are ready, publish the template.'}
                  </p>
                </div>
                <div className="page-actions">
                  {mode === 'edit' && (
                    <button type="button" className="button secondary" onClick={handleSwitchToView}>
                      Switch to view mode
                    </button>
                  )}
                  <button type="button" onClick={handleSubmit} disabled={isSubmitting}>
                    {isSubmitting ? 'Saving...' : mode === 'edit' ? 'Save Template' : 'Finish Template'}
                  </button>
                  {mode === 'edit' && (
                    <button type="button" className="secondary danger" onClick={handleDeleteTemplate}>
                      Delete Template
                    </button>
                  )}
                </div>
              </div>
            )}
          </section>
        </div>
      </main>

      {isSuggestionCreateOpen && templateId && (
        <SuggestionCreateModal
          open={isSuggestionCreateOpen}
          templateId={templateId}
          templateName={name || 'this template'}
          availableCategories={availableCategories}
          availableSlots={slots.map((s) => s.slot_name).filter(Boolean)}
          onClose={() => setIsSuggestionCreateOpen(false)}
        />
      )}

      {isSuggestionReviewOpen && templateId && (
        <SuggestionReviewModal
          open={isSuggestionReviewOpen}
          templateId={templateId}
          templateName={name || 'this template'}
          onClose={() => setIsSuggestionReviewOpen(false)}
          onAccepted={(suggestion) => {
            handleSuggestionAccepted(suggestion);
            refreshSuggestionCount();
          }}
        />
      )}

      {pendingLeave && (
        <div className="modal-overlay" onClick={() => setPendingLeave(null)}>
          <div
            className="modal-content"
            style={{ maxWidth: 440, padding: '1.5rem' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-actions-bar">
              <h3 style={{ margin: 0 }}>Discard changes?</h3>
            </div>
            <p style={{ marginTop: '1rem' }}>
              You have unsaved changes. Leaving this page will discard your template.
            </p>
            <div
              className="modal-footer"
              style={{ display: 'flex', gap: '.5rem', justifyContent: 'flex-end', marginTop: '1.5rem' }}
            >
              <button type="button" className="button secondary" onClick={() => setPendingLeave(null)}>
                Stay
              </button>
              <button type="button" className="button" onClick={handleConfirmLeave}>
                Leave
              </button>
            </div>
          </div>
        </div>
      )}
    </TooltipProvider>
  );
}

export default function NewTemplatePage() {
  return <TemplateEditor />;
}
