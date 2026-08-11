'use client';

import { useMemo, useRef, useState } from 'react';
import type { Slot, SlotPosition, SlotRule } from '../page';
import { useNotification } from '../../../components/NotificationProvider';
import FormulaHelp from '../../../components/FormulaHelp';
import { getSlotRules } from '../../../lib/buildMath';

interface SlotSectionProps {
  slots: Slot[];
  setSlots: (slots: Slot[]) => void;
  selectedSlotIndex: number | null;
  setSelectedSlotIndex: (index: number | null) => void;
  readOnly?: boolean;
}

/**
 * Given the current tags and an edit-in-progress value at `idx`, returns the
 * tags array that should result from committing it. Pure function (no state)
 * so it can be called both from onBlur and from startEditing when switching
 * between tags without going through a browser blur event.
 */
function resolveCommit(tags: string[], idx: number, value: string): string[] {
  // Enforce 15-character limit and trim whitespace
  const trimmed = value.trim().slice(0, 20);
  const isNewTagSlot = idx === tags.length;

  if (isNewTagSlot) {
    if (trimmed && !tags.includes(trimmed)) {
      return [...tags, trimmed];
    }
    return tags;
  }

  if (trimmed) {
    if (trimmed === tags[idx]) return tags;
    const updated = [...tags];
    updated[idx] = trimmed;
    return updated;
  }

  // Cleared out -> remove this tag entirely.
  return tags.filter((_, i) => i !== idx);
}

/**
 * Builds a name for a duplicated slot. If the name ends in a number that
 * number is incremented ("Weapon 1" -> "Weapon 2"); otherwise " 2" is
 * appended ("Weapon" -> "Weapon 2"). Keeps incrementing until it no longer
 * collides with an existing slot name.
 */
function getDuplicateName(name: string, slots: Slot[]): string {
  const existing = new Set(slots.map((s) => s.slot_name.trim()));

  const bump = (current: string): string => {
    const match = current.match(/(\d+)$/);
    if (match) {
      return current.slice(0, -match[1].length) + String(parseInt(match[1], 10) + 1);
    }
    return `${current} 2`;
  };

  let nextName = bump(name.trim());
  while (existing.has(nextName)) {
    nextName = bump(nextName);
  }
  return nextName;
}

function EditableTags({
  tags,
  onChange,
  readOnly = false,
}: {
  tags: string[];
  onChange: (tags: string[]) => void;
  readOnly?: boolean;
}) {
  if (readOnly) return <div className="tag-editor">{tags.map((tag) => <span key={tag} className="tag">{tag}</span>)}</div>;
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [draftValue, setDraftValue] = useState('');
  const cancelRef = useRef(false);

  const startEditing = (idx: number, currentValue: string) => {
    // If another tag is mid-edit, commit it now, synchronously, instead of
    // relying on a browser blur event that may arrive too late (after a
    // reflow has already happened).
    if (editingIndex !== null && editingIndex !== idx) {
      const updated = resolveCommit(tags, editingIndex, draftValue);
      if (updated !== tags) onChange(updated);
    }
    setEditingIndex(idx);
    setDraftValue(currentValue);
  };

  const commitEdit = (idx: number) => {
    const updated = resolveCommit(tags, idx, draftValue);
    if (updated !== tags) onChange(updated);
    setEditingIndex(null);
    setDraftValue('');
  };

  const handleTagInputKeyDown = (event: React.KeyboardEvent<HTMLInputElement>, idx: number) => {
    if (event.key === ',' || event.key === 'Enter') {
      event.preventDefault();
      const updated = resolveCommit(tags, idx, draftValue);
      if (updated !== tags) onChange(updated);
      setEditingIndex(updated.length);
      setDraftValue('');
    } else if (event.key === 'Escape') {
      event.preventDefault();
      cancelRef.current = true;
      event.currentTarget.blur();
    }
  };

  const handleRemove = (idx: number) => {
    onChange(tags.filter((_, i) => i !== idx));
  };

  const displayList = [...tags, '']; // trailing entry = always-empty "new tag" slot

  return (
    <div className="tag-editor">
      {displayList.map((tagValue, idx) => {
        const isNewSlot = idx === tags.length;
        const isEditing = editingIndex === idx;

        if (isEditing) {
          return (
            <input
              key={idx}
              type="text"
              className="tag tag-input"
              autoFocus
              maxLength={20}
              value={draftValue}
              onChange={(e) => setDraftValue(e.target.value)}
              onFocus={(e) => e.currentTarget.select()}
              onBlur={() => {
                if (cancelRef.current) {
                  cancelRef.current = false;
                  setEditingIndex(null);
                  setDraftValue('');
                  return;
                }
                commitEdit(idx);
              }}
              onKeyDown={(e) => handleTagInputKeyDown(e, idx)}
              placeholder={isNewSlot ? 'New tag' : ''}
              size={Math.max((draftValue || (isNewSlot ? 'New tag' : ' ')).length, 4)}
            />
          );
        }

        if (isNewSlot) {
          return (
            <span
              key={idx}
              className="tag tag-empty"
              onMouseDown={(e) => {
                e.preventDefault();
                startEditing(idx, '');
              }}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === 'Enter') startEditing(idx, '');
              }}
            >
              + Add
            </span>
          );
        }

        return (
          <span
            key={idx}
            className="tag"
            onMouseDown={(e) => {
              e.preventDefault();
              startEditing(idx, tagValue);
            }}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === 'Enter') startEditing(idx, tagValue);
            }}
          >
            {tagValue}
            <button
              type="button"
              className="tag-remove"
              onMouseDown={(e) => {
                // Stop this from also triggering the parent tag's
                // onMouseDown (which would start editing instead of
                // letting the click below remove it).
                e.preventDefault();
                e.stopPropagation();
              }}
              onClick={(e) => {
                e.stopPropagation();
                handleRemove(idx);
              }}
              aria-label={`Remove ${tagValue}`}
            >
              ×
            </button>
          </span>
        );
      })}
    </div>
  );
}

