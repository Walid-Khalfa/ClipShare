-- Rate limiting table for serverless environments
CREATE TABLE IF NOT EXISTS rate_limits (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  
  -- Identifier: IP address hash or user ID
  identifier TEXT NOT NULL,
  
  -- Endpoint: API route path (e.g., '/api/upload', '/api/recordings')
  endpoint TEXT NOT NULL,
  
  -- Count: Number of requests in current window
  count INTEGER DEFAULT 1,
  
  -- Window start: When the current window started
  window_start TIMESTAMPTZ DEFAULT NOW(),
  
  -- Window duration: How long the window lasts (in seconds)
  window_duration INTEGER NOT NULL DEFAULT 60,
  
  -- Max requests: Maximum allowed requests in the window
  max_requests INTEGER NOT NULL DEFAULT 100,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for efficient rate limit lookups
CREATE INDEX IF NOT EXISTS idx_rate_limits_identifier_endpoint 
  ON rate_limits(identifier, endpoint);

-- Index for cleaning up old records
CREATE INDEX IF NOT EXISTS idx_rate_limits_updated_at 
  ON rate_limits(updated_at);

-- RLS not needed for rate limits as they're managed server-side
-- But we can add it for safety
ALTER TABLE rate_limits ENABLE ROW LEVEL SECURITY;

-- Service role can manage rate limits
CREATE POLICY "Service role can manage rate limits" ON rate_limits
  FOR ALL USING (true);

-- Function to check and increment rate limit
-- Returns: { allowed: boolean, remaining: number, resetAt: Date }
CREATE OR REPLACE FUNCTION check_rate_limit(
  p_identifier TEXT,
  p_endpoint TEXT,
  p_max_requests INTEGER DEFAULT 100,
  p_window_duration INTEGER DEFAULT 60
)
RETURNS TABLE (
  allowed BOOLEAN,
  remaining INTEGER,
  reset_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_record RECORD;
  v_window_start TIMESTAMPTZ;
  v_reset_at TIMESTAMPTZ;
BEGIN
  -- Calculate the window start based on current time and window duration
  v_window_start := NOW() - (p_window_duration || ' seconds')::INTERVAL;
  v_reset_at := NOW() + (p_window_duration || ' seconds')::INTERVAL;
  
  -- Try to find existing record
  SELECT * INTO v_record
  FROM rate_limits
  WHERE identifier = p_identifier
    AND endpoint = p_endpoint
    AND window_start > v_window_start;
  
  IF NOT FOUND THEN
    -- No record exists or window has expired, create new entry
    INSERT INTO rate_limits (identifier, endpoint, count, window_start, window_duration, max_requests)
    VALUES (p_identifier, p_endpoint, 1, NOW(), p_window_duration, p_max_requests)
    ON CONFLICT (identifier, endpoint)
    DO UPDATE SET
      count = 1,
      window_start = NOW(),
      updated_at = NOW()
    WHERE rate_limits.window_start <= v_window_start;
    
    RETURN QUERY SELECT
      true,
      p_max_requests - 1,
      v_reset_at;
  ELSE
    -- Record exists within window
    IF v_record.count >= p_max_requests THEN
      -- Rate limit exceeded
      RETURN QUERY SELECT 
        false, 
        0, 
        v_record.window_start + (v_record.window_duration || ' seconds')::INTERVAL;
    ELSE
      -- Increment count
      UPDATE rate_limits
      SET count = count + 1,
          updated_at = NOW()
      WHERE id = v_record.id;
      
      RETURN QUERY SELECT 
        true, 
        p_max_requests - v_record.count - 1, 
        v_reset_at;
    END IF;
  END IF;
END;
$$;

-- Function to clean up expired rate limit records
-- Should be called periodically (e.g., via cron)
CREATE OR REPLACE FUNCTION cleanup_expired_rate_limits()
RETURNS INTEGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_deleted INTEGER;
BEGIN
  -- Delete records older than 2x the window duration
  DELETE FROM rate_limits
  WHERE updated_at < NOW() - (window_duration * 2 || ' seconds')::INTERVAL
    OR updated_at < NOW() - INTERVAL '1 day';
  
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END;
$$;
