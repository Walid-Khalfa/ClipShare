import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { checkRateLimit } from '@/lib/rate-limit'

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
  // Rate limiting: 5 requests per hour per IP
  const rateLimitResult = await checkRateLimit(request, '/api/auth/magic-link', { 
    maxRequests: 5, 
    windowSeconds: 3600 
  });
  
  if (!rateLimitResult.allowed) {
    return NextResponse.json(
      { error: 'Too many requests. Please try again later.' },
      { 
        status: 429,
        headers: rateLimitResult.resetAt ? {
          'Retry-After': Math.ceil((rateLimitResult.resetAt.getTime() - Date.now()) / 1000).toString()
        } : {}
      }
    );
  }

  // Validate Content-Type header to prevent CSRF attacks
  const contentType = request.headers.get('content-type') || '';
  if (!contentType.includes('application/json')) {
    return NextResponse.json(
      { error: 'Content-Type must be application/json' },
      { status: 400 }
    );
  }

  // Check Origin header for CSRF protection
  const origin = request.headers.get('origin');
  const allowedOrigin = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
  if (origin && origin !== allowedOrigin) {
    return NextResponse.json(
      { error: 'Invalid origin' },
      { status: 403 }
    );
  }
  
  try {
    const body = await request.json();
    const { email } = body;

    if (!email || typeof email !== 'string') {
      return NextResponse.json(
        { error: 'Email is required' },
        { status: 400 }
      );
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return NextResponse.json(
        { error: 'Invalid email format' },
        { status: 400 }
      );
    }

    const supabaseAdmin = createAdminClient();
    
    const appUrl =
      process.env.APP_URL ||
      process.env.NEXT_PUBLIC_APP_URL ||
      request.nextUrl.origin;

    const { data, error } = await supabaseAdmin.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${appUrl}/auth/verify`,
      },
    });

    if (error) {
      // Log error securely without exposing sensitive details
      console.error('Magic link error:', {
        error: error.name,
        status: error.status,
      });
      return NextResponse.json(
        { error: MAGIC_LINK_GENERIC_ERROR },
        { status: 500 }
      );
    }

    // Always return success to prevent email enumeration attacks
    return NextResponse.json({
      success: true,
      message: 'If that email exists, a magic link has been sent'
    });
  } catch (error) {
    console.error('Magic link request failed:', {
      error: error instanceof Error ? error.name : 'Unknown',
    });
    return NextResponse.json(
      { error: getMagicLinkErrorMessage(error) },
      { status: 500 }
    );
  }
}
