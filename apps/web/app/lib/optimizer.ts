import type { Component, Constraint, Slot, SlotRule } from '../templates/new/page';
import type { StatDefinition } from './stats';
import type { EquippedEntry, StatContribution, StatSummary } from './buildMath';
import {
  computeStats,
  evaluateFormula,
  getComponentEffects,
  getMaxLevel,
  getSlotLevelRange,
  getSlotRules,
  mergeSlotRules,
} from './buildMath';

/**
 * Branch-and-bound build optimizer.
 *
 * Builds are constructed incrementally slot-by-slot (fixed search depth =
 * number of slots). Every partial build is validated at each stage against
 * template constraints (mutual exclusion, unique, global limit, pool unique,
 * seal) and the user's min/max requirements, using optimistic per-slot
 * contribution bounds to prune branches that can never satisfy them.
 *
 * Slot levels, stat points and class points are optimized too: for every slot
 * with a stats definition the search branches over candidate levels, and at
 * each complete build a greedy allocator spends each slot's stat/class point
 * pools to maximize the weighted score (first topping up any unmet min
 * requirements, then maximizing score without exceeding max requirements).
 * The bound/feasibility pruning folds in the maximum possible slot-level and
 * point contributions so no optimal branch is pruned prematurely.
 */

export interface OptimizerWeights {
  [stat: string]: number;
}

export interface OptimizerRequirements {
  min: Record<string, number>;
  max: Record<string, number>;
}

export interface OptimizerOptions {
  slots: Slot[];
  components: Component[];
  constraints: Constraint[];
  templateStats: StatDefinition[];
  weights: OptimizerWeights;
  requirements: OptimizerRequirements;
  excluded: Set<string>;
  excludedClasses?: Set<string>;
  maxResults?: number;
  nodeBudget?: number;
  progressEvery?: number;
  timeLimitMs?: number;
  multiclass?: boolean;
}

export interface OptimizedBuild {
  entries: Record<string, EquippedEntry>;
  slotLevels: Record<string, number>;
  slotDistribution: Record<string, Record<string, number>>;
  score: number;
  overall: number;
  grade: number;
  summary: StatSummary[];
}

export interface OptimizerResult {
  builds: OptimizedBuild[];
  nodesExplored: number;
  prunedByBound: number;
  prunedByFeasibility: number;
  truncated: boolean;
  searchSpaceEstimate: number;
  feasibleExists: boolean;
}

export interface OptimizerProgress {
  nodesExplored: number;
  prunedByBound: number;
  prunedByFeasibility: number;
  truncated: boolean;
  searchSpaceEstimate: number;
}

const PRIMARY_EXPONENT = 1;
const SECONDARY_EXPONENT = 0.6;
const EPS = 1e-6;
const DEFAULT_NODE_BUDGET = 300_000;
const DEFAULT_MAX_RESULTS = 12;
const DEFAULT_TIME_LIMIT_MS = 10_000;
const MAX_LEVEL_CANDIDATES = 10;
const MAX_ALLOC_STEPS = 1200;
const CLASS_WINDOW_CAP = 8;

interface EffectContrib {
  stat: string;
  type: 'flat' | 'percent_add' | 'multiplier';
  value: number;
}

interface Agg {
  flat: number;
  percent: number;
  multiplier: number;
}

interface Acc {
  flat: Record<string, number>;
  percent: Record<string, number>;
  multiplier: Record<string, number>;
}

interface TierInfo {
  bestTier: number;
  bestPotential: number;
}

interface SlotBounds {
  maxFlat: Record<string, number>;
  minFlat: Record<string, number>;
  maxPercent: Record<string, number>;
  minPercent: Record<string, number>;
  maxMult: Record<string, number>;
  minMult: Record<string, number>;
  maxAbsFlat: Record<string, number>;
  maxAbsPercent: Record<string, number>;
}

interface Suffix {
  maxFlat: Record<string, number>[];
  minFlat: Record<string, number>[];
  maxPercent: Record<string, number>[];
  minPercent: Record<string, number>[];
  maxMult: Record<string, number>[];
  minMult: Record<string, number>[];
  maxAbsFlat: Record<string, number>[];
  maxAbsPercent: Record<string, number>[];
}

interface SlotConfig {
  slot: Slot;
  levels: number[];
  hasFormula: boolean;
  formulas: Record<string, string> | undefined;
  statOptions: string[];
  hasStatPoints: boolean;
  classOptions: string[];
  hasClassPoints: boolean;
  pointsPerLevel: number;
  formulaContribs: Record<number, { stat: string; value: number }[]>;
  classDeltas: Record<string, { stat: string; value: number }[][]>;
  classStatSet: Record<string, string[]>;
}

interface SlotAddBounds {
  maxFlat: Record<string, number>;
  minFlat: Record<string, number>;
  allocMaxFlat: Record<string, number>;
}

interface TopBuild {
  entries: Record<string, EquippedEntry>;
  slotLevels: Record<string, number>;
  slotDistribution: Record<string, Record<string, number>>;
  slotRules: StatContribution[];
  score: number;
  overall: number;
  sig: string;
}

interface SearchState {
  nodes: number;
  nodeBudget: number;
  progressEvery: number;
  prunedBound: number;
  prunedFeas: number;
  truncated: boolean;
  maxResults: number;
  deadline: number;
  multiclass: boolean;
  poolBounds: Map<string, Map<number, PoolLevelBound>>;
  slotsWithPools: string[];
}

interface FinalizedBuild {
  score: number;
  overall: number;
  slotRules: StatContribution[];
  slotLevels: Record<string, number>;
  slotDistribution: Record<string, Record<string, number>>;
}

interface Pool {
  slotName: string;
  cfg: SlotConfig;
  kind: 'stat' | 'class';
  option: string;
  remaining: number;
  classKey?: string;
}

interface PoolLevelBound {
  statPoints: number;
  statOptions: string[];
  classFullFlat: Record<string, number> | null;
}

const effectsCache = new Map<string, EffectContrib[]>();

const exponentCache = new WeakMap<StatDefinition[], Map<string, number>>();
const negativeCache = new WeakMap<StatDefinition[], Map<string, boolean>>();

function isPrimaryStat(name: string, group?: string): boolean {
  return /power|attack|offens|damage|defense|defence|armor|armour|shield|health|hp|vital|stamina|ward|guard|protection|protect|regen|recovery|resist|resistance/i.test(
    `${group ?? ''} ${name}`
  );
}

function statExponent(name: string, defs: StatDefinition[]): number {
  const map = exponentCache.get(defs);
  if (map) return map.get(name) ?? (isPrimaryStat(name) ? PRIMARY_EXPONENT : SECONDARY_EXPONENT);
  const built = new Map<string, number>();
  defs.forEach((d) => built.set(d.name, isPrimaryStat(d.name, d.group) ? PRIMARY_EXPONENT : SECONDARY_EXPONENT));
  exponentCache.set(defs, built);
  return built.get(name) ?? (isPrimaryStat(name) ? PRIMARY_EXPONENT : SECONDARY_EXPONENT);
}

function isNegativeStat(name: string, defs: StatDefinition[]): boolean {
  const map = negativeCache.get(defs);
  if (map) return map.get(name) ?? false;
  const built = new Map<string, boolean>();
  defs.forEach((d) => built.set(d.name, d.negative === true));
  negativeCache.set(defs, built);
  return built.get(name) ?? false;
}

function utility(norm: number, exp: number, negative: boolean): number {
  if (norm === 0) return 0;
  const sign = norm >= 0 ? 1 : -1;
  const u = exp === 1 ? sign * Math.abs(norm) : sign * Math.pow(Math.abs(norm), exp);
  return negative ? -u : u;
}

interface StatMeta {
  w: number;
  abs: number;
  exp: number;
  negative: boolean;
}

function buildStatMeta(
  weights: OptimizerWeights,
  absMax: Map<string, number>,
  defs: StatDefinition[]
): Map<string, StatMeta> {
  const keys = new Set<string>();
  defs.forEach((d) => keys.add(d.name));
  Object.keys(weights).forEach((k) => keys.add(k));
  const meta = new Map<string, StatMeta>();
  keys.forEach((name) => {
    const w = weights[name] ?? 0;
    if (w <= 0) return;
    const abs = absMax.get(name) ?? 0;
    if (abs <= 0) return;
    meta.set(name, {
      w,
      abs,
      exp: statExponent(name, defs),
      negative: isNegativeStat(name, defs),
    });
  });
  return meta;
}

function range(start: number, end: number): number[] {
  const out: number[] = [];
  for (let i = start; i < end; i += 1) out.push(i);
  return out;
}

function emptyAcc(): Acc {
  return { flat: {}, percent: {}, multiplier: {} };
}

function cloneAcc(acc: Acc): Acc {
  return { flat: { ...acc.flat }, percent: { ...acc.percent }, multiplier: { ...acc.multiplier } };
}

