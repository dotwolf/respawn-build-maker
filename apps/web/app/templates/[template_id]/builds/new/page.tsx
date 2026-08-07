'use client';

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { Check, Loader2, Lock, ShieldAlert, Sparkles, X } from 'lucide-react';
import { apiFetch } from '../../../../lib/api';
import { useNotification } from '../../../../components/NotificationProvider';
import { TooltipProvider, useTooltip } from '../../../../components/TooltipProvider';
import FormulaHelp from '../../../../components/FormulaHelp';
import BuildOptimizerModal from '../../../../components/BuildOptimizerModal';
import type { Component, Constraint, Slot, SlotStats } from '../../../new/page';
import {
  collectClassPoints,
  computeCurrentEffects,
  computeSlotRules,
  computeStats,
  constraintDescription,
  formatEffectValue,
  formatStatSummary,
  getConstraintMeasures,
  getDistributionBreakdown,
  getMaxLevel,
  getSealedBy,
  getSlotLevelRange,
  getSlotRules,
  levelLabel,
  mergeSlotRules,
  statQuality,
} from '../../../../lib/buildMath';
import type { EquippedEntry, StatSummary } from '../../../../lib/buildMath';
import { normalizeTemplateStats, orderStats, shouldShowStatDivider, statGroupOf, statIsNegative } from '../../../../lib/stats';
import type { StatDefinition } from '../../../../lib/stats';

interface Auth {
  user: { id: number; email?: string };
  token: string;
}

function getDefaultPosition(index: number) {
  return { x: 32 + (index % 3) * 124, y: 32 + Math.floor(index / 3) * 124 };
}

function getSlotBlockReason(
  slotName: string,
  entries: Record<string, EquippedEntry>,
  sealedBy: Record<string, string[]>,
  constraints: Constraint[]
): string | null {
  const sealerNames = sealedBy[slotName];
  if (sealerNames?.length) {
    return `Slot sealed by ${sealerNames.join(', ')} — cannot equip and stats are excluded`;
  }
  for (const constraint of constraints) {
    if (constraint.type === 'mutual_exclusion' && constraint.slots?.includes(slotName)) {
      const other = constraint.slots.find((name) => name !== slotName);
      if (other && entries[other]) {
        return `Mutually exclusive with ${other}`;
      }
    }
  }
  return null;
}

function getEquipBlockReason(
  slotName: string,
  component: Component,
  entries: Record<string, EquippedEntry>,
  constraints: Constraint[]
): string | null {
  if (entries[slotName]?.component === component) return null;

  for (const constraint of constraints) {
    if (constraint.type === 'mutual_exclusion' && constraint.slots?.includes(slotName)) {
      const other = constraint.slots.find((name) => name !== slotName);
      if (other && entries[other]) {
        return `Mutually exclusive with ${other}`;
      }
    }
  }

  const usedInOtherSlots = (category: string) =>
    Object.entries(entries).filter(([slot, entry]) => slot !== slotName && entry.component.category === category);

  for (const constraint of constraints) {
    if (constraint.type === 'unique' && constraint.category === component.category) {
      if (usedInOtherSlots(constraint.category).length > 0) {
        return `${constraint.category} is unique — already equipped elsewhere`;
      }
    }
    if (constraint.type === 'global_limit' && constraint.category === component.category) {
      const used = usedInOtherSlots(constraint.category).length;
      if (used >= (constraint.limit ?? 1)) {
        return `${constraint.category} limit reached (${used}/${constraint.limit})`;
      }
    }
    if (constraint.type === 'pool_unique' && constraint.category === component.category) {
      const others = usedInOtherSlots(constraint.category);
      if (others.some(([, entry]) => entry.component.name === component.name)) {
        return `Duplicate component not allowed in ${constraint.category} pool`;
      }
      if (others.length >= (constraint.limit ?? 1)) {
        return `${constraint.category} pool full (${others.length}/${constraint.limit})`;
      }
    }
  }
  return null;
}

export default function NewTemplateBuildPage() {
  return (
    <TooltipProvider>
      <BuildEditor />
    </TooltipProvider>
  );
}

