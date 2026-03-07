-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Recording status enum
CREATE TYPE recording_status AS ENUM (
  'CREATED',
  'UPLOADING',
  'UPLOADED',
  'PROCESSING',
  'READY',
  'FAILED'
);

-- Recordings table
CREATE TABLE IF NOT EXISTS recordings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  
  title TEXT DEFAULT 'Untitled Recording',
  description TEXT,
  duration INTEGER,
  
  raw_path TEXT,
  processed_path TEXT,
  thumbnail_path TEXT,
  
  status recording_status DEFAULT 'CREATED',
  
  mime_type TEXT,
  width INTEGER,
  height INTEGER,
  
  is_public BOOLEAN DEFAULT FALSE,
  share_token TEXT UNIQUE,
  
  view_count INTEGER DEFAULT 0,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- View events table
CREATE TABLE IF NOT EXISTS view_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  recording_id UUID NOT NULL REFERENCES recordings(id) ON DELETE CASCADE,
  
  ip_hash TEXT,
  user_agent TEXT,
  referrer TEXT,
  
  viewed_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for recordings
CREATE INDEX IF NOT EXISTS idx_recordings_user_id ON recordings(user_id);
CREATE INDEX IF NOT EXISTS idx_recordings_user_created ON recordings(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_recordings_user_status ON recordings(user_id, status);
CREATE INDEX IF NOT EXISTS idx_recordings_share_token ON recordings(share_token);
CREATE INDEX IF NOT EXISTS idx_recordings_status ON recordings(status);
CREATE INDEX IF NOT EXISTS idx_recordings_public_token ON recordings(is_public, share_token) WHERE is_public = true;

-- Indexes for view events
CREATE INDEX IF NOT EXISTS idx_view_events_recording_viewed ON view_events(recording_id, viewed_at DESC);
CREATE INDEX IF NOT EXISTS idx_view_events_viewed ON view_events(viewed_at DESC);

-- RLS Policies for recordings
ALTER TABLE recordings ENABLE ROW LEVEL SECURITY;

-- Users can create recordings
CREATE POLICY "Users can create recordings" ON recordings
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Users can view their own recordings
CREATE POLICY "Users can view own recordings" ON recordings
  FOR SELECT USING (auth.uid() = user_id);

-- Users can update their own recordings
CREATE POLICY "Users can update own recordings" ON recordings
  FOR UPDATE USING (auth.uid() = user_id);

-- Users can delete their own recordings
CREATE POLICY "Users can delete own recordings" ON recordings
  FOR DELETE USING (auth.uid() = user_id);

-- Anyone can view public recordings
CREATE POLICY "Public recordings are viewable by everyone" ON recordings
  FOR SELECT USING (is_public = true);

-- RLS Policies for view events
ALTER TABLE view_events ENABLE ROW LEVEL SECURITY;

-- Users can view view events for their recordings
CREATE POLICY "Users can view events for own recordings" ON view_events
  FOR SELECT USING (
    recording_id IN (SELECT id FROM recordings WHERE user_id = auth.uid())
  );

-- Anyone can create view events (for public recordings)
CREATE POLICY "Anyone can track views" ON view_events
  FOR INSERT WITH CHECK (true);

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to update updated_at
CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON recordings
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

-- Function to generate share token
CREATE OR REPLACE FUNCTION generate_share_token()
RETURNS TRIGGER
AS $$
BEGIN
  IF NEW.is_public = true AND NEW.share_token IS NULL THEN
    NEW.share_token := encode(gen_random_bytes(6), 'hex');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to generate share token
CREATE TRIGGER generate_share_token
  BEFORE INSERT OR UPDATE ON recordings
  FOR EACH ROW
  EXECUTE FUNCTION generate_share_token();
