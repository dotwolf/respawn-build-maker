import { useMemo } from 'react';
import type { StatDefinition } from '../../../lib/stats';

interface TemplateBasicsStepProps {
  name: string;
  setName: (name: string) => void;
  description: string;
  setDescription: (description: string) => void;
  isPrivate: boolean;
  setIsPrivate: (isPrivate: boolean) => void;
  stats: StatDefinition[];
  setStats: (updater: (prev: StatDefinition[]) => StatDefinition[]) => void;
  readOnly?: boolean;
}

export default function TemplateBasicsStep({
  name,
  setName,
  description,
  setDescription,
  isPrivate,
  setIsPrivate,
  stats,
  setStats,
  readOnly = false,
}: TemplateBasicsStepProps) {
  const knownGroups = useMemo(
    () => Array.from(new Set(stats.map((def) => def.group).filter((g): g is string => Boolean(g)))).sort(),
    [stats]
  );

  const moveStat = (index: number, delta: number) => {
    setStats((prev) => {
      const next = [...prev];
      const target = index + delta;
      if (target < 0 || target >= next.length) return prev;
      const [moved] = next.splice(index, 1);
      next.splice(target, 0, moved);
      return next;
    });
  };

  const setGroup = (index: number, group: string) => {
    setStats((prev) =>
      prev.map((def, i) => (i === index ? { ...def, group: group.trim() || undefined } : def))
    );
  };

  const toggleNegative = (index: number) => {
    setStats((prev) =>
      prev.map((def, i) => (i === index ? { ...def, negative: !def.negative } : def))
    );
  };

  return (
    <section className="rules-section">
      <label>
        <strong>Name<span style={{ color: 'red' }}>*</span></strong>
        <input
          type="text"
          value={name}
          readOnly={readOnly}
          onChange={(e) => setName(e.target.value)}
          placeholder="Template name"
        />
      </label>

      <label>
        <strong>Description</strong>
        <textarea
          value={description}
          readOnly={readOnly}
          onChange={(e) => setDescription(e.target.value)}
          rows={4}
          placeholder="Describe the purpose of this template"
        />
      </label>

      <div className="stats-display-container">
        <strong>Stats</strong>
        {!readOnly && (
          <p className="panel-subtitle">
            Reorder stats and group them. Mark a stat as "negative" when higher values are bad and lower values are good.
          </p>
        )}
        {stats.length > 0 ? (
          readOnly ? (
            <p className="stats-text">
              {stats.map((def) => (def.group ? `${def.name} (${def.group})` : def.name)).join(', ')}
            </p>
          ) : (
            <div className="stats-editor">
              {stats.map((def, index) => (
                <div key={def.name} className="stats-editor-row">
                  <span className="stats-editor-index">{index + 1}</span>
                  <span className="stats-editor-name" title={def.name}>{def.name}</span>
                  <input
                    type="text"
                    className="stats-editor-group"
                    value={def.group ?? ''}
                    onChange={(e) => setGroup(index, e.target.value)}
                    placeholder="Group"
                    list="stats-editor-groups"
                    aria-label={`Group for ${def.name}`}
                  />
                  <label className="checkbox-label stats-editor-negative" title="Bad when rising, good when lowering">
                    <input
                      type="checkbox"
                      checked={Boolean(def.negative)}
                      onChange={() => toggleNegative(index)}
                    />
                    <span>Negative</span>
                  </label>
                  <div className="stats-editor-move">
                    <button
                      type="button"
                      className="build-tier-btn"
                      onClick={() => moveStat(index, -1)}
                      disabled={index === 0}
                      aria-label={`Move ${def.name} up`}
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      className="build-tier-btn"
                      onClick={() => moveStat(index, 1)}
                      disabled={index === stats.length - 1}
                      aria-label={`Move ${def.name} down`}
                    >
                      ↓
                    </button>
                  </div>
                </div>
              ))}
              <datalist id="stats-editor-groups">
                {knownGroups.map((group) => (
                  <option key={group} value={group} />
                ))}
              </datalist>
            </div>
          )
        ) : (
          <p className="no-stats-text">No stats defined in components yet.</p>
        )}
      </div>

      <label className="checkbox-label">
        <input
          type="checkbox"
          checked={isPrivate}
          disabled={readOnly}
          onChange={(e) => setIsPrivate(e.target.checked)}
        />
        <span><strong>Private</strong> Only you can see and use this template.</span>
      </label>
    </section>
  );
}
