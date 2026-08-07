'use client';

import { useEffect, useMemo, useState } from 'react';
import type { CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { Check, Loader2, RotateCcw, Search, Sparkles, X } from 'lucide-react';
import { useNotification } from './NotificationProvider';
import type { Component, Constraint, Slot } from '../templates/new/page';
import type { StatDefinition } from '../lib/stats';
import type { StatSummary } from '../lib/buildMath';
import { formatEffectValue, formatStatSummary, levelLabel, statQuality } from '../lib/buildMath';
import { orderStats, shouldShowStatDivider, statGroupOf, statIsNegative } from '../lib/stats';
import { runOptimizer } from '../lib/optimizer';
import type { OptimizedBuild, OptimizerProgress, OptimizerResult, OptimizerWeights } from '../lib/optimizer';
import { useOptimizerStore } from './OptimizerStore';
import type { OptimizerSettings } from './OptimizerStore';

interface BuildOptimizerModalProps {
  templateId: string;
  slots: Slot[];
  components: Component[];
  constraints: Constraint[];
  templateStats: StatDefinition[];
  onClose: () => void;
  onApply: (build: OptimizedBuild) => void;
}

type Tab = 'criteria' | 'results';

interface SelectedBuild {
  build: OptimizedBuild;
  index: number;
}

function formatCount(value: number): string {
  if (!Number.isFinite(value)) return '10^15+';
  if (value >= 1e12) return `${(value / 1e12).toFixed(1)}T`;
  if (value >= 1e9) return `${(value / 1e9).toFixed(1)}B`;
  if (value >= 1e6) return `${(value / 1e6).toFixed(1)}M`;
  if (value >= 1e3) return `${(value / 1e3).toFixed(1)}K`;
  return String(Math.round(value));
}

function weightTrackStyle(value: number): CSSProperties {
  const pct = Math.round(Math.max(0, Math.min(1, value)) * 100);
  return {
    background: `linear-gradient(to right, var(--color-accent) ${pct}%, var(--color-border-subtle) ${pct}%)`,
  };
}

export default function BuildOptimizerModal({
  templateId,
  slots,
  components,
  constraints,
  templateStats,
  onClose,
  onApply,
}: BuildOptimizerModalProps) {
  const { notify } = useNotification();
  const { getEntry, updateSettings, setResult } = useOptimizerStore();

  const stored = getEntry(templateId)?.settings;

  const [tab, setTab] = useState<Tab>('criteria');
  const [weights, setWeights] = useState<OptimizerWeights>(() => {
    if (stored?.weights && Object.keys(stored.weights).length > 0) return stored.weights;
    const initial: OptimizerWeights = {};
    templateStats.forEach((def) => {
      initial[def.name] = 0;
    });
    return initial;
  });
  const [minReq, setMinReq] = useState<Record<string, string>>(() => stored?.minReq ?? {});
  const [maxReq, setMaxReq] = useState<Record<string, string>>(() => stored?.maxReq ?? {});
  const [excluded, setExcluded] = useState<Set<string>>(() => stored?.excluded ?? new Set());
  const [excludeSearch, setExcludeSearch] = useState('');
  const [excludedClasses, setExcludedClasses] = useState<Set<string>>(() => stored?.excludedClasses ?? new Set());
  const [excludeClassSearch, setExcludeClassSearch] = useState('');
  const [multiclass, setMulticlass] = useState<boolean>(() => stored?.multiclass ?? true);
  const [isRunning, setIsRunning] = useState(false);
  const [result, setResultLocal] = useState<OptimizerResult | null>(() => getEntry(templateId)?.result ?? null);
  const [progress, setProgress] = useState<(OptimizerProgress & { elapsedMs: number }) | null>(null);
  const [selectedBuild, setSelectedBuild] = useState<SelectedBuild | null>(null);

  useEffect(() => {
    const settings: OptimizerSettings = { weights, minReq, maxReq, excluded, excludedClasses, multiclass };
    updateSettings(templateId, settings);
  }, [templateId, weights, minReq, maxReq, excluded, excludedClasses, multiclass, updateSettings]);

  const slotAvailability = useMemo(() => {
    const map: Record<string, number> = {};
    slots.forEach((slot) => {
      const accepted = new Set(slot.accepts ?? []);
      map[slot.slot_name] = components.filter(
        (c) => !excluded.has(c.name) && accepted.has(c.category)
      ).length;
    });
    return map;
  }, [slots, components, excluded]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        if (selectedBuild) setSelectedBuild(null);
        else onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose, selectedBuild]);

  const filteredComponents = useMemo(() => {
    const query = excludeSearch.trim().toLowerCase();
    if (!query) return components;
    return components.filter(
      (c) =>
        c.name.toLowerCase().includes(query) ||
        c.category.toLowerCase().includes(query) ||
        (c.sub_category ?? '').toLowerCase().includes(query)
    );
  }, [components, excludeSearch]);

  const classOptions = useMemo(() => {
    const names = new Set<string>();
    slots.forEach((slot) => {
      (slot.stats?.classes ?? []).forEach((name) => names.add(name));
    });
    return Array.from(names).sort((a, b) => a.localeCompare(b));
  }, [slots]);

  const filteredClasses = useMemo(() => {
    const query = excludeClassSearch.trim().toLowerCase();
    if (!query) return classOptions;
    return classOptions.filter((name) => name.toLowerCase().includes(query));
  }, [classOptions, excludeClassSearch]);

  const hasWeight = useMemo(
    () => templateStats.some((def) => (weights[def.name] ?? 0) > 0),
    [templateStats, weights]
  );

  const allWeight = useMemo(() => {
    if (templateStats.length === 0) return 0;
    const sum = templateStats.reduce((acc, def) => acc + (weights[def.name] ?? 0), 0);
    return sum / templateStats.length;
  }, [templateStats, weights]);

  const handleAllWeight = (value: number) => {
    setWeights((prev) => {
      const next = { ...prev };
      templateStats.forEach((def) => {
        next[def.name] = value;
      });
      return next;
    });
  };

  const toggleExcluded = (name: string) => {
    setExcluded((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  const toggleExcludedClass = (name: string) => {
    setExcludedClasses((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  const handleReset = () => {
    setWeights(() => {
      const initial: OptimizerWeights = {};
      templateStats.forEach((def) => {
        initial[def.name] = 0;
      });
      return initial;
    });
    setMinReq({});
    setMaxReq({});
    setExcluded(new Set());
    setExcludedClasses(new Set());
    setMulticlass(true);
  };

  const handleCalculate = async () => {
    if (isRunning) return;
    if (!hasWeight) {
      notify('Set at least one stat priority above zero.', 'error');
      return;
    }

    const requirements = { min: {}, max: {} } as { min: Record<string, number>; max: Record<string, number> };
    templateStats.forEach((def) => {
      const min = parseFloat(minReq[def.name] ?? '');
      const max = parseFloat(maxReq[def.name] ?? '');
      if (Number.isFinite(min)) requirements.min[def.name] = min;
      if (Number.isFinite(max)) requirements.max[def.name] = max;
    });

    const startedAt = performance.now();
    setIsRunning(true);
    setTab('results');
    setSelectedBuild(null);
    setProgress({
      nodesExplored: 0,
      prunedByBound: 0,
      prunedByFeasibility: 0,
      truncated: false,
      searchSpaceEstimate: 0,
      elapsedMs: 0,
    });

    try {
      const res = await runOptimizer(
        {
          slots,
          components,
          constraints,
          templateStats,
          weights,
          requirements,
          excluded,
          excludedClasses,
          multiclass,
          maxResults: 12,
        },
        (p) => {
          setProgress({ ...p, elapsedMs: performance.now() - startedAt });
        }
      );
      setResultLocal(res);
      setResult(templateId, res);
    } finally {
      setIsRunning(false);
    }
  };

  const renderCriteria = () => (
    <div className="optimizer-body-inner">
      <div className="optimizer-section">
        <h4>Stat priorities</h4>
        <p className="panel-subtitle">
          Drag each slider to set how much that stat matters. Set optional min/max requirements to restrict results.
        </p>
        <div className="optimizer-all-weight">
          <span className="optimizer-stat-name">All stats</span>
          <div className="optimizer-weight-wrap">
            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={allWeight}
              style={weightTrackStyle(allWeight)}
              onChange={(e) => handleAllWeight(parseFloat(e.target.value))}
            />
            <span className="optimizer-weight-value">{Math.round(allWeight * 100)}%</span>
          </div>
        </div>
        <div className="optimizer-stat-list">
          {templateStats.map((def) => {
            const weight = weights[def.name] ?? 0;
            return (
              <div className="optimizer-stat-row" key={def.name}>
                <div className="optimizer-stat-name">
                  <span>{def.name}</span>
                </div>
                <div className="optimizer-weight-wrap">
                  <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.01}
                    value={weight}
                    style={weightTrackStyle(weight)}
                    onChange={(e) =>
                      setWeights((prev) => ({ ...prev, [def.name]: parseFloat(e.target.value) }))
                    }
                  />
                  <span className="optimizer-weight-value">{Math.round(weight * 100)}%</span>
                </div>
                <div className="optimizer-minmax">
                  <input
                    type="number"
                    className="optimizer-number"
                    placeholder="min"
                    value={minReq[def.name] ?? ''}
                    onChange={(e) => setMinReq((prev) => ({ ...prev, [def.name]: e.target.value }))}
                  />
                  <input
                    type="number"
                    className="optimizer-number"
                    placeholder="max"
                    value={maxReq[def.name] ?? ''}
                    onChange={(e) => setMaxReq((prev) => ({ ...prev, [def.name]: e.target.value }))}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="optimizer-section">
        <h4>Excluded components</h4>
        <p className="panel-subtitle">Exclude components the optimizer may never use.</p>
        <div className="optimizer-exclude-search">
          <Search size={14} />
          <input
            type="text"
            value={excludeSearch}
            onChange={(e) => setExcludeSearch(e.target.value)}
            placeholder="Filter components..."
          />
        </div>
        <div className="optimizer-exclude-list">
          {filteredComponents.length === 0 ? (
            <div className="optimizer-exclude-empty">No components match.</div>
          ) : (
            filteredComponents.map((c) => (
              <label
                className={`optimizer-exclude-item${excluded.has(c.name) ? ' is-excluded' : ''}`}
                key={c.name}
              >
                <input
                  type="checkbox"
                  className="optimizer-exclude-input"
                  checked={excluded.has(c.name)}
                  onChange={() => toggleExcluded(c.name)}
                />
                <span className="optimizer-exclude-name" title={c.name}>
                  {c.name}
                </span>
                <span className="optimizer-exclude-check" aria-hidden="true">
                  {excluded.has(c.name) && <Check size={12} strokeWidth={3} />}
                </span>
              </label>
            ))
          )}
        </div>
      </div>
      <div className="optimizer-section">
        <h4>Excluded classes</h4>
        <p className="panel-subtitle">Exclude classes the optimizer may never allocate points into.</p>
        <div className="optimizer-exclude-search">
          <Search size={14} />
          <input
            type="text"
            value={excludeClassSearch}
            onChange={(e) => setExcludeClassSearch(e.target.value)}
            placeholder="Filter classes..."
          />
        </div>
        <div className="optimizer-exclude-list">
          {classOptions.length === 0 ? (
            <div className="optimizer-exclude-empty">No class point slots in this template.</div>
          ) : filteredClasses.length === 0 ? (
            <div className="optimizer-exclude-empty">No classes match.</div>
          ) : (
            filteredClasses.map((name) => (
              <label
                className={`optimizer-exclude-item${excludedClasses.has(name) ? ' is-excluded' : ''}`}
                key={name}
              >
                <input
                  type="checkbox"
                  className="optimizer-exclude-input"
                  checked={excludedClasses.has(name)}
                  onChange={() => toggleExcludedClass(name)}
                />
                <span className="optimizer-exclude-name" title={name}>
                  {name}
                </span>
                <span className="optimizer-exclude-check" aria-hidden="true">
                  {excludedClasses.has(name) && <Check size={12} strokeWidth={3} />}
                </span>
              </label>
            ))
          )}
        </div>
      </div>
      <div className="optimizer-section">
        <h4>Multi-classing</h4>
        <p className="panel-subtitle">
          When off, each slot spends all of its class points on a single class. When on, a slot may split its class
          points across several classes (total still limited to the slot&apos;s class point pool).
        </p>
        <label className={`optimizer-exclude-item${multiclass ? ' is-excluded' : ''}`}>
          <input
            type="checkbox"
            className="optimizer-exclude-input"
            checked={multiclass}
            onChange={(e) => setMulticlass(e.target.checked)}
          />
          <span className="optimizer-exclude-name">Allow a slot to invest in multiple classes</span>
          <span className="optimizer-exclude-check" aria-hidden="true">
            {multiclass && <Check size={12} strokeWidth={3} />}
          </span>
        </label>
      </div>
    </div>
  );

  const compactStats = (build: OptimizedBuild): StatSummary[] => {
    const ordered = orderStats(build.summary, templateStats, (s) => s.stat);
    const present = ordered.filter(
      (s) => s.flat !== 0 || s.percent !== 0 || s.multiplier !== 1
    );
    return present.slice(0, 6);
  };

  const renderResults = () => {
    if (isRunning) {
      const nodes = progress?.nodesExplored ?? 0;
      const pruned = (progress?.prunedByBound ?? 0) + (progress?.prunedByFeasibility ?? 0);
      const elapsed = progress ? Math.max(0, Math.round(progress.elapsedMs)) : 0;
      return (
        <div className="optimizer-running">
          <Loader2 size={28} className="spin" />
          <p>Searching for the strongest loadout…</p>
          <div className="optimizer-progress-track">
            <div className="optimizer-progress-fill" />
          </div>
          <span>
            {formatCount(nodes)} nodes explored · {formatCount(pruned)} pruned · {elapsed}ms
          </span>
          <span className="optimizer-running-hint">Pruning dominated branches as it builds slot by slot.</span>
        </div>
      );
    }
    if (!result) {
      return (
        <div className="optimizer-running">
          <Sparkles size={28} />
          <p>No results yet.</p>
          <span>Set your stat priorities and press Calculate Builds.</span>
        </div>
      );
    }
    if (!result.feasibleExists) {
      return (
        <div className="optimizer-running">
          <X size={28} />
          <p>No builds satisfy your requirements.</p>
          <span>Try loosening min/max limits or excluding fewer components.</span>
        </div>
      );
    }
    return (
      <div className="optimizer-body-inner">
        <div className="optimizer-results-meta">
          <span>
            <strong>{result.builds.length}</strong> build{result.builds.length === 1 ? '' : 's'}
          </span>
          <span>
            ~<strong>{formatCount(result.searchSpaceEstimate)}</strong> combinations
          </span>
          <span>
            <strong>{result.nodesExplored.toLocaleString()}</strong> nodes explored
          </span>
          {result.truncated && <em className="optimizer-warn">search budget reached — near-optimal</em>}
        </div>
        <div className="optimizer-results-list">
          {result.builds.map((build, index) => (
            <div
              key={`${index}-${build.grade}`}
              className="optimizer-result"
              onClick={() => setSelectedBuild({ build, index })}
            >
              <div className="optimizer-result-rank">#{index + 1}</div>
              <div className="optimizer-result-grade">
                <strong>{build.grade.toFixed(1)}</strong>
                <span>/10</span>
              </div>
              <div className="optimizer-result-stats">
                {compactStats(build).map((s) => (
                  <span
                    key={s.stat}
                    className={`optimizer-chip ${statQuality(s, statIsNegative(templateStats, s.stat))}`}
                  >
                    {s.stat} {formatStatSummary(s)}
                  </span>
                ))}
                {build.summary.filter((s) => s.flat !== 0 || s.percent !== 0 || s.multiplier !== 1).length > 6 && (
                  <span className="optimizer-chip optimizer-chip-more">
                    +{build.summary.filter((s) => s.flat !== 0 || s.percent !== 0 || s.multiplier !== 1).length - 6} more
                  </span>
                )}
              </div>
              <div
                className="optimizer-result-apply"
                role="button"
                tabIndex={0}
                onClick={(e) => {
                  e.stopPropagation();
                  onApply(build);
                }}
              >
                <Check size={14} /> Apply
              </div>
            </div>
          ))}
        </div>
        <p className="optimizer-results-tip">Click a build to open its full breakdown in a side panel. Click Apply to replace the current build.</p>
      </div>
    );
  };

  const renderDrawer = () => {
    if (!selectedBuild) return null;
    const { build, index } = selectedBuild;
    const ordered = orderStats(build.summary, templateStats, (s) => s.stat);
    const close = () => setSelectedBuild(null);
    return createPortal(
      <>
        <div className="optimizer-drawer-backdrop" onClick={close} />
        <div
          className="optimizer-drawer"
          role="dialog"
          aria-modal="true"
          aria-label={`Build ${index + 1} details`}
        >
          <div className="optimizer-drawer-header">
            <div className="optimizer-drawer-title">
              <span>Build #{index + 1}</span>
              <span className="optimizer-popover-grade">{build.grade.toFixed(1)}/10</span>
            </div>
            <button type="button" className="button" onClick={() => onApply(build)}>
              <Check size={16} /> Apply
            </button>
            <button type="button" className="icon-button" onClick={close} aria-label="Close build details">
              <X size={18} />
            </button>
          </div>
          <div className="optimizer-drawer-body">
            <div className="build-popover-subtitle">Equipped components</div>
            <div className="optimizer-popover-rows">
              {slots.map((slot) => {
                const entry = build.entries[slot.slot_name];
                const available = slotAvailability[slot.slot_name] ?? 0;
                return (
                  <div className="build-popover-row" key={slot.slot_name}>
                    <span>{slot.shown_name || slot.slot_name}</span>
                    <strong>
                      {entry ? (
                        entry.tier > 0
                          ? `${entry.component.name} · ${levelLabel(entry.component, entry.tier)}`
                          : entry.component.name
                      ) : available > 0 ? (
                        '—'
                      ) : (
                        '— (no compatible components)'
                      )}
                    </strong>
                  </div>
                );
              })}
            </div>
            <div className="build-popover-subtitle">Slot levels & points</div>
            <div className="optimizer-popover-rows">
              {slots
                .filter((slot) => build.slotLevels[slot.slot_name] != null)
                .map((slot) => {
                  const level = build.slotLevels[slot.slot_name];
                  const dist = build.slotDistribution[slot.slot_name];
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
            <div className="build-popover-subtitle">Full stats</div>
            <div className="optimizer-popover-stats">
              {ordered.map((s, i) => {
                const prev = i > 0 ? ordered[i - 1] : undefined;
                const showDivider = shouldShowStatDivider(
                  prev ? { group: statGroupOf(templateStats, prev.stat) } : undefined,
                  { group: statGroupOf(templateStats, s.stat) }
                );
                const quality = statQuality(s, statIsNegative(templateStats, s.stat));
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
            <div className="build-popover-result">
              <span>Overall score</span>
              <strong>{Math.round(build.score * 100) / 100}</strong>
            </div>
            <div className="build-popover-result">
              <span>Weighted multiplier</span>
              <strong>×{Math.round(build.overall * 100) / 100}</strong>
            </div>
            <button type="button" className="button optimizer-drawer-apply" onClick={() => onApply(build)}>
              <Check size={16} /> Apply
            </button>
          </div>
        </div>
      </>,
      document.body
    );
  };

  return (
    <>
      {createPortal(
        <div className="modal-overlay" onClick={onClose}>
          <div
            className="modal-content optimizer-modal"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label="Build Optimizer"
          >
            <div className="modal-actions-bar optimizer-modal-header">
              <div>
                <h3 style={{ margin: 0 }}>Build Optimizer</h3>
                <p className="panel-subtitle">Find the strongest component combination for your target stats.</p>
              </div>
              <button
                type="button"
                className="icon-button"
                onClick={onClose}
                aria-label="Close optimizer"
              >
                <X size={18} />
              </button>
            </div>
            <div className="optimizer-tabs">
              <button
                type="button"
                className={`optimizer-tab${tab === 'criteria' ? ' active' : ''}`}
                onClick={() => setTab('criteria')}
              >
                Criteria
              </button>
              <button
                type="button"
                className={`optimizer-tab${tab === 'results' ? ' active' : ''}`}
                onClick={() => setTab('results')}
              >
                Results{result ? ` (${result.builds.length})` : ''}
              </button>
            </div>
            <div className="optimizer-body">
              {tab === 'criteria' ? (
                <>
                  {renderCriteria()}
                  <div className="optimizer-calculate-bar">
                    <button type="button" className="button" onClick={handleCalculate} disabled={isRunning}>
                      {isRunning ? <Loader2 size={16} className="spin" /> : <Sparkles size={16} />}
                      {isRunning ? 'Searching…' : 'Calculate Builds'}
                    </button>
                    <button type="button" className="button secondary" onClick={handleReset} disabled={isRunning}>
                      <RotateCcw size={16} /> Reset
                    </button>
                  </div>
                </>
              ) : (
                renderResults()
              )}
            </div>
          </div>
        </div>,
        document.body
      )}
      {renderDrawer()}
    </>
  );
}
