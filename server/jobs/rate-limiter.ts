/**
 * MySportsFeeds Rate Limiter
 * 
 * Implements token bucket algorithm to enforce 200 requests per 5 minutes limit.
 * Provides exponential backoff retry logic for failed requests.
 */

interface TokenBucket {
  tokens: number;
  lastRefill: number;
  maxTokens: number;
  refillRate: number; // tokens per millisecond
}

export class MySportsFeedsRateLimiter {
  private bucket: TokenBucket;
  private queue: Array<{ resolve: () => void; reject: (error: Error) => void }> = [];
  private processing = false;

  constructor(
    private maxRequests: number = 150,
    private windowMs: number = 5 * 60 * 1000 // 5 minutes
  ) {
    this.bucket = {
      tokens: maxRequests,
      lastRefill: Date.now(),
      maxTokens: maxRequests,
      refillRate: maxRequests / windowMs,
    };
  }

  /**
   * Wait for a token to become available
   */
  async acquire(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.queue.push({ resolve, reject });
      this.processQueue();
    });
  }

  private processQueue() {
    if (this.processing || this.queue.length === 0) {
      return;
    }

    this.processing = true;
    this.refillBucket();

    if (this.bucket.tokens >= 1) {
      this.bucket.tokens -= 1;
      const { resolve } = this.queue.shift()!;
      resolve();
      this.processing = false;

      // Process next item in queue
      if (this.queue.length > 0) {
        this.processQueue();
      }
    } else {
      // Wait until next token is available
      const timeToNextToken = (1 - this.bucket.tokens) / this.bucket.refillRate;
      setTimeout(() => {
        this.processing = false;
        this.processQueue();
      }, timeToNextToken);
    }
  }

  private refillBucket() {
    const now = Date.now();
    const timePassed = now - this.bucket.lastRefill;
    const tokensToAdd = timePassed * this.bucket.refillRate;

    this.bucket.tokens = Math.min(
      this.bucket.maxTokens,
      this.bucket.tokens + tokensToAdd
    );
    this.bucket.lastRefill = now;
  }

  /**
   * Execute a function with rate limiting and exponential backoff retry
   */
  async executeWithRetry<T>(
    fn: () => Promise<T>,
    maxAttempts: number = 3,
    baseDelay: number = 5000
  ): Promise<T> {
    let lastError: Error | undefined;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        // Wait for rate limit token
        await this.acquire();

        // Execute the function
        const result = await fn();
        return result;
      } catch (error: any) {
        lastError = error;

        // Check if we should retry
        const shouldRetry =
          error.response?.status === 429 || // Too Many Requests
          error.response?.status >= 500 || // Server errors
          error.code === 'ECONNRESET' || // Connection issues
          error.code === 'ETIMEDOUT';

        if (!shouldRetry || attempt === maxAttempts) {
          throw error;
        }

        // Exponential backoff with jitter
        const delay = baseDelay * Math.pow(2, attempt - 1);
        const jitter = Math.random() * 1000;
        const totalDelay = Math.min(delay + jitter, 60000); // Max 60 seconds

        console.warn(
          `MySportsFeeds request failed (attempt ${attempt}/${maxAttempts}), retrying in ${Math.round(totalDelay)}ms...`,
          error.message
        );

        await new Promise(resolve => setTimeout(resolve, totalDelay));
      }
    }

    throw lastError || new Error('Request failed after all retry attempts');
  }

  /**
   * Get current rate limit status
   */
  getStatus(): { availableTokens: number; queueLength: number } {
    this.refillBucket();
    return {
      availableTokens: Math.floor(this.bucket.tokens),
      queueLength: this.queue.length,
    };
  }
}

// Global rate limiter instance
export const mysportsfeedsRateLimiter = new MySportsFeedsRateLimiter();

/**
 * Ball Don't Lie Rate Limiter
 * 
 * Uses the same token bucket algorithm for the Ball Don't Lie NFL API.
 * Conservative defaults: 60 requests per minute (1 per second average)
 * Adjust based on your actual API tier limits.
 */
export class BallDontLieRateLimiter extends MySportsFeedsRateLimiter {
  constructor() {
    // 60 requests per minute = 1 request per second average
    super(60, 60 * 1000);
  }
}

// Global Ball Don't Lie rate limiter instance
export const balldontlieRateLimiter = new BallDontLieRateLimiter();
