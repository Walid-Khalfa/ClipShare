import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/server'
import { checkRateLimit } from '@/lib/rate-limit'
import { z } from 'zod'

const RECORDINGS_ENDPOINT = '/api/recordings'

const createRecordingSchema = z.object({
  title: z.string().optional(),
  duration: z.number().optional(),
  mimeType: z.string().optional(),
})

const updateRecordingSchema = z.object({
  title: z.string().optional(),
  description: z.string().optional(),
})

// CSRF protection middleware for state-changing operations
function checkCsrfForMutations(request: NextRequest): NextResponse | null {
  const stateChangingMethods = ['POST', 'PATCH', 'DELETE'];
  
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

// GET /api/recordings - List all recordings for authenticated user
export async function GET(request: NextRequest) {
  console.log('=== GET /api/recordings STARTED ===')
  console.log('Env check:')
  console.log('  NEXT_PUBLIC_SUPABASE_URL:', process.env.NEXT_PUBLIC_SUPABASE_URL ? 'SET' : 'MISSING')
  console.log('  SUPABASE_SERVICE_ROLE_KEY:', process.env.SUPABASE_SERVICE_ROLE_KEY ? 'SET' : 'MISSING')
  
  try {
    // Check rate limit using database-backed solution
    const rateLimitResult = await checkRateLimit(request, RECORDINGS_ENDPOINT)
    console.log('Rate limit check:', rateLimitResult.allowed ? 'PASSED' : 'BLOCKED')
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

    console.log('Creating auth client...')
    const supabase = await createClient()
    console.log('Getting user...')
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    console.log('Auth result:', { user: user?.id || null, authError: authError?.message })

    if (authError || !user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    const { searchParams } = new URL(request.url)
    const page = parseInt(searchParams.get('page') || '1')
    const limit = parseInt(searchParams.get('limit') || '10')
    const skip = (page - 1) * limit

    console.log('Creating admin client...')
    const supabaseAdmin = createAdminClient()
    console.log(`Fetching recordings: page=${page}, limit=${limit}, skip=${skip}`)
    
    const { data: recordings, error: listError, count } = await supabaseAdmin
      .from('recordings')
      .select('*', { count: 'exact' })
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .range(skip, skip + limit - 1)

    console.log('Supabase response:', { data: recordings, error: listError, count })

    if (listError) {
      console.error('List recordings error:', {
        message: listError.message,
        details: listError.details,
        hint: listError.hint,
        code: listError.code,
      })
      return NextResponse.json(
        { error: 'Failed to fetch recordings' },
        { status: 500 }
      )
    }

    console.log('=== GET /api/recordings SUCCESS ===')
    return NextResponse.json({
      data: recordings || [],
      pagination: {
        page,
        limit,
        total: count || 0,
        pages: Math.ceil((count || 0) / limit),
      },
    })
  } catch (error) {
    console.error('=== GET /api/recordings CATCH BLOCK ===')
    console.error('Error type:', error?.constructor?.name)
    console.error('Error message:', error instanceof Error ? error.message : String(error))
    console.error('Error cause:', (error as { cause?: unknown })?.cause)
    console.error('Error stack:', error instanceof Error ? error.stack : 'N/A')
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

// POST /api/recordings - Create a new recording
export async function POST(request: NextRequest) {
  try {
    // CSRF protection
    const csrfError = checkCsrfForMutations(request);
    if (csrfError) return csrfError;

    // Check rate limit using database-backed solution
    const rateLimitResult = await checkRateLimit(request, RECORDINGS_ENDPOINT)
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

    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    const body = createRecordingSchema.parse(await request.json())

    const supabaseAdmin = createAdminClient()
    const { data, error } = await supabaseAdmin
      .from('recordings')
      .insert({
        user_id: user.id,
        title: body.title || 'Untitled Recording',
        duration: body.duration,
        mime_type: body.mimeType,
        status: 'CREATED',
      })
      .select()
      .single()

    if (error) {
      console.error('Create recording error:', error)
      return NextResponse.json(
        { error: 'Failed to create recording' },
        { status: 500 }
      )
    }

    return NextResponse.json(data)
  } catch (error) {
    console.error('Create recording error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

// PATCH /api/recordings - Update a recording
export async function PATCH(request: NextRequest) {
  try {
    // CSRF protection
    const csrfError = checkCsrfForMutations(request);
    if (csrfError) return csrfError;

    // Check rate limit using database-backed solution
    const rateLimitResult = await checkRateLimit(request, RECORDINGS_ENDPOINT)
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

    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')

    if (!id) {
      return NextResponse.json(
        { error: 'Recording ID is required' },
        { status: 400 }
      )
    }

    const body = updateRecordingSchema.parse(await request.json())

    const supabaseAdmin = createAdminClient()
    
    // Verify ownership
    const { data: existing } = await supabaseAdmin
      .from('recordings')
      .select('*')
      .eq('id', id)
      .eq('user_id', user.id)
      .single()

    if (!existing) {
      return NextResponse.json(
        { error: 'Recording not found' },
        { status: 404 }
      )
    }

    const { data, error } = await supabaseAdmin
      .from('recordings')
      .update({
        title: body.title,
        description: body.description,
      })
      .eq('id', id)
      .select()
      .single()

    if (error) {
      return NextResponse.json(
        { error: 'Failed to update recording' },
        { status: 500 }
      )
    }

    return NextResponse.json(data)
  } catch (error) {
    console.error('Update recording error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

// DELETE /api/recordings - Delete a recording
export async function DELETE(request: NextRequest) {
  try {
    // CSRF protection
    const csrfError = checkCsrfForMutations(request);
    if (csrfError) return csrfError;

    // Check rate limit using database-backed solution
    const rateLimitResult = await checkRateLimit(request, RECORDINGS_ENDPOINT)
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

    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')

    if (!id) {
      return NextResponse.json(
        { error: 'Recording ID is required' },
        { status: 400 }
      )
    }

    const supabaseAdmin = createAdminClient()
    
    // Verify ownership
    const { data: recording } = await supabaseAdmin
      .from('recordings')
      .select('*')
      .eq('id', id)
      .eq('user_id', user.id)
      .single()

    if (!recording) {
      return NextResponse.json(
        { error: 'Recording not found' },
        { status: 404 }
      )
    }

    const { error } = await supabaseAdmin
      .from('recordings')
      .delete()
      .eq('id', id)

    if (error) {
      return NextResponse.json(
        { error: 'Failed to delete recording' },
        { status: 500 }
      )
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Delete recording error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
