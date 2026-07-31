'use client';

import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';

export type NotificationKind = 'success' | 'error' | 'info';

export type NotificationEntry = {
  id: string;
  title: string;
  message: string;
  type: NotificationKind;
};

type NotificationContextValue = {
  notify: (message: string, type?: NotificationKind, title?: string) => void;
};

const NotificationContext = createContext<NotificationContextValue | undefined>(undefined);

export function useNotification() {
  const context = useContext(NotificationContext);
  if (!context) {
    return {
      notify: () => {
        if (typeof window !== 'undefined') {
          console.warn('useNotification called outside NotificationProvider');
        }
      },
    };
  }
  return context;
}

export default function NotificationProvider({ children }: { children: React.ReactNode }) {
  const [notifications, setNotifications] = useState<NotificationEntry[]>([]);

  const notify = (message: string, type: NotificationKind = 'info', title?: string) => {
    const id = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const entry: NotificationEntry = {
      id,
      type,
      title: title ?? (type === 'error' ? 'Error' : type === 'success' ? 'Success' : 'Notice'),
      message,
    };
    setNotifications((prev) => [...prev, entry]);
    window.setTimeout(() => {
      setNotifications((current) => current.filter((item) => item.id !== id));
    }, 4500);
  };

  const value = useMemo(() => ({ notify }), []);

  return (
    <NotificationContext.Provider value={value}>
      {children}
      <div className="notification-viewport" aria-live="polite">
        {notifications.map((notification) => (
          <div key={notification.id} className={`notification ${notification.type}`}>
            <div className="notification-title">{notification.title}</div>
            <div className="notification-message">{notification.message}</div>
          </div>
        ))}
      </div>
    </NotificationContext.Provider>
  );
}
