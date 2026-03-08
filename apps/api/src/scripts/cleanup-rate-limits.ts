/**
 * Rate Limit Cleanup Script
 * 
 * This script periodically cleans up expired rate limit records from the database.
 * 
 * Scheduling options:
 * 1. Supabase Edge Function with cron schedule (preferred for serverless)
 * 2. Standalone Node.js script (this file) - run via cron or systemd timer
 * 3. Integrated into the main API server as a scheduled task
 * 
 * Retention policy:
 * - Rate limit records are deleted when they're older than 2x the window duration
 * - OR if they're older than 1 day (whichever comes first)
 * - This ensures we keep enough history for rate limiting while cleaning up old data
 * 
 * Running as standalone script:
 *   pnpm run cleanup:rate-limits
 * 
 * Cron example (run daily at 2 AM UTC):
 *   0 2 * * * cd /path/to/app && pnpm run cleanup:rate-limits
 * 
 * Environment variables:
 *   SUPABASE_SERVICE_ROLE_KEY - Required for database access
 *   NEXT_PUBLIC_SUPABASE_URL - Required for database connection
 *   LOG_LEVEL - Logging level (default: info)
 */

import { createClient } from '@supabase/supabase-js';
import { createLogger, formatError } from './lib/logger.js';

const logger = createLogger({ component: 'rate-limit-cleanup' });

// Get environment variables
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  logger.error(
    { env: { supabaseUrl: !!supabaseUrl, serviceRoleKey: !!serviceRoleKey } },
    'Missing required environment variables'
  );
  process.exit(1);
}

// Create admin client with service role key
const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

/**
 * Clean up expired rate limit records
 */
async function cleanupExpiredRateLimits(): Promise<number> {
  logger.info('Starting rate limit cleanup');
  
  try {
    // Call the database function to clean up expired rate limits
    const { data, error } = await supabaseAdmin.rpc('cleanup_expired_rate_limits');
    
    if (error) {
      logger.error({ error: formatError(error) }, 'Error cleaning up rate limits');
      throw error;
    }
    
    const deletedCount = data as number;
    logger.info({ deletedCount }, 'Rate limit cleanup completed');
    
    return deletedCount;
  } catch (error) {
    logger.error({ error: formatError(error) }, 'Rate limit cleanup failed');
    throw error;
  }
}

/**
 * Main execution
 */
async function main(): Promise<void> {
  const startTime = Date.now();
  
  logger.info({
    environment: process.env.NODE_ENV || 'development',
    timestamp: new Date().toISOString(),
  }, 'Rate limit cleanup job started');
  
  try {
    const deletedCount = await cleanupExpiredRateLimits();
    
    const duration = Date.now() - startTime;
    
    logger.info({
      deletedCount,
      duration_ms: duration,
      timestamp: new Date().toISOString(),
    }, 'Rate limit cleanup job completed successfully');
    
    process.exit(0);
  } catch (error) {
    const duration = Date.now() - startTime;
    
    logger.error({
      error: formatError(error),
      duration_ms: duration,
      timestamp: new Date().toISOString(),
    }, 'Rate limit cleanup job failed');
    
    process.exit(1);
  }
}

// Run the cleanup
main();
