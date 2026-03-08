import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import logger from '@/lib/logger';

interface HealthStatus {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: string;
  version: string;
  responseTime: number;
  uptime: number;
}

const START_TIME = Date.now();
const VERSION = process.env.NEXT_PUBLIC_APP_VERSION || '1.0.0';
const HEALTH_CHECK_TIMEOUT = 500; // 500ms threshold

export async function GET(request: NextRequest): Promise<NextResponse> {
  const startTime = Date.now();
  
  try {
    // Basic liveness check - just verify we can respond quickly
    const responseTime = Date.now() - startTime;
    
    const status: HealthStatus = {
      status: responseTime < HEALTH_CHECK_TIMEOUT ? 'healthy' : 'degraded',
      timestamp: new Date().toISOString(),
      version: VERSION,
      responseTime,
      uptime: Math.floor((Date.now() - START_TIME) / 1000),
    };

    // For liveness probe, we just need to respond - no dependency checks
    return NextResponse.json(status, {
      status: 200,
      headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'X-Health-Check': 'liveness',
      },
    });
  } catch (error) {
    logger.error({ error }, 'Health check failed');
    
    return NextResponse.json(
      {
        status: 'unhealthy',
        timestamp: new Date().toISOString(),
        version: VERSION,
        responseTime: Date.now() - startTime,
        uptime: Math.floor((Date.now() - START_TIME) / 1000),
      },
      { 
        status: 503,
        headers: {
          'Cache-Control': 'no-cache, no-store, must-revalidate',
        },
      }
    );
  }
}
