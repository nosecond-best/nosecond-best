/**
 * Lightning payment integration
 */
import { randomBytes } from 'crypto';
import { getDb } from '../db/schema.js';

export interface LightningInvoice {
  payment_hash: string;
  payment_request: string;
  amount_sats: number;
  expires_at: number;
}

export interface PaymentStatus {
  paid: boolean;
  payment_hash: string;
}

/**
 * Lightning provider interface
 */
export interface LightningProvider {
  createInvoice(amountSats: number, memo: string): Promise<LightningInvoice>;
  checkPayment(paymentHash: string): Promise<PaymentStatus>;
}

/**
 * Mock implementation — auto-approves everything (for testing)
 */
export class MockLightningProvider implements LightningProvider {
  async createInvoice(amountSats: number, memo: string): Promise<LightningInvoice> {
    const paymentHash = randomBytes(32).toString('hex');
    return {
      payment_hash: paymentHash,
      payment_request: `lnbc${amountSats}n1mock_${paymentHash.substring(0, 16)}`,
      amount_sats: amountSats,
      expires_at: Math.floor(Date.now() / 1000) + 3600,
    };
  }

  async checkPayment(paymentHash: string): Promise<PaymentStatus> {
    // Mock: always paid
    return { paid: true, payment_hash: paymentHash };
  }
}

/**
 * LND REST implementation stub
 */
export class LndProvider implements LightningProvider {
  private baseUrl: string;
  private macaroon: string;

  constructor() {
    this.baseUrl = process.env.LND_REST_URL || 'https://localhost:8080';
    this.macaroon = process.env.LND_MACAROON || '';
    if (!this.macaroon) {
      console.warn('[lightning] LND_MACAROON not set — LND provider will not work');
    }
  }

  private async request(path: string, opts: RequestInit = {}): Promise<any> {
    // Use Node https module directly — Umbrel uses self-signed TLS certs
    const https = await import('node:https');
    const url = new URL(`${this.baseUrl}${path}`);
    const body = opts.body as string | undefined;

    return new Promise((resolve, reject) => {
      const req = https.request({
        hostname: url.hostname,
        port: url.port,
        path: url.pathname + url.search,
        method: opts.method || 'GET',
        headers: {
          'Grpc-Metadata-macaroon': this.macaroon,
          'Content-Type': 'application/json',
        },
        rejectAuthorized: false,
        // ⚠️ TEST ONLY — pin cert in production
      } as any, (res) => {
        let data = '';
        res.on('data', (chunk: Buffer) => data += chunk);
        res.on('end', () => {
          try {
            resolve(JSON.parse(data));
          } catch {
            reject(new Error(`LND API error ${res.statusCode}: ${data}`));
          }
        });
      });
      req.on('error', reject);
      if (body) req.write(body);
      req.end();
    });
  }

  async createInvoice(amountSats: number, memo: string): Promise<LightningInvoice> {
    const data = await this.request('/v1/invoices', {
      method: 'POST',
      body: JSON.stringify({ value: amountSats.toString(), memo }),
    });

    return {
      payment_hash: Buffer.from(data.r_hash, 'base64').toString('hex'),
      payment_request: data.payment_request,
      amount_sats: amountSats,
      expires_at: Math.floor(Date.now() / 1000) + 3600,
    };
  }

  async checkPayment(paymentHash: string): Promise<PaymentStatus> {
    const hashBase64 = Buffer.from(paymentHash, 'hex').toString('base64url');
    const data = await this.request(`/v1/invoice/${hashBase64}`);

    return {
      paid: data.state === 'SETTLED',
      payment_hash: paymentHash,
    };
  }
}

/**
 * Get the active lightning provider
 */
export function getLightningProvider(): LightningProvider {
  if (process.env.LND_REST_URL && process.env.LND_MACAROON) {
    return new LndProvider();
  }
  console.log('[lightning] Using mock provider (set LND_REST_URL + LND_MACAROON for real payments)');
  return new MockLightningProvider();
}

/**
 * Create a pending payment record in DB
 */
export function createPendingPayment(
  name: string,
  amountSats: number,
  paymentHash: string,
  ownerPubkey: string,
): void {
  const db = getDb();
  db.prepare(`
    INSERT INTO payments (name, amount_sats, payment_hash, owner_pubkey, status, expires_ts)
    VALUES (?, ?, ?, ?, 'pending', unixepoch() + 3600)
  `).run(name, amountSats, paymentHash, ownerPubkey);
}

/**
 * Get a pending payment by hash
 */
export function getPendingPayment(paymentHash: string) {
  const db = getDb();
  return db.prepare(
    `SELECT * FROM payments WHERE payment_hash = ? AND status = 'pending' AND expires_ts > unixepoch()`
  ).get(paymentHash) as any;
}

/**
 * Mark a payment as paid
 */
export function markPaymentPaid(paymentHash: string): void {
  const db = getDb();
  db.prepare(`UPDATE payments SET status = 'paid' WHERE payment_hash = ?`).run(paymentHash);
}
