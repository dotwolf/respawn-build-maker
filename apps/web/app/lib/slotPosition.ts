import { useLayoutEffect, useState } from 'react';

export interface SlotPosition {
  x: number;
  y: number;
}

export interface SlotBounds {
  width: number;
  height: number;
}

/**
 * Clamps an absolute slot position so the slot (of `size`) always stays fully
 * inside a canvas of the given bounds. Negative values and positions that would
 * overflow the right/bottom edge are pushed back into the canvas.
 */
export function clampSlotPosition(
  position: SlotPosition | undefined,
  size: number,
  bounds: SlotBounds
): SlotPosition {
  const maxX = Math.max(0, bounds.width - size);
  const maxY = Math.max(0, bounds.height - size);
  return {
    x: Math.min(maxX, Math.max(0, Math.round(position?.x ?? 0))),
    y: Math.min(maxY, Math.max(0, Math.round(position?.y ?? 0))),
  };
}

/**
 * Returns the live width/height of a DOM node, kept in sync with a
 * ResizeObserver. Falls back to a single measure when ResizeObserver is
 * unavailable. `null` until the first measure succeeds.
 */
export function useCanvasBounds<T extends HTMLElement>(
  ref: React.RefObject<T | null>
): SlotBounds | null {
  const [bounds, setBounds] = useState<SlotBounds | null>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => {
      if (el.clientWidth > 0 && el.clientHeight > 0) {
        setBounds({ width: el.clientWidth, height: el.clientHeight });
      }
    };
    measure();
    if (typeof ResizeObserver !== 'undefined') {
      const observer = new ResizeObserver(measure);
      observer.observe(el);
      return () => observer.disconnect();
    }
    return undefined;
  }, [ref]);

  return bounds;
}
