import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'

const MAGIC_LINK_GENERIC_ERROR = 'Unable to send magic link right now'

function getMagicLinkErrorMessage(error: unknown): string {
  const cause = (error as { cause?: { code?: string; hostname?: string } })?.cause
  const code = cause?.code
  const hostname = cause?.hostname

  if (code === 'ENOTFOUND') {
    return `Cannot reach Supabase host${hostname ? ` (${hostname})` : ''}. Check NEXT_PUBLIC_SUPABASE_URL and DNS/network access.`
  }

  if (error instanceof Error && error.message.toLowerCase().includes('fetch failed')) {
    return 'Cannot reach Supabase Auth. Check NEXT_PUBLIC_SUPABASE_URL and your network/DNS settings.'
  }

  return MAGIC_LINK_GENERIC_ERROR
}

export async function POST(request: NextRequest) {
  console.log('=== MAGIC LINK REQUEST STARTED ===')
  console.log('Env check:')
  console.log('  NEXT_PUBLIC_SUPABASE_URL:', process.env.NEXT_PUBLIC_SUPABASE_URL ? 'SET' : 'MISSING')
  console.log('  SUPABASE_SERVICE_ROLE_KEY:', process.env.SUPABASE_SERVICE_ROLE_KEY ? 'SET' : 'MISSING')
  console.log('  APP_URL:', process.env.APP_URL || 'NOT SET')
  console.log('  NEXT_PUBLIC_APP_URL:', process.env.NEXT_PUBLIC_APP_URL || 'NOT SET')
  
  try {
    const body = await request.json()
    console.log('Request body:', body)
    const { email } = body

    if (!email || typeof email !== 'string') {
      console.log('Validation failed: invalid email')
      return NextResponse.json(
        { error: 'Email is required' },
        { status: 400 }
      )
    }

    console.log('Creating Supabase admin client...')
    const supabaseAdmin = createAdminClient()
    
    const appUrl =
      process.env.APP_URL ||
      process.env.NEXT_PUBLIC_APP_URL ||
      request.nextUrl.origin

    console.log('App URL:', appUrl)
    console.log('Sending OTP to:', email)
    
    const { data, error } = await supabaseAdmin.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${appUrl}/auth/verify`,
      },
    })

    console.log('Supabase response:', { data, error })

    if (error) {
      console.error('Magic link error:', {
        message: error.message,
        status: error.status,
        name: error.name,
        stack: error.stack,
      })
      return NextResponse.json(
        { error: MAGIC_LINK_GENERIC_ERROR },
        { status: 500 }
      )
    }

    console.log('=== MAGIC LINK SUCCESS ===')
    // Always return success to prevent email enumeration
    return NextResponse.json({
      success: true,
      message: 'If that email exists, a magic link has been sent'
    })
  } catch (error) {
    console.error('=== MAGIC LINK CATCH BLOCK ===')
    console.error('Error type:', error?.constructor?.name)
    console.error('Error message:', error instanceof Error ? error.message : String(error))
    console.error('Error stack:', error instanceof Error ? error.stack : 'N/A')
    console.error('Error cause:', (error as { cause?: unknown })?.cause)
    return NextResponse.json(
      { error: getMagicLinkErrorMessage(error) },
      { status: 500 }
    )
  }
}
