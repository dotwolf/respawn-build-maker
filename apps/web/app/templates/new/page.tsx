'use client';

import { useEffect, useRef, useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useNotification } from '../../components/NotificationProvider';
import { TooltipProvider } from '../../components/TooltipProvider';
import { apiFetch } from '../../lib/api';
import TemplateBasicsStep from './steps/TemplateBasicsStep';
import TemplateComponentsStep from './steps/TemplateComponentsStep';
import SlotSection from './components/SlotSection';
import SlotCanvas from './components/SlotCanvas';
import ConstraintSection from './components/ConstraintSection';

export interface SlotPosition {
  x: number;
  y: number;
}

export interface Slot {
  slot_name: string;
  accepts: string[];
  limit?: number;
  position?: SlotPosition;
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

export default function NewTemplatePage() {
  const router = useRouter();
  const { notify } = useNotification();
  const [isLoading, setIsLoading] = useState(true);
  const [auth, setAuth] = useState<Auth | null>(null);

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [isPrivate, setIsPrivate] = useState(false);

  const [slots, setSlots] = useState<Slot[]>([]);
  const [constraints, setConstraints] = useState<Constraint[]>([]);
  const [components, setComponents] = useState<Component[]>([]);
  const [selectedSlotIndex, setSelectedSlotIndex] = useState<number | null>(null);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [panelWidths, setPanelWidths] = useState({ left: 25, middle: 50, right: 25 });
  const [draggingDivider, setDraggingDivider] = useState<'left' | 'right' | null>(null);
  const editorShellRef = useRef<HTMLDivElement | null>(null);

  // Automatically derive all unique stats defined across components (guaranteed array fallback)
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

    const statsArray = Array.from(statSet).sort();
    return statsArray.length > 0 ? statsArray : [];
  }, [components]);

  // Authentication check
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const stored = window.localStorage.getItem('respawn-auth');
    if (!stored) {
      notify('You must be logged in to create a new Template!', 'error');
      router.replace('/profile');
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
  }, [notify, router]);

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
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      const hasUnsavedContent =
        name.trim() !== '' ||
        description.trim() !== '' ||
        slots.length > 0 ||
        constraints.length > 0 ||
        components.length > 0;

      if (hasUnsavedContent && !isSubmitting) {
        event.preventDefault();
        event.returnValue = '';
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [name, description, slots, constraints, components, isSubmitting]);

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
        effects: component.effects,
        has_levels: component.has_levels,
        level_scaling: component.level_scaling,
        level_rule: component.level_rule || null,
      }));

      // Ensure stats is explicitly forced to an array payload just in case derivedStats is somehow empty
      const payloadStats = Array.isArray(derivedStats) ? derivedStats : [];

      const response = await apiFetch('/templates/full', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...authHeader,
        },
        body: JSON.stringify({
          name,
          description,
          creator_user_id: auth.user.id,
          rules: { slots, constraints },
          is_private: isPrivate,
          stats: payloadStats,
          components: formattedComponents,
        }),
      });

      const templateId = response.id;

      notify('Template created successfully.', 'success');
      router.replace(`/templates/${templateId}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to create template.';
      notify(message, 'error');
      setIsSubmitting(false);
    }
  };

  const availableCategories = Array.from(
    new Set(slots.flatMap((s) => s.accepts))
  ).sort();

  if (isLoading || !auth) {
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
              stats={derivedStats}
            />
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
              slotNames={slots.map((slot) => slot.slot_name)}
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
            />

            <div className="editor-footer">
              <div>
                <h3>Finish Template</h3>
                <p className="panel-subtitle">
                  Once the layout and component pool are ready, publish the template.
                </p>
              </div>
              <button type="button" onClick={handleSubmit} disabled={isSubmitting}>
                {isSubmitting ? 'Creating...' : 'Finish Template'}
              </button>
            </div>
          </section>
        </div>
      </main>
    </TooltipProvider>
  );
}