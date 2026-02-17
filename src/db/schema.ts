import Database from 'better-sqlite3';
import { mkdirSync } from 'fs';
import { dirname } from 'path';
import { config } from '../config.js';

let db: Database.Database;

export function getDb(): Database.Database {
  if (!db) {
    mkdirSync(dirname(config.dbPath), { recursive: true });
    db = new Database(config.dbPath);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    initSchema(db);
  }
  return db;
}

function initSchema(db: Database.Database) {
  db.exec(`
    -- Name registrations
    CREATE TABLE IF NOT EXISTS names (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      domain TEXT NOT NULL DEFAULT 'nosecond.best',
      owner_pubkey TEXT NOT NULL,
      registered_at INTEGER NOT NULL,        -- block height
      expires_at INTEGER NOT NULL,           -- block height
      status TEXT NOT NULL DEFAULT 'active', -- active | expired | transferred | reserved
      created_ts INTEGER NOT NULL DEFAULT (unixepoch()),
      updated_ts INTEGER NOT NULL DEFAULT (unixepoch())
    );

    -- Resolution records (cached from Nostr)
    CREATE TABLE IF NOT EXISTS resolutions (
      name_id INTEGER PRIMARY KEY REFERENCES names(id),
      onchain_address TEXT,
      lightning TEXT,
      lnurl TEXT,
      bolt12 TEXT,
      silent_payment TEXT,
      nostr_pubkey TEXT,
      web_url TEXT,
      nostr_event_id TEXT,
      updated_ts INTEGER NOT NULL DEFAULT (unixepoch())
    );

    -- Batch anchors (on-chain commitments)
    CREATE TABLE IF NOT EXISTS batches (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      merkle_root TEXT NOT NULL,
      txid TEXT,                             -- null until broadcast
      block_height INTEGER,                  -- null until confirmed
      status TEXT NOT NULL DEFAULT 'pending', -- pending | broadcast | confirmed
      created_ts INTEGER NOT NULL DEFAULT (unixepoch())
    );

    -- Batch membership (which names are in which batch)
    CREATE TABLE IF NOT EXISTS batch_entries (
      batch_id INTEGER NOT NULL REFERENCES batches(id),
      name_id INTEGER NOT NULL REFERENCES names(id),
      merkle_proof TEXT NOT NULL,            -- JSON array of proof hashes
      leaf_hash TEXT NOT NULL,
      PRIMARY KEY (batch_id, name_id)
    );

    -- Payment tracking
    CREATE TABLE IF NOT EXISTS payments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      amount_sats INTEGER NOT NULL,
      payment_hash TEXT UNIQUE,
      payment_type TEXT NOT NULL DEFAULT 'registration', -- registration | renewal | transfer
      status TEXT NOT NULL DEFAULT 'pending',            -- pending | paid | expired
      owner_pubkey TEXT NOT NULL,
      created_ts INTEGER NOT NULL DEFAULT (unixepoch()),
      expires_ts INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_names_domain ON names(domain);
    CREATE INDEX IF NOT EXISTS idx_names_status ON names(status);
    CREATE INDEX IF NOT EXISTS idx_names_owner ON names(owner_pubkey);
    CREATE INDEX IF NOT EXISTS idx_payments_hash ON payments(payment_hash);
    CREATE INDEX IF NOT EXISTS idx_payments_status ON payments(status);
  `);
}
