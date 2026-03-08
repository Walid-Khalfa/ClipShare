import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

/**
 * CSP Nonce Middleware
 * 
 * Generates and injects CSP nonces into responses for use with inline scripts.
 * This enables strict CSP without using 'unsafe-inline'.
 * 
 * The nonce is a base64-encoded random string that changes on every request.
 */

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon)
     * - public files
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};

function generateNonce(): string {
  // Use Web Crypto API in middleware context
  const array = new Uint8Array(16);
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    crypto.getRandomValues(array);
  } else {
    // Fallback for edge cases
    for (let i = 0; i < 16; i++) {
      array[i] = Math.floor(Math.random() * 256);
    }
  }
  return Buffer.from(array).toString('base64');
}

export function middleware(request: NextRequest) {
  const response = NextResponse.next();
  
  // Only apply nonce in production
  if (process.env.NODE_ENV === 'production') {
    const nonce = generateNonce();
    
    // Set CSP header with nonce
    // Note: Next.js will add its own CSP, so we modify the existing one or add a new header
    const cspHeaderValue = [
      "default-src 'self'",
      "script-src 'self' 'nonce-" + nonce + "' 'strict-dynamic'",
      "style-src 'self' 'nonce-" + nonce + "'",
      "img-src 'self' data: blob: https://*.supabase.co https://*.supabase.storage",
      "media-src 'self' blob: https://*.supabase.co https://*.supabase.storage",
      "connect-src 'self' https://*.supabase.co https://*.supabase.storage wss://*.supabase.co",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join('; ');
    
    response.headers.set('Content-Security-Policy', cspHeaderValue);
    
    // Add nonce to headers for use in components
    response.headers.set('x-csp-nonce', nonce);
  }
  
  return response;
}
