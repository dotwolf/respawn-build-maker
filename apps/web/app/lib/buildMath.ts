import type { Component, Constraint, Slot, SlotRule, SlotStats } from '../templates/new/page';

export interface StatContribution {
  component: string;
  type: string;
  value: number;
  stat?: string;
}

export interface StatSummary {
  stat: string;
  flat: number;
  percent: number;
  multiplier: number;
  contributions: StatContribution[];
  final: number;
}

export interface EquippedEntry {
  component: Component;
  tier: number;
}

export interface CurrentEffectValue {
  stat: string;
  type: string;
  value: number;
  note?: string;
}

export interface ClassPointAllocation {
  slot: string;
  className: string;
  allocated: number;
}

export interface ConstraintMeasure {
  key: string;
  constraint: Constraint;
  measure: string;
  status: 'ok' | 'active' | 'violated';
}

export function formatEffectValue(type: string, value: number): string {
  if (type === 'percent_add') return `${value > 0 ? '+' : ''}${value}%`;
  if (type === 'multiplier') return `x${value}`;
  return `${value > 0 ? '+' : ''}${value}`;
}

export function formatStatSummary(summary: StatSummary): string {
  const round = (value: number) => Math.round(value * 100) / 100;
  const { flat, percent, multiplier, final } = summary;
  if (flat === 0 && percent === 0 && multiplier !== 1) {
    return `${round(multiplier)}x`;
  }
  if (flat === 0 && multiplier === 1 && percent !== 0) {
    const p = round(percent);
    return `${p > 0 ? '+' : ''}${p}%`;
  }
  const f = round(final);
  return `${f > 0 ? '+' : ''}${f}`;
}

export type StatQuality = 'good' | 'bad' | 'neutral';

export function statQuality(summary: StatSummary, negative: boolean): StatQuality {
  const { flat, percent, multiplier, final } = summary;
  let quality: StatQuality;
  if (flat === 0 && percent === 0 && multiplier !== 1) {
    quality = multiplier < 1 ? 'bad' : 'good';
  } else if (flat === 0 && multiplier === 1 && percent !== 0) {
    quality = percent < 0 ? 'bad' : 'good';
  } else {
    quality = final > 0 ? 'good' : final < 0 ? 'bad' : 'neutral';
  }
  if (quality === 'neutral') return 'neutral';
  return negative ? (quality === 'good' ? 'bad' : 'good') : quality;
}

export function getMaxLevel(component: Component): number {
  if (!component.has_levels) return 0;
  const rule = component.level_rule;
  if (rule?.type === 'tiers' && rule.tiers?.length) {
    return Math.max(...rule.tiers.map((tier) => tier.tier_number ?? 0));
  }
  if (rule?.type === 'formula') return rule.max_level ?? 10;
  return 0;
}

export function levelLabel(component: Component, level: number): string {
  if (component.level_rule?.type === 'tiers') {
    const tier = component.level_rule.tiers?.find((t) => t.tier_number === level);
    return tier?.label ? `Tier ${level} · ${tier.label}` : `Tier ${level}`;
  }
  return `Lvl ${level}`;
}

const FORMULA_FUNCTIONS: Record<string, string> = {
  min: 'Math.min',
  max: 'Math.max',
  floor: 'Math.floor',
  ceil: 'Math.ceil',
  round: 'Math.round',
  abs: 'Math.abs',
  sqrt: 'Math.sqrt',
  cbrt: 'Math.cbrt',
  pow: 'Math.pow',
  clamp: '_clamp',
  pi: 'Math.PI',
};

const FORMULA_HELPERS = '"use strict"; const _clamp=(v,l,h)=>Math.min(Math.max(v,l),h); const _idiv=(a,b)=>Math.trunc(a/b);';

/**
 * Rewrites every `a // b` (whole/integer division) into `_idiv(a, b)` while
 * honoring operator precedence and left-associativity:
 *   - left operand extends across `* / % **` (same/higher precedence),
 *     stopping at `+ -`, a function boundary, or the expression start;
 *   - right operand stops at any binary operator (`* / % + -`) since `//`
 *     is left-associative, but extends across `**` (higher precedence) and
 *     unary signs.
 * If the expression is malformed (missing an operand) the original string is
 * returned unchanged so the caller can reject it.
 */
