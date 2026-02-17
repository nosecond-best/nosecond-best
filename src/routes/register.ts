import { Hono } from 'hono';
import { config, getPrice } from '../config.js';
import { isNameAvailable, registerName, getNameRecord, upsertResolution } from '../db/names.js';
import { validateName, validatePubkey, normalizePubkey } from '../utils/validation.js';

export const registerRouter = new Hono();

/**
 * GET /api/v1/check/:name
 * Check if a name is available and get pricing
 */
registerRouter.get('/api/v1/check/:name', (c) => {
  const { name } = c.req.param();
  const normalized = name.toLowerCase().trim();

  const validation = validateName(normalized);
  if (!validation.valid) {
    return c.json({ available: false, error: validation.error }, 400);
  }

  const available = isNameAvailable(normalized);
  const price = getPrice(normalized);

  return c.json({
    name: normalized,
    domain: config.domain,
    available,
    price_sats: available ? price : null,
    display: `₿${normalized}@${config.domain}`,
  });
});

/**
 * POST /api/v1/register
 * Register a new name
 *
 * Body: { name: string, owner_pubkey: string }
 *
 * In production, this would:
 * 1. Create a Lightning invoice
 * 2. Wait for payment
 * 3. Register the name
 *
 * For MVP, we register directly (payment integration comes next)
 */
registerRouter.post('/api/v1/register', async (c) => {
  const body = await c.req.json();
  const { name, owner_pubkey, resolution } = body;

  // Validate name
  const normalized = name?.toLowerCase().trim();
  const nameValidation = validateName(normalized);
  if (!nameValidation.valid) {
    return c.json({ error: nameValidation.error }, 400);
  }

  // Validate pubkey
  const pubkeyValidation = validatePubkey(owner_pubkey);
  if (!pubkeyValidation.valid) {
    return c.json({ error: pubkeyValidation.error }, 400);
  }

  // Check availability
  if (!isNameAvailable(normalized)) {
    return c.json({ error: 'Name is already taken' }, 409);
  }

  const normalizedPubkey = normalizePubkey(owner_pubkey);
  const price = getPrice(normalized);

  // TODO: In production, create Lightning invoice here and return it
  // For now, register directly (simulating paid)
  const blockHeight = 0; // TODO: get from Bitcoin node

  const record = registerName(normalized, normalizedPubkey, blockHeight);

  // If resolution data was provided, store it
  if (resolution && record.id) {
    upsertResolution(record.id, {
      onchain_address: resolution.onchain || null,
      lightning: resolution.lightning || null,
      lnurl: resolution.lnurl || null,
      bolt12: resolution.bolt12 || null,
      silent_payment: resolution.silent_payment || null,
      nostr_pubkey: resolution.nostr || null,
      web_url: resolution.web || null,
    });
  }

  return c.json({
    success: true,
    name: record.name,
    domain: record.domain,
    display: `₿${record.name}@${record.domain}`,
    owner: record.owner_pubkey,
    registered_at: record.registered_at,
    expires_at: record.expires_at,
    price_sats: price,
    // TODO: payment_request (Lightning invoice)
  }, 201);
});

/**
 * POST /api/v1/update
 * Update resolution data for a name
 *
 * Body: { name: string, owner_pubkey: string, signature: string, resolution: {...} }
 *
 * In production, signature verification ensures only the owner can update
 */
registerRouter.post('/api/v1/update', async (c) => {
  const body = await c.req.json();
  const { name, owner_pubkey, resolution } = body;

  const normalized = name?.toLowerCase().trim();
  const record = getNameRecord(normalized);

  if (!record) {
    return c.json({ error: 'Name not found' }, 404);
  }

  const normalizedPubkey = normalizePubkey(owner_pubkey);
  if (record.owner_pubkey !== normalizedPubkey) {
    return c.json({ error: 'Not the owner of this name' }, 403);
  }

  // TODO: Verify signature in production

  if (resolution) {
    upsertResolution(record.id, {
      onchain_address: resolution.onchain ?? undefined,
      lightning: resolution.lightning ?? undefined,
      lnurl: resolution.lnurl ?? undefined,
      bolt12: resolution.bolt12 ?? undefined,
      silent_payment: resolution.silent_payment ?? undefined,
      nostr_pubkey: resolution.nostr ?? undefined,
      web_url: resolution.web ?? undefined,
    });
  }

  return c.json({
    success: true,
    name: record.name,
    display: `₿${record.name}@${record.domain}`,
    updated: true,
  });
});