function BuildEditor() {
  const params = useParams();
  const router = useRouter();
  const templateId = params.template_id as string;
  const { notify } = useNotification();
  const { showTooltip, refreshTooltip, hideTooltip, updatePosition } = useTooltip();

  const [auth, setAuth] = useState<Auth | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const [templateName, setTemplateName] = useState('');
  const [slots, setSlots] = useState<Slot[]>([]);
  const [constraints, setConstraints] = useState<Constraint[]>([]);
  const [components, setComponents] = useState<Component[]>([]);

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [isPrivate, setIsPrivate] = useState(false);
  const [tags, setTags] = useState('');

  const [equipped, setEquipped] = useState<Record<string, EquippedEntry>>({});
  const [pickerSlot, setPickerSlot] = useState<string | null>(null);
  const [pickerFilter, setPickerFilter] = useState('');
  const [pickerPos, setPickerPos] = useState<{ x: number; y: number } | null>(null);
  const [pickerDrag, setPickerDrag] = useState<{ startX: number; startY: number; originX: number; originY: number } | null>(null);
  const [slotPopover, setSlotPopover] = useState<{ slot: Slot; x: number; y: number } | null>(null);
  const [statPopover, setStatPopover] = useState<{ stat: StatSummary; x: number; y: number } | null>(null);
  const [slotLevels, setSlotLevels] = useState<Record<string, number>>({});
  const [slotDistribution, setSlotDistribution] = useState<Record<string, Record<string, number>>>({});
  const [distSlotName, setDistSlotName] = useState<string | null>(null);
  const [distPos, setDistPos] = useState<{ x: number; y: number } | null>(null);
  const [distDrag, setDistDrag] = useState<{ startX: number; startY: number; originX: number; originY: number } | null>(null);
  const [templateStats, setTemplateStats] = useState<StatDefinition[]>([]);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [optimizerOpen, setOptimizerOpen] = useState(false);
  const [panelWidths, setPanelWidths] = useState({ left: 28, middle: 44, right: 28 });
  const [draggingDivider, setDraggingDivider] = useState<'left' | 'right' | null>(null);
  const editorShellRef = useRef<HTMLDivElement | null>(null);
  const pickerRef = useRef<HTMLDivElement | null>(null);
  const distRef = useRef<HTMLDivElement | null>(null);
  const tooltipSlotRef = useRef<string | null>(null);

  // Authentication + template loading
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const stored = window.localStorage.getItem('respawn-auth');
    if (!stored) {
      notify('You must be logged in to create a build!', 'error');
      router.replace('/profile');
      return;
    }

    try {
      const parsedAuth = JSON.parse(stored) as Auth;
      setAuth(parsedAuth);
    } catch {
      notify('You must be logged in to create a build!', 'error');
      router.replace('/profile');
      return;
    }

    if (!templateId) {
      notify('Invalid template route.', 'error');
      return;
    }

    apiFetch(`/templates/${encodeURIComponent(templateId)}`)
      .then((template) => {
        setTemplateName(template.name ?? '');
        const rules = template.rules && typeof template.rules === 'object' ? template.rules : {};
        const loadedSlots = Array.isArray(rules.slots) ? rules.slots : [];
        setSlots(loadedSlots);
        setConstraints(Array.isArray(rules.constraints) ? rules.constraints : []);
        setComponents(Array.isArray(template.components) ? template.components : []);
        setTemplateStats(normalizeTemplateStats(template.stats));
        const initialLevels: Record<string, number> = {};
        loadedSlots.forEach((slot: Slot) => {
          if (slot.stats) initialLevels[slot.slot_name] = getSlotLevelRange(slot.stats).min;
        });
        setSlotLevels(initialLevels);
      })
      .catch((error) => {
        notify(error instanceof Error ? error.message : 'Failed to load template.', 'error');
        router.replace(`/templates/${encodeURIComponent(templateId)}`);
        return;
      })
      .finally(() => setIsLoading(false));
  }, [templateId, notify, router]);

  // Lock body scroll during the full-screen build editor
  useEffect(() => {
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = originalOverflow;
    };
  }, []);

  // Warn the user before leaving with unsaved work
  useEffect(() => {
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      const hasUnsavedContent =
        name.trim() !== '' ||
        description.trim() !== '' ||
        tags.trim() !== '' ||
        Object.keys(equipped).length > 0;
      if (hasUnsavedContent && !isSubmitting) {
        event.preventDefault();
        event.returnValue = '';
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [name, description, tags, equipped, isSubmitting]);

  // Panel resizing via pointer events
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

  // Center the floating inventory picker over the viewport when it opens
  useLayoutEffect(() => {
    if (!pickerSlot) {
      setPickerPos(null);
      return;
    }
    setPickerFilter('');
    setPickerPos({
      x: Math.max(8, Math.round((window.innerWidth - 620) / 2)),
      y: Math.max(8, Math.round((window.innerHeight - 560) / 2)),
    });
  }, [pickerSlot]);

  // Drag the floating inventory picker by its header
  useEffect(() => {
    if (!pickerDrag) return;

    const handlePointerMove = (event: PointerEvent) => {
      const rect = pickerRef.current?.getBoundingClientRect();
      const width = rect?.width ?? 620;
      const height = rect?.height ?? 560;
      const dx = event.clientX - pickerDrag.startX;
      const dy = event.clientY - pickerDrag.startY;
      const maxX = Math.max(8, window.innerWidth - width - 8);
      const maxY = Math.max(8, window.innerHeight - height - 8);
      const x = Math.min(Math.max(pickerDrag.originX + dx, 8), maxX);
      const y = Math.min(Math.max(pickerDrag.originY + dy, 8), maxY);
      setPickerPos({ x, y });
    };

    const handlePointerUp = () => setPickerDrag(null);

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);

    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
    };
  }, [pickerDrag]);

  // Center the distribution popover over the viewport when it opens
  useEffect(() => {
    if (!distSlotName) {
      setDistPos(null);
      return;
    }
    setDistPos({
      x: Math.max(8, Math.round((window.innerWidth - 260) / 2)),
      y: Math.max(8, Math.round((window.innerHeight - 300) / 2)),
    });
  }, [distSlotName]);

  // Drag the distribution popover by its title bar
  useEffect(() => {
    if (!distDrag) return;

    const handlePointerMove = (event: PointerEvent) => {
      const rect = distRef.current?.getBoundingClientRect();
      const width = rect?.width ?? 260;
      const height = rect?.height ?? 300;
      const dx = event.clientX - distDrag.startX;
      const dy = event.clientY - distDrag.startY;
      const maxX = Math.max(8, window.innerWidth - width - 8);
      const maxY = Math.max(8, window.innerHeight - height - 8);
      const x = Math.min(Math.max(distDrag.originX + dx, 8), maxX);
      const y = Math.min(Math.max(distDrag.originY + dy, 8), maxY);
      setDistPos({ x, y });
    };

    const handlePointerUp = () => setDistDrag(null);

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);

    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
    };
  }, [distDrag]);

  // Close the distribution popover when clicking outside of it
  useEffect(() => {
    if (!distSlotName) return;

    const handlePointerDown = (event: PointerEvent) => {
      if (distRef.current && !distRef.current.contains(event.target as Node)) {
        setDistSlotName(null);
      }
    };

    document.addEventListener('pointerdown', handlePointerDown);
    return () => document.removeEventListener('pointerdown', handlePointerDown);
  }, [distSlotName]);

  const equippedEntries = useMemo(() => Object.values(equipped), [equipped]);

  const sealedBy = useMemo(() => getSealedBy(equipped, constraints), [equipped, constraints]);
  const sealedSlotNames = useMemo(() => new Set(Object.keys(sealedBy)), [sealedBy]);

  const activeEntries = useMemo(
    () => Object.entries(equipped).filter(([slot]) => !sealedSlotNames.has(slot)).map(([, entry]) => entry),
    [equipped, sealedSlotNames]
  );

  const stats = useMemo(() => {
    const base = computeStats(activeEntries);
    const slotRules = computeSlotRules(slots, slotLevels, slotDistribution);
    return mergeSlotRules(base, slotRules);
  }, [activeEntries, slots, slotLevels, slotDistribution]);

  const orderedStats = useMemo(
    () => orderStats(stats, templateStats, (summary) => summary.stat),
    [stats, templateStats]
  );

  const constraintMeasures = useMemo(
    () => getConstraintMeasures(equipped, constraints),
    [equipped, constraints]
  );

  const slotBlockReasons = useMemo(() => {
    const reasons: Record<string, string> = {};
    slots.forEach((slot) => {
      const reason = getSlotBlockReason(slot.slot_name, equipped, sealedBy, constraints);
      if (reason) reasons[slot.slot_name] = reason;
    });
    return reasons;
  }, [slots, equipped, sealedBy, constraints]);

  const slotPossibleMap = useMemo(() => {
    const map: Record<string, boolean> = {};
    slots.forEach((slot) => {
      const blocked = getSlotBlockReason(slot.slot_name, equipped, sealedBy, constraints) != null;
      map[slot.slot_name] =
        !blocked &&
        components.some((component) => {
          if (!slot.accepts.includes(component.category)) return false;
          return getEquipBlockReason(slot.slot_name, component, equipped, constraints) === null;
        });
    });
    return map;
  }, [slots, components, equipped, sealedBy, constraints]);

  // Sealed slots have their contents emptied
  useEffect(() => {
    const emptied = Object.keys(sealedBy).filter((slotName) => equipped[slotName]);
    if (emptied.length === 0) return;

    setEquipped((prev) => {
      const next = { ...prev };
      let changed = false;
      emptied.forEach((slotName) => {
        if (next[slotName]) {
          delete next[slotName];
          changed = true;
        }
      });
      return changed ? next : prev;
    });

    tooltipSlotRef.current = null;
    hideTooltip();
    setPickerSlot((prev) => (prev && emptied.includes(prev) ? null : prev));
    emptied.forEach((slotName) =>
      notify(`Slot ${slotName} was sealed — its component was removed.`, 'warning')
    );
  }, [sealedBy]); // eslint-disable-line react-hooks/exhaustive-deps

  const equipComponent = (slotName: string, component: Component) => {
    hideTooltip();
    const defaultTier = 0;
    setEquipped((prev) => ({ ...prev, [slotName]: { component, tier: defaultTier } }));
    setPickerSlot(null);
    notify(`Equipped "${component.name}" into ${slotName}.`, 'success');
  };

  const removeComponent = (slotName: string) => {
    hideTooltip();
    const removed = equipped[slotName];
    setEquipped((prev) => {
      const next = { ...prev };
      delete next[slotName];
      return next;
    });
    if (removed) notify(`Removed "${removed.component.name}" from ${slotName}.`, 'success');
  };

  const updateTier = (slotName: string, tier: number) => {
    const current = equipped[slotName];
    if (!current) return;
    const clamped = Math.min(Math.max(tier, 0), getMaxLevel(current.component));
    if (clamped === current.tier) return;

    setEquipped((prev) => ({ ...prev, [slotName]: { ...current, tier: clamped } }));

    // Keep the open tooltip in sync when its tier/level changes
    if (tooltipSlotRef.current === slotName) {
      refreshTooltip({
        ...current.component,
        level: clamped,
        currentEffects: computeCurrentEffects(
          { component: current.component, tier: clamped },
          activeEntries
        ),
      });
    }
  };

  const getSlotStats = (slotName: string): SlotStats | undefined =>
    slots.find((s) => s.slot_name === slotName)?.stats;

  const updateSlotLevel = (slotName: string, level: number) => {
    const statsDef = getSlotStats(slotName);
    const range = getSlotLevelRange(statsDef);
    const clamped = Math.max(range.min, Math.min(range.max, level));
    setSlotLevels((prev) => ({ ...prev, [slotName]: clamped }));
  };

  const updateDistribution = (slotName: string, option: string, delta: number) => {
    const statsDef = getSlotStats(slotName);
    const rules = getSlotRules(statsDef);
    if (!statsDef || (!rules.includes('stat_points') && !rules.includes('class_points'))) return;

    const level = slotLevels[slotName] ?? 0;
    setSlotDistribution((prev) => {
      const current = { ...(prev[slotName] || {}) };
      const breakdown = getDistributionBreakdown(statsDef, level, current);
      const isStat = breakdown.statOptions.includes(option);
      const isClass = breakdown.classOptions.includes(option);
      if (!isStat && !isClass) return prev;

      const pool = isStat ? breakdown.statPool : breakdown.classPool;
      const spent = isStat ? breakdown.statSpent : breakdown.classSpent;
      const spentWithout = spent - (current[option] || 0);
      const next = Math.max(0, (current[option] || 0) + delta);
      if (spentWithout + next > pool) return prev;
      if (next === 0) delete current[option];
      else current[option] = next;
      return { ...prev, [slotName]: current };
    });
  };

  const setDistributionValue = (slotName: string, option: string, value: number) => {
    const statsDef = getSlotStats(slotName);
    const rules = getSlotRules(statsDef);
    if (!statsDef || (!rules.includes('stat_points') && !rules.includes('class_points'))) return;

    const level = slotLevels[slotName] ?? 0;
    setSlotDistribution((prev) => {
      const current = { ...(prev[slotName] || {}) };
      const breakdown = getDistributionBreakdown(statsDef, level, current);
      const isStat = breakdown.statOptions.includes(option);
      const isClass = breakdown.classOptions.includes(option);
      if (!isStat && !isClass) return prev;

      const pool = isStat ? breakdown.statPool : breakdown.classPool;
      const spent = isStat ? breakdown.statSpent : breakdown.classSpent;
      const spentWithout = spent - (current[option] || 0);
      const next = Math.max(0, Math.min(value, pool - spentWithout));
      if (next === 0) delete current[option];
      else current[option] = next;
      return { ...prev, [slotName]: current };
    });
  };

  const handleFinishBuild = async () => {
    if (!auth) return;

    if (!name.trim()) {
      notify('Build name is required.', 'error');
      return;
    }

    if (equippedEntries.length === 0) {
      notify('Equip at least one component before finishing the build.', 'error');
      return;
    }

    const violatedConstraints = constraintMeasures.filter((measure) => measure.status === 'violated');
    if (violatedConstraints.length > 0) {
      notify('Build violates a slot constraint — resolve it before finishing.', 'error');
      return;
    }

    setIsSubmitting(true);

    try {
      const payload = {
        name: name.trim(),
        description: description.trim(),
        tags: tags.split(',').map((tag) => tag.trim()).filter(Boolean),
        components: {
          slots: Object.entries(equipped).map(([slotName, entry]) => ({
            slot_name: slotName,
            component: entry.component,
            tier: entry.tier,
          })),
          slot_levels: slotLevels,
          slot_distribution: slotDistribution,
        },
        is_private: isPrivate,
      };

      const response = await apiFetch(`/templates/${encodeURIComponent(templateId)}/builds`, {
        method: 'POST',
        body: JSON.stringify(payload),
      });

      notify('Build created successfully.', 'success');
      router.push(`/templates/${templateId}/builds/${response.id}`);
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Build creation failed.', 'error');
      setIsSubmitting(false);
    }
  };

  const pickerSlotData = pickerSlot ? slots.find((slot) => slot.slot_name === pickerSlot) ?? null : null;

  const pickerSlotBlockReason = pickerSlot ? slotBlockReasons[pickerSlot] ?? null : null;

  const pickerComponents = useMemo(() => {
    if (!pickerSlotData) return [];
    const accepted = new Set(pickerSlotData.accepts);
    const query = pickerFilter.trim().toLowerCase();
    return components.filter((component) => {
      if (!accepted.has(component.category)) return false;
      if (!query) return true;
      return (
        component.name.toLowerCase().includes(query) ||
        component.category.toLowerCase().includes(query) ||
        (component.sub_category ?? '').toLowerCase().includes(query)
      );
    });
  }, [pickerSlotData, components, pickerFilter]);

  if (isLoading || !auth) {
    return <div className="page-header">Loading...</div>;
  }

  return (
    <main>
      <div
        className="template-editor-shell"
        ref={editorShellRef}
        style={{
          gridTemplateColumns: `${panelWidths.left}% 8px ${panelWidths.middle}% 8px ${panelWidths.right}%`,
        }}
      >
        {/* Left Column: Information + Slot Constraints */}
        <section className="template-column">
          <div className="panel-header">
            <div>
              <h3>Build Information</h3>
              <p className="panel-subtitle">
                Describe this build for template <strong>{templateName || templateId}</strong>.
              </p>
            </div>
            <Link href={`/templates/${templateId}/builds`} className="button secondary small">
              Back
            </Link>
          </div>

          <section className="rules-section">
            <label>
              <strong>Build name <span style={{ color: 'red' }}>*</span></strong>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Berserker Power Build"
              />
            </label>

            <label>
              <strong>Description</strong>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={4}
                placeholder="Explain the idea behind this build..."
              />
            </label>

            <label>
              <strong>Tags</strong>
              <input
                type="text"
                value={tags}
                onChange={(e) => setTags(e.target.value)}
                placeholder="tag1, tag2"
              />
            </label>

            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={isPrivate}
                onChange={(e) => setIsPrivate(e.target.checked)}
              />
              <span><strong>Private</strong> Only you can see this build.</span>
            </label>
          </section>

          <section className="rules-section">
            <div>
              <h3>Slot Constraints</h3>
              <p className="panel-subtitle">Rules this build must respect.</p>
            </div>

            {constraints.length === 0 ? (
              <div className="empty-state">
                <p>This template defines no slot constraints.</p>
              </div>
            ) : (
              <div className="constraint-list">
                {constraintMeasures.map((measure) => (
                  <div
                    key={measure.key}
                    className={`constraint-item constraint-status-${measure.status}`}
                  >
                    <p>{constraintDescription(measure.constraint)}</p>
                    <div className="constraint-meta">
                      <span className="constraint-measure">{measure.measure}</span>
                      <span className="constraint-status-label">
                        {measure.status === 'violated'
                          ? 'Violated'
                          : measure.status === 'active'
                            ? 'Active'
                            : 'Satisfied'}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
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

        {/* Middle Column: Slot Canvas */}
        <section className="template-column template-column-middle">
          <div className="panel-header">
            <div>
              <h3>Slot Canvas</h3>
              <p className="panel-subtitle">Hover a slot for details, or click it to open the inventory.</p>
            </div>
          </div>

          <div className="slot-canvas">
            <div className="slot-canvas-plane">
              {slots.length === 0 ? (
                <div className="empty-state large">
                  <p>This template has no slots.</p>
                  <span>You cannot equip components on it.</span>
                </div>
              ) : (
                slots.map((slot, index) => {
                  const position = slot.position ?? getDefaultPosition(index);
                  const entry = equipped[slot.slot_name];
                  const component = entry?.component;
                  const maxLevel = component ? getMaxLevel(component) : 0;
                  const sealed = Boolean(sealedBy[slot.slot_name]?.length);
                  const slotStats = slot.stats;
                  const slotRules = getSlotRules(slotStats);
                  const levelRange = getSlotLevelRange(slotStats);
                  const slotLevel = slotStats ? (slotLevels[slot.slot_name] ?? levelRange.min) : 0;
                  const distBreakdown = getDistributionBreakdown(
                    slotStats,
                    slotLevel,
                    slotDistribution[slot.slot_name]
                  );
                  const canOpenPicker = !sealed && (slotPossibleMap[slot.slot_name] ?? false);
                  return (
                    <div
                      key={slot.slot_name}
                      role="button"
                      tabIndex={0}
                      aria-label={`${slot.slot_name}${sealed ? ' (sealed)' : ''}`}
                      className={`slot-card slot-card-square build-slot-square ${component ? 'filled' : ''} ${sealed ? 'build-slot-square-sealed' : ''} ${pickerSlot === slot.slot_name ? 'selected' : ''}`}
                      style={{
                        left: position.x,
                        top: position.y,
                        width: slot.size ? `${slot.size}px` : undefined,
                        height: slot.size ? `${slot.size}px` : undefined,
                        backgroundColor: slot.color || undefined,
                        opacity: slot.transparency !== undefined ? slot.transparency / 100 : undefined,
                      }}
                      onClick={() => {
                        if (!canOpenPicker) {
                          setPickerSlot(null);
                          return;
                        }
                        setPickerSlot(slot.slot_name);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          if (!canOpenPicker) {
                            setPickerSlot(null);
                            return;
                          }
                          setPickerSlot(slot.slot_name);
                        }
                      }}
                      onMouseEnter={(e) => setSlotPopover({ slot, x: e.clientX, y: e.clientY })}
                      onMouseMove={(e) =>
                        setSlotPopover((prev) => (prev ? { ...prev, x: e.clientX, y: e.clientY } : prev))
                      }
                      onMouseLeave={() => setSlotPopover(null)}
                    >
                      {sealed && (
                        <span className="build-slot-sealed-badge" title={`Sealed by ${sealedBy[slot.slot_name].join(', ')}`}>
                          <Lock size={10} /> sealed
                        </span>
                      )}

                      <div className="slot-card-top">
                        <h4 style={{ color: slot.textColor || undefined, fontSize: slot.size ? `${Math.round(slot.size * 0.16)}px` : undefined }}>
                          {slot.shown_name || slot.slot_name}
                        </h4>
                      </div>

                      {slotStats && (
                        <span className="build-slot-stats" onClick={(e) => e.stopPropagation()}>
                          <span className="build-slot-level-row">
                            <button
                              type="button"
                              className="build-tier-btn"
                              onClick={(e) => {
                                e.stopPropagation();
                                updateSlotLevel(slot.slot_name, slotLevel - 1);
                              }}
                              disabled={slotLevel <= levelRange.min}
                              aria-label={`Decrease level for ${slot.shown_name || slot.slot_name}`}
                            >
                              −
                            </button>
                            <span className="build-slot-level-value">Lvl</span>
                            <input
                              type="number"
                              className="build-slot-level-input"
                              value={slotLevel}
                              min={levelRange.min}
                              max={levelRange.max}
                              onClick={(e) => e.stopPropagation()}
                              onKeyDown={(e) => e.stopPropagation()}
                              onChange={(e) => updateSlotLevel(slot.slot_name, parseInt(e.target.value, 10) || 0)}
                              title={`Slot level (${levelRange.min}–${levelRange.max})`}
                              aria-label={`Slot level for ${slot.shown_name || slot.slot_name}`}
                            />
                            <button
                              type="button"
                              className="build-tier-btn"
                              onClick={(e) => {
                                e.stopPropagation();
                                updateSlotLevel(slot.slot_name, slotLevel + 1);
                              }}
                              disabled={slotLevel >= levelRange.max}
                              aria-label={`Increase level for ${slot.shown_name || slot.slot_name}`}
                            >
                              +
                            </button>
                          </span>
                          {(slotRules.includes('stat_points') || slotRules.includes('class_points')) && (
                            <button
                              type="button"
                              className="build-slot-points-chip"
                              onClick={(e) => {
                                e.stopPropagation();
                                setDistSlotName((current) => (current === slot.slot_name ? current : slot.slot_name));
                              }}
                              title="Distribute points"
                              aria-label="Distribute points"
                            >
                              Distribute points
                            </button>
                          )}
                          {slotRules.includes('formula') && slotLevel > 0 && (
                            <span className="build-slot-points-chip">formula</span>
                          )}
                        </span>
                      )}

                      {component ? (
                        <span
                          className="build-slot-square-equipped"
                          onMouseEnter={(e) => {
                            setSlotPopover(null);
                            tooltipSlotRef.current = slot.slot_name;
                            showTooltip(
                              {
                                ...component,
                                level: entry.tier,
                                currentEffects: sealed
                                  ? undefined
                                  : computeCurrentEffects(entry, activeEntries),
                              },
                              e
                            );
                          }}
                          onMouseMove={updatePosition}
                          onMouseLeave={(e) => {
                            tooltipSlotRef.current = null;
                            hideTooltip();
                            setSlotPopover((prev) => (prev ? prev : { slot, x: e.clientX, y: e.clientY }));
                          }}
                          onFocus={(e) => {
                            setSlotPopover(null);
                            tooltipSlotRef.current = slot.slot_name;
                            showTooltip(
                              {
                                ...component,
                                level: entry.tier,
                                currentEffects: sealed
                                  ? undefined
                                  : computeCurrentEffects(entry, activeEntries),
                              },
                              e
                            );
                          }}
                          onBlur={() => {
                            tooltipSlotRef.current = null;
                            hideTooltip();
                          }}
                          tabIndex={0}
                        >
                          <span className="build-slot-square-name" title={component.name}>
                            {component.name}
                          </span>
                          {maxLevel > 0 && (
                            <span className="build-slot-square-tier" onClick={(e) => e.stopPropagation()}>
                              <button
                                type="button"
                                className="build-tier-btn"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  updateTier(slot.slot_name, entry.tier - 1);
                                }}
                                disabled={entry.tier === 0}
                                aria-label={`Decrease tier for ${component.name}`}
                              >
                                −
                              </button>
                              <input
                                type="number"
                                className="build-tier-input"
                                value={entry.tier}
                                min={0}
                                max={maxLevel}
                                onClick={(e) => e.stopPropagation()}
                                onKeyDown={(e) => e.stopPropagation()}
                                onChange={(e) => updateTier(slot.slot_name, parseInt(e.target.value, 10) || 0)}
                                title="Tier / level (0 = base stats)"
                              />
                              <button
                                type="button"
                                className="build-tier-btn"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  updateTier(slot.slot_name, entry.tier + 1);
                                }}
                                disabled={entry.tier >= maxLevel}
                                aria-label={`Increase tier for ${component.name}`}
                              >
                                +
                              </button>
                            </span>
                          )}
                        </span>
                      ) : canOpenPicker ? (
                        <span className="build-slot-square-empty" aria-hidden="true">
                          +
                        </span>
                      ) : null}
                    </div>
                  );
                })
              )}
            </div>
          </div>
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

        {/* Right Column: Stats + Optimizer + Finish */}
        <section className="template-column">
          <section className="rules-section">
            <div>
              <h3>Stats <FormulaHelp /></h3>
              <p className="panel-subtitle">Aggregated from equipped components and slot rules. Hover a stat for its calculation.</p>
            </div>

            {stats.length === 0 ? (
              <div className="empty-state">
                <p>No stats yet.</p>
                <span>Equip components to see their combined stats.</span>
              </div>
            ) : (
              <div className="build-stats-list">
                {orderedStats.map((summary, index) => {
                  const prev = index > 0 ? orderedStats[index - 1] : undefined;
                  const group = statGroupOf(templateStats, summary.stat);
                  const negative = statIsNegative(templateStats, summary.stat);
                  const quality = statQuality(summary, negative);
                  const valueClass =
                    quality === 'good'
                      ? 'build-stat-value-good'
                      : quality === 'bad'
                        ? 'build-stat-value-bad'
                        : '';
                  return (
                    <div key={summary.stat}>
                      {shouldShowStatDivider(
                        prev ? { group: statGroupOf(templateStats, prev.stat) } : undefined,
                        { group }
                      ) && (
                        <div className="build-stat-group-divider">
                          {group ? <span className="build-stat-group-divider-label">{group}</span> : null}
                        </div>
                      )}
                      <div
                        className={`build-stat-row${negative ? ' build-stat-row-negative' : ''}`}
                        onMouseEnter={(e) => setStatPopover({ stat: summary, x: e.clientX, y: e.clientY })}
                        onMouseMove={(e) =>
                          setStatPopover((prevPos) => (prevPos ? { ...prevPos, x: e.clientX, y: e.clientY } : prevPos))
                        }
                        onMouseLeave={() => setStatPopover(null)}
                      >
                        <span className="build-stat-name">
                          {summary.stat}
                          {negative && (
                            <span className="build-stat-negative-hint" title="Higher is worse, lower is better">
                              ↓
                            </span>
                          )}
                        </span>
                        <span className={`build-stat-value${valueClass ? ` ${valueClass}` : ''}`}>
                          {formatStatSummary(summary)}
                        </span>
                      </div>
                    </div>
                  );
                })}

                {(() => {
                  const classPoints = collectClassPoints(slots, slotLevels, slotDistribution);
                  if (classPoints.length === 0) return null;
                  return (
                    <>
                      <div className="build-stat-group-divider">
                        <span className="build-stat-group-divider-label">Class distributed points</span>
                      </div>
                      {classPoints.map(({ slot, className, allocated }) => (
                        <div key={`${slot}-${className}`} className="build-stat-row">
                          <span className="build-stat-name">
                            {className}
                            <span className="build-class-point-slot">· {slot}</span>
                          </span>
                          <span className="build-stat-value">+{allocated}</span>
                        </div>
                      ))}
                    </>
                  );
                })()}
              </div>
            )}

            {(() => {
              const sealedEquipped = Object.keys(sealedBy).filter((slot) => equipped[slot]);
              return sealedEquipped.length > 0 ? (
                <div className="constraint-notice constraint-notice-warn">
                  <Lock size={14} />
                  <span>
                    {sealedEquipped
                      .map((slot) => `${slot} (sealed by ${sealedBy[slot].join(', ')})`)
                      .join(' · ')}{' '}
                    — stats excluded.
                  </span>
                </div>
              ) : null;
            })()}
          </section>

          <section className="rules-section">
            <div>
              <h3>Build Optimizer</h3>
              <p className="panel-subtitle">Find the best component combination for a target stat.</p>
            </div>
            <div className="empty-state optimizer-placeholder">
              <Sparkles size={22} />
              <p>Optimize your build</p>
              <span>Set stat priorities and the optimizer will suggest the strongest loadout.</span>
              <button
                type="button"
                className="button secondary small"
                style={{ justifySelf: 'center', marginBottom: 0 }}
                onClick={() => setOptimizerOpen(true)}
              >
                <Sparkles size={14} style={{ verticalAlign: '-2px', marginRight: '.35rem' }} />
                Open Optimizer
              </button>
            </div>
          </section>

          <div className="editor-footer">
            <div>
              <h3>Finish Build</h3>
              <p className="panel-subtitle">
                {equippedEntries.length > 0
                  ? `${equippedEntries.length} component${equippedEntries.length === 1 ? '' : 's'} equipped across ${Object.keys(equipped).length} slot${Object.keys(equipped).length === 1 ? '' : 's'}.`
                  : 'Equip at least one component to publish the build.'}
              </p>
            </div>
            <button
              type="button"
              onClick={handleFinishBuild}
              disabled={isSubmitting}
              style={{ minWidth: 120 }}
            >
              {isSubmitting ? <Loader2 size={16} className="spin" /> : null}
              {isSubmitting ? 'Saving...' : 'Finish Build'}
            </button>
          </div>
        </section>
      </div>

      {/* Slot info popover */}
      {slotPopover &&
        createPortal(
          <div
            className="build-popover"
            style={{ position: 'fixed', left: slotPopover.x + 14, top: slotPopover.y + 7, zIndex: 99998, pointerEvents: 'none' }}
          >
            <div className="build-popover-title">
              {slotPopover.slot.shown_name || slotPopover.slot.slot_name}
            {slotPopover.slot.limit != null && <span className="build-slot-limit">limit {slotPopover.slot.limit}</span>}
            {sealedBy[slotPopover.slot.slot_name]?.length > 0 && (
              <span className="build-slot-limit build-slot-sealed-chip">
                <Lock size={11} /> sealed
              </span>
            )}
          </div>
          {sealedBy[slotPopover.slot.slot_name]?.length > 0 && (
            <>
              <div className="build-popover-subtitle">Sealed by</div>
              <div className="build-popover-sealed">
                {sealedBy[slotPopover.slot.slot_name].join(', ')}
                {equipped[slotPopover.slot.slot_name] && ' — stats excluded from the build'}
              </div>
            </>
          )}
          <div className="build-popover-subtitle">Accepts categories</div>
            <div className="slot-categories">
              {slotPopover.slot.accepts.map((cat) => (
                <span key={cat} className="slot-pill">{cat}</span>
              ))}
            </div>
            {equipped[slotPopover.slot.slot_name] && (
              <>
                <div className="build-popover-subtitle">Equipped</div>
                <div className="build-popover-equipped">
                  {(() => {
                    const equippedEntry = equipped[slotPopover.slot.slot_name];
                    return equippedEntry.tier > 0
                      ? `${equippedEntry.component.name} · ${levelLabel(equippedEntry.component, equippedEntry.tier)}`
                      : equippedEntry.component.name;
                  })()}
                </div>
              </>
            )}
          </div>,
          document.body
        )}

      {/* Stat calculation popover */}
      {statPopover &&
        createPortal(
          <div
            className="build-popover"
            style={{ position: 'fixed', left: statPopover.x + 14, top: statPopover.y + 7, zIndex: 99998, pointerEvents: 'none' }}
          >
            <div className="build-popover-title">{statPopover.stat.stat}</div>
            <div className="build-popover-subtitle">Calculation</div>
            <div className="build-popover-rows">
              {statPopover.stat.contributions.map((contribution, idx) => (
                <div key={idx} className="build-popover-row">
                  <span>{contribution.component}</span>
                  <strong>{formatEffectValue(contribution.type, contribution.value)}</strong>
                </div>
              ))}
              {statPopover.stat.contributions.length === 0 && (
                <div className="build-popover-row"><span>No contributions</span></div>
              )}
            </div>
            <div className="build-popover-result">
              <span>Final</span>
              <strong>{statPopover.stat.final}</strong>
            </div>
          </div>,
          document.body
        )}

      {/* Points distribution popover (stat points / class points) */}
      {distSlotName &&
        distPos &&
        (() => {
          const slot = slots.find((s) => s.slot_name === distSlotName);
          const statsDef = slot?.stats;
          const popRules = getSlotRules(statsDef);
          if (!slot || !statsDef || (!popRules.includes('stat_points') && !popRules.includes('class_points')))
            return null;

          const level = slotLevels[slot.slot_name] ?? 0;
          const distribution = slotDistribution[slot.slot_name] || {};
          const breakdown = getDistributionBreakdown(statsDef, level, distribution);

          const renderDistRow = (option: string, isStat: boolean) => {
            const value = distribution[option] ?? 0;
            const pool = isStat ? breakdown.statPool : breakdown.classPool;
            const spent = isStat ? breakdown.statSpent : breakdown.classSpent;
            const remaining = pool - spent;
            const optionMax = value + remaining;
            return (
              <div key={option} className="build-dist-row">
                <span className="build-stat-name">{option}</span>
                <div className="build-dist-controls">
                  <button
                    type="button"
                    className="build-tier-btn"
                    onClick={() => updateDistribution(slot.slot_name, option, -1)}
                    disabled={value === 0}
                    aria-label={`Decrease ${option} points`}
                  >
                    −
                  </button>
                  <input
                    type="number"
                    className="build-dist-value-input"
                    value={value}
                    min={0}
                    max={optionMax}
                    onClick={(e) => e.stopPropagation()}
                    onKeyDown={(e) => e.stopPropagation()}
                    onChange={(e) =>
                      setDistributionValue(slot.slot_name, option, parseInt(e.target.value, 10) || 0)
                    }
                    title={`${option} points`}
                    aria-label={`${option} points`}
                  />
                  <button
                    type="button"
                    className="build-tier-btn"
                    onClick={() => updateDistribution(slot.slot_name, option, 1)}
                    disabled={remaining <= 0}
                    aria-label={`Increase ${option} points`}
                  >
                    +
                  </button>
                </div>
              </div>
            );
          };

          return createPortal(
            <div
              ref={distRef}
              className="build-popover build-dist-popover"
              style={{ position: 'fixed', left: distPos.x, top: distPos.y, zIndex: 99998, pointerEvents: 'auto' }}
            >
              <div
                className="build-popover-title build-dist-drag-handle"
                onPointerDown={(e) => {
                  e.preventDefault();
                  setDistDrag({
                    startX: e.clientX,
                    startY: e.clientY,
                    originX: distPos.x,
                    originY: distPos.y,
                  });
                }}
              >
                {slot.shown_name || slot.slot_name} — Distribute Points
              </div>
              <div className="build-popover-subtitle">Slot level {level}</div>

              {popRules.includes('stat_points') && (
                <div className="build-dist-section">
                  <div className="build-dist-section-header">
                    <span>Stat Points</span>
                    <span className="build-dist-section-count">
                      {breakdown.statSpent}/{breakdown.statPool}
                    </span>
                  </div>
                  {breakdown.statOptions.length === 0 ? (
                    <div className="build-popover-row">
                      <span>No stats configured on this slot.</span>
                    </div>
                  ) : (
                    breakdown.statOptions.map((option) => renderDistRow(option, true))
                  )}
                </div>
              )}

              {popRules.includes('class_points') && (
                <div className="build-dist-section">
                  <div className="build-dist-section-header">
                    <span>Class Points</span>
                    <span className="build-dist-section-count">
                      {breakdown.classSpent}/{breakdown.classPool}
                    </span>
                  </div>
                  {breakdown.classOptions.length === 0 ? (
                    <div className="build-popover-row">
                      <span>No classes configured on this slot.</span>
                    </div>
                  ) : (
                    breakdown.classOptions.map((option) => renderDistRow(option, false))
                  )}
                </div>
              )}
            </div>,
            document.body
          );
        })()}

      {/* Floating inventory picker for the selected slot */}
      {pickerSlotData && pickerPos && (
        <div
          ref={pickerRef}
          className="modal-content add-inventory-form build-picker build-picker-floating"
          style={{ position: 'fixed', left: pickerPos.x, top: pickerPos.y, zIndex: 99995, width: 620, maxWidth: 'calc(100vw - 16px)' }}
        >
          <div
            className="build-picker-header build-picker-drag-handle"
            onPointerDown={(e) => {
              e.preventDefault();
              if (!pickerPos) return;
              setPickerDrag({ startX: e.clientX, startY: e.clientY, originX: pickerPos.x, originY: pickerPos.y });
            }}
          >
            <div>
              <h3>Equip — {pickerSlotData.shown_name || pickerSlotData.slot_name}</h3>
              <p className="panel-subtitle">
                Choose a component from the template pool that fits this slot.
              </p>
            </div>
            <button
              type="button"
              className="icon-button"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={() => setPickerSlot(null)}
              aria-label="Close inventory"
            >
              <X size={18} />
            </button>
          </div>

          <div className="slot-categories">
            {pickerSlotData.accepts.map((cat) => (
              <span key={cat} className="slot-pill">{cat}</span>
            ))}
          </div>

          {pickerSlotBlockReason && (
            <div className="constraint-notice constraint-notice-block">
              <Lock size={14} />
              <span>{pickerSlotBlockReason}</span>
            </div>
          )}

          <label className="build-picker-filter">
            <span className="build-picker-filter-label">Filter components</span>
            <input
              type="text"
              value={pickerFilter}
              onChange={(e) => setPickerFilter(e.target.value)}
              placeholder="Search by name or category…"
            />
          </label>

          {pickerComponents.length === 0 ? (
            <div className="empty-state">
              <p>No components match this slot&apos;s categories.</p>
              <span>{pickerSlotData.accepts.join(', ') || 'No accepted categories.'}</span>
            </div>
          ) : (
            <div className="component-grid build-picker-grid">
              {pickerComponents.map((component) => {
                const currentEntry = equipped[pickerSlotData.slot_name];
                const isCurrent = currentEntry?.component === component;
                const hasLevels = getMaxLevel(component) > 0;
                const blockReason = getEquipBlockReason(pickerSlotData.slot_name, component, equipped, constraints);
                const disabled = !isCurrent && blockReason != null;
                const sealTargets = constraints
                  .filter(
                    (constraint) =>
                      constraint.type === 'seal' && constraint.if_category === component.category
                  )
                  .map((constraint) => constraint.seals_slot)
                  .filter((slot): slot is string => Boolean(slot));
                const previewTier = isCurrent ? currentEntry?.tier ?? 0 : 0;
                const previewEffects = computeCurrentEffects(
                  { component, tier: previewTier },
                  activeEntries
                );
                return (
                  <div
                    key={`${component.name}-${pickerSlotData.slot_name}`}
                    className={`component-card ${isCurrent ? 'component-card-selected' : ''} ${disabled ? 'component-card-disabled' : ''}`}
                    aria-disabled={disabled}
                    onMouseEnter={(e) =>
                      showTooltip({ ...component, level: previewTier, currentEffects: previewEffects }, e)
                    }
                    onMouseMove={updatePosition}
                    onMouseLeave={hideTooltip}
                    onFocus={(e) =>
                      showTooltip({ ...component, level: previewTier, currentEffects: previewEffects }, e)
                    }
                    onBlur={hideTooltip}
                    tabIndex={disabled ? -1 : 0}
                    onClick={() => {
                      if (disabled) return;
                      if (isCurrent && currentEntry) {
                        removeComponent(pickerSlotData.slot_name);
                      } else {
                        equipComponent(pickerSlotData.slot_name, component);
                      }
                    }}
                    role="button"
                    onKeyDown={(e) => {
                      if (disabled) return;
                      if (e.key === 'Enter' || e.key === ' ') equipComponent(pickerSlotData.slot_name, component);
                    }}
                  >
                    <div className="component-card-header">
                      <strong>{component.name}</strong>
                      <div className="component-card-badges">
                        <span className="component-card-category">{component.category}</span>
                      </div>
                      {component.sub_category && (
                        <div className="component-card-badges">
                          <span className="component-card-subcategory">{component.sub_category}</span>
                        </div>
                      )}
                    </div>
                    {hasLevels && (
                      <div className="build-picker-tier-hint">Tier 0 shows base stats — adjust tier after equipping.</div>
                    )}
                    {sealTargets.length > 0 && (
                      <div className="build-picker-seal-hint">
                        <Lock size={12} /> Seals: {sealTargets.join(', ')}
                      </div>
                    )}
                    {blockReason && (
                      <div className="build-picker-block-reason">{blockReason}</div>
                    )}
                    <div className="build-picker-card-footer">
                      {isCurrent ? (
                        <span className="build-picker-equipped-label">
                          <Check size={14} /> Equipped — click to remove
                        </span>
                      ) : disabled ? (
                        <span className="build-picker-equip-label">Not available</span>
                      ) : (
                        <span className="build-picker-equip-label">Click to equip</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          <div className="modal-footer">
            <button type="button" className="secondary" onClick={() => setPickerSlot(null)}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {optimizerOpen &&
        createPortal(
          <BuildOptimizerModal
            templateId={templateId}
            slots={slots}
            components={components}
            constraints={constraints}
            templateStats={templateStats}
            onClose={() => setOptimizerOpen(false)}
            onApply={(build) => {
              setEquipped(build.entries);
              if (Object.keys(build.slotLevels).length > 0) {
                setSlotLevels((prev) => ({ ...prev, ...build.slotLevels }));
              }
              if (Object.keys(build.slotDistribution).length > 0) {
                setSlotDistribution((prev) => ({ ...prev, ...build.slotDistribution }));
              }
              setOptimizerOpen(false);
              notify(
                Object.keys(build.entries).length > 0
                  ? `Optimized build applied — ${Object.keys(build.entries).length} components equipped, slot levels and points updated.`
                  : 'Optimized build applied.',
                'success'
              );
            }}
          />,
          document.body
        )}
    </main>
  );
}
