import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { serve } from '@hono/node-server';
import { config } from './config.js';
import { getDb } from './db/schema.js';
import { resolveRouter } from './routes/resolve.js';
import { registerRouter } from './routes/register.js';

const app = new Hono();

// Middleware
app.use('*', cors());
app.use('*', logger());

// Health check
app.get('/', (c) => c.json({
  name: 'NoSecond.Best',
  version: '0.1.0',
  protocol: 'NSB',
  domain: config.domain,
  description: 'Decentralized Bitcoin naming protocol',
  endpoints: {
    check: '/api/v1/check/:name',
    register: '/api/v1/register',
    resolve: '/api/v1/resolve/:name',
    bip353: '/api/v1/bip353/:name',
    lnurl: '/.well-known/lnurlp/:name',
  },
}));

app.get('/health', (c) => c.json({ status: 'ok' }));

// Routes
app.route('/', resolveRouter);
app.route('/', registerRouter);

// Initialize DB and start server
getDb();

serve({
  fetch: app.fetch,
  hostname: config.host,
  port: config.port,
}, (info) => {
  console.log(`
  ₿ NoSecond.Best Gateway v0.1.0
  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  → http://${info.address}:${info.port}
  → Domain: ${config.domain}
  → Database: ${config.dbPath}
  `);
});

export default app;
