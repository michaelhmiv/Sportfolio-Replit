-- Add News Hub schema changes

-- Add news columns to users table
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_news_viewed_at TIMESTAMP;
ALTER TABLE users ADD COLUMN IF NOT EXISTS news_notifications_enabled BOOLEAN NOT NULL DEFAULT true;

-- Create news_feed table
CREATE TABLE IF NOT EXISTS news_feed (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  headline TEXT NOT NULL,
  briefing TEXT NOT NULL,
  source_url TEXT,
  content_hash VARCHAR(64) NOT NULL,
  sport TEXT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Create indexes for news_feed
CREATE INDEX IF NOT EXISTS news_feed_created_at_idx ON news_feed(created_at);
CREATE INDEX IF NOT EXISTS news_feed_content_hash_idx ON news_feed(content_hash);
CREATE INDEX IF NOT EXISTS news_feed_sport_idx ON news_feed(sport);