function effectsFor(component: Component, tier: number): EffectContrib[] {
  const key = `${component.id ?? component.name}::${tier}`;
  const cached = effectsCache.get(key);
  if (cached) return cached;
  const contribs: EffectContrib[] = [];
  getComponentEffects(component, tier).forEach((effect) => {
    let value = typeof effect.value === 'number' ? effect.value : parseFloat(effect.value);
    if (!Number.isFinite(value)) return;
    if (tier > 0 && component.level_rule?.type === 'formula') {
      const formula = component.level_rule.formulas?.[effect.stat || ''];
      if (formula) {
        const evaluated = evaluateFormula(formula, { level: tier });
        if (evaluated != null) value = evaluated;
      }
    }
    const stat = (effect.stat || '').trim();
    if (!stat) return;
    contribs.push({ stat, type: effect.type, value });
  });
  effectsCache.set(key, contribs);
  return contribs;
}

function aggregateContribs(contribs: EffectContrib[]): { stat: string; flat: number; percent: number; multiplier: number }[] {
  const map = new Map<string, Agg>();
  contribs.forEach((c) => {
    let agg = map.get(c.stat);
    if (!agg) {
      agg = { flat: 0, percent: 0, multiplier: 1 };
      map.set(c.stat, agg);
    }
    if (c.type === 'multiplier') agg.multiplier *= c.value;
    else if (c.type === 'percent_add') agg.percent += c.value;
    else agg.flat += c.value;
  });
  return Array.from(map.entries()).map(([stat, agg]) => ({ stat, ...agg }));
}

function buildGain(agg: { flat: number; percent: number; multiplier: number }): number {
  if (agg.flat === 0 && agg.percent === 0) return agg.multiplier - 1;
  return agg.flat * (1 + agg.percent / 100) * agg.multiplier;
}

function finalValue(acc: Acc, stat: string): number {
  const flat = acc.flat[stat] ?? 0;
  const percent = acc.percent[stat] ?? 0;
  const multiplier = acc.multiplier[stat] ?? 1;
  if (flat === 0 && percent === 0) return multiplier;
  return flat * (1 + percent / 100) * multiplier;
}

function candidateLevels(min: number, max: number): number[] {
  const span = max - min + 1;
  if (span <= MAX_LEVEL_CANDIDATES) return range(min, max + 1);
  const step = (max - min) / (MAX_LEVEL_CANDIDATES - 1);
  const out: number[] = [];
  for (let i = 0; i < MAX_LEVEL_CANDIDATES; i += 1) out.push(Math.round(min + step * i));
  return [...new Set(out)];
}

function formulaContribsFor(formulas: Record<string, string> | undefined, level: number): { stat: string; value: number }[] {
  const out: { stat: string; value: number }[] = [];
  for (const [stat, formula] of Object.entries(formulas ?? {})) {
    if (!formula || !formula.trim()) continue;
    const value = evaluateFormula(formula, { level });
    if (value == null) continue;
    out.push({ stat, value: Math.round(value * 100) / 100 });
  }
  return out;
}

function buildSlotConfig(slot: Slot, excludedClasses?: Set<string>): SlotConfig | null {
  const stats = slot.stats;
  if (!stats) return null;
  const rules = getSlotRules(stats);
  const hasFormula = rules.includes('formula');
  const hasStatPoints = rules.includes('stat_points');
  const hasClassPoints = rules.includes('class_points');
  if (!hasFormula && !hasStatPoints && !hasClassPoints) return null;
  const slotRange = getSlotLevelRange(stats);
  const levels = candidateLevels(slotRange.min, slotRange.max);
  const formulaContribs: Record<number, { stat: string; value: number }[]> = {};
  levels.forEach((level) => {
    if (level > 0) formulaContribs[level] = formulaContribsFor(stats.formulas, level);
  });
  const classOptions = hasClassPoints
    ? (stats.classes || []).filter((name) => !excludedClasses?.has(name))
    : [];
  const classDeltas: Record<string, { stat: string; value: number }[][]> = {};
  const classStatSet: Record<string, string[]> = {};
  const maxLevel = levels[levels.length - 1];
  const maxPool = maxLevel * (stats.points_per_level ?? 0);
  if (classOptions.length > 0 && maxPool > 0) {
    classOptions.forEach((className) => {
      const formulas = stats.class_formulas?.[className];
      if (!formulas) return;
      const arr: { stat: string; value: number }[][] = [];
      const seen = new Set<string>();
      for (let p = 0; p < maxPool; p += 1) {
        const deltas = classDeltaEntries(formulas, p, 1);
        arr.push(deltas);
        deltas.forEach((d) => seen.add(d.stat));
      }
      classDeltas[className] = arr;
      classStatSet[className] = Array.from(seen);
    });
  }
  return {
    slot,
    levels,
    hasFormula,
    formulas: stats.formulas,
    statOptions: hasStatPoints ? stats.stats || [] : [],
    hasStatPoints,
    classOptions,
    hasClassPoints,
    pointsPerLevel: stats.points_per_level ?? 0,
    formulaContribs,
    classDeltas,
    classStatSet,
  };
}

function slotFormulaContrib(cfg: SlotConfig, level: number): { stat: string; value: number }[] {
  if (level <= 0) return [];
  return cfg.formulaContribs[level] ?? [];
}

function allocMaxFlatFor(cfg: SlotConfig): Record<string, number> {
  const out: Record<string, number> = {};
  const maxLevel = cfg.levels[cfg.levels.length - 1];
  const pool = maxLevel * cfg.pointsPerLevel;
  if (cfg.hasStatPoints && pool > 0) {
    cfg.statOptions.forEach((s) => {
      out[s] = (out[s] ?? 0) + pool;
    });
  }
  if (cfg.hasClassPoints && pool > 0) {
    cfg.classOptions.forEach((className) => {
      const formulas = cfg.slot.stats?.class_formulas?.[className];
      if (!formulas) return;
      for (const [stat, formula] of Object.entries(formulas)) {
        if (!formula || !formula.trim()) continue;
        const value = evaluateFormula(formula, { points: pool });
        if (value == null || value <= 0) continue;
        out[stat] = Math.max(out[stat] ?? 0, value);
      }
    });
  }
  return out;
}

function computeSlotAddBounds(configs: SlotConfig[]): SlotAddBounds {
  const maxFlat: Record<string, number> = {};
  const minFlat: Record<string, number> = {};
  const allocMaxFlat: Record<string, number> = {};
  configs.forEach((cfg) => {
    const alloc = allocMaxFlatFor(cfg);
    for (const [stat, value] of Object.entries(alloc)) {
      allocMaxFlat[stat] = (allocMaxFlat[stat] ?? 0) + value;
    }
    const fMax: Record<string, number> = {};
    const fMin: Record<string, number> = {};
    cfg.levels.forEach((level) => {
      slotFormulaContrib(cfg, level).forEach((c) => {
        fMax[c.stat] = Math.max(fMax[c.stat] ?? -Infinity, c.value);
        fMin[c.stat] = Math.min(fMin[c.stat] ?? Infinity, c.value);
      });
    });
    // A slot can always be left at level 0, where its formula contributes 0,
    // so the reachable contribution range always spans zero.
    for (const [stat, value] of Object.entries(fMax)) {
      maxFlat[stat] = (maxFlat[stat] ?? 0) + Math.max(0, value);
    }
    for (const [stat, value] of Object.entries(fMin)) {
      minFlat[stat] = (minFlat[stat] ?? 0) + Math.min(0, value);
    }
  });
  for (const [stat, value] of Object.entries(allocMaxFlat)) {
    maxFlat[stat] = (maxFlat[stat] ?? 0) + value;
  }
  return { maxFlat, minFlat, allocMaxFlat };
}

function computeAbsMax(components: Component[], slotAdd: SlotAddBounds): Map<string, number> {
  const absMax = new Map<string, number>();
  components.forEach((component) => {
    const maxTier = getMaxLevel(component);
    const tiers = maxTier > 0 ? range(0, maxTier + 1) : [0];
    tiers.forEach((tier) => {
      const stats = computeStats([{ component, tier }]);
      stats.forEach((s) => {
        const gain = buildGain({ flat: s.flat, percent: s.percent, multiplier: s.multiplier });
        const abs = Math.abs(gain);
        if (abs > (absMax.get(s.stat) ?? 0)) absMax.set(s.stat, abs);
      });
    });
  });
  for (const [stat, value] of Object.entries(slotAdd.maxFlat)) {
    const current = absMax.get(stat) ?? 0;
    if (value > current) absMax.set(stat, value);
  }
  return absMax;
}

function computeTierInfo(
  component: Component,
  weights: OptimizerWeights,
  defs: StatDefinition[],
  absMax: Map<string, number>
): TierInfo {
  const maxTier = getMaxLevel(component);
  const tiers = maxTier > 0 ? range(0, maxTier + 1) : [0];
  let bestTier = 0;
  let bestPotential = -Infinity;
  tiers.forEach((tier) => {
    let potential = 0;
    aggregateContribs(effectsFor(component, tier)).forEach((agg) => {
      const w = weights[agg.stat] ?? 0;
      if (w <= 0) return;
      const abs = absMax.get(agg.stat) ?? 0;
      if (abs <= 0) return;
      let gain: number;
      if (agg.flat === 0 && agg.percent === 0) gain = (agg.multiplier - 1) * abs;
      else gain = agg.flat * (1 + agg.percent / 100) * agg.multiplier;
      if (gain === 0) return;
      const norm = gain / abs;
      potential += w * utility(norm, statExponent(agg.stat, defs), isNegativeStat(agg.stat, defs));
    });
    if (potential >= bestPotential) {
      bestPotential = potential;
      bestTier = tier;
    }
  });
  return { bestTier, bestPotential };
}

