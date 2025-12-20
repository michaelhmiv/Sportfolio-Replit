import { useWebSocket } from "@/lib/websocket";
import { Wifi, WifiOff, Loader2 } from "lucide-react";

export function ConnectionStatus() {
  const { connectionState, reconnectAttempts } = useWebSocket();
  
  // Don't show anything when connected
  if (connectionState === 'connected') {
    return null;
  }
  
  return (
    <div className="fixed bottom-4 right-4 z-50 flex items-center gap-2 bg-background/95 backdrop-blur border rounded-md px-3 py-2 shadow-lg" data-testid="connection-status">
      {connectionState === 'connecting' ? (
        <>
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          <span className="text-sm text-muted-foreground">
            Connecting{reconnectAttempts > 0 ? ` (attempt ${reconnectAttempts})` : '...'}
          </span>
        </>
      ) : connectionState === 'disconnected' || connectionState === 'error' ? (
        <>
          <WifiOff className="h-4 w-4 text-destructive" />
          <span className="text-sm text-muted-foreground">
            Reconnecting{reconnectAttempts > 0 ? ` (attempt ${reconnectAttempts})` : '...'}
          </span>
        </>
      ) : null}
    </div>
  );
}
