/**
 * Environment validation utilities for ClipShare
 * 
 * IMPORTANT: JWT_SECRET must be set to a secure random value in production.
 * Generate a secure secret using: openssl rand -base64 32
 * 
 * Using default or insecure secrets will cause authentication failures
 * and may expose user sessions to security vulnerabilities.
 */

const DEFAULT_JWT_SECRETS = [
  'dev-secret-change-in-production',
  'development-secret',
  'changeme',
  'secret',
  'password',
  'admin',
  '123456',
];

export function validateEnvironment(): void {
  // Skip validation during build time
  const isBuildTime = typeof window === 'undefined' && 
    (process.env.NEXT_PHASE || process.env.NODE_ENV === 'production');
  
  const jwtSecret = process.env.JWT_SECRET;
  
  if (!jwtSecret) {
    // In development or build time, warn but don't block
    if (process.env.NODE_ENV === 'development' || isBuildTime) {
      console.warn('WARNING: JWT_SECRET is not set. Authentication may not work correctly.');
      return;
    }
    // In production, block startup
    throw new Error('JWT_SECRET is required in production. Generate a secure secret using: openssl rand -base64 32');
  }
  
  // Check for default/insecure secrets (only at runtime, not build)
  if (!isBuildTime && DEFAULT_JWT_SECRETS.some(defaultSecret => 
    jwtSecret.toLowerCase().includes(defaultSecret.toLowerCase())
  )) {
    throw new Error(
      'JWT_SECRET appears to be a default or insecure value. ' +
      'Generate a secure secret using: openssl rand -base64 32'
    );
  }
  
  // Check minimum length (only at runtime, not build)
  if (!isBuildTime && jwtSecret.length < 32) {
    throw new Error(
      'JWT_SECRET must be at least 32 characters. ' +
      'Generate a secure secret using: openssl rand -base64 32'
    );
  }
}

// File size configuration
export const MAX_FILE_SIZE = parseInt(process.env.MAX_FILE_SIZE || '524288000', 10); // 500MB default
export const MAX_FILE_SIZE_MB = MAX_FILE_SIZE / (1024 * 1024);

export function validateFileSize(fileSize: number): { valid: boolean; error?: string } {
  if (fileSize > MAX_FILE_SIZE) {
    return {
      valid: false,
      error: `File too large. Maximum allowed size is ${MAX_FILE_SIZE_MB}MB.`,
    };
  }
  return { valid: true };
}
