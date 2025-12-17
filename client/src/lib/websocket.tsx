import { createContext, useContext, useEffect, useRef, useState } from "react";
import { queryClient } from "@/lib/queryClient";
import { 
  debouncedInvalidatePortfolio,
  debouncedInvalidateVesting,
  debouncedInvalidatePlayer, 
  debouncedInvalidateMarketActivity,
  debouncedInvalidateContests 
} from "@/lib/cache-invalidation";

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
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.host;
    const ws = new WebSocket(`${protocol}//${host}/ws`);

    ws.onopen = () => {
      console.log('[WebSocket] Connected to live updates');
      setIsConnected(true);
    };

    ws.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);

        const handlers = handlersRef.current.get(message.type);
        if (handlers) {
          handlers.forEach(handler => handler(message));
        }

        switch (message.type) {
          case 'portfolio':
            debouncedInvalidatePortfolio();
            break;

          case 'vesting':
            debouncedInvalidateVesting();
            break;

          case 'trade':
          case 'orderBook':
            debouncedInvalidatePlayer(message.playerId);
            break;

          case 'liveStats':
            if (message.gameId) {
              queryClient.invalidateQueries({ queryKey: ['/api/games'] });
              queryClient.invalidateQueries({ queryKey: ['/api/game', message.gameId] });
            }
            break;

          case 'contestUpdate':
            debouncedInvalidateContests(message.contestId);
            break;

          case 'marketActivity':
            debouncedInvalidateMarketActivity();
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
