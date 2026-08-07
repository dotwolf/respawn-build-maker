'use client';

import { createContext, useCallback, useContext, useMemo, useRef } from 'react';
import type { ReactNode } from 'react';
import type { OptimizerResult, OptimizerWeights } from '../lib/optimizer';

export interface OptimizerSettings {
  weights: OptimizerWeights;
  minReq: Record<string, string>;
  maxReq: Record<string, string>;
  excluded: Set<string>;
  excludedClasses: Set<string>;
  multiclass: boolean;
}

export interface OptimizerStoreEntry {
  settings: OptimizerSettings;
  result: OptimizerResult | null;
}

export const DEFAULT_OPTIMIZER_SETTINGS: OptimizerSettings = {
  weights: {},
  minReq: {},
  maxReq: {},
  excluded: new Set(),
  excludedClasses: new Set(),
  multiclass: true,
};

interface OptimizerStoreContextValue {
  getEntry: (templateId: string) => OptimizerStoreEntry | null;
  updateSettings: (templateId: string, patch: Partial<OptimizerSettings>) => void;
  setResult: (templateId: string, result: OptimizerResult | null) => void;
}

const OptimizerStoreContext = createContext<OptimizerStoreContextValue | null>(null);

export function OptimizerStoreProvider({ children }: { children: ReactNode }) {
  const storeRef = useRef<Record<string, OptimizerStoreEntry>>({});

  const getEntry = useCallback((templateId: string): OptimizerStoreEntry | null => {
    return storeRef.current[templateId] ?? null;
  }, []);

  const updateSettings = useCallback((templateId: string, patch: Partial<OptimizerSettings>): void => {
    const entry = storeRef.current[templateId];
    if (entry) {
      storeRef.current[templateId] = { ...entry, settings: { ...entry.settings, ...patch } };
    } else {
      storeRef.current[templateId] = {
        settings: { ...DEFAULT_OPTIMIZER_SETTINGS, ...patch },
        result: null,
      };
    }
  }, []);

  const setResult = useCallback((templateId: string, result: OptimizerResult | null): void => {
    const entry = storeRef.current[templateId];
    if (entry) {
      storeRef.current[templateId] = { ...entry, result };
    } else {
      storeRef.current[templateId] = { settings: { ...DEFAULT_OPTIMIZER_SETTINGS }, result };
    }
  }, []);

  const value = useMemo<OptimizerStoreContextValue>(
    () => ({ getEntry, updateSettings, setResult }),
    [getEntry, updateSettings, setResult]
  );

  return <OptimizerStoreContext.Provider value={value}>{children}</OptimizerStoreContext.Provider>;
}

export function useOptimizerStore(): OptimizerStoreContextValue {
  const value = useContext(OptimizerStoreContext);
  if (!value) throw new Error('useOptimizerStore must be used within OptimizerStoreProvider');
  return value;
}
