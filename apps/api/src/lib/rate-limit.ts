import crypto from 'crypto';
import { supabaseAdmin } from './supabase.js';

export interface RateLimitConfig {
  maxRequests: number;
  windowSeconds: number;
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: Date | null;
}

/**
 * Hash IP address for storage (adds privacy)
 * Uses crypto for secure hashing to prevent collision attacks
 */
function hashIp(ip: string): string {
  const hash = crypto.createHash('sha256');
  hash.update(ip + (process.env.RATE_LIMIT_SECRET || 'default-secret'));
  return hash.digest('hex').slice(0, 16);
}

/**
 * Check rate limit using database-backed solution
 * Works in serverless environments where memory is not shared
 */
export async function checkRateLimit(
  ip: string,
  endpoint: string,
  customConfig?: RateLimitConfig
): Promise<RateLimitResult> {
  // Default configuration
  const config: RateLimitConfig = customConfig || {
    maxRequests: 100,
    windowSeconds: 60,
  };
  
  const identifier = hashIp(ip);
  
  try {
    // Call the database function
    const { data, error } = await supabaseAdmin.rpc('check_rate_limit', {
      p_identifier: identifier,
      p_endpoint: endpoint,
      p_max_requests: config.maxRequests,
      p_window_duration: config.windowSeconds,
    });
    
    if (error) {
      console.error('Rate limit check error:', error);
      // On error, allow the request but log the issue
      return {
        allowed: true,
        remaining: config.maxRequests,
        resetAt: null,
      };
    }
    
    if (data && data.length > 0) {
      return {
        allowed: data[0].allowed,
        remaining: data[0].remaining,
        resetAt: data[0].reset_at ? new Date(data[0].reset_at) : null,
      };
    }
    
    // Default to allowing if no data returned
    return {
      allowed: true,
      remaining: config.maxRequests,
      resetAt: null,
    };
  } catch (error) {
    console.error('Rate limit exception:', error);
    // On exception, allow the request (fail-open)
    // This prevents rate limiting from blocking all traffic on DB issues
    return {
      allowed: true,
      remaining: config.maxRequests,
      resetAt: null,
    };
  }
}

/**
 * Create a rate limit check with custom configuration
 */
export function createRateLimitChecker(endpoint: string, customConfig: RateLimitConfig) {
  return async function rateLimitCheck(ip: string): Promise<RateLimitResult> {
    return checkRateLimit(ip, endpoint, customConfig);
  };
}
