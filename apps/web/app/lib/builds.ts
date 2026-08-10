import type { Component } from '../templates/new/page';
import type { EquippedEntry } from './buildMath';

export interface BuildSlotEntry {
  slot_name?: string;
  component?: Component | string | null;
  tier?: number;
}

export interface BuildComponents {
  slots?: BuildSlotEntry[];
  slot_levels?: Record<string, number>;
  slot_distribution?: Record<string, Record<string, number>>;
}

export interface BuildListItem {
  id: string;
  name: string;
  description?: string;
  creator_user_id: number;
  creator_username?: string;
  template_id: string;
  template_name?: string;
  created_at?: string;
  updated_at?: string;
  tags?: string[];
  vote_score?: number;
  is_private?: boolean;
  components?: BuildComponents;
}

export function parseBuildComponents(components: unknown): BuildComponents {
  if (!components || typeof components !== 'object') return {};
  const raw = components as Record<string, unknown>;
  const slots = Array.isArray(raw.slots) ? (raw.slots as BuildSlotEntry[]) : undefined;
  const slot_levels =
    raw.slot_levels && typeof raw.slot_levels === 'object'
      ? (raw.slot_levels as Record<string, number>)
      : undefined;
  const slot_distribution =
    raw.slot_distribution && typeof raw.slot_distribution === 'object'
      ? (raw.slot_distribution as Record<string, Record<string, number>>)
      : undefined;
  return { slots, slot_levels, slot_distribution };
}

export function resolveBuildComponent(
  entryComponent: Component | string | null | undefined,
  templateComponents: Component[]
): Component | null {
  if (entryComponent && typeof entryComponent === 'object') {
    return (entryComponent as Component) ?? null;
  }
  if (typeof entryComponent === 'string') {
    return (
      templateComponents.find((c) => c.id === entryComponent || c.name === entryComponent) ?? null
    );
  }
  return null;
}

export function toEquippedMap(
  components: BuildComponents,
  templateComponents: Component[]
): Record<string, EquippedEntry> {
  const result: Record<string, EquippedEntry> = {};
  if (!Array.isArray(components.slots)) return result;
  components.slots.forEach((entry) => {
    if (!entry.slot_name) return;
    const component = resolveBuildComponent(entry.component, templateComponents);
    if (!component) return;
    result[entry.slot_name] = { component, tier: typeof entry.tier === 'number' ? entry.tier : 0 };
  });
  return result;
}

export function formatDate(value?: string): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}
