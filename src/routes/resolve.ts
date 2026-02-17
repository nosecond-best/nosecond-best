import { Hono } from 'hono';
import { config } from '../config.js';
import { getNameRecord, getResolution } from '../db/names.js';

export const resolveRouter = new Hono();

/**
 * GET /api/v1/resolve/:name
 * Resolve a name to its payment information
 */
resolveRouter.get('/api/v1/resolve/:name', (c) => {
  const { name } = c.req.param();
  const normalized = name.toLowerCase().trim();

  const record = getNameRecord(normalized);
  if (!record) {
    return c.json({ error: 'Name not found', name: normalized }, 404);
  }

  const resolution = getResolution(record.id);

  return c.json({
    name: record.name,
    domain: record.domain,
    owner: record.owner_pubkey,
    registered_at: record.registered_at,
    expires_at: record.expires_at,
    resolution: resolution ? {
      onchain: resolution.onchain_address,
      lightning: resolution.lightning,
      lnurl: resolution.lnurl,
      bolt12: resolution.bolt12,
      silent_payment: resolution.silent_payment,
      nostr: resolution.nostr_pubkey,
      web: resolution.web_url,
      updated: resolution.updated_ts,
    } : null,
  });
});

/**
 * GET /.well-known/lnurlp/:name
 * Lightning Address (LNURL-pay) compatible endpoint
 */
resolveRouter.get('/.well-known/lnurlp/:name', (c) => {
  const { name } = c.req.param();
  const normalized = name.toLowerCase().trim();

  const record = getNameRecord(normalized);
  if (!record) {
    return c.json({ status: 'ERROR', reason: 'Name not found' }, 404);
  }

  const resolution = getResolution(record.id);
  if (!resolution?.lnurl && !resolution?.lightning) {
    return c.json({ status: 'ERROR', reason: 'No Lightning address configured' }, 404);
  }

  // Basic LNURL-pay response
  // In production, this would proxy to the user's actual LNURL endpoint
  // or generate invoices via their Lightning node
  return c.json({
    status: 'OK',
    tag: 'payRequest',
    commentAllowed: 255,
    callback: `https://${config.domain}/api/v1/lnurl/callback/${normalized}`,
    minSendable: 1000,      // 1 sat
    maxSendable: 100000000000, // 1 BTC in msats
    metadata: JSON.stringify([
      ['text/plain', `Payment to ₿${normalized}@${config.domain}`],
      ['text/identifier', `${normalized}@${config.domain}`],
    ]),
  });
});

/**
 * GET /api/v1/bip353/:name
 * Return BIP-353 compatible DNS TXT record content
 */
resolveRouter.get('/api/v1/bip353/:name', (c) => {
  const { name } = c.req.param();
  const normalized = name.toLowerCase().trim();

  const record = getNameRecord(normalized);
  if (!record) {
    return c.json({ error: 'Name not found' }, 404);
  }

  const resolution = getResolution(record.id);
  if (!resolution) {
    return c.json({ error: 'No resolution data' }, 404);
  }

  // Build BIP-21 URI for BIP-353 TXT record
  const params: string[] = [];
  if (resolution.lightning) params.push(`lightning=${resolution.lightning}`);
  if (resolution.bolt12) params.push(`b12=${resolution.bolt12}`);
  if (resolution.lnurl) params.push(`lno=${resolution.lnurl}`);

  const address = resolution.onchain_address || '';
  const query = params.length > 0 ? `?${params.join('&')}` : '';
  const uri = `bitcoin:${address}${query}`;

  return c.json({
    name: normalized,
    domain: config.domain,
    dns_label: `${normalized}.user._bitcoin-payment.${config.domain}`,
    txt_record: uri,
  });
});
