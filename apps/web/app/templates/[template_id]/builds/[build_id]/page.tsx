'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { Bookmark, CalendarDays, Copy, Globe, Heart, Layers, Loader2, Lock, Pencil, User } from 'lucide-react';
import { apiFetch } from '../../../../lib/api';
import { useNotification } from '../../../../components/NotificationProvider';
import PublishBuildModal from '../../../../components/PublishBuildModal';
import { getLocalBuild } from '../../../../lib/localBuilds';
import {
  collectClassPoints,
  computeCurrentEffects,
  computeSlotRules,
  computeStats,
  formatEffectValue,
  formatStatSummary,
  getDistributionBreakdown,
  getSealedBy,
  getSlotRules,
  levelLabel,
  mergeSlotRules,
  statQuality,
} from '../../../../lib/buildMath';
import type { EquippedEntry, StatSummary } from '../../../../lib/buildMath';
import { normalizeTemplateStats, orderStats, shouldShowStatDivider, statGroupOf, statIsNegative } from '../../../../lib/stats';
import type { StatDefinition } from '../../../../lib/stats';
import { clampSlotPosition, useCanvasBounds } from '../../../../lib/slotPosition';
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

function effectValueColor(value: number): string {
  if (value > 0) return '#ffb560';
  if (value < 0) return '#F44336';
  return '#fff';
}

function getDefaultPosition(index: number) {
  return { x: 32 + (index % 3) * 124, y: 32 + Math.floor(index / 3) * 124 };
}

