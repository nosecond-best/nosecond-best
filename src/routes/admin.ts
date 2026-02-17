import { Hono } from 'hono';
import { listBatches, getBatch, getBatchEntries, createBatch, buildAnchorTx } from '../services/anchor.js';
import { generateZoneFile, getNameTxtRecord } from '../services/dns.js';

export const adminRouter = new Hono();

// Batch endpoints
adminRouter.get('/api/v1/batches', (c) => {
  const limit = parseInt(c.req.query('limit') || '50');
  const offset = parseInt(c.req.query('offset') || '0');
  const batches = listBatches(limit, offset);
  return c.json({ batches });
});

adminRouter.get('/api/v1/batches/:id', (c) => {
  const id = parseInt(c.req.param('id'));
  const batch = getBatch(id);
  if (!batch) return c.json({ error: 'Batch not found' }, 404);

  const entries = getBatchEntries(id);
  return c.json({
    ...batch,
    entries: entries.map(e => ({
      name: e.name,
      domain: e.domain,
      leaf_hash: e.leaf_hash,
      merkle_proof: JSON.parse(e.merkle_proof),
    })),
  });
});

adminRouter.post('/api/v1/batches', (c) => {
  const batch = createBatch();
  if (!batch) return c.json({ error: 'No unanchored names to batch' }, 400);

  const txHex = buildAnchorTx(batch);
  return c.json({ batch, anchor_tx_hex: txHex }, 201);
});

// DNS endpoints
adminRouter.get('/api/v1/dns/zonefile', (c) => {
  const zonefile = generateZoneFile();
  return c.text(zonefile, 200, { 'Content-Type': 'text/plain' });
});

adminRouter.get('/api/v1/dns/txt/:name', (c) => {
  const { name } = c.req.param();
  const record = getNameTxtRecord(name.toLowerCase().trim());
  if (!record) return c.json({ error: 'No DNS record for this name' }, 404);
  return c.text(record, 200, { 'Content-Type': 'text/plain' });
});
