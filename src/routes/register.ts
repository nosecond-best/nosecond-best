import { Hono } from 'hono';
import { config, getPrice } from '../config.js';
import { isNameAvailable, registerName, getNameRecord, upsertResolution, getResolution } from '../db/names.js';
import { validateName, validatePubkey, normalizePubkey } from '../utils/validation.js';
import { isReserved, getReservedCategory } from '../data/reserved-names.js';
import { getLightningProvider, createPendingPayment, getPendingPayment, markPaymentPaid } from '../services/lightning.js';
import { publishNameEvent } from '../services/nostr.js';

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

  const reserved = isReserved(normalized);
  const available = !reserved && isNameAvailable(normalized);
  const price = getPrice(normalized);

  return c.json({
    name: normalized,
    domain: config.domain,
    available,
    reserved,
    reserved_category: getReservedCategory(normalized),
    price_sats: available ? price : null,
    display: `₿${normalized}@${config.domain}`,
  });
});

/**
 * POST /api/v1/register
 * Start registration — returns a Lightning invoice
 *
 * Body: { name: string, owner_pubkey: string, resolution?: {...} }
 */
registerRouter.post('/api/v1/register', async (c) => {
  const body = await c.req.json();
  const { name, owner_pubkey, resolution } = body;

  const normalized = name?.toLowerCase().trim();
  const nameValidation = validateName(normalized);
  if (!nameValidation.valid) {
    return c.json({ error: nameValidation.error }, 400);
  }

  // Check reserved names
  if (isReserved(normalized)) {
    return c.json({ error: 'This name is reserved', category: getReservedCategory(normalized) }, 403);
  }

  const pubkeyValidation = validatePubkey(owner_pubkey);
  if (!pubkeyValidation.valid) {
    return c.json({ error: pubkeyValidation.error }, 400);
  }

  if (!isNameAvailable(normalized)) {
    return c.json({ error: 'Name is already taken' }, 409);
  }

  const normalizedPubkey = normalizePubkey(owner_pubkey);
  const price = getPrice(normalized);

  // Create Lightning invoice
  const lightning = getLightningProvider();
  const invoice = await lightning.createInvoice(price, `₿${normalized}@${config.domain}`);

  // Store pending payment
  createPendingPayment(normalized, price, invoice.payment_hash, normalizedPubkey);

  // Store resolution data in the payment metadata (we'll apply it on confirm)
  // For simplicity, we stash it as a query param approach — store in memory or extend DB
  // For now, the confirm endpoint re-accepts resolution data

  return c.json({
    status: 'invoice_created',
    name: normalized,
    domain: config.domain,
    display: `₿${normalized}@${config.domain}`,
    price_sats: price,
    payment_hash: invoice.payment_hash,
    payment_request: invoice.payment_request,
    expires_at: invoice.expires_at,
  }, 200);
});

/**
 * POST /api/v1/register/confirm
 * Confirm registration after payment
 *
 * Body: { payment_hash: string, resolution?: {...} }
 */
registerRouter.post('/api/v1/register/confirm', async (c) => {
  const body = await c.req.json();
  const { payment_hash, resolution } = body;

  if (!payment_hash) {
    return c.json({ error: 'payment_hash is required' }, 400);
  }

  const payment = getPendingPayment(payment_hash);
  if (!payment) {
    return c.json({ error: 'Payment not found or expired' }, 404);
  }

  // Verify payment
  const lightning = getLightningProvider();
  const status = await lightning.checkPayment(payment_hash);
  if (!status.paid) {
    return c.json({ error: 'Payment not yet received', payment_hash }, 402);
  }

  // Check name still available
  if (!isNameAvailable(payment.name)) {
    return c.json({ error: 'Name was taken while awaiting payment' }, 409);
  }

  // Register the name
  markPaymentPaid(payment_hash);
  const blockHeight = 0; // TODO: get from Bitcoin node
  const record = registerName(payment.name, payment.owner_pubkey, blockHeight);

  // Store resolution data
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

  // Publish to Nostr (async, best-effort)
  const resData = record.id ? getResolution(record.id) : undefined;
  publishNameEvent(record, resData).catch(err => {
    console.warn('[nostr] Failed to publish:', err);
  });

  return c.json({
    success: true,
    name: record.name,
    domain: record.domain,
    display: `₿${record.name}@${record.domain}`,
    owner: record.owner_pubkey,
    registered_at: record.registered_at,
    expires_at: record.expires_at,
    price_sats: payment.amount_sats,
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
