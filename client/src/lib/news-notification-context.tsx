import { createContext, useContext, useState, useEffect, ReactNode, useCallback } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { authenticatedFetch } from '@/lib/queryClient';

interface NewsNotificationContextType {
    unreadNewsCount: number;
    markNewsAsRead: () => Promise<void>;
    refreshUnreadCount: () => Promise<void>;
}

const NewsNotificationContext = createContext<NewsNotificationContextType | undefined>(undefined);

export function NewsNotificationProvider({ children }: { children: ReactNode }) {
    const [unreadNewsCount, setUnreadNewsCount] = useState(0);
    const { isAuthenticated } = useAuth();

    const refreshUnreadCount = useCallback(async () => {
        if (!isAuthenticated) {
            setUnreadNewsCount(0);
            return;
        }

        try {
            const response = await authenticatedFetch('/api/news/unread-count');
            if (response.ok) {
                const data = await response.json();
                setUnreadNewsCount(data.count || 0);
            }
        } catch (error) {
            console.error('[NewsNotification] Failed to fetch unread count:', error);
        }
    }, [isAuthenticated]);

    const markNewsAsRead = useCallback(async () => {
        if (!isAuthenticated) return;

        try {
            console.log('[NewsNotification] Calling mark-read API...');
            const response = await authenticatedFetch('/api/news/mark-read', {
                method: 'POST',
            });
            console.log('[NewsNotification] mark-read response:', response.status, response.ok);
            if (response.ok) {
                setUnreadNewsCount(0);
            }
        } catch (error) {
            console.error('[NewsNotification] Failed to mark as read:', error);
        }
    }, [isAuthenticated]);

    // Fetch unread count on mount and when auth state changes
    useEffect(() => {
        refreshUnreadCount();
    }, [refreshUnreadCount]);

    // Poll for updates every 5 minutes (in case a job runs while user is on site)
    useEffect(() => {
        if (!isAuthenticated) return;

        const interval = setInterval(refreshUnreadCount, 5 * 60 * 1000);
        return () => clearInterval(interval);
    }, [isAuthenticated, refreshUnreadCount]);

    return (
        <NewsNotificationContext.Provider value={{ unreadNewsCount, markNewsAsRead, refreshUnreadCount }}>
            {children}
        </NewsNotificationContext.Provider>
    );
}

export function useNewsNotifications() {
    const context = useContext(NewsNotificationContext);
    if (!context) {
        throw new Error('useNewsNotifications must be used within NewsNotificationProvider');
    }
    return context;
}
