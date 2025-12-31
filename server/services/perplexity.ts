/**
 * Perplexity AI Service
 * 
 * Uses Perplexity's API to get real-time NBA player news and summaries.
 */

interface PerplexityResponse {
  success: boolean;
  content?: string;
  citations?: string[];
  error?: string;
}

class PerplexityService {
  private baseUrl = "https://api.perplexity.ai/chat/completions";

  constructor() {
    // Log initial status but don't cache the API key
    if (this.getApiKey()) {
      console.log("[Perplexity] Service initialized successfully");
    } else {
      console.log("[Perplexity] Not configured at startup - will check API key on each request");
    }
  }

  /**
   * Get API key fresh from environment (supports runtime secret injection in production)
   */
  private getApiKey(): string | null {
    return process.env.PERPLEXITY_API_KEY || null;
  }

  /**
   * Check if the Perplexity service is properly configured
   */
  isReady(): boolean {
    return !!this.getApiKey();
  }

  /**
   * Get current configuration status
   */
  getStatus(): { configured: boolean } {
    return {
      configured: this.isReady(),
    };
  }

  /**
   * Get player news summaries from Perplexity
   */
  async getPlayerSummaries(playerNames: string[], promptTemplate: string): Promise<PerplexityResponse> {
    const apiKey = this.getApiKey();
    if (!apiKey) {
      return {
        success: false,
        error: "Perplexity service not configured. Please add PERPLEXITY_API_KEY.",
      };
    }

    if (!playerNames || playerNames.length === 0) {
      return {
        success: false,
        error: "No player names provided",
      };
    }

    // Build the prompt with player names
    const playersString = playerNames.join(", ");
    const prompt = promptTemplate.replace("{players}", playersString);

    try {
      const response = await fetch(this.baseUrl, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "sonar-pro",
          messages: [
            {
              role: "system",
              content: "You are a concise sports reporter. Provide brief, factual summaries of NBA player performance and news. Keep responses short and suitable for Twitter posts."
            },
            {
              role: "user",
              content: prompt
            }
          ],
          max_tokens: 300,
          temperature: 0.2,
          search_recency_filter: "week", // Focus on recent news
          return_images: false,
          return_related_questions: false,
        }),
      });

      if (!response.ok) {
        const errorData = await response.text();
        console.error("[Perplexity] API error:", response.status, errorData);
        return {
          success: false,
          error: `API error: ${response.status} - ${errorData}`,
        };
      }

      const data = await response.json();

      if (!data.choices || data.choices.length === 0) {
        return {
          success: false,
          error: "No response from Perplexity",
        };
      }

      const content = data.choices[0]?.message?.content || "";
      const citations = data.citations || [];

      console.log("[Perplexity] Got summary for players:", playerNames.join(", "));

      return {
        success: true,
        content: content.trim(),
        citations,
      };
    } catch (error: any) {
      console.error("[Perplexity] Request failed:", error.message);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Draft a tweet based on provided context/prompt
   */
  async draftTweet(prompt: string): Promise<PerplexityResponse> {
    const apiKey = this.getApiKey();
    if (!apiKey) {
      return {
        success: false,
        error: "Perplexity service not configured. Please add PERPLEXITY_API_KEY.",
      };
    }

    try {
      const response = await fetch(this.baseUrl, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "sonar-pro",
          messages: [
            {
              role: "system",
              content: "You are a social media manager for Sportfolio, a fantasy sports stock market platform. Your job is to draft engaging tweets about NBA player performance and market activity. Keep tweets concise, use relevant stats, and make them shareable."
            },
            {
              role: "user",
              content: prompt
            }
          ],
          max_tokens: 400,
          temperature: 0.7,
          search_recency_filter: "day",
          return_images: false,
          return_related_questions: false,
        }),
      });

      if (!response.ok) {
        const errorData = await response.text();
        console.error("[Perplexity] Draft tweet API error:", response.status, errorData);
        return {
          success: false,
          error: `API error: ${response.status} - ${errorData}`,
        };
      }

      const data = await response.json();

      if (!data.choices || data.choices.length === 0) {
        return {
          success: false,
          error: "No response from Perplexity",
        };
      }

      const content = data.choices[0]?.message?.content || "";
      console.log("[Perplexity] Drafted tweet successfully");

      return {
        success: true,
        content: content.trim(),
      };
    } catch (error: any) {
      console.error("[Perplexity] Draft tweet request failed:", error.message);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Fetch breaking sports news (for News Hub)
   */
  async fetchBreakingNews(prompt: string): Promise<PerplexityResponse> {
    const apiKey = this.getApiKey();
    if (!apiKey) {
      return {
        success: false,
        error: "Perplexity service not configured. Please add PERPLEXITY_API_KEY.",
      };
    }

    try {
      console.log("[Perplexity] Fetching breaking sports news...");

      const response = await fetch(this.baseUrl, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "sonar-pro",
          messages: [
            {
              role: "system",
              content: "You are a breaking news sports reporter for NBA and NFL. Provide factual, concise news updates about player injuries, trades, signings, and major performances. Format your response as: [Headline] - [Brief 1-2 sentence summary]."
            },
            {
              role: "user",
              content: prompt
            }
          ],
          max_tokens: 400,
          temperature: 0.1, // Low temperature for factual news
          search_recency_filter: "hour", // Focus on very recent news
          return_images: false,
          return_related_questions: false,
        }),
      });

      if (!response.ok) {
        const errorData = await response.text();
        console.error("[Perplexity] Breaking news API error:", response.status, errorData);
        return {
          success: false,
          error: `API error: ${response.status} - ${errorData}`,
        };
      }

      const data = await response.json();

      if (!data.choices || data.choices.length === 0) {
        return {
          success: false,
          error: "No response from Perplexity",
        };
      }

      const content = data.choices[0]?.message?.content || "";
      const citations = data.citations || [];
      console.log("[Perplexity] Fetched breaking news successfully");

      return {
        success: true,
        content: content.trim(),
        citations,
      };
    } catch (error: any) {
      console.error("[Perplexity] Breaking news request failed:", error.message);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Test the API connection
   */
  async testConnection(): Promise<{ valid: boolean; error?: string }> {
    if (!this.isReady()) {
      return {
        valid: false,
        error: "Perplexity service not configured",
      };
    }

    try {
      const result = await this.getPlayerSummaries(
        ["LeBron James"],
        "In one sentence, what was LeBron James' most recent game performance?"
      );

      return {
        valid: result.success,
        error: result.error,
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
export const perplexityService = new PerplexityService();
