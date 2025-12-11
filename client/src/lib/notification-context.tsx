import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { useWebSocket } from './websocket';
import { useAuth } from '@/hooks/useAuth';

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
  const { user } = useAuth();

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, unreadCount.toString());
  }, [unreadCount]);

  useEffect(() => {
    // Only increment for background events that affect the CURRENT user
    // Not for trades/events from other users or bots
    
    // 1. Portfolio updates (your order was filled - balance changed)
    // Only triggers when YOUR balance/holdings change from a filled order
    const unsubPortfolio = subscribe('portfolio', (data: { userId?: string }) => {
      // Only increment if this portfolio update is for the current user
      if (user?.id && data.userId === user.id) {
        setUnreadCount(prev => prev + 1);
      }
    });

    // 2. Trade notifications - only for trades you participated in
    // Check if you're the buyer or seller
    const unsubTrade = subscribe('trade', (data: { buyerId?: string; sellerId?: string }) => {
      if (user?.id && (data.buyerId === user.id || data.sellerId === user.id)) {
        setUnreadCount(prev => prev + 1);
      }
    });

    // 3. Contest settlements (you won/placed in a contest)
    // contestSettled events are user-specific
    const unsubContestSettled = subscribe('contestSettled', (data: { userId?: string }) => {
      // Only increment if this settlement is for the current user
      if (!data.userId || (user?.id && data.userId === user.id)) {
        setUnreadCount(prev => prev + 1);
      }
    });

    return () => {
      unsubPortfolio();
      unsubTrade();
      unsubContestSettled();
    };
  }, [subscribe, user?.id]);

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
