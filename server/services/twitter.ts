/**
 * Twitter/X Service
 * 
 * Handles posting tweets to X using the v2 API.
 */

import { TwitterApi } from "twitter-api-v2";

interface TwitterConfig {
  apiKey: string;
  apiSecret: string;
  accessToken: string;
  accessTokenSecret: string;
}

interface TweetResult {
  success: boolean;
  tweetId?: string;
  error?: string;
}

class TwitterService {
  private client: TwitterApi | null = null;
  private isConfigured = false;

  constructor() {
    this.initialize();
  }

  private initialize() {
    const apiKey = process.env.TWITTER_API_KEY;
    const apiSecret = process.env.TWITTER_API_SECRET;
    const accessToken = process.env.TWITTER_ACCESS_TOKEN;
    const accessTokenSecret = process.env.TWITTER_ACCESS_TOKEN_SECRET;

    if (apiKey && apiSecret && accessToken && accessTokenSecret) {
      try {
        this.client = new TwitterApi({
          appKey: apiKey,
          appSecret: apiSecret,
          accessToken: accessToken,
          accessSecret: accessTokenSecret,
        });
        this.isConfigured = true;
        console.log("[Twitter] Service initialized successfully");
      } catch (error: any) {
        console.error("[Twitter] Failed to initialize:", error.message);
        this.isConfigured = false;
      }
    } else {
      console.log("[Twitter] Not configured - missing API credentials");
      this.isConfigured = false;
    }
  }

  /**
   * Check if the Twitter service is properly configured
   */
  isReady(): boolean {
    return this.isConfigured && this.client !== null;
  }

  /**
   * Get current configuration status
   */
  getStatus(): { configured: boolean; hasApiKey: boolean; hasAccessToken: boolean } {
    return {
      configured: this.isConfigured,
      hasApiKey: !!process.env.TWITTER_API_KEY,
      hasAccessToken: !!process.env.TWITTER_ACCESS_TOKEN,
    };
  }

  /**
   * Post a tweet to X
   */
  async postTweet(content: string): Promise<TweetResult> {
    if (!this.isReady() || !this.client) {
      return {
        success: false,
        error: "Twitter service not configured. Please add API credentials.",
      };
    }

    // Validate content length (X allows up to 25,000 chars for paid accounts)
    if (!content || content.trim().length === 0) {
      return {
        success: false,
        error: "Tweet content cannot be empty",
      };
    }

    try {
      const rwClient = this.client.readWrite;
      const result = await rwClient.v2.tweet(content);

      console.log("[Twitter] Tweet posted successfully:", result.data.id);
      
      return {
        success: true,
        tweetId: result.data.id,
      };
    } catch (error: any) {
      console.error("[Twitter] Failed to post tweet:", error.message);
      
      // Handle specific Twitter API errors
      let errorMessage = error.message;
      if (error.code === 403) {
        errorMessage = "Access forbidden - check API permissions";
      } else if (error.code === 429) {
        errorMessage = "Rate limit exceeded - try again later";
      } else if (error.code === 401) {
        errorMessage = "Authentication failed - check API credentials";
      }

      return {
        success: false,
        error: errorMessage,
      };
    }
  }

  /**
   * Verify credentials work correctly
   */
  async verifyCredentials(): Promise<{ valid: boolean; username?: string; error?: string }> {
    if (!this.isReady() || !this.client) {
      return {
        valid: false,
        error: "Twitter service not configured",
      };
    }

    try {
      const result = await this.client.v2.me();
      return {
        valid: true,
        username: result.data.username,
      };
    } catch (error: any) {
      return {
        valid: false,
        error: error.message,
      };
    }
  }
}

// Export singleton instance
export const twitterService = new TwitterService();
