import { supabaseAdmin } from './supabase.js';

const BUCKET_NAME = process.env.SUPABASE_STORAGE_BUCKET || 'recordings';

export async function getPresignedUploadUrl(
  path: string,
  _contentType: string,
  _expiresIn: number = 3600
): Promise<string> {
  const { data, error } = await supabaseAdmin.storage
    .from(BUCKET_NAME)
    .createSignedUploadUrl(path);

  if (error) {
    throw new Error(`Failed to create signed upload URL: ${error.message}`);
  }

  return data.signedUrl;
}

export async function getPresignedDownloadUrl(
  path: string,
  expiresIn: number = 3600
): Promise<string> {
  const { data, error } = await supabaseAdmin.storage
    .from(BUCKET_NAME)
    .createSignedUrl(path, expiresIn);

  if (error) {
    throw new Error(`Failed to create signed download URL: ${error.message}`);
  }

  return data.signedUrl;
}

export async function uploadFile(
  path: string,
  file: Buffer | Blob,
  contentType: string
): Promise<{ path: string; size: number }> {
  const { data, error } = await supabaseAdmin.storage
    .from(BUCKET_NAME)
    .upload(path, file, {
      contentType,
      upsert: true,
    });

  if (error) {
    throw new Error(`Failed to upload file: ${error.message}`);
  }

  const { data: fileInfo } = await supabaseAdmin.storage
    .from(BUCKET_NAME)
    .list('', { search: path });

  return {
    path: data.path,
    size: fileInfo?.[0]?.metadata?.size || 0,
  };
}

export async function deleteFile(path: string): Promise<void> {
  const { error } = await supabaseAdmin.storage
    .from(BUCKET_NAME)
    .remove([path]);

  if (error) {
    throw new Error(`Failed to delete file: ${error.message}`);
  }
}

export async function getPublicUrl(path: string): Promise<string> {
  const { data } = supabaseAdmin.storage
    .from(BUCKET_NAME)
    .getPublicUrl(path);

  return data.publicUrl;
}

export { BUCKET_NAME };