function emptyBounds(): SlotBounds {
  return {
    maxFlat: {},
    minFlat: {},
    maxPercent: {},
    minPercent: {},
    maxMult: {},
    minMult: {},
    maxAbsFlat: {},
    maxAbsPercent: {},
  };
}

function computeSlotBounds(slot: Slot, candidates: Component[]): SlotBounds {
  const b = emptyBounds();
  candidates.forEach((component) => {
    const maxTier = getMaxLevel(component);
    const tiers = maxTier > 0 ? range(0, maxTier + 1) : [0];
    tiers.forEach((tier) => {
      aggregateContribs(effectsFor(component, tier)).forEach((agg) => {
        b.maxFlat[agg.stat] = Math.max(b.maxFlat[agg.stat] ?? -Infinity, agg.flat);
        b.minFlat[agg.stat] = Math.min(b.minFlat[agg.stat] ?? Infinity, agg.flat);
        b.maxPercent[agg.stat] = Math.max(b.maxPercent[agg.stat] ?? -Infinity, agg.percent);
        b.minPercent[agg.stat] = Math.min(b.minPercent[agg.stat] ?? Infinity, agg.percent);
        b.maxMult[agg.stat] = Math.max(b.maxMult[agg.stat] ?? -Infinity, agg.multiplier);
        b.minMult[agg.stat] = Math.min(b.minMult[agg.stat] ?? Infinity, agg.multiplier);
        b.maxAbsFlat[agg.stat] = Math.max(b.maxAbsFlat[agg.stat] ?? 0, Math.abs(agg.flat));
        b.maxAbsPercent[agg.stat] = Math.max(b.maxAbsPercent[agg.stat] ?? 0, Math.abs(agg.percent));
      });
    });
  });
  const allKeys = new Set<string>();
  [b.maxFlat, b.minFlat, b.maxPercent, b.minPercent, b.maxMult, b.minMult, b.maxAbsFlat, b.maxAbsPercent].forEach(
    (m) => {
      Object.keys(m).forEach((k) => allKeys.add(k));
    }
  );
  allKeys.forEach((stat) => {
    b.maxFlat[stat] = Math.max(0, b.maxFlat[stat] ?? -Infinity);
    b.minFlat[stat] = Math.min(0, b.minFlat[stat] ?? Infinity);
    b.maxPercent[stat] = Math.max(0, b.maxPercent[stat] ?? -Infinity);
    b.minPercent[stat] = Math.min(0, b.minPercent[stat] ?? Infinity);
    b.maxMult[stat] = Math.max(1, b.maxMult[stat] ?? -Infinity);
    b.minMult[stat] = Math.min(1, b.minMult[stat] ?? Infinity);
  });
  return b;
}

function sumMaps(a: Record<string, number>, b: Record<string, number>): Record<string, number> {
  const out: Record<string, number> = { ...a };
  Object.keys(b).forEach((k) => {
    out[k] = (out[k] ?? 0) + (b[k] ?? 0);
  });
  return out;
}

function productMaps(a: Record<string, number>, b: Record<string, number>): Record<string, number> {
  const out: Record<string, number> = { ...a };
  Object.keys(b).forEach((k) => {
    out[k] = (out[k] ?? 1) * (b[k] ?? 1);
  });
  return out;
}

function buildSuffix(bounds: SlotBounds[]): Suffix {
  const n = bounds.length;
  const make = (): Record<string, number>[] => {
    const arr: Record<string, number>[] = new Array(n + 1);
    arr[n] = {};
    return arr;
  };
  const maxFlat = make();
  const minFlat = make();
  const maxPercent = make();
  const minPercent = make();
  const maxMult = make();
  const minMult = make();
  const maxAbsFlat = make();
  const maxAbsPercent = make();
  for (let i = n - 1; i >= 0; i -= 1) {
    maxFlat[i] = sumMaps(maxFlat[i + 1], bounds[i].maxFlat);
    minFlat[i] = sumMaps(minFlat[i + 1], bounds[i].minFlat);
    maxPercent[i] = sumMaps(maxPercent[i + 1], bounds[i].maxPercent);
    minPercent[i] = sumMaps(minPercent[i + 1], bounds[i].minPercent);
    maxAbsFlat[i] = sumMaps(maxAbsFlat[i + 1], bounds[i].maxAbsFlat);
    maxAbsPercent[i] = sumMaps(maxAbsPercent[i + 1], bounds[i].maxAbsPercent);
    maxMult[i] = productMaps(maxMult[i + 1], bounds[i].maxMult);
    minMult[i] = productMaps(minMult[i + 1], bounds[i].minMult);
  }
  return { maxFlat, minFlat, maxPercent, minPercent, maxMult, minMult, maxAbsFlat, maxAbsPercent };
}

function feasibilityOK(
  acc: Acc,
  index: number,
  suffix: Suffix,
  reqs: OptimizerRequirements,
  slotAdd: SlotAddBounds
): boolean {
  for (const stat of Object.keys(reqs.min)) {
    const min = reqs.min[stat];
    if (min == null || Number.isNaN(min)) continue;
    const flat = acc.flat[stat] ?? 0;
    const percent = acc.percent[stat] ?? 0;
    const multiplier = acc.multiplier[stat] ?? 1;
    const maxF = suffix.maxFlat[index][stat] ?? 0;
    const maxP = suffix.maxPercent[index][stat] ?? 0;
    const maxM = suffix.maxMult[index][stat] ?? 1;
    const slotMax = slotAdd.maxFlat[stat] ?? 0;
    const pctTerm = 1 + (percent + maxP) / 100;
    if (pctTerm <= 0) continue;
    const ub = (flat + maxF + slotMax) * pctTerm * multiplier * maxM;
    if (ub + EPS < min) return false;
  }
  for (const stat of Object.keys(reqs.max)) {
    const max = reqs.max[stat];
    if (max == null || Number.isNaN(max)) continue;
    const flat = acc.flat[stat] ?? 0;
    const percent = acc.percent[stat] ?? 0;
    const multiplier = acc.multiplier[stat] ?? 1;
    const minF = suffix.minFlat[index][stat] ?? 0;
    const minP = suffix.minPercent[index][stat] ?? 0;
    const minM = suffix.minMult[index][stat] ?? 1;
    const slotMin = slotAdd.minFlat[stat] ?? 0;
    const pctTerm = 1 + (percent + minP) / 100;
    if (pctTerm <= 0) continue;
    const base = flat + minF + slotMin;
    if (base < 0) continue;
    const lb = base * pctTerm * multiplier * minM;
    if (lb - EPS > max) return false;
  }
  return true;
}

function currentGain(acc: Acc, stat: string): number {
  const flat = acc.flat[stat] ?? 0;
  const percent = acc.percent[stat] ?? 0;
  const multiplier = acc.multiplier[stat] ?? 1;
  if (flat === 0 && percent === 0) return multiplier - 1;
  return flat * (1 + percent / 100) * multiplier;
}

function poolFlatDelta(acc: Acc, index: number, suffix: Suffix, stat: string): number {
  const percent = acc.percent[stat] ?? 0;
  const multiplier = acc.multiplier[stat] ?? 1;
  const maxAbsP = suffix.maxAbsPercent[index][stat] ?? 0;
  const maxM = suffix.maxMult[index][stat] ?? 1;
  const pctTerm = 1 + (Math.abs(percent) + maxAbsP) / 100;
  if (pctTerm <= 0) return 0;
  return pctTerm * Math.abs(multiplier) * maxM;
}

