/**
 * Shared types for background jobs and admin streaming
 */

/**
 * Log event structure for admin streaming
 */
export interface LogEvent {
  type: 'info' | 'warning' | 'error' | 'progress' | 'complete' | 'debug';
  timestamp: string;
  message: string;
  data?: any;
}

/**
 * Progress callback function for jobs to emit real-time logs
 */
export type ProgressCallback = (event: LogEvent) => void;

/**
 * Result of a job execution
 */
export interface JobResult {
  requestCount: number;
  recordsProcessed: number;
  errorCount: number;
}
