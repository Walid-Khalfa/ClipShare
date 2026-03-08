import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import logger from '@/lib/logger';

interface DependencyStatus {
  name: string;
  status: 'healthy' | 'unhealthy';
  responseTime?: number;
  message?: string;
}

interface ReadinessStatus {
  status: 'ready' | 'not_ready';
  timestamp: string;
  version: string;
  responseTime: number;
  dependencies: DependencyStatus[];
}

const VERSION = process.env.NEXT_PUBLIC_APP_VERSION || '1.0.0';
const READINESS_TIMEOUT = 5000; // 5s for dependency checks

async function checkDatabase(): Promise<DependencyStatus> {
  const startTime = Date.now();
  
  try {
    const supabaseAdmin = createAdminClient();
    
    // Simple query to test database connectivity
    const { error } = await supabaseAdmin
      .from('recordings')
      .select('id', { count: 'exact', head: true });

    if (error) {
      return {
        name: 'database',
        status: 'unhealthy',
        responseTime: Date.now() - startTime,
        message: error.message,
      };
    }

    return {
      name: 'database',
      status: 'healthy',
      responseTime: Date.now() - startTime,
    };
  } catch (error) {
    return {
      name: 'database',
      status: 'unhealthy',
      responseTime: Date.now() - startTime,
      message: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

async function checkStorage(): Promise<DependencyStatus> {
  const startTime = Date.now();
  
  try {
    const supabaseAdmin = createAdminClient();
    
    // Test storage accessibility by listing buckets
    const { data: buckets, error } = await supabaseAdmin.storage.listBuckets();

    if (error) {
      return {
        name: 'storage',
        status: 'unhealthy',
        responseTime: Date.now() - startTime,
        message: error.message,
      };
    }

    // Check if 'recordings' bucket exists
    const recordingsBucket = buckets?.find(b => b.name === 'recordings');
    if (!recordingsBucket) {
      return {
        name: 'storage',
        status: 'unhealthy',
        responseTime: Date.now() - startTime,
        message: 'Recordings bucket not found',
      };
    }

    return {
      name: 'storage',
      status: 'healthy',
      responseTime: Date.now() - startTime,
    };
  } catch (error) {
    return {
      name: 'storage',
      status: 'unhealthy',
      responseTime: Date.now() - startTime,
      message: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const startTime = Date.now();
  
  try {
    // Run all dependency checks in parallel with timeout
    const [dbStatus, storageStatus] = await Promise.all([
      checkDatabase(),
      checkStorage(),
    ]);

    const dependencies = [dbStatus, storageStatus];
    const allHealthy = dependencies.every(d => d.status === 'healthy');
    
    const status: ReadinessStatus = {
      status: allHealthy ? 'ready' : 'not_ready',
      timestamp: new Date().toISOString(),
      version: VERSION,
      responseTime: Date.now() - startTime,
      dependencies,
    };

    return NextResponse.json(status, {
      status: allHealthy ? 200 : 503,
      headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'X-Health-Check': 'readiness',
      },
    });
  } catch (error) {
    logger.error({ error }, 'Readiness check failed');
    
    return NextResponse.json(
      {
        status: 'not_ready',
        timestamp: new Date().toISOString(),
        version: VERSION,
        responseTime: Date.now() - startTime,
        dependencies: [
          {
            name: 'unknown',
            status: 'unhealthy',
            message: error instanceof Error ? error.message : 'Unknown error',
          },
        ],
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