function computeBound(
  acc: Acc,
  index: number,
  suffix: Suffix,
  scoringStats: string[],
  meta: Map<string, StatMeta>,
  slotAdd: SlotAddBounds,
  state: SearchState,
  chosenLevels: Record<string, number>
): number {
  let bound = 0;
  scoringStats.forEach((stat) => {
    const m = meta.get(stat);
    if (!m) return;
    const flat = acc.flat[stat] ?? 0;
    const percent = acc.percent[stat] ?? 0;
    const multiplier = acc.multiplier[stat] ?? 1;
    const maxAbsF = suffix.maxAbsFlat[index][stat] ?? 0;
    const maxAbsP = suffix.maxAbsPercent[index][stat] ?? 0;
    const maxM = suffix.maxMult[index][stat] ?? 1;
    // slotAdd.maxFlat folds the point-pool potential (allocMaxFlat) on top of the
    // per-slot level-formula contributions. The pool potential is budgeted
    // separately per-stat below so it is not summed over every weighted stat;
    // only the formula part stays per-stat.
    const formulaMax = Math.max(0, (slotAdd.maxFlat[stat] ?? 0) - (slotAdd.allocMaxFlat[stat] ?? 0));
    const multProd = Math.abs(multiplier) * maxM;
    let gainUB: number;
    if (flat === 0 && percent === 0 && maxAbsF === 0 && maxAbsP === 0 && formulaMax === 0) {
      gainUB = Math.max(0, multProd - 1);
    } else {
      gainUB = (Math.abs(flat) + maxAbsF + formulaMax) * (1 + (Math.abs(percent) + maxAbsP) / 100) * multProd;
    }
    if (gainUB <= 0) return;
    const norm = gainUB / m.abs;
    bound += m.w * Math.pow(norm, m.exp);
  });

  // Pool contributions. Each point slot's flat is budgeted per-stat rather than
  // as a single scalar: the pool's flat is spent on top of the currently
  // decided accumulator (the smallest base it can be spent on, so these are
  // strict upper bounds that tighten as the search descends) and is amplified
  // per-stat by the largest percent/multiplier still reachable from the
  // remaining slots. The stat pool may be split across the slot's own
  // statOptions, so each option is granted the full pool (a valid upper bound
  // on any split since the marginal utility per stat is increasing in the
  // granted flat).
  let poolBound = 0;
  for (let s = 0; s < state.slotsWithPools.length; s += 1) {
    const slotName = state.slotsWithPools[s];
    const byLevel = state.poolBounds.get(slotName);
    if (!byLevel) continue;
    const decided = chosenLevels[slotName];
    let bestContribution = 0;
    byLevel.forEach((plb, level) => {
      if (decided != null && level !== decided) return;
      let contribution = 0;
      if (plb.statPoints > 0) {
        plb.statOptions.forEach((stat) => {
          const m = meta.get(stat);
          if (!m || m.w <= 0 || m.abs <= 0) return;
          const delta = plb.statPoints * poolFlatDelta(acc, index, suffix, stat);
          if (delta <= 0) return;
          const g = currentGain(acc, stat);
          const u0 = utility(g / m.abs, m.exp, m.negative);
          const u1 = utility((g + delta) / m.abs, m.exp, m.negative);
          const marginal = m.w * (u1 - u0);
          if (marginal > 0) contribution += marginal;
        });
      }
      const classFlat = plb.classFullFlat;
      if (classFlat) {
        scoringStats.forEach((stat) => {
          const ff = classFlat[stat];
          if (!ff || ff <= 0) return;
          const m = meta.get(stat);
          if (!m || m.w <= 0 || m.abs <= 0) return;
          const delta = ff * poolFlatDelta(acc, index, suffix, stat);
          if (delta <= 0) return;
          const g = currentGain(acc, stat);
          const u0 = utility(g / m.abs, m.exp, m.negative);
          const u1 = utility((g + delta) / m.abs, m.exp, m.negative);
          const marginal = m.w * (u1 - u0);
          if (marginal > 0) contribution += marginal;
        });
      }
      if (contribution > bestContribution) bestContribution = contribution;
    });
    poolBound += bestContribution;
  }
  return bound + poolBound;
}

function computeScore(
  acc: Acc,
  scoringStats: string[],
  meta: Map<string, StatMeta>
): { score: number; overall: number } {
  let score = 0;
  let overall = 1;
  scoringStats.forEach((stat) => {
    const m = meta.get(stat);
    if (!m) return;
    const flat = acc.flat[stat] ?? 0;
    const percent = acc.percent[stat] ?? 0;
    const multiplier = acc.multiplier[stat] ?? 1;
    const gain = flat === 0 && percent === 0 ? multiplier - 1 : flat * (1 + percent / 100) * multiplier;
    if (gain === 0) return;
    const weighted = m.w * utility(gain / m.abs, m.exp, m.negative);
    score += weighted;
    overall *= 1 + weighted;
  });
  return { score, overall };
}

function satisfies(acc: Acc, reqs: OptimizerRequirements): boolean {
  for (const stat of Object.keys(reqs.min)) {
    const min = reqs.min[stat];
    if (min == null || Number.isNaN(min)) continue;
    if (finalValue(acc, stat) + EPS < min) return false;
  }
  for (const stat of Object.keys(reqs.max)) {
    const max = reqs.max[stat];
    if (max == null || Number.isNaN(max)) continue;
    if (finalValue(acc, stat) - EPS > max) return false;
  }
  return true;
}

function candidateAllowed(
  slot: Slot,
  component: Component,
  entries: Record<string, EquippedEntry>,
  constraints: Constraint[]
): boolean {
  const cat = component.category;
  let catCount = 0;
  let dupName = false;
  Object.keys(entries).forEach((slotName) => {
    const entry = entries[slotName];
    if (!entry || entry.component.category !== cat) return;
    catCount += 1;
    if (entry.component.name === component.name) dupName = true;
  });
  for (const c of constraints) {
    if (c.type === 'mutual_exclusion') {
      if (c.slots?.includes(slot.slot_name)) {
        const other = c.slots.find((n) => n !== slot.slot_name);
        if (other && entries[other]) return false;
      }
    } else if (c.category === cat) {
      if (c.type === 'unique') {
        if (catCount >= 1) return false;
      } else if (c.type === 'global_limit') {
        if (catCount >= (c.limit ?? 1)) return false;
      } else if (c.type === 'pool_unique') {
        if (dupName) return false;
        if (catCount >= (c.limit ?? 1)) return false;
      }
    } else if (c.type === 'seal' && c.if_category === cat) {
      const target = c.seals_slot;
      if (!target || target === slot.slot_name) return false;
      if (entries[target]) return false;
    }
  }
  return true;
}

function applyComponent(
  acc: Acc,
  slotName: string,
  component: Component,
  tier: number,
  entries: Record<string, EquippedEntry>,
  sealedTargets: Set<string>,
  constraints: Constraint[],
  sealedAdded: string[]
): void {
  effectsFor(component, tier).forEach((c) => {
    if (c.type === 'multiplier') acc.multiplier[c.stat] = (acc.multiplier[c.stat] ?? 1) * c.value;
    else if (c.type === 'percent_add') acc.percent[c.stat] = (acc.percent[c.stat] ?? 0) + c.value;
    else acc.flat[c.stat] = (acc.flat[c.stat] ?? 0) + c.value;
  });
  entries[slotName] = { component, tier };
  constraints.forEach((c) => {
    if (c.type === 'seal' && c.if_category === component.category && c.seals_slot && c.seals_slot !== slotName) {
      if (!sealedTargets.has(c.seals_slot)) {
        sealedTargets.add(c.seals_slot);
        sealedAdded.push(c.seals_slot);
      }
    }
  });
}

function undoComponent(
  acc: Acc,
  slotName: string,
  component: Component,
  tier: number,
  entries: Record<string, EquippedEntry>,
  sealedTargets: Set<string>,
  sealedAdded: string[]
): void {
  effectsFor(component, tier).forEach((c) => {
    if (c.type === 'multiplier') acc.multiplier[c.stat] = (acc.multiplier[c.stat] ?? 1) / c.value;
    else if (c.type === 'percent_add') acc.percent[c.stat] = (acc.percent[c.stat] ?? 0) - c.value;
    else acc.flat[c.stat] = (acc.flat[c.stat] ?? 0) - c.value;
  });
  delete entries[slotName];
  sealedAdded.forEach((t) => sealedTargets.delete(t));
}

function applyOption(
  acc: Acc,
  entries: Record<string, EquippedEntry>,
  chosenLevels: Record<string, number>,
  slotName: string,
  cfg: SlotConfig | null,
  level: number | null,
  component: Component | null,
  tier: number,
  sealedTargets: Set<string>,
  sealedAdded: string[],
  constraints: Constraint[]
): void {
  if (cfg && level != null) {
    slotFormulaContrib(cfg, level).forEach((c) => {
      acc.flat[c.stat] = (acc.flat[c.stat] ?? 0) + c.value;
    });
    chosenLevels[slotName] = level;
  }
  if (component) {
    applyComponent(acc, slotName, component, tier, entries, sealedTargets, constraints, sealedAdded);
  }
}

function undoOption(
  acc: Acc,
  entries: Record<string, EquippedEntry>,
  chosenLevels: Record<string, number>,
  slotName: string,
  cfg: SlotConfig | null,
  level: number | null,
  component: Component | null,
  tier: number,
  sealedTargets: Set<string>,
  sealedAdded: string[]
): void {
  if (component) {
    undoComponent(acc, slotName, component, tier, entries, sealedTargets, sealedAdded);
  }
  if (cfg && level != null) {
    slotFormulaContrib(cfg, level).forEach((c) => {
      acc.flat[c.stat] = (acc.flat[c.stat] ?? 0) - c.value;
    });
    delete chosenLevels[slotName];
  }
}

function statMarginal(
  acc: Acc,
  stat: string,
  delta: number,
  meta: Map<string, StatMeta>
): number {
  const m = meta.get(stat);
  if (!m) return 0;
  const flat = acc.flat[stat] ?? 0;
  const percent = acc.percent[stat] ?? 0;
  const multiplier = acc.multiplier[stat] ?? 1;
  const gain = flat === 0 && percent === 0 ? multiplier - 1 : flat * (1 + percent / 100) * multiplier;
  const nextFlat = flat + delta;
  const gain2 = nextFlat === 0 && percent === 0 ? multiplier - 1 : nextFlat * (1 + percent / 100) * multiplier;
  const u = utility(gain / m.abs, m.exp, m.negative);
  const u2 = utility(gain2 / m.abs, m.exp, m.negative);
  return m.w * (u2 - u);
}