function applyWholeDivision(expression: string): string {
  const isBinaryOp = /[+\-*/%]/;
  let working = expression.replace(/\s+/g, '');

  while (true) {
    const idx = working.indexOf('//');
    if (idx === -1) break;

    let depth = 0;
    let start = idx - 1;
    while (start >= 0) {
      const ch = working[start];
      if (ch === ')') depth += 1;
      else if (ch === '(') {
        if (depth === 0) break; // group spans the `//`, operand starts after it
        depth -= 1;
      } else if (depth === 0 && (ch === '+' || ch === '-')) break;
      start -= 1;
    }
    const leftStart = start + 1;
    const left = working.slice(leftStart, idx);

    let end = idx + 2;
    depth = 0;
    while (end < working.length) {
      const ch = working[end];
      if (ch === '(') depth += 1;
      else if (ch === ')') {
        depth -= 1;
        if (depth < 0) break;
      } else if (depth === 0) {
        if (ch === '*' && working[end + 1] === '*') {
          end += 1; // power operator — higher precedence, keep scanning
        } else if (isBinaryOp.test(ch)) {
          if (ch === '+' || ch === '-') {
            const prev = end > 0 ? working[end - 1] : '';
            const unary = !prev || isBinaryOp.test(prev) || prev === '(' || prev === ',';
            if (!unary) break;
          } else {
            break;
          }
        }
      }
      end += 1;
    }
    const right = working.slice(idx + 2, end);

    if (!left || !right) return expression;

    working =
      working.slice(0, leftStart) +
      `_idiv(${left},${right})` +
      working.slice(end);
  }

  return working;
}

const formulaCache = new Map<string, number | null>();

export function evaluateFormula(formula: string, variables: Record<string, number>): number | null {
  const cacheKey = `${formula}\u0000${JSON.stringify(variables)}`;
  if (formulaCache.has(cacheKey)) return formulaCache.get(cacheKey) ?? null;
  try {
    let expression = formula;
    for (const [key, value] of Object.entries(variables)) {
      expression = expression.replace(new RegExp(`\\b${key}\\b`, 'gi'), String(value));
    }

    const functionTokens: string[] = [];
    let cleaned = '';
    let i = 0;
    while (i < expression.length) {
      const ch = expression[i];
      if (ch === '^') {
        cleaned += '**';
        i += 1;
        continue;
      }
      if (/[\s0-9+\-*/().,%]/.test(ch)) {
        cleaned += ch;
        i += 1;
        continue;
      }
      const wordMatch = /^[a-zA-Z_][a-zA-Z0-9_]*/.exec(expression.slice(i));
      if (wordMatch) {
        const word = wordMatch[0];
        const mapped = FORMULA_FUNCTIONS[word.toLowerCase()];
        if (mapped) {
          const token = `Q${functionTokens.length}`;
          functionTokens.push(mapped);
          cleaned += token;
        }
        i += word.length;
        continue;
      }
      i += 1;
    }

    if (!cleaned.trim()) return null;

    const wholeDivided = applyWholeDivision(cleaned);
    if (wholeDivided.includes('//')) return null;

    const bindings = functionTokens
      .map((fn, index) => `const Q${index}=${fn};`)
      .join('');
    const value = Function(`${FORMULA_HELPERS}${bindings}return (${wholeDivided});`)();
    const result = typeof value === 'number' && Number.isFinite(value) ? value : null;
    formulaCache.set(cacheKey, result);
    return result;
  } catch {
    formulaCache.set(cacheKey, null);
    return null;
  }
}

export function getComponentEffects(component: Component, tier: number): Component['effects'] {
  if (tier > 0 && component.level_rule?.type === 'tiers') {
    const tierData = component.level_rule.tiers?.find((t) => t.tier_number === tier);
    if (tierData?.effects?.length) return tierData.effects;
  }
  return component.effects || [];
}

