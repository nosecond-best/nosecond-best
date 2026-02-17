import { describe, it, expect } from 'vitest';
import { validateName, validatePubkey, normalizePubkey } from '../utils/validation.js';

describe('Name Validation', () => {
  it('should accept valid names', () => {
    expect(validateName('alice').valid).toBe(true);
    expect(validateName('bob123').valid).toBe(true);
    expect(validateName('my-name').valid).toBe(true);
    expect(validateName('a').valid).toBe(true);
    expect(validateName('test_name').valid).toBe(true);
  });

  it('should reject empty names', () => {
    expect(validateName('').valid).toBe(false);
  });

  it('should reject names starting with hyphen', () => {
    expect(validateName('-alice').valid).toBe(false);
  });

  it('should reject names with invalid characters', () => {
    expect(validateName('alice!').valid).toBe(false);
    expect(validateName('alice bob').valid).toBe(false);
    expect(validateName('alice@bob').valid).toBe(false);
  });

  it('should reject names that are too long', () => {
    expect(validateName('a'.repeat(65)).valid).toBe(false);
  });
});

describe('Pubkey Validation', () => {
  it('should accept 32-byte hex (x-only)', () => {
    const pk = 'a'.repeat(64);
    expect(validatePubkey(pk).valid).toBe(true);
  });

  it('should accept 33-byte compressed hex', () => {
    const pk = '02' + 'a'.repeat(64);
    expect(validatePubkey(pk).valid).toBe(true);
  });

  it('should reject invalid length', () => {
    expect(validatePubkey('abc').valid).toBe(false);
  });

  it('should reject invalid prefix for compressed', () => {
    const pk = '05' + 'a'.repeat(64);
    expect(validatePubkey(pk).valid).toBe(false);
  });
});

describe('normalizePubkey', () => {
  it('should strip compressed prefix', () => {
    const pk = '02' + 'ab'.repeat(32);
    expect(normalizePubkey(pk)).toBe('ab'.repeat(32));
  });

  it('should keep x-only as is', () => {
    const pk = 'ab'.repeat(32);
    expect(normalizePubkey(pk)).toBe(pk);
  });
});
