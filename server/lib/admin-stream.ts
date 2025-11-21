import { EventEmitter } from 'events';
import type { Response } from 'express';

// Event types for structured logging
export interface LogEvent {
  type: 'info' | 'warning' | 'error' | 'progress' | 'complete' | 'debug';
  timestamp: string;
  message: string;
  data?: any;
}

export interface ProgressEvent extends LogEvent {
  type: 'progress';
  data: {
    current: number;
    total: number;
    percentage: number;
    stats?: Record<string, number>;
  };
}

export interface CompleteEvent extends LogEvent {
  type: 'complete';
  data: {
    success: boolean;
    summary: Record<string, any>;
  };
}

// Global event emitter for admin operations
class AdminStreamManager extends EventEmitter {
  private activeStreams = new Map<string, Set<Response>>();

  // Register a new SSE client for an operation
  registerClient(operationId: string, res: Response) {
    if (!this.activeStreams.has(operationId)) {
      this.activeStreams.set(operationId, new Set());
    }
    this.activeStreams.get(operationId)!.add(res);

    // Clean up on client disconnect
    res.on('close', () => {
      this.unregisterClient(operationId, res);
    });
  }

  // Remove a client from an operation
  unregisterClient(operationId: string, res: Response) {
    const clients = this.activeStreams.get(operationId);
    if (clients) {
      clients.delete(res);
      if (clients.size === 0) {
        this.activeStreams.delete(operationId);
      }
    }
  }

  // Emit a log event to all clients watching an operation
  emitLog(operationId: string, event: LogEvent) {
    const clients = this.activeStreams.get(operationId);
    if (!clients || clients.size === 0) {
      // Still log to console even if no clients are watching
      console.log(`[${operationId}] ${event.type.toUpperCase()}: ${event.message}`);
      return;
    }

    const data = JSON.stringify(event);
    clients.forEach(res => {
      try {
        res.write(`data: ${data}\n\n`);
      } catch (error) {
        // Client disconnected, will be cleaned up by 'close' event
        console.error(`[AdminStream] Error writing to client for ${operationId}:`, error);
      }
    });
  }

  // Get count of active clients for an operation
  getClientCount(operationId: string): number {
    return this.activeStreams.get(operationId)?.size || 0;
  }
}

// Singleton instance
export const adminStreamManager = new AdminStreamManager();

// Progress callback type for jobs
export type ProgressCallback = (event: LogEvent) => void;

// Helper to create a progress callback for an operation
export function createProgressCallback(operationId: string): ProgressCallback {
  return (event: LogEvent) => {
    // Add timestamp if not present
    if (!event.timestamp) {
      event.timestamp = new Date().toISOString();
    }
    adminStreamManager.emitLog(operationId, event);
  };
}

// Convenience functions for emitting different event types
export function emitInfo(operationId: string, message: string, data?: any) {
  adminStreamManager.emitLog(operationId, {
    type: 'info',
    timestamp: new Date().toISOString(),
    message,
    data,
  });
}

export function emitWarning(operationId: string, message: string, data?: any) {
  adminStreamManager.emitLog(operationId, {
    type: 'warning',
    timestamp: new Date().toISOString(),
    message,
    data,
  });
}

export function emitError(operationId: string, message: string, error?: any) {
  const errorData: any = {};
  
  if (error) {
    errorData.message = error.message || String(error);
    if (error.stack) {
      errorData.stack = error.stack;
    }
    if (error.code) {
      errorData.code = error.code;
    }
  }

  adminStreamManager.emitLog(operationId, {
    type: 'error',
    timestamp: new Date().toISOString(),
    message,
    data: errorData,
  });
}

export function emitDebug(operationId: string, message: string, data?: any) {
  adminStreamManager.emitLog(operationId, {
    type: 'debug',
    timestamp: new Date().toISOString(),
    message,
    data,
  });
}

export function emitProgress(
  operationId: string,
  message: string,
  current: number,
  total: number,
  stats?: Record<string, number>
) {
  const percentage = total > 0 ? Math.round((current / total) * 100) : 0;
  
  adminStreamManager.emitLog(operationId, {
    type: 'progress',
    timestamp: new Date().toISOString(),
    message,
    data: {
      current,
      total,
      percentage,
      stats,
    },
  });
}

export function emitComplete(
  operationId: string,
  message: string,
  success: boolean,
  summary: Record<string, any>
) {
  adminStreamManager.emitLog(operationId, {
    type: 'complete',
    timestamp: new Date().toISOString(),
    message,
    data: {
      success,
      summary,
    },
  });
}
