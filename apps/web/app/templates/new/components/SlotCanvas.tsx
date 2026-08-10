'use client';

import { useEffect, useRef, useState } from 'react';
import type { Slot, SlotPosition } from '../page';
import { clampSlotPosition, useCanvasBounds } from '../../../lib/slotPosition';

interface SlotCanvasProps {
  slots: Slot[];
  setSlots: (slots: Slot[]) => void;
  selectedSlotIndex: number | null;
  setSelectedSlotIndex: (index: number | null) => void;
  readOnly?: boolean;
}

const SLOT_SIZE = 96;

function getDefaultPosition(index: number): SlotPosition {
  return {
    x: 32 + (index % 3) * 124,
    y: 32 + Math.floor(index / 3) * 124,
  };
}

export default function SlotCanvas({
  slots,
  setSlots,
  selectedSlotIndex,
  setSelectedSlotIndex,
  readOnly = false,
}: SlotCanvasProps) {
  const canvasRef = useRef<HTMLDivElement | null>(null);
  const [draggingSlotIndex, setDraggingSlotIndex] = useState<number | null>(null);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const bounds = useCanvasBounds(canvasRef);

  useEffect(() => {
    if (!bounds) return;

    let changed = false;
    const normalized = slots.map((slot, index) => {
      const size = slot.size ?? SLOT_SIZE;
      const clamped = clampSlotPosition(slot.position, size, bounds);
      if (!slot.position || slot.position.x !== clamped.x || slot.position.y !== clamped.y) {
        changed = true;
        return { ...slot, position: clamped };
      }
      return slot;
    });

    if (changed) setSlots(normalized);
  }, [bounds, setSlots, slots]);

  useEffect(() => {
    if (draggingSlotIndex === null) return;

    const slot = slots[draggingSlotIndex];
    const slotSize = slot?.size ?? SLOT_SIZE;

    const handlePointerMove = (event: MouseEvent) => {
      const canvas = canvasRef.current;
      if (!canvas) return;

      const rect = canvas.getBoundingClientRect();
      const maxX = Math.max(0, rect.width - slotSize);
      const maxY = Math.max(0, rect.height - slotSize);

      const nextX = Math.min(maxX, Math.max(0, event.clientX - rect.left - dragOffset.x));
      const nextY = Math.min(maxY, Math.max(0, event.clientY - rect.top - dragOffset.y));

      const updated = slots.map((slot, index) => {
        if (index !== draggingSlotIndex) return slot;
        return {
          ...slot,
          position: { x: nextX, y: nextY },
        };
      });

      setSlots(updated);
    };

    const handlePointerUp = () => {
      setDraggingSlotIndex(null);
    };

    window.addEventListener('mousemove', handlePointerMove);
    window.addEventListener('mouseup', handlePointerUp);

    return () => {
      window.removeEventListener('mousemove', handlePointerMove);
      window.removeEventListener('mouseup', handlePointerUp);
    };
  }, [dragOffset, draggingSlotIndex, setSlots, slots]);

  const beginDrag = (index: number, event: React.MouseEvent<HTMLButtonElement>) => {
    if (readOnly) {
      setSelectedSlotIndex(index);
      return;
    }
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const slotPosition = slots[index]?.position ?? getDefaultPosition(index);

    setDraggingSlotIndex(index);
    setDragOffset({
      x: event.clientX - rect.left - slotPosition.x,
      y: event.clientY - rect.top - slotPosition.y,
    });
    setSelectedSlotIndex(index);
  };

  return (
    <div className="slot-canvas">
      <div ref={canvasRef} className="slot-canvas-plane">
        {slots.length === 0 ? (
          <div className="empty-state large">
            <p>No slots yet.</p>
            <span>Add a slot from the left panel and it will appear here.</span>
          </div>
        ) : (
          slots.map((slot, index) => {
            const size = slot.size ?? SLOT_SIZE;
            const rawPosition = slot.position ?? getDefaultPosition(index);
            const position = bounds ? clampSlotPosition(rawPosition, size, bounds) : rawPosition;

            return (
              <button
                key={`${slot.slot_name}-${index}`}
                type="button"
                className={`slot-card slot-card-square ${selectedSlotIndex === index ? 'selected' : ''}`}
                style={{
                  left: `${position.x}px`,
                  top: `${position.y}px`,
                  width: `${size}px`,
                  height: `${size}px`,
                  backgroundColor: slot.color || undefined,
                  opacity: slot.transparency !== undefined ? slot.transparency / 100 : undefined,
                }}
                onClick={() => setSelectedSlotIndex(index)}
                onMouseDown={(event) => beginDrag(index, event)}
              >
                <div className="slot-card-top">
                  <h4 style={{ color: slot.textColor || undefined, fontSize: `${Math.round(size * 0.16)}px` }}>
                    {slot.shown_name || slot.slot_name}
                  </h4>
                </div>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}
