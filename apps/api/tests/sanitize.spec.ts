import { describe, it, expect } from 'vitest';
import {
  sanitizeString,
  sanitizeObject,
  containsXss,
  sanitizeRecordingTitle,
  sanitizeRecordingDescription,
} from '../src/lib/sanitize.js';

describe('Sanitize Module', () => {
  describe('sanitizeString', () => {
    it('should remove script tags', () => {
      const input = '<script>alert("XSS")</script>';
      expect(sanitizeString(input)).toBe('');
    });

    it('should remove self-closing script tags', () => {
      const input = '<script />';
      expect(sanitizeString(input)).toBe('');
    });

    it('should remove event handlers', () => {
      const input = '<div onclick="alert(\'xss\')">Click me</div>';
      expect(sanitizeString(input)).toBe('Click me');
    });

    it('should remove iframe tags', () => {
      const input = '<iframe src="http://evil.com"></iframe>';
      expect(sanitizeString(input)).toBe('');
    });

    it('should remove object tags', () => {
      const input = '<object data="evil.swf"></object>';
      expect(sanitizeString(input)).toBe('');
    });

    it('should remove embed tags', () => {
      const input = '<embed src="evil.swf" />';
      expect(sanitizeString(input)).toBe('');
    });

    it('should remove javascript: protocol', () => {
      const input = '<a href="javascript:alert(\'xss\')">Link</a>';
      expect(sanitizeString(input)).toBe('Link');
    });

    it('should remove all HTML tags', () => {
      const input = '<p>Hello <b>World</b></p>';
      expect(sanitizeString(input)).toBe('Hello World');
    });

    it('should trim whitespace', () => {
      const input = '   Hello World   ';
      expect(sanitizeString(input)).toBe('Hello World');
    });

    it('should return non-string input unchanged', () => {
      const input = 12345;
      expect(sanitizeString(input as unknown as string)).toBe(12345 as unknown as string);
    });

    it('should handle null/undefined', () => {
      expect(sanitizeString(null as unknown as string)).toBe(null as unknown as string);
      expect(sanitizeString(undefined as unknown as string)).toBe(undefined as unknown as string);
    });
  });

  describe('sanitizeObject', () => {
    it('should sanitize string properties', () => {
      const input = {
        title: '<script>alert("XSS")</script>',
        description: 'Safe description',
      };
      const result = sanitizeObject(input);
      expect(result.title).toBe('');
      expect(result.description).toBe('Safe description');
    });

    it('should handle nested objects', () => {
      const input = {
        metadata: {
          title: '<script>alert("XSS")</script>',
          tags: ['safe', '<script>evil</script>'],
        },
      };
      const result = sanitizeObject(input);
      expect(result.metadata.title).toBe('');
      expect(result.metadata.tags).toEqual(['safe', '']);
    });

    it('should preserve non-string values', () => {
      const input = {
        count: 42,
        active: true,
        title: 'Safe Title',
      };
      const result = sanitizeObject(input);
      expect(result.count).toBe(42);
      expect(result.active).toBe(true);
      expect(result.title).toBe('Safe Title');
    });
  });

  describe('containsXss', () => {
    it('should detect script tags', () => {
      expect(containsXss('<script>alert("XSS")</script>')).toBe(true);
    });

    it('should detect event handlers', () => {
      expect(containsXss('<div onclick="alert(\'xss\')">')).toBe(true);
    });

    it('should detect javascript: protocol', () => {
      expect(containsXss('javascript:alert("xss")')).toBe(true);
    });

    it('should detect HTML tags', () => {
      expect(containsXss('<iframe src="evil.com">')).toBe(true);
    });

    it('should return false for safe strings', () => {
      expect(containsXss('Safe string without HTML')).toBe(false);
      expect(containsXss('Price: $100')).toBe(false);
      // Note: containsXss returns true for any string with < > pairs that look like tags
      // This is intentional for security - we err on the side of caution
      expect(containsXss('Safe text with comparison: 5 < 10')).toBe(false);
    });

    it('should handle null/undefined', () => {
      expect(containsXss(null as unknown as string)).toBe(false);
      expect(containsXss(undefined as unknown as string)).toBe(false);
    });
  });

  describe('sanitizeRecordingTitle', () => {
    it('should truncate titles over 200 characters', () => {
      const longTitle = 'A'.repeat(250);
      const result = sanitizeRecordingTitle(longTitle);
      expect(result.length).toBe(200);
    });

    it('should remove XSS content from titles', () => {
      const maliciousTitle = '<script>alert("XSS")</script>My Title';
      expect(sanitizeRecordingTitle(maliciousTitle)).toBe('My Title');
    });

    it('should handle normal titles', () => {
      const title = 'My Recording Title';
      expect(sanitizeRecordingTitle(title)).toBe('My Recording Title');
    });
  });

  describe('sanitizeRecordingDescription', () => {
    it('should truncate descriptions over 2000 characters', () => {
      const longDesc = 'A'.repeat(2500);
      const result = sanitizeRecordingDescription(longDesc);
      expect(result.length).toBe(2000);
    });

    it('should remove XSS content from descriptions', () => {
      const maliciousDesc = '<script>alert("XSS")</script>My Description';
      expect(sanitizeRecordingDescription(maliciousDesc)).toBe('My Description');
    });

    it('should handle normal descriptions', () => {
      const desc = 'This is a description of the recording.';
      expect(sanitizeRecordingDescription(desc)).toBe(desc);
    });
  });
});