export default function TemplateBuildDetailPage() {
  const params = useParams();
  const router = useRouter();
  const templateId = params.template_id as string;
  const buildId = params.build_id as string;
  const { notify } = useNotification();

  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [build, setBuild] = useState<any>(null);
  const [isLocal, setIsLocal] = useState(false);
  const [templateName, setTemplateName] = useState('');
  const [publishOpen, setPublishOpen] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);
  const [auth, setAuth] = useState<{ token: string; user: { id: number } } | null>(null);
  const [slots, setSlots] = useState<Slot[]>([]);
  const [constraints, setConstraints] = useState<Constraint[]>([]);
  const [templateComponents, setTemplateComponents] = useState<Component[]>([]);
  const [templateStats, setTemplateStats] = useState<StatDefinition[]>([]);
  const [statPopover, setStatPopover] = useState<{ stat: StatSummary; x: number; y: number } | null>(null);
  const [slotPopover, setSlotPopover] = useState<{ slot: Slot; x: number; y: number } | null>(null);
  const slotPlaneRef = useRef<HTMLDivElement | null>(null);
  const slotPlaneBounds = useCanvasBounds(slotPlaneRef);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const stored = window.localStorage.getItem('respawn-auth');
      if (stored) {
        try {
          setAuth(JSON.parse(stored));
        } catch {
          window.localStorage.removeItem('respawn-auth');
        }
      }
    }
  }, []);

  useEffect(() => {
    if (!templateId || !buildId) {
      setLoadError('Invalid build route.');
      setIsLoading(false);
      return;
    }

    const templatePromise = apiFetch(`/templates/${encodeURIComponent(templateId)}`);
    const localPromise = getLocalBuild(buildId).catch(() => null);

    Promise.all([templatePromise, localPromise])
      .then(([template, local]) => {
        const rules = template.rules && typeof template.rules === 'object' ? template.rules : {};
        setSlots(Array.isArray(rules.slots) ? rules.slots : []);
        setConstraints(Array.isArray(rules.constraints) ? rules.constraints : []);
        setTemplateComponents(Array.isArray(template.components) ? template.components : []);
        setTemplateStats(normalizeTemplateStats(template.stats));
        setTemplateName(typeof template.name === 'string' ? template.name : '');

        if (local) {
          const components = {
            slots: Object.entries(local.build.entries ?? {}).map(([slotName, entry]) => ({
              slot_name: slotName,
              component: entry.component,
              tier: entry.tier,
            })),
            slot_levels: local.build.slotLevels ?? {},
            slot_distribution: local.build.slotDistribution ?? {},
          };
          setIsLocal(true);
          setBuild({
            id: local.id,
            name: local.name,
            description: local.description ?? '',
            tags: local.tags ?? [],
            is_private: false,
            created_at: local.created_at,
            updated_at: local.updated_at ?? local.created_at,
            vote_score: 0,
            components,
          });
          return;
        }

        return apiFetch(`/templates/${encodeURIComponent(templateId)}/builds/${encodeURIComponent(buildId)}`)
          .then((buildData) => setBuild(buildData))
          .catch((error) => {
            setLoadError(error instanceof Error ? error.message : 'Failed to load build.');
          });
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

  const orderedStats = useMemo(
    () => orderStats(stats, templateStats, (summary) => summary.stat),
    [stats, templateStats]
  );

  const buildPublishPayload = (isPublic: boolean) => ({
    name: build?.name ?? '',
    description: build?.description ?? '',
    tags: Array.isArray(build?.tags) ? build.tags : [],
    components: {
      slots: Object.entries(equipped).map(([slotName, entry]) => ({
        slot_name: slotName,
        component: entry.component,
        tier: entry.tier,
      })),
      slot_levels: slotLevels,
      slot_distribution: slotDistribution,
    },
    is_private: !isPublic,
  });

  const handlePublishBuild = () => {
    if (!auth) {
      notify('You must be logged in to publish a build.', 'error');
      router.push('/profile');
      return;
    }
    setPublishOpen(true);
  };

  const handlePublishConfirm = async (isPublic: boolean) => {
    if (!auth) {
      setPublishOpen(false);
      notify('You must be logged in to publish a build.', 'error');
      router.push('/profile');
      return;
    }
    setIsPublishing(true);
    try {
      const response = await apiFetch(`/templates/${encodeURIComponent(templateId)}/builds`, {
        method: 'POST',
        body: JSON.stringify(buildPublishPayload(isPublic)),
      });
      notify('Build published successfully.', 'success');
      router.push(`/templates/${templateId}/builds/${response.id}`);
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Build publishing failed.', 'error');
      setIsPublishing(false);
    }
  };

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
              {loadError || 'Build not found.'} <Link href={`/builds?template=${encodeURIComponent(templateId)}`}>Back to builds</Link>
            </p>
          </div>
        </section>
      </main>
    );
  }

  const sealedEquipped = Object.keys(sealedBy).filter((slot) => equipped[slot]);

  return (
    <main className="build-detail-page">
      <section className="card page-header">
        <div>
          <div className="build-detail-breadcrumb">
            <Link href="/builds">Builds</Link>
            <span>/</span>
            <Link href={`/templates/${templateId}`}>Template</Link>
          </div>
          <h1 className="build-detail-title">
            {build.name}
            <span className={`badge ${isLocal ? 'accent' : build.is_private ? 'private' : ''}`}>
              {isLocal ? <><Bookmark size={12} /> Local</> : build.is_private ? <><Lock size={12} /> Private</> : <><Globe size={12} /> Public</>}
            </span>
          </h1>
          <p>
            {isLocal ? (
              <>Saved in this browser for template <strong>{templateName || templateId}</strong></>
            ) : (
              <>
                For template{' '}
                <Link href={`/templates/${templateId}`}><strong>{templateName || templateId}</strong></Link>
                {build.creator_username ? <> · by <strong>{build.creator_username}</strong></> : null}
              </>
            )}
          </p>
        </div>
        <div className="page-actions">
          <Link href={`/builds?template=${encodeURIComponent(templateId)}`} className="button secondary small">
            More Builds
          </Link>
          <Link
            href={`/templates/${templateId}/builds/new?duplicate=${encodeURIComponent(buildId)}`}
            className="button secondary small"
          >
            <Copy size={14} /> Duplicate
          </Link>
          {(isLocal || (auth && build.creator_user_id === auth.user.id)) && (
            <Link
              href={`/templates/${templateId}/builds/new?edit=${encodeURIComponent(buildId)}`}
              className="button small"
            >
              <Pencil size={14} /> Edit
            </Link>
          )}
          {isLocal ? (
            <button type="button" className="button" onClick={handlePublishBuild}>
              <Globe size={16} /> Publish Build
            </button>
          ) : null}
        </div>
      </section>

      {build.description?.trim() && (
        <section className="card detail-section description-card">
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
        {build.creator_username && <span className="detail-meta-item"><User size={12} /> by {build.creator_username}</span>}
        <span className="detail-meta-item"><Heart size={12} /> {build.vote_score ?? 0} likes</span>
        {build.created_at && <span className="detail-meta-item"><CalendarDays size={12} /> Created {new Date(build.created_at).toLocaleDateString('en-US')}</span>}
        {build.updated_at && <span className="detail-meta-item"><Pencil size={12} /> Last edited {new Date(build.updated_at).toLocaleDateString('en-US')}</span>}
        <span className="detail-meta-item"><Layers size={12} /> {equippedEntries.length} component{equippedEntries.length === 1 ? '' : 's'} equipped</span>
      </div>

      <div className="detail-layout">
        <section className="card detail-section">
          <div className="panel-header">
            <div>
              <h3>Slot Canvas</h3>
              <p className="panel-subtitle">Equipped components, slot levels, and stat points.</p>
            </div>
          </div>

          {slots.length === 0 ? (
            <div className="empty-state large">
              <p>This template has no slots.</p>
            </div>
          ) : (
            <>
              <div className="slot-canvas">
                <div ref={slotPlaneRef} className="slot-canvas-plane">
                  {slots.map((slot, index) => {
                    const size = slot.size ?? 96;
                    const rawPosition = slot.position ?? getDefaultPosition(index);
                    const position = slotPlaneBounds ? clampSlotPosition(rawPosition, size, slotPlaneBounds) : rawPosition;
                    const entry = equipped[slot.slot_name];
                    const component = entry?.component ?? null;
                    const sealed = Boolean(sealedBy[slot.slot_name]?.length);
                    const slotStats = slot.stats;
                    const slotLevel = slotStats ? (slotLevels[slot.slot_name] ?? 0) : 0;
                    return (
                      <div
                        key={slot.slot_name}
                        className={`slot-card slot-card-square build-slot-square readonly ${component ? 'filled' : ''} ${sealed ? 'build-slot-square-sealed' : ''}`}
                        style={{
                          left: position.x,
                          top: position.y,
                          width: slot.size ? `${slot.size}px` : undefined,
                          height: slot.size ? `${slot.size}px` : undefined,
                          backgroundColor: slot.color || undefined,
                          opacity: slot.transparency !== undefined ? slot.transparency / 100 : undefined,
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
                          <span className="build-slot-level-value">Lvl {slotLevel}</span>
                        )}
                        {component ? (
                          <span className="build-slot-square-equipped">
                            <span className="build-slot-square-name" title={component.name}>
                              {component.name}
                            </span>
                            {entry!.tier > 0 && (
                              <span className="build-slot-square-tier">
                                {levelLabel(component, entry!.tier)}
                              </span>
                            )}
                          </span>
                        ) : (
                          <span className="build-slot-square-empty">{sealed ? 'Sealed' : 'Empty'}</span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </>
          )}
        </section>

        <section className="card detail-section">
          <div className="panel-header">
            <div>
              <h3>Stats</h3>
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

      {slotPopover &&
        (() => {
          const { slot, x, y } = slotPopover;
          const entry = equipped[slot.slot_name];
          const component = entry?.component ?? null;
          const sealed = Boolean(sealedBy[slot.slot_name]?.length);
          const slotStats = slot.stats;
          const slotRules = getSlotRules(slotStats);
          const slotLevel = slotStats ? (slotLevels[slot.slot_name] ?? 0) : 0;
          const distribution = slotDistribution[slot.slot_name] || {};
          const distBreakdown = getDistributionBreakdown(slotStats, slotLevel, distribution);
          const sealedByNames = sealedBy[slot.slot_name];

          return createPortal(
            <div
              className="build-popover"
              style={{ position: 'fixed', left: x + 14, top: y + 7, zIndex: 99998, pointerEvents: 'none' }}
            >
              <div className="build-popover-title">
                {slot.shown_name || slot.slot_name}
                {sealed && (
                  <span className="build-slot-limit build-slot-sealed-chip">
                    <Lock size={11} /> sealed
                  </span>
                )}
              </div>
              {sealed && (
                <>
                  <div className="build-popover-subtitle">Sealed by</div>
                  <div className="build-popover-sealed">
                    {sealedByNames.join(', ')}
                    {component && ' — stats excluded from the build'}
                  </div>
                </>
              )}
              {component && (
                <>
                  <div className="build-popover-subtitle">Equipped</div>
                  <div className="build-popover-equipped">
                    {entry!.tier > 0
                      ? `${component.name} · ${levelLabel(component, entry!.tier)}`
                      : component.name}
                  </div>
                  {!sealed && (
                    <>
                      <div className="build-popover-subtitle">Effects</div>
                      <div className="build-popover-rows">
                        {computeCurrentEffects(entry!, activeEntries).map((effect, idx) => (
                          <div key={idx} className="build-popover-row">
                            <span>
                              {effect.stat}
                              {effect.note ? <em> {effect.note}</em> : null}
                            </span>
                            <strong style={{ color: effectValueColor(effect.value) }}>
                              {formatEffectValue(effect.type, effect.value)}
                            </strong>
                          </div>
                        ))}
                      </div>
                    </>
                  )}
                </>
              )}
              {slotStats && (
                <>
                  <div className="build-popover-subtitle">Slot level</div>
                  <div className="build-popover-equipped">Lvl {slotLevel}</div>
                  {(distBreakdown.statPool > 0 || distBreakdown.classPool > 0) && (
                    <>
                      <div className="build-popover-subtitle">Stat points</div>
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
                        {[...distBreakdown.statOptions, ...distBreakdown.classOptions].map(
                          (option) =>
                            (distribution[option] ?? 0) > 0 ? (
                              <span key={option} className="detail-slot-chip">
                                {option} +{distribution[option]}
                              </span>
                            ) : null
                        )}
                      </div>
                    </>
                  )}
                  {slotRules.includes('formula') && slotLevel > 0 && (
                    <>
                      <div className="build-popover-subtitle">Formulas</div>
                      <div className="build-popover-rows">
                        {(slotStats.stats || []).map((stat) => {
                          const formula = slotStats.formulas?.[stat];
                          return (
                            <div key={stat} className="build-popover-row">
                              <span>{stat}</span>
                              <strong>{formula ? `Lvl ${slotLevel} · ${formula}` : 'no formula'}</strong>
                            </div>
                          );
                        })}
                      </div>
                    </>
                  )}
                  {slotRules.includes('class_points') && slotLevel > 0 && (
                    <>
                      <div className="build-popover-subtitle">Class points</div>
                      <div className="build-popover-rows">
                        {(slotStats.classes || []).map((className) => {
                          const allocated = distribution[className] ?? 0;
                          const classFormulas = slotStats.class_formulas?.[className];
                          if (!classFormulas || allocated <= 0) return null;
                          return (
                            <div key={className} className="build-popover-row">
                              <span>{className}</span>
                              <strong>+{allocated}</strong>
                            </div>
                          );
                        })}
                      </div>
                    </>
                  )}
                </>
              )}
              <div className="build-popover-subtitle">Accepts categories</div>
              <div className="slot-categories">
                {slot.accepts.map((cat) => (
                  <span key={cat} className="slot-pill">{cat}</span>
                ))}
              </div>
            </div>,
            document.body
          );
        })()}

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

      {publishOpen && (
        <PublishBuildModal
          buildName={build?.name ?? 'Untitled build'}
          publishing={isPublishing}
          onClose={() => setPublishOpen(false)}
          onPublish={handlePublishConfirm}
        />
      )}
    </main>
  );
}
