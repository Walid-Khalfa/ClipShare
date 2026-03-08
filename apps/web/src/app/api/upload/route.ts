import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/server'
import { checkRateLimit, RATE_LIMIT_CONFIGS } from '@/lib/rate-limit'
import { createRequestLogger, generateCorrelationId, logRequest, formatError } from '@/lib/logger'
import { z } from 'zod'
import { MAX_FILE_SIZE, validateFileSize } from '@/lib/env'

const UPLOAD_ENDPOINT = '/api/upload'

const initiateSchema = z.object({
  recordingId: z.string(),
  contentType: z.string(),
  fileSize: z.number().min(1).max(MAX_FILE_SIZE, `File size exceeds maximum of ${MAX_FILE_SIZE / (1024 * 1024)}MB`),
})

const completeSchema = z.object({
  recordingId: z.string(),
  path: z.string(),
})

// CSRF protection middleware
function checkCsrf(request: NextRequest): NextResponse | null {
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

  return null;
}

// POST /api/upload/initiate - Start upload
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
    const csrfError = checkCsrf(request);
    if (csrfError) return csrfError;

    // Check rate limit using database-backed solution
    const rateLimitResult = await checkRateLimit(request, UPLOAD_ENDPOINT)
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
      logRequest(logger, {
        method: 'POST',
        url: request.url,
        statusCode: 401,
        duration: Date.now() - startTime,
        userId: user?.id,
      });
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    const { searchParams } = new URL(request.url)
    const action = searchParams.get('action')

    const jsonBody = await request.json()
    
    if (!action || !['initiate', 'complete', 'abort'].includes(action)) {
      return NextResponse.json(
        { error: 'Invalid or missing action parameter. Use ?action=initiate, ?action=complete, or ?action=abort' },
        { status: 400 }
      )
    }
    
    let body: z.infer<typeof initiateSchema> | z.infer<typeof completeSchema> | { recordingId: string }
    
    if (action === 'initiate') {
      body = initiateSchema.parse(jsonBody)
    } else if (action === 'complete') {
      body = completeSchema.parse(jsonBody)
    } else {
      body = { recordingId: z.string().parse(jsonBody.recordingId) }
    }

    const supabaseAdmin = createAdminClient()

    if (action === 'initiate') {
      const { recordingId } = body as { recordingId: string; contentType: string }

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

      const path = `uploads/${user.id}/${recordingId}/raw`

      const { data: uploadData, error: uploadError } = await supabaseAdmin.storage
        .from('recordings')
        .createSignedUploadUrl(path)

      if (uploadError) {
        logger.error({ error: formatError(uploadError) }, 'Failed to create upload URL');
        logRequest(logger, {
          method: 'POST',
          url: request.url,
          statusCode: 500,
          duration: Date.now() - startTime,
          userId: user.id,
          error: uploadError instanceof Error ? uploadError : new Error(String(uploadError)),
        });
        return NextResponse.json(
          { error: 'Failed to create upload URL' },
          { status: 500 }
        )
      }

      await supabaseAdmin
        .from('recordings')
        .update({
          status: 'UPLOADING',
          raw_path: path,
        })
        .eq('id', recordingId)

      logRequest(logger, {
        method: 'POST',
        url: request.url,
        statusCode: 200,
        duration: Date.now() - startTime,
        userId: user.id,
      });

      return NextResponse.json({
        uploadUrl: uploadData.signedUrl,
        path,
      })
    }

    if (action === 'complete') {
      const { recordingId } = body as { recordingId: string }

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

      await supabaseAdmin
        .from('recordings')
        .update({
          status: 'UPLOADED',
        })
        .eq('id', recordingId)

      logRequest(logger, {
        method: 'POST',
        url: request.url,
        statusCode: 200,
        duration: Date.now() - startTime,
        userId: user.id,
      });

      return NextResponse.json({ success: true, status: 'UPLOADED' })
    }

    if (action === 'abort') {
      const { recordingId } = z.object({ recordingId: z.string() }).parse(jsonBody)

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

      if (recording.raw_path) {
        await supabaseAdmin.storage
          .from('recordings')
          .remove([recording.raw_path])
      }

      await supabaseAdmin
        .from('recordings')
        .update({
          status: 'CREATED',
          raw_path: null,
        })
        .eq('id', recordingId)

      logRequest(logger, {
        method: 'POST',
        url: request.url,
        statusCode: 200,
        duration: Date.now() - startTime,
        userId: user.id,
      });

      return NextResponse.json({ success: true })
    }

    return NextResponse.json(
      { error: 'Invalid action' },
      { status: 400 }
    )
  } catch (error) {
    logger.error({ error: formatError(error) }, 'Upload error');
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
