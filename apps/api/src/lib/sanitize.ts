/**
 * Input sanitization utilities to prevent XSS attacks
 */

// Pattern to match potential XSS payloads
const XSS_PATTERNS = [
  /<script[^>]*>[\s\S]*?<\/script>/gi,
  /<script[^>]*\/>/gi,
  /javascript:/gi,
  /on\w+\s*=/gi,  // event handlers like onclick=, onerror=
  /<iframe[^>]*>[\s\S]*?<\/iframe>/gi,
  /<object[^>]*>[\s\S]*?<\/object>/gi,
  /<embed[^>]*\/?>/gi,
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

  // Trim whitespace
  sanitized = sanitized.trim();

  return sanitized;
}

/**
 * Sanitize an object's string properties recursively
 */
export function sanitizeObject<T extends Record<string, unknown>>(obj: T): T {
  const sanitized = { ...obj };

  for (const key in sanitized) {
    if (Object.prototype.hasOwnProperty.call(sanitized, key)) {
      const value = sanitized[key];

      if (typeof value === 'string') {
        (sanitized as Record<string, unknown>)[key] = sanitizeString(value);
      } else if (typeof value === 'object' && value !== null) {
        if (Array.isArray(value)) {
          (sanitized as Record<string, unknown>)[key] = value.map(item =>
            typeof item === 'string' ? sanitizeString(item) : item
          );
        } else {
          (sanitized as Record<string, unknown>)[key] = sanitizeObject(value as Record<string, unknown>);
        }
      }
    }
  }

  return sanitized;
}

/**
 * Check if a string contains potential XSS content
 * Use for validation before sanitization
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

  // Check for HTML tags
  if (/<[^>]*>/.test(input)) {
    return true;
  }

  return false;
}

/**
 * Sanitize recording title for display
 * Truncates to safe length and removes XSS
 */
export function sanitizeRecordingTitle(title: string): string {
  const maxLength = 200;
  const sanitized = sanitizeString(title);
  return sanitized.slice(0, maxLength);
}

/**
 * Sanitize recording description for display
 * Truncates to safe length and removes XSS
 */
export function sanitizeRecordingDescription(description: string): string {
  const maxLength = 2000;
  const sanitized = sanitizeString(description);
  return sanitized.slice(0, maxLength);
}
