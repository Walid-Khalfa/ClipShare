import { NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'

export interface RateLimitConfig {
  maxRequests: number
  windowSeconds: number
}

export interface RateLimitResult {
  allowed: boolean
  remaining: number
  resetAt: Date | null
}

// Default rate limit configurations per endpoint
export const RATE_LIMIT_CONFIGS: Record<string, RateLimitConfig> = {
  '/api/auth/magic-link': {
    maxRequests: 5,
    windowSeconds: 3600, // 5 requests per hour (strict for auth)
  },
  '/api/upload': {
    maxRequests: 50,
    windowSeconds: 60, // 50 requests per minute
  },
  '/api/recordings': {
    maxRequests: 100,
    windowSeconds: 60, // 100 requests per minute
  },
  '/api/share': {
    maxRequests: 100,
    windowSeconds: 60, // 100 requests per minute
  },
}

/**
 * Extract client IP from request headers
 * Works with Vercel, Nginx, and other proxies
 */
export function getClientIp(request: NextRequest): string {
  // Check x-forwarded-for header (common for load balancers/proxies)
  const forwardedFor = request.headers.get('x-forwarded-for')
  if (forwardedFor) {
    // Take the first IP (original client)
    return forwardedFor.split(',')[0].trim()
  }
  
  // Check x-real-ip header (common with Nginx)
  const realIp = request.headers.get('x-real-ip')
  if (realIp) {
    return realIp.trim()
  }
  
  // Fallback to a default (not ideal for production but won't crash)
  return 'unknown'
}

/**
 * Hash IP address for storage (adds some privacy)
 * Uses crypto for secure hashing to prevent collision attacks
 */
function hashIp(ip: string): string {
  const crypto = require('crypto')
  const hash = crypto.createHash('sha256')
  hash.update(ip + process.env.RATE_LIMIT_SECRET || 'default-secret')
  return hash.digest('hex').slice(0, 16)
}

/**
 * Check rate limit using database-backed solution
 * Works in serverless environments where memory is not shared
 */
export async function checkRateLimit(
  request: NextRequest,
  endpoint: string,
  customConfig?: RateLimitConfig
): Promise<RateLimitResult> {
  // Get configuration (use custom or default)
  const config = customConfig || RATE_LIMIT_CONFIGS[endpoint] || {
    maxRequests: 100,
    windowSeconds: 60,
  }
  
  // Get client IP
  const ip = getClientIp(request)
  const identifier = hashIp(ip)
  
  try {
    const supabaseAdmin = createAdminClient()
    
    // Call the database function
    const { data, error } = await supabaseAdmin.rpc('check_rate_limit', {
      p_identifier: identifier,
      p_endpoint: endpoint,
      p_max_requests: config.maxRequests,
      p_window_duration: config.windowSeconds,
    })
    
    if (error) {
      console.error('Rate limit check error:', error)
      // On error, allow the request but log the issue
      return {
        allowed: true,
        remaining: config.maxRequests,
        resetAt: null,
      }
    }
    
    if (data && data.length > 0) {
      return {
        allowed: data[0].allowed,
        remaining: data[0].remaining,
        resetAt: data[0].reset_at ? new Date(data[0].reset_at) : null,
      }
    }
    
    // Default to allowing if no data returned
    return {
      allowed: true,
      remaining: config.maxRequests,
      resetAt: null,
    }
  } catch (error) {
    console.error('Rate limit exception:', error)
    // On exception, allow the request (fail-open)
    // This prevents rate limiting from blocking all traffic on DB issues
    return {
      allowed: true,
      remaining: config.maxRequests,
      resetAt: null,
    }
  }
}

/**
 * Create a rate limit check handler for API routes
 * Returns the middleware-style function to use in routes
 */
export function createRateLimitChecker(endpoint: string, customConfig?: RateLimitConfig) {
  return async function rateLimitCheck(request: NextRequest) {
    const result = await checkRateLimit(request, endpoint, customConfig)
    return result
  }
}