export function computeCurrentEffects(entry: EquippedEntry, allEntries: EquippedEntry[]): CurrentEffectValue[] {
  const { component, tier } = entry;
  const results: CurrentEffectValue[] = [];

  getComponentEffects(component, tier).forEach((effect) => {
    const stat = effect.stat?.trim() || 'Unnamed Stat';
    let value = typeof effect.value === 'number' ? effect.value : parseFloat(effect.value);
    if (Number.isNaN(value)) return;

    if (tier > 0 && component.level_rule?.type === 'formula') {
      const formula = component.level_rule.formulas?.[effect.stat || ''];
      if (formula) {
        const evaluated = evaluateFormula(formula, { level: tier });
        if (evaluated != null) value = evaluated;
      }
    }

    if (effect.type === 'multiplier') {
      results.push({ stat, type: effect.type, value });
      return;
    }

    const sources: string[] = [];
    const multiplier = allEntries.reduce((product, other) => {
      if (other === entry) return product;
      let statMultiplier = 1;
      other.component.effects.forEach((otherEffect) => {
        if (otherEffect.type === 'multiplier' && (otherEffect.stat?.trim() || 'Unnamed Stat') === stat) {
          const m = typeof otherEffect.value === 'number' ? otherEffect.value : parseFloat(otherEffect.value);
          if (Number.isFinite(m)) statMultiplier *= m;
        }
      });
      if (statMultiplier !== 1) sources.push(other.component.name);
      return product * statMultiplier;
    }, 1);

    results.push({
      stat,
      type: effect.type,
      value: value === 0 && multiplier !== 1 ? 1 * multiplier : value * multiplier,
      note: sources.length ? `×${multiplier} from ${sources.join(', ')}` : undefined,
    });
  });

  return results;
}

function getCategoryCounts(entries: Record<string, EquippedEntry>): Map<string, number> {
  const counts = new Map<string, number>();
  Object.values(entries).forEach((entry) => {
    const category = entry.component.category;
    counts.set(category, (counts.get(category) ?? 0) + 1);
  });
  return counts;
}

export function getSealedBy(
  entries: Record<string, EquippedEntry>,
  constraints: Constraint[]
): Record<string, string[]> {
  const sealedBy: Record<string, string[]> = {};
  Object.entries(entries).forEach(([slotName, entry]) => {
    constraints.forEach((constraint) => {
      if (constraint.type === 'seal' && entry.component.category === constraint.if_category) {
        if (constraint.seals_slot) {
          (sealedBy[constraint.seals_slot] ??= []).push(entry.component.name);
        }
      }
    });
  });
  return sealedBy;
}

export function getConstraintMeasures(
  entries: Record<string, EquippedEntry>,
  constraints: Constraint[]
): ConstraintMeasure[] {
  const counts = getCategoryCounts(entries);
  const sealedBy = getSealedBy(entries, constraints);
  const sealedSlotNames = new Set(Object.keys(sealedBy));

  const measures: ConstraintMeasure[] = [];
  constraints.forEach((constraint) => {
    if (constraint.type === 'seal') {
      const ifCategory = constraint.if_category ?? '';
      const sealsSlot = constraint.seals_slot ?? '';
      const active = (counts.get(ifCategory) ?? 0) > 0;
      const targetSealed = sealedSlotNames.has(sealsSlot);
      measures.push({
        key: `seal_${ifCategory}_${sealsSlot}`,
        constraint,
        measure: active
          ? targetSealed
            ? `${sealsSlot} sealed`
            : `Sealer active — seals ${sealsSlot}`
          : 'Inactive',
        status: active ? 'active' : 'ok',
      });
      return;
    }
    if (constraint.type === 'mutual_exclusion') {
      const [slotA, slotB] = constraint.slots ?? [];
      const filled = [slotA, slotB].filter((name): name is string => {
        if (!name) return false;
        return Boolean(entries[name]);
      }).length;
      measures.push({
        key: `mutual_${slotA}_${slotB}`,
        constraint,
        measure: filled === 2 ? 'Conflict — both filled' : `${filled}/2 filled`,
        status: filled === 2 ? 'violated' : filled > 0 ? 'active' : 'ok',
      });
      return;
    }
    if (constraint.type === 'global_limit' || constraint.type === 'pool_unique') {
      const category = constraint.category ?? '';
      const used = counts.get(category) ?? 0;
      const limit = constraint.limit ?? 1;
      let dup = false;
      if (constraint.type === 'pool_unique') {
        const names = Object.values(entries)
          .filter((entry) => entry.component.category === category)
          .map((entry) => entry.component.name);
        dup = new Set(names).size !== names.length;
      }
      measures.push({
        key: `${constraint.type}_${category}`,
        constraint,
        measure: dup ? 'Duplicate component equipped' : `${used}/${limit} used`,
        status: dup || used > limit ? 'violated' : used === limit ? 'active' : 'ok',
      });
      return;
    }
    if (constraint.type === 'unique') {
      const category = constraint.category ?? '';
      const used = counts.get(category) ?? 0;
      measures.push({
        key: `unique_${category}`,
        constraint,
        measure: `${used}/1 used`,
        status: used > 1 ? 'violated' : used === 1 ? 'active' : 'ok',
      });
    }
  });
  return measures;
}