function classDeltaEntries(formulas: Record<string, string>, currentPts: number, deltaPts: number): { stat: string; value: number }[] {
  const out: { stat: string; value: number }[] = [];
  for (const [stat, formula] of Object.entries(formulas)) {
    if (!formula || !formula.trim()) continue;
    const before = evaluateFormula(formula, { points: currentPts });
    const after = evaluateFormula(formula, { points: currentPts + deltaPts });
    if (before == null || after == null) continue;
    const delta = Math.round((after - before) * 100) / 100;
    if (delta !== 0) out.push({ stat, value: delta });
  }
  return out;
}

function classStepFor(cfg: SlotConfig, className: string, currentPts: number): { stat: string; value: number }[] | null {
  const arr = cfg.classDeltas[className];
  if (!arr || currentPts < 0 || currentPts >= arr.length) return null;
  return arr[currentPts];
}
function statU(
  acc: Acc,
  stat: string,
  meta: Map<string, StatMeta>,
  cache: Record<string, number | undefined>
): number {
  let u = cache[stat];
  if (u !== undefined) return u;
  const m = meta.get(stat);
  if (!m) return 0;
  const flat = acc.flat[stat] ?? 0;
  const percent = acc.percent[stat] ?? 0;
  const multiplier = acc.multiplier[stat] ?? 1;
  const gain = flat === 0 && percent === 0 ? multiplier - 1 : flat * (1 + percent / 100) * multiplier;
  u = utility(gain / m.abs, m.exp, m.negative);
  cache[stat] = u;
  return u;
}

function statUAfterDelta(
  acc: Acc,
  stat: string,
  delta: number,
  meta: Map<string, StatMeta>,
  cache: Record<string, Map<number, number> | undefined>
): number | null {
  const m = meta.get(stat);
  if (!m || m.w <= 0 || m.abs <= 0) return null;
  let byDelta = cache[stat];
  if (!byDelta) {
    byDelta = new Map<number, number>();
    cache[stat] = byDelta;
  }
  const u2 = byDelta.get(delta);
  if (u2 !== undefined) return u2;
  const flat = acc.flat[stat] ?? 0;
  const percent = acc.percent[stat] ?? 0;
  const multiplier = acc.multiplier[stat] ?? 1;
  const nextFlat = flat + delta;
  const gain = nextFlat === 0 && percent === 0 ? multiplier - 1 : nextFlat * (1 + percent / 100) * multiplier;
  const computed = utility(gain / m.abs, m.exp, m.negative);
  byDelta.set(delta, computed);
  return computed;
}

function classWindowedMarginal(
  acc: Acc,
  cfg: SlotConfig,
  className: string,
  currentPts: number,
  remaining: number,
  meta: Map<string, StatMeta>,
  u1Cache: Record<string, number | undefined>,
  u2Cache: Record<string, Map<number, number> | undefined>
): number {
  const arr = cfg.classDeltas[className];
  if (!arr || currentPts < 0 || currentPts >= arr.length) return 0;
  let window = 1;
  const maxWindow = Math.min(CLASS_WINDOW_CAP, remaining);
  while (window <= maxWindow && currentPts + window - 1 < arr.length) {
    const step = arr[currentPts + window - 1];
    if (step && step.length > 0) break;
    window += 1;
  }
  if (window > maxWindow || currentPts + window - 1 >= arr.length) return 0;
  let sum = 0;
  for (let k = 0; k < window; k += 1) {
    const step = arr[currentPts + k];
    if (!step || step.length === 0) continue;
    for (let e = 0; e < step.length; e += 1) {
      const entry = step[e];
      const m = meta.get(entry.stat);
      if (!m || m.w <= 0 || m.abs <= 0) continue;
      const u2 = statUAfterDelta(acc, entry.stat, entry.value, meta, u2Cache);
      if (u2 === null) continue;
      const u1 = statU(acc, entry.stat, meta, u1Cache);
      sum += m.w * (u2 - u1);
    }
  }
  return sum / window;
}

function maxExceeded(stat: string, value: number, reqs: OptimizerRequirements): boolean {
  const max = reqs.max[stat];
  if (max == null || Number.isNaN(max)) return false;
  return value - EPS > max;
}

