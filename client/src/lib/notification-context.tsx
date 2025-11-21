import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { useWebSocket } from './websocket';

interface NotificationContextType {
  unreadCount: number;
  incrementUnread: () => void;
  clearUnread: () => void;
}

const NotificationContext = createContext<NotificationContextType | undefined>(undefined);

const STORAGE_KEY = 'sportfolio_unread_activity';

export function NotificationProvider({ children }: { children: ReactNode }) {
  const [unreadCount, setUnreadCount] = useState(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored ? parseInt(stored, 10) : 0;
  });

  const { subscribe } = useWebSocket();

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, unreadCount.toString());
  }, [unreadCount]);

  useEffect(() => {
    // Only increment for background events (not user-initiated actions)
    
    // 1. Trade executions (your limit order matched)
    const unsubTrade = subscribe('trade', () => {
      setUnreadCount(prev => prev + 1);
    });

    // 2. Contest settlements (you won/placed)
    const unsubContestUpdate = subscribe('contestUpdate', (data) => {
      // Only notify on settlement/payout events
      if (data?.type === 'settled' || data?.type === 'payout') {
        setUnreadCount(prev => prev + 1);
      }
    });

    return () => {
      unsubTrade();
      unsubContestUpdate();
    };
  }, [subscribe]);

  const incrementUnread = () => setUnreadCount(prev => prev + 1);
  const clearUnread = () => setUnreadCount(0);

  return (
    <NotificationContext.Provider value={{ unreadCount, incrementUnread, clearUnread }}>
      {children}
    </NotificationContext.Provider>
  );
}

export function useNotifications() {
  const context = useContext(NotificationContext);
  if (!context) {
    throw new Error('useNotifications must be used within NotificationProvider');
  }
  return context;
}
