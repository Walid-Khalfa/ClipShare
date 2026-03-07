-- Atomic view count increment function
-- This function performs an atomic increment of the view_count column
-- preventing race conditions when multiple requests try to increment simultaneously

CREATE OR REPLACE FUNCTION increment_view_count(target_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE recordings
  SET view_count = view_count + 1,
      updated_at = NOW()
  WHERE id = target_id;
END;
$$;

-- Grant execute permission to the service role (via anon and authenticated roles)
-- This allows the RPC function to be called from the API
GRANT EXECUTE ON FUNCTION increment_view_count(UUID) TO anon;
GRANT EXECUTE ON FUNCTION increment_view_count(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION increment_view_count(UUID) TO service_role;
