import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { DragEvent } from 'react';
import { X } from 'lucide-react';
import type { StatDefinition } from '../../../lib/stats';
import HelpTip from '../../../components/HelpTip';

interface TemplateBasicsStepProps {
  name: string;
  setName: (name: string) => void;
  description: string;
  setDescription: (description: string) => void;
  isPrivate: boolean;
  setIsPrivate: (isPrivate: boolean) => void;
  allowSuggestions: boolean;
  setAllowSuggestions: (allowSuggestions: boolean) => void;
  stats: StatDefinition[];
  setStats: (updater: (prev: StatDefinition[]) => StatDefinition[]) => void;
  readOnly?: boolean;
}

interface StatSection {
  group: string | undefined;
  stats: StatDefinition[];
}

/**
 * Moves the given stats (by name, in list order) so that they sit as a block
 * before or after `targetName`, preserving their relative order.
 */
function reorderBlock<T extends { name: string }>(
  items: T[],
  names: string[],
  targetName: string,
  place: 'before' | 'after'
): T[] {
  const selected = items.filter((item) => names.includes(item.name));
  if (selected.length === 0) return items;
  const remaining = items.filter((item) => !names.includes(item.name));
  if (remaining.length === 0) return items;

  const targetIdx = remaining.findIndex((item) => item.name === targetName);
  const insertAt = targetIdx === -1 ? remaining.length : place === 'before' ? targetIdx : targetIdx + 1;
  remaining.splice(insertAt, 0, ...selected);
  return remaining;
}

/**
 * Keeps the priority order invariant: all grouped stats always come before
 * ungrouped stats, preserving relative order within each.
 */
function normalizePriorityOrder(items: StatDefinition[]): StatDefinition[] {
  return [
    ...items.filter((item) => item.group !== undefined),
    ...items.filter((item) => item.group === undefined),
  ];
}

