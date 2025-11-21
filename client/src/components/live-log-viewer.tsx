import { useState, useEffect, useRef } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { 
  ChevronDown, 
  ChevronUp, 
  CheckCircle2, 
  XCircle, 
  AlertTriangle, 
  Info, 
  Terminal,
  RefreshCw 
} from "lucide-react";
import { cn } from "@/lib/utils";

interface LogEvent {
  type: 'info' | 'warning' | 'error' | 'progress' | 'complete' | 'debug';
  timestamp: string;
  message: string;
  data?: any;
}

interface LiveLogViewerProps {
  operationId: string;
  title: string;
  description?: string;
  autoOpen?: boolean;
  onComplete?: () => void;
}

export function LiveLogViewer({ 
  operationId, 
  title, 
  description,
  autoOpen = true,
  onComplete 
}: LiveLogViewerProps) {
  const [isOpen, setIsOpen] = useState(autoOpen);
  const [logs, setLogs] = useState<LogEvent[]>([]);
  const [status, setStatus] = useState<'connecting' | 'running' | 'success' | 'error' | 'disconnected'>('connecting');
  const [progress, setProgress] = useState({ current: 0, total: 0, percentage: 0 });
  const [stats, setStats] = useState<Record<string, number>>({});
  const scrollRef = useRef<HTMLDivElement>(null);
  const eventSourceRef = useRef<EventSource | null>(null);
  const [autoScroll, setAutoScroll] = useState(true);

  useEffect(() => {
    // Connect to SSE stream
    const eventSource = new EventSource(`/api/admin/stream/${operationId}`);
    eventSourceRef.current = eventSource;

    eventSource.onopen = () => {
      console.log('[LiveLogViewer] Connected to stream:', operationId);
      setStatus('running');
    };

    eventSource.onmessage = (event) => {
      try {
        const logEvent: LogEvent = JSON.parse(event.data);
        
        setLogs(prev => [...prev, logEvent]);
        
        // Update status based on event type
        if (logEvent.type === 'complete') {
          setStatus(logEvent.data?.success ? 'success' : 'error');
          if (onComplete) {
            onComplete();
          }
          // Don't close the connection immediately - keep it for review
          setTimeout(() => {
            eventSource.close();
            setStatus('disconnected');
          }, 1000);
        } else if (logEvent.type === 'error') {
          // Don't change status to error unless it's fatal
          // Individual errors might not mean the whole operation failed
        } else if (logEvent.type === 'progress' && logEvent.data) {
          setProgress({
            current: logEvent.data.current || 0,
            total: logEvent.data.total || 0,
            percentage: logEvent.data.percentage || 0,
          });
          if (logEvent.data.stats) {
            setStats(logEvent.data.stats);
          }
        }
      } catch (error) {
        console.error('[LiveLogViewer] Error parsing event:', error);
      }
    };

    eventSource.onerror = (error) => {
      console.error('[LiveLogViewer] Connection error:', error);
      setStatus('error');
      eventSource.close();
    };

    // Cleanup on unmount
    return () => {
      eventSource.close();
    };
  }, [operationId, onComplete]);

  // Auto-scroll to bottom when new logs arrive
  useEffect(() => {
    if (autoScroll && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [logs, autoScroll]);

  const getStatusIcon = () => {
    switch (status) {
      case 'connecting':
        return <RefreshCw className="w-4 h-4 animate-spin text-blue-500" />;
      case 'running':
        return <RefreshCw className="w-4 h-4 animate-spin text-blue-500" />;
      case 'success':
        return <CheckCircle2 className="w-4 h-4 text-green-500" />;
      case 'error':
        return <XCircle className="w-4 h-4 text-destructive" />;
      case 'disconnected':
        return <Info className="w-4 h-4 text-muted-foreground" />;
    }
  };

  const getStatusBadge = () => {
    switch (status) {
      case 'connecting':
        return <Badge variant="outline" className="gap-1">Connecting...</Badge>;
      case 'running':
        return <Badge variant="outline" className="gap-1 bg-blue-500/10 text-blue-600 dark:text-blue-400">Running</Badge>;
      case 'success':
        return <Badge variant="outline" className="gap-1 bg-green-500/10 text-green-600 dark:text-green-400">Completed</Badge>;
      case 'error':
        return <Badge variant="destructive" className="gap-1">Failed</Badge>;
      case 'disconnected':
        return <Badge variant="outline" className="gap-1">Disconnected</Badge>;
    }
  };

  const getLogIcon = (type: LogEvent['type']) => {
    switch (type) {
      case 'info':
        return <Info className="w-3 h-3 text-blue-500 flex-shrink-0" />;
      case 'warning':
        return <AlertTriangle className="w-3 h-3 text-yellow-500 flex-shrink-0" />;
      case 'error':
        return <XCircle className="w-3 h-3 text-destructive flex-shrink-0" />;
      case 'progress':
        return <RefreshCw className="w-3 h-3 text-blue-500 flex-shrink-0" />;
      case 'complete':
        return <CheckCircle2 className="w-3 h-3 text-green-500 flex-shrink-0" />;
      case 'debug':
        return <Terminal className="w-3 h-3 text-muted-foreground flex-shrink-0" />;
    }
  };

  const getLogTextColor = (type: LogEvent['type']) => {
    switch (type) {
      case 'info':
        return 'text-foreground';
      case 'warning':
        return 'text-yellow-600 dark:text-yellow-400';
      case 'error':
        return 'text-destructive';
      case 'progress':
        return 'text-blue-600 dark:text-blue-400';
      case 'complete':
        return 'text-green-600 dark:text-green-400';
      case 'debug':
        return 'text-muted-foreground';
    }
  };

  const formatTimestamp = (timestamp: string) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString('en-US', { hour12: false });
  };

  return (
    <Card className="border-2" data-testid={`live-log-viewer-${operationId}`}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {getStatusIcon()}
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                {title}
                {getStatusBadge()}
              </CardTitle>
              {description && (
                <CardDescription className="text-xs mt-1">{description}</CardDescription>
              )}
            </div>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setIsOpen(!isOpen)}
            data-testid="button-toggle-logs"
          >
            {isOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </Button>
        </div>

        {/* Progress bar */}
        {progress.total > 0 && isOpen && (
          <div className="space-y-2 mt-3">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>Progress: {progress.current}/{progress.total}</span>
              <span>{progress.percentage}%</span>
            </div>
            <Progress value={progress.percentage} className="h-2" />
            
            {/* Stats */}
            {Object.keys(stats).length > 0 && (
              <div className="flex flex-wrap gap-2 text-xs">
                {Object.entries(stats).map(([key, value]) => (
                  <Badge key={key} variant="outline" className="gap-1">
                    <span className="text-muted-foreground">{key}:</span>
                    <span>{value}</span>
                  </Badge>
                ))}
              </div>
            )}
          </div>
        )}
      </CardHeader>

      {isOpen && (
        <CardContent className="pt-0">
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <div className="flex items-center gap-1">
                <Terminal className="w-3 h-3" />
                <span>Live Logs ({logs.length} events)</span>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setAutoScroll(!autoScroll)}
                className="h-6 px-2 text-xs"
                data-testid="button-toggle-autoscroll"
              >
                Auto-scroll: {autoScroll ? 'ON' : 'OFF'}
              </Button>
            </div>
            
            <div 
              ref={scrollRef}
              className="bg-muted/30 rounded-md p-3 font-mono text-xs space-y-1 max-h-96 overflow-y-auto"
              data-testid="log-container"
            >
              {logs.length === 0 ? (
                <div className="text-muted-foreground">Waiting for logs...</div>
              ) : (
                logs.map((log, index) => (
                  <div 
                    key={index} 
                    className={cn("flex items-start gap-2 py-0.5", getLogTextColor(log.type))}
                    data-testid={`log-entry-${log.type}`}
                  >
                    <span className="text-muted-foreground text-[10px] w-16 flex-shrink-0">
                      {formatTimestamp(log.timestamp)}
                    </span>
                    {getLogIcon(log.type)}
                    <span className="break-all">{log.message}</span>
                  </div>
                ))
              )}
            </div>
          </div>
        </CardContent>
      )}
    </Card>
  );
}
