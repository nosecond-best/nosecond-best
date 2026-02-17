import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { serve } from '@hono/node-server';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { config } from './config.js';
import { getDb } from './db/schema.js';
import { resolveRouter } from './routes/resolve.js';
import { registerRouter } from './routes/register.js';
import { adminRouter } from './routes/admin.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
let frontendHtml: string;
try {
  frontendHtml = readFileSync(join(__dirname, 'frontend', 'index.html'), 'utf-8');
} catch {
  frontendHtml = '<html><body>Frontend not found</body></html>';
}

const app = new Hono();

// Middleware
app.use('*', cors());
app.use('*', logger());

const apiInfo = {
  name: 'NoSecond.Best',
  version: '0.1.0',
  protocol: 'NSB',
  domain: config.domain,
  description: 'Decentralized Bitcoin naming protocol',
  endpoints: {
    check: '/api/v1/check/:name',
    register: '/api/v1/register',
    confirm: '/api/v1/register/confirm',
    resolve: '/api/v1/resolve/:name',
    bip353: '/api/v1/bip353/:name',
    lnurl: '/.well-known/lnurlp/:name',
    batches: '/api/v1/batches',
    dns_zonefile: '/api/v1/dns/zonefile',
  },
};

// Root: serve HTML for browsers, JSON for API clients
app.get('/', (c) => {
  const accept = c.req.header('Accept') || '';
  if (accept.includes('text/html')) {
    return c.html(frontendHtml);
  }
  return c.json(apiInfo);
});

app.get('/health', (c) => c.json({ status: 'ok' }));

// Routes
app.route('/', resolveRouter);
app.route('/', registerRouter);
app.route('/', adminRouter);

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
