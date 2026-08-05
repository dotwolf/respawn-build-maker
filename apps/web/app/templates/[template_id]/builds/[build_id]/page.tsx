'use client';

import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { Loader2, Lock } from 'lucide-react';
import { apiFetch } from '../../../../lib/api';
import { useNotification } from '../../../../components/NotificationProvider';
import FormulaHelp from '../../../../components/FormulaHelp';
import {
  computeSlotRules,
  computeStats,
  formatEffectValue,
  getDistributionBreakdown,
  getSealedBy,
  getSlotRules,
  levelLabel,
  mergeSlotRules,
} from '../../../../lib/buildMath';
import type { EquippedEntry, StatSummary } from '../../../../lib/buildMath';
import type { Component, Constraint, Slot } from '../../../new/page';

interface BuildSlotEntry {
  slot_name?: string;
  component?: unknown;
  tier?: number;
}

interface BuildComponents {
  slots?: BuildSlotEntry[];
  slot_levels?: Record<string, number>;
  slot_distribution?: Record<string, Record<string, number>>;
}

function resolveComponent(entryComponent: unknown, templateComponents: Component[]): Component | null {
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

export default function TemplateBuildDetailPage() {
  const params = useParams();
  const templateId = params.template_id as string;
  const buildId = params.build_id as string;
  const { notify } = useNotification();

  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [build, setBuild] = useState<any>(null);
  const [slots, setSlots] = useState<Slot[]>([]);
  const [constraints, setConstraints] = useState<Constraint[]>([]);
  const [templateComponents, setTemplateComponents] = useState<Component[]>([]);
  const [statPopover, setStatPopover] = useState<{ stat: StatSummary; x: number; y: number } | null>(null);

  useEffect(() => {
    if (!templateId || !buildId) {
      setLoadError('Invalid build route.');
      setIsLoading(false);
      return;
    }

    Promise.all([
      apiFetch(`/templates/${encodeURIComponent(templateId)}/builds/${encodeURIComponent(buildId)}`),
      apiFetch(`/templates/${encodeURIComponent(templateId)}`),
    ])
      .then(([buildData, template]) => {
        setBuild(buildData);
        const rules = template.rules && typeof template.rules === 'object' ? template.rules : {};
        setSlots(Array.isArray(rules.slots) ? rules.slots : []);
        setConstraints(Array.isArray(rules.constraints) ? rules.constraints : []);
        setTemplateComponents(Array.isArray(template.components) ? template.components : []);
      })
      .catch((error) => {
        setLoadError(error instanceof Error ? error.message : 'Failed to load build.');
      })
      .finally(() => setIsLoading(false));
  }, [templateId, buildId, notify]);

  const equipped = useMemo<Record<string, EquippedEntry>>(() => {
    const result: Record<string, EquippedEntry> = {};
    if (!build) return result;

    const components = build.components as BuildComponents | null;
    if (!components || !Array.isArray(components.slots)) return result;

    components.slots.forEach((entry) => {
      if (!entry.slot_name) return;
      const component = resolveComponent(entry.component, templateComponents);
      if (!component) return;
      result[entry.slot_name] = { component, tier: typeof entry.tier === 'number' ? entry.tier : 0 };
    });
    return result;
  }, [build, templateComponents]);

  const equippedEntries = useMemo(() => Object.values(equipped), [equipped]);

  const slotLevels = useMemo(() => {
    const raw = (build?.components as BuildComponents | null)?.slot_levels;
    return raw && typeof raw === 'object' ? raw : {};
  }, [build]);

  const slotDistribution = useMemo(() => {
    const raw = (build?.components as BuildComponents | null)?.slot_distribution;
    return raw && typeof raw === 'object' ? raw : {};
  }, [build]);

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

  if (isLoading) {
    return (
      <main>
        <section className="card page-header">
          <div>
            <h1>Build details</h1>
            <p className="panel-subtitle">Loading build...</p>
          </div>
        </section>
        <section className="card">
          <p className="panel-subtitle">
            <Loader2 size={16} className="spin" /> Fetching build data
          </p>
        </section>
      </main>
    );
  }

  if (loadError || !build) {
    return (
      <main>
        <section className="card page-header">
          <div>
            <h1>Build details</h1>
            <p className="panel-subtitle">
              {loadError || 'Build not found.'} <Link href={`/templates/${encodeURIComponent(templateId)}/builds`}>Back to builds</Link>
            </p>
          </div>
        </section>
      </main>
    );
  }

  const sealedEquipped = Object.keys(sealedBy).filter((slot) => equipped[slot]);

  return (
    <main>
      <section className="card page-header">
        <div>
          <h1>{build.name}</h1>
          <p>
            Build <strong>{build.id}</strong> for template <strong>{templateId}</strong>
            {build.is_private ? ' · private' : ''}
          </p>
        </div>
        <div className="page-actions">
          <Link href={`/templates/${templateId}`} className="button secondary small">
            Template
          </Link>
          <Link href={`/templates/${templateId}/builds`} className="button secondary small">
            Builds
          </Link>
          <Link href={`/templates/${templateId}/builds/new`} className="button small">
            Create build
          </Link>
        </div>
      </section>

      {build.description && (
        <section className="card">
          <p className="panel-subtitle">{build.description}</p>
        </section>
      )}

      <div className="detail-meta-bar">
        {Array.isArray(build.tags) && build.tags.length > 0 && (
          <div className="slot-categories">
            {build.tags.map((tag: string) => (
              <span key={tag} className="slot-pill">{tag}</span>
            ))}
          </div>
        )}
        <span className="detail-meta-item">Score: {build.vote_score ?? 0}</span>
        {build.created_at && <span className="detail-meta-item">Created {new Date(build.created_at).toLocaleDateString()}</span>}
        <span className="detail-meta-item">{equippedEntries.length} component{equippedEntries.length === 1 ? '' : 's'} equipped</span>
      </div>

      <div className="detail-layout">
        <section className="card detail-section">
          <div className="panel-header">
            <div>
              <h3>Slots</h3>
              <p className="panel-subtitle">Equipped components, slot levels, and stat points.</p>
            </div>
          </div>

          {slots.length === 0 ? (
            <div className="empty-state large">
              <p>This template has no slots.</p>
            </div>
          ) : (
            <div className="detail-slot-grid">
              {slots.map((slot, index) => {
                const entry = equipped[slot.slot_name];
                const component = entry?.component ?? null;
                const sealed = Boolean(sealedBy[slot.slot_name]?.length);
                const slotStats = slot.stats;
                const slotRules = getSlotRules(slotStats);
                const slotLevel = slotStats ? (slotLevels[slot.slot_name] ?? 0) : 0;
                const distribution = slotDistribution[slot.slot_name] || {};
                const distBreakdown = getDistributionBreakdown(slotStats, slotLevel, distribution);

                return (
                  <article
                    key={slot.slot_name}
                    className={`detail-slot-card${sealed ? ' sealed' : ''}`}
                    style={{
                      backgroundColor: slot.color || undefined,
                      opacity: slot.transparency !== undefined ? slot.transparency / 100 : undefined,
                    }}
                  >
                    {sealed && (
                      <span className="detail-slot-sealed" title={`Sealed by ${sealedBy[slot.slot_name].join(', ')}`}>
                        <Lock size={10} /> sealed
                      </span>
                    )}
                    <h4 style={{ color: slot.textColor || undefined, fontSize: slot.size ? `${Math.round(slot.size * 0.16)}px` : undefined }}>
                      {slot.shown_name || slot.slot_name}
                    </h4>

                    {slotStats ? (
                      <div className="detail-slot-stats">
                        <span className="detail-slot-level">Lvl {slotLevel}</span>
                        {(distBreakdown.statPool > 0 || distBreakdown.classPool > 0) && (
                            <div className="detail-slot-chips">
                              {distBreakdown.statPool > 0 && (
                                <span className="detail-slot-chip">
                                  {distBreakdown.statSpent}/{distBreakdown.statPool} stat pts
                                </span>
                              )}
                              {distBreakdown.classPool > 0 && (
                                <span className="detail-slot-chip">
                                  {distBreakdown.classSpent}/{distBreakdown.classPool} class pts
                                </span>
                              )}
                              {[
                                ...distBreakdown.statOptions,
                                ...distBreakdown.classOptions,
                              ].map(
                                (option) =>
                                  (distribution[option] ?? 0) > 0 ? (
                                    <span key={option} className="detail-slot-chip">
                                      {option} +{distribution[option]}
                                    </span>
                                  ) : null
                              )}
                            </div>
                          )}
                        {slotRules.includes('formula') && slotLevel > 0 && (
                          <div className="detail-formula-list">
                            {(slotStats.stats || []).map((stat) => {
                              const formula = slotStats.formulas?.[stat];
                              return (
                                <div key={stat} className="detail-formula-row">
                                  <span>{stat}</span>
                                  <span className="value">
                                    {formula ? `Lvl ${slotLevel} · ${formula}` : 'no formula'}
                                  </span>
                                </div>
                              );
                            })}
                          </div>
                        )}
                        {slotRules.includes('class_points') && slotLevel > 0 && (
                          <div className="detail-class-list">
                            {(slotStats.classes || []).map((className) => {
                              const allocated = distribution[className] ?? 0;
                              const classFormulas = slotStats.class_formulas?.[className];
                              if (!classFormulas || allocated <= 0) return null;
                              return (
                                <div key={className} className="detail-class-block">
                                  <span className="detail-class-name">
                                    {className} <span className="value">+{allocated}</span>
                                  </span>
                                  <div className="detail-formula-list">
                                    {Object.entries(classFormulas).map(([stat, formula]) => (
                                      <div key={stat} className="detail-formula-row">
                                        <span>{stat}</span>
                                        <span className="value">
                                          {formula ? `points ${allocated} · ${formula}` : 'no formula'}
                                        </span>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    ) : null}

                    {component ? (
                      <div className="detail-slot-equipped">
                        <span className="detail-component-name">{component.name}</span>
                        {entry!.tier > 0 && (
                          <span className="detail-component-tier">
                            {levelLabel(component, entry!.tier)}
                          </span>
                        )}
                      </div>
                    ) : (
                      <div className="detail-slot-empty">
                        {sealed ? 'Sealed — cannot equip' : 'Empty'}
                      </div>
                    )}

                    <div className="slot-categories">
                      {slot.accepts.map((cat) => (
                        <span key={cat} className="slot-pill">{cat}</span>
                      ))}
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>

        <section className="card detail-section">
          <div className="panel-header">
            <div>
              <h3>Stats <FormulaHelp /></h3>
              <p className="panel-subtitle">Aggregated from equipped components and slot rules. Hover a stat for its calculation.</p>
            </div>
          </div>

          {stats.length === 0 ? (
            <div className="empty-state">
              <p>No stats yet.</p>
              <span>This build contributes no stat values.</span>
            </div>
          ) : (
            <div className="build-stats-list">
              {stats.map((summary) => (
                <div
                  key={summary.stat}
                  className="build-stat-row"
                  onMouseEnter={(e) => setStatPopover({ stat: summary, x: e.clientX, y: e.clientY })}
                  onMouseMove={(e) =>
                    setStatPopover((prev) => (prev ? { ...prev, x: e.clientX, y: e.clientY } : prev))
                  }
                  onMouseLeave={() => setStatPopover(null)}
                >
                  <span className="build-stat-name">{summary.stat}</span>
                  <span className="build-stat-value">{summary.final}</span>
                </div>
              ))}
            </div>
          )}

          {sealedEquipped.length > 0 && (
            <div className="constraint-notice constraint-notice-warn">
              <Lock size={14} />
              <span>
                {sealedEquipped
                  .map((slot) => `${slot} (sealed by ${sealedBy[slot].join(', ')})`)
                  .join(' · ')}{' '}
                — stats excluded.
              </span>
            </div>
          )}
        </section>
      </div>

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
    </main>
  );
}
