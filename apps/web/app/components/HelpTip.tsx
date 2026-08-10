'use client';

import { useState, useLayoutEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import type { ReactNode } from 'react';

const POPOVER_OFFSET_X = 14;
const POPOVER_OFFSET_Y = 10;
const EDGE_MARGIN = 8;

interface HelpTipProps {
  title: string;
  children: ReactNode;
}

export default function HelpTip({ title, children }: HelpTipProps) {
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const [clamped, setClamped] = useState<{ x: number; y: number } | null>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  const openAt = (e: React.MouseEvent | React.FocusEvent<HTMLButtonElement>) => {
    if ('clientX' in e) {
      setPos({ x: e.clientX, y: e.clientY });
    } else {
      const rect = e.currentTarget.getBoundingClientRect();
      setPos({ x: rect.left + rect.width / 2, y: rect.bottom });
    }
  };

  useLayoutEffect(() => {
    if (!pos || !popoverRef.current) {
      setClamped(null);
      return;
    }
    const { width, height } = popoverRef.current.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    let x = pos.x + POPOVER_OFFSET_X;
    let y = pos.y + POPOVER_OFFSET_Y;
    x = Math.min(Math.max(x, EDGE_MARGIN), Math.max(EDGE_MARGIN, viewportWidth - width - EDGE_MARGIN));
    y = Math.min(Math.max(y, EDGE_MARGIN), Math.max(EDGE_MARGIN, viewportHeight - height - EDGE_MARGIN));
    setClamped({ x, y });
  }, [pos]);

  return (
    <>
      <button
        type="button"
        className="help-tip"
        onMouseEnter={openAt}
        onMouseMove={openAt}
        onMouseLeave={() => setPos(null)}
        onFocus={openAt}
        onBlur={() => setPos(null)}
        aria-label={title}
      >
        ?
      </button>
      {pos &&
        createPortal(
          <div
            ref={popoverRef}
            className="help-tip-popover"
            style={{
              position: 'fixed',
              left: clamped ? clamped.x : pos.x + POPOVER_OFFSET_X,
              top: clamped ? clamped.y : pos.y + POPOVER_OFFSET_Y,
              zIndex: 99999,
              pointerEvents: 'none',
              visibility: clamped ? 'visible' : 'hidden',
            }}
            role="tooltip"
          >
            <div className="help-tip-title">{title}</div>
            {children}
          </div>,
          document.body
        )}
    </>
  );
}
