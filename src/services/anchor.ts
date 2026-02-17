/**
 * Batch anchoring system — collects unanchored registrations, builds merkle tree, stores batch
 */
import { getDb } from '../db/schema.js';
import { buildMerkleTree, hashLeaf } from '../utils/merkle.js';

export interface BatchRecord {
  id: number;
  merkle_root: string;
  txid: string | null;
  block_height: number | null;
  status: string;
  created_ts: number;
}

export interface BatchEntry {
  batch_id: number;
  name_id: number;
  merkle_proof: string;
  leaf_hash: string;
}

/**
 * Get all name IDs that haven't been included in any batch yet
 */
export function getUnanchoredNames(): { id: number; name: string; domain: string; owner_pubkey: string }[] {
  const db = getDb();
  return db.prepare(`
    SELECT n.id, n.name, n.domain, n.owner_pubkey
    FROM names n
    WHERE n.status = 'active'
      AND n.id NOT IN (SELECT name_id FROM batch_entries)
    ORDER BY n.id
  `).all() as any[];
}

/**
 * Create a new batch from all unanchored registrations
 */
export function createBatch(): BatchRecord | null {
  const db = getDb();
  const unanchored = getUnanchoredNames();

  if (unanchored.length === 0) {
    console.log('[anchor] No unanchored names to batch');
    return null;
  }

  // Build leaf data: "name@domain:owner_pubkey"
  const leaves = unanchored.map(n => `${n.name}@${n.domain}:${n.owner_pubkey}`);
  const leafHashes = leaves.map(l => hashLeaf(l));

  const { root, proofs } = buildMerkleTree(leafHashes);

  // Insert batch
  const result = db.prepare(`
    INSERT INTO batches (merkle_root, status) VALUES (?, 'pending')
  `).run(root);

  const batchId = result.lastInsertRowid as number;

  // Insert batch entries with proofs
  const insertEntry = db.prepare(`
    INSERT INTO batch_entries (batch_id, name_id, merkle_proof, leaf_hash)
    VALUES (?, ?, ?, ?)
  `);

  const insertAll = db.transaction(() => {
    for (let i = 0; i < unanchored.length; i++) {
      const proof = proofs.get(leafHashes[i]) || [];
      insertEntry.run(batchId, unanchored[i].id, JSON.stringify(proof), leafHashes[i]);
    }
  });
  insertAll();

  console.log(`[anchor] Created batch #${batchId} with ${unanchored.length} names, root: ${root}`);

  return getBatch(batchId)!;
}

/**
 * Build an OP_RETURN transaction hex embedding the merkle root
 * This is a placeholder — real implementation needs Bitcoin RPC
 */
export function buildAnchorTx(batch: BatchRecord): string {
  // OP_RETURN prefix: 6a (OP_RETURN) + 24 (36 bytes push)
  // Protocol tag "NSB:" (4 bytes) + merkle root (32 bytes hex = 64 chars but we store 32 bytes)
  const protocolTag = Buffer.from('NSB:').toString('hex'); // 4e53423a
  const merkleRootHex = batch.merkle_root;

  // Simulated raw tx hex (not a real valid tx, just structure)
  const mockTxHex = [
    '02000000',                         // version
    '01',                               // input count
    '0'.repeat(64),                     // prev txid (placeholder)
    '00000000',                         // prev vout
    '00',                               // scriptSig length
    'ffffffff',                         // sequence
    '02',                               // output count
    // Output 0: OP_RETURN
    '0000000000000000',                 // value: 0
    '26',                               // script length: 38 bytes
    '6a',                               // OP_RETURN
    '24',                               // push 36 bytes
    protocolTag,                        // NSB:
    merkleRootHex,                      // merkle root
    // Output 1: change (placeholder)
    'e803000000000000',                 // 1000 sats
    '160014' + '0'.repeat(40),          // P2WPKH placeholder
    '00000000',                         // locktime
  ].join('');

  console.log(`[anchor] Built anchor tx for batch #${batch.id}`);
  console.log(`[anchor] OP_RETURN data: NSB:${merkleRootHex}`);
  console.log(`[anchor] Would broadcast tx: ${mockTxHex.substring(0, 80)}...`);

  return mockTxHex;
}

/**
 * Mock Bitcoin RPC — logs what it would do
 */
export async function broadcastTransaction(txHex: string): Promise<string | null> {
  console.log(`[anchor] MOCK: Would broadcast transaction (${txHex.length / 2} bytes)`);
  console.log(`[anchor] MOCK: In production, this calls Bitcoin Core RPC sendrawtransaction`);
  // Return a fake txid
  return null;
}

// Query helpers

export function getBatch(id: number): BatchRecord | undefined {
  const db = getDb();
  return db.prepare('SELECT * FROM batches WHERE id = ?').get(id) as BatchRecord | undefined;
}

export function listBatches(limit = 50, offset = 0): BatchRecord[] {
  const db = getDb();
  return db.prepare('SELECT * FROM batches ORDER BY created_ts DESC LIMIT ? OFFSET ?').all(limit, offset) as BatchRecord[];
}

export function getBatchEntries(batchId: number): (BatchEntry & { name: string; domain: string })[] {
  const db = getDb();
  return db.prepare(`
    SELECT be.*, n.name, n.domain
    FROM batch_entries be
    JOIN names n ON n.id = be.name_id
    WHERE be.batch_id = ?
  `).all(batchId) as any[];
}
