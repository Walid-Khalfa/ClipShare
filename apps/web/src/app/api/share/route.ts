import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/server'
import { checkRateLimit } from '@/lib/rate-limit'
import { getVideoCdnUrl, getThumbnailCdnUrl } from '@/lib/cdn'
import { createRequestLogger, generateCorrelationId, logRequest, formatError } from '@/lib/logger'
import crypto from 'crypto'

const SHARE_ENDPOINT = '/api/share'

// CSRF protection middleware for state-changing operations
function checkCsrfForMutations(request: NextRequest): NextResponse | null {
  const stateChangingMethods = ['POST', 'DELETE'];
  
  if (stateChangingMethods.includes(request.method)) {
    // Check Origin header for CSRF protection
    const origin = request.headers.get('origin');
    const allowedOrigin = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
    if (origin && origin !== allowedOrigin) {
      return NextResponse.json(
        { error: 'Invalid origin' },
        { status: 403 }
      );
    }

    // Validate Content-Type header
    const contentType = request.headers.get('content-type') || '';
    if (!contentType.includes('application/json')) {
      return NextResponse.json(
        { error: 'Content-Type must be application/json' },
        { status: 400 }
      );
    }
  }

  return null;
}

// POST /api/share - Create share link for a recording
export async function POST(request: NextRequest) {
  const correlationId = generateCorrelationId();
  const logger = createRequestLogger({
    method: 'POST',
    url: request.url,
    correlationId,
  });
  const startTime = Date.now();
  
  try {
    // CSRF protection
    const csrfError = checkCsrfForMutations(request);
    if (csrfError) return csrfError;

    // Check rate limit using database-backed solution
    const rateLimitResult = await checkRateLimit(request, SHARE_ENDPOINT)
    if (!rateLimitResult.allowed) {
      return NextResponse.json(
        { error: 'Too many requests', retryAfter: rateLimitResult.resetAt },
        {
          status: 429,
          headers: rateLimitResult.resetAt ? {
            'Retry-After': Math.ceil((rateLimitResult.resetAt.getTime() - Date.now()) / 1000).toString()
          } : {}
        }
      )
    }

    // Authenticate
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    const body = await request.json()
    const { recordingId } = body

    if (!recordingId) {
      return NextResponse.json(
        { error: 'Recording ID is required' },
        { status: 400 }
      )
    }

    const supabaseAdmin = createAdminClient()

    // Verify ownership
    const { data: recording, error: fetchError } = await supabaseAdmin
      .from('recordings')
      .select('*')
      .eq('id', recordingId)
      .eq('user_id', user.id)
      .single()

    if (fetchError || !recording) {
      return NextResponse.json(
        { error: 'Recording not found' },
        { status: 404 }
      )
    }

    const shareToken = recording.share_token || crypto.randomUUID()

    const { data, error } = await supabaseAdmin
      .from('recordings')
      .update({
        is_public: true,
        share_token: shareToken,
      })
      .eq('id', recordingId)
      .select()
      .single()

    if (error) {
      return NextResponse.json(
        { error: 'Failed to share recording' },
        { status: 500 }
      )
    }

    return NextResponse.json({
      shareToken,
      shareUrl: `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/share/${shareToken}`,
    })
  } catch (error) {
    logger.error({ error: formatError(error) }, 'Share error');
    logRequest(logger, {
      method: 'POST',
      url: request.url,
      statusCode: 500,
      duration: Date.now() - startTime,
      error: error instanceof Error ? error : new Error(String(error)),
    });
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

// DELETE /api/share - Remove share link
export async function DELETE(request: NextRequest) {
  const correlationId = generateCorrelationId();
  const logger = createRequestLogger({
    method: 'DELETE',
    url: request.url,
    correlationId,
  });
  const startTime = Date.now();
  
  try {
    // CSRF protection
    const csrfError = checkCsrfForMutations(request);
    if (csrfError) return csrfError;

    // Check rate limit using database-backed solution
    const rateLimitResult = await checkRateLimit(request, SHARE_ENDPOINT)
    if (!rateLimitResult.allowed) {
      return NextResponse.json(
        { error: 'Too many requests', retryAfter: rateLimitResult.resetAt },
        {
          status: 429,
          headers: rateLimitResult.resetAt ? {
            'Retry-After': Math.ceil((rateLimitResult.resetAt.getTime() - Date.now()) / 1000).toString()
          } : {}
        }
      )
    }

    // Authenticate
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    const { searchParams } = new URL(request.url)
    const recordingId = searchParams.get('recordingId')

    if (!recordingId) {
      return NextResponse.json(
        { error: 'Recording ID is required' },
        { status: 400 }
      )
    }

    const supabaseAdmin = createAdminClient()

    // Verify ownership
    const { data: recording, error: fetchError } = await supabaseAdmin
      .from('recordings')
      .select('*')
      .eq('id', recordingId)
      .eq('user_id', user.id)
      .single()

    if (fetchError || !recording) {
      return NextResponse.json(
        { error: 'Recording not found' },
        { status: 404 }
      )
    }

    const { error } = await supabaseAdmin
      .from('recordings')
      .update({
        is_public: false,
        share_token: null,
      })
      .eq('id', recordingId)

    if (error) {
      return NextResponse.json(
        { error: 'Failed to revoke sharing' },
        { status: 500 }
      )
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    logger.error({ error: formatError(error) }, 'Revoke share error');
    logRequest(logger, {
      method: 'DELETE',
      url: request.url,
      statusCode: 500,
      duration: Date.now() - startTime,
      error: error instanceof Error ? error : new Error(String(error)),
    });
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

// GET /api/share - Get shared recording (public)
export async function GET(request: NextRequest) {
  const correlationId = generateCorrelationId();
  const logger = createRequestLogger({
    method: 'GET',
    url: request.url,
    correlationId,
  });
  const startTime = Date.now();
  
  try {
    // Check rate limit using database-backed solution
    const rateLimitResult = await checkRateLimit(request, SHARE_ENDPOINT)
    if (!rateLimitResult.allowed) {
      return NextResponse.json(
        { error: 'Too many requests', retryAfter: rateLimitResult.resetAt },
        {
          status: 429,
          headers: rateLimitResult.resetAt ? {
            'Retry-After': Math.ceil((rateLimitResult.resetAt.getTime() - Date.now()) / 1000).toString()
          } : {}
        }
      )
    }

    const { searchParams } = new URL(request.url)
    const token = searchParams.get('token')
    const action = searchParams.get('action')

    if (!token) {
      return NextResponse.json(
        { error: 'Token is required' },
        { status: 400 }
      )
    }

    const supabaseAdmin = createAdminClient()

    // Handle view tracking
    if (action === 'view') {
      const { data: recording, error: fetchError } = await supabaseAdmin
        .from('recordings')
        .select('*')
        .eq('share_token', token)
        .eq('is_public', true)
        .single()

      if (fetchError || !recording) {
        return NextResponse.json(
          { error: 'Recording not found' },
          { status: 404 }
        )
      }

      // Record view event
      try {
        await supabaseAdmin
          .from('view_events')
          .insert({
            recording_id: recording.id,
          })
      } catch {
        // Ignore view event errors
      }

      // Increment view count atomically using database function
      await supabaseAdmin.rpc('increment_view_count', { target_id: recording.id })

      return NextResponse.json({ success: true })
    }

    // Get shared recording
    const { data: recording, error } = await supabaseAdmin
      .from('recordings')
      .select('*')
      .eq('share_token', token)
      .eq('is_public', true)
      .single()

    if (error || !recording) {
      return NextResponse.json(
        { error: 'Recording not found' },
        { status: 404 }
      )
    }

    if (recording.status !== 'READY' || !recording.processed_path) {
      return NextResponse.json(
        { error: 'Recording not ready' },
        { status: 400 }
      )
    }

    // Get public URLs using CDN
    const videoUrl = getVideoCdnUrl(recording.processed_path)
    
    let thumbnailUrl: string | null = null
    if (recording.thumbnail_path) {
      thumbnailUrl = getThumbnailCdnUrl(recording.thumbnail_path)
    }

    logRequest(logger, {
      method: 'GET',
      url: request.url,
      statusCode: 200,
      duration: Date.now() - startTime,
    });

    return NextResponse.json({
      id: recording.id,
      title: recording.title,
      description: recording.description,
      duration: recording.duration,
      videoUrl,
      thumbnailUrl,
      view_count: recording.view_count,
      created_at: recording.created_at,
    })
  } catch (error) {
    logger.error({ error: formatError(error) }, 'Get shared recording error');
    logRequest(logger, {
      method: 'GET',
      url: request.url,
      statusCode: 500,
      duration: Date.now() - startTime,
      error: error instanceof Error ? error : new Error(String(error)),
    });
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
