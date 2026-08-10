import type { Component } from '../templates/new/page';
import { apiFetch } from './api';

export interface Suggestion {
  id: string;
  template_id: string;
  author_user_id: number;
  author_name?: string;
  description?: string | null;
  added?: Component[];
  edited?: Component[];
  removed?: number[];
  status: 'pending' | 'accepted';
  created_at?: string;
  updated_at?: string;
}

export interface SuggestionNotification {
  template_id: string;
  template_name: string;
}

export interface PendingSuggestionNotification {
  template_id: string;
  template_name: string;
  pending_count: number;
}

export interface SuggestionPayloadComponent {
  scoped_number: number;
  name: string;
  category: string;
  sub_category?: string;
  description?: string;
  effects: Component['effects'];
  has_levels: boolean;
  level_scaling: Component['level_scaling'];
  level_rule?: Component['level_rule'] | null;
}

export function toSuggestionPayloadComponent(
  component: Component,
  scopedNumber: number
): SuggestionPayloadComponent {
  const stripEffect = (effect: { _id?: string } & Component['effects'][number]) => {
    const { _id: _ignored, ...rest } = effect;
    return rest;
  };
  const levelRule = component.level_rule
    ? {
        ...component.level_rule,
        tiers: (component.level_rule.tiers ?? []).map((tier) => ({
          ...tier,
          effects: (tier.effects ?? []).map(stripEffect),
        })),
      }
    : null;

  return {
    scoped_number: scopedNumber,
    name: component.name,
    category: component.category,
    sub_category: component.sub_category || undefined,
    description: component.description || undefined,
    effects: (component.effects ?? []).map(stripEffect),
    has_levels: component.has_levels,
    level_scaling: component.level_scaling,
    level_rule: levelRule,
  };
}

export interface SuggestionCreatePayload {
  description?: string;
  added: SuggestionPayloadComponent[];
  edited: SuggestionPayloadComponent[];
  removed: number[];
}

export async function createSuggestion(
  templateId: string,
  payload: SuggestionCreatePayload
): Promise<Suggestion> {
  return apiFetch(`/templates/${encodeURIComponent(templateId)}/suggestions`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function listSuggestions(templateId: string): Promise<Suggestion[]> {
  return apiFetch(`/templates/${encodeURIComponent(templateId)}/suggestions?limit=100`);
}

export async function acceptSuggestion(templateId: string, suggestionId: string): Promise<Suggestion> {
  return apiFetch(`/templates/${encodeURIComponent(templateId)}/suggestions/${encodeURIComponent(suggestionId)}/accept`, {
    method: 'POST',
  });
}

export async function deleteSuggestion(templateId: string, suggestionId: string): Promise<void> {
  await apiFetch(`/templates/${encodeURIComponent(templateId)}/suggestions/${encodeURIComponent(suggestionId)}`, {
    method: 'DELETE',
  });
}

export async function countPendingSuggestions(): Promise<number> {
  const data = await apiFetch('/me/suggestions/count');
  return typeof data?.count === 'number' ? data.count : 0;
}

export async function getSuggestionNotifications(): Promise<SuggestionNotification[]> {
  return apiFetch('/me/suggestion-notifications');
}

export async function getUnreadSuggestionNotificationCount(): Promise<number> {
  const data = await apiFetch('/me/suggestion-notifications/count');
  return typeof data?.count === 'number' ? data.count : 0;
}

export async function listPendingSuggestionNotifications(): Promise<PendingSuggestionNotification[]> {
  return apiFetch('/me/suggestions/pending');
}
