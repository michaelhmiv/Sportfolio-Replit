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
  private apiKey: string | null = null;
  private isConfigured = false;
  private baseUrl = "https://api.perplexity.ai/chat/completions";

  constructor() {
    this.initialize();
  }

  private initialize() {
    this.apiKey = process.env.PERPLEXITY_API_KEY || null;
    this.isConfigured = !!this.apiKey;
    
    if (this.isConfigured) {
      console.log("[Perplexity] Service initialized successfully");
    } else {
      console.log("[Perplexity] Not configured - missing API key");
    }
  }

  /**
   * Check if the Perplexity service is properly configured
   */
  isReady(): boolean {
    return this.isConfigured;
  }

  /**
   * Get current configuration status
   */
  getStatus(): { configured: boolean } {
    return {
      configured: this.isConfigured,
    };
  }

  /**
   * Get player news summaries from Perplexity
   */
  async getPlayerSummaries(playerNames: string[], promptTemplate: string): Promise<PerplexityResponse> {
    if (!this.isReady() || !this.apiKey) {
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
          "Authorization": `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "llama-3.1-sonar-small-128k-online",
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
    if (!this.isReady() || !this.apiKey) {
      return {
        success: false,
        error: "Perplexity service not configured. Please add PERPLEXITY_API_KEY.",
      };
    }

    try {
      const response = await fetch(this.baseUrl, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "llama-3.1-sonar-small-128k-online",
          messages: [
            {
              role: "system",
              content: "You are a social media manager for Sportfolio, a fantasy sports stock market platform. Your job is to draft engaging tweets about NBA player performance and market activity. Keep tweets concise, use relevant stats, and make them shareable. Always include the sportfolio.market link."
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
