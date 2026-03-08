/**
 * Client-side input sanitization utilities
 * Note: Server-side sanitization is the primary defense - this is defense-in-depth
 */

// Pattern to match potential XSS payloads
const XSS_PATTERNS = [
  /<script[^>]*>[\s\S]*?<\/script>/gi,
  /<script[^>]*\/>/gi,
  /javascript:/gi,
  /on\w+\s*=/gi,
  /<iframe[^>]*>[\s\S]*?<\/iframe>/gi,
];

/**
 * Sanitize a string to prevent XSS
 * Removes HTML tags and event handlers
 */
export function sanitizeString(input: string): string {
  if (!input || typeof input !== 'string') {
    return input;
  }

  let sanitized = input;

  // Remove XSS patterns
  for (const pattern of XSS_PATTERNS) {
    sanitized = sanitized.replace(pattern, '');
  }

  // Remove remaining HTML tags
  sanitized = sanitized.replace(/<[^>]*>/g, '');

  return sanitized.trim();
}

/**
 * Sanitize recording title for display
 * Truncates to safe length
 */
export function sanitizeRecordingTitle(title: string): string {
  const maxLength = 200;
  const sanitized = sanitizeString(title);
  return sanitized.slice(0, maxLength);
}

/**
 * Sanitize recording description for display
 * Truncates to safe length
 */
export function sanitizeRecordingDescription(description: string): string {
  const maxLength = 2000;
  const sanitized = sanitizeString(description);
  return sanitized.slice(0, maxLength);
}

/**
 * Check if a string contains potential XSS content
 */
export function containsXss(input: string): boolean {
  if (!input || typeof input !== 'string') {
    return false;
  }

  for (const pattern of XSS_PATTERNS) {
    if (pattern.test(input)) {
      return true;
    }
  }

  if (/<[^>]*>/.test(input)) {
    return true;
  }

  return false;
}

/**
 * Escape HTML special characters
 * Use when rendering user input to prevent XSS
 */
export function escapeHtml(input: string): string {
  if (!input || typeof input !== 'string') {
    return input;
  }

  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
