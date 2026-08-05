'use client';

import { useState, useLayoutEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

const POPOVER_OFFSET_X = 14;
const POPOVER_OFFSET_Y = 10;
const EDGE_MARGIN = 8;

export default function FormulaHelp() {
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
            <div className="help-tip-title">How formulas work</div>
            <p>Formulas are arithmetic expressions that evaluate to a number which is added to a stat.</p>
            <div className="help-tip-sub">Variables</div>
            <ul>
              <li>
                <code>level</code> — slot level (Formula rule) or component level/tier
              </li>
              <li>
                <code>points</code> — class levels allocated to a class (Class Points rule)
              </li>
            </ul>
            <div className="help-tip-sub">Operations</div>
            <ul>
              <li>
                <code>+</code> addition &nbsp;·&nbsp; <code>-</code> subtraction
              </li>
              <li>
                <code>*</code> multiplication &nbsp;·&nbsp; <code>/</code> division
              </li>
              <li>
                <code>%</code> remainder &nbsp;·&nbsp; <code>^</code> power (e.g. <code>2 ^ 3</code>)
              </li>
              <li>
                <code>//</code> whole division, drops the fraction (e.g. <code>7 // 2</code> = 3)
              </li>
              <li>
                <code>( )</code> parentheses for grouping
              </li>
            </ul>
            <div className="help-tip-sub">Functions</div>
            <ul>
              <li>
                <code>min(a, b)</code> / <code>max(a, b)</code> — smallest / largest
              </li>
              <li>
                <code>floor(x)</code> / <code>ceil(x)</code> / <code>round(x)</code> — rounding
              </li>
              <li>
                <code>abs(x)</code> — absolute value &nbsp;·&nbsp; <code>sqrt(x)</code> — square root
              </li>
              <li>
                <code>pow(x, n)</code> — power &nbsp;·&nbsp; <code>clamp(x, min, max)</code> — bounds
              </li>
              <li>
                <code>pi</code> — constant (3.14159…)
              </li>
            </ul>
            <div className="help-tip-sub">Examples</div>
            <p>
              <code>level * 2</code>, <code>level ^ 2 + 5</code>,{' '}
              <code>level // 2</code>, <code>clamp(points * 12, 0, 100)</code>, <code>min(level, 50)</code>
            </p>
          </div>,
          document.body
        )}
    </>
  );
}