export default function SlotSection({
  slots,
  setSlots,
  selectedSlotIndex,
  setSelectedSlotIndex,
  readOnly = false,
}: SlotSectionProps) {
  const { notify } = useNotification();

  const [newSlotName, setNewSlotName] = useState('');
  const [newSlotCategories, setNewSlotCategories] = useState<string[]>([]);
  const [editingClassName, setEditingClassName] = useState<string | null>(null);
  const [classDraftName, setClassDraftName] = useState('');
  const [isPasteOpen, setIsPasteOpen] = useState(false);
  const [pasteText, setPasteText] = useState('');
  const [pasteReplace, setPasteReplace] = useState(false);
  const [pasteIssues, setPasteIssues] = useState<string[]>([]);

  const selectedSlot = selectedSlotIndex !== null ? slots[selectedSlotIndex] : null;

  const defaultPositionFor = (index: number): SlotPosition => ({
    x: 32 + (index % 3) * 124,
    y: 32 + Math.floor(index / 3) * 124,
  });

  const copyToClipboard = (text: string): boolean => {
    if (typeof navigator !== 'undefined' && navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(text).catch(() => {});
      return true;
    }
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();
    try {
      return document.execCommand('copy');
    } catch {
      return false;
    } finally {
      document.body.removeChild(textarea);
    }
  };

  const handleCopySlots = () => {
    if (slots.length === 0) {
      notify('No slots to copy.', 'error');
      return;
    }
    const json = JSON.stringify(slots, null, 2);
    if (copyToClipboard(json)) {
      notify(`Copied ${slots.length} slot${slots.length === 1 ? '' : 's'} to clipboard.`, 'success');
    } else {
      notify('Copy failed — please copy manually.', 'error');
    }
  };

  const handleCopySelectedSlot = () => {
    if (!selectedSlot) return;
    const json = JSON.stringify(selectedSlot, null, 2);
    if (copyToClipboard(json)) {
      notify(`Copied slot "${selectedSlot.slot_name}" to clipboard.`, 'success');
    } else {
      notify('Copy failed — please copy manually.', 'error');
    }
  };

  const handleOpenPaste = () => {
    setPasteText('');
    setPasteReplace(false);
    setPasteIssues([]);
    setIsPasteOpen(true);
  };

  const validateImportedSlots = (items: unknown[]): { valid: Slot[]; issues: string[] } => {
    const valid: Slot[] = [];
    const issues: string[] = [];
    const seenNames = new Set<string>();

    items.forEach((item, index) => {
      const label = `Slot ${index + 1}`;
      if (typeof item !== 'object' || item === null) {
        issues.push(`${label}: not an object.`);
        return;
      }

      const raw = item as Record<string, unknown>;
      const slotName = typeof raw.slot_name === 'string' ? raw.slot_name.trim() : '';
      if (!slotName) {
        issues.push(`${label}: missing slot_name.`);
        return;
      }
      if (seenNames.has(slotName)) {
        issues.push(`${label} ("${slotName}"): duplicate slot name.`);
        return;
      }
      seenNames.add(slotName);

      const accepts = Array.isArray(raw.accepts)
        ? raw.accepts
            .filter((a): a is string => typeof a === 'string' && a.trim().length > 0)
            .map((a) => a.trim())
        : [];
      if (accepts.length === 0) {
        issues.push(`${label} ("${slotName}"): must have at least one accepted category.`);
        return;
      }

      const rawPosition = raw.position;
      const position =
        typeof rawPosition === 'object' && rawPosition !== null
          ? {
              x: typeof (rawPosition as { x?: unknown }).x === 'number' ? (rawPosition as { x: number }).x : 0,
              y: typeof (rawPosition as { y?: unknown }).y === 'number' ? (rawPosition as { y: number }).y : 0,
            }
          : undefined;

      valid.push({
        slot_name: slotName,
        accepts,
        shown_name: typeof raw.shown_name === 'string' && raw.shown_name.trim() ? raw.shown_name.trim() : undefined,
        limit: typeof raw.limit === 'number' && !Number.isNaN(raw.limit) ? raw.limit : undefined,
        position,
        color: typeof raw.color === 'string' && raw.color.trim() ? raw.color.trim() : undefined,
        textColor: typeof raw.textColor === 'string' && raw.textColor.trim() ? raw.textColor.trim() : undefined,
        size: typeof raw.size === 'number' && !Number.isNaN(raw.size) ? raw.size : undefined,
        transparency: typeof raw.transparency === 'number' && !Number.isNaN(raw.transparency) ? raw.transparency : undefined,
        stats: typeof raw.stats === 'object' && raw.stats !== null ? (raw.stats as Slot['stats']) : undefined,
      });
    });

    return { valid, issues };
  };

  const handleApplyPaste = () => {
    let parsed: unknown;
    try {
      parsed = JSON.parse(pasteText);
    } catch {
      notify('Invalid JSON — could not parse your paste.', 'error');
      return;
    }

    const items = Array.isArray(parsed) ? parsed : [parsed];
    if (items.length === 0) {
      notify('Invalid input: expected a slot or an array of slots.', 'error');
      return;
    }

    const { valid, issues } = validateImportedSlots(items);
    setPasteIssues(issues);

    if (valid.length === 0) {
      notify('No valid slots found in the pasted JSON.', 'error');
      return;
    }

    if (pasteReplace) {
      setSlots(valid.map((slot, index) => ({ ...slot, position: slot.position ?? defaultPositionFor(index) })));
      notify(
        `Imported ${valid.length} slot${valid.length === 1 ? '' : 's'}, existing slots replaced.${issues.length ? ` Skipped ${issues.length} invalid item(s).` : ''}`,
        'success'
      );
    } else {
      const existing = new Map(slots.map((s) => [s.slot_name, s]));
      let added = 0;
      let replaced = 0;
      valid.forEach((slot, index) => {
        const incoming = {
          ...slot,
          position: slot.position ?? existing.get(slot.slot_name)?.position ?? defaultPositionFor(slots.length + index),
        };
        if (existing.has(slot.slot_name)) {
          replaced += 1;
        } else {
          added += 1;
        }
        existing.set(slot.slot_name, incoming);
      });
      setSlots(Array.from(existing.values()));
      notify(
        `Imported ${added} new slot${added === 1 ? '' : 's'}, replaced ${replaced} matching by name.${issues.length ? ` Skipped ${issues.length} invalid item(s).` : ''}`,
        'success'
      );
    }

    setIsPasteOpen(false);
    setPasteText('');
    setPasteReplace(false);
    setPasteIssues([]);
  };

  const handleAddSlot = () => {
    const trimmedName = newSlotName.trim();

    if (!trimmedName) {
      notify('Slot name is required.', 'error');
      return;
    }

    if (slots.some((slot) => slot.slot_name === trimmedName)) {
      notify(`A slot named "${trimmedName}" already exists.`, 'error');
      return;
    }

    if (newSlotCategories.length === 0) {
      notify('Please add at least one accepted category for this slot.', 'error');
      return;
    }

  const newSlot: Slot = {
      slot_name: trimmedName,
      accepts: newSlotCategories,
      position: {
        x: 32 + (slots.length % 3) * 124,
        y: 32 + Math.floor(slots.length / 3) * 124,
      },
    };

    const nextSlots = [...slots, newSlot];
    setSlots(nextSlots);
    setSelectedSlotIndex(nextSlots.length - 1);
    setNewSlotName('');
    setNewSlotCategories([]);
    notify(`Slot "${trimmedName}" created successfully.`, 'success');
  };

  const updateSelectedSlot = (updates: Partial<Slot>) => {
    if (selectedSlotIndex === null || !selectedSlot) return;

    if ('accepts' in updates && Array.isArray(updates.accepts)) {
      if (updates.accepts.length === 0) {
        notify('A slot must have at least one category.', 'error');
        return;
      }
    }

    const updated = [...slots];
    const nextSlot = { ...updated[selectedSlotIndex], ...updates };

    if ('slot_name' in updates && typeof updates.slot_name === 'string') {
      const rawName = updates.slot_name;
      const trimmedName = rawName.trim();

      // Prevent duplicate slot names (comparing trimmed values)
      const hasDuplicate = slots.some(
        (slot, index) => index !== selectedSlotIndex && slot.slot_name.trim() === trimmedName
      );
      if (hasDuplicate) {
        notify(`A slot named "${trimmedName}" already exists.`, 'error');
        return;
      }

      nextSlot.slot_name = rawName; // Keep spaces while typing
    }

    updated[selectedSlotIndex] = nextSlot;
    setSlots(updated);
  };

  const handleDeleteSlot = () => {
    if (selectedSlotIndex === null || !selectedSlot) return;

    const deletedName = selectedSlot.slot_name;
    const nextSlots = slots.filter((_, index) => index !== selectedSlotIndex);
    setSlots(nextSlots);
    setSelectedSlotIndex(nextSlots.length > 0 ? Math.min(selectedSlotIndex, nextSlots.length - 1) : null);
    notify(`Deleted slot "${deletedName}".`, 'success');
  };

  const handleDuplicateSlot = () => {
    if (selectedSlotIndex === null || !selectedSlot) return;

    const nextName = getDuplicateName(selectedSlot.slot_name, slots);
    const newSlot: Slot = {
      ...selectedSlot,
      slot_name: nextName,
      position: {
        x: (selectedSlot.position?.x ?? 32) + 124,
        y: selectedSlot.position?.y ?? 32,
      },
    };

    const nextSlots = [...slots];
    nextSlots.splice(selectedSlotIndex + 1, 0, newSlot);
    setSlots(nextSlots);
    setSelectedSlotIndex(selectedSlotIndex + 1);
    notify(`Duplicated slot "${selectedSlot.slot_name}" as "${nextName}".`, 'success');
  };

  const formulaRows = useMemo(() => {
    const s = selectedSlot?.stats;
    if (!s || !getSlotRules(s).includes('formula')) return [];
    return (s.stats || []).map((stat) => ({
      stat,
      formula: s.formulas?.[stat] || '',
    }));
  }, [selectedSlot]);

  const updateSlotStats = (patch: Partial<NonNullable<Slot['stats']>>) => {
    const current = selectedSlot?.stats;
    updateSelectedSlot({
      stats: { ...(current || { rules: ['formula'], stats: [] }), ...patch },
    });
  };

  const toggleRule = (rule: SlotRule) => {
    const current = getSlotRules(selectedSlot?.stats);
    const next = current.includes(rule)
      ? current.filter((r) => r !== rule)
      : [...current, rule];

    if (next.length === 0) {
      updateSelectedSlot({ stats: undefined });
      return;
    }

    const existing = selectedSlot?.stats;
    updateSelectedSlot({
      stats: {
        rule: undefined,
        rules: next,
        stats: existing?.stats || [],
        points_per_level: existing?.points_per_level ?? 1,
        min_level:
          existing?.min_level ??
          (next.includes('stat_points') || next.includes('class_points') ? 1 : 0),
        max_level: existing?.max_level,
        formulas: existing?.formulas,
        classes: existing?.classes,
        class_formulas: existing?.class_formulas,
      },
    });
  };

  const updateFormulaRow = (index: number, patch: { stat?: string; formula?: string }) => {
    const s = selectedSlot?.stats;
    if (!s || !getSlotRules(s).includes('formula')) return;

    const stats = [...s.stats];
    const formulas = { ...(s.formulas || {}) };
    const oldKey = stats[index] || '';
    const oldFormula = formulas[oldKey] || '';
    let newKey = oldKey;

    if (patch.stat !== undefined) {
      const trimmed = patch.stat.trim();
      if (trimmed) {
        stats[index] = trimmed;
        delete formulas[oldKey];
        formulas[trimmed] = oldFormula;
        newKey = trimmed;
      }
    }
    if (patch.formula !== undefined) formulas[newKey] = patch.formula;

    updateSlotStats({ stats, formulas });
  };

  const addFormulaRow = () => {
    const s = selectedSlot?.stats;
    if (!s || !getSlotRules(s).includes('formula')) return;
    updateSlotStats({ stats: [...s.stats, ''], formulas: { ...(s.formulas || {}), '': '' } });
  };

  const removeFormulaRow = (index: number) => {
    const s = selectedSlot?.stats;
    if (!s || !getSlotRules(s).includes('formula')) return;
    const stats = [...s.stats];
    const formulas = { ...(s.formulas || {}) };
    delete formulas[stats[index] || ''];
    stats.splice(index, 1);
    updateSlotStats({ stats, formulas });
  };

  const handleClassesChange = (nextClasses: string[]) => {
    const s = selectedSlot?.stats;
    if (!s || !getSlotRules(s).includes('class_points')) return;
    const classFormulas = { ...(s.class_formulas || {}) };

    (s.classes || []).forEach((name, index) => {
      if (nextClasses[index] && nextClasses[index] !== name) {
        const renamed = nextClasses[index];
        classFormulas[renamed] = classFormulas[name];
        delete classFormulas[name];
      }
    });

    const nextSet = new Set(nextClasses);
    Object.keys(classFormulas).forEach((key) => {
      if (!nextSet.has(key)) delete classFormulas[key];
    });

    updateSlotStats({ classes: nextClasses, class_formulas: classFormulas });
  };

  const getDuplicateClassName = (name: string): string => {
    const existing = new Set((selectedSlot?.stats?.classes || []).map((n) => n));
    const bump = (current: string): string => {
      const match = current.match(/(\d+)$/);
      if (match) {
        return current.slice(0, -match[1].length) + String(parseInt(match[1], 10) + 1);
      }
      return `${current} 2`;
    };
    let nextName = bump(name);
    while (existing.has(nextName)) {
      nextName = bump(nextName);
    }
    return nextName;
  };

  const duplicateClass = (className: string) => {
    const s = selectedSlot?.stats;
    if (!s || !getSlotRules(s).includes('class_points')) return;
    const newName = getDuplicateClassName(className);
    const classes = [...(s.classes || []), newName];
    const classFormulas = { ...(s.class_formulas || {}) };
    classFormulas[newName] = { ...(classFormulas[className] || {}) };
    updateSlotStats({ classes, class_formulas: classFormulas });
    notify(`Duplicated class "${className}" as "${newName}".`, 'success');
  };

  const startClassRename = (className: string) => {
    setEditingClassName(className);
    setClassDraftName(className);
  };

  const commitClassRename = () => {
    if (editingClassName === null) return;
    const oldName = editingClassName;
    const s = selectedSlot?.stats;
    const trimmed = classDraftName.trim();
    setEditingClassName(null);
    setClassDraftName('');

    if (!s || !getSlotRules(s).includes('class_points')) return;
    if (!trimmed || trimmed === oldName) return;
    if ((s.classes || []).includes(trimmed)) {
      notify(`A class named "${trimmed}" already exists.`, 'error');
      return;
    }

    const classes = (s.classes || []).map((n) => (n === oldName ? trimmed : n));
    const classFormulas = { ...(s.class_formulas || {}) };
    classFormulas[trimmed] = classFormulas[oldName];
    delete classFormulas[oldName];
    updateSlotStats({ classes, class_formulas: classFormulas });
  };

  const updateClassFormulaRow = (
    className: string,
    index: number,
    patch: { stat?: string; formula?: string }
  ) => {
    const s = selectedSlot?.stats;
    if (!s || !getSlotRules(s).includes('class_points')) return;
    const classFormulas = { ...(s.class_formulas || {}) };
    const current = classFormulas[className] || {};
    const entries = Object.entries(current);
    const [oldStat, oldFormula] = entries[index] || ['', ''];
    const nextFormulas = { ...current };
    let newStat = oldStat;

    if (patch.stat !== undefined) {
      const trimmed = patch.stat.trim();
      if (trimmed) {
        delete nextFormulas[oldStat];
        nextFormulas[trimmed] = oldFormula;
        newStat = trimmed;
      }
    }
    if (patch.formula !== undefined) nextFormulas[newStat] = patch.formula;

    classFormulas[className] = nextFormulas;
    updateSlotStats({ class_formulas: classFormulas });
  };

  const addClassFormulaRow = (className: string) => {
    const s = selectedSlot?.stats;
    if (!s || !getSlotRules(s).includes('class_points')) return;
    const classFormulas = { ...(s.class_formulas || {}) };
    classFormulas[className] = { ...(classFormulas[className] || {}), '': '' };
    updateSlotStats({ class_formulas: classFormulas });
  };

  const removeClassFormulaRow = (className: string, index: number) => {
    const s = selectedSlot?.stats;
    if (!s || !getSlotRules(s).includes('class_points')) return;
    const classFormulas = { ...(s.class_formulas || {}) };
    const entries = Object.entries(classFormulas[className] || {});
    const [stat] = entries[index] || ['', ''];
    const nextFormulas = { ...(classFormulas[className] || {}) };
    delete nextFormulas[stat];
    classFormulas[className] = nextFormulas;
    updateSlotStats({ class_formulas: classFormulas });
  };

  const activeRules = getSlotRules(selectedSlot?.stats);

  return (
    <section className="rules-section">
      <div className="panel-header">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap', width: '100%' }}>
          <div>
            <h3>Slots</h3>
            <p className="panel-subtitle">Create new slots and edit the selected slot details.</p>
          </div>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button type="button" onClick={handleCopySlots} className="secondary small" title="Copy all slots as JSON">
              Copy JSON
            </button>
            {!readOnly && (
              <button type="button" onClick={handleOpenPaste} className="secondary small" title="Paste JSON to add or replace slots">
                Paste JSON
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="slot-editor-shell">
        {!readOnly && <div className="add-slot-form">
          <h4>Add Slot</h4>
          <label>
            Slot name <span style={{ color: 'red' }}>*</span>
            <input
              type="text"
              value={newSlotName}
              onChange={(e) => setNewSlotName(e.target.value)}
              placeholder="e.g. Weapon, Offhand"
            />
          </label>

          <div>
            <span className="label-text">Categories <span style={{ color: 'red' }}>*</span></span>
            <EditableTags tags={newSlotCategories} onChange={setNewSlotCategories} />
          </div>

          <button type="button" onClick={handleAddSlot} className="secondary">
            Add slot
          </button>
        </div>}

        {selectedSlot ? (
          <div className="selected-slot-card">
            <div className="selected-slot-header">
              <div>
                <p className="eyebrow">Selected Slot</p>
                <h4>{selectedSlot.slot_name}</h4>
              </div>
              {!readOnly && <div className="selected-slot-actions">
                <button type="button" onClick={handleCopySelectedSlot} className="secondary small" title="Copy this slot as JSON">
                  Copy JSON
                </button>
                <button type="button" onClick={handleDuplicateSlot} className="secondary small">
                  Duplicate
                </button>
                <button type="button" onClick={handleDeleteSlot} className="delete small">
                  Delete Slot
                </button>
              </div>}
            </div>

            <label>
              Slot name <span style={{ color: 'red' }}>*</span>
              <input
                type="text"
                value={selectedSlot.slot_name}
                readOnly={readOnly}
                onChange={(e) => updateSelectedSlot({ slot_name: e.target.value })}
              />
            </label>

            <label>
              Shown Name
              <input
                type="text"
                value={selectedSlot.shown_name || ''}
                readOnly={readOnly}
                placeholder="Optional"
                onChange={(e) => updateSelectedSlot({ shown_name: e.target.value.trim() || undefined })}
              />
            </label>

            <label>
              Categories <span style={{ color: 'red' }}>*</span>
              <EditableTags
                tags={selectedSlot.accepts}
                onChange={(categories) => updateSelectedSlot({ accepts: categories })}
                readOnly={readOnly}
              />
            </label>

            {!readOnly && (
              <div className="slot-appearance">
                <div className="slot-appearance-header">
                  <div>
                    <p className="eyebrow">Appearance</p>
                    <span className="hint-label">Customize how this slot looks on the canvas.</span>
                  </div>
                  <button
                    type="button"
                    className="secondary small"
                    onClick={() =>
                      updateSelectedSlot({
                        color: undefined,
                        textColor: undefined,
                        size: undefined,
                        transparency: undefined,
                      })
                    }
                  >
                    Reset Appearance
                  </button>
                </div>

                <div className="slot-appearance-field">
                  <label>Color</label>
                  <div className="slot-color-picker">
                    <input
                      type="color"
                      value={selectedSlot.color || '#2a2a26'}
                      onChange={(e) => updateSelectedSlot({ color: e.target.value })}
                      aria-label="Slot color"
                    />
                    <input
                      type="text"
                      value={selectedSlot.color || ''}
                      onChange={(e) => {
                        const raw = e.target.value;
                        if (!raw) {
                          updateSelectedSlot({ color: undefined });
                        } else if (/^#[0-9a-fA-F]{6}$/.test(raw)) {
                          updateSelectedSlot({ color: raw });
                        }
                      }}
                      placeholder="#hex"
                    />
                  </div>
                </div>

                <div className="slot-appearance-field">
                  <label>Text Color</label>
                  <div className="slot-color-picker">
                    <input
                      type="color"
                      value={selectedSlot.textColor || '#e6e4d9'}
                      onChange={(e) => updateSelectedSlot({ textColor: e.target.value })}
                      aria-label="Slot text color"
                    />
                    <input
                      type="text"
                      value={selectedSlot.textColor || ''}
                      onChange={(e) => {
                        const raw = e.target.value;
                        if (!raw) {
                          updateSelectedSlot({ textColor: undefined });
                        } else if (/^#[0-9a-fA-F]{6}$/.test(raw)) {
                          updateSelectedSlot({ textColor: raw });
                        }
                      }}
                      placeholder="#hex"
                    />
                  </div>
                </div>

                <div className="slot-appearance-field">
                  <label>Size <span className="hint-label">{selectedSlot.size ?? 96}px</span></label>
                  <div className="slot-range-row">
                    <input
                      type="range"
                      min="48"
                      max="192"
                      step="4"
                      value={selectedSlot.size ?? 96}
                      onChange={(e) => updateSelectedSlot({ size: parseInt(e.target.value, 10) })}
                      aria-label="Slot size"
                    />
                    <input
                      type="number"
                      min="48"
                      max="192"
                      step="4"
                      value={selectedSlot.size ?? 96}
                      onChange={(e) => {
                        const val = parseInt(e.target.value, 10);
                        updateSelectedSlot({
                          size: Number.isNaN(val) ? undefined : Math.min(192, Math.max(48, val)),
                        });
                      }}
                      aria-label="Slot size (px)"
                    />
                  </div>
                </div>

                <div className="slot-appearance-field">
                  <label>Transparency <span className="hint-label">{selectedSlot.transparency ?? 100}%</span></label>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    step="5"
                    value={selectedSlot.transparency ?? 100}
                    onChange={(e) => updateSelectedSlot({ transparency: parseInt(e.target.value, 10) })}
                    aria-label="Slot transparency"
                  />
                </div>
              </div>
            )}

            {!readOnly && (
              <div className="slot-appearance slot-stats-editor">
                <div className="slot-appearance-header">
                  <div>
                    <p className="eyebrow">Stats <FormulaHelp /></p>
                    <span className="hint-label">Optional — define stats this slot grants in builds.</span>
                  </div>
                </div>

                <div className="slot-appearance-field">
                  <label>Rules</label>
                  <div className="slot-rule-checks">
                    {(['stat_points', 'formula', 'class_points'] as SlotRule[]).map((rule) => (
                      <label key={rule} className="slot-rule-check">
                        <input
                          type="checkbox"
                          checked={activeRules.includes(rule)}
                          onChange={() => toggleRule(rule)}
                        />
                        {rule === 'stat_points' ? 'Stat Points' : rule === 'formula' ? 'Formula' : 'Class Points'}
                      </label>
                    ))}
                  </div>
                </div>

                {(activeRules.includes('stat_points') || activeRules.includes('class_points')) && (
                  <div className="slot-appearance-field">
                    <label>Points per Level</label>
                    <input
                      type="number"
                      min={1}
                      value={selectedSlot.stats?.points_per_level ?? 1}
                      onChange={(e) =>
                        updateSlotStats({ points_per_level: Math.max(1, parseInt(e.target.value, 10) || 1) })
                      }
                    />
                  </div>
                )}

                {activeRules.length > 0 && (
                  <div className="slot-level-range-fields">
                    <div className="slot-appearance-field">
                      <label>Min Level</label>
                      <input
                        type="number"
                        min={0}
                        value={selectedSlot.stats?.min_level ?? (activeRules.includes('stat_points') || activeRules.includes('class_points') ? 1 : 0)}
                        onChange={(e) =>
                          updateSlotStats({
                            min_level: Math.max(0, parseInt(e.target.value, 10) || 0),
                          })
                        }
                      />
                    </div>
                    <div className="slot-appearance-field">
                      <label>Max Level</label>
                      <input
                        type="number"
                        min={0}
                        placeholder="No limit"
                        value={selectedSlot.stats?.max_level ?? ''}
                        onChange={(e) =>
                          updateSlotStats({
                            max_level: e.target.value === ''
                              ? undefined
                              : Math.max(0, parseInt(e.target.value, 10) || 0),
                          })
                        }
                      />
                    </div>
                  </div>
                )}

                {activeRules.includes('stat_points') && (
                  <>
                    <div className="slot-appearance-field">
                      <label>Distributable Stats</label>
                      <EditableTags
                        tags={selectedSlot.stats?.stats || []}
                        onChange={(stats) => updateSlotStats({ stats })}
                      />
                    </div>
                  </>
                )}

                {activeRules.includes('formula') && (
                  <>
                    <div className="slot-appearance-field">
                      <label>Stat Formulas <span className="hint-label">use <code>level</code> in expressions</span></label>
                      <div className="slot-stats-formulas">
                        {formulaRows.map((row, index) => (
                          <div key={index} className="slot-stats-formula-row">
                            <input
                              type="text"
                              value={row.stat}
                              placeholder="Stat name"
                              onChange={(e) => updateFormulaRow(index, { stat: e.target.value })}
                            />
                            <input
                              type="text"
                              value={row.formula}
                              placeholder="e.g. level * 2"
                              onChange={(e) => updateFormulaRow(index, { formula: e.target.value })}
                            />
                            <button
                              type="button"
                              className="tag-remove"
                              onClick={() => removeFormulaRow(index)}
                              aria-label={`Remove formula for ${row.stat || 'new stat'}`}
                              title="Remove"
                            >
                              ×
                            </button>
                          </div>
                        ))}
                        <button type="button" className="secondary small" onClick={addFormulaRow}>
                          + Add Stat Formula
                        </button>
                      </div>
                    </div>
                  </>
                )}

                {activeRules.includes('class_points') &&
                  (() => {
                    const statsDef = selectedSlot.stats;
                    if (!statsDef) return null;
                    const classNames = statsDef.classes || [];
                    return (
                      <>
                        <div className="slot-appearance-field">
                          <label>Classes</label>
                          <EditableTags tags={classNames} onChange={handleClassesChange} />
                          <span className="hint-label">
                            Each class's formulas can use <code>points</code> for the class levels allocated to it.
                          </span>
                        </div>
                        {classNames.length === 0 ? (
                          <div className="hint-label">Add classes above, then define each class's stat formulas below.</div>
                        ) : (
                          classNames.map((className) => (
                            <div key={className} className="slot-class-block">
                              <div className="slot-class-header">
                                {editingClassName === className ? (
                                  <input
                                    type="text"
                                    value={classDraftName}
                                    autoFocus
                                    maxLength={15}
                                    placeholder="Class name"
                                    onChange={(e) => setClassDraftName(e.target.value)}
                                    onBlur={commitClassRename}
                                    onKeyDown={(e) => {
                                      if (e.key === 'Enter') {
                                        e.preventDefault();
                                        commitClassRename();
                                      } else if (e.key === 'Escape') {
                                        e.preventDefault();
                                        setEditingClassName(null);
                                        setClassDraftName('');
                                        e.currentTarget.blur();
                                      }
                                    }}
                                  />
                                ) : (
                                  <p className="eyebrow">{className}</p>
                                )}
                                {editingClassName !== className && (
                                  <div className="slot-class-actions">
                                    <button
                                      type="button"
                                      className="secondary small"
                                      onClick={() => startClassRename(className)}
                                      title="Rename class"
                                    >
                                      Rename
                                    </button>
                                    <button
                                      type="button"
                                      className="secondary small"
                                      onClick={() => duplicateClass(className)}
                                      title="Duplicate class"
                                    >
                                      Duplicate
                                    </button>
                                  </div>
                                )}
                              </div>
                              <div className="slot-stats-formulas">
                                {Object.entries(statsDef.class_formulas?.[className] || {}).map(
                                  ([stat, formula], index) => (
                                    <div key={index} className="slot-stats-formula-row">
                                      <input
                                        type="text"
                                        value={stat}
                                        placeholder="Stat name"
                                        onChange={(e) =>
                                          updateClassFormulaRow(className, index, { stat: e.target.value })
                                        }
                                      />
                                      <input
                                        type="text"
                                        value={formula}
                                        placeholder="e.g. points * 2"
                                        onChange={(e) =>
                                          updateClassFormulaRow(className, index, { formula: e.target.value })
                                        }
                                      />
                                      <button
                                        type="button"
                                        className="tag-remove"
                                        onClick={() => removeClassFormulaRow(className, index)}
                                        aria-label={`Remove formula for ${stat || 'new stat'}`}
                                        title="Remove"
                                      >
                                        ×
                                      </button>
                                    </div>
                                  )
                                )}
                                <button
                                  type="button"
                                  className="secondary small"
                                  onClick={() => addClassFormulaRow(className)}
                                >
                                  + Add Stat Formula
                                </button>
                              </div>
                            </div>
                          ))
                        )}
                      </>
                    );
                  })()}
              </div>
            )}
          </div>
        ) : (
          <div className="empty-state">
            <p>Select a slot card in the middle column to edit it here.</p>
          </div>
        )}
      </div>

      {isPasteOpen && (
        <div className="modal-overlay" onClick={() => setIsPasteOpen(false)}>
          <div className="modal-content import-json-form" onClick={(e) => e.stopPropagation()}>
            <h3>Paste Slot JSON</h3>
            <p className="hint-label">
              Paste a single slot or a JSON array of slots. By default, pasted slots are added and any
              slot already present with the same name is replaced.
            </p>
            <textarea
              value={pasteText}
              onChange={(e) => setPasteText(e.target.value)}
              rows={14}
              placeholder='[{ "slot_name": "Weapon", "accepts": ["Weapons"], "stats": { "rules": ["formula"], "stats": ["Damage"], "formulas": { "Damage": "level * 2" } } }]'
              style={{ width: '100%', fontFamily: 'monospace', fontSize: '0.85rem', boxSizing: 'border-box' }}
            />
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={pasteReplace}
                onChange={(e) => setPasteReplace(e.target.checked)}
              />
              <span><strong>Remove all existing slots and replace</strong></span>
            </label>
            {pasteIssues.length > 0 && (
              <div className="import-issues">
                <strong>Validation issues ({pasteIssues.length}):</strong>
                <ul>
                  {pasteIssues.map((issue, idx) => (
                    <li key={idx}>{issue}</li>
                  ))}
                </ul>
              </div>
            )}
            <div className="modal-footer" style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
              <button type="button" onClick={() => setIsPasteOpen(false)} className="secondary">
                Cancel
              </button>
              <button type="button" onClick={handleApplyPaste} className="primary">
                Import Slots
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