export default function TemplateBasicsStep({
  name,
  setName,
  description,
  setDescription,
  isPrivate,
  setIsPrivate,
  allowSuggestions,
  setAllowSuggestions,
  stats,
  setStats,
  readOnly = false,
}: TemplateBasicsStepProps) {
  const [isStatOrderOpen, setIsStatOrderOpen] = useState(false);
  const [selectedNames, setSelectedNames] = useState<Set<string>>(new Set());
  const [dragNames, setDragNames] = useState<string[] | null>(null);
  const [dropTarget, setDropTarget] = useState<{ name: string; place: 'before' | 'after' } | null>(null);
  const [zoneDropGroup, setZoneDropGroup] = useState<string | undefined | null>(null);
  const [groupInput, setGroupInput] = useState('');
  const [createdGroups, setCreatedGroups] = useState<string[]>([]);
  const [statOrderPos, setStatOrderPos] = useState<{ x: number; y: number } | null>(null);
  const [statOrderDrag, setStatOrderDrag] = useState<{
    startX: number;
    startY: number;
    originX: number;
    originY: number;
  } | null>(null);
  const statOrderRef = useRef<HTMLDivElement | null>(null);
  const bodyRef = useRef<HTMLDivElement | null>(null);
  const suppressClickRef = useRef(false);

  const sections = useMemo(() => {
    const out: StatSection[] = [];
    for (const def of stats) {
      const last = out[out.length - 1];
      if (last && last.group === def.group) last.stats.push(def);
      else out.push({ group: def.group, stats: [def] });
    }
    return out;
  }, [stats]);

  const derivedGroups = useMemo(
    () => Array.from(new Set(stats.map((def) => def.group).filter((g): g is string => Boolean(g)))).sort(),
    [stats]
  );

  const zoneSections = useMemo(() => {
    const zones: StatSection[] = [];
    const seen = new Set<string>();
    for (const section of sections) {
      if (section.group === undefined || seen.has(section.group)) continue;
      seen.add(section.group);
      zones.push(section);
    }
    for (const group of createdGroups) {
      if (seen.has(group)) continue;
      seen.add(group);
      zones.push({ group, stats: [] });
    }
    zones.push({ group: undefined, stats: stats.filter((def) => def.group === undefined) });
    return zones;
  }, [sections, stats, createdGroups]);

  const selectionStats = stats.filter((def) => selectedNames.has(def.name));
  const selectionGroup = selectionStats.length > 0 ? selectionStats[0].group : undefined;
  const canMove =
    selectionStats.length > 0 && selectionStats.every((def) => def.group === selectionGroup);
  const firstSelIdx = stats.findIndex((def) => selectedNames.has(def.name));
  const lastSelIdx = stats.length - 1 - [...stats].reverse().findIndex((def) => selectedNames.has(def.name));
  const canMoveUp = canMove && firstSelIdx > 0 && stats[firstSelIdx - 1].group === selectionGroup;
  const canMoveDown = canMove && lastSelIdx < stats.length - 1 && stats[lastSelIdx + 1].group === selectionGroup;

  const toggleNegative = (index: number) => {
    setStats((prev) => prev.map((def, i) => (i === index ? { ...def, negative: !def.negative } : def)));
  };

  const openStatOrder = () => {
    setStatOrderPos({
      x: Math.max(8, Math.round((window.innerWidth - 620) / 2)),
      y: Math.max(8, Math.round((window.innerHeight - 480) / 2)),
    });
    setSelectedNames(new Set());
    setDragNames(null);
    setDropTarget(null);
    setZoneDropGroup(null);
    setIsStatOrderOpen(true);
  };

  const closeStatOrder = () => {
    setIsStatOrderOpen(false);
    setSelectedNames(new Set());
    setDragNames(null);
    setDropTarget(null);
    setZoneDropGroup(null);
    setStatOrderDrag(null);
  };

  const toggleSelect = (name: string) => {
    setSelectedNames((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  const selectedInOrder = () =>
    stats.filter((def) => selectedNames.has(def.name)).map((def) => def.name);

  const handleDragStart = (name: string, e: DragEvent) => {
    const moving = selectedNames.has(name) ? selectedInOrder() : [name];
    if (!selectedNames.has(name)) setSelectedNames(new Set([name]));
    setDragNames(moving);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', name);
  };

  const handleDragOverRow = (name: string, e: DragEvent) => {
    if (!dragNames || dragNames.length === 0) return;
    const targetGroup = stats.find((def) => def.name === name)?.group;
    const dragged = stats.filter((def) => dragNames.includes(def.name));
    const draggedGroup = dragged.length > 0 ? dragged[0].group : undefined;
    if (dragged.length === 0 || !dragged.every((def) => def.group === draggedGroup)) return;
    if (draggedGroup !== targetGroup) return;
    e.stopPropagation();
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    const rect = e.currentTarget.getBoundingClientRect();
    setDropTarget({
      name,
      place: e.clientY < rect.top + rect.height / 2 ? 'before' : 'after',
    });
  };

  const handleDropOnRow = (name: string) => {
    const moving = dragNames ?? [];
    if (moving.length > 0 && !moving.includes(name)) {
      const place = dropTarget?.place ?? 'before';
      setStats((prev) => reorderBlock(prev, moving, name, place));
    }
    suppressClickRef.current = true;
    clearDragState();
  };

  const handleZoneDragOver = (e: DragEvent, group: string | undefined) => {
    if (!dragNames || dragNames.length === 0) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setZoneDropGroup(group);
  };

  const handleBodyDragOver = (e: DragEvent) => {
    if (!dragNames || dragNames.length === 0) return;
    const el = bodyRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const edge = 56;
    const speed = 0.35;
    const fromTop = e.clientY - rect.top;
    const fromBottom = rect.bottom - e.clientY;
    if (fromTop < edge) {
      el.scrollTop -= Math.round((edge - fromTop) * speed);
    } else if (fromBottom < edge) {
      el.scrollTop += Math.round((edge - fromBottom) * speed);
    }
  };

  const handleZoneDrop = (e: DragEvent, group: string | undefined) => {
    e.preventDefault();
    if (dragNames && dragNames.length > 0) assignToGroup(dragNames, group);
  };

  const handleDragEnd = () => {
    suppressClickRef.current = true;
    clearDragState();
  };

  const clearDragState = () => {
    setDragNames(null);
    setDropTarget(null);
    setZoneDropGroup(null);
  };

  const handleRowClick = (name: string) => {
    if (suppressClickRef.current) {
      suppressClickRef.current = false;
      return;
    }
    toggleSelect(name);
  };

  const assignToGroup = (names: string[], group: string | undefined) => {
    if (names.length === 0) return;
    setStats((prev) => {
      const moved = prev.filter((def) => names.includes(def.name)).map((def) => ({ ...def, group }));
      if (moved.length === 0) return prev;
      const rest = prev.filter((def) => !names.includes(def.name));

      if (group === undefined) {
        let insertAt = rest.length;
        for (let i = rest.length - 1; i >= 0; i--) {
          if (rest[i].group === undefined) {
            insertAt = i + 1;
            break;
          }
        }
        rest.splice(insertAt, 0, ...moved);
        return rest;
      }

      const normalized = normalizePriorityOrder(rest);
      let insertAt = 0;
      for (let i = 0; i < normalized.length; i++) {
        if (normalized[i].group === group) {
          insertAt = i;
          break;
        }
      }
      normalized.splice(insertAt, 0, ...moved);
      return normalized;
    });
    clearDragState();
  };

  const deleteGroup = (group: string) => {
    setCreatedGroups((prev) => prev.filter((g) => g !== group));
    setStats((prev) =>
      normalizePriorityOrder(prev.map((def) => (def.group === group ? { ...def, group: undefined } : def)))
    );
  };

  const addGroup = () => {
    const group = groupInput.trim();
    if (!group) return;
    setGroupInput('');
    if (derivedGroups.includes(group) || createdGroups.includes(group)) return;
    setCreatedGroups((prev) => Array.from(new Set([...prev, group])));
  };

  const moveSelected = (delta: number) => {
    if (selectedNames.size === 0) return;
    const names = selectedInOrder();
    setStats((prev) => {
      const firstIdx = prev.findIndex((d) => names.includes(d.name));
      if (firstIdx === -1) return prev;
      const lastIdx = prev.length - 1 - [...prev].reverse().findIndex((d) => names.includes(d.name));
      if (delta < 0 && firstIdx === 0) return prev;
      if (delta > 0 && lastIdx === prev.length - 1) return prev;
      const neighbor = prev[delta < 0 ? firstIdx - 1 : lastIdx + 1];
      return reorderBlock(prev, names, neighbor.name, delta < 0 ? 'before' : 'after');
    });
  };

  // Drag the floating popup by its header (mirrors the equip window).
  useEffect(() => {
    if (!statOrderDrag || !isStatOrderOpen) return;

    const handlePointerMove = (event: PointerEvent) => {
      const rect = statOrderRef.current?.getBoundingClientRect();
      const width = rect?.width ?? 620;
      const height = rect?.height ?? 480;
      const dx = event.clientX - statOrderDrag.startX;
      const dy = event.clientY - statOrderDrag.startY;
      const maxX = Math.max(8, window.innerWidth - width - 8);
      const maxY = Math.max(8, window.innerHeight - height - 8);
      setStatOrderPos({
        x: Math.min(Math.max(statOrderDrag.originX + dx, 8), maxX),
        y: Math.min(Math.max(statOrderDrag.originY + dy, 8), maxY),
      });
    };

    const handlePointerUp = () => setStatOrderDrag(null);

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
    };
  }, [statOrderDrag, isStatOrderOpen]);

  // Keep the popup within the viewport (covers resize and content height changes).
  useLayoutEffect(() => {
    if (!isStatOrderOpen) return;
    const clamp = () => {
      const el = statOrderRef.current;
      if (!el) return;
      setStatOrderPos((prev) => {
        if (!prev) return prev;
        const width = el.offsetWidth;
        const height = el.offsetHeight;
        const maxX = Math.max(8, window.innerWidth - width - 8);
        const maxY = Math.max(8, window.innerHeight - height - 8);
        const x = Math.min(Math.max(prev.x, 8), maxX);
        const y = Math.min(Math.max(prev.y, 8), maxY);
        if (x === prev.x && y === prev.y) return prev;
        return { x, y };
      });
    };
    clamp();
    window.addEventListener('resize', clamp);
    return () => window.removeEventListener('resize', clamp);
  }, [isStatOrderOpen, stats, zoneSections, createdGroups]);

  // Close on Escape.
  useEffect(() => {
    if (!isStatOrderOpen) return;
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeStatOrder();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [isStatOrderOpen]);

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
        <div className="stats-editor-header">
          <strong>Stats</strong>
          {!readOnly && stats.length > 0 && (
            <button type="button" className="build-tier-btn" onClick={openStatOrder}>
              Edit
            </button>
          )}
        </div>
        {stats.length > 0 ? (
          <p className="stats-text">
            {stats.map((def) => (def.group ? `${def.name} (${def.group})` : def.name)).join(', ')}
          </p>
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

      <label className="checkbox-label checkbox-with-help">
        <input
          type="checkbox"
          checked={allowSuggestions}
          disabled={readOnly}
          onChange={(e) => setAllowSuggestions(e.target.checked)}
        />
        <span>
          <strong>Allow public suggestions<HelpTip title="Public inventory suggestions">
            <p>
              When enabled, anyone visiting this template can propose component changes in the
              inventory pool. You review each suggestion and can accept or delete it. As the creator,
              you are still in complete control of the component pool.
            </p>
            <div className="help-tip-sub">How it works</div>
            <ul>
              <li>Each visitor can keep one pending suggestion per template.</li>
              <li>You review suggestions from the template&apos;s edit page.</li>
              <li>Visitors can suggest edits, additions and deletions to components.</li>
            </ul>
          </HelpTip></strong>
          
        </span>
      </label>

      {isStatOrderOpen &&
        createPortal(
          <div className="modal-overlay" onClick={closeStatOrder}>
            <div
              ref={statOrderRef}
              className="modal-content stat-order-modal"
              style={{
                position: 'fixed',
                left: statOrderPos?.x ?? 8,
                top: statOrderPos?.y ?? 8,
                width: 620,
                maxWidth: 'calc(100vw - 16px)',
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <div
                className="modal-actions-bar stat-order-header"
                onPointerDown={(e) => {
                  e.preventDefault();
                  if (!statOrderPos) return;
                  setStatOrderDrag({
                    startX: e.clientX,
                    startY: e.clientY,
                    originX: statOrderPos.x,
                    originY: statOrderPos.y,
                  });
                }}
              >
                <div>
                  <h3 style={{ margin: 0 }}>Stat Order</h3>
                  <p className="panel-subtitle">
                    Drag stats into a group zone to assign them, or into "No group" to remove their group. Drag
                    a row to reorder it within its zone. Click to select multiple.
                  </p>
                </div>
                <button
                  type="button"
                  className="icon-button"
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={closeStatOrder}
                  aria-label="Close stat order"
                >
                  <X size={18} />
                </button>
              </div>

              <div className="stat-order-toolbar">
                <span className="stat-order-selected-count">
                  {selectedNames.size} selected
                </span>
                <div className="stat-order-actions">
                  <button
                    type="button"
                    className="build-tier-btn"
                    onClick={() => moveSelected(-1)}
                    disabled={!canMoveUp}
                    aria-label="Move selection up"
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    className="build-tier-btn"
                    onClick={() => moveSelected(1)}
                    disabled={!canMoveDown}
                    aria-label="Move selection down"
                  >
                    ↓
                  </button>
                </div>
              </div>

              <div className="stat-order-create">
                <input
                  type="text"
                  value={groupInput}
                  onChange={(e) => setGroupInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      addGroup();
                    }
                  }}
                  placeholder="New group name"
                  aria-label="New group name"
                />
                <button type="button" className="build-tier-btn" onClick={addGroup}>
                  + Add group
                </button>
              </div>

              {stats.length === 0 ? (
                <p className="no-stats-text" style={{ padding: '1.5rem' }}>
                  No stats defined in components yet.
                </p>
              ) : (
                <div ref={bodyRef} className="stat-order-body" onDragOver={handleBodyDragOver}>
                  {zoneSections.map((zone) => {
                    const isEmpty = zone.stats.length === 0;
                    const isDropTarget = zoneDropGroup === zone.group;
                    const zoneClass = [
                      'stat-order-section',
                      isEmpty ? 'empty' : '',
                      isDropTarget ? 'drop-target' : '',
                    ]
                      .filter(Boolean)
                      .join(' ');

                    return (
                      <div
                        key={zone.group ?? '__no_group__'}
                        className={zoneClass}
                        onDragOver={(e) => handleZoneDragOver(e, zone.group)}
                        onDragLeave={(e) => {
                          if (!(e.relatedTarget instanceof Node) || !e.currentTarget.contains(e.relatedTarget)) {
                            if (zoneDropGroup === zone.group) setZoneDropGroup(null);
                          }
                        }}
                        onDrop={(e) => handleZoneDrop(e, zone.group)}
                      >
                        <div className="stat-order-section-header">
                          <span className="stat-order-zone-name">{zone.group ?? 'No group'}</span>
                          <span className="count">{zone.stats.length}</span>
                          {zone.group !== undefined && (
                            <button
                              type="button"
                              className="stat-order-group-remove"
                              onClick={(e) => {
                                e.stopPropagation();
                                deleteGroup(zone.group as string);
                              }}
                              aria-label={`Delete group ${zone.group}`}
                            >
                              ×
                            </button>
                          )}
                        </div>
                        {zone.stats.map((def) => {
                          const index = stats.indexOf(def);
                          const isSelected = selectedNames.has(def.name);
                          const isDragging = dragNames?.includes(def.name) ?? false;
                          const isDropTarget = dropTarget?.name === def.name && !isDragging;
                          const rowClass = [
                            'stat-order-row',
                            isSelected ? 'selected' : '',
                            isDragging ? 'dragging' : '',
                            isDropTarget ? `drop-${dropTarget?.place}` : '',
                          ]
                            .filter(Boolean)
                            .join(' ');

                          return (
                            <div
                              key={def.name}
                              className={rowClass}
                              draggable
                              onDragStart={(e) => handleDragStart(def.name, e)}
                              onDragOver={(e) => handleDragOverRow(def.name, e)}
                              onDrop={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                handleDropOnRow(def.name);
                              }}
                              onDragEnd={handleDragEnd}
                              onClick={() => handleRowClick(def.name)}
                            >
                              <span className="stat-order-handle" title="Drag to reorder">⋮⋮</span>
                              <span className="stat-order-index">{index + 1}</span>
                              <span className="stat-order-name" title={def.name}>{def.name}</span>
                              <label
                                className="checkbox-label stat-order-negative"
                                title="Bad when rising, good when lowering"
                                onClick={(e) => e.stopPropagation()}
                              >
                                <input
                                  type="checkbox"
                                  checked={Boolean(def.negative)}
                                  onChange={() => toggleNegative(index)}
                                />
                                <span>Negative</span>
                              </label>
                            </div>
                          );
                        })}
                        <div className="stat-order-zone-drop">Drop stats here</div>
                      </div>
                    );
                  })}
                </div>
              )}

              <div className="modal-footer stat-order-footer">
                <button
                  type="button"
                  className="button secondary"
                  onClick={() => setSelectedNames(new Set())}
                  disabled={selectedNames.size === 0}
                >
                  Clear selection
                </button>
                <button type="button" className="button" onClick={closeStatOrder}>
                  Done
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}
    </section>
  );
}