function finalizeBuild(
  acc: Acc,
  entries: Record<string, EquippedEntry>,
  chosenLevels: Record<string, number>,
  configBySlot: Map<string, SlotConfig>,
  reqs: OptimizerRequirements,
  meta: Map<string, StatMeta>,
  scoringStats: string[],
  deadline: number,
  multiclass: boolean
): FinalizedBuild | null {
  const finalAcc = cloneAcc(acc);
  const slotRules: StatContribution[] = [];
  const allocatedStat: Record<string, Record<string, number>> = {};
  const allocatedClass: Record<string, Record<string, number>> = {};
  const classRuleTotals: Record<string, Record<string, Record<string, number>>> = {};
  const slotLevels: Record<string, number> = {};

  configBySlot.forEach((cfg, slotName) => {
    const level = chosenLevels[slotName];
    if (level == null) return;
    const source = cfg.slot.shown_name || cfg.slot.slot_name;
    slotLevels[slotName] = level;
    slotFormulaContrib(cfg, level).forEach((c) => {
      slotRules.push({ stat: c.stat, component: `${source} · Lvl ${level}`, type: 'flat', value: c.value });
    });
    if (level > 0 && cfg.pointsPerLevel > 0) {
      if (cfg.hasStatPoints) allocatedStat[slotName] = {};
      if (cfg.hasClassPoints) allocatedClass[slotName] = {};
    }
  });

  const pools: Pool[] = [];
  configBySlot.forEach((cfg, slotName) => {
    const level = chosenLevels[slotName] ?? 0;
    if (level <= 0 || cfg.pointsPerLevel <= 0) return;
    const pool = level * cfg.pointsPerLevel;
    if (cfg.hasStatPoints) {
      cfg.statOptions.forEach((option) => {
        pools.push({ slotName, cfg, kind: 'stat', option, remaining: pool });
      });
    }
    if (cfg.hasClassPoints) {
      cfg.classOptions.forEach((option) => {
        pools.push({ slotName, cfg, kind: 'class', option, remaining: pool });
      });
    }
  });

  if (pools.length === 0) {
    if (!satisfies(finalAcc, reqs)) return null;
    const { score, overall } = computeScore(finalAcc, scoringStats, meta);
    return { score, overall, slotRules, slotLevels, slotDistribution: {} };
  }

  const slotStatRemaining: Record<string, number> = {};
  const slotClassRemaining: Record<string, number> = {};
  const slotClassChosen: Record<string, string | null> = {};
  configBySlot.forEach((cfg, slotName) => {
    const level = chosenLevels[slotName] ?? 0;
    if (level > 0 && cfg.pointsPerLevel > 0) {
      if (cfg.hasStatPoints) slotStatRemaining[slotName] = level * cfg.pointsPerLevel;
      if (cfg.hasClassPoints) {
        slotClassRemaining[slotName] = level * cfg.pointsPerLevel;
        slotClassChosen[slotName] = null;
      }
    }
  });

  let steps = 0;

  for (const stat of Object.keys(reqs.min)) {
    const min = reqs.min[stat];
    if (min == null || Number.isNaN(min)) continue;
    let guard = 0;
    while (finalValue(finalAcc, stat) + EPS < min && guard < MAX_ALLOC_STEPS) {
      let added = false;
      for (const pool of pools) {
        if (pool.remaining <= 0) continue;
        if (pool.kind === 'stat') {
          if (pool.option !== stat) continue;
          const sharedLeft = slotStatRemaining[pool.slotName] ?? 0;
          if (sharedLeft <= 0) continue;
          finalAcc.flat[stat] = (finalAcc.flat[stat] ?? 0) + 1;
          allocatedStat[pool.slotName][pool.option] = (allocatedStat[pool.slotName][pool.option] ?? 0) + 1;
          slotStatRemaining[pool.slotName] = sharedLeft - 1;
          added = true;
          steps += 1;
          if (finalValue(finalAcc, stat) >= min) break;
        } else {
          const sharedLeft = slotClassRemaining[pool.slotName] ?? 0;
          if (sharedLeft <= 0) continue;
          if (!multiclass && slotClassChosen[pool.slotName] && slotClassChosen[pool.slotName] !== pool.option) continue;
          const step = classStepFor(pool.cfg, pool.option, allocatedClass[pool.slotName][pool.option] ?? 0);
          if (!step || step.length === 0) continue;
          let statDelta = 0;
          for (const entry of step) {
            if (entry.stat === stat) {
              statDelta = entry.value;
              break;
            }
          }
          if (statDelta === 0) continue;
          allocatedClass[pool.slotName][pool.option] = (allocatedClass[pool.slotName][pool.option] ?? 0) + 1;
          slotClassRemaining[pool.slotName] = sharedLeft - 1;
          if (!multiclass) slotClassChosen[pool.slotName] = pool.option;
          for (const entry of step) {
            finalAcc.flat[entry.stat] = (finalAcc.flat[entry.stat] ?? 0) + entry.value;
            const totals = (classRuleTotals[pool.slotName] ??= {});
            const byStat = (totals[pool.option] ??= {});
            byStat[entry.stat] = (byStat[entry.stat] ?? 0) + entry.value;
          }
          added = true;
          steps += 1;
          if (finalValue(finalAcc, stat) >= min) break;
        }
      }
      if (!added) break;
      guard += 1;
      if (steps >= MAX_ALLOC_STEPS) break;
    }
  }

  const hasMax = Object.keys(reqs.max).length > 0;
  const statDeltaCache: Record<string, number | undefined> = {};
  const classDeltaCache: Record<string, number | undefined> = {};
  const u1Cache: Record<string, number | undefined> = {};
  const u2Cache: Record<string, Map<number, number> | undefined> = {};
  const statToClasses = new Map<string, string[]>();
  for (const pool of pools) {
    if (pool.kind !== 'class') continue;
    pool.classKey = `${pool.slotName}:${pool.option}`;
    const set = pool.cfg.classStatSet[pool.option] ?? [];
    for (let i = 0; i < set.length; i += 1) {
      const stat = set[i];
      let arr = statToClasses.get(stat);
      if (!arr) {
        arr = [];
        statToClasses.set(stat, arr);
      }
      if (arr[arr.length - 1] !== pool.classKey) arr.push(pool.classKey);
    }
  }

  const invalidateStat = (stat: string): void => {
    statDeltaCache[stat] = undefined;
    u1Cache[stat] = undefined;
    u2Cache[stat] = undefined;
    const classes = statToClasses.get(stat);
    if (classes) {
      for (let c = 0; c < classes.length; c += 1) classDeltaCache[classes[c]] = undefined;
    }
  };

  while (true) {
    let bestDelta = 0;
    let bestPool: Pool | null = null;
    let bestStep: { stat: string; value: number }[] | null = null;
    let bestCurrentPts = 0;
    for (const pool of pools) {
      if (pool.remaining <= 0) continue;
      if (pool.kind === 'stat') {
        if ((slotStatRemaining[pool.slotName] ?? 0) <= 0) continue;
        let delta = statDeltaCache[pool.option];
        if (delta === undefined) {
          delta = statMarginal(finalAcc, pool.option, 1, meta);
          statDeltaCache[pool.option] = delta;
        }
        if (delta <= bestDelta) continue;
        if (hasMax) {
          const next = (finalAcc.flat[pool.option] ?? 0) + 1;
          const percent = finalAcc.percent[pool.option] ?? 0;
          const multiplier = finalAcc.multiplier[pool.option] ?? 1;
          const candidate = next === 0 && percent === 0 ? multiplier : next * (1 + percent / 100) * multiplier;
          if (maxExceeded(pool.option, candidate, reqs)) continue;
        }
        bestDelta = delta;
        bestPool = pool;
      } else {
        const sharedLeft = slotClassRemaining[pool.slotName] ?? 0;
        if (sharedLeft <= 0) continue;
        if (!multiclass && slotClassChosen[pool.slotName] && slotClassChosen[pool.slotName] !== pool.option) continue;
        const currentPts = allocatedClass[pool.slotName][pool.option] ?? 0;
        const key = pool.classKey ?? '';
        let delta = classDeltaCache[key];
        if (delta === undefined) {
          delta = classWindowedMarginal(finalAcc, pool.cfg, pool.option, currentPts, sharedLeft, meta, u1Cache, u2Cache);
          classDeltaCache[key] = delta;
        }
        if (delta <= bestDelta) continue;
        const step = classStepFor(pool.cfg, pool.option, currentPts);
        if (!step) continue;
        if (hasMax) {
          let ok = true;
          for (const entry of step) {
            const next = (finalAcc.flat[entry.stat] ?? 0) + entry.value;
            const percent = finalAcc.percent[entry.stat] ?? 0;
            const multiplier = finalAcc.multiplier[entry.stat] ?? 1;
            const candidate = next === 0 && percent === 0 ? multiplier : next * (1 + percent / 100) * multiplier;
            if (maxExceeded(entry.stat, candidate, reqs)) {
              ok = false;
              break;
            }
          }
          if (!ok) continue;
        }
        bestDelta = delta;
        bestPool = pool;
        bestStep = step;
        bestCurrentPts = currentPts;
      }
    }
    if (!bestPool || bestDelta <= 0) break;
    if (bestPool.kind === 'stat') {
      finalAcc.flat[bestPool.option] = (finalAcc.flat[bestPool.option] ?? 0) + 1;
      const dist = allocatedStat[bestPool.slotName];
      dist[bestPool.option] = (dist[bestPool.option] ?? 0) + 1;
      invalidateStat(bestPool.option);
      slotStatRemaining[bestPool.slotName] = (slotStatRemaining[bestPool.slotName] ?? 0) - 1;
    } else {
      const nextPts = bestCurrentPts + 1;
      allocatedClass[bestPool.slotName][bestPool.option] = nextPts;
      const step = bestStep ?? [];
      for (const entry of step) {
        finalAcc.flat[entry.stat] = (finalAcc.flat[entry.stat] ?? 0) + entry.value;
        const totals = (classRuleTotals[bestPool.slotName] ??= {});
        const byStat = (totals[bestPool.option] ??= {});
        byStat[entry.stat] = (byStat[entry.stat] ?? 0) + entry.value;
      }
      slotClassRemaining[bestPool.slotName] = (slotClassRemaining[bestPool.slotName] ?? 0) - 1;
      if (!multiclass) slotClassChosen[bestPool.slotName] = bestPool.option;
      classDeltaCache[bestPool.classKey ?? ''] = undefined;
      for (const entry of step) invalidateStat(entry.stat);
    }
    steps += 1;
    if ((steps & 127) === 0 && Date.now() > deadline) break;
  }

  const classPoolsBySlot: Record<string, Pool[]> = {};
  for (const pool of pools) {
    if (pool.kind !== 'class') continue;
    const arr = classPoolsBySlot[pool.slotName];
    if (arr) arr.push(pool);
    else classPoolsBySlot[pool.slotName] = [pool];
  }

  for (const slotName of Object.keys(slotClassRemaining)) {
    let sharedLeft = slotClassRemaining[slotName];
    if (!sharedLeft || sharedLeft <= 0) continue;
    const slotPools = classPoolsBySlot[slotName];
    if (!slotPools || slotPools.length === 0) continue;
    let target: Pool | null = null;
    if (!multiclass) {
      const chosen = slotClassChosen[slotName];
      target = slotPools.find((p) => p.option === chosen) ?? slotPools[0];
    } else {
      let bestCount = -1;
      for (const pool of slotPools) {
        const count = allocatedClass[pool.slotName][pool.option] ?? 0;
        if (count > bestCount) {
          bestCount = count;
          target = pool;
        }
      }
    }
    if (!target) continue;
    let currentPts = allocatedClass[target.slotName][target.option] ?? 0;
    while (sharedLeft > 0) {
      const step = classStepFor(target.cfg, target.option, currentPts) ?? [];
      if (hasMax) {
        let ok = true;
        for (const entry of step) {
          const next = (finalAcc.flat[entry.stat] ?? 0) + entry.value;
          const percent = finalAcc.percent[entry.stat] ?? 0;
          const multiplier = finalAcc.multiplier[entry.stat] ?? 1;
          const candidate = next === 0 && percent === 0 ? multiplier : next * (1 + percent / 100) * multiplier;
          if (maxExceeded(entry.stat, candidate, reqs)) {
            ok = false;
            break;
          }
        }
        if (!ok) break;
      }
      for (const entry of step) {
        finalAcc.flat[entry.stat] = (finalAcc.flat[entry.stat] ?? 0) + entry.value;
        const totals = (classRuleTotals[target.slotName] ??= {});
        const byStat = (totals[target.option] ??= {});
        byStat[entry.stat] = (byStat[entry.stat] ?? 0) + entry.value;
      }
      currentPts += 1;
      allocatedClass[target.slotName][target.option] = currentPts;
      sharedLeft -= 1;
      slotClassRemaining[target.slotName] = sharedLeft;
      steps += 1;
      if ((steps & 127) === 0 && Date.now() > deadline) break;
    }
  }

  configBySlot.forEach((cfg, slotName) => {
    const source = cfg.slot.shown_name || cfg.slot.slot_name;
    const statDist = allocatedStat[slotName];
    if (statDist) {
      for (const [stat, count] of Object.entries(statDist)) {
        if (count > 0) {
          slotRules.push({ stat, component: `${source} · points`, type: 'flat', value: count });
        }
      }
    }
    const classDist = allocatedClass[slotName];
    const classTotals = classRuleTotals[slotName];
    if (classDist && classTotals) {
      for (const [className, allocated] of Object.entries(classDist)) {
        if (allocated <= 0) continue;
        const byStat = classTotals[className];
        if (!byStat) continue;
        for (const [stat, value] of Object.entries(byStat)) {
          if (value === 0) continue;
          slotRules.push({
            stat,
            component: `${source} · ${className} · ${allocated} pts`,
            type: 'flat',
            value: Math.round(value * 100) / 100,
          });
        }
      }
    }
  });

  if (!satisfies(finalAcc, reqs)) return null;

  const { score, overall } = computeScore(finalAcc, scoringStats, meta);

  const slotDistribution: Record<string, Record<string, number>> = {};
  configBySlot.forEach((cfg, slotName) => {
    const dist: Record<string, number> = {};
    const statDist = allocatedStat[slotName];
    if (statDist) {
      for (const [key, value] of Object.entries(statDist)) {
        if (value > 0) dist[key] = value;
      }
    }
    const classDist = allocatedClass[slotName];
    if (classDist) {
      for (const [key, value] of Object.entries(classDist)) {
        if (value > 0) dist[key] = value;
      }
    }
    if (Object.keys(dist).length > 0) slotDistribution[slotName] = dist;
  });

  return { score, overall, slotRules, slotLevels, slotDistribution };
}

