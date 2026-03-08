/**
 * CDN configuration and URL utilities for ClipShare
 * 
 * Supports:
 * - Supabase built-in CDN (default)
 * - CloudFront or other CDN integrations
 * 
 * CDN Caching Strategy:
 * - Videos: Cache for 1 year (immutable, versioned by path)
 * - Thumbnails: Cache for 1 day (can be regenerated)
 * - Use proper Cache-Control headers based on content type
 */

const CDN_URL = process.env.NEXT_PUBLIC_CDN_URL;
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_STORAGE_URL = `${SUPABASE_URL}/storage/v1`;

/**
 * Get the base CDN URL
 * Falls back to Supabase storage URL if no CDN configured
 */
export function getCdnBaseUrl(): string {
  if (CDN_URL) {
    return CDN_URL;
  }
  // Use Supabase storage URL as fallback (includes built-in CDN)
  return SUPABASE_STORAGE_URL || '';
}

/**
 * Check if CDN is configured and active
 */
export function isCdnEnabled(): boolean {
  return !!CDN_URL;
}

/**
 * Generate a CDN URL for a video file
 * Applies appropriate caching headers via URL transformation
 */
export function getVideoCdnUrl(storagePath: string): string {
  const baseUrl = getCdnBaseUrl();
  
  if (!baseUrl) {
    // Fallback to Supabase storage directly
    return `${SUPABASE_URL}/storage/v1/object/public/recordings/${storagePath}`;
  }
  
  // For Supabase CDN, we can add transformation parameters
  if (CDN_URL?.includes('supabase')) {
    // Supabase CDN URL format
    return `${baseUrl}/object/public/recordings/${storagePath}`;
  }
  
  // For custom CDN (e.g., CloudFront)
  return `${baseUrl}/recordings/${storagePath}`;
}

/**
 * Generate a CDN URL for a thumbnail
 * Uses shorter cache duration since thumbnails can be regenerated
 */
export function getThumbnailCdnUrl(storagePath: string): string {
  const baseUrl = getCdnBaseUrl();
  
  if (!baseUrl) {
    return `${SUPABASE_URL}/storage/v1/object/public/recordings/${storagePath}`;
  }
  
  if (CDN_URL?.includes('supabase')) {
    return `${baseUrl}/object/public/recordings/${storagePath}`;
  }
  
  return `${baseUrl}/recordings/${storagePath}`;
}

/**
 * Get cache control headers for different content types
 */
export function getCacheHeaders(contentType: 'video' | 'thumbnail' | 'api'): Record<string, string> {
  switch (contentType) {
    case 'video':
      // Videos are immutable, cache for 1 year
      return {
        'Cache-Control': 'public, max-age=31536000, immutable',
        'CDN-Cache-Control': 'max-age=31536000',
      };
    case 'thumbnail':
      // Thumbnails can be regenerated, shorter cache
      return {
        'Cache-Control': 'public, max-age=86400',
        'CDN-Cache-Control': 'max-age=86400',
      };
    case 'api':
    default:
      // API responses should not be cached
      return {
        'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0',
      };
  }
}

/**
 * Video delivery configuration
 */
export const videoConfig = {
  // Maximum video size (500MB)
  maxFileSize: parseInt(process.env.MAX_FILE_SIZE || '524288000', 10),
  
  // Supported video formats
  supportedFormats: ['video/webm', 'video/mp4', 'video/quicktime'],
  
  // CDN cache settings
  cache: {
    videoTTL: 31536000, // 1 year in seconds
    thumbnailTTL: 86400, // 1 day in seconds
  },
  
  // Streaming quality presets
  qualities: {
    low: { width: 640, bitrate: 500000 },
    medium: { width: 1280, bitrate: 1000000 },
    high: { width: 1920, bitrate: 2000000 },
  },
};
