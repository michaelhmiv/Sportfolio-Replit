import { createContext, useContext, useEffect, useRef, useState } from "react";
import { queryClient } from "@/lib/queryClient";
import { invalidatePortfolioQueries } from "@/lib/cache-invalidation";

interface WebSocketContextValue {
  isConnected: boolean;
  subscribe: (eventType: string, handler: (data: any) => void) => () => void;
}

const WebSocketContext = createContext<WebSocketContextValue | null>(null);

export function WebSocketProvider({ children }: { children: React.ReactNode }) {
  const [isConnected, setIsConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const handlersRef = useRef<Map<string, Set<(data: any) => void>>>(new Map());
  const reconnectTimeoutRef = useRef<NodeJS.Timeout>();

  const connect = () => {
    // Use the same host and port as the current page (backend serves WS on same port)
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.host; // includes port in development
    const ws = new WebSocket(`${protocol}//${host}/ws`);

    ws.onopen = () => {
      console.log('[WebSocket] Connected to live updates');
      setIsConnected(true);
    };

    ws.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);
        console.log('[WebSocket] Received:', message);

        // Call registered handlers for this event type
        const handlers = handlersRef.current.get(message.type);
        if (handlers) {
          handlers.forEach(handler => handler(message));
        }

        // Global cache invalidation based on event type
        switch (message.type) {
          case 'portfolio':
            // Invalidate all portfolio-related queries (auto-refetches active queries)
            invalidatePortfolioQueries();
            break;

          case 'vesting':
            // Invalidate vesting data and portfolio (vesting affects holdings)
            Promise.all([
              queryClient.invalidateQueries({ queryKey: ['/api/vesting/status'] }),
              queryClient.invalidateQueries({ queryKey: ['/api/dashboard'] }),
              message.userId 
                ? queryClient.invalidateQueries({ queryKey: [`/api/user/${message.userId}/profile`] })
                : Promise.resolve(),
            ]);
            break;

          case 'trade':
          case 'orderBook':
            // Invalidate player-specific data
            if (message.playerId) {
              queryClient.invalidateQueries({ queryKey: ['/api/player', message.playerId] });
              queryClient.invalidateQueries({ queryKey: ['/api/player', message.playerId, 'orders'] });
              queryClient.invalidateQueries({ queryKey: ['/api/player', message.playerId, 'trades'] });
            }
            // Invalidate marketplace
            queryClient.invalidateQueries({ queryKey: ['/api/players'] });
            break;

          case 'liveStats':
            // Invalidate game and player stats
            if (message.gameId) {
              queryClient.invalidateQueries({ queryKey: ['/api/games'] });
              queryClient.invalidateQueries({ queryKey: ['/api/game', message.gameId] });
            }
            break;

          case 'contestUpdate':
            // Invalidate contest data
            if (message.contestId) {
              queryClient.invalidateQueries({ queryKey: ['/api/contest', message.contestId] });
              queryClient.invalidateQueries({ queryKey: ['/api/contest', message.contestId, 'leaderboard'] });
            }
            queryClient.invalidateQueries({ queryKey: ['/api/contests'] });
            break;

          case 'marketActivity':
            // Invalidate market activity feed
            queryClient.invalidateQueries({ queryKey: ['/api/market/activity'] });
            break;
        }
      } catch (error) {
        console.error('[WebSocket] Failed to parse message:', error);
      }
    };

    ws.onerror = (error) => {
      console.error('[WebSocket] Error:', error);
    };

    ws.onclose = () => {
      console.log('[WebSocket] Disconnected');
      setIsConnected(false);
      wsRef.current = null;

      // Attempt reconnection after 3 seconds
      reconnectTimeoutRef.current = setTimeout(() => {
        console.log('[WebSocket] Attempting to reconnect...');
        connect();
      }, 3000);
    };

    wsRef.current = ws;
  };

  useEffect(() => {
    connect();

    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, []);

  const subscribe = (eventType: string, handler: (data: any) => void) => {
    if (!handlersRef.current.has(eventType)) {
      handlersRef.current.set(eventType, new Set());
    }
    handlersRef.current.get(eventType)!.add(handler);

    // Return unsubscribe function
    return () => {
      const handlers = handlersRef.current.get(eventType);
      if (handlers) {
        handlers.delete(handler);
        if (handlers.size === 0) {
          handlersRef.current.delete(eventType);
        }
      }
    };
  };

  return (
    <WebSocketContext.Provider value={{ isConnected, subscribe }}>
      {children}
    </WebSocketContext.Provider>
  );
}

export function useWebSocket() {
  const context = useContext(WebSocketContext);
  if (!context) {
    throw new Error('useWebSocket must be used within WebSocketProvider');
  }
  return context;
}