export function constraintDescription(constraint: Constraint): string {
  if (constraint.type === 'seal') {
    return `If ${constraint.if_category} is equipped → seal ${constraint.seals_slot}`;
  }
  if (constraint.type === 'mutual_exclusion') {
    return `${constraint.slots?.[0]} and ${constraint.slots?.[1]} are mutually exclusive`;
  }
  if (constraint.type === 'global_limit') {
    return `${constraint.category} can be used at most ${constraint.limit} times across all slots`;
  }
  if (constraint.type === 'unique') {
    return `${constraint.category} can only appear once in the build`;
  }
  if (constraint.type === 'pool_unique') {
    return `${constraint.category} can fill up to ${constraint.limit} slots, but no duplicate components`;
  }
  return '';
}

export function computeStats(entries: EquippedEntry[]): StatSummary[] {
  const byStat = new Map<string, StatSummary>();

  const ensure = (stat: string): StatSummary => {
    const key = stat.trim();
    let summary = byStat.get(key);
    if (!summary) {
      summary = { stat: key, flat: 0, percent: 0, multiplier: 1, contributions: [], final: 0 };
      byStat.set(key, summary);
    }
    return summary;
  };

  entries.forEach(({ component, tier }) => {
    const tierLabel = tier > 0 ? levelLabel(component, tier) : '';
    getComponentEffects(component, tier).forEach((effect) => {
      let numericValue = typeof effect.value === 'number' ? effect.value : parseFloat(effect.value);
      if (Number.isNaN(numericValue)) return;

      if (tier > 0 && component.level_rule?.type === 'formula') {
        const formula = component.level_rule.formulas?.[effect.stat || ''];
        if (formula) {
          const evaluated = evaluateFormula(formula, { level: tier });
          if (evaluated != null) numericValue = evaluated;
        }
      }

      const summary = ensure(effect.stat || 'Unnamed Stat');
      if (effect.type === 'percent_add') {
        summary.percent += numericValue;
      } else if (effect.type === 'multiplier') {
        summary.multiplier *= numericValue;
      } else {
        summary.flat += numericValue;
      }
      summary.contributions.push({
        component: tierLabel ? `${component.name} · ${tierLabel}` : component.name,
        type: effect.type,
        value: numericValue,
      });
    });
  });

  const rounded = (value: number) => Math.round(value * 100) / 100;

  byStat.forEach((summary) => {
    const baseValue = summary.flat * (1 + summary.percent / 100);
    summary.final = rounded((baseValue === 0 && summary.multiplier !== 1 ? 1 : baseValue) * summary.multiplier);
  });

  return Array.from(byStat.values()).sort((a, b) => a.stat.localeCompare(b.stat));
}

export function getSlotRules(stats: SlotStats | undefined): SlotRule[] {
  if (!stats) return [];
  if (stats.rules && stats.rules.length > 0) return stats.rules;
  if (stats.rule) return [stats.rule];
  return [];
}

export interface SlotLevelRange {
  min: number;
  max: number;
}

/**
 * Min/max level a slot can be set to in a build. Templates may define these
 * explicitly; point slots default to a minimum of 1 so distributing points is
 * always possible.
 */
export function getSlotLevelRange(stats: SlotStats | undefined): SlotLevelRange {
  if (!stats) return { min: 0, max: 999 };
  const rules = getSlotRules(stats);
  const hasPoints = rules.includes('stat_points') || rules.includes('class_points');
  const min = stats.min_level ?? (hasPoints ? 1 : 0);
  const max = stats.max_level ?? 999;
  return { min: Math.min(min, max), max: Math.max(min, max) };
}

export interface DistributionBreakdown {
  statOptions: string[];
  classOptions: string[];
  statSpent: number;
  classSpent: number;
  statPool: number;
  classPool: number;
}

/**
 * Splits a slot's point distribution into two independent pools — stat points
 * and class points. Each pool can spend the full `level * points_per_level`
 * budget without borrowing from the other.
 */
export function getDistributionBreakdown(
  stats: SlotStats | undefined,
  level: number,
  distribution: Record<string, number> | undefined
): DistributionBreakdown {
  const rules = getSlotRules(stats);
  const pointsPerLevel = stats?.points_per_level ?? 0;
  const dist = distribution || {};
  const statOptions = rules.includes('stat_points') ? stats?.stats || [] : [];
  const classOptions = rules.includes('class_points') ? stats?.classes || [] : [];
  const statSpent = statOptions.reduce((sum, opt) => sum + (dist[opt] ?? 0), 0);
  const classSpent = classOptions.reduce((sum, opt) => sum + (dist[opt] ?? 0), 0);
  return {
    statOptions,
    classOptions,
    statSpent,
    classSpent,
    statPool: rules.includes('stat_points') ? level * pointsPerLevel : 0,
    classPool: rules.includes('class_points') ? level * pointsPerLevel : 0,
  };
}

