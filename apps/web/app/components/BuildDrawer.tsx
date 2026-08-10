'use client';

import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import { Copy, Loader2, X } from 'lucide-react';
import type { BuildListItem } from '../lib/builds';
import { parseBuildComponents, toEquippedMap } from '../lib/builds';
import { apiFetch } from '../lib/api';
import type { Component, Constraint, Slot } from '../templates/new/page';
import type { StatDefinition } from '../lib/stats';
import { normalizeTemplateStats, orderStats, shouldShowStatDivider, statGroupOf, statIsNegative } from '../lib/stats';
import {
  computeSlotRules,
  computeStats,
  formatEffectValue,
  formatStatSummary,
  getSealedBy,
  levelLabel,
  mergeSlotRules,
  statQuality,
} from '../lib/buildMath';
import type { EquippedEntry, StatSummary } from '../lib/buildMath';

interface DrawerTemplateData {
  slots: Slot[];
  constraints: Constraint[];
  components: Component[];
  templateStats: StatDefinition[];
  equipped: Record<string, EquippedEntry>;
  slotLevels: Record<string, number>;
  slotDistribution: Record<string, Record<string, number>>;
  stats: StatSummary[];
}

interface BuildDrawerProps {
  build: BuildListItem;
  onClose: () => void;
  onDuplicate: (build: BuildListItem) => void;
}

export default function BuildDrawer({ build, onClose, onDuplicate }: BuildDrawerProps) {
  const [data, setData] = useState<DrawerTemplateData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setData(null);

    apiFetch(`/templates/${encodeURIComponent(build.template_id)}`)
      .then((template) => {
        if (cancelled) return;
        const rules = template.rules && typeof template.rules === 'object' ? template.rules : {};
        const slots = Array.isArray(rules.slots) ? (rules.slots as Slot[]) : [];
        const constraints = Array.isArray(rules.constraints) ? (rules.constraints as Constraint[]) : [];
        const components = Array.isArray(template.components) ? (template.components as Component[]) : [];
        const templateStats = normalizeTemplateStats(template.stats);

        const parsed = parseBuildComponents(build.components);
        const equipped = toEquippedMap(parsed, components);
        const slotLevels = parsed.slot_levels ?? {};
        const slotDistribution = parsed.slot_distribution ?? {};

        const sealedBy = getSealedBy(equipped, constraints);
        const sealedSlotNames = new Set(Object.keys(sealedBy));
        const activeEntries = Object.entries(equipped)
          .filter(([slot]) => !sealedSlotNames.has(slot))
          .map(([, entry]) => entry);

        const base = computeStats(activeEntries);
        const slotRules = computeSlotRules(slots, slotLevels, slotDistribution);
        const stats = mergeSlotRules(base, slotRules);

        setData({ slots, constraints, components, templateStats, equipped, slotLevels, slotDistribution, stats });
      })
      .catch((loadError) => {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : 'Failed to load build details.');
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [build]);

  const orderedStats = useMemo(
    () => (data ? orderStats(data.stats, data.templateStats, (s) => s.stat) : []),
    [data]
  );

  return createPortal(
    <>
      <div className="optimizer-drawer-backdrop" onClick={onClose} />
      <div className="optimizer-drawer" role="dialog" aria-modal="true" aria-label={`${build.name} details`}>
        <div className="optimizer-drawer-header">
          <div className="optimizer-drawer-title">
            <span>{build.name || 'Untitled build'}</span>
          </div>
          <button type="button" className="button secondary" onClick={() => onDuplicate(build)}>
            <Copy size={16} /> Duplicate
          </button>
          <Link
            href={`/templates/${encodeURIComponent(build.template_id)}/builds/${encodeURIComponent(build.id)}`}
            className="button"
          >
            View page
          </Link>
          <button type="button" className="icon-button" onClick={onClose} aria-label="Close build details">
            <X size={18} />
          </button>
        </div>

        <div className="optimizer-drawer-body">
          {loading ? (
            <p className="loading-placeholder">
              <Loader2 size={16} className="spin" /> Loading build breakdown...
            </p>
          ) : error ? (
            <p className="filter-result-count">{error}</p>
          ) : data ? (
            <>
              <div className="build-popover-subtitle">Equipped components</div>
              <div className="optimizer-popover-rows">
                {data.slots.length === 0 ? (
                  <div className="build-popover-row">
                    <span>No slots</span>
                    <strong>—</strong>
                  </div>
                ) : (
                  data.slots.map((slot) => {
                    const entry = data.equipped[slot.slot_name];
                    return (
                      <div className="build-popover-row" key={slot.slot_name}>
                        <span>{slot.shown_name || slot.slot_name}</span>
                        <strong>
                          {entry ? (
                            entry.tier > 0
                              ? `${entry.component.name} · ${levelLabel(entry.component, entry.tier)}`
                              : entry.component.name
                          ) : (
                            '—'
                          )}
                        </strong>
                      </div>
                    );
                  })
                )}
              </div>

              {Object.keys(data.slotLevels).length > 0 && (
                <>
                  <div className="build-popover-subtitle">Slot levels & points</div>
                  <div className="optimizer-popover-rows">
                    {data.slots
                      .filter((slot) => data.slotLevels[slot.slot_name] != null)
                      .map((slot) => {
                        const level = data.slotLevels[slot.slot_name];
                        const dist = data.slotDistribution[slot.slot_name];
                        const parts: string[] = [];
                        if (level > 0) parts.push(`Lv ${level}`);
                        if (dist) {
                          for (const [key, value] of Object.entries(dist)) {
                            if (value > 0) parts.push(`${key} ${value}`);
                          }
                        }
                        return (
                          <div className="build-popover-row" key={slot.slot_name}>
                            <span>{slot.shown_name || slot.slot_name}</span>
                            <strong>{parts.join(' · ') || 'Lv 0'}</strong>
                          </div>
                        );
                      })}
                  </div>
                </>
              )}

              <div className="build-popover-subtitle">Full stats</div>
              {orderedStats.length === 0 ? (
                <p className="filter-result-count">This build contributes no stats.</p>
              ) : (
                <div className="optimizer-popover-stats">
                  {orderedStats.map((s, i) => {
                    const prev = i > 0 ? orderedStats[i - 1] : undefined;
                    const showDivider = shouldShowStatDivider(
                      prev ? { group: statGroupOf(data.templateStats, prev.stat) } : undefined,
                      { group: statGroupOf(data.templateStats, s.stat) }
                    );
                    const quality = statQuality(s, statIsNegative(data.templateStats, s.stat));
                    return (
                      <div key={s.stat}>
                        {showDivider && <div className="build-stat-group-divider" />}
                        <div className="build-popover-row">
                          <span>{s.stat}</span>
                          <strong className={`optimizer-popover-${quality}`}>{formatStatSummary(s)}</strong>
                        </div>
                        <div className="optimizer-popover-contribs">
                          {s.contributions.map((contribution, j) => (
                            <div className="build-popover-row" key={j}>
                              <span>{contribution.component}</span>
                              <strong>{formatEffectValue(contribution.type, contribution.value)}</strong>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              <div className="build-popover-result">
                <span>Likes</span>
                <strong>{build.vote_score ?? 0}</strong>
              </div>
            </>
          ) : null}
        </div>
      </div>
    </>,
    document.body
  );
}
