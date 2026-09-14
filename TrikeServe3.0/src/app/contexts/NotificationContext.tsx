import { createContext, useContext, useState, ReactNode, useCallback } from "react";

interface Notification {
  id: string;
  message: string;
  type: 'success' | 'error' | 'info';
  duration?: number;
  action?: { label: string; onClick: () => void };
}

interface NotificationContextType {
  notifications: Notification[];
  showNotification: (message: string, type?: 'success' | 'error' | 'info', duration?: number, action?: { label: string; onClick: () => void }) => void;
  removeNotification: (id: string) => void;
}

const NotificationContext = createContext<NotificationContextType | undefined>(undefined);

export function NotificationProvider({ children }: { children: ReactNode }) {
  const [notifications, setNotifications] = useState<Notification[]>([]);

  const showNotification = useCallback((
    message: string,
    type: 'success' | 'error' | 'info' = 'success',
    duration: number = 3000,
    action?: { label: string; onClick: () => void }
  ) => {
    const id = Date.now().toString();
    const notification: Notification = { id, message, type, duration, action };

    setNotifications((prev) => [...prev, notification]);

    // Auto-remove notification after duration
    if (duration > 0) {
      setTimeout(() => {
        removeNotification(id);
      }, duration);
    }
  }, []);

  const removeNotification = useCallback((id: string) => {
    setNotifications((prev) => prev.filter((n) => n.id !== id));
  }, []);

  return (
    <NotificationContext.Provider value={{ notifications, showNotification, removeNotification }}>
      {children}
    </NotificationContext.Provider>
  );
}

export function useNotification() {
  const context = useContext(NotificationContext);
  if (context === undefined) {
    throw new Error("useNotification must be used within a NotificationProvider");
  }
  return context;
}

