import { describe, it, expect } from 'vitest';
import { isReserved, getReservedCategory } from '../data/reserved-names.js';

describe('Reserved Names', () => {
  it('flags 1-3 char names as ultra-premium', () => {
    expect(isReserved('a')).toBe(true);
    expect(isReserved('ab')).toBe(true);
    expect(isReserved('abc')).toBe(true);
    expect(getReservedCategory('a')).toBe('ultra-premium');
    expect(getReservedCategory('xy')).toBe('ultra-premium');
    expect(getReservedCategory('123')).toBe('ultra-premium');
  });

  it('flags bitcoin terms', () => {
    expect(isReserved('bitcoin')).toBe(true);
    expect(isReserved('satoshi')).toBe(true);
    expect(isReserved('hodl')).toBe(true);
    expect(getReservedCategory('bitcoin')).toBe('bitcoin-term');
    expect(getReservedCategory('lightning')).toBe('bitcoin-term');
  });

  it('flags common first names', () => {
    expect(isReserved('alice')).toBe(true);
    expect(getReservedCategory('alice')).toBe('common-name');
  });

  it('flags common words', () => {
    expect(isReserved('wallet')).toBe(true);
    expect(getReservedCategory('admin')).toBe('common-word');
  });

  it('allows normal names', () => {
    expect(isReserved('mybitcoinname')).toBe(false);
    expect(getReservedCategory('mybitcoinname')).toBeNull();
    expect(isReserved('coolthing2025')).toBe(false);
  });

  it('is case insensitive', () => {
    expect(isReserved('BITCOIN')).toBe(true);
    expect(isReserved('Alice')).toBe(true);
  });

  // Ultra-premium overrides other categories for short names
  it('short bitcoin terms get ultra-premium category', () => {
    expect(getReservedCategory('btc')).toBe('ultra-premium'); // 3 chars = ultra-premium first
  });
});
