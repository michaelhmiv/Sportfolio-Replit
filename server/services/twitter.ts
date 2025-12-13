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
      console.error("[Twitter] Failed to post tweet:", error.message, error);
      
      // Handle specific Twitter API errors - twitter-api-v2 uses different error formats
      let errorMessage = error.message;
      const statusCode = error.code || error.statusCode || (error.data?.status);
      
      if (statusCode === 403 || error.message?.includes('403') || error.message?.includes('Forbidden')) {
        errorMessage = "Access forbidden - ensure your Twitter Developer App has 'Read and Write' permissions enabled, and that you've regenerated your Access Token & Secret AFTER enabling those permissions. Also verify the app is using OAuth 1.0a User Context.";
      } else if (statusCode === 429 || error.message?.includes('429')) {
        errorMessage = "Rate limit exceeded - try again later";
      } else if (statusCode === 401 || error.message?.includes('401') || error.message?.includes('Unauthorized')) {
        errorMessage = "Authentication failed - check that all 4 Twitter API credentials (API Key, API Secret, Access Token, Access Token Secret) are correct and haven't expired";
      } else if (statusCode === 400 || error.message?.includes('400')) {
        errorMessage = `Bad request: ${error.message}. This often means incorrect OAuth credentials or missing 'Read and Write' app permissions.`;
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
  async verifyCredentials(): Promise<{ valid: boolean; username?: string; error?: string; details?: any }> {
    if (!this.isReady() || !this.client) {
      return {
        valid: false,
        error: "Twitter service not configured",
      };
    }

    try {
      const result = await this.client.v2.me();
      console.log("[Twitter] Credentials verified successfully for @" + result.data.username);
      return {
        valid: true,
        username: result.data.username,
      };
    } catch (error: any) {
      // Log full error details for debugging
      console.error("[Twitter] Credential verification failed:", {
        message: error.message,
        code: error.code,
        statusCode: error.statusCode,
        data: error.data,
        errors: error.errors,
        rateLimit: error.rateLimit,
        fullError: JSON.stringify(error, null, 2),
      });
      
      // Build detailed error message
      let errorMessage = error.message;
      const errorDetails = {
        code: error.code,
        statusCode: error.statusCode,
        data: error.data,
        errors: error.errors,
      };
      
      // Check for common Twitter API v2 issues
      if (error.message?.includes('Request') || error.code === 32 || error.code === 89) {
        errorMessage = `OAuth error: ${error.message}. This typically means your Access Token was not generated with the correct permissions. Go to your Twitter Developer Portal, ensure your app has 'Read and Write' permissions under 'User authentication settings', then regenerate your Access Token and Secret.`;
      } else if (error.statusCode === 401 || error.code === 401) {
        errorMessage = `Authentication failed (401): ${error.message}. Your API credentials may be incorrect or expired.`;
      } else if (error.statusCode === 403 || error.code === 403) {
        errorMessage = `Forbidden (403): ${error.message}. Your app may not have the required permissions enabled.`;
      }
      
      return {
        valid: false,
        error: errorMessage,
        details: errorDetails,
      };
    }
  }
}

// Export singleton instance
export const twitterService = new TwitterService();
