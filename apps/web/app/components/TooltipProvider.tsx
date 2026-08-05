'use client';

import React, { createContext, useContext, useState, useCallback, useEffect, useLayoutEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

// --- Data Interfaces matching your tooltip structure ---
export interface Effect {
  stat?: string;
  type: 'percent_add' | 'multiplier' | 'flat' | string;
  value: number | string;
}

export interface LevelRule {
  type: 'formula' | 'tiers' | string;
  formulas?: Record<string, string>;
  formula?: string;
  max_level?: number;
  tiers?: Tier[];
}

export interface TierEffect {
  stat?: string;
  type: 'percent_add' | 'multiplier' | 'flat' | string;
  value: number;
}

export interface Tier {
  tier_number: number;
  label: string;
  effects: TierEffect[];
}

export interface ComponentTooltipData {
  name: string;
  category: string;
  sub_category?: string;
  description?: string;
  effects: Effect[];
  has_levels?: boolean;
  level_scaling?: 'formula' | 'tiers' | string | null;
  level_rule?: LevelRule | null;
  // Dynamic visual parameters mapped from legacy styles
  rarity?: 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary' | string;
  level?: number | string;
  itemClass?: string;
  itemType?: string;
  // Effective values at the equipped tier/level, including build multipliers
  currentEffects?: CurrentEffectValue[];
}

export interface CurrentEffectValue {
  stat?: string;
  type: string;
  value: number;
  note?: string;
}

// Rarity color mapping based on legacy CSS classes
const RARITY_COLORS: Record<string, string> = {
  common: '#aaa',
  uncommon: '#4CAF50',
  rare: '#2196F3',
  epic: '#bf2fd8',
  legendary: '#FF9800',
};

// Helper function to format effect values cleanly
const getEffectValueClass = (val: number | string): string => {
  if (typeof val === 'number') {
    if (val > 0) return '#ffb560'; // Legacy positive color
    if (val < 0) return '#F44336'; // Legacy negative color
  }
  return '#fff'; // Default stat value color
};

const formatEffectValue = (type: string, value: number): string => {
  if (type === 'percent_add') return `${value > 0 ? '+' : ''}${value}%`;
  if (type === 'multiplier') return `x${value}`;
  return `${value > 0 ? '+' : ''}${value}`;
};

// --- Context Definition ---
interface TooltipContextType {
  showTooltip: (data: ComponentTooltipData, e: React.MouseEvent | React.FocusEvent) => void;
  refreshTooltip: (data: ComponentTooltipData) => void;
  hideTooltip: () => void;
  updatePosition: (e: React.MouseEvent) => void;
}

const TooltipContext = createContext<TooltipContextType | undefined>(undefined);

export function TooltipProvider({ children }: { children: React.ReactNode }) {
  const [tooltipData, setTooltipData] = useState<ComponentTooltipData | null>(null);
  const [position, setPosition] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [clampedPosition, setClampedPosition] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isMounted, setIsMounted] = useState(false);
  const tooltipRef = useRef<HTMLDivElement | null>(null);

  // Avoid hydration mismatch when using createPortal
  useEffect(() => {
    setIsMounted(true);
  }, []);

  // Update cursor tracking position
  const updatePosition = useCallback((e: React.MouseEvent) => {
    setPosition({ x: e.clientX, y: e.clientY });
  }, []);

  const showTooltip = useCallback((data: ComponentTooltipData, e: React.MouseEvent | React.FocusEvent) => {
    setTooltipData(data);
    if ('clientX' in e) {
      setPosition({ x: e.clientX, y: e.clientY });
    } else {
      // Fallback for keyboard focus events
      const rect = (e.target as HTMLElement).getBoundingClientRect();
      setPosition({ x: rect.left + rect.width / 2, y: rect.top });
    }
  }, []);

  // Refresh tooltip content (e.g. after a tier/level change) without moving it
  const refreshTooltip = useCallback((data: ComponentTooltipData) => {
    setTooltipData(data);
  }, []);

  const hideTooltip = useCallback(() => {
    setTooltipData(null);
  }, []);

  // Keep the tooltip inside the viewport by measuring its rendered size
  useLayoutEffect(() => {
    if (!tooltipData || !tooltipRef.current) return;
    const rect = tooltipRef.current.getBoundingClientRect();
    const maxLeft = Math.max(8, window.innerWidth - rect.width - 8);
    const maxTop = Math.max(8, window.innerHeight - rect.height - 8);
    const left = Math.min(Math.max(position.x + 14, 8), maxLeft);
    const top = Math.min(Math.max(position.y + 7, 8), maxTop);
    setClampedPosition((prev) => (prev.x === left && prev.y === top ? prev : { x: left, y: top }));
  }, [tooltipData, position]);

  const nameColor = tooltipData?.rarity && RARITY_COLORS[tooltipData.rarity.toLowerCase()]
    ? RARITY_COLORS[tooltipData.rarity.toLowerCase()]
    : '#fff';

  return (
    <TooltipContext.Provider value={{ showTooltip, refreshTooltip, hideTooltip, updatePosition }}>
      {children}

      {/* Floating Global Tooltip UI rendered at document root via Portal */}
      {isMounted &&
        tooltipData &&
        createPortal(
          <div
            ref={tooltipRef}
            className="global-tooltip-container"
            style={{
              position: 'fixed',
              left: `${clampedPosition.x}px`,
              top: `${clampedPosition.y}px`,
              zIndex: 99999,
              pointerEvents: 'none',
              willChange: 'top, left',
            }}
          >
            {/* Embedded styles carrying over legacy .tooltip aesthetic */}
            <div
              className="component-card-tooltip"
              style={{
                display: 'block',
                visibility: 'visible',
                opacity: 1,
                width: '250px',
                padding: '10px',
                background: '#1a1a1a',
                border: '1px solid #444',
                borderRadius: '5px',
                boxShadow: '0 0 10px rgba(0, 0, 0, 0.5)',
                color: '#fff',
                boxSizing: 'border-box',
              }}
            >
              <div className="tooltip-header">
                <strong className="tooltip-name">
                  {tooltipData.name}
                </strong>

                <span
                  className="tooltip-category tooltip-rarity"
                  style={{
                    fontSize: '12px',
                    textTransform: 'capitalize',
                    color: nameColor !== '#fff' ? nameColor : '#aaa',
                  }}
                >
                  {tooltipData.category} {tooltipData.sub_category ? `• ${tooltipData.sub_category}` : ''}
                </span>
              </div>

              {/* Class indicator matching .tooltip-class */}
              {tooltipData.itemClass && (
                <div className="tooltip-class" style={{ fontSize: '12px', color: '#aaa', marginBottom: '5px' }}>
                  Class: {tooltipData.itemClass}
                </div>
              )}

              {/* Type indicator matching .tooltip-type */}
              {tooltipData.itemType && (
                <div className="tooltip-type" style={{ fontSize: '12px', color: '#aaa', marginBottom: '5px' }}>
                  Type: {tooltipData.itemType}
                </div>
              )}

              {/* Level indicator matching .tooltip-level */}
              {tooltipData.level !== undefined && (
                <div className="tooltip-level" style={{ fontSize: '12px', color: '#aaa', marginBottom: '5px' }}>
                  {tooltipData.level_rule?.type === 'tiers' ? 'Tier' : 'Level'}: {tooltipData.level}
                </div>
              )}

              {/* Description matching .tooltip-description */}
              {tooltipData.description && (
                <p
                  className="tooltip-description"
                  style={{
                    marginTop: '8px',
                    paddingTop: '8px',
                    fontSize: '12px',
                    color: '#ddd',
                    fontStyle: 'italic',
                    margin: '8px 0 0 0',
                  }}
                >
                  {tooltipData.description}
                </p>
              )}

              {/* Effects list adapted with .tooltip-stats structure */}
              <div className="tooltip-effects tooltip-stats" style={{ margin: '8px 0' }}>
                <span
                  className="tooltip-section-title"
                  style={{ fontSize: '12px', color: '#aaa', fontWeight: 'bold', display: 'block', marginBottom: '4px' }}
                >
                  {tooltipData.currentEffects ? 'Base Effects' : `Effects (${tooltipData.effects.length})`}
                </span>
                {tooltipData.effects.length === 0 ? (
                  <span className="tooltip-empty" style={{ fontSize: '12px', color: '#aaa' }}>
                    No base effects
                  </span>
                ) : (
                  tooltipData.effects.map((effect, effIdx) => (
                    <div
                      key={effIdx}
                      className="tooltip-effect-row tooltip-stat"
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        fontSize: '13px',
                      }}
                    >
                      <span className="tooltip-stat-name" style={{ color: '#aaa' }}>
                        {effect.stat || 'Unnamed Stat'}:
                      </span>
                      <span
                        className="tooltip-stat-val tooltip-stat-value"
                        style={{
                          fontWeight: 'bold',
                          color: getEffectValueClass(effect.value),
                        }}
                      >
                        {effect.type === 'percent_add' && `+${effect.value}%`}
                        {effect.type === 'multiplier' && `x${effect.value}`}
                        {effect.type === 'flat' && `+${effect.value}`}
                      </span>
                    </div>
                  ))
                )}
              </div>

              {/* Current values at the equipped tier, including build multipliers */}
              {tooltipData.currentEffects && (
                <div className="tooltip-effects tooltip-stats" style={{ margin: '8px 0' }}>
                  <span
                    className="tooltip-section-title"
                    style={{ fontSize: '12px', color: '#aaa', fontWeight: 'bold', display: 'block', marginBottom: '4px' }}
                  >
                    Current (
                    {tooltipData.has_levels
                      ? `${tooltipData.level_rule?.type === 'tiers' ? 'Tier' : 'Level'} ${tooltipData.level ?? 0}`
                      : 'in build'}
                    )
                  </span>
                  {tooltipData.currentEffects.length === 0 ? (
                    <span className="tooltip-empty" style={{ fontSize: '12px', color: '#aaa' }}>
                      No current effects
                    </span>
                  ) : (
                    tooltipData.currentEffects.map((effect, effIdx) => (
                      <div
                        key={effIdx}
                        className="tooltip-effect-row tooltip-stat"
                        style={{ display: 'flex', flexDirection: 'column', fontSize: '13px' }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                          <span className="tooltip-stat-name" style={{ color: '#aaa' }}>
                            {effect.stat || 'Unnamed Stat'}:
                          </span>
                          <span
                            className="tooltip-stat-val tooltip-stat-value"
                            style={{
                              fontWeight: 'bold',
                              color: getEffectValueClass(effect.value),
                            }}
                          >
                            {formatEffectValue(effect.type, effect.value)}
                          </span>
                        </div>
                        {effect.note && (
                          <span style={{ fontSize: '11px', color: '#aaa', fontStyle: 'italic' }}>
                            {effect.note}
                          </span>
                        )}
                      </div>
                    ))
                  )}
                </div>
              )}

              {/* Level scaling rules section */}
              {tooltipData.has_levels && (
                <div
                  className="tooltip-levels"
                  style={{
                    fontSize: '12px',
                    color: '#aaa',
                    marginTop: '8px',
                    paddingTop: '8px',
                    borderTop: '1px solid #444',
                  }}
                >
                  <span
                    className="tooltip-section-title"
                    style={{ fontWeight: 'bold', display: 'block', marginBottom: '4px' }}
                  >
                    Level Scaling: {tooltipData.level_scaling}
                  </span>
                  {tooltipData.level_rule?.type === 'formula' && (
                    <div>
                      {tooltipData.level_rule.formulas && Object.keys(tooltipData.level_rule.formulas).length > 0 ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', marginTop: '2px' }}>
                          {Object.entries(tooltipData.level_rule.formulas).map(([stat, formula]) => (
                            <div key={stat} style={{ fontSize: '11px' }}>
                              <span style={{ color: '#aaa' }}>{stat}:</span>{' '}
                              <code style={{ color: '#fff' }}>{formula}</code>
                            </div>
                          ))}
                        </div>
                      ) : tooltipData.level_rule.formula ? (
                        <div>
                          Formula: <code style={{ color: '#fff' }}>{tooltipData.level_rule.formula}</code>
                        </div>
                      ) : null}
                      {tooltipData.level_rule.max_level !== undefined && (
                        <div style={{ marginTop: '4px', fontSize: '11px' }}>
                          Max Lvl: {tooltipData.level_rule.max_level}
                        </div>
                      )}
                    </div>
                  )}
                  {tooltipData.level_rule?.type === 'tiers' && (
                    <div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginTop: '6px' }}>
                        {(tooltipData.level_rule.tiers || []).map((tier) => (
                          <div
                            key={tier.tier_number}
                            style={{
                              padding: '4px 6px',
                              border: '1px solid #333',
                              borderRadius: '4px',
                              background: '#111',
                            }}
                          >
                            <div style={{ color: '#fff', fontWeight: 'bold', fontSize: '11px', marginBottom: '2px' }}>
                              Tier {tier.tier_number}
                              {tier.label ? ` · ${tier.label}` : ''}
                            </div>
                            {tier.effects.length === 0 ? (
                              <div style={{ fontSize: '11px', color: '#777' }}>No effects</div>
                            ) : (
                              tier.effects.map((effect, effIdx) => (
                                <div
                                  key={effIdx}
                                  style={{
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    fontSize: '11px',
                                    lineHeight: '1.5',
                                  }}
                                >
                                  <span style={{ color: '#aaa' }}>{effect.stat || 'Unnamed Stat'}:</span>
                                  <span style={{ color: getEffectValueClass(effect.value) }}>
                                    {formatEffectValue(effect.type, effect.value)}
                                  </span>
                                </div>
                              ))
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>,
          document.body
        )}
    </TooltipContext.Provider>
  );
}

export function useTooltip() {
  const context = useContext(TooltipContext);
  if (!context) {
    throw new Error('useTooltip must be used within a TooltipProvider');
  }
  return context;
}