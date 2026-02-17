/**
 * DNS TXT record generation for BIP-353
 */
import { getDb } from '../db/schema.js';
import { config } from '../config.js';
import type { ResolutionRecord } from '../db/names.js';

interface NameWithResolution {
  name: string;
  domain: string;
  onchain_address: string | null;
  lightning: string | null;
  lnurl: string | null;
  bolt12: string | null;
  silent_payment: string | null;
}

/**
 * Build a BIP-21 URI from resolution data
 */
function buildBip21Uri(res: NameWithResolution): string | null {
  const params: string[] = [];
  if (res.lightning) params.push(`lightning=${res.lightning}`);
  if (res.bolt12) params.push(`b12=${res.bolt12}`);
  if (res.lnurl) params.push(`lno=${res.lnurl}`);
  if (res.silent_payment) params.push(`sp=${res.silent_payment}`);

  const address = res.onchain_address || '';
  if (!address && params.length === 0) return null;

  const query = params.length > 0 ? `?${params.join('&')}` : '';
  return `bitcoin:${address}${query}`;
}

/**
 * Generate a single DNS TXT record line
 */
export function generateTxtRecord(name: string, domain: string, uri: string): string {
  return `${name}.user._bitcoin-payment.${domain}. 3600 IN TXT "${uri}"`;
}

/**
 * Get TXT record for a single name
 */
export function getNameTxtRecord(name: string): string | null {
  const db = getDb();
  const row = db.prepare(`
    SELECT n.name, n.domain, r.onchain_address, r.lightning, r.lnurl, r.bolt12, r.silent_payment
    FROM names n
    LEFT JOIN resolutions r ON r.name_id = n.id
    WHERE n.name = ? AND n.domain = ? AND n.status = 'active'
  `).get(name, config.domain) as NameWithResolution | undefined;

  if (!row) return null;
  const uri = buildBip21Uri(row);
  if (!uri) return null;

  return generateTxtRecord(row.name, row.domain, uri);
}

/**
 * Generate full zone file content for all registered names
 */
export function generateZoneFile(): string {
  const db = getDb();
  const rows = db.prepare(`
    SELECT n.name, n.domain, r.onchain_address, r.lightning, r.lnurl, r.bolt12, r.silent_payment
    FROM names n
    LEFT JOIN resolutions r ON r.name_id = n.id
    WHERE n.status = 'active' AND n.domain = ?
    ORDER BY n.name
  `).all(config.domain) as NameWithResolution[];

  const lines: string[] = [
    `; BIP-353 DNS zone file for ${config.domain}`,
    `; Generated at ${new Date().toISOString()}`,
    `; ${rows.length} active names`,
    '',
  ];

  for (const row of rows) {
    const uri = buildBip21Uri(row);
    if (uri) {
      lines.push(generateTxtRecord(row.name, row.domain, uri));
    }
  }

  return lines.join('\n') + '\n';
}
