'use client';

import { useRef, useState } from 'react';
import type { Slot } from '../page';
import { useNotification } from '../../../components/NotificationProvider';

interface SlotSectionProps {
  slots: Slot[];
  setSlots: (slots: Slot[]) => void;
  selectedSlotIndex: number | null;
  setSelectedSlotIndex: (index: number | null) => void;
}

/**
 * Given the current tags and an edit-in-progress value at `idx`, returns the
 * tags array that should result from committing it. Pure function (no state)
 * so it can be called both from onBlur and from startEditing when switching
 * between tags without going through a browser blur event.
 */
function resolveCommit(tags: string[], idx: number, value: string): string[] {
  // Enforce 15-character limit and trim whitespace
  const trimmed = value.trim().slice(0, 15);
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

function EditableTags({
  tags,
  onChange,
}: {
  tags: string[];
  onChange: (tags: string[]) => void;
}) {
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
              maxLength={15}
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
}: SlotSectionProps) {
  const { notify } = useNotification();

  const [newSlotName, setNewSlotName] = useState('');
  const [newSlotCategories, setNewSlotCategories] = useState<string[]>([]);

  const selectedSlot = selectedSlotIndex !== null ? slots[selectedSlotIndex] : null;

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

  return (
    <section className="rules-section">
      <div className="panel-header">
        <div>
          <h3>Slots</h3>
          <p className="panel-subtitle">Create new slots and edit the selected slot details.</p>
        </div>
      </div>

      <div className="slot-editor-shell">
        <div className="add-slot-form">
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
        </div>

        {selectedSlot ? (
          <div className="selected-slot-card">
            <div className="selected-slot-header">
              <div>
                <p className="eyebrow">Selected Slot</p>
                <h4>{selectedSlot.slot_name}</h4>
              </div>
              <button type="button" onClick={handleDeleteSlot} className="delete small">
                Delete Slot
              </button>
            </div>

            <label>
              Slot name <span style={{ color: 'red' }}>*</span>
              <input
                type="text"
                value={selectedSlot.slot_name}
                onChange={(e) => updateSelectedSlot({ slot_name: e.target.value })}
              />
            </label>

            <label>
              Categories <span style={{ color: 'red' }}>*</span>
              <EditableTags
                tags={selectedSlot.accepts}
                onChange={(categories) => updateSelectedSlot({ accepts: categories })}
              />
            </label>
          </div>
        ) : (
          <div className="empty-state">
            <p>Select a slot card in the middle column to edit it here.</p>
          </div>
        )}
      </div>
    </section>
  );
}