import { createContext, useContext, useEffect, useRef, useState } from "react";
import { queryClient } from "@/lib/queryClient";
import { 
  debouncedInvalidatePortfolio,
  debouncedInvalidateVesting,
  debouncedInvalidatePlayer, 
  debouncedInvalidateMarketActivity,
  debouncedInvalidateContests 
} from "@/lib/cache-invalidation";

function debugLog(stage: string, message: string, data?: any) {
  const elapsed = performance.now().toFixed(0);
  console.log(`[WS ${elapsed}ms] ${stage}: ${message}`, data || '');
}

interface WebSocketContextValue {
  isConnected: boolean;
  connectionState: 'connecting' | 'connected' | 'disconnected' | 'error';
  reconnectAttempts: number;
  subscribe: (eventType: string, handler: (data: any) => void) => () => void;
}

const WebSocketContext = createContext<WebSocketContextValue | null>(null);

export function WebSocketProvider({ children }: { children: React.ReactNode }) {
  const [isConnected, setIsConnected] = useState(false);
  const [connectionState, setConnectionState] = useState<'connecting' | 'connected' | 'disconnected' | 'error'>('connecting');
  const [reconnectAttempts, setReconnectAttempts] = useState(0);
  const wsRef = useRef<WebSocket | null>(null);
  const handlersRef = useRef<Map<string, Set<(data: any) => void>>>(new Map());
  const reconnectTimeoutRef = useRef<NodeJS.Timeout>();
  const reconnectAttemptsRef = useRef(0);

  const connect = () => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.host;
    const wsUrl = `${protocol}//${host}/ws`;
    
    debugLog('CONNECT', `Attempting to connect to ${wsUrl}`, { attempt: reconnectAttemptsRef.current + 1 });
    setConnectionState('connecting');
    
    try {
      const ws = new WebSocket(wsUrl);

      ws.onopen = () => {
        debugLog('OPEN', 'WebSocket connected successfully');
        setIsConnected(true);
        setConnectionState('connected');
        reconnectAttemptsRef.current = 0;
        setReconnectAttempts(0);
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
          debugLog('MESSAGE_ERROR', 'Failed to parse message', { error: (error as Error).message });
        }
      };

      ws.onerror = (error) => {
        debugLog('ERROR', 'WebSocket error occurred', { error });
        setConnectionState('error');
      };

      ws.onclose = (event) => {
        debugLog('CLOSE', 'WebSocket disconnected', { 
          code: event.code, 
          reason: event.reason,
          wasClean: event.wasClean 
        });
        setIsConnected(false);
        setConnectionState('disconnected');
        wsRef.current = null;

        reconnectAttemptsRef.current++;
        setReconnectAttempts(reconnectAttemptsRef.current);
        
        const delay = Math.min(3000 * Math.pow(1.5, reconnectAttemptsRef.current - 1), 30000);
        debugLog('RECONNECT', `Will attempt reconnect in ${delay}ms`, { attempt: reconnectAttemptsRef.current });
        
        reconnectTimeoutRef.current = setTimeout(() => {
          debugLog('RECONNECT', 'Attempting to reconnect...');
          connect();
        }, delay);
      };

      wsRef.current = ws;
    } catch (error) {
      debugLog('CONNECT_ERROR', 'Failed to create WebSocket', { error: (error as Error).message });
      setConnectionState('error');
      
      const delay = Math.min(3000 * Math.pow(1.5, reconnectAttemptsRef.current), 30000);
      reconnectTimeoutRef.current = setTimeout(() => {
        reconnectAttemptsRef.current++;
        setReconnectAttempts(reconnectAttemptsRef.current);
        connect();
      }, delay);
    }
  };

  useEffect(() => {
    debugLog('INIT', 'WebSocketProvider mounted, initiating connection');
    connect();

    return () => {
      debugLog('CLEANUP', 'WebSocketProvider unmounting');
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
    <WebSocketContext.Provider value={{ isConnected, connectionState, reconnectAttempts, subscribe }}>
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
