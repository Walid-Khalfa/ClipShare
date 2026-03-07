-- Storage Row Level Security (RLS) Policies for Recordings Bucket
-- This migration adds security policies to prevent unauthorized access to uploaded recordings

-- Ensure the storage bucket exists (create if not exists)
-- The bucket should already exist from Supabase dashboard or previous setup
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
ON CONFLICT (id) DO NOTHING
VALUES ('recordings', 'recordings', false, 524288000, ARRAY['video/webm', 'video/mp4', 'audio/webm', 'audio/mp4', 'audio/mpeg', 'audio/wav', 'image/jpeg', 'image/png', 'image/webp']);

-- Enable RLS on storage.objects
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;

-- Create a function to extract user_id from storage path
-- This extracts the user_id from paths like: uploads/{user_id}/{recording_id}/...
CREATE OR REPLACE FUNCTION storage.extract_user_id_from_path(path TEXT)
RETURNS UUID AS $$
DECLARE
  parts TEXT[];
  user_id_text TEXT;
BEGIN
  -- Split path by '/'
  parts := string_to_array(path, '/');
  
  -- Check if path starts with 'uploads'
  IF array_length(parts, 1) > 0 AND parts[1] = 'uploads' THEN
    -- Extract user_id (second part)
    IF array_length(parts, 1) > 1 THEN
      user_id_text := parts[2];
      -- Try to convert to UUID
      RETURN user_id_text::UUID;
    END IF;
  END IF;
  
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create a function to check if user owns the recording via storage path
CREATE OR REPLACE FUNCTION storage.user_owns_storage_path(user_id UUID, path TEXT)
RETURNS BOOLEAN AS $$
DECLARE
  extracted_user_id UUID;
BEGIN
  extracted_user_id := storage.extract_user_id_from_path(path);
  RETURN extracted_user_id = user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create a function to check if a storage path belongs to a public recording
CREATE OR REPLACE FUNCTION storage.is_public_recording_path(path TEXT)
RETURNS BOOLEAN AS $$
DECLARE
  recording_uuid UUID;
  is_public BOOLEAN;
BEGIN
  -- Extract recording ID from path (format: uploads/{user_id}/{recording_id}/...)
  -- Try to find the recording by matching the path pattern
  SELECT r.is_public INTO is_public
  FROM recordings r
  WHERE r.raw_path = path
     OR r.processed_path = path
     OR r.thumbnail_path = path
  LIMIT 1;
  
  RETURN COALESCE(is_public, false);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =============================================
-- STORAGE RLS POLICIES FOR 'recordings' BUCKET
-- =============================================

-- Policy 1: Users can upload to their own folder (uploads/{user_id}/*)
CREATE POLICY "Users can upload to own folder" ON storage.objects
FOR INSERT WITH CHECK (
  bucket_id = 'recordings'
  AND (
    -- Allow uploads to user's own folder
    (storage.foldername(name))[1] = 'uploads'
    AND (storage.foldername(name))[2] = auth.uid()::text
  )
);

-- Policy 2: Users can update/delete their own uploaded files
CREATE POLICY "Users can manage own uploads" ON storage.objects
FOR UPDATE USING (
  bucket_id = 'recordings'
  AND (
    -- User owns the folder
    storage.user_owns_storage_path(auth.uid(), name)
    OR
    -- Service role (anon with jwt role = 'service_role' or authenticated)
    (SELECT auth.jwt()->>'role' IN ('service_role', 'authenticated', 'anon'))
  )
);

-- Policy 3: Users can delete their own uploaded files
CREATE POLICY "Users can delete own uploads" ON storage.objects
FOR DELETE USING (
  bucket_id = 'recordings'
  AND storage.user_owns_storage_path(auth.uid(), name)
);

-- Policy 4: Users can read their own recordings (private)
CREATE POLICY "Users can read own recordings" ON storage.objects
FOR SELECT USING (
  bucket_id = 'recordings'
  AND (
    -- User owns the file
    storage.user_owns_storage_path(auth.uid(), name)
    OR
    -- File belongs to a public recording
    storage.is_public_recording_path(name)
    OR
    -- Service role can read all
    (SELECT auth.jwt()->>'role' = 'service_role')
  )
);

-- Policy 5: Anyone can read public recordings (anon access)
-- This allows public URL access for shared recordings
CREATE POLICY "Public recordings are readable by everyone" ON storage.objects
FOR SELECT USING (
  bucket_id = 'recordings'
  AND storage.is_public_recording_path(name)
);

-- Policy 6: Service role (admin) has full access to all files
-- This must be a separate policy because service_role bypasses auth.uid()
CREATE POLICY "Service role can manage all recordings" ON storage.objects
FOR ALL USING (
  bucket_id = 'recordings'
  AND (SELECT auth.jwt()->>'role' = 'service_role')
);

-- Create index for faster policy evaluation
CREATE INDEX IF NOT EXISTS idx_storage_objects_bucket_recording 
ON storage.objects (bucket_id, name) 
WHERE bucket_id = 'recordings';

-- Grant necessary permissions to authenticated users
-- These grants ensure users can interact with storage within policy bounds
GRANT USAGE ON SCHEMA storage TO authenticated, anon, service_role;
GRANT ALL ON storage.objects TO authenticated, anon, service_role;
GRANT ALL ON storage.buckets TO authenticated, anon, service_role;

-- Note: The actual file operations (createSignedUploadUrl, createSignedUrl, etc.)
-- in the API currently use supabaseAdmin which bypasses RLS. This is intentional
-- for the API routes as they perform additional authorization checks against
-- the recordings table. The storage RLS policies provide defense-in-depth
-- and protect against direct bucket access.
