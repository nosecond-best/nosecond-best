import { getDb } from './schema.js';
import { config } from '../config.js';

export interface NameRecord {
  id: number;
  name: string;
  domain: string;
  owner_pubkey: string;
  registered_at: number;
  expires_at: number;
  status: string;
  created_ts: number;
  updated_ts: number;
}

export interface ResolutionRecord {
  name_id: number;
  onchain_address: string | null;
  lightning: string | null;
  lnurl: string | null;
  bolt12: string | null;
  silent_payment: string | null;
  nostr_pubkey: string | null;
  web_url: string | null;
  nostr_event_id: string | null;
  updated_ts: number;
}

export function isNameAvailable(name: string, domain = config.domain): boolean {
  const db = getDb();
  const row = db.prepare(
    `SELECT id FROM names WHERE name = ? AND domain = ? AND status IN ('active', 'reserved')`
  ).get(name, domain);
  return !row;
}

export function getNameRecord(name: string, domain = config.domain): NameRecord | undefined {
  const db = getDb();
  return db.prepare(
    `SELECT * FROM names WHERE name = ? AND domain = ? AND status = 'active'`
  ).get(name, domain) as NameRecord | undefined;
}

export function registerName(
  name: string,
  ownerPubkey: string,
  blockHeight: number,
  domain = config.domain,
): NameRecord {
  const db = getDb();
  const expiresAt = blockHeight + config.renewalBlocks;

  const result = db.prepare(`
    INSERT INTO names (name, domain, owner_pubkey, registered_at, expires_at, status)
    VALUES (?, ?, ?, ?, ?, 'active')
  `).run(name, domain, ownerPubkey, blockHeight, expiresAt);

  return {
    id: result.lastInsertRowid as number,
    name,
    domain,
    owner_pubkey: ownerPubkey,
    registered_at: blockHeight,
    expires_at: expiresAt,
    status: 'active',
    created_ts: Math.floor(Date.now() / 1000),
    updated_ts: Math.floor(Date.now() / 1000),
  };
}

export function getResolution(nameId: number): ResolutionRecord | undefined {
  const db = getDb();
  return db.prepare(
    `SELECT * FROM resolutions WHERE name_id = ?`
  ).get(nameId) as ResolutionRecord | undefined;
}

export function upsertResolution(
  nameId: number,
  data: Partial<Omit<ResolutionRecord, 'name_id' | 'updated_ts'>>
): void {
  const db = getDb();
  const fields = Object.keys(data).filter(k => data[k as keyof typeof data] !== undefined);
  const values = fields.map(k => data[k as keyof typeof data]);

  const existing = db.prepare('SELECT name_id FROM resolutions WHERE name_id = ?').get(nameId);

  if (existing) {
    const setClause = fields.map(f => `${f} = ?`).join(', ');
    db.prepare(
      `UPDATE resolutions SET ${setClause}, updated_ts = unixepoch() WHERE name_id = ?`
    ).run(...values, nameId);
  } else {
    const cols = ['name_id', ...fields].join(', ');
    const placeholders = ['?', ...fields.map(() => '?')].join(', ');
    db.prepare(
      `INSERT INTO resolutions (${cols}) VALUES (${placeholders})`
    ).run(nameId, ...values);
  }
}

export function listNames(
  opts: { limit?: number; offset?: number; domain?: string } = {}
): NameRecord[] {
  const db = getDb();
  const { limit = 50, offset = 0, domain = config.domain } = opts;
  return db.prepare(
    `SELECT * FROM names WHERE domain = ? AND status = 'active' ORDER BY created_ts DESC LIMIT ? OFFSET ?`
  ).all(domain, limit, offset) as NameRecord[];
}
