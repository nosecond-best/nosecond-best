export const config = {
  port: parseInt(process.env.PORT || '3000'),
  host: process.env.HOST || '0.0.0.0',
  domain: process.env.NSB_DOMAIN || 'nosecond.best',
  dbPath: process.env.NSB_DB_PATH || './data/nsb.db',

  // Name rules
  nameMinLength: 1,
  nameMaxLength: 64,
  namePattern: /^[a-z0-9][a-z0-9_-]*[a-z0-9]$|^[a-z0-9]$/,

  // Pricing (in sats)
  pricing: {
    ultraPremium: 1_000_000,  // 1-3 chars
    premium: 100_000,         // common words / 4-5 chars
    standard: 10_000,         // 6-9 chars
    long: 1_000,              // 10+ chars
  },

  // Registration
  batchIntervalBlocks: 6,     // ~1 hour between anchors
  renewalBlocks: 52_560,      // ~1 year
  gracePeriodBlocks: 4_320,   // ~30 days

  // Nostr
  nostrRelays: [
    'wss://relay.damus.io',
    'wss://relay.nostr.band',
    'wss://nos.lol',
    'wss://relay.snort.social',
  ],
  nostrEventKind: 38383,
} as const;

export function getPrice(name: string): number {
  const len = name.length;
  if (len <= 3) return config.pricing.ultraPremium;
  if (len <= 5) return config.pricing.premium;
  if (len <= 9) return config.pricing.standard;
  return config.pricing.long;
}
