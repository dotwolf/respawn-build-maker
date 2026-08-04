'use client';

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';

type NotificationType = 'success' | 'error' | 'info';

export interface Notification {
  id: string;
  message: string;
  type: NotificationType;
  createdAt: number;
}

interface NotificationContextType {
  notifications: Notification[];
  notify: (message: string, type?: NotificationType) => void;
  dismiss: (id: string) => void;
}

const STORAGE_KEY = 'site_notifications';
const AUTO_DISMISS_TIME = 5000; // 5 seconds

const NotificationContext = createContext<NotificationContextType | undefined>(undefined);

export function NotificationProvider({ children }: { children: React.ReactNode }) {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [isHydrated, setIsHydrated] = useState(false);

  // 1. Load active notifications from localStorage on initial mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed: Notification[] = JSON.parse(saved);
        const now = Date.now();
        const valid = parsed.filter((n) => now - n.createdAt < AUTO_DISMISS_TIME);
        setNotifications(valid);
      }
    } catch (e) {
      console.error('Failed to load notifications from storage:', e);
    } finally {
      setIsHydrated(true);
    }
  }, []);

  // 2. Sync notifications to localStorage
  useEffect(() => {
    if (!isHydrated) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(notifications));
    } catch (e) {
      console.error('Failed to save notifications to storage:', e);
    }
  }, [notifications, isHydrated]);

  // 3. Automatically dismiss notifications after timeout
  useEffect(() => {
    const timer = setInterval(() => {
      const now = Date.now();
      setNotifications((prev) => {
        const filtered = prev.filter((item) => now - item.createdAt < AUTO_DISMISS_TIME);
        return filtered.length === prev.length ? prev : filtered;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  // Wrap notify in useCallback to prevent infinite render loops when used in useEffect dependencies
  const notify = useCallback((message: string, type: NotificationType = 'info') => {
    const newNotification: Notification = {
      id: `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
      message,
      type,
      createdAt: Date.now(),
    };

    setNotifications((prev) => [...prev, newNotification]);
  }, []);

  // Wrap dismiss in useCallback for stability
  const dismiss = useCallback((id: string) => {
    setNotifications((prev) => prev.filter((n) => n.id !== id));
  }, []);

  return (
    <NotificationContext.Provider value={{ notifications, notify, dismiss }}>
      {children}

      {/* Floating UI Banner/Toasts with fixed positioning fallback */}
      <div
        className="notification-container"
        style={{
          position: 'fixed',
          bottom: '24px',
          right: '24px',
          zIndex: 99999,
          display: 'flex',
          flexDirection: 'column',
          gap: '8px',
          pointerEvents: 'none',
        }}
      >
        {isHydrated &&
          notifications.map((n) => (
            <div
              key={n.id}
              className={`notification-toast ${n.type}`}
              style={{
                pointerEvents: 'auto',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '12px',
                minWidth: '280px',
                maxWidth: '420px',
                padding: '12px 16px',
                borderRadius: '8px',
                boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
                color: '#fff',
                backgroundColor:
                  n.type === 'success'
                    ? '#10B981'
                    : n.type === 'error'
                    ? '#EF4444'
                    : '#3B82F6',
              }}
            >
              <span style={{ fontSize: '14px', lineHeight: '1.4' }}>{n.message}</span>
              <button
                type="button"
                onClick={() => dismiss(n.id)}
                className="close-btn"
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: 'inherit',
                  fontSize: '18px',
                  cursor: 'pointer',
                  padding: '0 4px',
                  lineHeight: '1',
                }}
              >
                &times;
              </button>
            </div>
          ))}
      </div>
    </NotificationContext.Provider>
  );
}

export function useNotification() {
  const context = useContext(NotificationContext);
  if (!context) {
    throw new Error('useNotification must be used within a NotificationProvider');
  }
  return context;
}