function computePoolBounds(
  configBySlot: Map<string, SlotConfig>
): { poolBounds: Map<string, Map<number, PoolLevelBound>>; slotsWithPools: string[] } {
  const poolBounds = new Map<string, Map<number, PoolLevelBound>>();
  const slotsWithPools: string[] = [];
  configBySlot.forEach((cfg, slotName) => {
    if (!cfg.hasStatPoints && !cfg.hasClassPoints) return;
    if (cfg.pointsPerLevel <= 0) return;
    const byLevel = new Map<number, PoolLevelBound>();
    cfg.levels.forEach((level) => {
      if (level <= 0) {
        byLevel.set(level, { statPoints: 0, statOptions: [], classFullFlat: null });
        return;
      }
      const pool = level * cfg.pointsPerLevel;
      const statPoints = cfg.hasStatPoints ? pool : 0;
      const statOptions = cfg.hasStatPoints ? cfg.statOptions : [];
      let classFullFlat: Record<string, number> | null = null;
      if (cfg.hasClassPoints) {
        const flat: Record<string, number> = {};
        cfg.classOptions.forEach((className) => {
          const formulas = cfg.slot.stats?.class_formulas?.[className];
          if (!formulas) return;
          for (const [stat, formula] of Object.entries(formulas)) {
            if (!formula || !formula.trim()) continue;
            const value = evaluateFormula(formula, { points: pool });
            if (value == null || value <= 0) continue;
            flat[stat] = Math.max(flat[stat] ?? 0, value);
          }
        });
        classFullFlat = flat;
      }
      byLevel.set(level, { statPoints, statOptions, classFullFlat });
    });
    poolBounds.set(slotName, byLevel);
    slotsWithPools.push(slotName);
  });
  return { poolBounds, slotsWithPools };
}

function buildSignature(b: Omit<TopBuild, 'sig'>): string {
  const parts: string[] = [];
  Object.keys(b.entries)
    .sort()
    .forEach((slotName) => {
      const entry = b.entries[slotName];
      parts.push(`${slotName}:${entry.component.name}@${entry.tier}`);
    });
  Object.keys(b.slotLevels)
    .sort()
    .forEach((slotName) => {
      parts.push(`L${slotName}:${b.slotLevels[slotName]}`);
    });
  Object.keys(b.slotDistribution)
    .sort()
    .forEach((slotName) => {
      const dist = b.slotDistribution[slotName];
      Object.keys(dist)
        .sort()
        .forEach((key) => {
          parts.push(`D${slotName}:${key}=${dist[key]}`);
        });
    });
  return parts.join('|');
}

function insertTop(topBuilds: TopBuild[], build: Omit<TopBuild, 'sig'>, maxResults: number): void {
  const full: TopBuild = { ...build, sig: buildSignature(build) };
  if (topBuilds.some((existing) => existing.score === full.score && existing.sig === full.sig)) return;
  topBuilds.push(full);
  topBuilds.sort((a, b) => b.score - a.score);
  if (topBuilds.length > maxResults) topBuilds.length = maxResults;
}

interface Option {
  component: Component | null;
  tier: number;
  level: number | null;
}

function buildOptionsFor(
  slot: Slot,
  cfg: SlotConfig | null,
  candidates: Component[],
  entries: Record<string, EquippedEntry>,
  constraints: Constraint[],
  tierInfoMap: Map<string, TierInfo>
): Option[] {
  const options: Option[] = [];
  const allowed = candidates.filter((cand) => candidateAllowed(slot, cand, entries, constraints));
  const canBeEmpty = constraints.some(
    (c) =>
      (c.type === 'seal' && c.seals_slot === slot.slot_name) ||
      (c.type === 'mutual_exclusion' && c.slots?.includes(slot.slot_name))
  );
  if (cfg) {
    for (let i = cfg.levels.length - 1; i >= 0; i -= 1) {
      const level = cfg.levels[i];
      if (allowed.length === 0 || canBeEmpty) {
        options.push({ component: null, tier: 0, level });
      }
      allowed.forEach((cand) => {
        options.push({ component: cand, tier: tierInfoMap.get(cand.name)?.bestTier ?? 0, level });
      });
    }
  } else {
    if (allowed.length === 0 || canBeEmpty) {
      options.push({ component: null, tier: 0, level: null });
    }
    allowed.forEach((cand) => {
      options.push({ component: cand, tier: tierInfoMap.get(cand.name)?.bestTier ?? 0, level: null });
    });
  }
  return options;
}

function finalizeTopBuild(
  acc: Acc,
  entries: Record<string, EquippedEntry>,
  chosenLevels: Record<string, number>,
  configBySlot: Map<string, SlotConfig>,
  reqs: OptimizerRequirements,
  meta: Map<string, StatMeta>,
  scoringStats: string[],
  topBuilds: TopBuild[],
  maxResults: number,
  deadline: number,
  multiclass: boolean
): void {
  const finalized = finalizeBuild(acc, entries, chosenLevels, configBySlot, reqs, meta, scoringStats, deadline, multiclass);
  if (!finalized) return;
  insertTop(
    topBuilds,
    {
      entries: { ...entries },
      slotLevels: finalized.slotLevels,
      slotDistribution: finalized.slotDistribution,
      slotRules: finalized.slotRules,
      score: finalized.score,
      overall: finalized.overall,
    },
    maxResults
  );
}

function greedySeed(
  order: Slot[],
  candidatesBySlot: Map<string, Component[]>,
  tierInfoMap: Map<string, TierInfo>,
  configBySlot: Map<string, SlotConfig>,
  constraints: Constraint[],
  suffix: Suffix,
  slotAdd: SlotAddBounds,
  reqs: OptimizerRequirements,
  meta: Map<string, StatMeta>,
  scoringStats: string[],
  topBuilds: TopBuild[],
  maxResults: number,
  bias?: ReadonlyMap<string, number>,
  deadline?: number,
  multiclass?: boolean
): void {
  const acc = emptyAcc();
  const entries: Record<string, EquippedEntry> = {};
  const chosenLevels: Record<string, number> = {};
  const sealedTargets = new Set<string>();
  for (let i = 0; i < order.length; i += 1) {
    const slot = order[i];
    if (sealedTargets.has(slot.slot_name)) {
      const cfg = configBySlot.get(slot.slot_name) ?? null;
      if (cfg) {
        const sealedAdded: string[] = [];
        applyOption(acc, entries, chosenLevels, slot.slot_name, cfg, cfg.levels[cfg.levels.length - 1], null, 0, sealedTargets, sealedAdded, constraints);
      }
      continue;
    }
    const cfg = configBySlot.get(slot.slot_name) ?? null;
    const options = buildOptionsFor(slot, cfg, candidatesBySlot.get(slot.slot_name) ?? [], entries, constraints, tierInfoMap);
    let bestOption: Option | null = null;
    let bestScore = -Infinity;
    for (const option of options) {
      const sealedAdded: string[] = [];
      applyOption(acc, entries, chosenLevels, slot.slot_name, cfg, option.level, option.component, option.tier, sealedTargets, sealedAdded, constraints);
      let score = -Infinity;
      if (feasibilityOK(acc, i + 1, suffix, reqs, slotAdd)) {
        const optionBias = option.component ? bias?.get(option.component.name) ?? 0 : 0;
        score = computeScore(acc, scoringStats, meta).score - optionBias;
      }
      undoOption(acc, entries, chosenLevels, slot.slot_name, cfg, option.level, option.component, option.tier, sealedTargets, sealedAdded);
      if (score > bestScore) {
        bestScore = score;
        bestOption = option;
      }
    }
    if (bestOption) {
      const sealedAdded: string[] = [];
      applyOption(acc, entries, chosenLevels, slot.slot_name, cfg, bestOption.level, bestOption.component, bestOption.tier, sealedTargets, sealedAdded, constraints);
    }
  }
  finalizeTopBuild(acc, entries, chosenLevels, configBySlot, reqs, meta, scoringStats, topBuilds, maxResults, deadline ?? Number.MAX_SAFE_INTEGER, multiclass ?? true);
}

