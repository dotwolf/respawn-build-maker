export interface StatDefinition {
  name: string;
  group?: string;
  negative?: boolean;
}

/** Old templates persist `stats` as a plain string array; new ones store objects. */
export function normalizeTemplateStats(stats: unknown): StatDefinition[] {
  if (!Array.isArray(stats)) return [];
  const result: StatDefinition[] = [];
  for (const entry of stats) {
    if (typeof entry === 'string' && entry.trim()) {
      result.push({ name: entry.trim() });
    } else if (entry && typeof entry === 'object') {
      const obj = entry as Record<string, unknown>;
      const name = typeof obj.name === 'string' ? obj.name.trim() : '';
      if (!name) continue;
      result.push({
        name,
        group: typeof obj.group === 'string' && obj.group.trim() ? obj.group.trim() : undefined,
        negative: Boolean(obj.negative),
      });
    }
  }
  return result;
}

function findDefinition(defs: StatDefinition[], name: string): StatDefinition | undefined {
  return defs.find((def) => def.name === name);
}

export function statGroupOf(defs: StatDefinition[], name: string): string | undefined {
  return findDefinition(defs, name)?.group;
}

export function statIsNegative(defs: StatDefinition[], name: string): boolean {
  return Boolean(findDefinition(defs, name)?.negative);
}

/** Orders items to follow the template's stat order; unknown items are appended. */
export function orderStats<T>(items: T[], defs: StatDefinition[], getName: (item: T) => string): T[] {
  const rank = new Map(defs.map((def, index) => [def.name, index]));
  const known = items.filter((item) => rank.has(getName(item)));
  const unknown = items.filter((item) => !rank.has(getName(item)));
  known.sort((a, b) => (rank.get(getName(a)) ?? 0) - (rank.get(getName(b)) ?? 0));
  unknown.sort((a, b) => getName(a).localeCompare(getName(b)));
  return [...known, ...unknown];
}

/**
 * Renders a group divider between consecutive stats when their group differs or
 * the previous stat is ungrouped (ungrouped stats are divided too).
 */
export function shouldShowStatDivider(
  prev: { group?: string } | undefined,
  curr: { group?: string }
): boolean {
  if (!prev) return false;
  const prevGroup = prev.group ?? '';
  const currGroup = curr.group ?? '';
  return prevGroup !== currGroup || prevGroup === '';
}