export function collectClassPoints(
  slots: Slot[],
  slotLevels: Record<string, number>,
  slotDistribution: Record<string, Record<string, number>>
): ClassPointAllocation[] {
  const results: ClassPointAllocation[] = [];
  slots.forEach((slot) => {
    const statsDef = slot.stats;
    if (!statsDef) return;
    const level = slotLevels[slot.slot_name] ?? 0;
    if (level <= 0) return;
    if (!getSlotRules(statsDef).includes('class_points')) return;
    const distribution = slotDistribution[slot.slot_name] || {};
    (statsDef.classes || []).forEach((className) => {
      const allocated = distribution[className] ?? 0;
      if (allocated > 0) results.push({ slot: slot.shown_name || slot.slot_name, className, allocated });
    });
  });
  return results;
}

export function computeSlotRules(
  slots: Slot[],
  slotLevels: Record<string, number>,
  slotDistribution: Record<string, Record<string, number>>
): StatContribution[] {
  const results: StatContribution[] = [];

  slots.forEach((slot) => {
    const statsDef = slot.stats;
    if (!statsDef) return;

    const level = slotLevels[slot.slot_name] ?? 0;
    const source = slot.shown_name || slot.slot_name;
    const activeRules = getSlotRules(statsDef);

    if (activeRules.includes('formula') && level > 0) {
      (statsDef.stats || []).forEach((stat) => {
        const formula = statsDef.formulas?.[stat];
        if (!formula || !formula.trim()) return;
        const value = evaluateFormula(formula, { level });
        if (value == null) return;
        results.push({
          stat,
          component: `${source} · Lvl ${level}`,
          type: 'flat',
          value: Math.round(value * 100) / 100,
        });
      });
    }

    if (activeRules.includes('stat_points')) {
      const pool = level * (statsDef.points_per_level ?? 0);
      if (pool > 0) {
        const distribution = slotDistribution[slot.slot_name] ?? {};
        (statsDef.stats || []).forEach((stat) => {
          const value = distribution[stat] ?? 0;
          if (value !== 0) {
            results.push({ stat, component: `${source} · points`, type: 'flat', value });
          }
        });
      }
    }

    if (activeRules.includes('class_points')) {
      const pool = level * (statsDef.points_per_level ?? 0);
      if (pool > 0) {
        const distribution = slotDistribution[slot.slot_name] ?? {};
        (statsDef.classes || []).forEach((className) => {
          const allocated = distribution[className] ?? 0;
          if (allocated <= 0) return;
          const classFormulas = statsDef.class_formulas?.[className];
          if (!classFormulas) return;
          Object.entries(classFormulas).forEach(([stat, formula]) => {
            if (!formula || !formula.trim()) return;
            const value = evaluateFormula(formula, { points: allocated });
            if (value == null) return;
            results.push({
              stat,
              component: `${source} · ${className} · ${allocated} pts`,
              type: 'flat',
              value: Math.round(value * 100) / 100,
            });
          });
        });
      }
    }
  });

  return results;
}

export function mergeSlotRules(base: StatSummary[], slotRules: StatContribution[]): StatSummary[] {
  if (slotRules.length === 0) return base;

  const byStat = new Map(base.map((s) => [s.stat, s]));
  slotRules.forEach((contribution) => {
    let summary = byStat.get(contribution.stat || '');
    if (!summary) {
      const key = contribution.stat || 'Unnamed Stat';
      summary = { stat: key, flat: 0, percent: 0, multiplier: 1, contributions: [], final: 0 };
      byStat.set(key, summary);
    }
    summary.flat += contribution.value;
    summary.contributions.push(contribution);
  });

  byStat.forEach((summary) => {
    const baseValue = summary.flat * (1 + summary.percent / 100);
    summary.final = Math.round(((baseValue === 0 && summary.multiplier !== 1 ? 1 : baseValue) * summary.multiplier) * 100) / 100;
  });

  return Array.from(byStat.values()).sort((a, b) => a.stat.localeCompare(b.stat));
}
