import { config } from '../config.js';

export interface ValidationResult {
  valid: boolean;
  error?: string;
}

/**
 * Validate a name against protocol rules
 */
export function validateName(name: string): ValidationResult {
  if (!name) {
    return { valid: false, error: 'Name is required' };
  }

  const normalized = name.toLowerCase().trim();

  if (normalized.length < config.nameMinLength) {
    return { valid: false, error: `Name must be at least ${config.nameMinLength} character` };
  }

  if (normalized.length > config.nameMaxLength) {
    return { valid: false, error: `Name must be at most ${config.nameMaxLength} characters` };
  }

  if (!config.namePattern.test(normalized)) {
    return {
      valid: false,
      error: 'Name must contain only lowercase letters, numbers, hyphens, and underscores. Cannot start or end with a hyphen.',
    };
  }

  return { valid: true };
}

/**
 * Validate a hex-encoded secp256k1 public key
 */
export function validatePubkey(pubkey: string): ValidationResult {
  if (!pubkey) {
    return { valid: false, error: 'Public key is required' };
  }

  // Accept 32-byte (x-only / Nostr) or 33-byte (compressed) hex
  const cleaned = pubkey.toLowerCase().replace(/^0x/, '');

  if (cleaned.length === 64) {
    // 32-byte x-only pubkey (Nostr format)
    if (!/^[0-9a-f]{64}$/.test(cleaned)) {
      return { valid: false, error: 'Invalid public key format' };
    }
    return { valid: true };
  }

  if (cleaned.length === 66) {
    // 33-byte compressed pubkey
    if (!/^(02|03)[0-9a-f]{64}$/.test(cleaned)) {
      return { valid: false, error: 'Invalid compressed public key' };
    }
    return { valid: true };
  }

  return { valid: false, error: 'Public key must be 32 bytes (hex, x-only) or 33 bytes (hex, compressed)' };
}

/**
 * Normalize a pubkey to 32-byte x-only hex (Nostr format)
 */
export function normalizePubkey(pubkey: string): string {
  const cleaned = pubkey.toLowerCase().replace(/^0x/, '');
  if (cleaned.length === 66) {
    // Strip the prefix byte
    return cleaned.slice(2);
  }
  return cleaned;
}