function* dfs(
  index: number,
  acc: Acc,
  entries: Record<string, EquippedEntry>,
  chosenLevels: Record<string, number>,
  sealedTargets: Set<string>,
  order: Slot[],
  candidatesBySlot: Map<string, Component[]>,
  tierInfoMap: Map<string, TierInfo>,
  configBySlot: Map<string, SlotConfig>,
  constraints: Constraint[],
  suffix: Suffix,
  slotAdd: SlotAddBounds,
  reqs: OptimizerRequirements,
  meta: Map<string, StatMeta>,
  scoringStats: string[],
  topBuilds: TopBuild[],
  state: SearchState
): Generator<SearchState> {
  if (state.truncated) return;
  state.nodes += 1;
  if (state.nodes > state.nodeBudget || Date.now() > state.deadline) {
    state.truncated = true;
    return;
  }
  if ((state.nodes % state.progressEvery) === 0) yield state;

  if (index === order.length) {
    finalizeTopBuild(acc, entries, chosenLevels, configBySlot, reqs, meta, scoringStats, topBuilds, state.maxResults, state.deadline, state.multiclass);
    return;
  }

  if (!feasibilityOK(acc, index, suffix, reqs, slotAdd)) {
    state.prunedFeas += 1;
    return;
  }

  if (topBuilds.length > 0) {
    const best = topBuilds[0].score;
    const bound = computeBound(acc, index, suffix, scoringStats, meta, slotAdd, state, chosenLevels);
    if (bound <= best + EPS) {
      state.prunedBound += 1;
      return;
    }
  }

  const slot = order[index];

  if (sealedTargets.has(slot.slot_name)) {
    const cfg = configBySlot.get(slot.slot_name) ?? null;
    if (cfg) {
      const sealedAdded: string[] = [];
      applyOption(acc, entries, chosenLevels, slot.slot_name, cfg, cfg.levels[cfg.levels.length - 1], null, 0, sealedTargets, sealedAdded, constraints);
      yield* dfs(index + 1, acc, entries, chosenLevels, sealedTargets, order, candidatesBySlot, tierInfoMap, configBySlot, constraints, suffix, slotAdd, reqs, meta, scoringStats, topBuilds, state);
      undoOption(acc, entries, chosenLevels, slot.slot_name, cfg, cfg.levels[cfg.levels.length - 1], null, 0, sealedTargets, sealedAdded);
    } else {
      yield* dfs(index + 1, acc, entries, chosenLevels, sealedTargets, order, candidatesBySlot, tierInfoMap, configBySlot, constraints, suffix, slotAdd, reqs, meta, scoringStats, topBuilds, state);
    }
    return;
  }

  const cfg = configBySlot.get(slot.slot_name) ?? null;
  const candidates = candidatesBySlot.get(slot.slot_name) ?? [];
  const options = buildOptionsFor(slot, cfg, candidates, entries, constraints, tierInfoMap);
  for (const option of options) {
    const sealedAdded: string[] = [];
    applyOption(acc, entries, chosenLevels, slot.slot_name, cfg, option.level, option.component, option.tier, sealedTargets, sealedAdded, constraints);
    yield* dfs(index + 1, acc, entries, chosenLevels, sealedTargets, order, candidatesBySlot, tierInfoMap, configBySlot, constraints, suffix, slotAdd, reqs, meta, scoringStats, topBuilds, state);
    undoOption(acc, entries, chosenLevels, slot.slot_name, cfg, option.level, option.component, option.tier, sealedTargets, sealedAdded);
    if (state.truncated) return;
  }
}

export async function runOptimizer(
  options: OptimizerOptions,
  onProgress?: (progress: OptimizerProgress) => void
): Promise<OptimizerResult> {
  const { slots, components, constraints, templateStats, weights, requirements, excluded, excludedClasses } = options;
  const maxResults = options.maxResults ?? DEFAULT_MAX_RESULTS;
  const nodeBudget = options.nodeBudget ?? DEFAULT_NODE_BUDGET;
  const timeLimitMs = options.timeLimitMs ?? DEFAULT_TIME_LIMIT_MS;
  const multiclass = options.multiclass ?? true;
  const deadline = Date.now() + timeLimitMs;
  const excludedSet = excluded ?? new Set<string>();
  const excludedClassSet = excludedClasses ?? new Set<string>();
  const poolComponents = components.filter((c) => !excludedSet.has(c.name));

  const reqs: OptimizerRequirements = { min: {}, max: {} };
  Object.keys(requirements.min).forEach((k) => {
    if (Number.isFinite(requirements.min[k])) reqs.min[k] = requirements.min[k];
  });
  Object.keys(requirements.max).forEach((k) => {
    if (Number.isFinite(requirements.max[k])) reqs.max[k] = requirements.max[k];
  });

  const configBySlot = new Map<string, SlotConfig>();
  slots.forEach((slot) => {
    const cfg = buildSlotConfig(slot, excludedClassSet);
    if (cfg) configBySlot.set(slot.slot_name, cfg);
  });

  const candidatesBySlot = new Map<string, Component[]>();
  const slotCandCount = new Map<string, number>();
  const usableSlots = slots.filter((s) => (s.accepts?.length ?? 0) > 0);
  usableSlots.forEach((slot) => {
    const accepted = new Set(slot.accepts);
    const cands = poolComponents.filter((c) => accepted.has(c.category));
    candidatesBySlot.set(slot.slot_name, cands);
    slotCandCount.set(slot.slot_name, cands.length);
  });

  const order = [...usableSlots].sort(
    (a, b) => (slotCandCount.get(a.slot_name) ?? 0) - (slotCandCount.get(b.slot_name) ?? 0)
  );

  const slotAdd = computeSlotAddBounds(Array.from(configBySlot.values()));
  const absMax = computeAbsMax(poolComponents, slotAdd);

  const tierInfoMap = new Map<string, TierInfo>();
  poolComponents.forEach((comp) => {
    tierInfoMap.set(comp.name, computeTierInfo(comp, weights, templateStats, absMax));
  });

  order.forEach((slot) => {
    const cands = candidatesBySlot.get(slot.slot_name) ?? [];
    cands.sort((x, y) => (tierInfoMap.get(y.name)?.bestPotential ?? 0) - (tierInfoMap.get(x.name)?.bestPotential ?? 0));
  });

  const bounds = order.map((slot) => computeSlotBounds(slot, candidatesBySlot.get(slot.slot_name) ?? []));
  const suffix = buildSuffix(bounds);

  const scoringStats = templateStats.map((d) => d.name).filter((n) => (weights[n] ?? 0) > 0);
  const meta = buildStatMeta(weights, absMax, templateStats);

  const { poolBounds, slotsWithPools } = computePoolBounds(configBySlot);

  const topBuilds: TopBuild[] = [];

  let searchSpaceEstimate = 1;
  order.forEach((slot) => {
    const count = (candidatesBySlot.get(slot.slot_name)?.length ?? 0) + 1;
    const cfg = configBySlot.get(slot.slot_name);
    const multiplier = cfg ? cfg.levels.length : 1;
    const total = count * multiplier;
    if (searchSpaceEstimate > 1e15) return;
    searchSpaceEstimate *= total;
  });
  if (searchSpaceEstimate > 1e15) searchSpaceEstimate = Infinity;

  greedySeed(order, candidatesBySlot, tierInfoMap, configBySlot, constraints, suffix, slotAdd, reqs, meta, scoringStats, topBuilds, maxResults, undefined, deadline, multiclass);

  const diversityBase = topBuilds.length > 0 ? topBuilds[0].score : 1;
  const diversityPenalty = Math.max(0.01, diversityBase * 0.02);
  let diversityPasses = 0;
  while (topBuilds.length < maxResults && diversityPasses < maxResults * 4) {
    diversityPasses += 1;
    const usage = new Map<string, number>();
    topBuilds.forEach((build) => {
      Object.values(build.entries).forEach((entry) => {
        usage.set(entry.component.name, (usage.get(entry.component.name) ?? 0) + 1);
      });
    });
    const bias = new Map<string, number>();
    usage.forEach((count, name) => {
      bias.set(name, count * diversityPenalty);
    });
    greedySeed(order, candidatesBySlot, tierInfoMap, configBySlot, constraints, suffix, slotAdd, reqs, meta, scoringStats, topBuilds, maxResults, bias, deadline, multiclass);
  }

  const state: SearchState = { nodes: 0, nodeBudget, progressEvery: options.progressEvery ?? 1024, prunedBound: 0, prunedFeas: 0, truncated: false, maxResults, deadline, multiclass, poolBounds, slotsWithPools };
  const entries: Record<string, EquippedEntry> = {};
  const chosenLevels: Record<string, number> = {};
  const sealedTargets = new Set<string>();
  const gen = dfs(0, emptyAcc(), entries, chosenLevels, sealedTargets, order, candidatesBySlot, tierInfoMap, configBySlot, constraints, suffix, slotAdd, reqs, meta, scoringStats, topBuilds, state);
  let step = gen.next();
  let batches = 0;
  while (!step.done) {
    batches += 1;
    if (onProgress) {
      onProgress({
        nodesExplored: state.nodes,
        prunedByBound: state.prunedBound,
        prunedByFeasibility: state.prunedFeas,
        truncated: state.truncated,
        searchSpaceEstimate,
      });
    }
    if ((batches & 7) === 0) {
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
    }
    if (Date.now() > deadline) {
      state.truncated = true;
      break;
    }
    step = gen.next();
  }

  const maxScore = topBuilds.length > 0 ? topBuilds[0].score : 0;

  const builds: OptimizedBuild[] = topBuilds.map((top) => {
    let grade = 0;
    if (maxScore > 0) {
      grade = Math.round((100 * top.score) / maxScore) / 10;
    }
    return {
      entries: top.entries,
      slotLevels: top.slotLevels,
      slotDistribution: top.slotDistribution,
      score: top.score,
      overall: top.overall,
      grade,
      summary: mergeSlotRules(computeStats(Object.values(top.entries)), top.slotRules),
    };
  });

  return {
    builds,
    nodesExplored: state.nodes,
    prunedByBound: state.prunedBound,
    prunedByFeasibility: state.prunedFeas,
    truncated: state.truncated,
    searchSpaceEstimate,
    feasibleExists: builds.length > 0,
  };
}
